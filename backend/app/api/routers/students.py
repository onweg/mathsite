"""Публичный API для учеников: активация через QR-токен, профиль, выход."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.api.deps import (
    STUDENT_COOKIE_NAME,
    STUDENT_COOKIE_MAX_AGE,
    client_ip,
    get_current_student,
    get_quiz_service,
    get_rate_limiter,
    get_students_service,
    get_weekly_submissions_service,
    is_prod,
)
from app.core.errors import NotAuthenticated, RateLimited
from app.domain.student.types import Student
from app.infrastructure.ratelimit.base import RateLimiter
from app.schemas.student import (
    ActivateRequest,
    StudentAttemptDTO,
    StudentPublicDTO,
    StudentWeeklyDTO,
)
from app.services.quiz_service import QuizService
from app.services.students_service import StudentsService
from app.services.weekly_submissions_service import WeeklySubmissionsService

router = APIRouter(prefix="/students", tags=["students"])


def _public_dto(s: Student) -> StudentPublicDTO:
    return StudentPublicDTO(id=str(s.id), name=s.name, class_label=s.class_label)


@router.post("/activate", response_model=StudentPublicDTO)
async def activate(
    body: ActivateRequest,
    response: Response,
    svc: Annotated[StudentsService, Depends(get_students_service)],
    rate_limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    ip: Annotated[str, Depends(client_ip)],
) -> StudentPublicDTO:
    """Проверяем токен → ставим HTTP-only cookie → возвращаем профиль."""
    ok, reason = rate_limiter.check(f"activate:{ip}")
    if not ok:
        raise RateLimited(reason)

    student = await svc.by_token(body.token)
    if not student:
        raise NotAuthenticated("токен не распознан")

    response.set_cookie(
        key=STUDENT_COOKIE_NAME,
        value=student.qr_token,
        max_age=STUDENT_COOKIE_MAX_AGE,
        httponly=True,
        secure=is_prod(),
        samesite="lax",
        path="/",
    )
    return _public_dto(student)


@router.get("/me", response_model=StudentPublicDTO)
async def me(
    student: Annotated[Student, Depends(get_current_student)],
) -> StudentPublicDTO:
    return _public_dto(student)


@router.post("/logout", status_code=204, response_model=None)
async def logout(response: Response) -> None:
    response.delete_cookie(STUDENT_COOKIE_NAME, path="/")


@router.get("/me/attempts", response_model=list[StudentAttemptDTO])
async def my_attempts(
    student: Annotated[Student, Depends(get_current_student)],
    quizzes: Annotated[QuizService, Depends(get_quiz_service)],
) -> list[StudentAttemptDTO]:
    attempts = await quizzes.list_attempts_by_student(student.id)
    return [
        StudentAttemptDTO(
            id=str(a.id),
            quiz_id=str(a.quiz_id),
            quiz_title=a.quiz_title,
            score=a.score,
            total=a.total,
            created_at=a.created_at.isoformat(),
        )
        for a in attempts
    ]


@router.get("/me/weekly", response_model=list[StudentWeeklyDTO])
async def my_weekly(
    student: Annotated[Student, Depends(get_current_student)],
    weekly: Annotated[
        WeeklySubmissionsService, Depends(get_weekly_submissions_service)
    ],
) -> list[StudentWeeklyDTO]:
    """История решений задачи недели: что отправил и как проверил учитель."""
    rows = await weekly.list_for_student(student.id)
    return [
        StudentWeeklyDTO(
            id=str(s.id),
            task_id=str(s.task_id),
            task_title=title,
            solution_md=s.solution_md,
            image_url=f"/weekly/images/{s.image_filename}" if s.image_filename else None,
            status=s.status,
            teacher_comment=s.teacher_comment,
            created_at=s.created_at.isoformat(),
        )
        for s, title in rows
    ]
