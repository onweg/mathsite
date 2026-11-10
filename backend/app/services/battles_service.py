import asyncio
import json
import logging

from app.domain.battles import BATTLE_PROMPT, ReviewInput
from app.domain.chat.types import Message
from app.domain.llm_json import extract_json

log = logging.getLogger('mathsite.battles')


class BattlesGrading:
    def __init__(self, repo, llm):
        self.repo, self.llm = repo, llm

    async def run_one(self):
        job = await self.repo.claim()
        if job is None:
            return False
        try:
            payload = dict(task=job['snapshot'], answer=job['answer'])
            async with asyncio.timeout(55):
                response = await self.llm.chat([
                    Message(role='system', text=BATTLE_PROMPT),
                    Message(role='user', text=json.dumps(payload, ensure_ascii=False)),
                ], temperature=0, max_tokens=2000, response_schema=ReviewInput.model_json_schema())
            grade = ReviewInput.model_validate_json(extract_json(response.text))
            await self.repo.finish_job(job, grade.model_dump() | dict(model_version=response.model_version))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning('battle grading failed: attempt=%s type=%s', job['id'], type(exc).__name__)
            await self.repo.finish_job(job)
        return True


async def battle_grading_loop(state):
    while True:
        try:
            worked = await BattlesGrading(state.battles_repo, state.solution_llm).run_one()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning('battle queue unavailable: %s', type(exc).__name__)
            worked = False
        await asyncio.sleep(.2 if worked else 2)
