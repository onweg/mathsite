from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["system", "user", "assistant"]
Topic = Literal["algebra", "geometry"]


class ChatMessage(BaseModel):
    role: Role
    text: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    temperature: float = Field(default=0.4, ge=0.0, le=1.0)
    topic: Topic | None = None
    section: str | None = None  # дополнительный контекст страницы


class ChatResponse(BaseModel):
    text: str
    blocked: bool = False          # сработала защита
    reason: str | None = None      # причина блока / отказа
    model_version: str | None = None
    usage: dict = {}


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    kind: Literal["doc", "query"] = "query"


class EmbedResponse(BaseModel):
    embedding: list[float]
    dim: int


class RagRequest(BaseModel):
    query: str = Field(min_length=3, max_length=500)
    topic: Topic | None = None   # algebra → только из учебника алгебры и т.д.
    limit: int = Field(default=5, ge=1, le=10)


class RagChunk(BaseModel):
    page: int | None
    source: str
    similarity: float
    preview: str


class RagResponse(BaseModel):
    text: str
    blocked: bool = False
    reason: str | None = None
    chunks: list[RagChunk] = []
