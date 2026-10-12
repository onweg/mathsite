"""SQL для таблицы students."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.domain.student.types import Student


class StudentsRepository(Protocol):
    async def list(self, class_label: str | None = None) -> list[Student]: ...

    async def get(self, student_id: UUID) -> Student | None: ...

    async def get_by_token(self, qr_token: str) -> Student | None: ...

    async def create(
        self,
        *,
        name: str,
        class_label: str,
        qr_token: str,
        note: str | None,
        created_by: UUID | None,
    ) -> Student: ...

    async def update(
        self,
        student_id: UUID,
        *,
        name: str | None = None,
        class_label: str | None = None,
        note: str | None = None,
    ) -> None: ...

    async def set_token(self, student_id: UUID, qr_token: str) -> None: ...

    async def delete(self, student_id: UUID) -> None: ...

    async def count_by_class(self) -> list[tuple[str, int]]: ...


_SELECT = (
    "SELECT id, name, class_label, qr_token, note, created_at FROM students"
)


def _row(r) -> Student:
    return Student(
        id=r[0], name=r[1], class_label=r[2], qr_token=r[3], note=r[4], created_at=r[5]
    )


class PgStudentsRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def list(self, class_label: str | None = None) -> list[Student]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            if class_label is not None:
                await cur.execute(
                    f"{_SELECT} WHERE class_label = %s ORDER BY name",
                    (class_label,),
                )
            else:
                await cur.execute(f"{_SELECT} ORDER BY class_label, name")
            rows = await cur.fetchall()
        return [_row(r) for r in rows]

    async def get(self, student_id: UUID) -> Student | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} WHERE id = %s", (student_id,))
            row = await cur.fetchone()
        return _row(row) if row else None

    async def get_by_token(self, qr_token: str) -> Student | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} WHERE qr_token = %s", (qr_token,))
            row = await cur.fetchone()
        return _row(row) if row else None

    async def create(
        self,
        *,
        name: str,
        class_label: str,
        qr_token: str,
        note: str | None,
        created_by: UUID | None,
    ) -> Student:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO students (name, class_label, qr_token, note, created_by)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, name, class_label, qr_token, note, created_at
                """,
                (name, class_label, qr_token, note, created_by),
            )
            row = await cur.fetchone()
            await conn.commit()
        return _row(row)

    async def update(
        self,
        student_id: UUID,
        *,
        name: str | None = None,
        class_label: str | None = None,
        note: str | None = None,
    ) -> None:
        sets: list[str] = []
        params: list[object] = []
        if name is not None:
            sets.append("name = %s")
            params.append(name)
        if class_label is not None:
            sets.append("class_label = %s")
            params.append(class_label)
        if note is not None:
            sets.append("note = %s")
            params.append(note)
        if not sets:
            return
        params.append(student_id)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"UPDATE students SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                params,
            )
            await conn.commit()

    async def set_token(self, student_id: UUID, qr_token: str) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "UPDATE students SET qr_token = %s WHERE id = %s",
                (qr_token, student_id),
            )
            await conn.commit()

    async def delete(self, student_id: UUID) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM students WHERE id = %s", (student_id,))
            await conn.commit()

    async def count_by_class(self) -> list[tuple[str, int]]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT class_label, count(*) FROM students "
                "GROUP BY class_label ORDER BY class_label"
            )
            rows = await cur.fetchall()
        return [(r[0], r[1]) for r in rows]
