from datetime import date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from app.core.errors import Conflict
from app.infrastructure.repositories.analytics_repo import AnalyticsRepository

MOSCOW = ZoneInfo('Europe/Moscow')


def period_bounds(start: date | None, end: date | None) -> tuple[datetime, datetime]:
    """UI dates are inclusive, SQL bounds are [start, next day), Moscow time."""
    today = datetime.now(MOSCOW).date()
    end = end or today
    if start and start > end:
        raise Conflict('Начало периода должно быть не позже конца')
    if end > today:
        raise Conflict('Конец периода не может быть в будущем')
    return (
        datetime.combine(start or date(1970, 1, 1), time.min, MOSCOW),
        datetime.combine(end + timedelta(days=1), time.min, MOSCOW),
    )


class AnalyticsService:
    def __init__(self, repo: AnalyticsRepository):
        self._repo = repo

    async def pulse(self, *, id: UUID, visit_id: UUID, student_id: UUID | None,
                    page: str, active_seconds: int) -> None:
        await self._repo.pulse(id=id, visit_id=visit_id, student_id=student_id,
                               page=page, active_seconds=active_seconds)

    async def report(self, *, start: date | None, end: date | None,
                     class_label: str | None, student_id: UUID | None) -> dict:
        since, until = period_bounds(start, end)
        return await self._repo.report(since=since, until=until,
                                       class_label=class_label, student_id=student_id)
