import re
from typing import Any
from uuid import UUID

from pydantic import ValidationError

from app.core.config import EMBEDDING_DIMENSIONS, Settings
from app.core.errors import ProviderError
from app.models.knowledge import (
    CopilotRequest,
    CopilotResponse,
    CopilotSource,
    KnowledgeCountResponse,
    KnowledgeDeleteResponse,
    KnowledgeIngestRequest,
    SourceType,
)
from app.services.chunking import chunk_documents
from app.services.copilot_provider import CopilotProvider
from app.services.embedding_utils import validate_embedding
from app.services.groq_provider import CopilotModelAnswer
from app.services.prompting import MAX_CONTEXT_TOKEN_BUDGET, build_prompt_context
from app.services.storage import PostgresStorage, content_hash


RETRIEVAL_TOP_K = 8
RETRIEVAL_SIMILARITY_THRESHOLD = 0.35
MAX_ADJACENT_CHUNKS = 3
_BROAD_RESUME_SUMMARY = re.compile(
    r"\b(?:summar(?:y|ies|i[sz](?:e|ation)?)|overview|recap)\b",
    re.IGNORECASE,
)
_RESUME_REFERENCE = re.compile(r"\b(?:resume|résumé|cv)\b", re.IGNORECASE)
_PROJECT_REFERENCE = re.compile(r"\bprojects?\b", re.IGNORECASE)
_PROJECT_SECTION_HEADING = re.compile(
    r"(?im)^[ \t]*projects?[ \t]*:?[ \t]*$|^[ \t]*project[ \t]*:[^\n.]{2,120}"
)
_NAMED_PROJECT_HEADING = re.compile(
    r"(?m)^\s*(?P<title>[A-Z][^\n]{1,140}?\s+[–—]\s+[^.\n]{2,140})\s*$"
)
_OTHER_SECTION_HEADING = re.compile(
    r"(?im)^[ \t]*(?:EDUCATION|EXPERIENCE|CERTIFICATIONS?|VOLUNTEERING|"
    r"ACHIEVEMENTS?|PUBLICATIONS?|REFERENCES?)[ \t]*$",
)

_RESUME_PROJECT_QUERIES = [
    "Named projects described in my resume, including each project name and purpose",
    "Technologies, tools, frameworks, and languages used in the projects described in my resume",
    "Features and functionality implemented in projects described in my resume",
]
_RESUME_SKILLS_QUERY = (
    "Technical skills, programming languages, frameworks, and tools listed in my resume"
)


def _retrieval_queries(query: str) -> list[str]:
    queries = [query]
    if not _RESUME_REFERENCE.search(query):
        return queries
    if _PROJECT_REFERENCE.search(query):
        queries.extend(_RESUME_PROJECT_QUERIES)
    if _BROAD_RESUME_SUMMARY.search(query):
        queries.append(_RESUME_SKILLS_QUERY)
        if not _PROJECT_REFERENCE.search(query):
            queries.extend(_RESUME_PROJECT_QUERIES)
    return queries


def _is_project_section_seed(match: dict[str, Any]) -> bool:
    content = str(match.get("content", ""))
    return (
        str(match.get("sourceType", "")).upper() == SourceType.RESUME.value
        and (
            bool(_PROJECT_SECTION_HEADING.search(content))
            or (
                bool(_NAMED_PROJECT_HEADING.search(content))
                and bool(re.search(r"\b(?:GitHub|GitLab|Live)\b", content, re.IGNORECASE))
            )
        )
    )


def _project_heading_tokens(content: str) -> set[str]:
    heading = _NAMED_PROJECT_HEADING.search(content)
    if heading:
        title = heading.group("title")
    else:
        entry = re.search(
            r"(?im)^[ \t]*project[ \t]*:[ \t]*([^\n.]{2,120})",
            content,
        )
        if not entry:
            return set()
        title = entry.group(1)
    return set(re.findall(r"[\w+#]+", title.casefold()))


def _project_continuation(seed_content: str, content: str) -> str | None:
    heading = _NAMED_PROJECT_HEADING.search(content)
    if heading:
        prefix = content[: heading.start()].strip()
        if prefix:
            return prefix
        seed_tokens = _project_heading_tokens(seed_content)
        heading_tokens = set(re.findall(r"[\w+#]+", heading.group("title").casefold()))
        shared_tokens = seed_tokens & heading_tokens
        if not seed_tokens or not heading_tokens or (
            len(shared_tokens) / min(len(seed_tokens), len(heading_tokens)) < 0.6
        ):
            return None

    section = _OTHER_SECTION_HEADING.search(content)
    if section:
        prefix = content[: section.start()].strip()
        return prefix or None
    return content.strip() or None


