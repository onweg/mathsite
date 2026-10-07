"""RAG-сущности: Chunk и SearchHit. Чистый домен, без I/O."""

from dataclasses import dataclass
from typing import Literal

Source = Literal["textbook_8_algebra", "textbook_8_geometry", "olympiad"]


@dataclass(frozen=True)
class Chunk:
    """Фрагмент учебника для индексации."""

    source: Source
    page: int | None
    text: str
    tokens: int


@dataclass(frozen=True)
class SearchHit:
    """Результат семантического поиска."""

    id: int
    source: Source
    page: int | None
    text: str
    similarity: float
