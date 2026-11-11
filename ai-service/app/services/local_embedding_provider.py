from __future__ import annotations

import asyncio
import threading
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from app.core.config import EMBEDDING_DIMENSIONS, Settings
from app.core.errors import ProviderError
from app.services.embedding_utils import validate_embedding

if TYPE_CHECKING:
    from tokenizers import Tokenizer


MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
MODEL_ARTIFACT = "onnx/model_quint8_avx2.onnx"
MAX_MODEL_TOKENS = 256
MAX_CHUNK_TOKENS = 224
INFERENCE_BATCH_SIZE = 8
MODEL_BASE_URL = (
    f"https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}"
)

_MODEL_LOCK = threading.Lock()
_MODEL_CACHE: dict[Path, "LocalMiniLM"] = {}


def _load_chunk_tokenizer(tokenizer_path: Path) -> Tokenizer:
    from tokenizers import Tokenizer

    tokenizer = Tokenizer.from_file(str(tokenizer_path))
    tokenizer.no_truncation()
    return tokenizer


def _download_artifact(url: str, destination: Path) -> None:
    if destination.is_file() and destination.stat().st_size:
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = destination.with_suffix(destination.suffix + ".part")
    try:
        with urlopen(url, timeout=60) as response, temporary_path.open("wb") as target:
            while block := response.read(1024 * 1024):
                target.write(block)
        if temporary_path.stat().st_size == 0:
            raise OSError("Downloaded model artifact is empty")
        temporary_path.replace(destination)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        temporary_path.unlink(missing_ok=True)
        raise ProviderError("Pinned local embedding model download failed") from exc


class LocalMiniLM:
    def __init__(self, cache_dir: Path) -> None:
        import cpuinfo
        import onnxruntime as ort
        from tokenizers import Tokenizer

        model_path = cache_dir / Path(MODEL_ARTIFACT)
        tokenizer_path = cache_dir / "tokenizer.json"
        _download_artifact(f"{MODEL_BASE_URL}/{MODEL_ARTIFACT}", model_path)
        _download_artifact(f"{MODEL_BASE_URL}/tokenizer.json", tokenizer_path)

        cpu_flags = set(cpuinfo.get_cpu_info().get("flags", []))
        if "avx2" not in cpu_flags:
            raise ProviderError("The selected quantized ONNX model requires AVX2")

        self.tokenizer = Tokenizer.from_file(str(tokenizer_path))
        pad_id = self.tokenizer.token_to_id("[PAD]")
        if pad_id is None:
            raise ProviderError("Pinned tokenizer does not define [PAD]")
        self.tokenizer.enable_truncation(max_length=MAX_MODEL_TOKENS)
        self.tokenizer.enable_padding(pad_id=pad_id, pad_token="[PAD]")
        self.chunk_tokenizer = _load_chunk_tokenizer(tokenizer_path)

        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(
            str(model_path),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.input_names = {item.name for item in self.session.get_inputs()}

    def embed(self, texts: list[str]) -> list[list[float]]:
        import numpy as np

        encoded = self.tokenizer.encode_batch(texts)
        token_ids = np.asarray([item.ids for item in encoded], dtype=np.int64)
        attention_mask = np.asarray(
            [item.attention_mask for item in encoded], dtype=np.int64
        )
        token_type_ids = np.asarray([item.type_ids for item in encoded], dtype=np.int64)
        candidates = {
            "input_ids": token_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
        }
        inputs = {
            name: value
            for name, value in candidates.items()
            if name in self.input_names
        }
        outputs = self.session.run(None, inputs)
        sequence_output = next(
            (
                output
                for output in outputs
                if isinstance(output, np.ndarray) and output.ndim == 3
            ),
            None,
        )
        if sequence_output is None:
            sentence_output = next(
                (
                    output
                    for output in outputs
                    if isinstance(output, np.ndarray)
                    and output.ndim == 2
                    and output.shape[1] == EMBEDDING_DIMENSIONS
                ),
                None,
            )
            if sentence_output is None:
                raise ProviderError("ONNX model returned an unsupported output shape")
            return self._normalized_vectors(sentence_output)

        mask = attention_mask[:, :, np.newaxis].astype(np.float32)
        pooled = (sequence_output.astype(np.float32) * mask).sum(axis=1)
        pooled /= np.maximum(mask.sum(axis=1), 1.0)
        return self._normalized_vectors(pooled)

    @staticmethod
    def _normalized_vectors(values) -> list[list[float]]:
        import numpy as np

        if values.ndim != 2 or values.shape[1] != EMBEDDING_DIMENSIONS:
            raise ProviderError(
                f"ONNX model must return {EMBEDDING_DIMENSIONS}-dimensional vectors"
            )
        norms = np.linalg.norm(values, axis=1, keepdims=True)
        if not np.isfinite(values).all() or np.any(norms == 0):
            raise ProviderError("ONNX embedding output is invalid")
        normalized = values / norms
        if not np.isfinite(normalized).all():
            raise ProviderError("Normalized ONNX embedding output is invalid")
        return normalized.astype(np.float32, copy=False).tolist()


def get_local_model(cache_dir: Path) -> LocalMiniLM:
    resolved_dir = cache_dir.expanduser().resolve()
    with _MODEL_LOCK:
        cached = _MODEL_CACHE.get(resolved_dir)
        if cached is not None:
            return cached
        try:
            model = LocalMiniLM(resolved_dir)
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError("Local embedding model could not be loaded") from exc
        _MODEL_CACHE[resolved_dir] = model
        return model


class LocalEmbeddingProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def get_tokenizer(self):
        self.settings.require_embedding_configuration()
        model = await asyncio.to_thread(
            get_local_model, self.settings.local_embedding_cache_dir
        )
        return model.chunk_tokenizer

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        self.settings.require_embedding_configuration()
        if not isinstance(texts, list) or any(
            not isinstance(text, str) or not text.strip() for text in texts
        ):
            raise ProviderError("Embedding input must contain non-empty text strings")
        if not texts:
            return []
        return await asyncio.to_thread(self._embed_sync, texts)

    def _embed_sync(self, texts: list[str]) -> list[list[float]]:
        model = get_local_model(self.settings.local_embedding_cache_dir)
        embeddings: list[list[float]] = []
        for start in range(0, len(texts), INFERENCE_BATCH_SIZE):
            batch = texts[start : start + INFERENCE_BATCH_SIZE]
            try:
                vectors = model.embed(batch)
            except ProviderError:
                raise
            except Exception as exc:
                raise ProviderError("Local ONNX embedding inference failed") from exc
            if len(vectors) != len(batch):
                raise ProviderError("ONNX model returned an incomplete embedding batch")
            embeddings.extend(
                validate_embedding(vector, EMBEDDING_DIMENSIONS) for vector in vectors
            )
        return embeddings
