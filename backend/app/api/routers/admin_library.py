"""Админ-эндпоинты библиотеки: наполнение полок и статистика просмотров."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile

from app.api.deps import get_current_admin, get_library_service
from app.core.errors import Conflict
from app.domain.auth.types import User
from app.domain.library.types import LibraryItem
from app.schemas.library import (
    CreateItemRequest,
    EventDTO,
    ItemStatDTO,
    LibraryItemDTO,
    LibraryStatsDTO,
    ReorderRequest,
    StudentStatDTO,
    UpdateItemRequest,
)
from app.services.library_service import MAX_FILE_BYTES, LibraryService

router = APIRouter(prefix="/admin/library", tags=["admin:library"])


def _dto(item: LibraryItem) -> LibraryItemDTO:
    return LibraryItemDTO(
        id=str(item.id),
        collection=item.collection,
        kind=item.kind,
        slug=item.slug,
        title=item.title,
        summary=item.summary,
        body_md=item.body_md,
        url=item.url,
        file_url=f"/library/items/{item.id}/file" if item.file_rel else None,
        file_name=item.file_name,
        file_size=item.file_size,
        media_type=item.media_type,
        has_body=bool(item.body_md.strip()),
        is_published=item.is_published,
        position=item.position,
        material_id=str(item.material_id) if item.material_id else None,
        material_status=item.material_status,
        chunks_count=item.chunks_count,
        views=item.views,
        created_at=item.created_at.isoformat(),
    )


@router.get("", response_model=list[LibraryItemDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
    collection: Annotated[str | None, Query()] = None,
) -> list[LibraryItemDTO]:
    return [_dto(i) for i in await svc.list_for_admin(collection)]


@router.post("", response_model=LibraryItemDTO)
async def create(
    body: CreateItemRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> LibraryItemDTO:
    """Своя статья или ссылка наружу. Файл грузится отдельной ручкой."""
    if body.kind == "article":
        item = await svc.add_article(
            collection=body.collection,
            title=body.title,
            summary=body.summary,
            body_md=body.body_md,
            created_by=user.id,
        )
    else:
        item = await svc.add_link(
            collection=body.collection,
            title=body.title,
            summary=body.summary,
            url=body.url,
            created_by=user.id,
        )
    return _dto(item)


@router.post("/upload", response_model=LibraryItemDTO)
async def upload(
    background: BackgroundTasks,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
    file: Annotated[UploadFile, File(...)],
    collection: Annotated[str, Form(...)],
    title: Annotated[str, Form(...)],
    summary: Annotated[str, Form()] = "",
) -> LibraryItemDTO:
    """Файл на полку. PDF заодно уходит в индексацию и становится источником
    для генерации тестов и задачи недели."""
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise Conflict(f"файл больше {MAX_FILE_BYTES // 1024 // 1024} МБ")
    item = await svc.add_file(
        collection=collection,
        title=title,
        summary=summary,
        filename=file.filename or "file.pdf",
        content=data,
        created_by=user.id,
    )
    if item.material_id:
        background.add_task(svc.run_indexing, item.material_id)
    return _dto(item)


@router.patch("/{item_id}", response_model=LibraryItemDTO)
async def update(
    item_id: UUID,
    body: UpdateItemRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> LibraryItemDTO:
    return _dto(
        await svc.update(
            item_id,
            title=body.title,
            summary=body.summary,
            body_md=body.body_md,
            url=body.url,
            collection=body.collection,
        )
    )


@router.post("/reorder", response_model=list[LibraryItemDTO])
async def reorder(
    body: ReorderRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> list[LibraryItemDTO]:
    try:
        ids = [UUID(i) for i in body.ids]
    except ValueError as e:
        raise Conflict("в порядке материалов нечитаемый id") from e
    return [_dto(i) for i in await svc.reorder(body.collection, ids)]


@router.post("/{item_id}/publish", response_model=LibraryItemDTO)
async def publish(
    item_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> LibraryItemDTO:
    return _dto(await svc.set_published(item_id, True))


@router.post("/{item_id}/unpublish", response_model=LibraryItemDTO)
async def unpublish(
    item_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> LibraryItemDTO:
    return _dto(await svc.set_published(item_id, False))


@router.delete("/{item_id}", status_code=204, response_model=None)
async def delete(
    item_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> None:
    await svc.delete(item_id)


@router.get("/stats", response_model=LibraryStatsDTO)
async def stats(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[LibraryService, Depends(get_library_service)],
    collection: Annotated[str | None, Query()] = None,
) -> LibraryStatsDTO:
    totals, items, students, recent = await svc.stats(collection)
    return LibraryStatsDTO(
        views=totals.views,
        students=totals.students,
        views_week=totals.views_week,
        anonymous=totals.anonymous,
        items=[
            ItemStatDTO(
                item_id=str(s.item_id),
                title=s.title,
                collection=s.collection,
                kind=s.kind,
                is_published=s.is_published,
                views=s.views,
                students=s.students,
                last_view=s.last_view.isoformat() if s.last_view else None,
            )
            for s in items
        ],
        top_students=[
            StudentStatDTO(
                student_id=str(s.student_id),
                student_name=s.student_name,
                class_label=s.class_label,
                views=s.views,
                last_view=s.last_view.isoformat() if s.last_view else None,
            )
            for s in students
        ],
        recent=[
            EventDTO(
                id=str(e.id),
                item_id=str(e.item_id) if e.item_id else None,
                item_title=e.item_title,
                collection=e.collection,
                action=e.action,
                student_id=str(e.student_id) if e.student_id else None,
                student_name=e.student_name,
                class_label=e.class_label,
                created_at=e.created_at.isoformat(),
            )
            for e in recent
        ],
    )
