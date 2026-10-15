from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PollOptionDTO(BaseModel):
    id: str
    position: int
    text: str


class PollDTO(BaseModel):
    """Опрос для ученика: без результатов, их показывает только учитель."""

    id: str
    title: str
    question_md: str
    kind: Literal["choice", "text"]
    multiple: bool
    allow_comment: bool
    options: list[PollOptionDTO] = []


class PollAdminDTO(PollDTO):
    is_published: bool
    answers_count: int = 0


class CreatePollRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    question_md: str = Field(default="", max_length=2000)
    kind: Literal["choice", "text"] = "choice"
    multiple: bool = False
    allow_comment: bool = True
    options: list[str] = Field(default_factory=list, max_length=10)


class UpdatePollRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    question_md: str | None = Field(default=None, max_length=2000)
    multiple: bool | None = None
    allow_comment: bool | None = None
    options: list[str] | None = Field(default=None, max_length=10)


class AnswerPollRequest(BaseModel):
    option_ids: list[str] = Field(default_factory=list, max_length=10)
    comment: str = Field(default="", max_length=1000)
    student_name: str = Field(default="", max_length=120)


class PollAnswerDTO(BaseModel):
    """Свой ответ — чтобы ученик видел, что он уже выбрал."""

    id: str
    poll_id: str
    option_ids: list[str]
    comment: str
    created_at: str


class OptionTallyDTO(BaseModel):
    option_id: str
    text: str
    position: int
    votes: int


class PollCommentDTO(BaseModel):
    id: str
    student_name: str
    class_label: str
    comment: str
    created_at: str


class PollResultsDTO(BaseModel):
    poll_id: str
    total_answers: int
    tallies: list[OptionTallyDTO]
    comments: list[PollCommentDTO]
