"""RAG-сущности: Chunk и SearchHit. Чистый домен, без I/O."""

from dataclasses import dataclass

# source — произвольная строка-слаг: встроенные ("textbook_8_algebra", "textbook_8_geometry",
# "olympiad") или пользовательские материалы вида "material_<uuid-slug>".
Source = str


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
