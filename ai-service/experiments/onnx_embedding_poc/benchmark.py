from __future__ import annotations

import json
import os
import platform
import statistics
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

import cpuinfo
import numpy as np
import onnxruntime as ort
import psutil
from tokenizers import Tokenizer


MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
MODEL_PATH = "onnx/model_quint8_avx2.onnx"
MAX_TOKENS = 256
DIMENSIONS = 384
BATCH_SIZE = 8
LATENCY_RUNS = 7
BASE_URL = f"https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}"
DEFAULT_CACHE = Path.home() / ".cache" / "careerpilot-ai" / "minilm-onnx-poc"


class PeakRssSampler:
    def __init__(self) -> None:
        self.process = psutil.Process()
        self.peak_bytes = self.process.memory_info().rss
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._sample, daemon=True)

    def _sample(self) -> None:
        while not self._stop.wait(0.005):
            self.peak_bytes = max(self.peak_bytes, self.process.memory_info().rss)

    def __enter__(self) -> PeakRssSampler:
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._stop.set()
        self._thread.join()
        self.peak_bytes = max(self.peak_bytes, self.process.memory_info().rss)


def _download(url: str, destination: Path) -> tuple[int, bool]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        return destination.stat().st_size, False

    temporary_path = destination.with_suffix(destination.suffix + ".part")
    try:
        urllib.request.urlretrieve(url, temporary_path)
        temporary_path.replace(destination)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    return destination.stat().st_size, True


def normalize_embeddings(values: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    if not np.isfinite(values).all() or np.any(norms == 0):
        raise ValueError("Embedding output contains non-finite values or a zero vector")
    normalized = values / norms
    if not np.isfinite(normalized).all():
        raise ValueError("Normalized embedding output contains non-finite values")
    return normalized.astype(np.float32, copy=False)


class LocalMiniLM:
    def __init__(self, model_path: Path, tokenizer_path: Path) -> None:
        cpu_flags = set(cpuinfo.get_cpu_info().get("flags", []))
        if "avx2" not in cpu_flags:
            raise RuntimeError("The selected quantized ONNX artifact requires AVX2")

        self.tokenizer = Tokenizer.from_file(str(tokenizer_path))
        pad_id = self.tokenizer.token_to_id("[PAD]")
        if pad_id is None:
            raise ValueError("Tokenizer does not define [PAD]")
        self.tokenizer.enable_truncation(max_length=MAX_TOKENS)
        self.tokenizer.enable_padding(pad_id=pad_id, pad_token="[PAD]")

        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(
            str(model_path),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.input_names = {item.name for item in self.session.get_inputs()}

    def raw_token_count(self, text: str) -> int:
        self.tokenizer.no_truncation()
        count = len(self.tokenizer.encode(text).ids)
        self.tokenizer.enable_truncation(max_length=MAX_TOKENS)
        return count

    def embed(self, texts: list[str]) -> np.ndarray:
        encoded = self.tokenizer.encode_batch(texts)
        inputs: dict[str, np.ndarray] = {}
        token_ids = np.asarray([item.ids for item in encoded], dtype=np.int64)
        attention_mask = np.asarray(
            [item.attention_mask for item in encoded], dtype=np.int64
        )
        token_type_ids = np.asarray([item.type_ids for item in encoded], dtype=np.int64)
        candidate_inputs = {
            "input_ids": token_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
        }
        inputs.update(
            (name, value)
            for name, value in candidate_inputs.items()
            if name in self.input_names
        )

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
                    and output.shape[1] == DIMENSIONS
                ),
                None,
            )
            if sentence_output is None:
                raise ValueError("ONNX model did not return token or sentence embeddings")
            return normalize_embeddings(sentence_output)

        mask = attention_mask[:, :, np.newaxis].astype(np.float32)
        pooled = (sequence_output.astype(np.float32) * mask).sum(axis=1)
        pooled /= np.maximum(mask.sum(axis=1), 1.0)
        if pooled.shape[1] != DIMENSIONS:
            raise ValueError(f"Expected {DIMENSIONS} dimensions, got {pooled.shape[1]}")
        return normalize_embeddings(pooled)


def _latency_ms(model: LocalMiniLM, texts: list[str]) -> dict[str, float]:
    samples: list[float] = []
    for _ in range(LATENCY_RUNS):
        started = time.perf_counter()
        model.embed(texts)
        samples.append((time.perf_counter() - started) * 1000)
    return {
        "runs": LATENCY_RUNS,
        "median_ms": round(statistics.median(samples), 3),
        "min_ms": round(min(samples), 3),
        "max_ms": round(max(samples), 3),
    }


