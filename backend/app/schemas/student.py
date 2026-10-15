from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class StudentDTO(BaseModel):
    id: str
    name: str
    class_label: str
    qr_token: str
    note: str | None = None


class StudentPublicDTO(BaseModel):
    """Для самого ученика через /students/me — без qr_token."""

    id: str
    name: str
    class_label: str


class ClassSummaryDTO(BaseModel):
    class_label: str
    count: int


class CreateStudentRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    class_label: str = Field(default="", max_length=40)
    note: str | None = Field(default=None, max_length=400)


class UpdateStudentRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    class_label: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=400)


class BulkImportTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50000)
    default_class_label: str = Field(default="", max_length=40)


class ImportRowErrorDTO(BaseModel):
    line: int
    source: str
    reason: str


class ImportResultDTO(BaseModel):
    created: int
    skipped_duplicates: int
    errors: list[ImportRowErrorDTO] = []


class ActivateRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class StudentAttemptDTO(BaseModel):
    id: str
    quiz_id: str
    quiz_title: str
    score: int
    total: int
    created_at: str


class StudentWeeklyDTO(BaseModel):
    """Отправка ученика по задаче недели — для его профиля."""

    id: str
    task_id: str
    task_title: str
    solution_md: str
    image_url: str | None
    status: Literal["new", "correct", "partial", "wrong"]
    teacher_comment: str | None
    created_at: str
