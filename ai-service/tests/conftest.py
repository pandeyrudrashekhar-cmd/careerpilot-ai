import os

import asyncpg
import pytest


_REMOTE_TEST_NAME = "test_local_onnx_supabase_ingestion_retrieval_and_isolation"


@pytest.fixture(autouse=True)
def prevent_unapproved_database_connections(monkeypatch, request):
    remote_test_opted_in = (
        request.node.name == _REMOTE_TEST_NAME
        and os.environ.get("CAREERPILOT_ONNX_REMOTE_TEST") == "1"
    )
    if remote_test_opted_in:
        return

    def reject_connection(*args, **kwargs):
        raise AssertionError(
            "Database connections are disabled outside the explicit remote integration test"
        )

    monkeypatch.setattr(asyncpg, "connect", reject_connection)
    monkeypatch.setattr(asyncpg, "create_pool", reject_connection)
