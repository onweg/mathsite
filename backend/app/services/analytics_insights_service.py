import asyncio
import json
from datetime import date, datetime, timedelta, timezone

from pydantic import ValidationError

from app.core.errors import Conflict, LLMBadResponse, LLMUnavailable
from app.domain.analytics_insights import ModelInsights, SYSTEM_PROMPT, build_snapshot
from app.domain.chat.types import Message
from app.domain.llm_json import extract_json
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.repositories.analytics_insights_repo import AnalyticsInsightsRepository
from app.services.analytics_service import period_bounds


class AnalyticsInsightsService:
    def __init__(self, repo: AnalyticsInsightsRepository, llm: LLMProvider):
        self._repo = repo
        self._llm = llm

    async def analyze(self, start: date | None, end: date | None) -> dict:
        since, until = period_bounds(start, end)
        raw = await self._repo.snapshot(since, until)
        payload, entities, coverage = build_snapshot(raw)
        if not any(payload['site'].get(k) for k in (
            'visits', 'quiz_attempts', 'library_events', 'weekly_submissions', 'poll_answers',
        )):
            raise Conflict('За этот период ещё нет активности для анализа. Выбери другой период.')
        payload['period'] = {'start': start.isoformat() if start else None,
                             'end': (until.date() - timedelta(days=1)).isoformat()}
        context = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
        if len(context) > 48000:
            raise Conflict('Сводка слишком большая. Выбери более короткий период.')
        try:
            async with asyncio.timeout(55):
                reply = await self._llm.chat([
                    Message(role='system', text=SYSTEM_PROMPT),
                    Message(role='user', text=context),
                ], temperature=0.2, max_tokens=3200)
        except TimeoutError as e:
            raise LLMUnavailable(self._llm.name, 'время ожидания анализа истекло') from e
        try:
            result = ModelInsights.model_validate_json(extract_json(reply.text))
            references = [f.ref for f in result.findings] + [s.ref for s in result.next_steps]
            if any(ref not in entities for ref in references):
                raise ValueError('unknown reference')
            if any(len(item) > 600 for item in result.limitations):
                raise ValueError('oversized limitation')
        except (ValueError, ValidationError, LLMBadResponse) as e:
            # Don't echo the raw model response into logs or errors.
            raise LLMBadResponse('Не удалось прочитать анализ. Попробуй сформировать его ещё раз.') from e

        findings = []
        for finding in result.findings:
            entity = entities[finding.ref]
            item = finding.model_dump() | entity
            if entity['kind'] == 'quizzes' and (entity['metrics'].get('first_attempts') or 0) < 5:
                item['confidence'] = 'low'
            findings.append(item)
        return {
            'summary': result.summary,
            'findings': findings,
            'next_steps': [step.model_dump() | {'title': entities[step.ref]['title']} for step in result.next_steps],
            'limitations': result.limitations,
            'coverage': coverage,
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'period': payload['period'],
            'provider': self._llm.name,
        }
