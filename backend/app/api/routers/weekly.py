"""Публичные эндпоинты задач недели: открытые задачи + приём решений."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import (
    client_ip,
    get_current_student,
    get_optional_student,
    get_rate_limiter,
    get_weekly_service,
    get_weekly_submissions_service,
)
from app.core.errors import Conflict, RateLimited
from app.domain.student.types import Student
from app.domain.weekly.types import WeeklySubmission
from app.infrastructure.ratelimit.base import RateLimiter
from app.schemas.weekly import (
    HonorEntryDTO,
    WeeklySubmissionDTO,
    WeeklyTaskPublicDTO,
)
from app.services.weekly_service import WeeklyTaskService
from app.services.weekly_submissions_service import (
    MAX_IMAGE_BYTES,
    WeeklySubmissionsService,
    media_type_for,
)

router = APIRouter(prefix="/weekly", tags=["weekly"])


def submission_dto(s: WeeklySubmission) -> WeeklySubmissionDTO:
    return WeeklySubmissionDTO(
        id=str(s.id),
        task_id=str(s.task_id),
        student_name=s.student_name,
        class_label=s.class_label,
        solution_md=s.solution_md,
        image_url=f"/weekly/images/{s.image_filename}" if s.image_filename else None,
        status=s.status,
        teacher_comment=s.teacher_comment,
        created_at=s.created_at.isoformat(),
    )


@router.get("", response_model=list[WeeklyTaskPublicDTO])
async def published(
    svc: Annotated[WeeklyTaskService, Depends(get_weekly_service)],
) -> list[WeeklyTaskPublicDTO]:
    """Все задачи, которые учитель держит на сайте, в порядке добавления."""
    return [
        WeeklyTaskPublicDTO(id=str(t.id), title=t.title, body_md=t.body_md)
        for t in await svc.published()
    ]


# Регистрируется раньше «/{task_id}/...», чтобы «images» не ушло в разбор UUID.
@router.get("/images/{filename}")
async def image(
    filename: str,
    svc: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
) -> FileResponse:
    """Фото решения. Имя файла — 32 случайных hex-символа, это и есть пропуск:
    подписать <img src> Bearer-токеном браузер не умеет."""
    path = svc.image_path(filename)
    return FileResponse(
        path,
        media_type=media_type_for(filename),
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/{task_id}/submissions", response_model=WeeklySubmissionDTO)
async def submit(
    task_id: UUID,
    svc: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
    rate_limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    ip: Annotated[str, Depends(client_ip)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
    solution_md: Annotated[str, Form()] = "",
    student_name: Annotated[str, Form()] = "",
    file: Annotated[UploadFile | None, File()] = None,
) -> WeeklySubmissionDTO:
    """Решение ученика: текст, фото тетради или и то и другое.

    Лимит считаем по ученику, если он вошёл по QR. У анонимов остаётся IP —
    весь класс за школьным NAT делит одну корзину, поэтому ученикам лучше
    заходить по своим QR-кодам.
    """
    bucket = f"weekly_submit:{student.id}" if student else f"weekly_submit:anon:{ip}"
    ok, reason = rate_limiter.check(bucket)
    if not ok:
        raise RateLimited(reason)

    data = await file.read() if file is not None and file.filename else None
    if data is not None and len(data) > MAX_IMAGE_BYTES:
        raise Conflict(f"фото больше {MAX_IMAGE_BYTES // 1024 // 1024} МБ")

    submission = await svc.submit(
        task_id,
        student=student,
        student_name=student_name,
        solution_md=solution_md,
        image=data,
        image_name=file.filename if file is not None else None,
    )
    return submission_dto(submission)


@router.get("/{task_id}/submissions/mine", response_model=WeeklySubmissionDTO | None)
async def mine(
    task_id: UUID,
    svc: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
    student: Annotated[Student, Depends(get_current_student)],
) -> WeeklySubmissionDTO | None:
    """Своё решение и вердикт учителя. Только для вошедших по QR —
    анонимную отправку опознать между заходами нечем."""
    s = await svc.mine(task_id, student)
    return submission_dto(s) if s else None


@router.get("/{task_id}/honor", response_model=list[HonorEntryDTO])
async def honor(
    task_id: UUID,
    svc: Annotated[WeeklySubmissionsService, Depends(get_weekly_submissions_service)],
) -> list[HonorEntryDTO]:
    """Доска почёта: кому учитель поставил «верно»."""
    return [
        HonorEntryDTO(student_name=s.student_name, class_label=s.class_label)
        for s in await svc.honor_board(task_id)
    ]
