"""Внутренние типы чата. Не путать с HTTP DTO из app/schemas/."""

from dataclasses import dataclass, field
from typing import Literal

Role = Literal["system", "user", "assistant"]
Topic = Literal["algebra", "geometry"]
EmbedKind = Literal["doc", "query"]


@dataclass(frozen=True)
class Message:
    role: Role
    text: str


@dataclass(frozen=True)
class ChatReply:
    text: str
    model_version: str | None = None
    usage: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ModerationResult:
    """Результат мод-проверки от LLM-провайдера (слой 2 или будущий Claude Moderation)."""

    allowed: bool
    reason: str = ""
