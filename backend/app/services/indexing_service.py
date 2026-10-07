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
        pages = extract_pages(pdf_path)
        log.info("  %d страниц с текстом", len(pages))

        if replace:
            await self._repo.delete_by_source(source)
            log.info("  удалено старых чанков для source=%s", source)

        total = 0
        for page_num, page_text in pages:
            for text in chunk_text(page_text):
                try:
                    vec = await self._llm.embed(text, kind="doc")
                except LLMUnavailable as e:
                    log.warning("embed failed on page %d: %s", page_num, e)
                    continue
                chunk = Chunk(
                    source=source,
                    page=page_num,
                    text=text,
                    tokens=len(text.split()),
                )
                await self._repo.insert_one(chunk, vec)
                total += 1
                if total % 20 == 0:
                    log.info("  …записано %d чанков", total)
                await asyncio.sleep(_EMBED_SLEEP_S)

        log.info("готово: source=%s, chunks=%d", source, total)
        return total
