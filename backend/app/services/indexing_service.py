"""IndexingService — PDF → чанки → embed → repo."""

import asyncio
import logging
from pathlib import Path

from app.core.errors import LLMUnavailable
from app.domain.rag.chunk import Chunk, Source
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.pdf.chunker import chunk_text
from app.infrastructure.pdf.extractor import extract_pages
from app.infrastructure.repositories.chunks_repo import ChunksRepository

log = logging.getLogger("mathsite.indexing")

_EMBED_SLEEP_S = 0.05  # щадим rate-limit YandexGPT


class IndexingService:
    def __init__(self, llm: LLMProvider, repo: ChunksRepository):
        self._llm = llm
        self._repo = repo

    async def index_pdf(
        self,
        pdf_path: Path,
        source: Source,
        *,
        replace: bool = True,
    ) -> int:
        log.info("extract %s", pdf_path.name)
        # pypdf — синхронный CPU-bound разбор: на учебнике это десятки секунд.
        # В event loop его звать нельзя, иначе весь uvicorn замирает на время индексации.
        pages = await asyncio.to_thread(extract_pages, pdf_path)
        log.info("  %d страниц с текстом", len(pages))

        prepared: list[tuple[Chunk, list[float]]] = []
        for page_num, page_text in pages:
            for text in chunk_text(page_text):
                try:
                    vec = await self._llm.embed(text, kind="doc")
                except LLMUnavailable as e:
                    log.warning("embed failed on page %d: %s", page_num, e)
                    raise RuntimeError(
                        "Сервис подготовки поиска недоступен. Повторите обработку позже. "
                        "Ранее сохранённые фрагменты не изменены."
                    ) from e
                chunk = Chunk(
                    source=source,
                    page=page_num,
                    text=text,
                    tokens=len(text.split()),
                )
                prepared.append((chunk, vec))
                if len(prepared) % 20 == 0:
                    log.info("  …подготовлено %d фрагментов", len(prepared))
                await asyncio.sleep(_EMBED_SLEEP_S)

        if not prepared:
            raise ValueError(
                "Не удалось извлечь достаточно текста из PDF: 0 фрагментов. "
                "Проверьте, можно ли выделить и скопировать текст в файле. "
                "Если это скан, распознайте текст (OCR) и загрузите PDF с текстовым слоем."
            )
        # Publish only a complete index; a failed retry must not destroy the old one.
        total = (await self._repo.replace_source(source, prepared) if replace
                 else await self._repo.insert_many(prepared))
        log.info("готово: source=%s, chunks=%d", source, total)
        return total
