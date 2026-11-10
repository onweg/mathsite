import asyncio
import json
import unittest
from uuid import uuid4

import httpx
from psycopg import AsyncConnection

from app.api.app_factory import create_app
from app.core.errors import LLMUnavailable
from app.domain.chat.types import ChatReply
from app.services.solution_checks_service import SolutionChecksService
from tests.fake_llm import FakeLLM
from tests.support import reset_database, EMAIL, PASSWORD, database_dsn
from app.infrastructure.llm.yandex import YandexProvider
from app.domain.solution_checks import GENERATION_PROMPT
from app.domain.chat.types import Message


class SolutionWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_provider_http_400_fallback_generates_valid_draft(self):
        generated = await FakeLLM().chat([Message(role='system', text=GENERATION_PROMPT)])
        calls = []
        async def respond(request):
            body = json.loads(request.content)
            calls.append(body)
            if 'json_schema' in body:
                return httpx.Response(400, json={'error': {'message': 'unsupported schema'}})
            self.assertTrue(body['json_object'])
            return httpx.Response(200, json={'result': {'alternatives': [{'message': {'text': generated.text}}]}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            self.app.state.solution_llm = YandexProvider(folder_id='fixture', api_key='fixture', model_chat='yandexgpt-5.1', model_embed_doc='', model_embed_query='', client=client)
            task = await self.call(self.admin, 'POST', '/admin/solution-checks/generate', json={'topic': 'Рациональные уравнения'})
        self.assertEqual(len(calls), 2)
        self.assertEqual(task['status'], 'draft')
        self.assertEqual(len(task['solutions']), 4)
        self.assertEqual(sum(s['is_correct'] for s in task['solutions']), 1)
        self.assertEqual(len(await self.call(self.admin, 'GET', '/admin/solution-checks')), 1)

    async def asyncSetUp(self):
        reset_database()
        self.app = create_app()
        lifecycle = self.app.router.lifespan_context(self.app)
        await lifecycle.__aenter__()
        self.addAsyncCleanup(lifecycle.__aexit__, None, None, None)
        await self.app.state.pool.wait(timeout=15)
        self.llm = FakeLLM()
        self.app.state.solution_llm = self.llm
        self.svc = SolutionChecksService(self.app.state.solution_checks_repo, self.llm)
        self.admin, self.pupil, self.other = self.client(), self.client(), self.client()
        login = await self.call(self.admin, 'POST', '/auth/login', json={'email': EMAIL, 'password': PASSWORD})
        self.admin.headers['Authorization'] = f"Bearer {login['access_token']}"
        student = await self.call(self.admin, 'POST', '/admin/students', json={'name': 'PRIVATE-PUPIL', 'class_label': '8А'})
        await self.call(self.pupil, 'POST', '/students/activate', json={'token': student['qr_token']})
        self.student = student

    def client(self):
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test')
        self.addAsyncCleanup(client.aclose)
        return client

    async def call(self, client, method, path, status=200, **kwargs):
        r = await client.request(method, path, **kwargs)
        self.assertEqual(r.status_code, status, r.text)
        return r.json() if r.content else None

    async def task(self, publish=True):
        task = await self.call(self.admin, 'POST', '/admin/solution-checks/generate', json={'topic': 'Раскрытие скобок'})
        if publish:
            task = await self.call(self.admin, 'POST', f"/admin/solution-checks/{task['id']}/publish", json={'reviewed': True})
        return task

    def answer(self, task, correct=True):
        selected = next(s['id'] for s in task['solutions'] if s['is_correct'] == correct)
        return dict(revision=task['revision'], selected_id=selected,
                    solution_order=[s['id'] for s in reversed(task['solutions'])],
                    explanations={s['id']: 'Ошибка в преобразовании, нужно исправить знак.' for s in task['solutions'] if s['id'] != selected})

    async def test_generation_submission_privacy_history_and_teacher_override(self):
        await self.call(self.other, 'GET', '/admin/solution-checks', status=401)
        await self.call(self.pupil, 'POST', '/admin/solution-checks/generate', status=401, json={'topic': 'Алгебра'})
        task = await self.task(False)
        tid = task['id']
        await self.call(self.pupil, 'GET', f'/solution-checks/{tid}', status=404)
        await self.call(self.admin, 'POST', f'/admin/solution-checks/{tid}/publish', status=422, json={'reviewed': False})
        task = await self.call(self.admin, 'POST', f'/admin/solution-checks/{tid}/publish', json={'reviewed': True})
        await self.call(self.other, 'GET', f'/solution-checks/{tid}', status=401)
        public = await self.call(self.pupil, 'GET', f'/solution-checks/{tid}')
        self.assertNotIn('is_correct', json.dumps(public))
        self.assertNotIn('PRIVATE-RUBRIC', json.dumps(public))
        self.assertEqual(sum(s['is_correct'] for s in task['solutions']), 1)
        body = self.answer(task)
        await self.call(self.other, 'POST', f'/solution-checks/{tid}/attempt', status=401, json=body)
        invalid = body | dict(explanations={str(uuid4()): 'x', 'b': 'x', 'c': 'x'})
        await self.call(self.pupil, 'POST', f'/solution-checks/{tid}/attempt', status=409, json=invalid)
        responses = await asyncio.gather(*(self.pupil.post(f'/solution-checks/{tid}/attempt', json=body) for _ in range(6)))
        self.assertTrue(all(r.status_code == 202 for r in responses))
        self.assertEqual(len({r.json()['id'] for r in responses}), 1)
        attempt = responses[0].json()
        self.assertEqual([s['id'] for s in attempt['solutions']], body['solution_order'])
        aid = attempt['id']
        self.assertNotIn('PRIVATE-RUBRIC', json.dumps(attempt))
        self.assertNotIn('is_correct', json.dumps(attempt))
        await self.call(self.pupil, 'POST', f'/solution-checks/{tid}/attempt', status=409, json=self.answer(task, False))
        await self.call(self.other, 'GET', f'/solution-checks/me/{aid}', status=401)
        second = await self.call(self.admin, 'POST', '/admin/students', json={'name': 'Другой', 'class_label': '8А'})
        await self.call(self.other, 'POST', '/students/activate', json={'token': second['qr_token']})
        await self.call(self.other, 'GET', f'/solution-checks/me/{aid}', status=404)
        # Edits cannot change the snapshot awaiting grading.
        await self.call(self.admin, 'POST', f'/admin/solution-checks/{tid}/unpublish')
        changed = task | dict(question_md='Совсем другое условие задачи')
        await self.call(self.admin, 'PUT', f'/admin/solution-checks/{tid}', json=changed)
        await self.svc.run_one()
        checked = await self.call(self.pupil, 'GET', f'/solution-checks/me/{aid}')
        self.assertEqual(checked['status'], 'graded')
        self.assertEqual(checked['ai_result']['score'], 7)
        self.assertEqual(checked['question_md'], task['question_md'])
        self.assertIn('PRIVATE-RUBRIC', json.dumps(checked))
        grading_prompt = self.llm.calls[-1][-1].text
        self.assertNotIn('PRIVATE-PUPIL', grading_prompt)
        self.assertNotIn(self.student['qr_token'], grading_prompt)
        self.assertEqual(len(await self.call(self.pupil, 'GET', '/solution-checks/me')), 1)
        await self.call(self.pupil, 'PUT', f'/admin/solution-checks/attempts/{aid}/grade', status=401, json={'score': 7, 'feedback': 'Подмена'})
        await self.call(self.admin, 'PUT', f'/admin/solution-checks/attempts/{aid}/grade', status=422, json={'score': 8, 'feedback': 'Ошибка'})
        await self.call(self.admin, 'PUT', f'/admin/solution-checks/attempts/{aid}/grade', json={'score': 5, 'feedback': 'Нужно уточнить объяснение второй ошибки.'})
        checked = await self.call(self.pupil, 'GET', f'/solution-checks/me/{aid}')
        self.assertEqual(checked['teacher_result']['score'], 5)
        self.assertEqual(checked['ai_result']['score'], 7)
        self.assertNotIn('teacher_id', json.dumps(checked))

    async def test_failures_retry_and_server_owned_choice_score(self):
        task = await self.task()
        attempt = await self.call(self.pupil, 'POST', f"/solution-checks/{task['id']}/attempt", status=202, json=self.answer(task, False))
        aid = attempt['id']
        self.llm.failure = LLMUnavailable('fixture', 'outage')
        for _ in range(3):
            async with await AsyncConnection.connect(database_dsn()) as conn:
                await conn.execute('UPDATE solution_attempts SET next_run_at=now() WHERE id=%s', (aid,))
            await self.svc.run_one()
        failed = await self.call(self.pupil, 'GET', f'/solution-checks/me/{aid}')
        self.assertEqual(failed['status'], 'failed')
        self.assertIsNone(failed['ai_result'])
        self.assertNotIn('PRIVATE-RUBRIC', json.dumps(failed))
        await self.call(self.admin, 'POST', f'/admin/solution-checks/attempts/{aid}/retry')
        self.llm.failure = None
        await self.svc.run_one()
        checked = await self.call(self.pupil, 'GET', f'/solution-checks/me/{aid}')
        self.assertEqual(checked['ai_result']['score'], 4)
        self.assertEqual(checked['ai_result']['choice_points'], 0)
        self.assertEqual(len(json.loads(self.llm.calls[-1][-1].text)['to_grade']), 2)

    async def test_expired_lease_recovery_invalid_model_and_stale_worker(self):
        task = await self.task()
        attempt = await self.call(self.pupil, 'POST', f"/solution-checks/{task['id']}/attempt", status=202, json=self.answer(task))
        repo = self.svc.repo
        jobs = await asyncio.gather(repo.claim(), repo.claim())
        self.assertEqual(sum(j is not None for j in jobs), 1)
        first = next(j for j in jobs if j)
        async with await AsyncConnection.connect(database_dsn()) as conn:
            await conn.execute("UPDATE solution_attempts SET lease_until=now()-interval '1 second' WHERE id=%s", (attempt['id'],))
        second = await repo.claim()
        self.assertNotEqual(first['lease_id'], second['lease_id'])
        await repo.complete(first, {'score': 99}, 'stale', {})
        self.assertIsNone((await repo.attempt(attempt['id']))['ai_result'])
        await self.call(self.admin, 'PUT', f"/admin/solution-checks/attempts/{attempt['id']}/grade", json={'score': 6, 'feedback': 'Проверено вручную во время сбоя.'})
        await repo.complete(second, {'score': 99}, 'stale', {})
        final = await repo.attempt(attempt['id'])
        self.assertIsNone(final['ai_result'])
        self.assertEqual(final['teacher_result']['score'], 6)
        other_task = await self.task()
        other = await self.call(self.pupil, 'POST', f"/solution-checks/{other_task['id']}/attempt", status=202, json=self.answer(other_task))
        async def invalid(*args, **kwargs):
            return ChatReply(json.dumps({'grades': [{'solution_id': 'forged', 'points': 7, 'feedback': 'максимум'}]}))
        self.llm.chat = invalid
        await self.svc.run_one()
        record = await repo.attempt(other['id'])
        self.assertEqual(record['status'], 'queued')
        self.assertIsNone(record['ai_result'])

    async def test_draft_revision_and_publication_lock(self):
        task = await self.task()
        body = self.answer(task)
        await self.call(self.admin, 'PUT', f"/admin/solution-checks/{task['id']}", status=409, json=task)
        conn = await AsyncConnection.connect(database_dsn())
        self.addAsyncCleanup(conn.close)
        await conn.execute("UPDATE solution_tasks SET status='draft' WHERE id=%s", (task['id'],))
        pending = asyncio.create_task(self.pupil.post(f"/solution-checks/{task['id']}/attempt", json=body))
        try:
            async with await AsyncConnection.connect(database_dsn(), autocommit=True) as observer:
                for _ in range(100):
                    row = await (await observer.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).fetchone()
                    if row[0]: break
                    await asyncio.sleep(.02)
                else: self.fail('submission did not wait for unpublication')
            await conn.commit()
            self.assertEqual((await asyncio.wait_for(pending, 5)).status_code, 409)
        finally:
            await conn.rollback()
            if not pending.done(): pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)
        fresh = await self.call(self.admin, 'POST', f"/admin/solution-checks/{task['id']}/publish", json={'reviewed': True})
        await self.call(self.pupil, 'POST', f"/solution-checks/{task['id']}/attempt", status=409, json=body)
        await self.call(self.pupil, 'POST', f"/solution-checks/{task['id']}/attempt", status=202, json=self.answer(fresh))
