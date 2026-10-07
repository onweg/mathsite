"""CLI: индексирует все PDF в pgvector.

Запуск (из папки backend, с активированным .venv):
    python -m scripts.index_books                # все книги
    python -m scripts.index_books algebra        # только одна

Доступные ключи: algebra, geometry, olympiad_tasks, olympiad_answers, all
"""

import asyncio
import logging
import sys
from pathlib import Path

from app.rag import index_pdf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s · %(message)s",
)

# пути указаны относительно корня проекта (на уровень выше backend/)
ROOT = Path(__file__).resolve().parent.parent.parent

BOOKS: dict[str, tuple[str, Path]] = {
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
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if arg == "all":
        keys = list(BOOKS.keys())
    elif arg in BOOKS:
        keys = [arg]
    else:
        print(f"неизвестный ключ '{arg}'. доступно: {', '.join(BOOKS)}, all")
        sys.exit(1)

    for key in keys:
        source, path = BOOKS[key]
        # olympiad индексируется двумя файлами, второй файл НЕ должен затирать первый
        replace = key != "olympiad_answers"
        total = await index_pdf(path, source, replace=replace)
        print(f"{key} → {source}: {total} чанков")


if __name__ == "__main__":
    asyncio.run(main())
