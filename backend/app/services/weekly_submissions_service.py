"""WeeklySubmissionsService — приём и проверка решений задачи недели.

Ученик присылает текст, фото тетради или и то и другое. Фото кладётся
в `uploads/weekly/` под случайным именем; отдаётся оно по этому имени без
авторизации (capability-URL) — иначе `<img src>` в админке пришлось бы
подписывать Bearer-токеном, чего браузер не умеет.

Решение принимается только к опубликованной задаче: снял публикацию —
закрыл приём.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from uuid import UUID

from app.core.errors import Conflict, NotFound
from app.domain.student.types import Student
from app.domain.weekly.types import SubmissionStatus, WeeklySubmission
from app.infrastructure.repositories.weekly_repo import WeeklyTasksRepository
from app.infrastructure.repositories.weekly_submissions_repo import (
    WeeklySubmissionsRepository,
)

log = logging.getLogger("mathsite.weekly.submissions")

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_SOLUTION_CHARS = 4000

# Расширение → (media type, сигнатуры начала файла)
_IMAGE_TYPES: dict[str, tuple[str, tuple[bytes, ...]]] = {
    ".jpg": ("image/jpeg", (b"\xff\xd8\xff",)),
    ".jpeg": ("image/jpeg", (b"\xff\xd8\xff",)),
    ".png": ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    ".webp": ("image/webp", (b"RIFF",)),
    # HEIC/HEIF опознаётся не по началу файла, а по боксу ftyp со смещения 4
    ".heic": ("image/heic", ()),
    ".heif": ("image/heic", ()),
}


def media_type_for(filename: str) -> str:
    return _IMAGE_TYPES.get(Path(filename).suffix.lower(), ("application/octet-stream", ()))[0]


class WeeklySubmissionsService:
    def __init__(
        self,
        repo: WeeklySubmissionsRepository,
        tasks: WeeklyTasksRepository,
        *,
        upload_dir: Path,
    ):
        self._repo = repo
        self._tasks = tasks
        self._dir = upload_dir
        self._dir.mkdir(parents=True, exist_ok=True)

    # ---------- ученик ----------

    async def submit(
        self,
        task_id: UUID,
        *,
        student: Student | None,
        student_name: str,
        solution_md: str,
        image: bytes | None,
        image_name: str | None,
    ) -> WeeklySubmission:
        task = await self._tasks.get(task_id)
        if not task:
            raise NotFound("задача не найдена")
        if not task.is_published:
            raise Conflict("приём решений по этой задаче закрыт")

        solution_md = solution_md.strip()
        if len(solution_md) > MAX_SOLUTION_CHARS:
            raise Conflict(f"решение длиннее {MAX_SOLUTION_CHARS} символов")

        saved_name: str | None = None
        if image:
            saved_name = self._save_image(image, image_name or "photo.jpg")
        elif not solution_md:
            raise Conflict("нужно написать решение или приложить фото")

        name = student.name if student else (student_name.strip() or "аноним")
        submission, stale = await self._repo.upsert(
            task_id=task_id,
            student_id=student.id if student else None,
            student_name=name[:120],
            class_label=student.class_label if student else "",
            solution_md=solution_md,
            image_filename=saved_name,
        )
        if stale:
            self._remove_image(stale)

        log.info(
            "weekly submission · task=%s · student=%s · photo=%s",
            task_id, submission.student_id or "anon", bool(saved_name),
        )
        return submission

    async def mine(self, task_id: UUID, student: Student) -> WeeklySubmission | None:
        return await self._repo.get_for_student(task_id, student.id)

    async def list_for_student(
        self, student_id: UUID
    ) -> list[tuple[WeeklySubmission, str]]:
        """История отправок ученика: решение + название задачи."""
        return await self._repo.list_by_student(student_id)

    async def honor_board(self, task_id: UUID) -> list[WeeklySubmission]:
        """Те, кому учитель поставил «верно». Показываем только имя и класс."""
        return await self._repo.list_correct(task_id)

    # ---------- учитель ----------

    async def list_for_task(self, task_id: UUID) -> list[WeeklySubmission]:
        return await self._repo.list_by_task(task_id)

    async def counts(self) -> dict[UUID, tuple[int, int]]:
        return await self._repo.counts()

    async def get(self, submission_id: UUID) -> WeeklySubmission:
        s = await self._repo.get(submission_id)
        if not s:
            raise NotFound(f"решение {submission_id} не найдено")
        return s

    async def review(
        self,
        submission_id: UUID,
        *,
        status: SubmissionStatus | None,
        teacher_comment: str | None,
    ) -> WeeklySubmission:
        await self.get(submission_id)
        await self._repo.review(
            submission_id,
            status=status,
            teacher_comment=teacher_comment.strip() if teacher_comment is not None else None,
        )
        return await self.get(submission_id)

    async def delete(self, submission_id: UUID) -> None:
        s = await self.get(submission_id)
        if s.image_filename:
            self._remove_image(s.image_filename)
        await self._repo.delete(submission_id)

    # ---------- файлы ----------

    def image_path(self, filename: str) -> Path:
        """Путь к фото по имени из БД. Имя мы генерировали сами, но на вход
        сюда приходит кусок URL, поэтому проверяем его как чужой."""
        if Path(filename).name != filename or Path(filename).suffix.lower() not in _IMAGE_TYPES:
            raise NotFound("нет такого файла")
        path = self._dir / filename
        if not path.is_file():
            raise NotFound("нет такого файла")
        return path

    def _save_image(self, data: bytes, original_name: str) -> str:
        if len(data) > MAX_IMAGE_BYTES:
            raise Conflict(f"фото больше {MAX_IMAGE_BYTES // 1024 // 1024} МБ")
        suffix = Path(original_name).suffix.lower()
        if suffix not in _IMAGE_TYPES:
            raise Conflict("фото должно быть jpg, png, webp или heic")
        _, signatures = _IMAGE_TYPES[suffix]
        if signatures:
            ok = any(data.startswith(sig) for sig in signatures)
        else:
            ok = len(data) > 12 and data[4:8] == b"ftyp"
        if not ok:
            raise Conflict("это не похоже на картинку")
        name = f"{uuid.uuid4().hex}{suffix}"
        (self._dir / name).write_bytes(data)
        return name

    def _remove_image(self, filename: str) -> None:
        try:
            (self._dir / filename).unlink(missing_ok=True)
        except OSError as e:
            log.warning("не удалось удалить фото %s: %s", filename, e)
