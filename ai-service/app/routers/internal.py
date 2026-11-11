from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from app.core.config import Settings, get_settings
from app.models.knowledge import (
    CopilotRequest,
    CopilotResponse,
    KnowledgeCountResponse,
    KnowledgeDeleteResponse,
    KnowledgeIngestRequest,
    SourceType,
)
from app.services.knowledge import (
    delete_knowledge_source,
    get_knowledge_status,
    ingest_snapshot,
    respond_to_copilot,
)
from app.services.copilot_provider import CopilotProvider
from app.services.storage import PostgresStorage


router = APIRouter()


def storage_dependency(request: Request) -> PostgresStorage:
    return request.app.state.knowledge_storage


def provider_dependency(
    request: Request, settings: Settings = Depends(get_settings)
) -> CopilotProvider:
    return request.app.state.provider_factory(settings)


@router.post("/knowledge/ingest", response_model=KnowledgeCountResponse)
async def ingest_knowledge(
    payload: KnowledgeIngestRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[PostgresStorage, Depends(storage_dependency)],
    provider: Annotated[CopilotProvider, Depends(provider_dependency)],
) -> KnowledgeCountResponse:
    return await ingest_snapshot(payload, settings, provider, storage)


@router.get("/knowledge/status", response_model=KnowledgeCountResponse)
async def knowledge_status(
    user_id: Annotated[UUID, Query(alias="userId")],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[PostgresStorage, Depends(storage_dependency)],
) -> KnowledgeCountResponse:
    return await get_knowledge_status(user_id, settings, storage)


@router.delete(
    "/knowledge/{source_type}/{source_id}",
    response_model=KnowledgeDeleteResponse,
)
async def delete_knowledge(
    source_type: SourceType,
    source_id: UUID,
    user_id: Annotated[UUID, Query(alias="userId")],
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[PostgresStorage, Depends(storage_dependency)],
) -> KnowledgeDeleteResponse:
    return await delete_knowledge_source(user_id, source_type, source_id, settings, storage)


@router.post("/copilot/respond", response_model=CopilotResponse)
async def copilot_respond(
    payload: CopilotRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[PostgresStorage, Depends(storage_dependency)],
    provider: Annotated[CopilotProvider, Depends(provider_dependency)],
) -> CopilotResponse:
    return await respond_to_copilot(payload, settings, provider, storage)
