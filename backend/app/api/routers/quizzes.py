"""Публичные эндпоинты квизов: список опубликованных + прохождение."""

from __future__ import annotations

import random
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.deps import get_optional_student, get_current_student, get_quiz_service
from app.core.config import settings
from app.core.errors import Conflict
from app.domain.quiz.choice_tokens import choice_token
from app.domain.quiz.types import Quiz, QuizTrack
from app.domain.student.types import Student
from app.schemas.quiz import (
    AttemptRequest,
    AttemptResultDTO,
    QuizPublicDTO,
    QuizSummaryDTO,
)
from app.services.quiz_service import QuizService

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


def _summary(quiz: Quiz, items_count: int, attempted: bool = False) -> QuizSummaryDTO:
    return QuizSummaryDTO(
        id=str(quiz.id),
        title=quiz.title,
        track=quiz.track,
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        status=quiz.status,
        source_key=quiz.source_key,
        items_count=items_count,
        attempted=attempted,
    )


def _public(quiz: Quiz) -> QuizPublicDTO:
    """Варианты отдаём в случайном порядке — на каждое открытие свой.

    Авторские id заменяем непрозрачными идентификаторами, чтобы исходные
    a/b/c не выдавали закономерность расположения правильных вариантов.
    """
    return QuizPublicDTO(
        id=str(quiz.id),
        title=quiz.title,
        track=quiz.track,
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        items=[
            {  # type: ignore[list-item]
                "id": str(it.id),
                "position": it.position,
                "kind": it.kind,
                "question_md": it.question_md,
                "choices": [
                    {"id": choice_token(settings.jwt_secret, quiz.id, it.id, c.id), "text": c.text}
                    for c in random.sample(it.choices, len(it.choices))
                ],
            }
            for it in quiz.items
        ],
    )


@router.get("", response_model=list[QuizSummaryDTO])
async def list_published(
    response: Response,
    svc: Annotated[QuizService, Depends(get_quiz_service)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
    track: QuizTrack = "general",
) -> list[QuizSummaryDTO]:
    """Опубликованные тесты выбранного раздела, с проверкой QR-профиля."""
    response.headers["Cache-Control"] = "private, no-store"
    quizzes, done = await svc.list_published_for(student)
    counts = await svc.items_counts()
    return [_summary(q, counts.get(q.id, 0), q.id in done) for q in quizzes if q.track == track]


@router.get("/{quiz_id}", response_model=QuizPublicDTO)
async def get_published(
    response: Response,
    quiz_id: UUID,
    svc: Annotated[QuizService, Depends(get_quiz_service)],
    student: Annotated[Student, Depends(get_current_student)],
) -> QuizPublicDTO:
    response.headers["Cache-Control"] = "private, no-store"
    quiz = await svc.get_published_for(quiz_id, student)
    return _public(quiz)


@router.post("/{quiz_id}/attempt", response_model=AttemptResultDTO)
async def attempt(
    response: Response,
    quiz_id: UUID,
    body: AttemptRequest,
    svc: Annotated[QuizService, Depends(get_quiz_service)],
    student: Annotated[Student, Depends(get_current_student)],
) -> AttemptResultDTO:
    response.headers["Cache-Control"] = "private, no-store"
    quiz = await svc.get_published_for(quiz_id, student)
    answers = dict(body.answers)
    for item in quiz.items:
        if item.kind == "mcq" and str(item.id) in answers:
            options = {choice_token(settings.jwt_secret, quiz.id, item.id, c.id): c.id for c in item.choices}
            value = options.get(answers[str(item.id)])
            if value is None:
                raise Conflict("варианты теста изменились; открой тест заново")
            answers[str(item.id)] = value
    result, attempt_id = await svc.attempt(
        quiz,
        student_name=body.student_name,
        student=student,
        answers=answers,
    )
    return AttemptResultDTO(
        attempt_id=str(attempt_id),
        score=result.score,
        total=result.total,
        per_item=result.per_item,
    )
