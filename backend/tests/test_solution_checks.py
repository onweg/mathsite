import json
import asyncio

import httpx
import pytest
from pydantic import ValidationError

from app.domain.solution_checks import Exercise, AIGrade, GENERATION_PROMPT
from app.domain.chat.types import Message
from app.infrastructure.llm.yandex import YandexProvider
from tests.fake_llm import FakeLLM


def test_exercise_rejects_ambiguous_or_duplicate_solutions():
    asyncio.run(_exercise_validation())


async def _exercise_validation():
    reply = await FakeLLM().chat([Message(role='system', text=GENERATION_PROMPT)])
    data = json.loads(reply.text)
    Exercise.model_validate(data)
    data['solutions'][1]['is_correct'] = True
    with pytest.raises(ValidationError):
        Exercise.model_validate(data)
    data['solutions'][1]['is_correct'] = False
    data['solutions'][1]['body_md'] = data['solutions'][0]['body_md']
    with pytest.raises(ValidationError):
        Exercise.model_validate(data)


@pytest.mark.parametrize('points', [-1, 3, 1.5, '2', True])
def test_model_grades_have_strict_bounded_points(points):
    with pytest.raises(ValidationError):
        AIGrade.model_validate({'grades': [{'solution_id': 'one', 'points': points, 'feedback': 'Комментарий'}] * 3})


def test_yandex_structured_schema_is_sent_only_when_requested():
    asyncio.run(_provider_schema())


async def _provider_schema():
    payloads = []
    async def respond(request):
        payloads.append(json.loads(request.content))
        return httpx.Response(200, json={'result': {'alternatives': [{'message': {'text': '{}'}}]}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        llm = YandexProvider(folder_id='fixture', api_key='fixture', model_chat='yandexgpt-5.1',
                             model_embed_doc='unused', model_embed_query='unused', client=client)
        messages = [Message(role='user', text='fixture')]
        await llm.chat(messages, response_schema=AIGrade.model_json_schema())
        await llm.chat(messages)
    assert payloads[0]['json_schema']['schema'] == AIGrade.model_json_schema()
    assert 'json_schema' not in payloads[1]
