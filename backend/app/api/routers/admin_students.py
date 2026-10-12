"""Админ-эндпоинты учеников: CRUD + 3 способа импорта + regenerate token."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import (
    get_current_admin,
    get_students_import_service,
    get_students_service,
)
from app.core.errors import Conflict
from app.domain.auth.types import User
from app.domain.student.types import Student
from app.schemas.student import (
    BulkImportTextRequest,
    ClassSummaryDTO,
    CreateStudentRequest,
    ImportResultDTO,
    ImportRowErrorDTO,
    StudentDTO,
    UpdateStudentRequest,
)
from app.services.students_import_service import ImportResult, StudentsImportService
from app.services.students_service import StudentsService

router = APIRouter(prefix="/admin/students", tags=["admin:students"])

_MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB — список класса явно не больше


def _dto(s: Student) -> StudentDTO:
    return StudentDTO(
        id=str(s.id),
        name=s.name,
        class_label=s.class_label,
        qr_token=s.qr_token,
        note=s.note,
    )


def _import_dto(r: ImportResult) -> ImportResultDTO:
    return ImportResultDTO(
        created=r.created,
        skipped_duplicates=r.skipped_duplicates,
        errors=[
            ImportRowErrorDTO(line=e.line, source=e.source, reason=e.reason)
            for e in r.errors
        ],
    )


@router.get("", response_model=list[StudentDTO])
async def list_all(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsService, Depends(get_students_service)],
    class_label: str | None = None,
) -> list[StudentDTO]:
    students = await svc.list(class_label)
    return [_dto(s) for s in students]


@router.get("/classes", response_model=list[ClassSummaryDTO])
async def list_classes(
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsService, Depends(get_students_service)],
) -> list[ClassSummaryDTO]:
    rows = await svc.classes()
    return [ClassSummaryDTO(class_label=label, count=cnt) for label, cnt in rows]


@router.post("", response_model=StudentDTO)
async def create(
    body: CreateStudentRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsService, Depends(get_students_service)],
) -> StudentDTO:
    student = await svc.create(
        name=body.name,
        class_label=body.class_label,
        note=body.note,
        created_by=user.id,
    )
    return _dto(student)


@router.post("/bulk/text", response_model=ImportResultDTO)
async def bulk_text(
    body: BulkImportTextRequest,
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsImportService, Depends(get_students_import_service)],
) -> ImportResultDTO:
    r = await svc.from_text(
        body.text,
        default_class_label=body.default_class_label,
        created_by=user.id,
    )
    return _import_dto(r)


@router.post("/bulk/csv", response_model=ImportResultDTO)
async def bulk_csv(
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsImportService, Depends(get_students_import_service)],
    file: Annotated[UploadFile, File(...)],
    default_class_label: Annotated[str, Form("")] = "",
) -> ImportResultDTO:
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise Conflict(f"файл больше {_MAX_UPLOAD_BYTES // 1024} KB")
    r = await svc.from_csv(data, default_class_label=default_class_label, created_by=user.id)
    return _import_dto(r)


@router.post("/bulk/xlsx", response_model=ImportResultDTO)
async def bulk_xlsx(
    user: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsImportService, Depends(get_students_import_service)],
    file: Annotated[UploadFile, File(...)],
    default_class_label: Annotated[str, Form("")] = "",
) -> ImportResultDTO:
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise Conflict(f"файл больше {_MAX_UPLOAD_BYTES // 1024} KB")
    r = await svc.from_xlsx(data, default_class_label=default_class_label, created_by=user.id)
    return _import_dto(r)


@router.patch("/{student_id}", response_model=StudentDTO)
async def update(
    student_id: UUID,
    body: UpdateStudentRequest,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsService, Depends(get_students_service)],
) -> StudentDTO:
    s = await svc.update(
        student_id,
        name=body.name,
        class_label=body.class_label,
        note=body.note,
    )
    return _dto(s)


@router.post("/{student_id}/regenerate", response_model=StudentDTO)
async def regenerate(
    student_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsService, Depends(get_students_service)],
) -> StudentDTO:
    return _dto(await svc.regenerate_token(student_id))


@router.delete("/{student_id}", status_code=204)
async def delete(
    student_id: UUID,
    _: Annotated[User, Depends(get_current_admin)],
    svc: Annotated[StudentsService, Depends(get_students_service)],
) -> None:
    await svc.delete(student_id)
