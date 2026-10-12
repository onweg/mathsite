from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class MaterialDTO(BaseModel):
    id: str
    slug: str
    title: str
    source_key: str
    status: Literal["pending", "indexing", "ready", "failed"]
    chunks_count: int
    error_message: str | None = None


class MaterialPublicDTO(BaseModel):
    """Для публики (ученик): минимум данных для списка топиков."""

    id: str
    title: str
    source_key: str
    chunks_count: int


class UploadResponse(BaseModel):
    material: MaterialDTO


class UpdateMaterialRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
