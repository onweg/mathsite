"""LLM-провайдер — абстракция.

Один провайдер = один класс, реализующий Protocol. Сервисы и классификатор
знают только про Protocol, не про конкретный Yandex/Claude/GigaChat.
"""

from typing import AsyncIterator, Protocol, runtime_checkable

from app.domain.chat.types import ChatReply, EmbedKind, Message, ModerationResult


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    async def chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.4,
        max_tokens: int = 2000,
    ) -> ChatReply:
        """Один синхронный запрос, вся генерация целиком."""
        ...

    async def stream_chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.4,
        max_tokens: int = 2000,
    ) -> AsyncIterator[str]:
        """Поток токенов. Используется для набора ответа 'печатной машинкой'."""
        ...

    async def embed(self, text: str, *, kind: EmbedKind = "query") -> list[float]:
        """Эмбеддинг под поисковый индекс."""
        ...

    async def moderate(self, text: str) -> ModerationResult:
        """Модерация через саму LLM. У провайдеров без API модерации — через chat."""
        ...
