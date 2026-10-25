"""SQL для таблиц library_items и library_events."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.domain.library.types import (
    EventAction,
    ItemKind,
    ItemStat,
    LibraryEvent,
    LibraryItem,
    LibraryTotals,
    StudentStat,
)


class LibraryRepository(Protocol):
    async def list(
        self, collection: str | None, *, published_only: bool
    ) -> list[LibraryItem]: ...

    async def list_for_admin(self, collection: str | None) -> list[LibraryItem]: ...

    async def get(self, item_id: UUID) -> LibraryItem | None: ...

    async def get_by_slug(self, collection: str, slug: str) -> LibraryItem | None: ...

    async def counts_published(self) -> dict[str, int]: ...

    async def next_position(self, collection: str) -> int: ...

    async def create(
        self,
        *,
        collection: str,
        kind: ItemKind,
        slug: str,
        title: str,
        summary: str,
        body_md: str,
        url: str,
        file_rel: str,
        file_name: str,
        file_size: int,
        media_type: str,
        material_id: UUID | None,
        position: int,
        created_by: UUID | None,
    ) -> LibraryItem: ...

    async def update(
        self,
        item_id: UUID,
        *,
        collection: str | None = None,
        slug: str | None = None,
        title: str | None = None,
        summary: str | None = None,
        body_md: str | None = None,
        url: str | None = None,
        is_published: bool | None = None,
    ) -> None: ...

    async def reorder(self, collection: str, ids: list[UUID]) -> None: ...

    async def delete(self, item_id: UUID) -> None: ...

    async def add_event(
        self,
        *,
        item_id: UUID | None,
        collection: str,
        action: EventAction,
        student_id: UUID | None,
        student_name: str,
        class_label: str,
    ) -> None: ...

    async def last_event_at(
        self,
        *,
        item_id: UUID | None,
        collection: str,
        action: EventAction,
        student_id: UUID,
    ) -> datetime | None: ...

    async def recent_events(
        self, collection: str | None, limit: int
    ) -> list[LibraryEvent]: ...

    async def item_stats(self, collection: str | None) -> list[ItemStat]: ...

    async def student_stats(self, collection: str | None) -> list[StudentStat]: ...

    async def totals(self, collection: str | None) -> LibraryTotals: ...


_COLS = (
    "id",
    "collection",
    "kind",
    "slug",
    "title",
    "summary",
    "body_md",
    "url",
    "file_rel",
    "file_name",
    "file_size",
    "media_type",
    "material_id",
    "position",
    "is_published",
    "created_at",
    "updated_at",
)

_SELECT = f"SELECT {', '.join(_COLS)} FROM library_items"
#: Те же колонки с префиксом — для запросов с джойном.
_SELECT_I = f"SELECT {', '.join('i.' + c for c in _COLS)}"

#: Порядок на полке задаёт учитель стрелками; при равных position — свежее выше.
_ORDER = "ORDER BY position ASC, created_at DESC"


def _row_to_item(row) -> LibraryItem:
    return LibraryItem(
        id=row[0],
        collection=row[1],
        kind=row[2],
        slug=row[3],
        title=row[4],
        summary=row[5],
        body_md=row[6],
        url=row[7],
        file_rel=row[8],
        file_name=row[9],
        file_size=row[10],
        media_type=row[11],
        material_id=row[12],
        position=row[13],
        is_published=row[14],
        created_at=row[15],
        updated_at=row[16],
        material_status=row[17] if len(row) > 17 else None,
        chunks_count=row[18] if len(row) > 18 else 0,
        views=row[19] if len(row) > 19 else 0,
    )


class PgLibraryRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    # ---------- материалы полок ----------

    async def list(
        self, collection: str | None, *, published_only: bool
    ) -> list[LibraryItem]:
        where: list[str] = []
        params: list[object] = []
        if collection:
            where.append("collection = %s")
            params.append(collection)
        if published_only:
            where.append("is_published = TRUE")
        clause = f" WHERE {' AND '.join(where)}" if where else ""
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT}{clause} {_ORDER}", params)  # noqa: S608
            rows = await cur.fetchall()
        return [_row_to_item(r) for r in rows]

    async def list_for_admin(self, collection: str | None) -> list[LibraryItem]:
        """То же плюс состояние индексации файла и число просмотров."""
        clause = " AND i.collection = %s" if collection else ""
        params = [collection] if collection else []
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                {_SELECT_I}, m.status, COALESCE(m.chunks_count, 0),
                       (SELECT COUNT(*) FROM library_events e WHERE e.item_id = i.id)
                FROM library_items i
                LEFT JOIN materials m ON m.id = i.material_id
                WHERE TRUE{clause}
                ORDER BY i.position ASC, i.created_at DESC
                """,  # noqa: S608
                params,
            )
            rows = await cur.fetchall()
        return [_row_to_item(r) for r in rows]

    async def get(self, item_id: UUID) -> LibraryItem | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"{_SELECT} WHERE id = %s", (item_id,))
            row = await cur.fetchone()
        return _row_to_item(row) if row else None

    async def get_by_slug(self, collection: str, slug: str) -> LibraryItem | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"{_SELECT} WHERE collection = %s AND slug = %s", (collection, slug)
            )
            row = await cur.fetchone()
        return _row_to_item(row) if row else None

    async def counts_published(self) -> dict[str, int]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT collection, COUNT(*) FROM library_items "
                "WHERE is_published = TRUE GROUP BY collection"
            )
            rows = await cur.fetchall()
        return {r[0]: r[1] for r in rows}

    async def next_position(self, collection: str) -> int:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM library_items "
                "WHERE collection = %s",
                (collection,),
            )
            row = await cur.fetchone()
        return int(row[0]) if row else 1

    async def create(
        self,
        *,
        collection: str,
        kind: ItemKind,
        slug: str,
        title: str,
        summary: str,
        body_md: str,
        url: str,
        file_rel: str,
        file_name: str,
        file_size: int,
        media_type: str,
        material_id: UUID | None,
        position: int,
        created_by: UUID | None,
    ) -> LibraryItem:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                INSERT INTO library_items (
                    collection, kind, slug, title, summary, body_md, url,
                    file_rel, file_name, file_size, media_type, material_id,
                    position, created_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING {', '.join(_COLS)}
                """,  # noqa: S608
                (
                    collection, kind, slug, title, summary, body_md, url,
                    file_rel, file_name, file_size, media_type, material_id,
                    position, created_by,
                ),
            )
            row = await cur.fetchone()
            await conn.commit()
        return _row_to_item(row)

    async def update(
        self,
        item_id: UUID,
        *,
        collection: str | None = None,
        slug: str | None = None,
        title: str | None = None,
        summary: str | None = None,
        body_md: str | None = None,
        url: str | None = None,
        is_published: bool | None = None,
    ) -> None:
        fields = {
            "collection": collection,
            "slug": slug,
            "title": title,
            "summary": summary,
            "body_md": body_md,
            "url": url,
            "is_published": is_published,
        }
        sets: list[str] = []
        params: list[object] = []
        for name, value in fields.items():
            if value is not None:
                sets.append(f"{name} = %s")
                params.append(value)
        if not sets:
            return
        sets.append("updated_at = NOW()")
        params.append(item_id)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"UPDATE library_items SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                params,
            )
            await conn.commit()

    async def reorder(self, collection: str, ids: list[UUID]) -> None:
        """Переставить материалы полки в присланном порядке.

        WITH ORDINALITY даёт номер элемента массива — порядок гарантирован
        стандартом, в отличие от row_number() поверх обычного unnest.
        """
        if not ids:
            return
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE library_items AS t
                SET position = v.ord, updated_at = NOW()
                FROM unnest(%s::uuid[]) WITH ORDINALITY AS v(id, ord)
                WHERE t.id = v.id AND t.collection = %s
                """,
                (ids, collection),
            )
            await conn.commit()

    async def delete(self, item_id: UUID) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM library_items WHERE id = %s", (item_id,))
            await conn.commit()

    # ---------- журнал просмотров ----------

    async def add_event(
        self,
        *,
        item_id: UUID | None,
        collection: str,
        action: EventAction,
        student_id: UUID | None,
        student_name: str,
        class_label: str,
    ) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO library_events (
                    item_id, collection, action, student_id, student_name, class_label
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (item_id, collection, action, student_id, student_name, class_label),
            )
            await conn.commit()

    async def last_event_at(
        self,
        *,
        item_id: UUID | None,
        collection: str,
        action: EventAction,
        student_id: UUID,
    ) -> datetime | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT MAX(created_at) FROM library_events
                WHERE student_id = %s AND action = %s AND collection = %s
                  AND item_id IS NOT DISTINCT FROM %s::uuid
                """,
                (student_id, action, collection, item_id),
            )
            row = await cur.fetchone()
        return row[0] if row else None

    async def recent_events(
        self, collection: str | None, limit: int
    ) -> list[LibraryEvent]:
        clause = " AND e.collection = %s" if collection else ""
        params: list[object] = [collection] if collection else []
        params.append(limit)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT e.id, e.item_id, COALESCE(i.title, ''), e.collection, e.action,
                       e.student_id, e.student_name, e.class_label, e.created_at
                FROM library_events e
                LEFT JOIN library_items i ON i.id = e.item_id
                WHERE TRUE{clause}
                ORDER BY e.created_at DESC
                LIMIT %s
                """,  # noqa: S608
                params,
            )
            rows = await cur.fetchall()
        return [
            LibraryEvent(
                id=r[0], item_id=r[1], item_title=r[2], collection=r[3], action=r[4],
                student_id=r[5], student_name=r[6], class_label=r[7], created_at=r[8],
            )
            for r in rows
        ]

    async def item_stats(self, collection: str | None) -> list[ItemStat]:
        clause = " AND i.collection = %s" if collection else ""
        params = [collection] if collection else []
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT i.id, i.title, i.collection, i.kind, i.is_published,
                       COUNT(e.id),
                       COUNT(DISTINCT e.student_id),
                       MAX(e.created_at)
                FROM library_items i
                LEFT JOIN library_events e ON e.item_id = i.id
                WHERE TRUE{clause}
                GROUP BY i.id
                ORDER BY COUNT(e.id) DESC, i.created_at DESC
                """,  # noqa: S608
                params,
            )
            rows = await cur.fetchall()
        return [
            ItemStat(
                item_id=r[0], title=r[1], collection=r[2], kind=r[3], is_published=r[4],
                views=r[5], students=r[6], last_view=r[7],
            )
            for r in rows
        ]

    async def student_stats(self, collection: str | None) -> list[StudentStat]:
        """Кто сколько открывал. Анонимов тут нет: их нечем сгруппировать."""
        clause = " AND collection = %s" if collection else ""
        params = [collection] if collection else []
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT student_id, MAX(student_name), MAX(class_label),
                       COUNT(*), MAX(created_at)
                FROM library_events
                WHERE student_id IS NOT NULL{clause}
                GROUP BY student_id
                ORDER BY COUNT(*) DESC, MAX(created_at) DESC
                LIMIT 200
                """,  # noqa: S608
                params,
            )
            rows = await cur.fetchall()
        return [
            StudentStat(
                student_id=r[0], student_name=r[1], class_label=r[2],
                views=r[3], last_view=r[4],
            )
            for r in rows
        ]

    async def totals(self, collection: str | None) -> LibraryTotals:
        clause = " AND collection = %s" if collection else ""
        params = [collection] if collection else []
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT COUNT(*),
                       COUNT(DISTINCT student_id),
                       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'),
                       COUNT(*) FILTER (WHERE student_id IS NULL)
                FROM library_events
                WHERE TRUE{clause}
                """,  # noqa: S608
                params,
            )
            row = await cur.fetchone()
        if not row:
            return LibraryTotals(views=0, students=0, views_week=0, anonymous=0)
        return LibraryTotals(
            views=row[0], students=row[1], views_week=row[2], anonymous=row[3]
        )
