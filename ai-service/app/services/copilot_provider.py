import httpx

from app.core.config import Settings
from app.services.local_embedding_provider import LocalEmbeddingProvider
from app.services.groq_provider import GroqProvider


class CopilotProvider:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.embedding_provider = LocalEmbeddingProvider(settings)
        self.chat_provider = GroqProvider(settings, transport=transport)
        self.provider_name = self.chat_provider.provider_name

    async def get_tokenizer(self):
        return await self.embedding_provider.get_tokenizer()

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return await self.embedding_provider.embed_texts(texts)

    async def answer(self, messages: list[dict[str, str]]) -> str:
        return await self.chat_provider.answer(messages)
