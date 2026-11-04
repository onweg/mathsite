"""HTTP → authentication → services → real PostgreSQL → teacher/student views.

Only the external LLM boundary is replaced. Never run against application data.
"""
import asyncio
import json
import unittest
from uuid import uuid4

import httpx
from psycopg import AsyncConnection

from tests.support import EMAIL, PASSWORD, reset_database, sample_pdf, database_dsn
from tests.fake_llm import FakeLLM
from app.api.app_factory import create_app


class WorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        reset_database()
        self.app = create_app()
        self.lifecycle = self.app.router.lifespan_context(self.app)
        await self.lifecycle.__aenter__()
        self.addAsyncCleanup(self.lifecycle.__aexit__, None, None, None)
        await self.app.state.pool.wait(timeout=15)
        self.llm = FakeLLM()
        self.app.state.llm = self.llm
        self.admin = self.client()
        self.pupil = self.client()
        self.guest = self.client()
        login = await self.call(self.admin, 'POST', '/auth/login', json={'email': EMAIL, 'password': PASSWORD})
        self.admin.headers['Authorization'] = f"Bearer {login['access_token']}"
        self.student = await self.call(self.admin, 'POST', '/admin/students', json={'name': 'Иван Тестовый', 'class_label': '8А', 'note': 'PRIVATE-NOTE'})
        await self.call(self.pupil, 'POST', '/students/activate', json={'token': self.student['qr_token']})

    def client(self):
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test')
        self.addAsyncCleanup(client.aclose)
        return client

    async def call(self, client, method, path, status=200, **kwargs):
        response = await client.request(method, path, **kwargs)
        self.assertEqual(response.status_code, status, f'{method} {path}: {response.text}')
        return response.json() if response.content else None

    async def quiz(self):
        return await self.call(self.admin, 'POST', '/admin/quizzes', json={
            'title': 'Проверка сложения', 'topic': 'Алгебра', 'items': [
                {'position': 1, 'question_md': 'Сколько будет 2 + 2?', 'kind': 'mcq', 'choices': [{'id': 'a', 'text': 'Четыре'}, {'id': 'b', 'text': 'Пять'}], 'correct_answer': 'a', 'explanation': 'PRIVATE-EXPLANATION'}]})

    async def weekly(self, title='Задача недели'):
        task = await self.call(self.admin, 'POST', '/admin/weekly', json={'title': title, 'body_md': 'Решите x + 1 = 3', 'answer_md': 'PRIVATE-ANSWER x = 2'})
        await self.call(self.admin, 'POST', f"/admin/weekly/{task['id']}/publish")
        return task

    async def test_authentication_import_qr_rotation_and_private_profiles(self):
        await self.call(self.guest, 'POST', '/auth/login', status=401, json={'email': EMAIL, 'password': 'wrong'})
        for path in ('/admin/students', '/admin/quizzes', '/admin/weekly', '/admin/polls', '/admin/library', '/admin/materials', '/admin/analytics'):
            await self.call(self.guest, 'GET', path, status=401)
            await self.call(self.pupil, 'GET', path, status=401)
        me = await self.call(self.pupil, 'GET', '/students/me')
        self.assertEqual(me['id'], self.student['id'])
        self.assertNotIn('qr_token', me)
        self.assertNotIn('note', me)
        await self.call(self.guest, 'GET', '/students/me/attempts', status=401)
        imported = await self.call(self.admin, 'POST', '/admin/students/bulk/text', json={'text': 'Анна Первая\nПётр Второй', 'default_class_label': '8Б'})
        self.assertEqual(imported['created'], 2)
        duplicate = await self.call(self.admin, 'POST', '/admin/students/bulk/text', json={'text': 'Анна Первая', 'default_class_label': '8Б'})
        self.assertEqual(duplicate['skipped_duplicates'], 1)
        rotated = await self.call(self.admin, 'POST', f"/admin/students/{self.student['id']}/regenerate")
        self.assertNotEqual(rotated['qr_token'], self.student['qr_token'])
        await self.call(self.pupil, 'GET', '/students/me', status=401)
        await self.call(self.pupil, 'POST', '/students/activate', json={'token': rotated['qr_token']})
        await self.call(self.pupil, 'POST', '/students/logout', status=204)
        await self.call(self.pupil, 'GET', '/students/me', status=401)

    async def test_quiz_publication_grading_retries_and_statistics(self):
        quiz = await self.quiz()
        qid, iid = quiz['id'], quiz['items'][0]['id']
        self.assertEqual(await self.call(self.guest, 'GET', '/quizzes'), [])
        await self.call(self.pupil, 'POST', f'/quizzes/{qid}/attempt', status=409, json={'answers': {iid: 'a'}})
        await self.call(self.admin, 'POST', f'/admin/quizzes/{qid}/publish')
        public = await self.call(self.pupil, 'GET', f'/quizzes/{qid}')
        self.assertNotIn('correct_answer', public['items'][0])
        self.assertNotIn('PRIVATE-EXPLANATION', json.dumps(public))
        for answer, expected in (('b', 0), ('a', 1)):
            result = await self.call(self.pupil, 'POST', f'/quizzes/{qid}/attempt', json={'student_name': 'Подмена имени', 'answers': {iid: answer}})
            self.assertEqual(result['score'], expected)
            self.assertEqual(result['total'], 1)
        await self.call(self.guest, 'POST', f'/quizzes/{qid}/attempt', json={'answers': {iid: 'a'}})
        summary = await self.call(self.admin, 'GET', f'/admin/quizzes/{qid}/attempts/summary')
        self.assertEqual(summary['total_attempts'], 3)
        self.assertEqual(summary['anonymous_attempts'], 1)
        self.assertEqual(summary['students'][0]['attempts_count'], 2)
        self.assertEqual(summary['students'][0]['student_name'], self.student['name'])
        self.assertEqual(len(await self.call(self.pupil, 'GET', '/students/me/attempts')), 2)
        self.assertTrue((await self.call(self.pupil, 'GET', '/quizzes'))[0]['attempted'])
        await self.call(self.admin, 'POST', f'/admin/quizzes/{qid}/unpublish')
        await self.call(self.pupil, 'POST', f'/quizzes/{qid}/attempt', status=409, json={'answers': {iid: 'a'}})
        await self.call(self.admin, 'DELETE', f'/admin/quizzes/{qid}', status=204)
        self.assertEqual(await self.call(self.pupil, 'GET', '/students/me/attempts'), [])

    async def test_weekly_submission_review_publish_hide_and_photo(self):
        first, second = await self.weekly(), await self.weekly('Вторая задача')
        url = f"/weekly/{first['id']}/submissions"
        self.assertNotIn('PRIVATE-ANSWER', json.dumps(await self.call(self.guest, 'GET', '/weekly')))
        sent = await self.call(self.pupil, 'POST', url, data={'solution_md': 'Мой ответ', 'student_name': 'Подмена'}, files={'file': ('photo.png', b'\x89PNG\r\n\x1a\nfixture', 'image/png')})
        image = await self.pupil.get(sent['image_url'])
        self.assertEqual(image.status_code, 200)
        reviewed = await self.call(self.admin, 'PATCH', f"/admin/weekly/submissions/{sent['id']}", json={'status': 'correct', 'teacher_comment': 'Отличное решение'})
        self.assertEqual(reviewed['student_id'], self.student['id'])
        self.assertEqual((await self.call(self.pupil, 'GET', '/students/me/weekly'))[0]['teacher_comment'], 'Отличное решение')
        await self.call(self.admin, 'POST', f"/admin/weekly/{first['id']}/answer/publish", json={'answer_md': 'Разбор: вычтем 1, получим 2.'})
        for client in (self.pupil, self.guest):
            await self.call(client, 'POST', url, status=409, data={'solution_md': 'Нельзя'})
        await self.call(self.pupil, 'POST', f"/weekly/{second['id']}/submissions", data={'solution_md': 'Вторая работает'})
        await self.call(self.admin, 'POST', f"/admin/weekly/{first['id']}/answer/hide")
        sent_again = await self.call(self.pupil, 'POST', url, data={'solution_md': 'Исправлено'})
        self.assertEqual(sent_again['id'], sent['id'])
        self.assertEqual(sent_again['status'], 'new')
        self.assertEqual((await self.pupil.get(sent['image_url'])).status_code, 404)
        await self.call(self.admin, 'DELETE', f"/admin/weekly/{first['id']}", status=204)
        self.assertEqual(len(await self.call(self.pupil, 'GET', '/students/me/weekly')), 1)

    async def test_weekly_publication_serializes_with_inflight_submission(self):
        task = await self.weekly()
        conn = await AsyncConnection.connect(database_dsn())
        self.addAsyncCleanup(conn.close)
        # Hold the actual publication UPDATE open while the HTTP submission waits.
        await conn.execute('UPDATE weekly_tasks SET is_answer_published=true WHERE id=%s', (task['id'],))
        pending = asyncio.create_task(self.pupil.post(f"/weekly/{task['id']}/submissions", data={'solution_md': 'Ответ'}))
        try:
            # Wait for a lock waiter, rather than relying on an arbitrary sleep.
            async with await AsyncConnection.connect(database_dsn(), autocommit=True) as observer:
                for _ in range(100):
                    row = await (await observer.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).fetchone()
                    if row[0]:
                        break
                    await asyncio.sleep(.02)
                else:
                    self.fail('submission did not wait for task publication lock')
            self.assertFalse(pending.done())
            await conn.commit()
            response = await asyncio.wait_for(pending, 5)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(await self.call(self.admin, 'GET', f"/admin/weekly/{task['id']}/submissions"), [])
        finally:
            await conn.rollback()
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)

    async def test_poll_answer_edit_profile_and_teacher_results(self):
        poll = await self.call(self.admin, 'POST', '/admin/polls', json={'title': 'Что повторить?', 'options': ['Алгебра', 'Геометрия']})
        pid = poll['id']
        await self.call(self.admin, 'POST', f'/admin/polls/{pid}/publish')
        url = f'/polls/{pid}/answer'
        await self.call(self.pupil, 'POST', url, status=409, json={'option_ids': [str(uuid4())]})
        first = await self.call(self.pupil, 'POST', url, json={'option_ids': [poll['options'][0]['id']], 'comment': 'Мой комментарий'})
        second = await self.call(self.pupil, 'POST', url, json={'option_ids': [poll['options'][1]['id']], 'comment': 'Изменил ответ'})
        self.assertEqual(first['id'], second['id'])
        results = await self.call(self.admin, 'GET', f'/admin/polls/{pid}/results')
        self.assertEqual(results['total_answers'], 1)
        self.assertEqual([t['votes'] for t in results['tallies']], [0, 1])
        self.assertEqual((await self.call(self.pupil, 'GET', '/students/me/polls'))[0]['chosen'], ['Геометрия'])
        await self.call(self.admin, 'POST', f'/admin/polls/{pid}/unpublish')
        await self.call(self.pupil, 'POST', url, status=409, json={'option_ids': [poll['options'][0]['id']]})

    async def test_library_article_file_views_and_unpublication(self):
        article = await self.call(self.admin, 'POST', '/admin/library', json={'collection': 'around', 'kind': 'article', 'title': 'Симметрия', 'body_md': 'Математика вокруг нас'})
        detail = f"/library/collections/around/items/{article['slug']}"
        await self.call(self.guest, 'GET', detail, status=404)
        await self.call(self.admin, 'POST', f"/admin/library/{article['id']}/publish")
        self.assertEqual((await self.call(self.pupil, 'GET', detail))['body_md'], 'Математика вокруг нас')
        for _ in range(2):
            await self.call(self.pupil, 'POST', '/library/events', status=204, json={'collection': 'around', 'action': 'open', 'item_id': article['id']})
        stats = await self.call(self.admin, 'GET', '/admin/library/stats')
        self.assertEqual(stats['views'], 1)
        self.assertEqual(stats['top_students'][0]['student_id'], self.student['id'])
        await self.call(self.admin, 'POST', f"/admin/library/{article['id']}/unpublish")
        await self.call(self.pupil, 'GET', detail, status=404)
        await self.call(self.admin, 'POST', '/admin/library', status=409, json={'collection': 'around', 'kind': 'link', 'title': 'Unsafe', 'url': 'javascript:alert(1)'})
        file = await self.call(self.admin, 'POST', '/admin/library/upload', data={'title': 'Картинка', 'collection': 'around'}, files={'file': ('figure.png', b'\x89PNG\r\n\x1a\nfixture', 'image/png')})
        await self.call(self.admin, 'POST', f"/admin/library/{file['id']}/publish")
        download = await self.pupil.get(file['file_url'])
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download.headers['x-content-type-options'], 'nosniff')

    async def test_pdf_index_search_generate_refine_and_delete(self):
        upload = await self.call(self.admin, 'POST', '/admin/materials', data={'title': 'Тестовый учебник'}, files={'file': ('algebra.pdf', sample_pdf(), 'application/pdf')})
        mid = upload['material']['id']
        material = await self.call(self.admin, 'GET', f'/admin/materials/{mid}')
        self.assertEqual(material['status'], 'ready', material)
        self.assertGreater(material['chunks_count'], 0)
        preview = await self.call(self.admin, 'POST', '/admin/quizzes/source-preview', json={'topic': 'Уравнения', 'source_key': material['source_key']})
        self.assertTrue(preview['hits'])
        quiz = await self.call(self.admin, 'POST', '/admin/quizzes/generate', json={'title': 'Из учебника', 'topic': 'Уравнения', 'items_count': 1, 'source_key': material['source_key']})
        self.assertEqual(quiz['status'], 'draft')
        refined = await self.call(self.admin, 'POST', f"/admin/quizzes/{quiz['id']}/refine", json={'instruction': 'Упрости вопрос'})
        self.assertEqual(len(refined['items']), 1)
        weekly = await self.call(self.admin, 'POST', '/admin/weekly/generate', json={'topic': 'Уравнения', 'source_key': material['source_key']})
        self.assertFalse(weekly['is_published'])
        await self.call(self.admin, 'POST', f"/admin/weekly/{weekly['id']}/refine", json={'instruction': 'Упрости решение'})
        await self.call(self.admin, 'DELETE', f'/admin/materials/{mid}', status=204)
        preview = await self.call(self.admin, 'POST', '/admin/quizzes/source-preview', json={'topic': 'Уравнения', 'source_key': material['source_key']})
        self.assertEqual(preview['hits'], [])

    async def test_analytics_identity_filters_and_private_ai_pipeline(self):
        quiz = await self.quiz()
        await self.call(self.admin, 'POST', f"/admin/quizzes/{quiz['id']}/publish")
        await self.call(self.pupil, 'POST', f"/quizzes/{quiz['id']}/attempt", json={'answers': {quiz['items'][0]['id']: 'a'}})
        pulse = {'id': str(uuid4()), 'visit_id': str(uuid4()), 'page': 'weekly', 'active_seconds': 0, 'student_id': str(uuid4())}
        for _ in range(2):
            await self.call(self.pupil, 'POST', '/analytics/pulse', status=204, json=pulse)
        report = await self.call(self.admin, 'GET', '/admin/analytics')
        self.assertEqual(report['totals']['visits'], 1)
        self.assertEqual(report['totals']['quiz_attempts'], 1)
        self.assertEqual(report['students'][0]['id'], self.student['id'])
        filtered = await self.call(self.admin, 'GET', '/admin/analytics?class_label=8Б')
        self.assertEqual(filtered['totals']['quiz_attempts'], 0)
        result = await self.call(self.admin, 'POST', '/admin/analytics/insights', json={})
        self.assertEqual(result['provider'], 'test-fixture')
        outgoing = self.llm.calls[-1][-1].text
        for secret in (self.student['name'], self.student['id'], self.student['qr_token'], 'PRIVATE-NOTE', quiz['title'], quiz['id'], EMAIL, PASSWORD):
            self.assertNotIn(secret, outgoing)
        self.assertEqual(json.loads(outgoing)['site']['quiz_attempts'], 1)

    async def test_chat_pipeline_and_provider_failure(self):
        request = {'messages': [{'role': 'user', 'text': 'Как решить уравнение x + 1 = 3?'}], 'topic': 'algebra'}
        response = await self.call(self.pupil, 'POST', '/chat', json=request)
        self.assertIn('x = 2', response['text'])
        self.assertEqual(len(self.llm.calls), 2)  # classifier and teacher
        from app.core.errors import LLMUnavailable
        self.llm.failure = LLMUnavailable('test-fixture', 'offline')
        failed = await self.pupil.post('/chat', json=request)
        self.assertEqual(failed.status_code, 502)
