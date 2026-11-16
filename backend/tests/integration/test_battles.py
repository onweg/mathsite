import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone

import httpx
from psycopg import AsyncConnection

from app.api.app_factory import create_app
from app.core.errors import LLMUnavailable
from app.domain.chat.types import ChatReply
from app.services.battles_service import BattlesGrading
from tests.fake_llm import FakeLLM
from tests.support import reset_database, EMAIL, PASSWORD, database_dsn

TASK = dict(title='Покупка краски', question='На стену площадью 20 м² нужно 2 слоя. Одного литра хватает на 10 м². Сколько литров купить?',
            practical_use='Рассчитать количество краски перед ремонтом.', reference='PRIVATE-REFERENCE: 20 * 2 / 10 = 4 литра.')
GRADE = dict(reasoning=4, calculations=4, context=2, feedback='Расчёт и объяснение верны.')


class BattleWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        reset_database()
        self.app = create_app()
        lifecycle = self.app.router.lifespan_context(self.app)
        await lifecycle.__aenter__()
        self.addAsyncCleanup(lifecycle.__aexit__, None, None, None)
        await self.app.state.pool.wait(timeout=15)
        self.llm = FakeLLM()
        self.worker = BattlesGrading(self.app.state.battles_repo, self.llm)
        self.admin, self.author, self.solver, self.other, self.guest = [self.client() for _ in range(5)]
        login = await self.call(self.admin, 'POST', '/auth/login', json=dict(email=EMAIL, password=PASSWORD))
        self.admin.headers['Authorization'] = f"Bearer {login['access_token']}"
        self.people = []
        for client, name in [(self.author, 'Автор'), (self.solver, 'Решатель'), (self.other, 'Другой')]:
            s = await self.call(self.admin, 'POST', '/admin/students', json=dict(name=name, class_label='8А'))
            await self.call(client, 'POST', '/students/activate', json=dict(token=s['qr_token']))
            self.people.append(s)

    def client(self):
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test')
        self.addAsyncCleanup(client.aclose)
        return client

    async def call(self, client, method, url, status=200, **kwargs):
        r = await client.request(method, url, **kwargs)
        self.assertEqual(r.status_code, status, r.text)
        return r.json()

    async def round(self, roles=None, start=True):
        now = datetime.now(timezone.utc)
        body = dict(title='Практическая математика', description='Придумайте задачу для жизни.', reviewers=roles or ['teacher', 'author', 'ai'],
                    task_deadline=(now + timedelta(days=1)).isoformat(), solve_deadline=(now + timedelta(days=2)).isoformat())
        r = await self.call(self.admin, 'POST', '/admin/battles', json=body)
        if start:
            await self.call(self.admin, 'POST', f"/admin/battles/{r['id']}/start")
        return r

    async def task(self, rid, client=None, publish=True):
        client = client or self.author
        t = await self.call(client, 'PUT', f'/battles/{rid}/my-task', json=TASK)
        if publish:
            await self.call(client, 'POST', f"/battles/{rid}/tasks/{t['id']}/status", json=dict(action='submit'))
            await self.call(self.admin, 'POST', f"/admin/battles/{rid}/tasks/{t['id']}/status", json=dict(action='approve'))
        d = await self.call(client, 'GET', f'/battles/{rid}')
        return next(x for x in d['tasks'] if x['id'] == t['id'])

    async def answer(self, rid, task, client=None):
        return await self.call(client or self.solver, 'POST', f"/battles/{rid}/tasks/{task['id']}/answer", status=202,
                               json=dict(revision=task['revision'], answer='20 * 2 / 10 = 4 литра краски для двух слоёв.'))

    async def grade(self, rid, aid, role='teacher', grade=None, reason=''):
        return await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/attempts/{aid}/review', json=dict(role=role, grade=grade or GRADE, reason=reason))

    async def test_round_publication_three_reviews_and_frozen_rankings(self):
        r = await self.round(start=False)
        rid = r['id']
        self.assertEqual(await self.call(self.guest, 'GET', '/battles'), [])
        await self.call(self.author, 'GET', f'/battles/{rid}', status=404)
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', status=409, json=TASK)
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/start')
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}', status=409, json=r)
        task = await self.task(rid, publish=False)
        tid = task['id']
        self.assertEqual((await self.call(self.solver, 'GET', f'/battles/{rid}'))['tasks'], [])
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', json=dict(action='submit'))
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', status=403, json=dict(action='approve'))
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/tasks/{tid}/status', json=dict(action='return', note='Добавьте единицы измерения'))
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', json=dict(action='submit'))
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/tasks/{tid}/status', json=dict(action='approve'))
        public = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertNotIn('PRIVATE-REFERENCE', json.dumps(public))
        task = public['tasks'][0]
        await self.call(self.author, 'PUT', f'/battles/{rid}/tasks/{tid}/like', status=409, json=dict(enabled=True))
        for _ in range(2):
            await self.call(self.solver, 'PUT', f'/battles/{rid}/tasks/{tid}/like', json=dict(enabled=True))
        attempt = await self.answer(rid, task)
        aid = attempt['id']
        await self.grade(rid, aid, grade=GRADE | dict(reasoning=2))  # 8
        await self.worker.run_one()  # 10
        incoming = (await self.call(self.author, 'GET', f'/battles/{rid}'))['attempts'][0]
        self.assertIsNone(incoming['student_name'])
        self.assertEqual(incoming['reviews'], {})
        self.assertIsNone(incoming['score'])
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertIsNone(detail['attempts'][0]['score'])
        self.assertEqual(detail['rankings']['pending'], 1)
        self.assertEqual(detail['rankings']['solvers'], [])
        await self.call(self.author, 'PUT', f'/battles/{rid}/attempts/{aid}/review', json=GRADE | dict(reasoning=0))  # 6
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(detail['attempts'][0]['score'], 8)
        self.assertNotIn('PRIVATE-REFERENCE', json.dumps(detail))
        self.assertEqual(detail['rankings']['authors'][0]['score'], 1)
        await self.grade(rid, aid, role='author', grade=GRADE | dict(reasoning=0), reason='Подтверждаю оценку автора после проверки')
        await self.call(self.author, 'PUT', f'/battles/{rid}/attempts/{aid}/review', status=409, json=GRADE)
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/stop')
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/finalize')
        final = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(final['round']['status'], 'closed')
        self.assertIn('PRIVATE-REFERENCE', json.dumps(final))
        self.assertEqual(final['rankings']['solvers'][0]['score'], 8)
        await self.call(self.solver, 'PUT', f'/battles/{rid}/tasks/{tid}/like', status=409, json=dict(enabled=False))
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/attempts/{aid}/review', status=409, json=dict(role='teacher', grade=GRADE))
        self.assertEqual((await self.call(self.guest, 'GET', f'/battles/{rid}'))['rankings'], final['rankings'])

    async def test_one_task_attempt_idempotency_ownership_and_immutable_condition(self):
        rid = (await self.round(['teacher']))['id']
        responses = await asyncio.gather(*(self.author.put(f'/battles/{rid}/my-task', json=TASK) for _ in range(6)))
        self.assertTrue(all(r.status_code == 200 for r in responses))
        self.assertEqual(len({r.json()['id'] for r in responses}), 1)
        task = await self.task(rid)
        tid = task['id']
        await self.call(self.other, 'POST', f'/battles/{rid}/tasks/{tid}/status', status=403, json=dict(action='withdraw'))
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/answer', status=409, json=dict(revision=task['revision'], answer='Сам себе решение'))
        body = dict(revision=task['revision'], answer='Нужно купить четыре литра краски.')
        responses = await asyncio.gather(*(self.solver.post(f'/battles/{rid}/tasks/{tid}/answer', json=body) for _ in range(5)))
        self.assertTrue(all(r.status_code == 202 for r in responses))
        self.assertEqual(len({r.json()['id'] for r in responses}), 1)
        aid = responses[0].json()['id']
        await self.call(self.solver, 'POST', f'/battles/{rid}/tasks/{tid}/answer', status=409, json=body | dict(answer='Другое решение'))
        await self.call(self.other, 'PUT', f'/battles/{rid}/attempts/{aid}/review', status=409, json=GRADE)
        self.assertEqual((await self.call(self.other, 'GET', f'/battles/{rid}'))['attempts'], [])
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', json=dict(action='withdraw'))
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', status=409, json=TASK | dict(question='Новое условие с другими числами'))
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', json=dict(action='submit'))
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/tasks/{tid}/status', json=dict(action='approve'))
        saved = (await self.call(self.solver, 'GET', f'/battles/{rid}'))['attempts'][0]
        self.assertEqual(saved['snapshot']['question'], TASK['question'])
        self.assertEqual(saved['ai_status'], 'disabled')
        # A new round grants one fresh author slot.
        next_rid = (await self.round(['teacher']))['id']
        await self.task(next_rid)

    async def test_reviewer_combinations_and_unfinished_finalization(self):
        for roles in [['teacher'], ['ai'], ['author'], ['teacher', 'ai'], ['author', 'ai'], ['teacher', 'author']]:
            rid = (await self.round(roles))['id']
            task = await self.task(rid)
            aid = (await self.answer(rid, task))['id']
            await self.call(self.admin, 'POST', f'/admin/battles/{rid}/stop')
            await self.call(self.admin, 'POST', f'/admin/battles/{rid}/finalize', status=409)
            for role in roles:
                if role == 'ai':
                    await self.worker.run_one()
                elif role == 'author':
                    await self.call(self.author, 'PUT', f'/battles/{rid}/attempts/{aid}/review', json=GRADE)
                else:
                    await self.grade(rid, aid)
            detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
            self.assertEqual(detail['attempts'][0]['score'], 10)
            self.assertEqual(set(detail['attempts'][0]['reviews']), set(roles))
            await self.call(self.admin, 'POST', f'/admin/battles/{rid}/finalize')

    async def test_ai_failure_retry_lease_and_teacher_correction(self):
        rid = (await self.round(['ai']))['id']
        task = await self.task(rid)
        aid = (await self.answer(rid, task))['id']
        self.llm.failure = LLMUnavailable('test', 'offline')
        for _ in range(3):
            async with await AsyncConnection.connect(database_dsn()) as conn:
                await conn.execute('UPDATE battle_attempts SET next_run_at=now() WHERE id=%s', (aid,))
            await self.worker.run_one()
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(detail['attempts'][0]['ai_status'], 'failed')
        self.assertIsNone(detail['attempts'][0]['score'])
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/attempts/{aid}/retry')
        self.llm.failure = None
        repo = self.worker.repo
        claims = await asyncio.gather(repo.claim(), repo.claim())
        self.assertEqual(sum(c is not None for c in claims), 1)
        old = next(c for c in claims if c)
        async with await AsyncConnection.connect(database_dsn()) as conn:
            await conn.execute("UPDATE battle_attempts SET lease_until=now()-interval '1 second' WHERE id=%s", (aid,))
        new = await repo.claim()
        await repo.finish_job(old, GRADE)
        self.assertIsNone((await self.call(self.solver, 'GET', f'/battles/{rid}'))['attempts'][0]['score'])
        await repo.finish_job(new, GRADE)
        await self.grade(rid, aid, role='ai', grade=GRADE | dict(reasoning=2), reason='Нейросеть пропустила ошибку объяснения')
        detail = await self.call(self.admin, 'GET', f'/admin/battles/{rid}')
        self.assertEqual(detail['attempts'][0]['score'], 8)
        self.assertEqual(detail['attempts'][0]['review_history']['ai'][0]['data'], GRADE)
        self.assertTrue(detail['attempts'][0]['reviews']['ai']['corrected_by_teacher'])
        await repo.finish_job(new, GRADE)  # stale worker cannot replace teacher correction
        self.assertEqual((await self.call(self.solver, 'GET', f'/battles/{rid}'))['attempts'][0]['score'], 8)

    async def test_deadlines_stale_task_guest_auth_and_ties(self):
        rid = (await self.round(['teacher']))['id']
        task = await self.task(rid)
        tid = task['id']
        await self.call(self.guest, 'PUT', f'/battles/{rid}/my-task', status=401, json=TASK)
        await self.call(self.solver, 'GET', '/admin/battles', status=401)
        await self.call(self.solver, 'POST', f'/battles/{rid}/tasks/{tid}/answer', status=409, json=dict(revision=1, answer='Ответ на устаревшее условие'))
        for client in [self.solver, self.other]:
            a = await self.answer(rid, task, client)
            await self.grade(rid, a['id'])
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual([x['place'] for x in detail['rankings']['solvers']], [1, 1])
        async with await AsyncConnection.connect(database_dsn()) as conn:
            await conn.execute("UPDATE battle_rounds SET task_deadline=now()-interval '2 hours',solve_deadline=now()-interval '1 hour' WHERE id=%s", (rid,))
        await self.call(self.other, 'PUT', f'/battles/{rid}/my-task', status=409, json=TASK)
        await self.call(self.other, 'PUT', f'/battles/{rid}/tasks/{tid}/like', status=409, json=dict(enabled=True))
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/stop')
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/finalize')

    async def test_bad_ai_output_not_counted_and_no_student_identity_sent(self):
        rid = (await self.round(['ai']))['id']
        task = await self.task(rid)
        await self.answer(rid, task)
        async def invalid(*args, **kwargs):
            return ChatReply(json.dumps(GRADE | dict(reasoning=99)))
        self.llm.chat = invalid
        await self.worker.run_one()
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(detail['attempts'][0]['ai_status'], 'queued')
        self.assertIsNone(detail['attempts'][0]['score'])
        self.worker.llm = FakeLLM()
        async with await AsyncConnection.connect(database_dsn()) as conn:
            await conn.execute('UPDATE battle_attempts SET next_run_at=now()')
        await self.worker.run_one()
        payload = self.worker.llm.calls[-1][-1].text
        for student in self.people:
            self.assertNotIn(student['qr_token'], payload)
            self.assertNotIn(student['id'], payload)

    async def test_deleting_author_keeps_other_students_solutions(self):
        rid = (await self.round(['teacher', 'author']))['id']
        task = await self.task(rid)
        aid = (await self.answer(rid, task))['id']
        response = await self.admin.delete(f"/admin/students/{self.people[0]['id']}")
        self.assertEqual(response.status_code, 204, response.text)
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(len(detail['attempts']), 1)
        self.assertEqual(detail['tasks'][0]['author_name'], 'Удалённый ученик')
        guest = await self.call(self.guest, 'GET', f'/battles/{rid}')
        self.assertFalse(guest['tasks'][0]['own'])
        self.assertNotIn('PRIVATE-REFERENCE', json.dumps(guest))
        await self.grade(rid, aid)
        await self.grade(rid, aid, role='author', reason='Автор удалён, проверка выполнена учителем')
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/stop')
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/finalize')
        final = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(final['rankings']['solvers'][0]['score'], 10)
        self.assertEqual(final['rankings']['authors'], [])

    async def test_equal_fractional_totals_share_the_same_place(self):
        rid = (await self.round())['id']
        student = await self.call(self.admin, 'POST', '/admin/students', json=dict(name='Третий автор', class_label='8А'))
        await self.call(self.guest, 'POST', '/students/activate', json=dict(token=student['qr_token']))
        zero = GRADE | dict(reasoning=0, calculations=0, context=0)
        tasks = []
        for owner in (self.author, self.other, self.guest):
            task = await self.task(rid, owner)
            tasks.append(task)
            aid = (await self.answer(rid, task))['id']
            await self.grade(rid, aid, grade=zero | dict(reasoning=1))
            for role in ('author', 'ai'):
                await self.grade(rid, aid, role=role, grade=zero, reason='Проверка дробной суммы баллов')
        aid = (await self.answer(rid, tasks[0], self.other))['id']
        await self.grade(rid, aid, grade=zero | dict(reasoning=3))
        for role in ('author', 'ai'):
            await self.grade(rid, aid, role=role, grade=zero, reason='Проверка дробной суммы баллов')
        rows = (await self.call(self.solver, 'GET', f'/battles/{rid}'))['rankings']['solvers']
        self.assertEqual([row['score'] for row in rows], [1, 1])
        self.assertEqual([row['place'] for row in rows], [1, 1])

    async def test_unpublish_republish_preserves_work_and_denies_student_actions(self):
        rid = (await self.round())['id']
        task = await self.task(rid)
        tid = task['id']
        aid = (await self.answer(rid, task))['id']
        await self.call(self.solver, 'PUT', f'/battles/{rid}/tasks/{tid}/like', json=dict(enabled=True))
        await self.call(self.solver, 'PUT', f'/admin/battles/{rid}/publication', status=401, json=dict(published=False))
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/publication', json=dict(published=False))
        self.assertEqual(await self.call(self.solver, 'GET', '/battles'), [])
        for client in (self.author, self.solver, self.guest):
            await self.call(client, 'GET', f'/battles/{rid}', status=404)
        await self.call(self.other, 'PUT', f'/battles/{rid}/my-task', status=404, json=TASK)
        await self.call(self.solver, 'PUT', f'/battles/{rid}/tasks/{tid}/like', status=404, json=dict(enabled=False))
        await self.call(self.other, 'POST', f'/battles/{rid}/tasks/{tid}/answer', status=404, json=dict(revision=task['revision'], answer='Четыре литра краски'))
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', status=404, json=dict(action='withdraw'))
        await self.call(self.author, 'PUT', f'/battles/{rid}/attempts/{aid}/review', status=404, json=GRADE)
        # Teacher and queued AI may finish existing reviews while hidden.
        await self.grade(rid, aid)
        await self.worker.run_one()
        hidden = await self.call(self.admin, 'GET', f'/admin/battles/{rid}')
        self.assertFalse(hidden['round']['is_visible'])
        self.assertEqual(hidden['round']['status'], 'open')
        self.assertEqual(hidden['tasks'][0]['likes'], 1)
        self.assertEqual(hidden['attempts'][0]['id'], aid)
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/publication', json=dict(published=True))
        visible = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(visible['attempts'][0]['id'], aid)
        self.assertEqual(visible['round']['solve_deadline'], hidden['round']['solve_deadline'])
        self.assertEqual(visible['tasks'][0]['likes'], 1)
        await self.call(self.author, 'PUT', f'/battles/{rid}/attempts/{aid}/review', json=GRADE)
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/stop')
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/finalize')
        before = await self.call(self.solver, 'GET', f'/battles/{rid}')
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/publication', json=dict(published=False))
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/publication', json=dict(published=True))
        after = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(after['round']['status'], 'closed')
        self.assertEqual(after['rankings'], before['rankings'])

    async def test_delete_round_requires_admin_and_cleans_dependants(self):
        r = await self.round()
        rid = r['id']
        tid = (await self.task(rid))['id']
        task = (await self.call(self.solver, 'GET', f'/battles/{rid}'))['tasks'][0]
        aid = (await self.answer(rid, task))['id']
        await self.call(self.other, 'PUT', f'/battles/{rid}/tasks/{tid}/like', json=dict(enabled=True))
        await self.grade(rid, aid)
        job = await self.worker.repo.claim()
        await self.call(self.solver, 'DELETE', f'/admin/battles/{rid}', status=401)
        await self.call(self.admin, 'DELETE', f'/admin/battles/{rid}')
        await self.worker.repo.finish_job(job, GRADE)  # no resurrection after an in-flight response
        await self.worker.repo.finish_job(job)  # an in-flight failure is also harmless
        await self.call(self.admin, 'GET', f'/admin/battles/{rid}', status=404)
        self.assertEqual(await self.call(self.guest, 'GET', '/battles'), [])
        async with await AsyncConnection.connect(database_dsn()) as conn:
            for table in ('battle_rounds', 'battle_tasks', 'battle_attempts', 'battle_reviews', 'battle_likes'):
                count = await (await conn.execute(f'SELECT count(*) FROM {table}')).fetchone()
                self.assertEqual(count[0], 0, table)
            students = await (await conn.execute('SELECT count(*) FROM students')).fetchone()
            self.assertEqual(students[0], 3)
        # Drafts can be deleted without ever being published.
        draft = await self.round(start=False)
        await self.call(self.admin, 'PUT', f"/admin/battles/{draft['id']}/publication", status=409, json=dict(published=True))
        await self.call(self.admin, 'DELETE', f"/admin/battles/{draft['id']}")

    async def photo_round(self, roles=None):
        r = await self.round(roles or ['teacher', 'author'], start=False)
        r = await self.call(self.admin, 'PUT', f"/admin/battles/{r['id']}", json=r | dict(submission_format='photos'))
        await self.call(self.admin, 'POST', f"/admin/battles/{r['id']}/start")
        return r

    async def upload(self, rid, purpose, client=None, tid=None, status=200, content=None):
        import base64
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')
        return await self.call(client or self.author, 'POST', f'/battles/{rid}/photos', status=status,
                               params=dict(purpose=purpose, **({'task_id': tid} if tid else {})),
                               files={'file': ('photo.png', png if content is None else content, 'image/png')})

    async def test_photo_round_private_reference_human_grading_and_cleanup(self):
        rid = (await self.photo_round())['id']
        question = (await self.upload(rid, 'question'))['id']
        reference = (await self.upload(rid, 'reference'))['id']
        body = TASK | dict(question='', reference='', question_images=[question], reference_images=[reference])
        tid = (await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', json=body))['id']
        url = lambda photo: f'/battles/{rid}/photos/{photo}'
        for photo in (question, reference):
            await self.call(self.guest, 'GET', url(photo), status=404)
            self.assertEqual((await self.admin.get('/admin' + url(photo))).status_code, 200)
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', json=dict(action='submit'))
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/tasks/{tid}/status', json=dict(action='approve'))
        response = await self.guest.get(url(question))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        self.assertEqual(response.headers['content-type'], 'image/png')
        task = (await self.call(self.solver, 'GET', f'/battles/{rid}'))['tasks'][0]
        self.assertNotIn('reference_images', task)
        await self.call(self.solver, 'GET', url(reference), status=404)
        image = (await self.upload(rid, 'answer', self.solver, tid))['id']
        answer = dict(revision=task['revision'], answer='', images=[image])
        aid = (await self.call(self.solver, 'POST', f'/battles/{rid}/tasks/{tid}/answer', status=202, json=answer))['id']
        again = await self.call(self.solver, 'POST', f'/battles/{rid}/tasks/{tid}/answer', status=202, json=answer)
        self.assertEqual(again['id'], aid)
        await self.call(self.solver, 'POST', f'/battles/{rid}/tasks/{tid}/answer', status=409, json=answer | dict(answer='Другой ответ'))
        await self.upload(rid, 'answer', self.solver, tid, status=409)
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(detail['attempts'][0]['ai_status'], 'disabled')
        self.assertNotIn('reference_images', detail['attempts'][0]['snapshot'])
        self.assertFalse(await self.worker.run_one())
        for client in (self.other, self.guest):
            await self.call(client, 'GET', url(image), status=404)
        self.assertEqual((await self.author.get(url(image))).status_code, 200)
        self.assertEqual((await self.solver.get(url(image))).status_code, 200)
        # Withdrawing a task must preserve the submitted snapshot and its photos.
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', json=dict(action='withdraw'))
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', status=409, json=body)
        await self.upload(rid, 'reference', status=409)
        await self.call(self.guest, 'GET', url(question), status=404)
        self.assertEqual((await self.solver.get(url(question))).status_code, 200)
        await self.call(self.author, 'DELETE', url(reference))
        self.assertEqual((await self.admin.get('/admin' + url(reference))).status_code, 200)
        await self.call(self.author, 'POST', f'/battles/{rid}/tasks/{tid}/status', json=dict(action='submit'))
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/tasks/{tid}/status', json=dict(action='approve'))
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/attempts/{aid}/review', status=409,
                        json=dict(role='ai', grade=GRADE, reason='Нельзя включить нейросеть'))
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/attempts/{aid}/retry', status=409)
        # Even a stale queued job cannot send photo-round work to AI.
        async with await AsyncConnection.connect(database_dsn()) as conn:
            await conn.execute("UPDATE battle_attempts SET ai_status='queued' WHERE id=%s", (aid,))
        self.assertFalse(await self.worker.run_one())
        await self.grade(rid, aid, grade=GRADE | dict(reasoning=2))
        await self.call(self.author, 'PUT', f'/battles/{rid}/attempts/{aid}/review', json=GRADE)
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/stop')
        await self.call(self.admin, 'POST', f'/admin/battles/{rid}/finalize')
        final = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(final['rankings']['solvers'][0]['score'], 9)
        self.assertEqual(final['attempts'][0]['snapshot']['reference_images'], [reference])
        self.assertEqual((await self.solver.get(url(reference))).status_code, 200)
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}/publication', json=dict(published=False))
        for photo in (question, reference, image):
            await self.call(self.author, 'GET', url(photo), status=404)
            self.assertEqual((await self.admin.get('/admin' + url(photo))).status_code, 200)
        await self.call(self.admin, 'DELETE', f'/admin/battles/{rid}')
        async with await AsyncConnection.connect(database_dsn()) as conn:
            self.assertEqual((await (await conn.execute('SELECT count(*) FROM battle_photos')).fetchone())[0], 0)

    async def test_photo_rules_and_attachment_ownership(self):
        from uuid import uuid4
        r = await self.round(start=False)
        self.assertEqual(r['submission_format'], 'text')
        await self.call(self.admin, 'PUT', f"/admin/battles/{r['id']}", status=422, json=r | dict(submission_format='photos'))
        await self.call(self.admin, 'POST', f"/admin/battles/{r['id']}/start")
        await self.upload(r['id'], 'question', status=409)
        await self.call(self.author, 'PUT', f"/battles/{r['id']}/my-task", status=409, json=TASK | dict(question_images=[str(uuid4())]))
        photo_round = await self.photo_round(['teacher'])
        rid = photo_round['id']
        await self.call(self.admin, 'PUT', f'/admin/battles/{rid}', status=409,
                        json=photo_round | dict(submission_format='text', reviewers=['ai']))
        await self.upload(rid, 'question', self.guest, status=401)
        await self.upload(rid, 'question', status=409, content=b'<svg><script>alert(1)</script></svg>')
        await self.upload(rid, 'question', status=409, content=b'X' * (8 * 1024 * 1024 + 1))
        photo = (await self.upload(rid, 'reference'))['id']
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', status=409, json=TASK | dict(question_images=[photo]))
        await self.call(self.other, 'PUT', f'/battles/{rid}/my-task', status=409, json=TASK | dict(reference_images=[photo]))
        other_round = await self.photo_round()
        await self.call(self.author, 'PUT', f"/battles/{other_round['id']}/my-task", status=409, json=TASK | dict(reference_images=[photo]))
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', status=409, json=TASK | dict(reference_images=[photo, photo]))
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', status=422, json=TASK | dict(reference_images=[photo] * 4))
        pending = (await self.upload(rid, 'question'))['id']
        await self.call(self.author, 'DELETE', f'/battles/{rid}/photos/{pending}')
        await self.call(self.author, 'GET', f'/battles/{rid}/photos/{pending}', status=404)
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', json=TASK | dict(reference_images=[photo]))
        await self.call(self.author, 'DELETE', f'/battles/{rid}/photos/{photo}')
        self.assertEqual((await self.author.get(f'/battles/{rid}/photos/{photo}')).status_code, 200)
        await self.call(self.author, 'PUT', f'/battles/{rid}/my-task', json=TASK)
        await self.call(self.author, 'GET', f'/battles/{rid}/photos/{photo}', status=404)
        # Text-only answers in photo rounds are also excluded from AI grading.
        task = await self.task(rid)
        aid = (await self.answer(rid, task))['id']
        self.assertFalse(await self.worker.run_one())
        detail = await self.call(self.solver, 'GET', f'/battles/{rid}')
        self.assertEqual(detail['attempts'][0]['ai_status'], 'disabled')
        await self.grade(rid, aid)
        self.assertEqual((await self.call(self.solver, 'GET', f'/battles/{rid}'))['attempts'][0]['score'], 10)
        # A task author who isn't a reviewer cannot inspect someone else's photo answer.
        image = (await self.upload(rid, 'answer', self.other, task['id']))['id']
        await self.call(self.other, 'POST', f"/battles/{rid}/tasks/{task['id']}/answer", status=202,
                        json=dict(revision=task['revision'], images=[image]))
        await self.call(self.author, 'GET', f'/battles/{rid}/photos/{image}', status=404)
        await self.call(self.solver, 'GET', f'/battles/{rid}/photos/{image}', status=404)

    async def test_pending_photo_upload_limit_and_expiry(self):
        rid = (await self.photo_round())['id']
        for _ in range(12):
            await self.upload(rid, 'question')
        await self.upload(rid, 'question', status=409)
        async with await AsyncConnection.connect(database_dsn()) as conn:
            await conn.execute("UPDATE battle_photos SET created_at=now()-interval '25 hours' WHERE round_id=%s", (rid,))
        await self.upload(rid, 'question')
        async with await AsyncConnection.connect(database_dsn()) as conn:
            self.assertEqual((await (await conn.execute('SELECT count(*) FROM battle_photos WHERE round_id=%s', (rid,))).fetchone())[0], 1)