async def _expand_project_context(
    settings: Settings,
    user_id: UUID,
    seeds: list[dict[str, Any]],
    storage: PostgresStorage,
) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    seen_ids = {str(seed["id"]) for seed in seeds}
    for seed in seeds:
        if not _is_project_section_seed(seed):
            continue

        source_id = UUID(str(seed["sourceId"]))
        expected_index = int(seed["chunkIndex"])
        adjacent = await storage.fetch_adjacent_chunks(
            settings,
            user_id,
            SourceType.RESUME,
            source_id,
            expected_index,
            limit=MAX_ADJACENT_CHUNKS,
        )
        seed_content = str(seed["content"])
        for candidate in adjacent[:MAX_ADJACENT_CHUNKS]:
            candidate_id = str(candidate["id"])
            candidate_index = int(candidate["chunkIndex"])
            if (
                str(candidate.get("userId", user_id)) != str(user_id)
                or str(candidate.get("sourceType", "")).upper() != SourceType.RESUME.value
                or str(candidate.get("sourceId")) != str(source_id)
                or candidate_index != expected_index + 1
            ):
                break

            expected_index = candidate_index
            if candidate_id in seen_ids:
                continue
            content = _project_continuation(seed_content, str(candidate["content"]))
            if content is None:
                break
            expanded.append(
                {
                    "id": candidate_id,
                    "sourceType": SourceType.RESUME.value,
                    "sourceId": str(source_id),
                    "title": candidate["title"],
                    "chunkIndex": candidate_index,
                    "content": content,
                    "contextExpanded": True,
                }
            )
            seen_ids.add(candidate_id)
            if content != str(candidate["content"]).strip():
                break
    return expanded


async def ingest_snapshot(
    payload: KnowledgeIngestRequest,
    settings: Settings,
    provider: CopilotProvider,
    storage: PostgresStorage,
) -> KnowledgeCountResponse:
    tokenizer = await provider.get_tokenizer() if payload.documents else None
    chunks = chunk_documents(
        payload.documents,
        tokenizer=tokenizer,
    )
    content_keys = list(
        dict.fromkeys((content_hash(chunk.content), chunk.content) for chunk in chunks)
    )

    existing = await storage.existing_embeddings(
        settings, payload.user_id, content_keys
    )
    missing = [
        text
        for digest, text in content_keys
        if (digest, text) not in existing
    ]
    vectors_by_content: dict[str, list[float]] = {
        text: existing[(digest, text)]
        for digest, text in content_keys
        if (digest, text) in existing
    }
    if missing:
        settings.require_embedding_configuration()
        generated = await provider.embed_texts(missing)
        if len(generated) != len(missing):
            raise ProviderError("Embedding provider returned an incomplete response")
        for text, vector in zip(missing, generated, strict=True):
            vectors_by_content[text] = validate_embedding(
                vector, EMBEDDING_DIMENSIONS
            )

    counts = await storage.replace_snapshot(
        settings, payload.user_id, chunks, vectors_by_content
    )
    return KnowledgeCountResponse.model_validate(counts)


async def get_knowledge_status(
    user_id: UUID, settings: Settings, storage: PostgresStorage
) -> KnowledgeCountResponse:
    return KnowledgeCountResponse.model_validate(await storage.status(settings, user_id))


async def delete_knowledge_source(
    user_id: UUID,
    source_type: SourceType,
    source_id: UUID,
    settings: Settings,
    storage: PostgresStorage,
) -> KnowledgeDeleteResponse:
    count = await storage.delete_source(settings, user_id, source_type, source_id)
    return KnowledgeDeleteResponse(deleted=count)


async def respond_to_copilot(
    payload: CopilotRequest,
    settings: Settings,
    provider: CopilotProvider,
    storage: PostgresStorage,
) -> CopilotResponse:
    settings.require_chat_configuration()
    settings.require_embedding_configuration()

    retrieval_queries = _retrieval_queries(payload.query)
    query_vectors = await provider.embed_texts(retrieval_queries)
    if len(query_vectors) != len(retrieval_queries):
        raise ProviderError("Embedding provider returned an incomplete response")
    matches_by_id: dict[str, dict[str, Any]] = {}
    for query_vector in query_vectors:
        query_embedding = validate_embedding(query_vector, EMBEDDING_DIMENSIONS)
        query_matches = await storage.retrieve(
            settings,
            payload.user_id,
            query_embedding,
            top_k=RETRIEVAL_TOP_K,
            similarity_threshold=RETRIEVAL_SIMILARITY_THRESHOLD,
        )
        for match in query_matches:
            match_id = str(match["id"])
            existing = matches_by_id.get(match_id)
            if existing is None or match["similarity"] > existing["similarity"]:
                matches_by_id[match_id] = match
    matches = sorted(
        matches_by_id.values(),
        key=lambda match: match["similarity"],
        reverse=True,
    )[:RETRIEVAL_TOP_K]
    expanded = await _expand_project_context(
        settings,
        payload.user_id,
        matches,
        storage,
    )
    retrieved = [
        CopilotSource.model_validate(
            {
                "id": match["id"],
                "sourceType": match["sourceType"],
                "sourceId": match["sourceId"],
                "title": match["title"],
                "chunkIndex": match["chunkIndex"],
                **(
                    {"similarity": match["similarity"]}
                    if "similarity" in match
                    else {}
                ),
                "content": match["content"],
                "contextExpanded": match.get("contextExpanded", False),
            }
        )
        for match in [*matches, *expanded]
    ]
    context = build_prompt_context(
        payload.query,
        payload.history,
        retrieved,
        max_tokens=MAX_CONTEXT_TOKEN_BUDGET,
    )
    raw_answer = await provider.answer(context.messages)
    try:
        validated = CopilotModelAnswer.model_validate({"answer": raw_answer})
    except ValidationError as exc:
        raise ProviderError("Chat provider returned malformed output") from exc
    if not context.sources:
        normalized_answer = validated.answer.casefold()
        if (
            "personal data is insufficient" not in normalized_answer
            or "general advice:" not in normalized_answer
        ):
            raise ProviderError("Chat provider response did not follow grounding requirements")
    return CopilotResponse(
        answer=validated.answer,
        sources=context.sources,
        provider=provider.provider_name,
        model=settings.groq_model,
    )
