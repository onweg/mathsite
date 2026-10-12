"""SQL для таблицы weekly_tasks."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.domain.weekly.types import WeeklyTask


class WeeklyTasksRepository(Protocol):
    async def list(self) -> list[WeeklyTask]: ...

    async def get(self, task_id: UUID) -> WeeklyTask | None: ...

    async def get_latest_published(self) -> WeeklyTask | None: ...

    async def create(
        self, title: str, body_md: str, answer_md: str, created_by: UUID
    ) -> WeeklyTask: ...

    async def update(
        self,
        task_id: UUID,
        *,
        title: str | None = None,
        body_md: str | None = None,
        answer_md: str | None = None,
        is_published: bool | None = None,
    ) -> None: ...

    async def delete(self, task_id: UUID) -> None: ...


def _row_to_task(row) -> WeeklyTask:
    return WeeklyTask(
        id=row[0],
        title=row[1],
        body_md=row[2],
        answer_md=row[3],
        is_published=row[4],
        created_at=row[5],
        updated_at=row[6],
    )


_SELECT = (
    "SELECT id, title, body_md, answer_md, is_published, created_at, updated_at "
    "FROM weekly_tasks"
)


class PgWeeklyTasksRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def list(self) -> list[WeeklyTask]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} ORDER BY created_at DESC")
            rows = await cur.fetchall()
        return [_row_to_task(r) for r in rows]

    async def get(self, task_id: UUID) -> WeeklyTask | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} WHERE id = %s", (task_id,))
            row = await cur.fetchone()
        return _row_to_task(row) if row else None

    async def get_latest_published(self) -> WeeklyTask | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"{_SELECT} WHERE is_published = TRUE ORDER BY created_at DESC LIMIT 1"
            )
            row = await cur.fetchone()
        return _row_to_task(row) if row else None

    async def create(
        self, title: str, body_md: str, answer_md: str, created_by: UUID
    ) -> WeeklyTask:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO weekly_tasks (title, body_md, answer_md, created_by)
                VALUES (%s, %s, %s, %s)
                RETURNING id, title, body_md, answer_md, is_published, created_at, updated_at
                """,
                (title, body_md, answer_md, created_by),
            )
            row = await cur.fetchone()
            await conn.commit()
        return _row_to_task(row)

    async def update(
        self,
        task_id: UUID,
        *,
        title: str | None = None,
        body_md: str | None = None,
        answer_md: str | None = None,
        is_published: bool | None = None,
    ) -> None:
        sets: list[str] = []
        params: list[object] = []
        if title is not None:
            sets.append("title = %s")
            params.append(title)
        if body_md is not None:
            sets.append("body_md = %s")
            params.append(body_md)
        if answer_md is not None:
            sets.append("answer_md = %s")
            params.append(answer_md)
        if is_published is not None:
            sets.append("is_published = %s")
            params.append(is_published)
        if not sets:
            return
        sets.append("updated_at = NOW()")
        params.append(task_id)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"UPDATE weekly_tasks SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                params,
            )
            await conn.commit()

    async def delete(self, task_id: UUID) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM weekly_tasks WHERE id = %s", (task_id,))
            await conn.commit()
