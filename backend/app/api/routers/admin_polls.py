"""Админ-эндпоинты опросов: CRUD, публикация, результаты."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import get_current_admin, get_polls_service
from app.api.routers.polls import poll_dto
from app.domain.auth.types import User
from app.domain.poll.types import Poll, PollResults
from app.schemas.poll import (
    CreatePollRequest,
    OptionTallyDTO,
    PollAdminDTO,
    PollCommentDTO,
    PollResultsDTO,
    UpdatePollRequest,
)
from app.services.polls_service import PollsService

router = APIRouter(prefix="/admin/polls", tags=["admin:polls"])


def _dto(p: Poll, answers: int = 0) -> PollAdminDTO:
    base = poll_dto(p)
    return PollAdminDTO(
        **base.model_dump(),
        is_published=p.is_published,
        answers_count=answers,
    )


def _results_dto(r: PollResults) -> PollResultsDTO:
    return PollResultsDTO(
        poll_id=str(r.poll_id),
        total_answers=r.total_answers,
        tallies=[
            OptionTallyDTO(
                option_id=str(t.option_id),
                text=t.text,
                position=t.position,
                votes=t.votes,
            )
            for t in r.tallies
        ],
        comments=[
            PollCommentDTO(
                id=str(a.id),
                student_name=a.student_name,
                class_label=a.class_label,
                comment=a.comment,
                created_at=a.created_at.isoformat(),
            )
            for a in r.comments
        ],
    )


@router.get("", response_model=list[PollAdminDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> list[PollAdminDTO]:
    polls = await svc.list()
    counts = await svc.counts()
    return [_dto(p, counts.get(p.id, 0)) for p in polls]


@router.post("", response_model=PollAdminDTO)
async def create(
    body: CreatePollRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> PollAdminDTO:
    poll = await svc.create(
        title=body.title,
        question_md=body.question_md,
        kind=body.kind,
        multiple=body.multiple,
        allow_comment=body.allow_comment,
        options=body.options,
        created_by=user.id,
    )
    return _dto(poll)


@router.get("/{poll_id}/results", response_model=PollResultsDTO)
async def results(
    poll_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> PollResultsDTO:
    return _results_dto(await svc.results(poll_id))


@router.get("/{poll_id}", response_model=PollAdminDTO)
async def get_one(
    poll_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> PollAdminDTO:
    return _dto(await svc.get(poll_id))


@router.patch("/{poll_id}", response_model=PollAdminDTO)
async def update(
    poll_id: UUID,
    body: UpdatePollRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> PollAdminDTO:
    poll = await svc.update(
        poll_id,
        title=body.title,
        question_md=body.question_md,
        multiple=body.multiple,
        allow_comment=body.allow_comment,
        options=body.options,
    )
    return _dto(poll)


@router.post("/{poll_id}/publish", response_model=PollAdminDTO)
async def publish(
    poll_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> PollAdminDTO:
    return _dto(await svc.publish(poll_id))


@router.post("/{poll_id}/unpublish", response_model=PollAdminDTO)
async def unpublish(
    poll_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> PollAdminDTO:
    return _dto(await svc.unpublish(poll_id))


@router.delete("/{poll_id}", status_code=204, response_model=None)
async def delete(
    poll_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[PollsService, Depends(get_polls_service)],
) -> None:
    await svc.delete(poll_id)
