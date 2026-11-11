import asyncio

import httpx
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)

from app.core.config import Settings
from app.core.errors import ProviderError


GROQ_API_BASE = "https://api.groq.com/openai/v1"


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    content: str | None = None


class ChatChoice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: ChatMessage


class ChatPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    choices: list[ChatChoice]


class CopilotModelAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    answer: str = Field(min_length=1)

    @field_validator("answer")
    @classmethod
    def answer_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("answer must not be blank")
        return value


class GroqProvider:
    provider_name = "groq"
    max_attempts = 2
    retry_delay_seconds = 0.3

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.settings = settings
        self.transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=GROQ_API_BASE,
            headers={"Authorization": f"Bearer {self.settings.groq_api_key}"},
            timeout=httpx.Timeout(60.0, connect=10.0),
            transport=self.transport,
        )

    async def answer(self, messages: list[dict[str, str]]) -> str:
        self.settings.require_chat_configuration()
        try:
            for attempt in range(self.max_attempts):
                try:
                    async with self._client() as client:
                        response = await client.post(
                            "/chat/completions",
                            json={
                                "model": self.settings.groq_model,
                                "messages": messages,
                                "response_format": {
                                    "type": "json_schema",
                                    "json_schema": {
                                        "name": "copilot_answer",
                                        "strict": True,
                                        "schema": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "required": ["answer"],
                                            "properties": {"answer": {"type": "string"}},
                                        },
                                    },
                                },
                                "temperature": 0.2,
                                "max_completion_tokens": 1_200,
                            },
                        )
                except httpx.HTTPError as exc:
                    if attempt + 1 == self.max_attempts:
                        raise ProviderError("Groq chat request failed") from exc
                    await asyncio.sleep(self.retry_delay_seconds * (attempt + 1))
                    continue

                if (response.status_code == 429 or response.status_code >= 500) and attempt + 1 < self.max_attempts:
                    await asyncio.sleep(self.retry_delay_seconds * (attempt + 1))
                    continue
                if response.status_code == 401:
                    raise ProviderError("Groq API authentication failed")
                if response.status_code == 429:
                    raise ProviderError("Groq API rate limit exceeded")
                if response.status_code >= 500:
                    raise ProviderError("Groq API is temporarily unavailable")
                response.raise_for_status()
                payload = ChatPayload.model_validate(response.json())
                if not payload.choices or not payload.choices[0].message.content:
                    raise ProviderError("Chat provider returned an empty response")
                model_answer = CopilotModelAnswer.model_validate_json(
                    payload.choices[0].message.content
                )
                return model_answer.answer
        except ProviderError:
            raise
        except (httpx.HTTPError, ValueError, ValidationError, TypeError) as exc:
            raise ProviderError("Groq chat request failed or returned malformed data") from exc
        raise ProviderError("Groq chat request failed")
