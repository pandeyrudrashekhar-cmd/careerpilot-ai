import asyncio
import hashlib
import math
import uuid
from collections.abc import Sequence
from typing import Any
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit
from uuid import UUID

import asyncpg

from app.core.config import EMBEDDING_DIMENSIONS, Settings
from app.core.errors import (
    DatabaseConfigurationError,
    DatabaseUnavailableError,
)
from app.models.knowledge import SourceType
from app.services.chunking import DocumentChunk
from app.services.embedding_utils import validate_embedding


TABLE_NAME = '"KnowledgeChunkLocal"'
MAX_RETRIEVAL_TOP_K = 12
EXISTING_EMBEDDINGS_SQL = f"""
SELECT DISTINCT ON ("contentHash", "content")
       "contentHash", "content", "embedding"::text AS embedding
FROM {TABLE_NAME}
WHERE "userId" = $1 AND "contentHash" = ANY($2::text[])
  AND "content" = ANY($3::text[])
ORDER BY "contentHash", "content"
"""
REPLACE_DELETE_SQL = f'DELETE FROM {TABLE_NAME} WHERE "userId" = $1'
SNAPSHOT_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))"
REPLACE_INSERT_SQL = f"""
INSERT INTO {TABLE_NAME}
  ("id", "userId", "sourceType", "sourceId", "title", "content", "contentHash", "chunkIndex", "embedding")
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::extensions.vector(384))
"""
STATUS_SQL = f"""
SELECT COUNT(*)::int AS "chunkCount",
       (SELECT COUNT(*)::int FROM (
          SELECT DISTINCT "sourceType", "sourceId"
          FROM {TABLE_NAME}
          WHERE "userId" = $1
       ) AS sources) AS "sourceCount"
FROM {TABLE_NAME}
WHERE "userId" = $1
"""
DELETE_SOURCE_SQL = f"""
DELETE FROM {TABLE_NAME}
WHERE "userId" = $1 AND "sourceType" = $2 AND "sourceId" = $3
"""
RETRIEVAL_SQL = f"""
SELECT "id"::text AS id,
       "sourceType" AS "sourceType",
       "sourceId"::text AS "sourceId",
       "title",
       "chunkIndex" AS "chunkIndex",
       "content",
       (1 - ("embedding" <=> $1::extensions.vector(384)))::float8 AS similarity
FROM {TABLE_NAME}
WHERE "userId" = $2
  AND 1 - ("embedding" <=> $1::extensions.vector(384)) >= $3
ORDER BY "embedding" <=> $1::extensions.vector(384) ASC
LIMIT $4
"""
ADJACENT_CHUNKS_SQL = f"""
SELECT "id"::text AS id,
       "userId"::text AS "userId",
       "sourceType" AS "sourceType",
       "sourceId"::text AS "sourceId",
       "title",
       "chunkIndex" AS "chunkIndex",
       "content"
FROM {TABLE_NAME}
WHERE "userId" = $1
  AND "sourceType" = $2
  AND "sourceId" = $3
  AND "chunkIndex" > $4
  AND "chunkIndex" <= $4 + $5
ORDER BY "chunkIndex" ASC
LIMIT $5
"""

_KNOWLEDGE_SETUP_SQLSTATES = {"42P01", "42704", "42883", "3F000"}


