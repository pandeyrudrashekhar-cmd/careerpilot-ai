from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator


class SourceType(StrEnum):
    RESUME = "RESUME"
    PROFILE = "PROFILE"
    SKILL = "SKILL"
    ROADMAP = "ROADMAP"
    APPLICATION = "APPLICATION"
    JOB = "JOB"


class HistoryRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class KnowledgeDocument(APIModel):
    source_type: SourceType = Field(alias="sourceType")
    source_id: UUID = Field(alias="sourceId")
    title: Annotated[StrictStr, Field(max_length=500)]
    content: Annotated[StrictStr, Field(max_length=100_000)]


class KnowledgeIngestRequest(APIModel):
    user_id: UUID = Field(alias="userId")
    documents: list[KnowledgeDocument] = Field(max_length=500)


class KnowledgeCountResponse(APIModel):
    source_count: int = Field(alias="sourceCount", ge=0)
    chunk_count: int = Field(alias="chunkCount", ge=0)


class KnowledgeDeleteResponse(APIModel):
    deleted: int = Field(ge=0)


class HistoryMessage(APIModel):
    role: HistoryRole
    content: Annotated[StrictStr, Field(max_length=20_000)]


class CopilotRequest(APIModel):
    user_id: UUID = Field(alias="userId")
    query: Annotated[StrictStr, Field(min_length=1, max_length=10_000)]
    history: list[HistoryMessage] = Field(default_factory=list, max_length=100)

    @field_validator("query")
    @classmethod
    def query_must_have_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query must not be blank")
        return value


class CopilotSource(APIModel):
    id: UUID
    source_type: SourceType = Field(alias="sourceType")
    source_id: UUID = Field(alias="sourceId")
    title: str
    chunk_index: int = Field(alias="chunkIndex", ge=0)
    similarity: float | None = Field(default=None, ge=-1, le=1)
    content: str
    context_expanded: bool = Field(default=False, alias="contextExpanded")


class CopilotResponse(APIModel):
    answer: Annotated[StrictStr, Field(min_length=1)]
    sources: list[CopilotSource]
    provider: StrictStr
    model: StrictStr

    @field_validator("answer")
    @classmethod
    def answer_must_have_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("answer must not be blank")
        return value
