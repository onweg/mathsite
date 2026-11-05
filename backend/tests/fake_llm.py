"""Deterministic provider at the external boundary; all app services remain real."""
import json
from app.domain.chat.types import ChatReply, ModerationResult
from app.domain.rag.prompts import CLASSIFIER_PROMPT
from app.domain.weekly.generation import SYSTEM_PROMPT as WEEKLY_PROMPT
from app.domain.analytics_insights import SYSTEM_PROMPT as INSIGHTS_PROMPT
from app.services.quiz_service import _SYSTEM_PROMPT as QUIZ_PROMPT


class FakeLLM:
    name = 'test-fixture'

    def __init__(self):
        self.calls = []
        self.failure = None

    async def chat(self, messages, *, temperature=0.4, max_tokens=2000):
        self.calls.append(messages)
        if self.failure:
            raise self.failure
        prompt = messages[0].text
        if prompt == CLASSIFIER_PROMPT:
            return ChatReply('yes')
        if prompt == INSIGHTS_PROMPT:
            payload = json.loads(messages[-1].text)
            assert 'site' in payload
            data = dict(summary='Тестовый анализ активности готов.', findings=[dict(ref='SITE', observation='Есть сохранённая активность.', recommendation='Сравните результаты за следующую неделю.', confidence='low')], next_steps=[dict(ref='SITE', action='Добавить тренировочный тест.', check='Сравнить первые попытки.')], limitations=['Небольшая выборка.'])
        elif prompt == WEEKLY_PROMPT:
            data = dict(title='Уравнение недели', body_md='Решите уравнение $x + 1 = 3$ и объясните ход решения.', answer_md='Вычтем единицу из обеих частей: $x = 2$. Ответ: 2.')
        elif prompt == QUIZ_PROMPT or prompt.startswith("Ты — учитель математики 9 класса") or prompt.startswith("Ты — учитель математики 11 класса"):
            data = dict(items=[dict(kind='mcq', question_md='Чему равно $2 + 2$?', choices=[dict(id='a', text='Четыре'), dict(id='b', text='Пять')], correct_answer='a', explanation='Складываем два и два.')])
        else:
            return ChatReply('Вычти единицу из обеих частей уравнения: $x = 2$.', model_version=self.name)
        return ChatReply(json.dumps(data, ensure_ascii=False), model_version=self.name)

    async def embed(self, text, *, kind='query'):
        return [1.0] + [0.0] * 255

    async def moderate(self, text):
        return ModerationResult(allowed=True)

    async def stream_chat(self, messages, **kwargs):
        yield (await self.chat(messages, **kwargs)).text
