import json
import unittest
from datetime import date
from unittest.mock import AsyncMock

from app.core.errors import Conflict, LLMBadResponse, LLMUnavailable
from app.domain.analytics_insights import build_snapshot
from app.domain.chat.types import ChatReply
from app.services.analytics_insights_service import AnalyticsInsightsService


def snapshot():
    return {
        'site': {'visits': 10, 'visitors': 3, 'active_seconds': 900, 'quiz_attempts': 4,
                 'library_events': 2, 'weekly_submissions': 1, 'poll_answers': 0,
                 'api_key': 'SECRET_API_KEY'},
        'quizzes': [{'id': 'PRIVATE_QUIZ_ID', 'title': 'PRIVATE_TITLE_WITH_KEY', 'published': True,
                     'attempts': 4, 'learners': 2, 'anonymous_attempts': 1, 'average_score': 85,
                     'first_attempts': 1, 'first_average_score': 20, 'repeat_attempts': 2,
                     'first_high_scores': 0, 'first_low_scores': 1,
                     'student_name': 'PRIVATE_STUDENT', 'qr_token': 'PRIVATE_QR_TOKEN'}],
        'materials': [{'id': 'PRIVATE_MATERIAL_ID', 'title': 'PRIVATE_MATERIAL_TITLE',
                       'collection': 'around', 'kind': 'article', 'published': True,
                       'views': 0, 'readers': 0, 'article_opens': 0, 'file_opens': 0, 'link_clicks': 0,
                       'body_md': 'PRIVATE_CONTENT', 'url': 'https://private.example/SECRET'}],
        'sections': [], 'weekly': [], 'polls': [],
        'students': [{'name': 'PRIVATE_STUDENT', 'password': 'SECRET_PASSWORD'}],
    }


def answer(ref='Q1'):
    return json.dumps({
        'summary': 'Повторные попытки требуют отдельного рассмотрения.',
        'findings': [{'ref': ref, 'observation': 'Одна первая попытка с результатом 20%.',
                      'recommendation': 'Собрать больше первых попыток.', 'confidence': 'high'}],
        'next_steps': [{'ref': 'M1', 'action': 'Предложить материал на уроке.',
                        'check': 'Посмотреть изменение числа открытий за неделю.'}],
        'limitations': ['Низкие просмотры не доказывают отсутствие интереса.'],
    }, ensure_ascii=False)


class InsightsPrivacyTests(unittest.TestCase):
    def test_only_explicit_aggregates_cross_boundary(self):
        payload, entities, _ = build_snapshot(snapshot())
        outgoing = json.dumps(payload)
        for secret in ('PRIVATE', 'SECRET', 'password', 'api_key', 'qr_token', 'student_name', 'https://'):
            self.assertNotIn(secret, outgoing)
        self.assertEqual(payload['materials'][0]['views'], 0)
        self.assertEqual(entities['Q1']['title'], 'PRIVATE_TITLE_WITH_KEY')

    def test_catalog_limit_is_disclosed_and_keeps_unused_materials(self):
        raw = snapshot()
        raw['materials'] = [dict(raw['materials'][0], views=100 - i, title=str(i)) for i in range(101)]
        payload, _, coverage = build_snapshot(raw)
        self.assertEqual(coverage['materials'], {'total': 101, 'included': 80})
        self.assertEqual(payload['materials'][-1]['views'], 0)
        self.assertEqual(payload['site']['quiz_attempts'], 4)


class InsightsServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.repo = AsyncMock()
        self.repo.snapshot.return_value = snapshot()
        self.llm = AsyncMock()
        self.llm.name = 'fake'
        self.llm.chat.return_value = ChatReply(text=answer())
        self.service = AnalyticsInsightsService(self.repo, self.llm)

    async def analyze(self):
        return await self.service.analyze(date(2026, 1, 1), date(2026, 1, 31))

    async def test_safe_prompt_local_titles_and_low_sample_confidence(self):
        result = await self.analyze()
        messages = self.llm.chat.call_args.args[0]
        for message in messages:
            self.assertNotIn('PRIVATE', message.text)
            self.assertNotIn('SECRET', message.text)
        payload = json.loads(messages[1].text)
        self.assertEqual(payload['period'], {'start': '2026-01-01', 'end': '2026-01-31'})
        self.assertEqual(result['findings'][0]['title'], 'PRIVATE_TITLE_WITH_KEY')
        self.assertEqual(result['findings'][0]['confidence'], 'low')
        self.assertEqual(result['next_steps'][0]['title'], 'PRIVATE_MATERIAL_TITLE')

    async def test_empty_activity_does_not_call_provider(self):
        self.repo.snapshot.return_value['site'] = {key: 0 for key in snapshot()['site']}
        with self.assertRaises(Conflict):
            await self.analyze()
        self.llm.chat.assert_not_awaited()

    async def test_unknown_references_and_invalid_json_fail_cleanly(self):
        for text in (answer('Q999'), 'BROKEN_PRIVATE_RESPONSE'):
            self.llm.chat.return_value = ChatReply(text=text)
            with self.assertRaises(LLMBadResponse) as raised:
                await self.analyze()
            self.assertNotIn('PRIVATE', str(raised.exception))

    async def test_provider_timeout(self):
        self.llm.chat.side_effect = TimeoutError()
        with self.assertRaises(LLMUnavailable):
            await self.analyze()
