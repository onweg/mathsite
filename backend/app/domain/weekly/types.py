"""Задача недели: условие + ответ, одна активная публикуется ученикам."""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
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


SubmissionStatus = Literal["new", "correct", "partial", "wrong"]


@dataclass(frozen=True)
class WeeklySubmission:
    """Решение ученика по задаче недели: текст, фото или и то и другое.

    status == 'new' — учитель ещё не смотрел. Остальные три ставит он сам.
    student_id пуст у анонимных отправок (сайт открыт, вход по QR необязателен).
    """

    id: UUID
    task_id: UUID
    student_id: UUID | None
    student_name: str
    class_label: str
    solution_md: str
    image_filename: str | None
    status: SubmissionStatus
    teacher_comment: str | None
    created_at: datetime
    updated_at: datetime
    reviewed_at: datetime | None
