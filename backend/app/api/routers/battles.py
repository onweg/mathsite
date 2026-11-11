from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.api.deps import get_current_admin, get_current_student, get_optional_student
from app.api.routers.solution_checks import private_response
from app.domain.battles import RoundInput, TaskInput, AnswerInput, ReviewInput, Reviewer
from app.domain.student.types import Student

router = APIRouter(prefix='/battles', tags=['battles'], dependencies=[Depends(private_response)])
admin = APIRouter(prefix='/admin/battles', tags=['admin:battles'], dependencies=[Depends(get_current_admin), Depends(private_response)])
Pupil = Annotated[Student, Depends(get_current_student)]


def repo(request: Request):
    return request.app.state.battles_repo


Repo = Annotated[object, Depends(repo)]


class TaskAction(BaseModel):
    action: Literal['submit', 'withdraw', 'approve', 'return']
    note: str = Field(default='', max_length=1500)


class LikeInput(BaseModel):
    enabled: bool


class GradeInput(BaseModel):
    role: Reviewer
    grade: ReviewInput
    reason: str = Field(default='', max_length=1500)


class PublicationInput(BaseModel):
    published: bool


@admin.get('')
async def admin_list(db: Repo):
    return await db.list(admin=True)


@admin.post('')
async def create(body: RoundInput, db: Repo):
    return await db.save_round(body)


@admin.put('/{rid}')
async def update(rid: UUID, body: RoundInput, db: Repo):
    return await db.save_round(body, rid)


@admin.get('/{rid}')
async def admin_detail(rid: UUID, db: Repo):
    return await db.detail(rid, admin=True)


@admin.put('/{rid}/publication')
async def publication_round(rid: UUID, body: PublicationInput, db: Repo):
    await db.publication(rid, body.published)
    return {'ok': True}


@admin.delete('/{rid}')
async def delete_round(rid: UUID, db: Repo):
    await db.delete(rid)
    return {'ok': True}


@admin.post('/{rid}/{action}')
async def transition(rid: UUID, action: Literal['start', 'stop', 'finalize'], db: Repo):
    await db.transition(rid, action)
    return {'ok': True}


@admin.post('/{rid}/tasks/{tid}/status')
async def moderate(rid: UUID, tid: UUID, body: TaskAction, db: Repo):
    await db.task_action(rid, tid, body.action, admin=True, note=body.note)
    return {'ok': True}


@admin.put('/{rid}/attempts/{aid}/review')
async def teacher_review(rid: UUID, aid: UUID, body: GradeInput, db: Repo):
    await db.review(rid, aid, body.role, body.grade, admin=True, reason=body.reason)
    return {'ok': True}


@admin.post('/{rid}/attempts/{aid}/retry')
async def retry(rid: UUID, aid: UUID, db: Repo):
    await db.retry(rid, aid)
    return {'ok': True}


@router.get('')
async def public_list(db: Repo):
    return await db.list()


@router.get('/{rid}')
async def detail(rid: UUID, db: Repo, student: Annotated[Student | None, Depends(get_optional_student)] = None):
    return await db.detail(rid, student.id if student else None)


@router.put('/{rid}/my-task')
async def save_task(rid: UUID, body: TaskInput, student: Pupil, db: Repo):
    return {'id': await db.save_task(rid, student.id, body)}


@router.post('/{rid}/tasks/{tid}/status')
async def publication(rid: UUID, tid: UUID, body: TaskAction, student: Pupil, db: Repo):
    await db.task_action(rid, tid, body.action, sid=student.id)
    return {'ok': True}


@router.put('/{rid}/tasks/{tid}/like')
async def like(rid: UUID, tid: UUID, body: LikeInput, student: Pupil, db: Repo):
    await db.like(rid, tid, student.id, body.enabled)
    return {'ok': True}


@router.post('/{rid}/tasks/{tid}/answer', status_code=202)
async def answer(rid: UUID, tid: UUID, body: AnswerInput, student: Pupil, db: Repo):
    return {'id': await db.answer(rid, tid, student.id, body)}


@router.put('/{rid}/attempts/{aid}/review')
async def author_review(rid: UUID, aid: UUID, body: ReviewInput, student: Pupil, db: Repo):
    await db.review(rid, aid, 'author', body, sid=student.id)
    return {'ok': True}
