"""StudentsService — создание и управление учениками.

Импорт пачкой (bulk/CSV/xlsx) живёт отдельно в `students_import_service`,
чтобы не раздувать этот сервис.
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.core.errors import Conflict, NotFound
from app.domain.student.types import Student, new_qr_token
from app.infrastructure.repositories.students_repo import StudentsRepository

log = logging.getLogger("mathsite.students")


class StudentsService:
    def __init__(self, repo: StudentsRepository):
        self._repo = repo

    async def list(self, class_label: str | None = None) -> list[Student]:
        return await self._repo.list(class_label)

    async def classes(self) -> list[tuple[str, int]]:
        return await self._repo.count_by_class()

    async def get(self, student_id: UUID) -> Student:
        s = await self._repo.get(student_id)
        if not s:
            raise NotFound(f"ученик {student_id} не найден")
        return s

    async def by_token(self, token: str) -> Student | None:
        if not token:
            return None
        return await self._repo.get_by_token(token.strip())

    async def create(
        self,
        *,
        name: str,
        class_label: str,
        note: str | None,
        created_by: UUID | None,
    ) -> Student:
        name = _clean_name(name)
        if not name:
            raise Conflict("пустое имя ученика")
        return await self._repo.create(
            name=name,
            class_label=class_label.strip(),
            qr_token=new_qr_token(),
            note=(note or None),
            created_by=created_by,
        )

    async def update(
        self,
        student_id: UUID,
        *,
        name: str | None = None,
        class_label: str | None = None,
        note: str | None = None,
    ) -> Student:
        await self._repo.update(
            student_id,
            name=_clean_name(name) if name is not None else None,
            class_label=class_label.strip() if class_label is not None else None,
            note=note,
        )
        return await self.get(student_id)

    async def regenerate_token(self, student_id: UUID) -> Student:
        await self._repo.set_token(student_id, new_qr_token())
        s = await self.get(student_id)
        log.info("student %s · token regenerated", student_id)
        return s

    async def delete(self, student_id: UUID) -> None:
        await self._repo.delete(student_id)


def _clean_name(name: str) -> str:
    return " ".join(name.split()).strip()[:120]
