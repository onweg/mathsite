from __future__ import annotations

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
