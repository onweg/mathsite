from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ItemKind = Literal["article", "link", "file"]
EventAction = Literal["section", "open", "link", "file"]


class CollectionDTO(BaseModel):
    slug: str
    title: str
    subtitle: str
    #: сколько опубликованных материалов лежит на полке
    count: int


class LibraryItemPublicDTO(BaseModel):
    id: str
    collection: str
    kind: ItemKind
    slug: str
    title: str
    summary: str
    url: str = ""
    #: Путь относительно API, не абсолютный URL — прогонять через `fileUrl`.
    file_url: str | None = None
    file_name: str = ""
    file_size: int = 0
    media_type: str = ""
    #: у файла/ссылки может быть и свой текст — показываем на странице материала
    has_body: bool = False


class LibraryItemDetailDTO(LibraryItemPublicDTO):
    body_md: str = ""


class LibraryItemDTO(LibraryItemDetailDTO):
    """Админский вид: плюс черновики, порядок и состояние индексации."""

    is_published: bool
    position: int
    material_id: str | None = None
    #: статус индексации PDF; None — файла в материалах нет
    material_status: str | None = None
    chunks_count: int = 0
    views: int = 0
    created_at: str


class CreateItemRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=40)
    kind: Literal["article", "link"]
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=600)
    body_md: str = ""
    url: str = Field(default="", max_length=2000)


class UpdateItemRequest(BaseModel):
    collection: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=600)
    body_md: str | None = None
    url: str | None = Field(default=None, max_length=2000)


class ReorderRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=40)
    ids: list[str]


class RecordEventRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=40)
    action: EventAction
    item_id: str | None = None


class ItemStatDTO(BaseModel):
    item_id: str
    title: str
    collection: str
    kind: ItemKind
    is_published: bool
    views: int
    students: int
    last_view: str | None = None


class StudentStatDTO(BaseModel):
    student_id: str
    student_name: str
    class_label: str
    views: int
    last_view: str | None = None


class EventDTO(BaseModel):
    id: str
    item_id: str | None
    item_title: str
    collection: str
    action: EventAction
    student_id: str | None
    student_name: str
    class_label: str
    created_at: str


class LibraryStatsDTO(BaseModel):
    views: int
    students: int
    views_week: int
    anonymous: int
    items: list[ItemStatDTO]
    top_students: list[StudentStatDTO]
    recent: list[EventDTO]
