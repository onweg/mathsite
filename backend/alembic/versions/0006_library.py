"""library: разделы с материалами (статьи, ссылки, файлы) + журнал просмотров.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-26
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE library_items (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            -- набор разделов фиксирован в коде (domain/library/types.py):
            -- учитель наполняет их, но не заводит новые
            collection   TEXT NOT NULL
                          CHECK (collection IN ('around','olympiad','oge','ege')),
            kind         TEXT NOT NULL CHECK (kind IN ('article','link','file')),
            slug         TEXT NOT NULL,
            title        TEXT NOT NULL,
            summary      TEXT NOT NULL DEFAULT '',
            body_md      TEXT NOT NULL DEFAULT '',
            url          TEXT NOT NULL DEFAULT '',
            -- Путь файла ОТНОСИТЕЛЬНО upload_dir. У PDF это файл материала
            -- (его же читает RAG), у остальных форматов — library/<имя>.
            file_rel     TEXT NOT NULL DEFAULT '',
            file_name    TEXT NOT NULL DEFAULT '',
            file_size    BIGINT NOT NULL DEFAULT 0,
            media_type   TEXT NOT NULL DEFAULT '',
            -- PDF дополнительно заводится как материал: оттуда он попадает
            -- в поиск по учебникам и в генерацию тестов и задач
            material_id  UUID REFERENCES materials(id) ON DELETE SET NULL,
            position     INTEGER NOT NULL DEFAULT 0,
            is_published BOOLEAN NOT NULL DEFAULT FALSE,
            created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    # Адрес статьи — /library/<раздел>/<slug>, поэтому slug уникален внутри раздела.
    op.execute(
        "CREATE UNIQUE INDEX library_items_slug_idx ON library_items (collection, slug)"
    )
    op.execute(
        "CREATE INDEX library_items_feed_idx "
        "ON library_items (collection, is_published, position, created_at DESC)"
    )

    op.execute(
        """
        CREATE TABLE library_events (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            -- section-события к материалу не привязаны: открыли сам раздел
            item_id      UUID REFERENCES library_items(id) ON DELETE CASCADE,
            collection   TEXT NOT NULL,
            action       TEXT NOT NULL
                          CHECK (action IN ('section','open','link','file')),
            -- имя и класс копируем в событие: ученика могут удалить из класса,
            -- а статистика за прошлый месяц должна остаться читаемой
            student_id   UUID REFERENCES students(id) ON DELETE SET NULL,
            student_name TEXT NOT NULL DEFAULT '',
            class_label  TEXT NOT NULL DEFAULT '',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX library_events_item_idx ON library_events (item_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX library_events_student_idx "
        "ON library_events (student_id, created_at DESC)"
    )
    op.execute("CREATE INDEX library_events_recent_idx ON library_events (created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS library_events")
    op.execute("DROP TABLE IF EXISTS library_items")
