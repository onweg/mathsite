"""Библиотека: разделы сайта, которые учитель наполняет сам.

Один «раздел» (collection) — это полка: «Математика вокруг нас»,
«Подготовка к олимпиадам», ОГЭ, ЕГЭ. Набор полок фиксирован в коде: у каждой
своё описание и своё место на главной, и заводить их из админки незачем —
учитель наполняет полки, а не придумывает новые.

На полке лежат материалы трёх видов:
    article — своя страница: учитель пишет текст прямо в админке
    link    — ссылка наружу: видео, разбор, сайт с задачами
    file    — прикреплённый файл; PDF заодно становится материалом для RAG

Просмотры пишутся в журнал (LibraryEvent): учителю нужна обратная связь —
кто из класса что открывал.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

CollectionSlug = Literal["around", "olympiad", "oge", "ege"]
ItemKind = Literal["article", "link", "file"]
#: section — открыли полку целиком; остальные три — конкретный материал.
EventAction = Literal["section", "open", "link", "file"]


@dataclass(frozen=True)
class Collection:
    slug: str
    title: str
    subtitle: str


COLLECTIONS: tuple[Collection, ...] = (
    Collection(
        slug="around",
        title="Математика вокруг нас",
        subtitle="Где в мосте, музыке и поиске Google прячется одна и та же формула",
    ),
    Collection(
        slug="olympiad",
        title="Подготовка к олимпиадам",
        subtitle="Разборы, сборники и площадки, где решают те, кому мало учебника",
    ),
    Collection(
        slug="oge",
        title="Подготовка к ОГЭ",
        subtitle="Демоверсии, банк заданий и разборы девятого класса",
    ),
    Collection(
        slug="ege",
        title="Подготовка к ЕГЭ",
        subtitle="База и профиль: что читать, что смотреть, где тренироваться",
    ),
)

COLLECTION_BY_SLUG: dict[str, Collection] = {c.slug: c for c in COLLECTIONS}


@dataclass(frozen=True)
class LibraryItem:
    id: UUID
    collection: str
    kind: ItemKind
    slug: str
    title: str
    summary: str
    body_md: str
    url: str
    #: путь файла относительно upload_dir; пусто у статьи и ссылки
    file_rel: str
    file_name: str
    file_size: int
    media_type: str
    material_id: UUID | None
    position: int
    is_published: bool
    created_at: datetime
    updated_at: datetime
    #: Ниже — то, что приезжает джойнами только в админском списке.
    #: В публичной выдаче остаются значения по умолчанию.
    material_status: str | None = None
    chunks_count: int = 0
    views: int = 0


@dataclass(frozen=True)
class LibraryEvent:
    id: UUID
    item_id: UUID | None
    item_title: str
    collection: str
    action: EventAction
    student_id: UUID | None
    student_name: str
    class_label: str
    created_at: datetime


@dataclass(frozen=True)
class ItemStat:
    """Сколько раз открывали один материал и сколько учеников это сделали."""

    item_id: UUID
    title: str
    collection: str
    kind: ItemKind
    is_published: bool
    views: int
    students: int
    last_view: datetime | None


@dataclass(frozen=True)
class StudentStat:
    """Активность одного ученика по библиотеке целиком."""

    student_id: UUID
    student_name: str
    class_label: str
    views: int
    last_view: datetime | None


@dataclass(frozen=True)
class LibraryTotals:
    views: int
    students: int
    views_week: int
    anonymous: int
