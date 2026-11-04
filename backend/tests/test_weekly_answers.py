"""Per-task answer publication, public privacy and submission closure."""
import importlib.util
import os
import tempfile
import unittest
from contextlib import asynccontextmanager
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.core.errors import Conflict, NotFound
from app.domain.weekly.types import WeeklyTask
from app.services.weekly_service import WeeklyTaskService
from app.services.weekly_submissions_service import WeeklySubmissionsService


class MemoryTasks:
    def __init__(self):
        self.tasks = {
            id: WeeklyTask(id, title, 'Условие', 'Скрытое решение', True)
            for id, title in ((uuid4(), 'Первая'), (uuid4(), 'Вторая'))
        }

    async def get(self, id):
        return self.tasks.get(id)

    async def update(self, id, **fields):
        self.tasks[id] = replace(self.tasks[id], **fields)

    async def list_published(self):
        return [t for t in self.tasks.values() if t.is_published]


class WeeklyAnswerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tasks = MemoryTasks()
        self.first, self.second = self.tasks.tasks
        self.service = WeeklyTaskService(self.tasks, AsyncMock(), AsyncMock())

    async def test_publish_hide_only_selected_task_and_keep_answer(self):
        task = await self.service.publish_answer(self.first, answer_md='  Новое решение  ')
        self.assertTrue(task.is_answer_published)
        self.assertEqual(task.answer_md, 'Новое решение')
        self.assertFalse((await self.tasks.get(self.second)).is_answer_published)
        task = await self.service.hide_answer(self.first)
        self.assertFalse(task.is_answer_published)
        self.assertEqual(task.answer_md, 'Новое решение')
        self.assertTrue(task.is_published)
        with self.assertRaises(Conflict):
            await self.service.publish_answer(self.first, answer_md=' \n ')
        with self.assertRaises(NotFound):
            await self.service.publish_answer(uuid4(), answer_md='Ответ')

    async def test_submission_closes_reopens_and_cleans_photo_on_race(self):
        repo = AsyncMock()
        repo.upsert.return_value = (type('Submission', (), {'student_id': None})(), None)
        with tempfile.TemporaryDirectory() as directory:
            service = WeeklySubmissionsService(repo, self.tasks, upload_dir=Path(directory))
            args = dict(student=None, student_name='Ученик', solution_md='Мой ответ', image=None, image_name=None)
            await self.service.publish_answer(self.first, answer_md='Разбор')
            with self.assertRaises(Conflict):
                await service.submit(self.first, **args)
            repo.upsert.assert_not_awaited()
            await service.submit(self.second, **args)
            await self.service.hide_answer(self.first)
            await service.submit(self.first, **args)
            self.assertEqual(repo.upsert.await_count, 2)
            # Teacher publishes after the early service check, before the DB write.
            repo.upsert.side_effect = Conflict('приём закрыт')
            with self.assertRaises(Conflict):
                await service.submit(self.first, **(args | {'image': b'\xff\xd8\xfftest', 'image_name': 'photo.jpg'}))
            self.assertEqual(list(Path(directory).iterdir()), [])
            await self.tasks.update(self.first, is_published=False)
            with self.assertRaises(Conflict):
                await service.submit(self.first, **args)

    async def test_api_auth_public_answer_redaction_and_cycle(self):
        from fastapi import FastAPI
        from httpx import ASGITransport, AsyncClient
        with patch.dict(os.environ, {'YC_FOLDER_ID': 'test', 'YC_API_KEY': 'test'}):
            from app.api.routers import admin_weekly, weekly
            from app.api.deps import get_current_admin, get_auth_service, get_weekly_service
            from app.api.middleware import register_error_handlers
        app = FastAPI()
        app.include_router(admin_weekly.router)
        app.include_router(weekly.router)
        register_error_handlers(app)
        app.dependency_overrides[get_weekly_service] = lambda: self.service
        app.dependency_overrides[get_auth_service] = lambda: object()
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            url = f'/admin/weekly/{self.first}/answer'
            for action in ('publish', 'hide'):
                response = await client.post(f'{url}/{action}', json={'answer_md': 'Разбор'})
                self.assertEqual(response.status_code, 401)
            response = await client.get('/weekly')
            self.assertEqual(response.headers['cache-control'], 'no-store')
            self.assertNotIn('Скрытое решение', response.text)
            self.assertTrue(all(t['answer_md'] is None for t in response.json()))
            app.dependency_overrides[get_current_admin] = lambda: object()
            response = await client.post(f'{url}/publish', json={'answer_md': '  '})
            self.assertEqual(response.status_code, 409)
            response = await client.post(f'{url}/publish', json={'answer_md': 'Разбор первой'})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()['is_answer_published'])
            rows = (await client.get('/weekly')).json()
            self.assertEqual(rows[0]['answer_md'], 'Разбор первой')
            self.assertIsNone(rows[1]['answer_md'])
            response = await client.post(f'{url}/hide')
            self.assertEqual(response.status_code, 200)
            self.assertNotIn('Разбор первой', (await client.get('/weekly')).text)


