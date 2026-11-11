import asyncio
import math
import os
from urllib.parse import unquote, urlsplit
from uuid import UUID

import asyncpg
import pytest

from app.core.config import EMBEDDING_DIMENSIONS, Settings
from app.models.knowledge import (
    KnowledgeDocument,
    KnowledgeIngestRequest,
    SourceType,
)
from app.services.embedding_utils import validate_embedding
from app.services.knowledge import ingest_snapshot
from app.services.local_embedding_provider import LocalEmbeddingProvider
from app.services.storage import PostgresStorage, normalize_asyncpg_dsn, parse_vector


_APPROVED_PROJECT_REF = "clhexcvomguhmnjjxhoo"
_EXPECTED_USERS = {
    "A": UUID("29c6e5ba-3239-4654-9ff2-81860fbc608d"),
    "B": UUID("81123065-cfdd-437e-9475-bba75167878b"),
}
_EXPECTED_SOURCES = {
    "A": UUID("5b3312fd-7cb5-4890-b1f9-97abefe2396b"),
    "B": UUID("59e057e3-63f5-4b99-a493-75cfd8c2f6d3"),
}
_SOURCE_TYPE = SourceType.SKILL
_REQUIRED_ENVIRONMENT = (
    "CAREERPILOT_TEST_DATABASE_URL",
    "CAREERPILOT_EXPECTED_SUPABASE_PROJECT_REF",
    "CAREERPILOT_TEST_USER_ID_A",
    "CAREERPILOT_TEST_USER_ID_B",
    "CAREERPILOT_TEST_SOURCE_ID_A",
    "CAREERPILOT_TEST_SOURCE_ID_B",
)


def _environment_configuration() -> tuple[str, str, dict[str, UUID], dict[str, UUID]]:
    if os.environ.get("CAREERPILOT_ONNX_REMOTE_TEST") != "1":
        pytest.skip("Set CAREERPILOT_ONNX_REMOTE_TEST=1 to opt into the live test")

    missing = [name for name in _REQUIRED_ENVIRONMENT if not os.environ.get(name)]
    if missing:
        pytest.fail(
            "Live test opted in, but required environment variables are missing: "
            + ", ".join(missing)
        )

    expected_project_ref = os.environ["CAREERPILOT_EXPECTED_SUPABASE_PROJECT_REF"]
    if expected_project_ref != _APPROVED_PROJECT_REF:
        pytest.fail("Expected Supabase project reference does not match the approved test project")

    users: dict[str, UUID] = {}
    sources: dict[str, UUID] = {}
    for label in ("A", "B"):
        try:
            users[label] = UUID(os.environ[f"CAREERPILOT_TEST_USER_ID_{label}"])
            sources[label] = UUID(os.environ[f"CAREERPILOT_TEST_SOURCE_ID_{label}"])
        except ValueError:
            pytest.fail(f"User {label} and source {label} identifiers must be UUIDs")
        if users[label] != _EXPECTED_USERS[label]:
            pytest.fail(f"User {label} does not match its approved disposable test identity")
        if sources[label] != _EXPECTED_SOURCES[label]:
            pytest.fail(f"Source {label} does not match its approved disposable test identifier")

    if users["A"] == users["B"] or sources["A"] == sources["B"]:
        pytest.fail("The two test users and source identifiers must be distinct")

    database_url = os.environ["CAREERPILOT_TEST_DATABASE_URL"]
    _verify_database_project(database_url, expected_project_ref)
    return database_url, expected_project_ref, users, sources


