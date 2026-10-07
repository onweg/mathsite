"""Извлечение текста из PDF постранично через pypdf."""

import logging
import re
from pathlib import Path

from pypdf import PdfReader

log = logging.getLogger("mathsite.pdf")

_WHITESPACE = re.compile(r"\s+")
_MIN_PAGE_LEN = 50


def extract_pages(pdf_path: Path) -> list[tuple[int, str]]:
    """[(номер_страницы_с_1, нормализованный_текст), ...]. Пустые страницы — пропускаем."""
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)
    reader = PdfReader(str(pdf_path))
    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as e:
            log.warning("page %d extract failed: %s", i, e)
            continue
        text = _WHITESPACE.sub(" ", text).strip()
        if len(text) < _MIN_PAGE_LEN:
            continue
        pages.append((i, text))
    return pages
