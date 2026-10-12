"""Материал учителя: загруженный PDF + его состояние индексации."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

MaterialStatus = Literal["pending", "indexing", "ready", "failed"]


@dataclass(frozen=True)
class Material:
    id: UUID
    slug: str
    title: str
    source_key: str
    filename: str
    status: MaterialStatus
    chunks_count: int
    error_message: str | None
    created_at: datetime
