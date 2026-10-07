"""HTTP DTO для /chat. Контракт с фронтом не менять без согласования с frontend/lib/api.ts."""

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant"]
Topic = Literal["algebra", "geometry"]


class ChatMessageIn(BaseModel):
    role: Role
    text: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=40)
    temperature: float = Field(default=0.4, ge=0.0, le=1.0)
    topic: Topic | None = None
    section: str | None = None


class ChatResponse(BaseModel):
    text: str
    blocked: bool = False
    reason: str | None = None
    model_version: str | None = None
    usage: dict = {}
