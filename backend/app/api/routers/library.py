"""Публичные эндпоинты библиотеки: полки, материалы, файлы, учёт просмотров."""

from __future__ import annotations

from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from app.api.deps import (
    client_ip,
    get_library_service,
    get_optional_student,
    get_rate_limiter,
)
from app.core.errors import Conflict, RateLimited
from app.domain.library.types import LibraryItem
from app.domain.student.types import Student
from app.infrastructure.ratelimit.base import RateLimiter
from app.schemas.library import (
    CollectionDTO,
    LibraryItemDetailDTO,
    LibraryItemPublicDTO,
    RecordEventRequest,
)
from app.services.library_service import LibraryService

router = APIRouter(prefix="/library", tags=["library"])


def public_dto(item: LibraryItem) -> LibraryItemPublicDTO:
    return LibraryItemPublicDTO(
        id=str(item.id),
        collection=item.collection,
        kind=item.kind,
        slug=item.slug,
        title=item.title,
        summary=item.summary,
        url=item.url,
        file_url=f"/library/items/{item.id}/file" if item.file_rel else None,
        file_name=item.file_name,
        file_size=item.file_size,
        media_type=item.media_type,
        has_body=bool(item.body_md.strip()),
    )


def detail_dto(item: LibraryItem) -> LibraryItemDetailDTO:
    return LibraryItemDetailDTO(**public_dto(item).model_dump(), body_md=item.body_md)


@router.get("/collections", response_model=list[CollectionDTO])
async def collections(
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> list[CollectionDTO]:
    return [
        CollectionDTO(slug=c.slug, title=c.title, subtitle=c.subtitle, count=n)
        for c, n in await svc.collections()
    ]


@router.get("/collections/{slug}/items", response_model=list[LibraryItemPublicDTO])
async def collection_items(
    slug: str,
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> list[LibraryItemPublicDTO]:
    return [public_dto(i) for i in await svc.published(slug)]


@router.get(
    "/collections/{slug}/items/{item_slug}", response_model=LibraryItemDetailDTO
)
async def collection_item(
    slug: str,
    item_slug: str,
    svc: Annotated[LibraryService, Depends(get_library_service)],
) -> LibraryItemDetailDTO:
    return detail_dto(await svc.public_item(slug, item_slug))


@router.get("/items/{item_id}/file")
async def file(
    item_id: UUID,
    svc: Annotated[LibraryService, Depends(get_library_service)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
    preview: Annotated[bool, Query()] = False,
) -> FileResponse:
    """Файл материала.

    `preview=1` ставит админка: свои же открывания учителя не должны
    попадать в статистику класса.
    """
    item = await svc.get(item_id)
    path = svc.file_path(item)
    if not preview and item.is_published:
        await svc.record(
            action="file", collection=item.collection, item_id=item.id, student=student
        )

    headers = {
        "Cache-Control": "private, max-age=600",
        # Файлы отдаются с домена сайта: запрещаем браузеру угадывать тип
        # в обход заявленного.
        "X-Content-Type-Options": "nosniff",
    }
    if LibraryService.is_inline(item):
        headers["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(item.file_name)}"
        return FileResponse(path, media_type=item.media_type, headers=headers)
    return FileResponse(
        path,
        media_type=item.media_type,
        headers=headers,
        filename=item.file_name or "file",
    )


@router.post("/events", status_code=204, response_model=None)
async def record_event(
    body: RecordEventRequest,
    svc: Annotated[LibraryService, Depends(get_library_service)],
    rate_limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
    ip: Annotated[str, Depends(client_ip)],
    student: Annotated[Student | None, Depends(get_optional_student)] = None,
) -> None:
    """Отметка «открыл раздел / статью / ушёл по ссылке».

    Лимитер тут не ради защиты данных, а чтобы вкладка, застрявшая в цикле
    перезагрузок, не залила журнал.
    """
    bucket = f"library_event:{student.id}" if student else f"library_event:anon:{ip}"
    ok, reason = rate_limiter.check(bucket)
    if not ok:
        raise RateLimited(reason)

    try:
        item_id = UUID(body.item_id) if body.item_id else None
    except ValueError as e:
        raise Conflict("нечитаемый id материала") from e

    await svc.record(
        action=body.action,
        collection=body.collection,
        item_id=item_id,
        student=student,
    )
