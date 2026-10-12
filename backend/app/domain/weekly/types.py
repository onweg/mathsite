"""Задача недели: условие + ответ, одна активная публикуется ученикам."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True)
class WeeklyTask:
    id: UUID | None
    title: str
    body_md: str
    answer_md: str
    is_published: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
