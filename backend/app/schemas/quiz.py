"""HTTP DTO для квизов."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChoiceDTO(BaseModel):
    id: str = Field(min_length=1, max_length=4)
    text: str = Field(min_length=1, max_length=400)


class QuizItemDTO(BaseModel):
    id: str | None = None
    position: int
    kind: Literal["mcq", "short"] = "mcq"
    question_md: str
    choices: list[ChoiceDTO] = Field(default_factory=list)
    correct_answer: str = ""
    explanation: str | None = None


class QuizItemPublicDTO(BaseModel):
    """Для публики — без correct_answer и explanation."""

    id: str
    position: int
    kind: Literal["mcq", "short"]
    question_md: str
    choices: list[ChoiceDTO]


class QuizSummaryDTO(BaseModel):
    id: str
    title: str
    topic: str
    difficulty: Literal["easy", "medium", "hard"]
    status: Literal["draft", "published"]
    source_key: str | None = None
    items_count: int = 0


class QuizDTO(BaseModel):
    id: str
    title: str
    topic: str
    difficulty: Literal["easy", "medium", "hard"]
    status: Literal["draft", "published"]
    source_key: str | None = None
    items: list[QuizItemDTO]


class QuizPublicDTO(BaseModel):
    id: str
    title: str
    topic: str
    difficulty: Literal["easy", "medium", "hard"]
    items: list[QuizItemPublicDTO]


# ---------- Запросы ----------


class GenerateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=2, max_length=200)
    source_key: Literal["textbook_8_algebra", "textbook_8_geometry", "olympiad"] | None = None
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    items_count: int = Field(default=5, ge=1, le=15)
    # true — генерировать по программе 8 класса, если в учебнике ничего не нашлось
    allow_without_source: bool = False


class CreateQuizRequest(BaseModel):
    """Квиз, собранный учителем вручную. items можно прислать сразу или потом."""

    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=200)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    items: list[QuizItemDTO] = Field(default_factory=list, max_length=20)


class UpdateMetaRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    topic: str | None = Field(default=None, max_length=200)


class UpdateItemRequest(BaseModel):
    question_md: str | None = None
    choices: list[ChoiceDTO] | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class ReplaceItemsRequest(BaseModel):
    # min_length нет: удаление последнего вопроса — законная операция,
    # публикацию пустого квиза всё равно не пропустит сервис
    items: list[QuizItemDTO] = Field(default_factory=list, max_length=20)


class AttemptRequest(BaseModel):
    student_name: str = Field(default="аноним", max_length=120)
    # answers: {item_id: выбранный choice id}
    answers: dict[str, str] = Field(min_length=1)


class AttemptResultDTO(BaseModel):
    attempt_id: str
    score: int
    total: int
    per_item: list[dict]


class AttemptSummaryDTO(BaseModel):
    id: str
    student_name: str
    student_id: str | None = None
    score: int
    total: int
    created_at: str
