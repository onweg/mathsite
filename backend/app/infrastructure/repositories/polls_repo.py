"""SQL для таблиц polls / poll_options / poll_answers."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.domain.poll.types import OptionTally, Poll, PollAnswer, PollKind, PollOption


class PollsRepository(Protocol):
    async def list(self, *, published_only: bool = False) -> list[Poll]: ...

    async def get(self, poll_id: UUID) -> Poll | None: ...

    async def create(
        self,
        *,
        title: str,
        question_md: str,
        kind: PollKind,
        multiple: bool,
        allow_comment: bool,
        options: list[str],
        created_by: UUID | None,
    ) -> Poll: ...

    async def update(
        self,
        poll_id: UUID,
        *,
        title: str | None = None,
        question_md: str | None = None,
        multiple: bool | None = None,
        allow_comment: bool | None = None,
        is_published: bool | None = None,
        options: list[str] | None = None,
    ) -> None: ...

    async def delete(self, poll_id: UUID) -> None: ...

    async def upsert_answer(
        self,
        *,
        poll_id: UUID,
        student_id: UUID | None,
        student_name: str,
        class_label: str,
        option_ids: list[UUID],
        comment: str,
    ) -> PollAnswer: ...

    async def get_answer_for_student(
        self, poll_id: UUID, student_id: UUID
    ) -> PollAnswer | None: ...

    async def tallies(self, poll_id: UUID) -> list[OptionTally]: ...

    async def answers_count(self, poll_id: UUID) -> int: ...

    async def answers_with_comments(self, poll_id: UUID) -> list[PollAnswer]: ...

    async def counts(self) -> dict[UUID, int]: ...


_POLL_COLS = (
    "id, title, question_md, kind, multiple, allow_comment, is_published, "
    "created_at, updated_at"
)
_ANSWER_COLS = (
    "id, poll_id, student_id, student_name, class_label, option_ids, comment, "
    "created_at, updated_at"
)


def _poll(row, options: list[PollOption]) -> Poll:
    return Poll(
        id=row[0],
        title=row[1],
        question_md=row[2],
        kind=row[3],
        multiple=row[4],
        allow_comment=row[5],
        is_published=row[6],
        options=options,
        created_at=row[7],
        updated_at=row[8],
    )


def _answer(row) -> PollAnswer:
    return PollAnswer(
        id=row[0],
        poll_id=row[1],
        student_id=row[2],
        student_name=row[3],
        class_label=row[4],
        option_ids=list(row[5] or []),
        comment=row[6],
        created_at=row[7],
        updated_at=row[8],
    )


class PgPollsRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def list(self, *, published_only: bool = False) -> list[Poll]:
        where = "WHERE is_published = TRUE " if published_only else ""
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"SELECT {_POLL_COLS} FROM polls {where}ORDER BY created_at DESC"  # noqa: S608
            )
            rows = await cur.fetchall()
            if not rows:
                return []
            ids = [r[0] for r in rows]
            await cur.execute(
                "SELECT id, poll_id, position, text FROM poll_options "
                "WHERE poll_id = ANY(%s) ORDER BY poll_id, position",
                (ids,),
            )
            opt_rows = await cur.fetchall()
        by_poll: dict[UUID, list[PollOption]] = {}
        for o in opt_rows:
            by_poll.setdefault(o[1], []).append(
                PollOption(id=o[0], position=o[2], text=o[3])
            )
        return [_poll(r, by_poll.get(r[0], [])) for r in rows]

    async def get(self, poll_id: UUID) -> Poll | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(f"SELECT {_POLL_COLS} FROM polls WHERE id = %s", (poll_id,))
            row = await cur.fetchone()
            if not row:
                return None
            await cur.execute(
                "SELECT id, position, text FROM poll_options "
                "WHERE poll_id = %s ORDER BY position",
                (poll_id,),
            )
            opts = [PollOption(id=o[0], position=o[1], text=o[2]) for o in await cur.fetchall()]
        return _poll(row, opts)

    async def create(
        self,
        *,
        title: str,
        question_md: str,
        kind: PollKind,
        multiple: bool,
        allow_comment: bool,
        options: list[str],
        created_by: UUID | None,
    ) -> Poll:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"""
                INSERT INTO polls
                    (title, question_md, kind, multiple, allow_comment, created_by)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING {_POLL_COLS}
                """,
                (title, question_md, kind, multiple, allow_comment, created_by),
            )
            row = await cur.fetchone()
            poll_id = row[0]
            opts: list[PollOption] = []
            for i, text in enumerate(options):
                await cur.execute(
                    "INSERT INTO poll_options (poll_id, position, text) "
                    "VALUES (%s, %s, %s) RETURNING id",
                    (poll_id, i, text),
                )
                opts.append(PollOption(id=(await cur.fetchone())[0], position=i, text=text))
            await conn.commit()
        return _poll(row, opts)

    async def update(
        self,
        poll_id: UUID,
        *,
        title: str | None = None,
        question_md: str | None = None,
        multiple: bool | None = None,
        allow_comment: bool | None = None,
        is_published: bool | None = None,
        options: list[str] | None = None,
    ) -> None:
        sets: list[str] = []
        params: list[object] = []
        for col, val in (
            ("title", title),
            ("question_md", question_md),
            ("multiple", multiple),
            ("allow_comment", allow_comment),
            ("is_published", is_published),
        ):
            if val is not None:
                sets.append(f"{col} = %s")
                params.append(val)

        async with self._pool.connection() as conn, conn.cursor() as cur:
            if sets:
                sets.append("updated_at = NOW()")
                await cur.execute(
                    f"UPDATE polls SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                    [*params, poll_id],
                )
            if options is not None:
                # Варианты меняются целиком: id старых не переиспользуем, поэтому
                # ответы по ним тоже чистим — иначе в результатах повиснут
                # голоса за варианты, которых больше нет.
                await cur.execute("DELETE FROM poll_options WHERE poll_id = %s", (poll_id,))
                await cur.execute("DELETE FROM poll_answers WHERE poll_id = %s", (poll_id,))
                for i, text in enumerate(options):
                    await cur.execute(
                        "INSERT INTO poll_options (poll_id, position, text) VALUES (%s, %s, %s)",
                        (poll_id, i, text),
                    )
            await conn.commit()

    async def delete(self, poll_id: UUID) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM polls WHERE id = %s", (poll_id,))
            await conn.commit()

    # ---------- ответы ----------

    async def upsert_answer(
        self,
        *,
        poll_id: UUID,
        student_id: UUID | None,
        student_name: str,
        class_label: str,
        option_ids: list[UUID],
        comment: str,
    ) -> PollAnswer:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            if student_id is None:
                await cur.execute(
                    f"""
                    INSERT INTO poll_answers
                        (poll_id, student_id, student_name, class_label, option_ids, comment)
                    VALUES (%s, NULL, %s, %s, %s, %s)
                    RETURNING {_ANSWER_COLS}
                    """,
                    (poll_id, student_name, class_label, option_ids, comment),
                )
            else:
                await cur.execute(
                    f"""
                    INSERT INTO poll_answers
                        (poll_id, student_id, student_name, class_label, option_ids, comment)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (poll_id, student_id) WHERE student_id IS NOT NULL
                    DO UPDATE SET
                        student_name = EXCLUDED.student_name,
                        class_label  = EXCLUDED.class_label,
                        option_ids   = EXCLUDED.option_ids,
                        comment      = EXCLUDED.comment,
                        updated_at   = NOW()
                    RETURNING {_ANSWER_COLS}
                    """,
                    (poll_id, student_id, student_name, class_label, option_ids, comment),
                )
            row = await cur.fetchone()
            await conn.commit()
        return _answer(row)

    async def get_answer_for_student(
        self, poll_id: UUID, student_id: UUID
    ) -> PollAnswer | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"SELECT {_ANSWER_COLS} FROM poll_answers "
                "WHERE poll_id = %s AND student_id = %s",
                (poll_id, student_id),
            )
            row = await cur.fetchone()
        return _answer(row) if row else None

    async def tallies(self, poll_id: UUID) -> list[OptionTally]:
        """Голоса по вариантам. Варианты без голосов тоже в списке — с нулём."""
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT o.id, o.text, o.position, COUNT(a.id)
                FROM poll_options o
                LEFT JOIN poll_answers a
                       ON a.poll_id = o.poll_id AND o.id = ANY(a.option_ids)
                WHERE o.poll_id = %s
                GROUP BY o.id, o.text, o.position
                ORDER BY o.position
                """,
                (poll_id,),
            )
            rows = await cur.fetchall()
        return [
            OptionTally(option_id=r[0], text=r[1], position=r[2], votes=r[3]) for r in rows
        ]

    async def answers_count(self, poll_id: UUID) -> int:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT COUNT(*) FROM poll_answers WHERE poll_id = %s", (poll_id,)
            )
            return (await cur.fetchone())[0]

    async def answers_with_comments(self, poll_id: UUID) -> list[PollAnswer]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"SELECT {_ANSWER_COLS} FROM poll_answers "
                "WHERE poll_id = %s AND comment <> '' ORDER BY created_at DESC",
                (poll_id,),
            )
            rows = await cur.fetchall()
        return [_answer(r) for r in rows]

    async def counts(self) -> dict[UUID, int]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT poll_id, COUNT(*) FROM poll_answers GROUP BY poll_id"
            )
            rows = await cur.fetchall()
        return {r[0]: r[1] for r in rows}
