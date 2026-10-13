"""Админ-эндпоинты материалов: загрузка PDF + просмотр статуса + удаление."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile

from app.api.deps import get_current_admin, get_materials_service
from app.core.errors import Conflict
from app.domain.auth.types import User
from app.domain.material.types import Material
from app.schemas.material import MaterialDTO, UploadResponse
from app.services.materials_service import MaterialsService

router = APIRouter(prefix="/admin/materials", tags=["admin:materials"])

_MAX_UPLOAD_BYTES = 60 * 1024 * 1024  # 60 MB — учебники умещаются


def _dto(m: Material) -> MaterialDTO:
    return MaterialDTO(
        id=str(m.id),
        slug=m.slug,
        title=m.title,
        source_key=m.source_key,
        status=m.status,
        chunks_count=m.chunks_count,
        error_message=m.error_message,
    )


@router.get("", response_model=list[MaterialDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[MaterialsService, Depends(get_materials_service)],
) -> list[MaterialDTO]:
    materials = await svc.list()
    return [_dto(m) for m in materials]


@router.post("", response_model=UploadResponse)
async def upload(
    background: BackgroundTasks,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[MaterialsService, Depends(get_materials_service)],
    file: Annotated[UploadFile, File(...)],
    title: Annotated[str, Form(...)],
) -> UploadResponse:
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise Conflict(f"файл больше {_MAX_UPLOAD_BYTES // 1024 // 1024} MB")
    material = await svc.upload(
        title=title,
        filename=file.filename or "upload.pdf",
        content=data,
        created_by=user.id,
    )
    background.add_task(svc.run_indexing, material.id)
    return UploadResponse(material=_dto(material))


@router.get("/{material_id}", response_model=MaterialDTO)
async def get_one(
    material_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[MaterialsService, Depends(get_materials_service)],
) -> MaterialDTO:
    return _dto(await svc.get(material_id))


@router.post("/{material_id}/reindex", response_model=MaterialDTO)
async def reindex(
    material_id: UUID,
    background: BackgroundTasks,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[MaterialsService, Depends(get_materials_service)],
) -> MaterialDTO:
    material = await svc.get(material_id)
    background.add_task(svc.run_indexing, material_id)
    return _dto(material)


@router.delete("/{material_id}", status_code=204, response_model=None)
async def delete(
    material_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[MaterialsService, Depends(get_materials_service)],
) -> None:
    await svc.delete(material_id)
