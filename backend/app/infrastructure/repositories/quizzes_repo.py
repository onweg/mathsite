"""Quizzes repository: SQL для таблиц quizzes, quiz_items, quiz_attempts."""

from __future__ import annotations

import json
from typing import Protocol
from uuid import UUID

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from dataclasses import dataclass
from datetime import datetime

from app.domain.quiz.types import Choice, Quiz, QuizItem, QuizStatus


@dataclass(frozen=True)
class AttemptSummary:
    id: UUID
    student_name: str
    student_id: UUID | None
    score: int
    total: int
    created_at: datetime


@dataclass(frozen=True)
class StudentAttempt:
    """Для профиля ученика: привязана к конкретному студенту, с названием квиза."""

    id: UUID
    quiz_id: UUID
    quiz_title: str
    score: int
    total: int
    created_at: datetime


class QuizzesRepository(Protocol):
    async def create(self, quiz: Quiz, created_by: UUID) -> Quiz: ...

    async def list(self, status: QuizStatus | None = None) -> list[Quiz]: ...

    async def items_counts(self) -> dict[UUID, int]:
        """quiz_id → число вопросов. `list` вопросы не грузит."""
        ...

    async def attempted_ids(self, student_id: UUID) -> set[UUID]:
        """Квизы, которые ученик уже проходил."""
        ...

    async def get(self, quiz_id: UUID) -> Quiz | None: ...

    async def update_meta(
        self,
        quiz_id: UUID,
        *,
        title: str | None = None,
        topic: str | None = None,
        status: QuizStatus | None = None,
    ) -> None: ...

    async def replace_items(self, quiz_id: UUID, items: list[QuizItem]) -> None: ...

    async def update_item(
        self,
        item_id: UUID,
        *,
        question_md: str | None = None,
        choices: list[Choice] | None = None,
        correct_answer: str | None = None,
        explanation: str | None = None,
    ) -> None: ...

    async def delete(self, quiz_id: UUID) -> None: ...

    async def save_attempt(
        self,
        quiz_id: UUID,
        student_name: str,
        student_id: UUID | None,
        answers: dict[str, str],
        score: int,
        total: int,
    ) -> UUID: ...

    async def list_attempts(self, quiz_id: UUID) -> list[AttemptSummary]: ...

    async def list_by_student(self, student_id: UUID) -> list[StudentAttempt]: ...


def _choices_to_json(choices: list[Choice]) -> list[dict]:
    return [{"id": c.id, "text": c.text} for c in choices]


def _json_to_choices(raw) -> list[Choice]:
    if not raw:
        return []
    data = raw if isinstance(raw, list) else json.loads(raw)
    return [Choice(id=c["id"], text=c["text"]) for c in data]


class PgQuizzesRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def create(self, quiz: Quiz, created_by: UUID) -> Quiz:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO quizzes (title, topic, source_key, difficulty, status, created_by)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, created_at, updated_at
                """,
                (quiz.title, quiz.topic, quiz.source_key, quiz.difficulty, quiz.status, created_by),
            )
            quiz_id, created_at, updated_at = await cur.fetchone()

            inserted_items: list[QuizItem] = []
            for item in quiz.items:
                await cur.execute(
                    """
                    INSERT INTO quiz_items
                        (quiz_id, position, kind, question_md, choices, correct_answer, explanation)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        quiz_id,
                        item.position,
                        item.kind,
                        item.question_md,
                        Jsonb(_choices_to_json(item.choices)),
                        item.correct_answer,
                        item.explanation,
                    ),
                )
                (item_id,) = await cur.fetchone()
                inserted_items.append(
                    QuizItem(
                        id=item_id,
                        position=item.position,
                        kind=item.kind,
                        question_md=item.question_md,
                        choices=item.choices,
                        correct_answer=item.correct_answer,
                        explanation=item.explanation,
                    )
                )
            await conn.commit()

        return Quiz(
            id=quiz_id,
            title=quiz.title,
            topic=quiz.topic,
            source_key=quiz.source_key,
            difficulty=quiz.difficulty,
            status=quiz.status,
            created_at=created_at,
            updated_at=updated_at,
            items=inserted_items,
        )

    async def list(self, status: QuizStatus | None = None) -> list[Quiz]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            if status:
                await cur.execute(
                    """
                    SELECT id, title, topic, source_key, difficulty, status, created_at, updated_at
                    FROM quizzes WHERE status = %s ORDER BY created_at DESC
                    """,
                    (status,),
                )
            else:
                await cur.execute(
                    """
                    SELECT id, title, topic, source_key, difficulty, status, created_at, updated_at
                    FROM quizzes ORDER BY created_at DESC
                    """
                )
            rows = await cur.fetchall()
        return [
            Quiz(
                id=r[0],
                title=r[1],
                topic=r[2],
                source_key=r[3],
                difficulty=r[4],
                status=r[5],
                created_at=r[6],
                updated_at=r[7],
                items=[],
            )
            for r in rows
        ]

    async def items_counts(self) -> dict[UUID, int]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT quiz_id, COUNT(*) FROM quiz_items GROUP BY quiz_id"
            )
            rows = await cur.fetchall()
        return {r[0]: r[1] for r in rows}

    async def attempted_ids(self, student_id: UUID) -> set[UUID]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT DISTINCT quiz_id FROM quiz_attempts WHERE student_id = %s",
                (student_id,),
            )
            rows = await cur.fetchall()
        return {r[0] for r in rows}

    async def get(self, quiz_id: UUID) -> Quiz | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT id, title, topic, source_key, difficulty, status, created_at, updated_at
                FROM quizzes WHERE id = %s
                """,
                (quiz_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            await cur.execute(
                """
                SELECT id, position, kind, question_md, choices, correct_answer, explanation
                FROM quiz_items WHERE quiz_id = %s ORDER BY position
                """,
                (quiz_id,),
            )
            irows = await cur.fetchall()

        items = [
            QuizItem(
                id=i[0],
                position=i[1],
                kind=i[2],
                question_md=i[3],
                choices=_json_to_choices(i[4]),
                correct_answer=i[5],
                explanation=i[6],
            )
            for i in irows
        ]
        return Quiz(
            id=row[0],
            title=row[1],
            topic=row[2],
            source_key=row[3],
            difficulty=row[4],
            status=row[5],
            created_at=row[6],
            updated_at=row[7],
            items=items,
        )

    async def update_meta(
        self,
        quiz_id: UUID,
        *,
        title: str | None = None,
        topic: str | None = None,
        status: QuizStatus | None = None,
    ) -> None:
        sets: list[str] = []
        params: list[object] = []
        if title is not None:
            sets.append("title = %s")
            params.append(title)
        if topic is not None:
            sets.append("topic = %s")
            params.append(topic)
        if status is not None:
            sets.append("status = %s")
            params.append(status)
        if not sets:
            return
        sets.append("updated_at = NOW()")
        params.append(quiz_id)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"UPDATE quizzes SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                params,
            )
            await conn.commit()

    async def replace_items(self, quiz_id: UUID, items: list[QuizItem]) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM quiz_items WHERE quiz_id = %s", (quiz_id,))
            for item in items:
                await cur.execute(
                    """
                    INSERT INTO quiz_items
                        (quiz_id, position, kind, question_md, choices, correct_answer, explanation)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        quiz_id,
                        item.position,
                        item.kind,
                        item.question_md,
                        Jsonb(_choices_to_json(item.choices)),
                        item.correct_answer,
                        item.explanation,
                    ),
                )
            await cur.execute("UPDATE quizzes SET updated_at = NOW() WHERE id = %s", (quiz_id,))
            await conn.commit()

    async def update_item(
        self,
        item_id: UUID,
        *,
        question_md: str | None = None,
        choices: list[Choice] | None = None,
        correct_answer: str | None = None,
        explanation: str | None = None,
    ) -> None:
        sets: list[str] = []
        params: list[object] = []
        if question_md is not None:
            sets.append("question_md = %s")
            params.append(question_md)
        if choices is not None:
            sets.append("choices = %s")
            params.append(Jsonb(_choices_to_json(choices)))
        if correct_answer is not None:
            sets.append("correct_answer = %s")
            params.append(correct_answer)
        if explanation is not None:
            sets.append("explanation = %s")
            params.append(explanation)
        if not sets:
            return
        params.append(item_id)
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                f"UPDATE quiz_items SET {', '.join(sets)} WHERE id = %s",  # noqa: S608
                params,
            )
            await conn.commit()

    async def delete(self, quiz_id: UUID) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM quizzes WHERE id = %s", (quiz_id,))
            await conn.commit()

    async def save_attempt(
        self,
        quiz_id: UUID,
        student_name: str,
        student_id: UUID | None,
        answers: dict[str, str],
        score: int,
        total: int,
    ) -> UUID:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO quiz_attempts
                    (quiz_id, student_name, student_id, answers, score, total)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (quiz_id, student_name, student_id, Jsonb(answers), score, total),
            )
            (attempt_id,) = await cur.fetchone()
            await conn.commit()
        return attempt_id

    async def list_attempts(self, quiz_id: UUID) -> list[AttemptSummary]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT id, student_name, student_id, score, total, created_at
                FROM quiz_attempts
                WHERE quiz_id = %s
                ORDER BY created_at DESC
                LIMIT 500
                """,
                (quiz_id,),
            )
            rows = await cur.fetchall()
        return [
            AttemptSummary(
                id=r[0],
                student_name=r[1],
                student_id=r[2],
                score=r[3],
                total=r[4],
                created_at=r[5],
            )
            for r in rows
        ]

    async def list_by_student(self, student_id: UUID) -> list[StudentAttempt]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                SELECT a.id, a.quiz_id, q.title, a.score, a.total, a.created_at
                FROM quiz_attempts a
                JOIN quizzes q ON q.id = a.quiz_id
                WHERE a.student_id = %s
                ORDER BY a.created_at DESC
                LIMIT 200
                """,
                (student_id,),
            )
            rows = await cur.fetchall()
        return [
            StudentAttempt(
                id=r[0],
                quiz_id=r[1],
                quiz_title=r[2],
                score=r[3],
                total=r[4],
                created_at=r[5],
            )
            for r in rows
        ]
