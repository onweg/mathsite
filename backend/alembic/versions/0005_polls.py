"""polls: опросы и обратная связь от учеников.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE polls (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title         TEXT NOT NULL,
            question_md   TEXT NOT NULL DEFAULT '',
            -- choice: есть варианты ответа; text: только свободный ответ
            kind          TEXT NOT NULL DEFAULT 'choice'
                           CHECK (kind IN ('choice','text')),
            multiple      BOOLEAN NOT NULL DEFAULT FALSE,
            allow_comment BOOLEAN NOT NULL DEFAULT TRUE,
            is_published  BOOLEAN NOT NULL DEFAULT FALSE,
            created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX polls_published_idx ON polls (is_published, created_at DESC)"
    )

    op.execute(
        """
        CREATE TABLE poll_options (
            id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            poll_id  UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            text     TEXT NOT NULL,
            UNIQUE (poll_id, position)
        )
        """
    )
    op.execute("CREATE INDEX poll_options_poll_idx ON poll_options (poll_id, position)")

    op.execute(
        """
        CREATE TABLE poll_answers (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            poll_id      UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
            student_id   UUID REFERENCES students(id) ON DELETE SET NULL,
            student_name TEXT NOT NULL,
            class_label  TEXT NOT NULL DEFAULT '',
            -- выбранные варианты; пусто у чисто текстового ответа
            option_ids   UUID[] NOT NULL DEFAULT '{}',
            comment      TEXT NOT NULL DEFAULT '',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX poll_answers_poll_idx ON poll_answers (poll_id, created_at DESC)")
    # Один ученик — один ответ на опрос; повторный перезаписывает прежний.
    # Анонимные ответы под ограничение не попадают.
    op.execute(
        "CREATE UNIQUE INDEX poll_answers_one_per_student_idx "
        "ON poll_answers (poll_id, student_id) WHERE student_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS poll_answers_one_per_student_idx")
    op.execute("DROP TABLE IF EXISTS poll_answers")
    op.execute("DROP TABLE IF EXISTS poll_options")
    op.execute("DROP TABLE IF EXISTS polls")
