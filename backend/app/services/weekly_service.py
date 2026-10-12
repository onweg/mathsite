"""WeeklyTaskService — use case управления задачей недели.

Инвариант: одновременно опубликована максимум одна задача недели — последняя,
на которой учитель нажал «опубликовать». Публикация новой автоматически снимает
прежние (всё равно показывается только latest_published).
"""

from __future__ import annotations

from uuid import UUID

from app.core.errors import NotFound
from app.domain.weekly.types import WeeklyTask
from app.infrastructure.repositories.weekly_repo import WeeklyTasksRepository


class WeeklyTaskService:
    def __init__(self, repo: WeeklyTasksRepository):
        self._repo = repo

    async def list(self) -> list[WeeklyTask]:
        return await self._repo.list()

    async def get(self, task_id: UUID) -> WeeklyTask:
        task = await self._repo.get(task_id)
        if not task:
            raise NotFound(f"задача {task_id} не найдена")
        return task

    async def current(self) -> WeeklyTask | None:
        return await self._repo.get_latest_published()

    async def create(
        self, *, title: str, body_md: str, answer_md: str, created_by: UUID
    ) -> WeeklyTask:
        return await self._repo.create(title.strip(), body_md.strip(), answer_md.strip(), created_by)

    async def update(
        self,
        task_id: UUID,
        *,
        title: str | None = None,
        body_md: str | None = None,
        answer_md: str | None = None,
    ) -> WeeklyTask:
        await self._repo.update(
            task_id,
            title=title.strip() if title else None,
            body_md=body_md.strip() if body_md else None,
            answer_md=answer_md.strip() if answer_md else None,
        )
        return await self.get(task_id)

    async def publish(self, task_id: UUID) -> WeeklyTask:
        await self._repo.update(task_id, is_published=True)
        return await self.get(task_id)

    async def unpublish(self, task_id: UUID) -> WeeklyTask:
        await self._repo.update(task_id, is_published=False)
        return await self.get(task_id)

    async def delete(self, task_id: UUID) -> None:
        await self._repo.delete(task_id)
