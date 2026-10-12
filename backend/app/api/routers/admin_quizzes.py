"""Админ-эндпоинты квизов. Все требуют bearer-токен учителя."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import get_current_admin, get_quiz_service
from app.domain.auth.types import User
from app.domain.quiz.types import Choice, Quiz, QuizItem
from app.schemas.quiz import (
    GenerateRequest,
    QuizDTO,
    QuizItemDTO,
    QuizSummaryDTO,
    ReplaceItemsRequest,
    UpdateItemRequest,
    UpdateMetaRequest,
)
from app.services.quiz_service import QuizService

router = APIRouter(prefix="/admin/quizzes", tags=["admin:quizzes"])


def _item_to_dto(item: QuizItem) -> QuizItemDTO:
    return QuizItemDTO(
        id=str(item.id) if item.id else None,
        position=item.position,
        kind=item.kind,
        question_md=item.question_md,
        choices=[{"id": c.id, "text": c.text} for c in item.choices],  # type: ignore[list-item]
        correct_answer=item.correct_answer,
        explanation=item.explanation,
    )


def _quiz_to_dto(quiz: Quiz) -> QuizDTO:
    return QuizDTO(
        id=str(quiz.id),
        title=quiz.title,
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        status=quiz.status,
        source_key=quiz.source_key,
        items=[_item_to_dto(i) for i in quiz.items],
    )


def _summary(quiz: Quiz) -> QuizSummaryDTO:
    return QuizSummaryDTO(
        id=str(quiz.id),
        title=quiz.title,
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        status=quiz.status,
        source_key=quiz.source_key,
        items_count=len(quiz.items),
    )


@router.post("/generate", response_model=QuizDTO)
async def generate(
    body: GenerateRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    quiz = await svc.generate(
        title=body.title,
        topic=body.topic,
        source_key=body.source_key,
        difficulty=body.difficulty,
        items_count=body.items_count,
        created_by=user.id,
    )
    return _quiz_to_dto(quiz)


@router.get("", response_model=list[QuizSummaryDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> list[QuizSummaryDTO]:
    quizzes = await svc.list()
    return [_summary(q) for q in quizzes]


@router.get("/{quiz_id}", response_model=QuizDTO)
async def get_one(
    quiz_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    return _quiz_to_dto(await svc.get(quiz_id))


@router.patch("/{quiz_id}", response_model=QuizDTO)
async def update_meta(
    quiz_id: UUID,
    body: UpdateMetaRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    quiz = await svc.update_meta(quiz_id, title=body.title, topic=body.topic)
    return _quiz_to_dto(quiz)


@router.patch("/{quiz_id}/items/{item_id}", response_model=QuizDTO)
async def update_item(
    quiz_id: UUID,
    item_id: UUID,
    body: UpdateItemRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    choices = (
        [Choice(id=c.id, text=c.text) for c in body.choices] if body.choices is not None else None
    )
    quiz = await svc.update_item(
        quiz_id,
        item_id,
        question_md=body.question_md,
        choices=choices,
        correct_answer=body.correct_answer,
        explanation=body.explanation,
    )
    return _quiz_to_dto(quiz)


@router.put("/{quiz_id}/items", response_model=QuizDTO)
async def replace_items(
    quiz_id: UUID,
    body: ReplaceItemsRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    items = [
        QuizItem(
            id=None,
            position=i + 1,
            kind=it.kind,
            question_md=it.question_md,
            choices=[Choice(id=c.id, text=c.text) for c in it.choices],
            correct_answer=it.correct_answer,
            explanation=it.explanation,
        )
        for i, it in enumerate(body.items)
    ]
    quiz = await svc.replace_items(quiz_id, items)
    return _quiz_to_dto(quiz)


@router.post("/{quiz_id}/publish", response_model=QuizDTO)
async def publish(
    quiz_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    return _quiz_to_dto(await svc.publish(quiz_id))


@router.post("/{quiz_id}/unpublish", response_model=QuizDTO)
async def unpublish(
    quiz_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    return _quiz_to_dto(await svc.unpublish(quiz_id))


@router.delete("/{quiz_id}", status_code=204)
async def delete(
    quiz_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> None:
    await svc.delete(quiz_id)
