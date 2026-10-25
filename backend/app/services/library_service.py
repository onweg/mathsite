"""LibraryService — разделы, которые учитель наполняет сам, и учёт просмотров.

Материал на полке бывает трёх видов: своя статья, ссылка наружу и файл.
Файл в формате PDF дополнительно заводится как материал (`materials`) и
проходит обычную индексацию — после неё он появляется в списке источников
генерации тестов и задачи недели наравне с учебниками. Прочие форматы
хранятся как вложения: извлекать из них текст нам нечем, и в генерации они
не участвуют — об этом прямо говорит интерфейс.

Просмотры пишутся в журнал. Ученик, вошедший по QR, опознан по имени и
классу; остальные идут как анонимные.
"""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from app.core.errors import Conflict, NotFound
from app.domain.library.types import (
    COLLECTION_BY_SLUG,
    COLLECTIONS,
    Collection,
    EventAction,
    ItemStat,
    LibraryEvent,
    LibraryItem,
    LibraryTotals,
    StudentStat,
)
from app.domain.student.types import Student
from app.infrastructure.repositories.library_repo import LibraryRepository
from app.services.materials_service import MaterialsService

log = logging.getLogger("mathsite.library")

MAX_FILE_BYTES = 60 * 1024 * 1024
MAX_BODY_CHARS = 60_000

#: Повторный заход того же ученика в тот же материал в эти минуты не считаем:
#: иначе перезагрузка страницы накручивает статистику.
_EVENT_THROTTLE = timedelta(minutes=15)

#: Что принимаем во вложения. SVG, HTML и XML не принимаем намеренно: файлы
#: отдаются с того же домена, что и сайт, и скрипт внутри такого файла
#: получил бы доступ к сессии учителя.
_MEDIA_TYPES: dict[str, str] = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".rtf": "application/rtf",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".epub": "application/epub+zip",
    ".djvu": "image/vnd.djvu",
    ".zip": "application/zip",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

#: Эти браузер открывает сам, остальные отдаём на скачивание.
_INLINE_TYPES = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt"}


