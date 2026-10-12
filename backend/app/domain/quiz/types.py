"""Доменные типы для квизов.

Квиз живёт в двух состояниях: draft (черновик, сгенерирован ИИ, учитель редактирует)
и published (виден ученикам). Проверка ответа — строгое сравнение с correct_answer.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal
from uuid import UUID

Difficulty = Literal["easy", "medium", "hard"]
QuizStatus = Literal["draft", "published"]
ItemKind = Literal["mcq", "short"]


@dataclass(frozen=True)
class Choice:
    """Вариант ответа для MCQ. id — короткий слаг (a/b/c/d), text — markdown."""

    id: str
    text: str


@dataclass(frozen=True)
class QuizItem:
    id: UUID | None
    position: int
    kind: ItemKind
    question_md: str
    choices: list[Choice] = field(default_factory=list)
    correct_answer: str = ""
    explanation: str | None = None


@dataclass(frozen=True)
class Quiz:
    id: UUID | None
    title: str
    topic: str
    source_key: str | None
    difficulty: Difficulty
    status: QuizStatus
    created_at: datetime | None = None
    updated_at: datetime | None = None
    items: list[QuizItem] = field(default_factory=list)


@dataclass(frozen=True)
class AttemptResult:
    """Результат автопроверки прохождения."""

    score: int
    total: int
    per_item: list[dict]  # [{"item_id": ..., "correct": bool, "expected": ..., "got": ...}]