def _verify_database_project(database_url: str, expected_project_ref: str) -> None:
    try:
        parsed = urlsplit(database_url)
        hostname = (parsed.hostname or "").lower()
        username = unquote(parsed.username or "")
    except ValueError:
        pytest.fail("CAREERPILOT_TEST_DATABASE_URL is not a valid database URL")
    if parsed.scheme not in {"postgres", "postgresql"}:
        pytest.fail("The live test database URL must use PostgreSQL")

    host_matches = False
    if hostname.endswith(".supabase.co"):
        labels = hostname.split(".")
        host_matches = (
            len(labels) >= 4
            and labels[-2:] == ["supabase", "co"]
            and expected_project_ref in labels[:-2]
        )
    pooler_matches = (
        hostname.endswith(".pooler.supabase.com")
        and username.rsplit(".", 1)[-1] == expected_project_ref
    )
    if not (host_matches or pooler_matches):
        pytest.fail("Database URL does not identify the expected Supabase project")


async def _connect(database_url: str) -> asyncpg.Connection:
    try:
        return await asyncpg.connect(
            dsn=normalize_asyncpg_dsn(database_url),
            timeout=12,
        )
    except Exception as exc:
        pytest.fail(
            f"Supabase test database connection failed ({type(exc).__name__}); "
            "connection details withheld"
        )


