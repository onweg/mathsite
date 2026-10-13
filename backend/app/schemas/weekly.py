from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class WeeklyTaskDTO(BaseModel):
    id: str
    title: str
    body_md: str
    answer_md: str
    is_published: bool


class WeeklyTaskPublicDTO(BaseModel):
    """Для публики — без ответа."""

    id: str
    title: str
    body_md: str


class CreateWeeklyRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body_md: str = Field(min_length=1, max_length=4000)
    answer_md: str = Field(min_length=1, max_length=4000)


class UpdateWeeklyRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body_md: str | None = Field(default=None, max_length=4000)
    answer_md: str | None = Field(default=None, max_length=4000)


class GenerateWeeklyRequest(BaseModel):
    """source_key — конкретный учебник или загруженный материал; None = искать по всем."""

    topic: str = Field(min_length=2, max_length=200)
    source_key: str | None = Field(default=None, max_length=64)
    level: Literal["school", "olympiad", "hard"] = "olympiad"
