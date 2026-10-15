"""Опрос учеников: «какую тему повторить», «какой формат урока нравится».

Два вида. `choice` — с вариантами ответа (один или несколько на выбор),
`text` — только свободный ответ. У опроса с вариантами можно дополнительно
разрешить комментарий.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal
from uuid import UUID

PollKind = Literal["choice", "text"]


@dataclass(frozen=True)
class PollOption:
    id: UUID | None
    position: int
    text: str


@dataclass(frozen=True)
class Poll:
    id: UUID | None
    title: str
    question_md: str
    kind: PollKind
    multiple: bool
    allow_comment: bool
    is_published: bool
    options: list[PollOption] = field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass(frozen=True)
class PollAnswer:
    id: UUID
    poll_id: UUID
    student_id: UUID | None
    student_name: str
    class_label: str
    option_ids: list[UUID]
    comment: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class OptionTally:
    """Сколько голосов собрал вариант."""

    option_id: UUID
    text: str
    position: int
    votes: int


@dataclass(frozen=True)
class PollResults:
    poll_id: UUID
    total_answers: int
    tallies: list[OptionTally]
    comments: list[PollAnswer]
