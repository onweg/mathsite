"""RAG: PDF → чанки → embeddings → pgvector → поиск."""

import asyncio
import logging
import re
from pathlib import Path
from typing import Literal

from pypdf import PdfReader

from . import yandex
from .db import connect

log = logging.getLogger("mathsite.rag")

Source = Literal["textbook_8_algebra", "textbook_8_geometry", "olympiad"]

# параметры по умолчанию
CHUNK_SIZE_WORDS = 400
CHUNK_OVERLAP_WORDS = 80
MIN_CHUNK_WORDS = 25
EMBED_SLEEP_S = 0.05        # между вызовами Yandex embed — щадим rate-limit
MIN_SIMILARITY = 0.5


# ---------- 1. Парсинг PDF ----------

_whitespace_re = re.compile(r"\s+")


def extract_pages(pdf_path: Path) -> list[tuple[int, str]]:
    """Возвращает [(номер_страницы_с_1, нормализованный_текст), ...].

    Пустые / слишком короткие страницы пропускаются.
    """
    reader = PdfReader(str(pdf_path))
    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as e:
            log.warning("page %d extract failed: %s", i, e)
            continue
        text = _whitespace_re.sub(" ", text).strip()
        if len(text) < 50:
            continue
        pages.append((i, text))
    return pages


# ---------- 2. Чанкинг ----------

def chunk_text(
    text: str,
    size: int = CHUNK_SIZE_WORDS,
    overlap: int = CHUNK_OVERLAP_WORDS,
) -> list[str]:
    """Режет текст на куски по словам с перехлёстом.

    size — слов в чанке, overlap — сколько слов повторяется на границах.
    Чанки короче MIN_CHUNK_WORDS отбрасываются (хвост страницы).
    """
    assert 0 < overlap < size, "overlap должен быть > 0 и < size"
    words = text.split()
    if len(words) <= size:
        return [text] if len(words) >= MIN_CHUNK_WORDS else []

    step = size - overlap
    chunks: list[str] = []
    for i in range(0, len(words), step):
        piece = words[i : i + size]
        if len(piece) < MIN_CHUNK_WORDS:
            break
        chunks.append(" ".join(piece))
        if i + size >= len(words):
            break
    return chunks


# ---------- 3. Индексация ----------

async def index_pdf(pdf_path: Path, source: Source, replace: bool = True) -> int:
    """Индексирует один PDF целиком. Возвращает число записанных чанков.

    replace=True — предварительно удаляет все чанки с этим `source`.
    """
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)

    log.info("extract %s", pdf_path.name)
    pages = extract_pages(pdf_path)
    log.info("  %d страниц с текстом", len(pages))

    conn = await connect()
    try:
        async with conn.cursor() as cur:
            if replace:
                await cur.execute("DELETE FROM chunks WHERE source = %s", (source,))
                log.info("  удалено старых чанков для source=%s", source)

            total = 0
            for page_num, page_text in pages:
                page_chunks = chunk_text(page_text)
                for chunk in page_chunks:
                    try:
                        vec = await yandex.embed(chunk, kind="doc")
                    except Exception as e:
                        log.warning("embed failed on page %d: %s", page_num, e)
                        continue
                    await cur.execute(
                        """
                        INSERT INTO chunks (source, page, text, tokens, embedding)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (source, page_num, chunk, len(chunk.split()), vec),
                    )
                    total += 1
                    if total % 20 == 0:
                        log.info("  …записано %d чанков", total)
                    await asyncio.sleep(EMBED_SLEEP_S)
            await conn.commit()
            log.info("готово: source=%s, chunks=%d", source, total)
            return total
    finally:
        await conn.close()


# ---------- 4. Поиск ----------

async def search(
    query: str,
    source: Source | None = None,
    limit: int = 5,
    min_similarity: float = MIN_SIMILARITY,
) -> list[dict]:
    """Семантический поиск топ-N чанков. Фильтрует по min_similarity."""
    q_vec = await yandex.embed(query, kind="query")

    conn = await connect()
    try:
        async with conn.cursor() as cur:
            if source:
                await cur.execute(
                    """
                    SELECT id, source, page, text,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM chunks
                    WHERE source = %s
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (q_vec, source, q_vec, limit),
                )
            else:
                await cur.execute(
                    """
                    SELECT id, source, page, text,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM chunks
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (q_vec, q_vec, limit),
                )
            rows = await cur.fetchall()
    finally:
        await conn.close()

    out: list[dict] = []
    for row in rows:
        sim = float(row[4])
        if sim < min_similarity:
            continue
        out.append(
            {
                "id": row[0],
                "source": row[1],
                "page": row[2],
                "text": row[3],
                "similarity": round(sim, 4),
            }
        )
    return out


# ---------- 5. Сборка промпта ----------

def build_rag_prompt(query: str, chunks: list[dict]) -> str:
    """Склеивает фрагменты в промпт для чат-модели."""
    if not chunks:
        return (
            "В учебнике 8 класса ответа на этот вопрос нет. "
            "Ответь ровно: «Этого в учебнике нет, спроси у учителя.»"
        )
    parts = []
    for i, c in enumerate(chunks, start=1):
        parts.append(f"[{i}] (стр. {c['page']}, {c['source']}) {c['text']}")
    fragments = "\n\n".join(parts)
    return (
        "Ответь ученику 8 класса СТРОГО на основе фрагментов учебника ниже. "
        "Не придумывай факты, которых нет во фрагментах. "
        "Если во фрагментах нет ответа — скажи «в учебнике этого нет, спроси "
        "у учителя». В конце ответа укажи номера фрагментов, которые ты "
        "использовал, в формате [1][2].\n\n"
        f"ФРАГМЕНТЫ:\n{fragments}\n\n"
        f"ВОПРОС УЧЕНИКА: {query}"
    )
