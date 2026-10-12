"""Публичный список готовых материалов — для расширения «Пропустил урок»."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_materials_service
from app.schemas.material import MaterialPublicDTO
from app.services.materials_service import MaterialsService

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=list[MaterialPublicDTO])
async def list_public(
    svc: Annotated[MaterialsService, Depends(get_materials_service)],
) -> list[MaterialPublicDTO]:
    materials = await svc.list_public()
    return [
        MaterialPublicDTO(
            id=str(m.id), title=m.title, source_key=m.source_key, chunks_count=m.chunks_count
        )
        for m in materials
    ]
