from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from app.api.deps import get_current_admin, get_current_student, get_optional_student
from app.core.errors import NotFound, RateLimited
from app.domain.auth.types import User
from app.domain.student.types import Student
from app.domain.solution_checks import Exercise, GenerateExercise, SubmitExplanation, TeacherGrade
from app.services.solution_checks_service import SolutionChecksService, exercise_dto, attempt_dto


def private_response(response: Response):
    response.headers['Cache-Control'] = 'private, no-store'


router = APIRouter(prefix='/solution-checks', tags=['solution checks'], dependencies=[Depends(private_response)])
admin = APIRouter(prefix='/admin/solution-checks', tags=['admin:solution checks'], dependencies=[Depends(get_current_admin), Depends(private_response)])


def service(request: Request):
    return SolutionChecksService(request.app.state.solution_checks_repo, request.app.state.solution_llm)


Svc = Annotated[SolutionChecksService, Depends(service)]
Pupil = Annotated[Student, Depends(get_current_student)]
Teacher = Annotated[User, Depends(get_current_admin)]


@admin.get('')
async def admin_list(svc: Svc):
    return [exercise_dto(t, private=True) for t in await svc.repo.list_tasks()]


@admin.post('')
async def create(body: Exercise, user: Teacher, svc: Svc):
    return await svc.save(body, user.id)


@admin.post('/generate')
async def generate(body: GenerateExercise, request: Request, user: Teacher, svc: Svc):
    ok, reason = request.app.state.solution_generation_limiter.check(str(user.id))
    if not ok:
        raise RateLimited(reason)
    return await svc.generate(body, user.id)


@admin.put('/{task_id}')
async def update(task_id: UUID, body: Exercise, user: Teacher, svc: Svc):
    return await svc.save(body, user.id, task_id)


class ApprovePublication(BaseModel):
    reviewed: Literal[True]


@admin.delete('/{task_id}')
async def delete(task_id: UUID, svc: Svc):
    await svc.repo.delete_task(task_id)
    return {'ok': True}


@admin.post('/{task_id}/publish')
async def publish(task_id: UUID, body: ApprovePublication, svc: Svc):
    return exercise_dto(await svc.repo.publication(task_id, True), private=True)


@admin.post('/{task_id}/unpublish')
async def unpublish(task_id: UUID, svc: Svc):
    return exercise_dto(await svc.repo.publication(task_id, False), private=True)


@admin.get('/{task_id}/attempts')
async def attempts(task_id: UUID, svc: Svc):
    return [attempt_dto(a, private=True) for a in await svc.repo.attempts(task_id=task_id)]


@admin.post('/attempts/{attempt_id}/retry')
async def retry(attempt_id: UUID, svc: Svc):
    await svc.repo.retry(attempt_id)
    return attempt_dto(await svc.repo.attempt(attempt_id), private=True)


@admin.put('/attempts/{attempt_id}/grade')
async def grade(attempt_id: UUID, body: TeacherGrade, user: Teacher, svc: Svc):
    await svc.repo.teacher_grade(attempt_id, body.model_dump(), user.id)
    return attempt_dto(await svc.repo.attempt(attempt_id), private=True)


@router.get('')
async def public_list(svc: Svc, student: Annotated[Student | None, Depends(get_optional_student)] = None):
    attempted = {a['task_id'] for a in await svc.repo.attempts(student_id=student.id)} if student else set()
    return [dict(id=str(t['id']), title=t['data']['title'], topic=t['data']['topic'],
                 difficulty=t['data']['difficulty'], attempted=t['id'] in attempted)
            for t in await svc.repo.list_tasks(public=True)]


@router.get('/me')
async def history(student: Pupil, svc: Svc):
    return [attempt_dto(a) for a in await svc.repo.attempts(student_id=student.id)]


@router.get('/me/{attempt_id}')
async def my_attempt(attempt_id: UUID, student: Pupil, svc: Svc):
    return attempt_dto(await svc.repo.attempt(attempt_id, student.id))


@router.get('/{task_id}')
async def public_task(task_id: UUID, student: Pupil, svc: Svc):
    task = await svc.repo.get_task(task_id)
    if task['status'] != 'published':
        raise NotFound('задание не опубликовано')
    return exercise_dto(task)


@router.post('/{task_id}/attempt', status_code=202)
async def submit(task_id: UUID, body: SubmitExplanation, student: Pupil, svc: Svc):
    attempt_id = await svc.repo.submit(task_id, student.id, body)
    return attempt_dto(await svc.repo.attempt(attempt_id, student.id))
