"""CLI: индексирует PDF в pgvector.

    python -m scripts.index_books                # все книги
    python -m scripts.index_books algebra        # только одну

Собираем мини-композит DI вручную — без FastAPI.
Ключи: algebra, geometry, olympiad_tasks, olympiad_answers, all.
"""

import asyncio
import logging
import sys
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.logging import setup_logging
from app.domain.rag.chunk import Source
from app.infrastructure.db.pool import create_pool
from app.infrastructure.llm.yandex import YandexProvider
from app.infrastructure.repositories.chunks_repo import PgChunksRepository
from app.services.indexing_service import IndexingService

ROOT = Path(__file__).resolve().parent.parent.parent

BOOKS: dict[str, tuple[Source, Path]] = {
    "algebra": (
        "textbook_8_algebra",
        ROOT / "1740836686_8_klass_makarychev_ju_n_i_dr_2024.pdf",
    ),
    "geometry": (
        "textbook_8_geometry",
        ROOT / "Geometriya_7_9_klassy_0.pdf",
    ),
    "olympiad_tasks": (
        "olympiad",
        ROOT / "tasks_225_1731306921 (1).pdf",
    ),
    "olympiad_answers": (
        "olympiad",
        ROOT / "task_answer_3673_1762768654.pdf",
    ),
}


async def main() -> None:
    setup_logging()
    log = logging.getLogger("mathsite.scripts.index")

    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if arg == "all":
        keys = list(BOOKS.keys())
    elif arg in BOOKS:
        keys = [arg]
    else:
        print(f"неизвестный ключ '{arg}'. доступно: {', '.join(BOOKS)}, all")
        sys.exit(1)

    pool = create_pool(settings.pg_dsn, min_size=1, max_size=4)
    await pool.open()
    http_client = httpx.AsyncClient(timeout=60)
    llm = YandexProvider(
        folder_id=settings.yc_folder_id,
        api_key=settings.yc_api_key,
        model_chat=settings.yc_model_chat,
        model_embed_doc=settings.yc_model_embed_doc,
        model_embed_query=settings.yc_model_embed_query,
        client=http_client,
    )
    repo = PgChunksRepository(pool)
    service = IndexingService(llm, repo)

    try:
        for key in keys:
            source, path = BOOKS[key]
            replace = key != "olympiad_answers"
            total = await service.index_pdf(path, source, replace=replace)
            log.info("%s → %s: %d чанков", key, source, total)
    finally:
        await http_client.aclose()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
