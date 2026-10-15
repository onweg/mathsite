from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class WeeklyTaskDTO(BaseModel):
    id: str
    title: str
    body_md: str
    answer_md: str
    is_published: bool
    submissions_count: int = 0
    new_submissions_count: int = 0


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


# ---------- решения учеников ----------


class WeeklySubmissionDTO(BaseModel):
    """Что видит сам ученик про свою отправку."""

    id: str
    task_id: str
    student_name: str
    class_label: str
    solution_md: str
    image_url: str | None
    status: Literal["new", "correct", "partial", "wrong"]
    teacher_comment: str | None
    created_at: str


class WeeklySubmissionAdminDTO(WeeklySubmissionDTO):
    """То же плюс привязка к ученику — для учителя."""

    student_id: str | None


class HonorEntryDTO(BaseModel):
    """Доска почёта: только имя и класс, без текста решения."""

    student_name: str
    class_label: str


class ReviewSubmissionRequest(BaseModel):
    status: Literal["new", "correct", "partial", "wrong"] | None = None
    teacher_comment: str | None = Field(default=None, max_length=1000)
