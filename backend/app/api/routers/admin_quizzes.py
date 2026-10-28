"""Админ-эндпоинты квизов. Все требуют bearer-токен учителя."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import get_current_admin, get_quiz_service
from app.domain.auth.types import User
from app.domain.quiz.generation import looks_garbled
from app.domain.quiz.types import Choice, Quiz, QuizItem
from app.schemas.quiz import (
    AttemptSummaryDTO,
    CreateQuizRequest,
    GenerateRequest,
    QuizDTO,
    QuizAttemptsSummaryDTO,
    QuizItemDTO,
    QuizSummaryDTO,
    RefineRequest,
    ReplaceItemsRequest,
    SourceHitDTO,
    SourcePreviewDTO,
    SourcePreviewRequest,
    StudentAttemptSummaryDTO,
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


def _summary(quiz: Quiz, items_count: int) -> QuizSummaryDTO:
    return QuizSummaryDTO(
        id=str(quiz.id),
        title=quiz.title,
        topic=quiz.topic,
        difficulty=quiz.difficulty,
        status=quiz.status,
        source_key=quiz.source_key,
        items_count=items_count,
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
        allow_without_source=body.allow_without_source,
        use_materials=body.use_materials,
        hint=body.hint,
    )
    return _quiz_to_dto(quiz)


@router.post("/{quiz_id}/refine", response_model=QuizDTO)
async def refine(
    quiz_id: UUID,
    body: RefineRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    """Доработать черновик по замечанию: модель правит то, о чём просят."""
    quiz = await svc.refine(quiz_id, instruction=body.instruction)
    return _quiz_to_dto(quiz)


@router.post("/source-preview", response_model=SourcePreviewDTO)
async def source_preview(
    body: SourcePreviewRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> SourcePreviewDTO:
    """Что именно нашлось в учебнике по теме — до того, как тратить генерацию.

    Учителю видно, на какой материал обопрётся модель и много ли в нём
    формул, развалившихся при извлечении из PDF.
    """
    hits = await svc.find_source(topic=body.topic, source_key=body.source_key)
    out = [
        SourceHitDTO(
            source_key=h.source,
            page=h.page,
            similarity=h.similarity,
            text=h.text[:600],
            garbled=looks_garbled(h.text),
        )
        for h in hits
    ]
    return SourcePreviewDTO(hits=out, garbled_count=sum(1 for h in out if h.garbled))


def _items_from_dto(dtos) -> list[QuizItem]:
    return [
        QuizItem(
            id=None,
            position=i + 1,
            kind=it.kind,
            question_md=it.question_md,
            choices=[Choice(id=c.id, text=c.text) for c in it.choices],
            correct_answer=it.correct_answer,
            explanation=it.explanation,
        )
        for i, it in enumerate(dtos)
    ]


@router.post("", response_model=QuizDTO)
async def create(
    body: CreateQuizRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizDTO:
    """Квиз, собранный учителем вручную, без нейросети."""
    quiz = await svc.create(
        title=body.title,
        topic=body.topic,
        difficulty=body.difficulty,
        items=_items_from_dto(body.items),
        created_by=user.id,
    )
    return _quiz_to_dto(quiz)


@router.get("", response_model=list[QuizSummaryDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> list[QuizSummaryDTO]:
    quizzes = await svc.list()
    counts = await svc.items_counts()
    return [_summary(q, counts.get(q.id, 0)) for q in quizzes]


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
    quiz = await svc.replace_items(quiz_id, _items_from_dto(body.items))
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


@router.delete("/{quiz_id}", status_code=204, response_model=None)
async def delete(
    quiz_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> None:
    await svc.delete(quiz_id)


@router.get("/{quiz_id}/attempts", response_model=list[AttemptSummaryDTO])
async def list_attempts(
    quiz_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> list[AttemptSummaryDTO]:
    attempts = await svc.list_attempts(quiz_id)
    return [
        AttemptSummaryDTO(
            id=str(a.id),
            student_name=a.student_name,
            student_id=str(a.student_id) if a.student_id else None,
            score=a.score,
            total=a.total,
            created_at=a.created_at.isoformat(),
        )
        for a in attempts
    ]


@router.get("/{quiz_id}/attempts/summary", response_model=QuizAttemptsSummaryDTO)
async def attempts_summary(
    quiz_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[QuizService, Depends(get_quiz_service)],
) -> QuizAttemptsSummaryDTO:
    rows = await svc.attempts_summary(quiz_id)
    return QuizAttemptsSummaryDTO(
        total_attempts=sum(r.attempts_count for r in rows),
        anonymous_attempts=sum(r.attempts_count for r in rows if r.student_id is None),
        students=[
            StudentAttemptSummaryDTO(
                student_id=str(r.student_id),
                student_name=r.student_name,
                class_label=r.class_label,
                attempts_count=r.attempts_count,
                last_score=r.last_score,
                last_total=r.last_total,
                last_attempt_at=r.last_attempt_at.isoformat(),
            )
            for r in rows if r.student_id is not None
        ],
    )
