"""Админ-эндпоинты задачи недели."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import get_current_admin, get_weekly_service
from app.domain.auth.types import User
from app.domain.weekly.types import WeeklyTask
from app.schemas.weekly import CreateWeeklyRequest, UpdateWeeklyRequest, WeeklyTaskDTO
from app.services.weekly_service import WeeklyTaskService

router = APIRouter(prefix="/admin/weekly", tags=["admin:weekly"])


def _dto(t: WeeklyTask) -> WeeklyTaskDTO:
    return WeeklyTaskDTO(
        id=str(t.id),
        title=t.title,
        body_md=t.body_md,
        answer_md=t.answer_md,
        is_published=t.is_published,
    )


@router.get("", response_model=list[WeeklyTaskDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> list[WeeklyTaskDTO]:
    tasks = await svc.list()
    return [_dto(t) for t in tasks]


@router.post("", response_model=WeeklyTaskDTO)
async def create(
    body: CreateWeeklyRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskDTO:
    task = await svc.create(
        title=body.title,
        body_md=body.body_md,
        answer_md=body.answer_md,
        created_by=user.id,
    )
    return _dto(task)


@router.get("/{task_id}", response_model=WeeklyTaskDTO)
async def get_one(
    task_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskDTO:
    return _dto(await svc.get(task_id))


@router.patch("/{task_id}", response_model=WeeklyTaskDTO)
async def update(
    task_id: UUID,
    body: UpdateWeeklyRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskDTO:
    task = await svc.update(
        task_id,
        title=body.title,
        body_md=body.body_md,
        answer_md=body.answer_md,
    )
    return _dto(task)


@router.post("/{task_id}/publish", response_model=WeeklyTaskDTO)
async def publish(
    task_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskDTO:
    return _dto(await svc.publish(task_id))


@router.post("/{task_id}/unpublish", response_model=WeeklyTaskDTO)
async def unpublish(
    task_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskDTO:
    return _dto(await svc.unpublish(task_id))


@router.delete("/{task_id}", status_code=204, response_model=None)
async def delete(
    task_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> None:
    await svc.delete(task_id)
