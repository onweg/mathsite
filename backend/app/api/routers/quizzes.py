"""Публичные эндпоинты квизов: список опубликованных + прохождение."""

from __future__ import annotations

import random
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import get_optional_student, get_quiz_service
from app.domain.quiz.types import Quiz
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
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        status=quiz.status,
        source_key=quiz.source_key,
        items_count=items_count,
        attempted=attempted,
    )


def _public(quiz: Quiz) -> QuizPublicDTO:
    """Варианты отдаём в случайном порядке — на каждое открытие свой.

    Перемешиваем только порядок в списке, id вариантов остаются при своих
    текстах. Поэтому проверка ответа не меняется: ученик присылает id, а он
    по-прежнему сравнивается с correct_answer. Подписи «а/б/в/г» фронт рисует
    по позиции в списке, а не по id.
    """
    return QuizPublicDTO(
        id=str(quiz.id),
        title=quiz.title,
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        items=[
            {  # type: ignore[list-item]
                "id": str(it.id),
                "position": it.position,
                "kind": it.kind,
                "question_md": it.question_md,
                "choices": [
                    {"id": c.id, "text": c.text}
                    for c in random.sample(it.choices, len(it.choices))
                ],
            }
            for it in quiz.items
        ],
    )


@router.get("", response_model=list[QuizSummaryDTO])
async def list_published(
    svc: Annotated[QuizService, Depends(get_quiz_service)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
) -> list[QuizSummaryDTO]:
    """Все опубликованные; пройденные помечены флагом, прячет их фронт."""
    quizzes, done = await svc.list_published_for(student)
    counts = await svc.items_counts()
    return [_summary(q, counts.get(q.id, 0), q.id in done) for q in quizzes]


@router.get("/{quiz_id}", response_model=QuizPublicDTO)
async def get_published(
    quiz_id: UUID,
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizPublicDTO:
    quiz = await svc.get(quiz_id)
    return _public(quiz)


@router.post("/{quiz_id}/attempt", response_model=AttemptResultDTO)
async def attempt(
    quiz_id: UUID,
    body: AttemptRequest,
    svc: Annotated[QuizService, Depends(get_quiz_service)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
) -> AttemptResultDTO:
    result, attempt_id = await svc.attempt(
        quiz_id,
        student_name=body.student_name,
        student=student,
        answers=body.answers,
    )
    return AttemptResultDTO(
        attempt_id=str(attempt_id),
        score=result.score,
        total=result.total,
        per_item=result.per_item,
    )
