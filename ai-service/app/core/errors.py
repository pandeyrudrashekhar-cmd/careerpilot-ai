class AIServiceError(Exception):
    status_code = 503
    public_detail = "AI service is unavailable"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.public_detail)
        self.detail = detail or self.public_detail


class ServiceConfigurationError(AIServiceError):
    public_detail = "AI service configuration is incomplete"


class ProviderError(AIServiceError):
    status_code = 502
    public_detail = "AI provider request failed"


class DatabaseConfigurationError(ServiceConfigurationError):
    public_detail = (
        "Knowledge storage is not configured: the KnowledgeChunkLocal table or "
        "pgvector extension is unavailable"
    )


class DatabaseUnavailableError(AIServiceError):
    public_detail = "Knowledge database is unavailable"


class ChunkLimitError(AIServiceError):
    status_code = 413
    public_detail = "Ingested content exceeds the maximum chunk limit"


class ContextBudgetError(AIServiceError):
    status_code = 413
    public_detail = "Query exceeds the maximum prompt context budget"
