from pathlib import Path
from typing import Literal

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.errors import ServiceConfigurationError

EMBEDDING_DIMENSIONS = 384
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
DEFAULT_EMBEDDING_CACHE_DIR = (
    Path.home() / ".cache" / "careerpilot-ai" / "minilm-onnx"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        extra="ignore",
        case_sensitive=False,
    )

    ai_service_internal_token: str | None = Field(default=None, min_length=32)
    database_url: str | None = None
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-20b"
    local_embedding_provider: Literal["onnx"] = "onnx"
    local_embedding_cache_dir: Path = Field(default=DEFAULT_EMBEDDING_CACHE_DIR)

    def require_embedding_configuration(self) -> None:
        if self.local_embedding_provider != "onnx":
            raise ServiceConfigurationError("Local ONNX embedding provider is not configured")
        if not str(self.local_embedding_cache_dir).strip():
            raise ServiceConfigurationError("Local embedding model cache directory is not configured")

    def require_chat_configuration(self) -> None:
        if not self.groq_api_key:
            raise ServiceConfigurationError("Groq API key is not configured")
        if not self.groq_model.strip():
            raise ServiceConfigurationError("Groq model is not configured")

    def require_database_configuration(self) -> None:
        if not self.database_url:
            raise ServiceConfigurationError("Database URL is not configured")


def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        raise ServiceConfigurationError("AI service configuration is invalid") from exc