def run_benchmark(cache_dir: Path | None = None) -> dict[str, Any]:
    cache = cache_dir or Path(os.environ.get("MINILM_ONNX_CACHE", DEFAULT_CACHE))
    model_path = cache / "model_quint8_avx2.onnx"
    tokenizer_path = cache / "tokenizer.json"
    model_url = f"{BASE_URL}/{MODEL_PATH}"
    tokenizer_url = f"{BASE_URL}/tokenizer.json"
    model_bytes, model_downloaded = _download(model_url, model_path)
    tokenizer_bytes, tokenizer_downloaded = _download(tokenizer_url, tokenizer_path)

    short_text = "Built a Python API for data analysis."
    medium_text = (
        "Designed and shipped a secure service with automated tests, clear "
        "documentation, and measurable improvements to request latency. "
    ) * 5
    long_text = (
        "Career experience includes building reliable software, collaborating "
        "across teams, reviewing code, and improving system performance. "
    ) * 80
    test_texts = [short_text, medium_text, long_text]

    before_load_rss = psutil.Process().memory_info().rss
    with PeakRssSampler() as sampler:
        load_started = time.perf_counter()
        model = LocalMiniLM(model_path, tokenizer_path)
        model_load_ms = (time.perf_counter() - load_started) * 1000

        raw_token_counts = [model.raw_token_count(text) for text in test_texts]
        truncated_token_counts = [
            len(model.tokenizer.encode(text).ids) for text in test_texts
        ]
        embeddings = model.embed(test_texts)
        single_text_latency = _latency_ms(model, [medium_text])
        small_batch_latency = _latency_ms(
            model, [short_text, medium_text] * (BATCH_SIZE // 2)
        )
        peak_rss = sampler.peak_bytes

    norms = np.linalg.norm(embeddings, axis=1)
    cpu_info = cpuinfo.get_cpu_info()
    report: dict[str, Any] = {
        "model_id": MODEL_ID,
        "revision": MODEL_REVISION,
        "artifact": MODEL_PATH,
        "host": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "cpu_flags": sorted(cpu_info.get("flags", [])),
            "required_cpu_feature": "avx2",
            "avx512_available": any(
                flag.startswith("avx512") for flag in cpu_info.get("flags", [])
            ),
            "onnxruntime_version": ort.__version__,
            "execution_providers": model.session.get_providers(),
        },
        "download": {
            "model_bytes": model_bytes,
            "tokenizer_bytes": tokenizer_bytes,
            "total_bytes": model_bytes + tokenizer_bytes,
            "model_mib": round(model_bytes / (1024 * 1024), 3),
            "total_mib": round((model_bytes + tokenizer_bytes) / (1024 * 1024), 3),
            "cache_hit": not model_downloaded and not tokenizer_downloaded,
        },
        "load": {
            "cold_model_loading_ms": round(model_load_ms, 3),
            "rss_before_loading_mib": round(before_load_rss / (1024 * 1024), 3),
            "peak_rss_mib": round(peak_rss / (1024 * 1024), 3),
            "rss_increase_mib": round((peak_rss - before_load_rss) / (1024 * 1024), 3),
        },
        "inputs": {
            "raw_token_counts_including_special_tokens": raw_token_counts,
            "actual_token_counts_after_truncation": truncated_token_counts,
            "truncation_limit": MAX_TOKENS,
            "embedding_shape": list(embeddings.shape),
            "embedding_norms": [round(float(norm), 6) for norm in norms],
            "all_values_finite": bool(np.isfinite(embeddings).all()),
            "single_text_latency": single_text_latency,
            "small_batch_size": BATCH_SIZE,
            "small_batch_latency": small_batch_latency,
        },
    }
    if embeddings.shape != (len(test_texts), DIMENSIONS):
        raise AssertionError(f"Unexpected embedding shape: {embeddings.shape}")
    if not np.allclose(norms, 1.0, atol=1e-4):
        raise AssertionError(f"Embeddings are not normalized: {norms}")
    if not np.isfinite(embeddings).all():
        raise AssertionError("Embedding output contains non-finite values")
    if truncated_token_counts[-1] != MAX_TOKENS:
        raise AssertionError("Long input did not reach the configured truncation limit")
    if "CPUExecutionProvider" not in model.session.get_providers():
        raise AssertionError("Inference did not run with the ONNX CPU provider")
    return report


if __name__ == "__main__":
    print(json.dumps(run_benchmark(), indent=2))
