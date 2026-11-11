import re
import unicodedata
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.core.errors import ChunkLimitError
from app.models.knowledge import KnowledgeDocument, SourceType
from app.services.local_embedding_provider import MAX_CHUNK_TOKENS


CHUNK_SIZE_CHARS = 1_200
CHUNK_OVERLAP_CHARS = 120
CHUNK_OVERLAP_TOKENS = 16
MAX_CHUNKS_PER_SNAPSHOT = 4_096
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SENTENCE_BOUNDARY = re.compile(r"[.!?](?:[\"')\]]*)\s+")


@dataclass(frozen=True)
class DocumentChunk:
    source_type: SourceType
    source_id: UUID
    title: str
    content: str
    chunk_index: int


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = _CONTROL_CHARS.sub("", value)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in value.split("\n")]
    return "\n".join(line for line in lines if line).strip()


def chunk_text(
    value: str,
    *,
    chunk_size: int = CHUNK_SIZE_CHARS,
    overlap: int = CHUNK_OVERLAP_CHARS,
    tokenizer: Any | None = None,
    max_tokens: int = MAX_CHUNK_TOKENS,
    overlap_tokens: int = CHUNK_OVERLAP_TOKENS,
) -> list[str]:
    text = normalize_text(value)
    if not text:
        return []
    if tokenizer is not None:
        return _chunk_tokenized_text(
            text,
            tokenizer,
            max_tokens=max_tokens,
            overlap_tokens=overlap_tokens,
        )
    if chunk_size < 1 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("chunk size and overlap are inconsistent")

    chunks: list[str] = []
    start = 0
    while start < len(text):
        hard_end = min(start + chunk_size, len(text))
        end = hard_end
        if hard_end < len(text):
            floor = start + max(1, chunk_size * 3 // 5)
            sentence_ends = [
                match.end()
                for match in _SENTENCE_BOUNDARY.finditer(text, start, hard_end)
                if match.end() > floor
            ]
            if sentence_ends:
                end = sentence_ends[-1]
            else:
                whitespace = max(
                    text.rfind(" ", floor, hard_end),
                    text.rfind("\n", floor, hard_end),
                )
                if whitespace > start:
                    end = whitespace

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(start + 1, end - overlap)

    return chunks


def _chunk_tokenized_text(
    text: str,
    tokenizer: Any,
    *,
    max_tokens: int,
    overlap_tokens: int,
) -> list[str]:
    offsets = [
        (start, end)
        for start, end in tokenizer.encode(text).offsets
        if end > start
    ]
    special_token_count = len(tokenizer.encode("").ids)
    capacity = max_tokens - special_token_count
    if capacity < 1 or overlap_tokens < 0 or overlap_tokens >= capacity:
        raise ValueError("token chunk size and overlap are inconsistent")
    if not offsets:
        return []

    chunks: list[str] = []
    start_index = 0
    while start_index < len(offsets):
        end_index = min(start_index + capacity, len(offsets))
        if end_index < len(offsets):
            floor_index = start_index + max(1, capacity * 3 // 5)
            start_char = offsets[start_index][0]
            hard_end_char = offsets[end_index - 1][1]
            sentence_ends = [
                match.end()
                for match in _SENTENCE_BOUNDARY.finditer(
                    text, start_char, hard_end_char
                )
            ]
            for sentence_end in sentence_ends:
                token_end = sum(end <= sentence_end for _, end in offsets)
                if floor_index <= token_end <= end_index:
                    end_index = token_end

        while end_index > start_index:
            chunk = text[offsets[start_index][0] : offsets[end_index - 1][1]].strip()
            if len(tokenizer.encode(chunk).ids) <= max_tokens:
                break
            end_index -= 1
        if end_index <= start_index or not chunk:
            raise ValueError("Tokenizer could not produce a bounded text chunk")
        chunks.append(chunk)
        if end_index == len(offsets):
            break
        start_index = max(start_index + 1, end_index - overlap_tokens)

    return chunks


def chunk_documents(
    documents: list[KnowledgeDocument],
    *,
    max_chunks: int = MAX_CHUNKS_PER_SNAPSHOT,
    tokenizer: Any | None = None,
) -> list[DocumentChunk]:
    result: list[DocumentChunk] = []
    for document in documents:
        title = normalize_text(document.title)
        for index, content in enumerate(
            chunk_text(document.content, tokenizer=tokenizer)
        ):
            result.append(
                DocumentChunk(
                    source_type=document.source_type,
                    source_id=document.source_id,
                    title=title,
                    content=content,
                    chunk_index=index,
                )
            )
            if len(result) > max_chunks:
                raise ChunkLimitError()
    return result
