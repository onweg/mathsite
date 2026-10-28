from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import client_ip, get_current_admin, get_optional_student
from app.core.errors import RateLimited
from app.domain.auth.types import User
from app.domain.student.types import Student
from app.schemas.analytics import ActivityPulse
from app.services.analytics_service import AnalyticsService

router = APIRouter(tags=['analytics'])


def get_analytics_service(request: Request) -> AnalyticsService:
    return AnalyticsService(request.app.state.analytics_repo)


@router.post('/analytics/pulse', status_code=204, response_model=None)
async def pulse(
    body: ActivityPulse,
    request: Request,
    svc: Annotated[AnalyticsService, Depends(get_analytics_service)],
    ip: Annotated[str, Depends(client_ip)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
) -> None:
    key = str(student.id) if student else f'anon:{ip}'
    ok, reason = request.app.state.analytics_limiter.check(key)
    if not ok:
        raise RateLimited(reason)
    await svc.pulse(**body.model_dump(), student_id=student.id if student else None)


@router.get('/admin/analytics')
async def report(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[AnalyticsService, Depends(get_analytics_service)],
    start: date | None = None,
    end: date | None = None,
    class_label: Annotated[str | None, Query(max_length=100)] = None,
    student_id: UUID | None = None,
) -> dict:
    return await svc.report(start=start, end=end, class_label=class_label, student_id=student_id)
