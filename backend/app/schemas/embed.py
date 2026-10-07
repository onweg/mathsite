from typing import Literal

from pydantic import BaseModel, Field


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    kind: Literal["doc", "query"] = "query"


class EmbedResponse(BaseModel):
    embedding: list[float]
    dim: int
