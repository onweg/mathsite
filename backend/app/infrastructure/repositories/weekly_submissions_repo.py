"""SQL для таблицы weekly_submissions."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.domain.weekly.types import SubmissionStatus, WeeklySubmission


class WeeklySubmissionsRepository(Protocol):
    async def upsert(
        self,
        *,
        task_id: UUID,
        student_id: UUID | None,
        student_name: str,
        class_label: str,
        solution_md: str,
        image_filename: str | None,
    ) -> tuple[WeeklySubmission, str | None]:
        """Возвращает (новая запись, имя файла прежнего фото для удаления)."""
        ...

    async def get(self, submission_id: UUID) -> WeeklySubmission | None: ...

    async def get_for_student(
        self, task_id: UUID, student_id: UUID
    ) -> WeeklySubmission | None: ...

    async def list_by_task(self, task_id: UUID) -> list[WeeklySubmission]: ...

    async def list_by_student(
        self, student_id: UUID
    ) -> list[tuple[WeeklySubmission, str]]:
        """Решения ученика вместе с названием задачи — для его профиля."""
        ...

    async def list_correct(self, task_id: UUID) -> list[WeeklySubmission]: ...

    async def counts(self) -> dict[UUID, tuple[int, int]]:
        """task_id → (всего решений, непроверенных)."""
        ...

    async def review(
        self,
        submission_id: UUID,
        *,
        status: SubmissionStatus | None,
        teacher_comment: str | None,
    ) -> None: ...

    async def delete(self, submission_id: UUID) -> None: ...


_COLS = (
    "id, task_id, student_id, student_name, class_label, solution_md, "
    "image_filename, status, teacher_comment, created_at, updated_at, reviewed_at"
)
_SELECT = f"SELECT {_COLS} FROM weekly_submissions"


def _row(r) -> WeeklySubmission:
    return WeeklySubmission(
        id=r[0],
        task_id=r[1],
        student_id=r[2],
        student_name=r[3],
        class_label=r[4],
        solution_md=r[5],
        image_filename=r[6],
        status=r[7],
        teacher_comment=r[8],
        created_at=r[9],
        updated_at=r[10],
        reviewed_at=r[11],
    )


class PgWeeklySubmissionsRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def upsert(
        self,
        *,
        task_id: UUID,
        student_id: UUID | None,
        student_name: str,
        class_label: str,
        solution_md: str,
        image_filename: str | None,
    ) -> tuple[WeeklySubmission, str | None]:
        # Аноним не опознаётся между запросами — у него каждая отправка своя строка.
        if student_id is None:
            async with self._pool.connection() as conn, conn.cursor() as cur:
                await cur.execute(
                    f"""
                    INSERT INTO weekly_submissions
                        (task_id, student_id, student_name, class_label,
                         solution_md, image_filename)
                    VALUES (%s, NULL, %s, %s, %s, %s)
                    RETURNING {_COLS}
                    """,
                    (task_id, student_name, class_label, solution_md, image_filename),
                )
                row = await cur.fetchone()
                await conn.commit()
            return _row(row), None

        # Ученик по QR переотправляет решение — перезаписываем прежнее и
        # возвращаем старое имя файла, чтобы сервис подчистил диск.
        # Проверка снова уходит в 'new': учитель смотрит свежий вариант.
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT image_filename FROM weekly_submissions "
                "WHERE task_id = %s AND student_id = %s",
                (task_id, student_id),
            )
            prev = await cur.fetchone()
            await cur.execute(
                f"""
                INSERT INTO weekly_submissions
                    (task_id, student_id, student_name, class_label,
                     solution_md, image_filename)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (task_id, student_id) WHERE student_id IS NOT NULL
                DO UPDATE SET
                    student_name    = EXCLUDED.student_name,
                    class_label     = EXCLUDED.class_label,
                    solution_md     = EXCLUDED.solution_md,
                    image_filename  = EXCLUDED.image_filename,
                    status          = 'new',
                    teacher_comment = NULL,
                    reviewed_at     = NULL,
                    updated_at      = NOW()
                RETURNING {_COLS}
                """,
                (
                    task_id,
                    student_id,
                    student_name,
                    class_label,
                    solution_md,
                    image_filename,
                ),
            )
            row = await cur.fetchone()
            await conn.commit()

        old = prev[0] if prev else None
        return _row(row), (old if old and old != image_filename else None)

    async def get(self, submission_id: UUID) -> WeeklySubmission | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} WHERE id = %s", (submission_id,))
            row = await cur.fetchone()
        return _row(row) if row else None

    async def get_for_student(
        self, task_id: UUID, student_id: UUID
    ) -> WeeklySubmission | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"{_SELECT} WHERE task_id = %s AND student_id = %s",
                (task_id, student_id),
            )
            row = await cur.fetchone()
        return _row(row) if row else None

    async def list_by_task(self, task_id: UUID) -> list[WeeklySubmission]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"{_SELECT} WHERE task_id = %s "
                "ORDER BY (status = 'new') DESC, created_at DESC",
                (task_id,),
            )
            rows = await cur.fetchall()
        return [_row(r) for r in rows]

    async def list_by_student(
        self, student_id: UUID
    ) -> list[tuple[WeeklySubmission, str]]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT {", ".join("s." + c.strip() for c in _COLS.split(","))}, t.title
                FROM weekly_submissions s
                JOIN weekly_tasks t ON t.id = s.task_id
                WHERE s.student_id = %s
                ORDER BY s.created_at DESC
                """,
                (student_id,),
            )
            rows = await cur.fetchall()
        return [(_row(r), r[12]) for r in rows]

    async def list_correct(self, task_id: UUID) -> list[WeeklySubmission]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"{_SELECT} WHERE task_id = %s AND status = 'correct' "
                "ORDER BY reviewed_at NULLS LAST, created_at",
                (task_id,),
            )
            rows = await cur.fetchall()
        return [_row(r) for r in rows]

    async def counts(self) -> dict[UUID, tuple[int, int]]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT task_id, COUNT(*), COUNT(*) FILTER (WHERE status = 'new') "
                "FROM weekly_submissions GROUP BY task_id"
            )
            rows = await cur.fetchall()
        return {r[0]: (r[1], r[2]) for r in rows}

    async def review(
        self,
        submission_id: UUID,
        *,
        status: SubmissionStatus | None,
        teacher_comment: str | None,
    ) -> None:
        sets: list[str] = []
        params: list[object] = []
        if status is not None:
            sets.append("status = %s")
            params.append(status)
            # NOW() — литерал SQL, а не значение параметра
            sets.append("reviewed_at = NULL" if status == "new" else "reviewed_at = NOW()")
        if teacher_comment is not None:
            sets.append("teacher_comment = %s")
            params.append(teacher_comment or None)
        if not sets:
            return
        sets.append("updated_at = NOW()")
        params.append(submission_id)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"UPDATE weekly_submissions SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                params,
            )
            await conn.commit()

    async def delete(self, submission_id: UUID) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM weekly_submissions WHERE id = %s", (submission_id,)
            )
            await conn.commit()