def vector_literal(embedding: Sequence[float]) -> str:
    vector = validate_embedding(list(embedding), EMBEDDING_DIMENSIONS)
    return "[" + ",".join(repr(value) for value in vector) + "]"


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def normalize_asyncpg_dsn(dsn: str) -> str:
    try:
        parsed = urlsplit(dsn)
        if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname:
            raise ValueError
        port = parsed.port
    except ValueError as exc:
        raise DatabaseConfigurationError("Database URL is invalid") from exc

    host = parsed.hostname
    hostpart = f"[{host}]" if ":" in host else host
    if port is not None:
        hostpart += f":{port}"

    auth = ""
    if parsed.username is not None:
        auth = quote(unquote(parsed.username), safe="")
        if parsed.password is not None:
            auth += f":{quote(unquote(parsed.password), safe='')}"
        auth += "@"

    query_parameters = parse_qsl(parsed.query, keep_blank_values=True)
    query = [
        (key, value)
        for key, value in query_parameters
        if key.lower() not in {"pgbouncer", "sslmode"}
    ]
    ssl_modes = [
        value.lower()
        for key, value in query_parameters
        if key.lower() == "sslmode"
    ]
    ssl_mode = ssl_modes[-1] if ssl_modes else "require"
    if ssl_mode not in {"require", "verify-ca", "verify-full"}:
        raise DatabaseConfigurationError("Database connections must require TLS")
    query.append(("sslmode", ssl_mode))

    return urlunsplit(
        (parsed.scheme, f"{auth}{hostpart}", parsed.path, urlencode(query), parsed.fragment)
    )


def parse_vector(value: str) -> list[float]:
    if not value.startswith("[") or not value.endswith("]"):
        raise ValueError("stored vector is malformed")
    components = value[1:-1].split(",")
    if len(components) != EMBEDDING_DIMENSIONS:
        raise ValueError("stored vector has an unexpected dimension")
    vector = [float(component) for component in components]
    if not all(math.isfinite(component) for component in vector):
        raise ValueError("stored vector contains a non-finite value")
    return vector


def is_knowledge_setup_error(error: BaseException) -> bool:
    return getattr(error, "sqlstate", None) in _KNOWLEDGE_SETUP_SQLSTATES


def map_database_error(error: BaseException) -> Exception:
    if is_knowledge_setup_error(error):
        return DatabaseConfigurationError()
    return DatabaseUnavailableError()


