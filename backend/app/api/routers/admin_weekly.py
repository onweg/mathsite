"""Админ-эндпоинты задачи недели."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import (
    get_current_admin,
    get_weekly_service,
    get_weekly_submissions_service,
)
from app.domain.auth.types import User
from app.domain.weekly.types import WeeklySubmission, WeeklyTask
from app.schemas.weekly import (
    CreateWeeklyRequest,
    GenerateWeeklyRequest,
    RefineWeeklyRequest,
    ReviewSubmissionRequest,
    UpdateWeeklyRequest,
    WeeklySubmissionAdminDTO,
    WeeklyTaskDTO,
)
from app.services.weekly_service import WeeklyTaskService
from app.services.weekly_submissions_service import WeeklySubmissionsService

router = APIRouter(prefix="/admin/weekly", tags=["admin:weekly"])


def _dto(t: WeeklyTask, counts: tuple[int, int] = (0, 0)) -> WeeklyTaskDTO:
    return WeeklyTaskDTO(
        id=str(t.id),
        title=t.title,
        body_md=t.body_md,
        answer_md=t.answer_md,
        is_published=t.is_published,
        submissions_count=counts[0],
        new_submissions_count=counts[1],
    )


def _submission_dto(s: WeeklySubmission) -> WeeklySubmissionAdminDTO:
    return WeeklySubmissionAdminDTO(
        id=str(s.id),
        task_id=str(s.task_id),
        student_id=str(s.student_id) if s.student_id else None,
        student_name=s.student_name,
        class_label=s.class_label,
        solution_md=s.solution_md,
        image_url=f"/weekly/images/{s.image_filename}" if s.image_filename else None,
        status=s.status,
        teacher_comment=s.teacher_comment,
        created_at=s.created_at.isoformat(),
    )


@router.get("", response_model=list[WeeklyTaskDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
    subs: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
) -> list[WeeklyTaskDTO]:
    tasks = await svc.list()
    counts = await subs.counts()
    return [_dto(t, counts.get(t.id, (0, 0))) for t in tasks]


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


@router.post("/generate", response_model=WeeklyTaskDTO)
async def generate(
    body: GenerateWeeklyRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskDTO:
    """Черновик задачи недели от нейросети. Публикует учитель отдельной кнопкой."""
    task = await svc.generate(
        topic=body.topic,
        source_key=body.source_key,
        level=body.level,
        created_by=user.id,
        allow_without_source=body.allow_without_source,
        use_materials=body.use_materials,
        hint=body.hint,
    )
    return _dto(task)


@router.post("/{task_id}/refine", response_model=WeeklyTaskDTO)
async def refine(
    task_id: UUID,
    body: RefineWeeklyRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> WeeklyTaskDTO:
    """Доработать задачу по замечанию: условие и решение переписываются вместе."""
    task = await svc.refine(task_id, instruction=body.instruction, level=body.level)
    return _dto(task)


@router.patch(
    "/submissions/{submission_id}", response_model=WeeklySubmissionAdminDTO
)
async def review_submission(
    submission_id: UUID,
    body: ReviewSubmissionRequest,
    _: Annotated[User, Depends(get_current_admin)],
    subs: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
) -> WeeklySubmissionAdminDTO:
    """Вердикт учителя: верно / частично / неверно + комментарий ученику."""
    s = await subs.review(
        submission_id, status=body.status, teacher_comment=body.teacher_comment
    )
    return _submission_dto(s)


@router.delete("/submissions/{submission_id}", status_code=204, response_model=None)
async def delete_submission(
    submission_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    subs: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
) -> None:
    await subs.delete(submission_id)


@router.get("/{task_id}/submissions", response_model=list[WeeklySubmissionAdminDTO])
async def list_submissions(
    task_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    subs: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
) -> list[WeeklySubmissionAdminDTO]:
    """Непроверенные сверху, дальше по свежести."""
    return [_submission_dto(s) for s in await subs.list_for_task(task_id)]


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