async def _preflight(
    database_url: str,
    users: dict[str, UUID],
    sources: dict[str, UUID],
) -> None:
    connection = await _connect(database_url)
    try:
        async with connection.transaction(readonly=True):
            tables = await connection.fetchrow(
                """
                SELECT to_regclass('public."User"') IS NOT NULL AS user_table,
                       to_regclass('public."KnowledgeChunkLocal"') IS NOT NULL AS knowledge_table
                """
            )
            assert tables["user_table"], 'Required table public."User" is missing'
            assert tables["knowledge_table"], (
                'Required table public."KnowledgeChunkLocal" is missing'
            )

            for label in ("A", "B"):
                result = await connection.fetchrow(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM public."User" WHERE id = $1::uuid
                    ) AS user_exists,
                    (
                        SELECT count(*)::bigint
                        FROM public."KnowledgeChunkLocal"
                        WHERE "userId" = $1::uuid
                    ) AS chunk_count,
                    EXISTS (
                        SELECT 1 FROM public."KnowledgeChunkLocal"
                        WHERE "userId" = $1::uuid AND "sourceId" = $2::uuid
                    ) AS source_exists
                    """,
                    users[label],
                    sources[label],
                )
                assert result["user_exists"], (
                    f"Disposable User {label} does not exist; refusing ingestion"
                )
                assert result["chunk_count"] == 0, (
                    f"Disposable User {label} already has local knowledge rows; "
                    "refusing user-wide snapshot replacement"
                )
                assert not result["source_exists"], (
                    f"Source {label} is already present for its test user; refusing ingestion"
                )
    finally:
        await connection.close()


async def _stored_vectors(
    database_url: str,
    user_id: UUID,
    source_id: UUID,
) -> list[list[float]]:
    connection = await _connect(database_url)
    try:
        async with connection.transaction(readonly=True):
            rows = await connection.fetch(
                """
                SELECT "embedding"::text AS embedding
                FROM public."KnowledgeChunkLocal"
                WHERE "userId" = $1
                  AND "sourceType" = $2
                  AND "sourceId" = $3
                ORDER BY "chunkIndex"
                """,
                user_id,
                _SOURCE_TYPE.value,
                source_id,
            )
        return [parse_vector(row["embedding"]) for row in rows]
    finally:
        await connection.close()


async def _source_row_count(
    database_url: str,
    user_id: UUID,
    source_id: UUID,
) -> int:
    connection = await _connect(database_url)
    try:
        async with connection.transaction(readonly=True):
            return await connection.fetchval(
                """
                SELECT count(*)::int
                FROM public."KnowledgeChunkLocal"
                WHERE "userId" = $1
                  AND "sourceType" = $2
                  AND "sourceId" = $3
                """,
                user_id,
                _SOURCE_TYPE.value,
                source_id,
            )
    finally:
        await connection.close()


def _document(user_label: str, source_id: UUID) -> KnowledgeDocument:
    if user_label == "A":
        title = "Synthetic observatory instrument test"
        content = (
            "Disposable synthetic test data for astronomy. The observatory team "
            "calibrates a radio telescope to observe distant pulsars and neutron "
            "stars. This fictional skill note contains no real user information."
        )
    else:
        title = "Synthetic bakery fermentation test"
        content = (
            "Disposable synthetic test data for baking. The bakery team ferments "
            "rye sourdough with a starter before shaping loaves for the oven. "
            "This fictional skill note contains no real user information."
        )
    return KnowledgeDocument(
        sourceType=_SOURCE_TYPE,
        sourceId=source_id,
        title=title,
        content=content,
    )


def test_local_onnx_supabase_ingestion_retrieval_and_isolation():
    database_url, _, users, sources = _environment_configuration()
    asyncio.run(_run_live_test(database_url, users, sources))


async def _run_live_test(
    database_url: str,
    users: dict[str, UUID],
    sources: dict[str, UUID],
) -> None:
    await _preflight(database_url, users, sources)
    print("Preflight passed: both dedicated users and source IDs are unused.")

    settings = Settings(_env_file=None, database_url=database_url)
    provider = LocalEmbeddingProvider(settings)
    storage = PostgresStorage()
    cleanup_errors: list[str] = []
    try:
        for label in ("A", "B"):
            payload = KnowledgeIngestRequest(
                userId=users[label],
                documents=[_document(label, sources[label])],
            )
            counts = await ingest_snapshot(payload, settings, provider, storage)
            assert counts.chunk_count > 0, f"User {label} ingestion stored no chunks"
        print("Ingestion passed: both synthetic documents used the local ONNX provider.")

        for label in ("A", "B"):
            vectors = await _stored_vectors(
                database_url, users[label], sources[label]
            )
            assert vectors, f"No stored test vector found for User {label}"
            for vector in vectors:
                checked = validate_embedding(vector, EMBEDDING_DIMENSIONS)
                norm = math.sqrt(sum(component * component for component in checked))
                assert math.isclose(norm, 1.0, rel_tol=0.0, abs_tol=1e-4), (
                    f"Stored User {label} vector is not normalized"
                )
        print("Storage passed: vectors are 384-dimensional, finite, and normalized.")

        queries = {
            "A": "Which instrument observes pulsars and neutron stars?",
            "B": "What kind of bread is fermented with a starter?",
        }
        for label, other_label in (("A", "B"), ("B", "A")):
            query_vectors = await provider.embed_texts([queries[label]])
            assert len(query_vectors) == 1
            query_vector = validate_embedding(
                query_vectors[0], EMBEDDING_DIMENSIONS
            )
            matches = await storage.retrieve(
                settings,
                users[label],
                query_vector,
                top_k=8,
                similarity_threshold=0.35,
            )
            source_ids = {UUID(match["sourceId"]) for match in matches}
            assert source_ids <= {sources[label]}, (
                f"User {label} retrieval returned a source outside its test document"
            )
            assert sources[label] in source_ids, (
                f"Semantic retrieval did not return User {label}'s relevant test source"
            )
            assert sources[other_label] not in source_ids, (
                f"User {label} retrieved the other test user's source"
            )
        print("Retrieval passed: relevant sources returned and cross-user sources excluded.")
    finally:
        for label in ("A", "B"):
            try:
                deleted = await storage.delete_source(
                    settings,
                    users[label],
                    _SOURCE_TYPE,
                    sources[label],
                )
                print(
                    f"Cleanup attempted for User {label}'s exact test source "
                    f"(deleted rows: {deleted})."
                )
                remaining = await _source_row_count(
                    database_url, users[label], sources[label]
                )
                if remaining:
                    cleanup_errors.append(
                        f"User {label} exact-source cleanup left {remaining} row(s)"
                    )
            except Exception as exc:
                cleanup_errors.append(
                    f"User {label} exact-source cleanup failed "
                    f"({type(exc).__name__})"
                )
        try:
            await storage.close()
        except Exception as exc:
            cleanup_errors.append(f"Storage close failed ({type(exc).__name__})")
        if cleanup_errors:
            raise RuntimeError("; ".join(cleanup_errors))
