"""Local analytics checks. Optional PG tests use ONLY connection-local temp tables.

ANALYTICS_TEST_DSN=postgresql://localhost/postgres python -m unittest discover -s tests -v
No server is started and no application tables are changed.
"""
import importlib.util
import os
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from pydantic import ValidationError

from app.core.errors import Conflict
from app.infrastructure.repositories.analytics_repo import PgAnalyticsRepository
from app.schemas.analytics import ActivityPulse
from app.services.analytics_service import period_bounds


class PeriodTests(unittest.TestCase):
    def test_moscow_inclusive_dates(self):
        start, end = period_bounds(date(2026, 1, 1), date(2026, 1, 2))
        self.assertEqual(start.astimezone(timezone.utc).isoformat(), '2025-12-31T21:00:00+00:00')
        self.assertEqual(end.astimezone(timezone.utc).isoformat(), '2026-01-02T21:00:00+00:00')

    def test_invalid_period(self):
        with self.assertRaises(Conflict):
            period_bounds(date(2026, 1, 2), date(2026, 1, 1))

    def test_no_urls_or_unbounded_duration(self):
        body = dict(id=uuid4(), visit_id=uuid4(), page='home', active_seconds=15)
        ActivityPulse(**body)
        for changes in ({'page': '/s/secret-token'}, {'active_seconds': -1}, {'active_seconds': 86401}):
            with self.assertRaises(ValidationError):
                ActivityPulse(**(body | changes))


class TempPool:
    def __init__(self, conn):
        self.conn = conn

    @asynccontextmanager
    async def connection(self):
        async with self.conn.transaction():
            yield self.conn


class AnalyticsApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from fastapi import FastAPI
        from httpx import AsyncClient, ASGITransport
        with patch.dict(os.environ, {'YC_FOLDER_ID': 'test', 'YC_API_KEY': 'test'}):
            from app.api.routers.analytics import router
            from app.api.deps import get_auth_service, get_optional_student
            from app.api.middleware import register_error_handlers
        from app.infrastructure.ratelimit.memory import InMemoryRateLimiter
        from app.infrastructure.ratelimit.base import Limit
        self.app = FastAPI()
        self.app.include_router(router)
        register_error_handlers(self.app)
        self.repo = AsyncMock()
        self.repo.report.return_value = {'totals': {'visits': 0}}
        self.app.state.analytics_repo = self.repo
        self.app.state.analytics_limiter = InMemoryRateLimiter((Limit(180, 60),))
        self.app.dependency_overrides[get_auth_service] = lambda: object()
        self.app.dependency_overrides[get_optional_student] = lambda: None
        self.client = AsyncClient(transport=ASGITransport(app=self.app), base_url='http://test')
        self.addAsyncCleanup(self.client.aclose)

    async def test_report_requires_teacher_and_valid_dates(self):
        from app.api.deps import get_current_admin
        response = await self.client.get('/admin/analytics')
        self.assertEqual(response.status_code, 401)
        self.repo.report.assert_not_awaited()
        self.app.dependency_overrides[get_current_admin] = lambda: object()
        response = await self.client.get('/admin/analytics?start=2026-01-02&end=2026-01-01')
        self.assertEqual(response.status_code, 409)
        response = await self.client.get('/admin/analytics?start=2026-01-01&end=2026-01-02')
        self.assertEqual(response.status_code, 200)

    async def test_student_identity_comes_from_cookie_not_payload(self):
        from types import SimpleNamespace
        from app.api.deps import get_optional_student
        student_id = uuid4()
        self.app.dependency_overrides[get_optional_student] = lambda: SimpleNamespace(id=student_id)
        body = dict(id=str(uuid4()), visit_id=str(uuid4()), page='home', active_seconds=15,
                    student_id=str(uuid4()))
        response = await self.client.post('/analytics/pulse', json=body)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.repo.pulse.call_args.kwargs['student_id'], student_id)
        response = await self.client.post('/analytics/pulse', json=body | {'page': '/s/private-token'})
        self.assertEqual(response.status_code, 422)


