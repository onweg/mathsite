from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, UploadFile, File, Response
from pydantic import BaseModel, Field

from app.api.deps import get_current_admin, get_current_student, get_optional_student
from app.api.routers.solution_checks import private_response
from app.domain.battles import RoundInput, TaskInput, AnswerInput, ReviewInput, Reviewer
from app.domain.student.types import Student
from app.core.errors import Conflict

router = APIRouter(prefix='/battles', tags=['battles'], dependencies=[Depends(private_response)])
admin = APIRouter(prefix='/admin/battles', tags=['admin:battles'], dependencies=[Depends(get_current_admin), Depends(private_response)])
Pupil = Annotated[Student, Depends(get_current_student)]


def repo(request: Request):
    return request.app.state.battles_repo


Repo = Annotated[object, Depends(repo)]


def photo_response(photo):
    return Response(bytes(photo['content']), media_type=photo['media_type'], headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
    })


@admin.get('/{rid}/photos/{pid}')
async def admin_photo(rid: UUID, pid: UUID, db: Repo):
    return photo_response(await db.photo(rid, pid, admin=True))


@router.get('/{rid}/photos/{pid}')
async def photo(rid: UUID, pid: UUID, db: Repo,
                student: Annotated[Student | None, Depends(get_optional_student)] = None):
    return photo_response(await db.photo(rid, pid, student.id if student else None))


@router.post('/{rid}/photos')
async def upload_photo(rid: UUID, purpose: Literal['question', 'reference', 'answer'],
                       student: Pupil, db: Repo, file: UploadFile = File(...), task_id: UUID | None = None):
    try:
        content = await file.read(8 * 1024 * 1024 + 1)
    finally:
        await file.close()
    if len(content) > 8 * 1024 * 1024:
        raise Conflict('Фото больше 8 МБ. Уменьшите размер файла')
    # Allow only raster formats, detected from bytes, never a client-provided MIME.
    if content.startswith(b'\xff\xd8\xff'):
        media_type = 'image/jpeg'
    elif content.startswith(b'\x89PNG\r\n\x1a\n'):
        media_type = 'image/png'
    elif content.startswith(b'RIFF') and content[8:12] == b'WEBP':
        media_type = 'image/webp'
    else:
        raise Conflict('Нужна фотография JPG, PNG или WebP')
    if purpose == 'answer' and task_id is None:
        raise Conflict('Укажите задачу, которую решаете')
    return {'id': await db.upload_photo(rid, student.id, purpose, content, media_type, task_id)}


@router.delete('/{rid}/photos/{pid}')
async def discard_photo(rid: UUID, pid: UUID, student: Pupil, db: Repo):
    await db.discard_photo(rid, pid, student.id)
    return {'ok': True}


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