class LibraryService:
    def __init__(
        self,
        repo: LibraryRepository,
        materials: MaterialsService,
        *,
        upload_dir: Path,
    ):
        self._repo = repo
        self._materials = materials
        self._root = upload_dir
        self._dir = upload_dir / "library"
        self._dir.mkdir(parents=True, exist_ok=True)

    # ---------- полки ----------

    async def collections(self) -> list[tuple[Collection, int]]:
        counts = await self._repo.counts_published()
        return [(c, counts.get(c.slug, 0)) for c in COLLECTIONS]

    @staticmethod
    def collection(slug: str) -> Collection:
        c = COLLECTION_BY_SLUG.get(slug)
        if not c:
            raise NotFound(f"раздел «{slug}» не существует")
        return c

    # ---------- чтение ----------

    async def published(self, collection: str) -> list[LibraryItem]:
        self.collection(collection)
        return await self._repo.list(collection, published_only=True)

    async def public_item(self, collection: str, slug: str) -> LibraryItem:
        item = await self._repo.get_by_slug(collection, slug)
        if not item or not item.is_published:
            raise NotFound("материал не найден")
        return item

    async def list_for_admin(self, collection: str | None) -> list[LibraryItem]:
        if collection:
            self.collection(collection)
        return await self._repo.list_for_admin(collection)

    async def get(self, item_id: UUID) -> LibraryItem:
        item = await self._repo.get(item_id)
        if not item:
            raise NotFound(f"материал {item_id} не найден")
        return item

    # ---------- создание ----------

    async def add_article(
        self,
        *,
        collection: str,
        title: str,
        summary: str,
        body_md: str,
        created_by: UUID | None,
    ) -> LibraryItem:
        self.collection(collection)
        if not body_md.strip():
            raise Conflict("у статьи пустой текст")
        if len(body_md) > MAX_BODY_CHARS:
            raise Conflict(f"текст длиннее {MAX_BODY_CHARS} символов")
        return await self._create(
            collection=collection,
            kind="article",
            title=title,
            summary=summary,
            body_md=body_md,
            url="",
            created_by=created_by,
        )

    async def add_link(
        self,
        *,
        collection: str,
        title: str,
        summary: str,
        url: str,
        created_by: UUID | None,
    ) -> LibraryItem:
        self.collection(collection)
        return await self._create(
            collection=collection,
            kind="link",
            title=title,
            summary=summary,
            body_md="",
            url=_check_url(url),
            created_by=created_by,
        )

    async def add_file(
        self,
        *,
        collection: str,
        title: str,
        summary: str,
        filename: str,
        content: bytes,
        created_by: UUID | None,
    ) -> LibraryItem:
        """PDF уходит в материалы (и дальше в RAG), прочее — во вложения."""
        self.collection(collection)
        if not content:
            raise Conflict("пустой файл")
        if len(content) > MAX_FILE_BYTES:
            raise Conflict(f"файл больше {MAX_FILE_BYTES // 1024 // 1024} МБ")

        suffix = Path(filename).suffix.lower()
        media_type = _MEDIA_TYPES.get(suffix)
        if not media_type:
            raise Conflict(
                f"формат {suffix or 'без расширения'} не принимаем — "
                f"подойдут {', '.join(sorted(_MEDIA_TYPES))}"
            )

        material_id: UUID | None = None
        if suffix == ".pdf":
            material = await self._materials.upload(
                title=title.strip(),
                filename=filename,
                content=content,
                created_by=created_by,
            )
            material_id = material.id
            file_rel = material.filename
        else:
            safe = f"{uuid.uuid4().hex[:12]}_{_safe_filename(filename)}"
            (self._dir / safe).write_bytes(content)
            file_rel = f"library/{safe}"

        return await self._create(
            collection=collection,
            kind="file",
            title=title,
            summary=summary,
            body_md="",
            url="",
            file_rel=file_rel,
            file_name=Path(filename).name,
            file_size=len(content),
            media_type=media_type,
            material_id=material_id,
            created_by=created_by,
        )

    async def _create(
        self,
        *,
        collection: str,
        kind,
        title: str,
        summary: str,
        body_md: str,
        url: str,
        created_by: UUID | None,
        file_rel: str = "",
        file_name: str = "",
        file_size: int = 0,
        media_type: str = "",
        material_id: UUID | None = None,
    ) -> LibraryItem:
        clean_title = title.strip()
        if not clean_title:
            raise Conflict("нужно название")
        return await self._repo.create(
            collection=collection,
            kind=kind,
            slug=await self._free_slug(collection, clean_title),
            title=clean_title,
            summary=summary.strip(),
            body_md=body_md,
            url=url,
            file_rel=file_rel,
            file_name=file_name,
            file_size=file_size,
            media_type=media_type,
            material_id=material_id,
            position=await self._repo.next_position(collection),
            created_by=created_by,
        )

    # ---------- правка ----------

    async def update(
        self,
        item_id: UUID,
        *,
        title: str | None = None,
        summary: str | None = None,
        body_md: str | None = None,
        url: str | None = None,
        collection: str | None = None,
    ) -> LibraryItem:
        item = await self.get(item_id)
        if collection is not None:
            self.collection(collection)
        if url is not None:
            url = _check_url(url)
        if body_md is not None and len(body_md) > MAX_BODY_CHARS:
            raise Conflict(f"текст длиннее {MAX_BODY_CHARS} символов")

        # Адрес статьи складывается из раздела и slug'а. Меняется название или
        # раздел — пересобираем slug, иначе в новой полке он может столкнуться
        # с чужим, а ссылка в адресной строке будет врать про содержимое.
        slug: str | None = None
        target = collection or item.collection
        if (title and title.strip() != item.title) or (
            collection and collection != item.collection
        ):
            slug = await self._free_slug(target, (title or item.title).strip(), skip=item_id)

        await self._repo.update(
            item_id,
            collection=collection,
            slug=slug,
            title=title.strip() if title is not None else None,
            summary=summary.strip() if summary is not None else None,
            body_md=body_md,
            url=url,
        )
        return await self.get(item_id)

    async def set_published(self, item_id: UUID, value: bool) -> LibraryItem:
        item = await self.get(item_id)
        if value and item.kind == "link" and not item.url:
            raise Conflict("у ссылки не указан адрес")
        await self._repo.update(item_id, is_published=value)
        return await self.get(item_id)

    async def reorder(self, collection: str, ids: list[UUID]) -> list[LibraryItem]:
        self.collection(collection)
        await self._repo.reorder(collection, ids)
        return await self._repo.list_for_admin(collection)

    async def delete(self, item_id: UUID) -> None:
        item = await self.get(item_id)
        if item.material_id:
            # Материал уносит с собой и чанки из RAG, и сам файл.
            try:
                await self._materials.delete(item.material_id)
            except NotFound:
                log.info("материал %s уже удалён", item.material_id)
        elif item.file_rel:
            try:
                self._resolve(item.file_rel).unlink(missing_ok=True)
            except OSError as e:
                log.warning("не удалось удалить файл %s: %s", item.file_rel, e)
        await self._repo.delete(item_id)

    async def run_indexing(self, material_id: UUID) -> None:
        """Фоновая индексация PDF — та же, что у вкладки «Материалы»."""
        await self._materials.run_indexing(material_id)

    # ---------- файлы ----------

    def file_path(self, item: LibraryItem) -> Path:
        if not item.file_rel:
            raise NotFound("у материала нет файла")
        path = self._resolve(item.file_rel)
        if not path.exists():
            raise NotFound("файл не найден на диске")
        return path

    @staticmethod
    def is_inline(item: LibraryItem) -> bool:
        return Path(item.file_name).suffix.lower() in _INLINE_TYPES

    def _resolve(self, file_rel: str) -> Path:
        """Путь из БД — всегда внутри upload_dir; проверяем, а не верим."""
        path = (self._root / file_rel).resolve()
        if not path.is_relative_to(self._root.resolve()):
            raise NotFound("файл не найден")
        return path

    # ---------- журнал ----------

    async def record(
        self,
        *,
        action: EventAction,
        collection: str,
        item_id: UUID | None,
        student: Student | None,
    ) -> None:
        self.collection(collection)
        if item_id is not None:
            item = await self._repo.get(item_id)
            if not item or not item.is_published:
                return  # нечего считать: черновик или уже удалённый материал
        if student and await self._throttled(action, collection, item_id, student):
            return
        await self._repo.add_event(
            item_id=item_id,
            collection=collection,
            action=action,
            student_id=student.id if student else None,
            student_name=student.name if student else "",
            class_label=student.class_label if student else "",
        )

    async def _throttled(
        self,
        action: EventAction,
        collection: str,
        item_id: UUID | None,
        student: Student,
    ) -> bool:
        last = await self._repo.last_event_at(
            item_id=item_id,
            collection=collection,
            action=action,
            student_id=student.id,
        )
        if last is None:
            return False
        return datetime.now(timezone.utc) - last < _EVENT_THROTTLE

    async def stats(
        self, collection: str | None, *, events_limit: int = 60
    ) -> tuple[LibraryTotals, list[ItemStat], list[StudentStat], list[LibraryEvent]]:
        if collection:
            self.collection(collection)
        return (
            await self._repo.totals(collection),
            await self._repo.item_stats(collection),
            await self._repo.student_stats(collection),
            await self._repo.recent_events(collection, events_limit),
        )

    # ---------- helpers ----------

    async def _free_slug(self, collection: str, title: str, *, skip: UUID | None = None) -> str:
        base = _slugify(title) or uuid.uuid4().hex[:8]
        candidate = base
        for n in range(2, 60):
            existing = await self._repo.get_by_slug(collection, candidate)
            if existing is None or existing.id == skip:
                return candidate
            candidate = f"{base}-{n}"
        return f"{base}-{uuid.uuid4().hex[:6]}"


_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

_SLUG_DROP_RE = re.compile(r"[^a-z0-9\s-]")
_SPACES_RE = re.compile(r"[\s_-]+")


def _slugify(text: str) -> str:
    """Латиницей: адрес статьи уезжает в мессенджеры, а кириллица там
    превращается в простыню процентных кодов."""
    lowered = "".join(_TRANSLIT.get(ch, ch) for ch in text.strip().lower())
    cleaned = _SLUG_DROP_RE.sub("", lowered)
    return _SPACES_RE.sub("-", cleaned).strip("-")[:80]


def _safe_filename(name: str) -> str:
    stem = unicodedata.normalize("NFKC", Path(name).stem)
    stem = re.sub(r"[^\w.-]+", "_", stem).strip("_")
    return f"{stem[:60] or 'file'}{Path(name).suffix.lower()}"


def _check_url(url: str) -> str:
    clean = url.strip()
    if not clean:
        return ""
    if not clean.startswith(("http://", "https://")):
        raise Conflict("ссылка должна начинаться с http:// или https://")
    if len(clean) > 2000:
        raise Conflict("слишком длинная ссылка")
    return clean
