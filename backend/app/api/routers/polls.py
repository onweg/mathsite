"""Публичные эндпоинты опросов: список открытых + ответ ученика."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import (
    client_ip,
    get_current_student,
    get_optional_student,
    get_polls_service,
    get_rate_limiter,
)
from app.core.errors import Conflict, RateLimited
from app.domain.poll.types import Poll, PollAnswer
from app.domain.student.types import Student
from app.infrastructure.ratelimit.base import RateLimiter
from app.schemas.poll import (
    AnswerPollRequest,
    PollAnswerDTO,
    PollDTO,
    PollOptionDTO,
)
from app.services.polls_service import PollsService

router = APIRouter(prefix="/polls", tags=["polls"])


def poll_dto(p: Poll, answered: bool = False) -> PollDTO:
    return PollDTO(
        id=str(p.id),
        title=p.title,
        question_md=p.question_md,
        kind=p.kind,
        multiple=p.multiple,
        allow_comment=p.allow_comment,
        options=[
            PollOptionDTO(id=str(o.id), position=o.position, text=o.text)
            for o in p.options
        ],
        answered=answered,
    )


def answer_dto(a: PollAnswer) -> PollAnswerDTO:
    return PollAnswerDTO(
        id=str(a.id),
        poll_id=str(a.poll_id),
        option_ids=[str(o) for o in a.option_ids],
        comment=a.comment,
        created_at=a.created_at.isoformat(),
    )


@router.get("", response_model=list[PollDTO])
async def list_open(
    svc: Annotated[PollsService, Depends(get_polls_service)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
) -> list[PollDTO]:
    """Все открытые; отвеченные помечены флагом, прячет их фронт."""
    polls, answered = await svc.list_published(student)
    return [poll_dto(p, p.id in answered) for p in polls]


@router.post("/{poll_id}/answer", response_model=PollAnswerDTO)
async def answer(
    poll_id: UUID,
    body: AnswerPollRequest,
    svc: Annotated[PollsService, Depends(get_polls_service)],
    rate_limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    ip: Annotated[str, Depends(client_ip)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
) -> PollAnswerDTO:
    """Ответ ученика. Вошедший по QR может переголосовать — ответ перезапишется."""
    bucket = f"poll:{student.id}" if student else f"poll:anon:{ip}"
    ok, reason = rate_limiter.check(bucket)
    if not ok:
        raise RateLimited(reason)

    try:
        option_ids = [UUID(o) for o in body.option_ids]
    except ValueError as e:
        raise Conflict("неверный идентификатор варианта") from e

    saved = await svc.answer(
        poll_id,
        student=student,
        student_name=body.student_name,
        option_ids=option_ids,
        comment=body.comment,
    )
    return answer_dto(saved)


@router.get("/{poll_id}/mine", response_model=PollAnswerDTO | None)
async def mine(
    poll_id: UUID,
    svc: Annotated[PollsService, Depends(get_polls_service)],
    student: Annotated[Student, Depends(get_current_student)],
) -> PollAnswerDTO | None:
    """Свой ответ. Только для вошедших по QR — анонима между заходами не опознать."""
    a = await svc.my_answer(poll_id, student)
    return answer_dto(a) if a else None
