"""Проверяем SQL сводки на временной SQLite с поддержкой оконных функций.

Исполняется запрос из PgQuizzesRepository; адаптер меняет только плейсхолдеры
и преобразует UUID/datetime. PostgreSQL, серверы и внешние API не запускаются.
Запуск: python -m unittest discover -s tests -v
"""

import sqlite3
import unittest
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from app.infrastructure.repositories.quizzes_repo import PgQuizzesRepository


class SqlitePool:
    def __init__(self, db):
        self.db = db

    @asynccontextmanager
    async def connection(self):
        yield self

    @asynccontextmanager
    async def cursor(self):
        yield SqliteCursor(self.db)


class SqliteCursor:
    def __init__(self, db):
        self.db = db

    async def execute(self, sql, params):
        self.result = self.db.execute(
            sql.replace('%s', '?'), tuple(str(p) if isinstance(p, UUID) else p for p in params)
        )

    async def fetchall(self):
        return [
            (UUID(r[0]) if r[0] else None, *r[1:6], datetime.fromisoformat(r[6]))
            for r in self.result.fetchall()
        ]


class QuizAttemptsSummaryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.executescript('''
            CREATE TABLE students (id TEXT PRIMARY KEY, name TEXT, class_label TEXT);
            CREATE TABLE quiz_attempts (
                id TEXT PRIMARY KEY, quiz_id TEXT, student_id TEXT,
                student_name TEXT, score INTEGER, total INTEGER, created_at TEXT
            );
        ''')
        self.repo = PgQuizzesRepository(SqlitePool(self.db))
        self.quiz_id = uuid4()
        self.start = datetime(2026, 10, 29, tzinfo=timezone.utc)

    def student(self, name='Иван Петров', class_label='8А'):
        student_id = uuid4()
        self.db.execute('INSERT INTO students VALUES (?, ?, ?)', (str(student_id), name, class_label))
        return student_id

    def attempt(self, student_id, *, minute=0, score=3, total=5, name='Иван Петров', quiz_id=None):
        self.db.execute(
            'INSERT INTO quiz_attempts VALUES (?, ?, ?, ?, ?, ?, ?)',
            (str(uuid4()), str(quiz_id or self.quiz_id), str(student_id) if student_id else None,
             name, score, total, (self.start + timedelta(minutes=minute)).isoformat()),
        )

    async def test_empty_quiz(self):
        self.assertEqual(await self.repo.attempts_summary(self.quiz_id), [])

    async def test_same_names_stay_separate_and_renaming_keeps_attempts(self):
        first = self.student(class_label='8А')
        second = self.student(class_label='8Б')
        self.attempt(first, minute=1, score=5)
        self.attempt(first, minute=2, score=2, total=4)
        self.attempt(second, minute=3, score=4)
        self.db.execute('UPDATE students SET name = ? WHERE id = ?', ('Иван Сидоров', str(first)))
        rows = await self.repo.attempts_summary(self.quiz_id)
        self.assertEqual([r.student_id for r in rows], [second, first])
        self.assertEqual([r.attempts_count for r in rows], [1, 2])
        self.assertEqual(rows[1].student_name, 'Иван Сидоров')
        self.assertEqual(rows[1].class_label, '8А')
        self.assertEqual((rows[1].last_score, rows[1].last_total), (2, 4))
        self.assertEqual(rows[1].last_attempt_at, self.start + timedelta(minutes=2))

    async def test_counts_all_attempts_beyond_history_limit_and_only_this_quiz(self):
        first = self.student()
        old_student = self.student('Мария Иванова')
        self.attempt(old_student)
        for minute in range(1, 522):
            self.attempt(first, minute=minute)
        self.attempt(first, minute=1000, quiz_id=uuid4(), score=0)
        rows = await self.repo.attempts_summary(self.quiz_id)
        self.assertEqual([r.attempts_count for r in rows], [521, 1])
        self.assertEqual(rows[1].student_id, old_student)
        self.assertEqual(sum(r.attempts_count for r in rows), 522)
        self.assertEqual(rows[0].last_attempt_at, self.start + timedelta(minutes=521))

    async def test_anonymous_attempts_are_separate_from_named_students(self):
        student = self.student()
        self.attempt(student)
        self.attempt(None, name='Иван Петров', minute=1)
        self.attempt(None, name='Иван Петров', minute=2)
        self.attempt(None, name='аноним', minute=3)
        rows = await self.repo.attempts_summary(self.quiz_id)
        anonymous = next(r for r in rows if r.student_id is None)
        registered = next(r for r in rows if r.student_id == student)
        self.assertEqual(anonymous.attempts_count, 3)
        self.assertEqual(registered.attempts_count, 1)
        self.assertEqual(len(rows), 2)


if __name__ == '__main__':
    unittest.main()
