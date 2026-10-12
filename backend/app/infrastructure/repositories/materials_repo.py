"""SQL для таблицы materials."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.domain.material.types import Material, MaterialStatus


class MaterialsRepository(Protocol):
    async def list(self) -> list[Material]: ...

    async def list_ready(self) -> list[Material]: ...

    async def get(self, material_id: UUID) -> Material | None: ...

    async def get_by_source_key(self, source_key: str) -> Material | None: ...

    async def create(
        self,
        *,
        slug: str,
        title: str,
        source_key: str,
        filename: str,
        created_by: UUID | None,
    ) -> Material: ...

    async def update_status(
        self,
        material_id: UUID,
        status: MaterialStatus,
        *,
        chunks_count: int | None = None,
        error_message: str | None = None,
    ) -> None: ...

    async def delete(self, material_id: UUID) -> None: ...


_SELECT = (
    "SELECT id, slug, title, source_key, filename, status, chunks_count, "
    "error_message, created_at FROM materials"
)


def _row_to_material(row) -> Material:
    return Material(
        id=row[0],
        slug=row[1],
        title=row[2],
        source_key=row[3],
        filename=row[4],
        status=row[5],
        chunks_count=row[6],
        error_message=row[7],
        created_at=row[8],
    )


class PgMaterialsRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def list(self) -> list[Material]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} ORDER BY created_at DESC")
            rows = await cur.fetchall()
        return [_row_to_material(r) for r in rows]

    async def list_ready(self) -> list[Material]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"{_SELECT} WHERE status = 'ready' ORDER BY created_at DESC"
            )
            rows = await cur.fetchall()
        return [_row_to_material(r) for r in rows]

    async def get(self, material_id: UUID) -> Material | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} WHERE id = %s", (material_id,))
            row = await cur.fetchone()
        return _row_to_material(row) if row else None

    async def get_by_source_key(self, source_key: str) -> Material | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} WHERE source_key = %s", (source_key,))
            row = await cur.fetchone()
        return _row_to_material(row) if row else None

    async def create(
        self,
        *,
        slug: str,
        title: str,
        source_key: str,
        filename: str,
        created_by: UUID | None,
    ) -> Material:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO materials (slug, title, source_key, filename, created_by)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, slug, title, source_key, filename, status, chunks_count,
                          error_message, created_at
                """,
                (slug, title, source_key, filename, created_by),
            )
            row = await cur.fetchone()
            await conn.commit()
        return _row_to_material(row)

    async def update_status(
        self,
        material_id: UUID,
        status: MaterialStatus,
        *,
        chunks_count: int | None = None,
        error_message: str | None = None,
    ) -> None:
        sets = ["status = %s"]
        params: list[object] = [status]
        if chunks_count is not None:
            sets.append("chunks_count = %s")
            params.append(chunks_count)
        if error_message is not None:
            sets.append("error_message = %s")
            params.append(error_message)
        params.append(material_id)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"UPDATE materials SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                params,
            )
            await conn.commit()

    async def delete(self, material_id: UUID) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM materials WHERE id = %s", (material_id,))
            await conn.commit()
