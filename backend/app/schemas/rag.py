from pydantic import BaseModel, Field

from .chat import Topic


class RagRequest(BaseModel):
    query: str = Field(min_length=3, max_length=500)
    topic: Topic | None = None
    limit: int = Field(default=5, ge=1, le=10)


class RagChunkOut(BaseModel):
    page: int | None
    source: str
    similarity: float
    preview: str


class RagResponse(BaseModel):
    text: str
    blocked: bool = False
    reason: str | None = None
    chunks: list[RagChunkOut] = []
