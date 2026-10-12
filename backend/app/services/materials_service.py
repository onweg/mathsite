"""MaterialsService — загрузка PDF учителем и фоновая индексация.

Жизненный цикл материала:
    pending  → загрузка принята, файл на диске, запись в БД
    indexing → фоновая задача запущена (extract → chunk → embed → repo)
    ready    → все чанки записаны, можно использовать в RAG
    failed   → индексация упала, в error_message подробности

Все переходы идут только вперёд. При удалении материала чанки чистятся по source_key.
"""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from pathlib import Path
from uuid import UUID

from app.core.errors import Conflict, NotFound
from app.domain.material.types import Material
from app.infrastructure.repositories.chunks_repo import ChunksRepository
from app.infrastructure.repositories.materials_repo import MaterialsRepository
from app.services.indexing_service import IndexingService

log = logging.getLogger("mathsite.materials")

_PDF_SUFFIXES = {".pdf"}


class MaterialsService:
    def __init__(
        self,
        repo: MaterialsRepository,
        chunks: ChunksRepository,
        indexer: IndexingService,
        *,
        upload_dir: Path,
    ):
        self._repo = repo
        self._chunks = chunks
        self._indexer = indexer
        self._upload_dir = upload_dir
        self._upload_dir.mkdir(parents=True, exist_ok=True)

    async def list(self) -> list[Material]:
        return await self._repo.list()

    async def list_public(self) -> list[Material]:
        return await self._repo.list_ready()

    async def get(self, material_id: UUID) -> Material:
        m = await self._repo.get(material_id)
        if not m:
            raise NotFound(f"материал {material_id} не найден")
        return m

    async def upload(
        self,
        *,
        title: str,
        filename: str,
        content: bytes,
        created_by: UUID | None,
    ) -> Material:
        """Сохранить файл на диск + создать запись в БД со статусом pending."""
        if Path(filename).suffix.lower() not in _PDF_SUFFIXES:
            raise Conflict("пока принимаем только PDF")
        if not content:
            raise Conflict("пустой файл")

        slug = _slugify(title)
        if not slug:
            raise Conflict("не удалось сформировать slug из названия")

        source_key = f"material_{uuid.uuid4().hex[:12]}"
        safe_name = f"{source_key}_{_safe_filename(filename)}"
        path = self._upload_dir / safe_name
        path.write_bytes(content)

        material = await self._repo.create(
            slug=slug,
            title=title.strip(),
            source_key=source_key,
            filename=safe_name,
            created_by=created_by,
        )
        log.info(
            "material uploaded · id=%s · source_key=%s · file=%s",
            material.id, material.source_key, safe_name,
        )
        return material

    async def delete(self, material_id: UUID) -> None:
        material = await self.get(material_id)
        # сначала чистим чанки, потом файл, потом запись — безопасно для догоняющих запросов
        await self._chunks.delete_by_source(material.source_key)
        try:
            (self._upload_dir / material.filename).unlink(missing_ok=True)
        except OSError as e:
            log.warning("не удалось удалить файл %s: %s", material.filename, e)
        await self._repo.delete(material_id)

    async def run_indexing(self, material_id: UUID) -> None:
        """Фоновая задача: запускается через FastAPI BackgroundTasks."""
        material = await self._repo.get(material_id)
        if not material:
            log.error("run_indexing: material %s исчез", material_id)
            return
        if material.status == "ready":
            log.info("material %s уже проиндексирован", material_id)
            return

        await self._repo.update_status(material_id, "indexing")
        path = self._upload_dir / material.filename
        try:
            count = await self._indexer.index_pdf(path, material.source_key, replace=True)
            await self._repo.update_status(
                material_id, "ready", chunks_count=count, error_message=""
            )
            log.info("material %s индексирован, chunks=%d", material_id, count)
        except Exception as e:  # noqa: BLE001 — тут общий catch оправдан
            log.exception("индексация материала %s упала", material_id)
            await self._repo.update_status(material_id, "failed", error_message=str(e)[:1000])


# ---------- helpers ----------

_SLUG_RE = re.compile(r"[^\w\s-]", re.UNICODE)
_SPACES_RE = re.compile(r"[\s_-]+")


def _slugify(text: str) -> str:
    cleaned = _SLUG_RE.sub("", text.strip().lower())
    cleaned = _SPACES_RE.sub("-", cleaned).strip("-")
    return cleaned[:80]


def _safe_filename(name: str) -> str:
    """Чистим пробелы и опасные символы в имени файла, оставляя расширение."""
    stem = Path(name).stem
    suffix = Path(name).suffix.lower()
    stem = unicodedata.normalize("NFKC", stem)
    stem = re.sub(r"[^\w.-]+", "_", stem).strip("_")
    stem = stem[:60] or "upload"
    return f"{stem}{suffix}"