class TemporaryPool:
    def __init__(self, conn):
        self.conn = conn

    @asynccontextmanager
    async def connection(self):
        # Repositories own commits. Roll back failed operations as a real pool does.
        try:
            yield self.conn
        except Exception:
            await self.conn.rollback()
            raise


@unittest.skipUnless(os.environ.get('ANALYTICS_TEST_DSN'), 'Set ANALYTICS_TEST_DSN for PostgreSQL tests')
class WeeklyAnswersPostgresTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from psycopg import AsyncConnection
        from app.infrastructure.repositories.weekly_repo import PgWeeklyTasksRepository
        from app.infrastructure.repositories.weekly_submissions_repo import PgWeeklySubmissionsRepository
        self.conn = await AsyncConnection.connect(os.environ['ANALYTICS_TEST_DSN'])
        self.addAsyncCleanup(self.conn.close)
        migrations = Path(__file__).resolve().parents[1] / 'alembic' / 'versions'
        for path in sorted(migrations.glob('*.py')):
            if path.name[:4] not in ('0002', '0003', '0004', '0008'):
                continue
            spec = importlib.util.spec_from_file_location('test_migration', path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            statements = []
            with patch.object(module.op, 'execute', side_effect=statements.append):
                module.upgrade()
            for sql in statements:
                if 'CREATE EXTENSION' not in sql:
                    await self.conn.execute(sql.replace('CREATE TABLE ', 'CREATE TEMP TABLE '))
        self.student = uuid4()
        self.teacher = uuid4()
        await self.conn.execute("INSERT INTO students (id,name,class_label,qr_token) VALUES (%s,'Ученик','8А','test-token')", (self.student,))
        await self.conn.execute("INSERT INTO users (id,email,password_hash,name) VALUES (%s,'test@test','test','Учитель')", (self.teacher,))
        await self.conn.commit()
        pool = TemporaryPool(self.conn)
        self.tasks = PgWeeklyTasksRepository(pool)
        self.submissions = PgWeeklySubmissionsRepository(pool)
        self.service = WeeklyTaskService(self.tasks, AsyncMock(), AsyncMock())
        self.first = (await self.tasks.create('Первая', 'Условие', 'Решение', self.teacher)).id
        self.second = (await self.tasks.create('Вторая', 'Условие', 'Решение', self.teacher)).id
        await self.service.publish(self.first)
        await self.service.publish(self.second)

    async def submit(self, task, student=None, text='Моё решение'):
        return await self.submissions.upsert(task_id=task, student_id=student,
            student_name='Ученик', class_label='8А', solution_md=text, image_filename=None)

    async def test_closed_task_rejects_anonymous_and_repeat_keeps_review_then_reopens(self):
        self.assertFalse((await self.tasks.get(self.first)).is_answer_published)
        original, _ = await self.submit(self.first, self.student)
        await self.submissions.review(original.id, status='correct', teacher_comment='Хорошо')
        await self.service.publish_answer(self.first, answer_md='Опубликованный разбор')
        for student in (None, self.student):
            with self.assertRaises(Conflict):
                await self.submit(self.first, student, 'Новый ответ')
        saved = await self.submissions.get(original.id)
        self.assertEqual(saved.status, 'correct')
        self.assertEqual(saved.teacher_comment, 'Хорошо')
        self.assertEqual(saved.solution_md, 'Моё решение')
        self.assertEqual(len(await self.submissions.list_by_task(self.first)), 1)
        await self.submit(self.second)
        await self.submit(self.second, self.student)
        await self.service.hide_answer(self.first)
        new, _ = await self.submit(self.first, self.student, 'Исправленный ответ')
        self.assertEqual(new.id, original.id)
        self.assertEqual(new.solution_md, 'Исправленный ответ')
        self.assertEqual(new.status, 'new')
        await self.submit(self.first)
        self.assertEqual(len(await self.submissions.list_by_task(self.first)), 2)
        await self.service.unpublish(self.first)
        with self.assertRaises(Conflict):
            await self.submit(self.first)
        with self.assertRaises(NotFound):
            await self.submit(uuid4())


if __name__ == '__main__':
    unittest.main()
