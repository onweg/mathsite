"""Публичный эндпоинт задачи недели: возвращает последнюю опубликованную."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_weekly_service
from app.schemas.weekly import WeeklyTaskPublicDTO
from app.services.weekly_service import WeeklyTaskService

router = APIRouter(prefix="/weekly", tags=["weekly"])


@router.get("", response_model=WeeklyTaskPublicDTO | None)
async def current(
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskPublicDTO | None:
    task = await svc.current()
    if not task:
        return None
    return WeeklyTaskPublicDTO(id=str(task.id), title=task.title, body_md=task.body_md)