@unittest.skipUnless(os.environ.get('ANALYTICS_TEST_DSN'), 'Set ANALYTICS_TEST_DSN for PostgreSQL tests')
class AnalyticsPostgresTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from psycopg import AsyncConnection
        self.conn = await AsyncConnection.connect(os.environ['ANALYTICS_TEST_DSN'])
        self.addAsyncCleanup(self.conn.close)
        # Reuse the real migration DDL, but all created tables are TEMPORARY.
        migrations = Path(__file__).resolve().parents[1] / 'alembic' / 'versions'
        for path in sorted(migrations.glob('*.py')):
            if path.name.startswith('0001'):
                continue  # unrelated pgvector textbook index
            spec = importlib.util.spec_from_file_location('test_migration', path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            statements = []
            with patch.object(module.op, 'execute', side_effect=statements.append):
                module.upgrade()
            for sql in statements:
                if 'CREATE EXTENSION' in sql:
                    continue
                await self.conn.execute(sql.replace('CREATE TABLE ', 'CREATE TEMP TABLE '))
        self.repo = PgAnalyticsRepository(TempPool(self.conn))
        self.now = datetime.now(timezone.utc)
        self.s1, self.s2, self.s3 = uuid4(), uuid4(), uuid4()
        for id, name, label in ((self.s1, 'Иван Петров', '8А'), (self.s2, 'Иван Петров', '8Б'), (self.s3, 'Мария Иванова', '8А')):
            await self.conn.execute('INSERT INTO students (id, name, class_label, qr_token) VALUES (%s, %s, %s, %s)', (id, name, label, str(uuid4())))
        self.quiz = uuid4()
        await self.conn.execute("INSERT INTO quizzes (id,title,topic) VALUES (%s,'Тест','Алгебра')", (self.quiz,))
        for student, score, age in ((self.s1, 2, 0), (self.s1, 5, 0), (self.s2, 1, 0), (None, 3, 0), (self.s1, 0, 40)):
            await self.conn.execute('''INSERT INTO quiz_attempts
                (quiz_id, student_id, student_name, answers, score, total, created_at)
                VALUES (%s,%s,'Имя при отправке','{}',%s,5,%s)''',
                (self.quiz, student, score, self.now - timedelta(days=age)))
        visit = uuid4()
        for student, visit_id, page, seconds, age in (
            (self.s1, visit, 'home', 60, 60), (self.s1, visit, 'ai', 120, 30),
            (self.s2, uuid4(), 'home', 30, 40), (None, uuid4(), 'home', 10, 10),
        ):
            await self.conn.execute('''INSERT INTO site_activity
                (id, visit_id, student_id, page, active_seconds, created_at)
                VALUES (%s,%s,%s,%s,%s,%s)''',
                (uuid4(), visit_id, student, page, seconds, self.now - timedelta(seconds=age)))
        task = uuid4()
        await self.conn.execute("INSERT INTO weekly_tasks (id,title,body_md,answer_md) VALUES (%s,'Задача','Вопрос','Ответ')", (task,))
        for student, status in ((self.s1, 'new'), (self.s2, 'correct')):
            await self.conn.execute("INSERT INTO weekly_submissions (task_id,student_id,student_name,status) VALUES (%s,%s,'Ученик',%s)", (task, student, status))
        for action in ('section', 'open'):
            await self.conn.execute("INSERT INTO library_events (collection,action,student_id) VALUES ('around',%s,%s)", (action, self.s1))
        poll, option = uuid4(), uuid4()
        await self.conn.execute("INSERT INTO polls (id,title) VALUES (%s,'Опрос')", (poll,))
        await self.conn.execute("INSERT INTO poll_options (id,poll_id,position,text) VALUES (%s,%s,0,'Алгебра')", (option, poll))
        await self.conn.execute("INSERT INTO poll_answers (poll_id,student_id,student_name,option_ids) VALUES (%s,%s,'Ученик',%s)", (poll, self.s1, [option]))
        await self.conn.commit()

    async def report(self, **filters):
        return await self.repo.report(since=self.now - timedelta(days=7), until=self.now + timedelta(days=1),
                                      class_label=filters.get('class_label'), student_id=filters.get('student_id'))

    async def test_totals_do_not_multiply_and_roster_keeps_inactive_students(self):
        result = await self.report()
        self.assertEqual(result['totals']['visits'], 3)
        self.assertEqual(result['totals']['anonymous_visits'], 1)
        self.assertEqual(result['totals']['active_seconds'], 220)
        self.assertEqual(result['totals']['quiz_attempts'], 4)
        self.assertEqual(result['totals']['average_score'], 55)
        self.assertEqual(result['totals']['weekly_pending'], 1)
        self.assertEqual(len(result['students']), 3)
        inactive = next(s for s in result['students'] if s['id'] == self.s3)
        self.assertIsNone(inactive['last_activity'])
        self.assertEqual(inactive['visits'], 0)
        first = next(s for s in result['students'] if s['id'] == self.s1)
        self.assertEqual(first['visits'], 1)
        self.assertEqual(first['quiz_attempts'], 2)
        self.assertEqual(first['last_visit'], self.now - timedelta(seconds=60))
        self.assertEqual(result['polls'][0]['choices'], 'Алгебра')

    async def test_filters_apply_to_every_source(self):
        result = await self.report(class_label='8А')
        self.assertEqual(len(result['students']), 2)
        self.assertEqual(result['totals']['visits'], 1)
        self.assertEqual(result['totals']['quiz_attempts'], 2)
        self.assertEqual(result['totals']['anonymous_visits'], 0)
        self.assertEqual(result['totals']['weekly_submissions'], 1)
        self.assertEqual(len(result['quizzes']), 1)
        result = await self.report(student_id=self.s2)
        self.assertEqual(len(result['students']), 1)
        self.assertEqual(result['totals']['library_views'], 0)
        self.assertEqual(result['totals']['poll_answers'], 0)
        self.assertEqual(result['quizzes'][0]['attempts'], 1)
        self.assertEqual(result['weekly'][0]['status'], 'correct')

    async def test_heartbeat_retries_are_idempotent_and_ownership_is_fixed(self):
        id, visit = uuid4(), uuid4()
        args = dict(id=id, visit_id=visit, student_id=self.s1, page='quizzes')
        await self.repo.pulse(**args, active_seconds=0)
        await self.conn.execute("UPDATE site_activity SET created_at = NOW() - INTERVAL '60 seconds' WHERE id = %s", (id,))
        await self.conn.commit()
        await self.repo.pulse(**args, active_seconds=15)
        await self.repo.pulse(**args, active_seconds=15)
        await self.repo.pulse(**args, active_seconds=5)
        await self.repo.pulse(**(args | {'student_id': self.s2}), active_seconds=50)
        row = await (await self.conn.execute('SELECT active_seconds,student_id FROM site_activity WHERE id=%s', (id,))).fetchone()
        self.assertEqual(row, (15, self.s1))
        await self.conn.commit()
        await self.repo.pulse(**args, active_seconds=86400)
        row = await (await self.conn.execute('SELECT active_seconds FROM site_activity WHERE id=%s', (id,))).fetchone()
        self.assertLessEqual(row[0], 61)


if __name__ == '__main__':
    unittest.main()