class PostgresStorage:
    def __init__(self, pool_factory: Any = None) -> None:
        self._pool_factory = (
            asyncpg.create_pool if pool_factory is None else pool_factory
        )
        self._pool: Any = None
        self._database_url: str | None = None
        self._pool_lock = asyncio.Lock()

    async def close(self) -> None:
        async with self._pool_lock:
            if self._pool is not None:
                await self._pool.close()
                self._pool = None
                self._database_url = None

    async def _get_pool(self, settings: Settings) -> Any:
        settings.require_database_configuration()
        if self._pool is not None and self._database_url == settings.database_url:
            return self._pool
        async with self._pool_lock:
            if self._pool is not None and self._database_url == settings.database_url:
                return self._pool
            if self._pool is not None:
                await self._pool.close()
            normalized_dsn = normalize_asyncpg_dsn(settings.database_url)
            try:
                self._pool = await self._pool_factory(
                    dsn=normalized_dsn,
                    min_size=1,
                    max_size=5,
                    timeout=10,
                    # Supabase transaction-mode PgBouncer cannot safely reuse asyncpg's named statement cache.
                    statement_cache_size=0,
                )
            except Exception as exc:
                raise map_database_error(exc) from exc
            self._database_url = settings.database_url
            return self._pool

    async def _fetch_existing(
        self,
        settings: Settings,
        user_id: UUID,
        content_keys: list[tuple[str, str]],
    ) -> list[Any]:
        pool = await self._get_pool(settings)
        try:
            async with pool.acquire() as connection:
                return await connection.fetch(
                    EXISTING_EMBEDDINGS_SQL,
                    user_id,
                    list(dict.fromkeys(digest for digest, _ in content_keys)),
                    list(dict.fromkeys(content for _, content in content_keys)),
                )
        except Exception as exc:
            raise map_database_error(exc) from exc

    async def existing_embeddings(
        self, settings: Settings, user_id: UUID, content_keys: list[tuple[str, str]]
    ) -> dict[tuple[str, str], list[float]]:
        if not content_keys:
            return {}
        expected_content = set(content_keys)
        rows = await self._fetch_existing(settings, user_id, content_keys)
        result: dict[tuple[str, str], list[float]] = {}
        for row in rows:
            try:
                stored_hash = row["contentHash"]
                content = row["content"]
                if (
                    (stored_hash, content) not in expected_content
                    or content_hash(content) != stored_hash
                ):
                    continue
                result[(stored_hash, content)] = parse_vector(row["embedding"])
            except (TypeError, ValueError):
                continue
        return result

    async def replace_snapshot(
        self,
        settings: Settings,
        user_id: UUID,
        chunks: list[DocumentChunk],
        embeddings: dict[str, list[float]],
    ) -> dict[str, int]:
        pool = await self._get_pool(settings)
        rows = [
            (
                uuid.uuid4(),
                user_id,
                chunk.source_type.value,
                chunk.source_id,
                chunk.title,
                chunk.content,
                content_hash(chunk.content),
                chunk.chunk_index,
                vector_literal(embeddings[chunk.content]),
            )
            for chunk in chunks
        ]
        try:
            async with pool.acquire() as connection:
                async with connection.transaction():
                    await connection.execute(SNAPSHOT_LOCK_SQL, str(user_id))
                    await connection.execute(REPLACE_DELETE_SQL, user_id)
                    if rows:
                        await connection.executemany(REPLACE_INSERT_SQL, rows)
                    counts = await connection.fetchrow(STATUS_SQL, user_id)
            return {
                "sourceCount": counts["sourceCount"],
                "chunkCount": counts["chunkCount"],
            }
        except Exception as exc:
            raise map_database_error(exc) from exc

    async def status(self, settings: Settings, user_id: UUID) -> dict[str, int]:
        pool = await self._get_pool(settings)
        try:
            async with pool.acquire() as connection:
                row = await connection.fetchrow(STATUS_SQL, user_id)
            return {"sourceCount": row["sourceCount"], "chunkCount": row["chunkCount"]}
        except Exception as exc:
            raise map_database_error(exc) from exc

    async def delete_source(
        self,
        settings: Settings,
        user_id: UUID,
        source_type: SourceType,
        source_id: UUID,
    ) -> int:
        pool = await self._get_pool(settings)
        try:
            async with pool.acquire() as connection:
                result = await connection.execute(
                    DELETE_SOURCE_SQL, user_id, source_type.value, source_id
                )
            return int(result.rsplit(" ", 1)[-1])
        except Exception as exc:
            raise map_database_error(exc) from exc

    async def retrieve(
        self,
        settings: Settings,
        user_id: UUID,
        query_embedding: list[float],
        *,
        top_k: int,
        similarity_threshold: float,
    ) -> list[dict[str, Any]]:
        pool = await self._get_pool(settings)
        bounded_top_k = max(1, min(top_k, MAX_RETRIEVAL_TOP_K))
        try:
            async with pool.acquire() as connection:
                rows = await connection.fetch(
                    RETRIEVAL_SQL,
                    vector_literal(query_embedding),
                    user_id,
                    similarity_threshold,
                    bounded_top_k,
                )
            return [dict(row) for row in rows]
        except Exception as exc:
            raise map_database_error(exc) from exc

    async def fetch_adjacent_chunks(
        self,
        settings: Settings,
        user_id: UUID,
        source_type: SourceType,
        source_id: UUID,
        after_chunk_index: int,
        *,
        limit: int,
    ) -> list[dict[str, Any]]:
        bounded_limit = max(0, min(limit, 3))
        if bounded_limit == 0:
            return []
        pool = await self._get_pool(settings)
        try:
            async with pool.acquire() as connection:
                rows = await connection.fetch(
                    ADJACENT_CHUNKS_SQL,
                    user_id,
                    source_type.value,
                    source_id,
                    after_chunk_index,
                    bounded_limit,
                )
            return [dict(row) for row in rows]
        except Exception as exc:
            raise map_database_error(exc) from exc
