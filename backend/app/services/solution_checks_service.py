import asyncio
import json
import logging
import random
from uuid import uuid4

from pydantic import ValidationError

from app.core.errors import LLMBadResponse, LLMUnavailable
from app.domain.chat.types import Message
from app.domain.llm_json import extract_json
from app.domain.solution_checks import Exercise, AIGrade, GENERATION_PROMPT, GRADING_PROMPT

log = logging.getLogger('mathsite.solution_checks')


def exercise_dto(task, *, private=False):
    data = task['data']
    out = dict(id=str(task['id']), revision=task['revision'], status=task['status'],
               title=data['title'], topic=data['topic'], difficulty=data['difficulty'], question_md=data['question_md'])
    out['solutions'] = [dict(s) if private else dict(id=s['id'], body_md=s['body_md']) for s in data['solutions']]
    if not private:
        random.shuffle(out['solutions'])
    return out


def attempt_dto(row, *, private=False):
    snapshot = row['snapshot']
    teacher = row['teacher_result']
    result = row['ai_result']
    out = dict(id=str(row['id']), task_id=str(row['task_id']), title=snapshot['title'],
               question_md=snapshot['question_md'], status=row['status'], answer=row['answer'],
               created_at=row['created_at'].isoformat(), ai_result=result,
               teacher_result={k: teacher[k] for k in ('score', 'feedback')} if teacher else None,
               solutions=[dict(id=s['id'], body_md=s['body_md']) for s in snapshot['solutions']])
    if private or row['status'] == 'graded':
        out['solutions'] = snapshot['solutions']
    if private:
        out.update(student_id=str(row['student_id']), student_name=row.get('student_name'),
                   class_label=row.get('class_label'), tries=row['tries'], model_version=row['model_version'])
    return out


class SolutionChecksService:
    def __init__(self, repo, llm):
        self.repo, self.llm = repo, llm

    async def generate(self, body, user_id):
        # Invalid generations never become published tasks.
        for _ in range(2):
            try:
                async with asyncio.timeout(55):
                    reply = await self.llm.chat([Message(role='system', text=GENERATION_PROMPT),
                                                Message(role='user', text=body.model_dump_json())],
                                               temperature=.3, max_tokens=6000, response_schema=Exercise.model_json_schema())
            except TimeoutError as exc:
                raise LLMUnavailable(self.llm.name, 'генерация заняла слишком много времени; попробуй ещё раз') from exc
            try:
                exercise = Exercise.model_validate_json(extract_json(reply.text))
                return await self.save(exercise, user_id)
            except (ValueError, ValidationError, LLMBadResponse):
                continue
        raise LLMBadResponse('Не удалось получить четыре разных решения с одним правильным. Попробуй уточнить тему.')

    async def save(self, body, user_id, task_id=None):
        data = body.model_dump()
        for solution in data['solutions']:
            solution['id'] = str(uuid4())
        random.shuffle(data['solutions'])
        return exercise_dto(await self.repo.save_task(data, user_id, task_id), private=True)

    async def run_one(self):
        job = await self.repo.claim()
        if not job:
            return False
        try:
            snapshot, answer = job['snapshot'], job['answer']
            selected = answer['selected_id']
            to_grade = [dict(solution_id=s['id'], solution=s['body_md'], rubric=s['error_explanation'],
                             student_explanation=answer['explanations'][s['id']])
                        for s in snapshot['solutions'] if not s['is_correct'] and s['id'] != selected]
            payload = dict(question=snapshot['question_md'], to_grade=to_grade)
            async with asyncio.timeout(55):
                reply = await self.llm.chat([Message(role='system', text=GRADING_PROMPT),
                                            Message(role='user', text=json.dumps(payload, ensure_ascii=False))],
                                           temperature=0, max_tokens=2500, response_schema=AIGrade.model_json_schema())
            grade = AIGrade.model_validate_json(extract_json(reply.text))
            expected_ids = {g['solution_id'] for g in to_grade}
            if len(grade.grades) != len(expected_ids) or {g.solution_id for g in grade.grades} != expected_ids:
                raise ValueError('invalid grade references')
            by_id = {g.solution_id: g for g in grade.grades}
            correct_id = next(s['id'] for s in snapshot['solutions'] if s['is_correct'])
            choice_points = int(selected == correct_id)
            items = []
            for s in snapshot['solutions']:
                if s['is_correct']:
                    items.append(dict(solution_id=s['id'], points=None, feedback='Это правильное решение.' if choice_points else 'Это решение верно; в нём не нужно искать ошибку.'))
                elif s['id'] == selected:
                    items.append(dict(solution_id=s['id'], points=0, feedback='Ты выбрал это решение как правильное, поэтому его ошибка осталась без объяснения.'))
                else:
                    items.append(by_id[s['id']].model_dump())
            result = dict(score=choice_points + sum(g.points for g in grade.grades), total=7,
                          choice_correct=bool(choice_points), choice_points=choice_points, items=items)
            await self.repo.complete(job, result, reply.model_version, reply.usage or {})
        except asyncio.CancelledError:
            # The persisted lease makes the job recoverable after restart.
            raise
        except Exception as exc:
            log.warning('solution grading failed: attempt=%s type=%s', job['id'], type(exc).__name__)
            await self.repo.fail(job)
        return True


async def grading_loop(state):
    # One request per application worker; SKIP LOCKED coordinates multiple workers.
    while True:
        try:
            worked = await SolutionChecksService(state.solution_checks_repo, state.solution_llm).run_one()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning('solution queue unavailable: %s', type(exc).__name__)
            worked = False
        await asyncio.sleep(.2 if worked else 2)
