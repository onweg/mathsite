import json
import asyncio

import httpx
import pytest
from pydantic import ValidationError

from app.domain.solution_checks import Exercise, AIGrade, GENERATION_PROMPT
from app.domain.chat.types import Message
from app.infrastructure.llm.yandex import YandexProvider
from app.infrastructure.llm.structured import portable_schema
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
    shape = payloads[0]['json_schema']['schema']
    assert shape['properties']['grades']['items']['properties']['points']['type'] == 'integer'
    assert '$ref' not in json.dumps(shape)
    assert 'maximum' not in json.dumps(shape)
    assert json.dumps(AIGrade.model_json_schema(), ensure_ascii=False) in payloads[0]['messages'][0]['text']
    assert 'json_schema' not in payloads[1]
    assert payloads[1]['messages'] == [{'role': 'user', 'text': 'fixture'}]


def test_portable_exercise_schema_inlines_nested_solutions_without_mutating_contract():
    schema = Exercise.model_json_schema()
    before = json.dumps(schema, sort_keys=True)
    shape = portable_schema(schema)
    assert shape['properties']['solutions']['items']['properties']['is_correct'] == {'type': 'boolean'}
    assert shape['properties']['difficulty']['enum'] == ['easy', 'medium', 'hard']
    assert '$defs' not in shape
    assert json.dumps(schema, sort_keys=True) == before


@pytest.mark.parametrize('status,structured,expected_calls', [(400, True, 2), (400, False, 1), (401, True, 1), (429, True, 1), (500, True, 1)])
def test_yandex_json_fallback_only_for_rejected_structured_requests(status, structured, expected_calls):
    asyncio.run(_fallback(status, structured, expected_calls))


async def _fallback(status, structured, expected_calls):
    from app.core.errors import LLMUnavailable
    payloads = []
    async def respond(request):
        payloads.append(json.loads(request.content))
        if len(payloads) == 1:
            return httpx.Response(status, json={'error': {'message': 'unsupported json schema'}})
        return httpx.Response(200, json={'result': {'alternatives': [{'message': {'text': '{}'}}]}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        llm = YandexProvider(folder_id='fixture', api_key='fixture', model_chat='yandexgpt-5.1', model_embed_doc='', model_embed_query='', client=client)
        messages = [Message(role='system', text='Системные правила'), Message(role='user', text='Рациональные уравнения')]
        if expected_calls == 2:
            reply = await llm.chat(messages, response_schema=Exercise.model_json_schema())
            assert reply.text == '{}'
            assert payloads[1]['json_object'] is True
            assert 'json_schema' not in payloads[1]
            assert payloads[1]['messages'] == payloads[0]['messages']
        else:
            with pytest.raises(LLMUnavailable):
                await llm.chat(messages, response_schema=Exercise.model_json_schema() if structured else None)
        assert len(payloads) == expected_calls
        assert messages[0].text == 'Системные правила'


def test_yandex_repeated_bad_request_is_bounded():
    asyncio.run(_bad_request())


async def _bad_request():
    from app.core.errors import LLMUnavailable
    calls = []
    async def respond(request):
        calls.append(request)
        return httpx.Response(400, json={'error': {'message': 'model not found'}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        llm = YandexProvider(folder_id='fixture', api_key='fixture', model_chat='invalid', model_embed_doc='', model_embed_query='', client=client)
        with pytest.raises(LLMUnavailable, match='настройку модели'):
            await llm.chat([Message(role='user', text='test')], response_schema=Exercise.model_json_schema())
    assert len(calls) == 2
