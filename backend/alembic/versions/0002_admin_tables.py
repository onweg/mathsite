"""admin tables: users, materials, weekly_tasks, quizzes

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-09
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        CREATE TABLE users (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name          TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE materials (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            slug          TEXT UNIQUE NOT NULL,
            title         TEXT NOT NULL,
            source_key    TEXT UNIQUE NOT NULL,
            filename      TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','indexing','ready','failed')),
            chunks_count  INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE weekly_tasks (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title        TEXT NOT NULL,
            body_md      TEXT NOT NULL,
            answer_md    TEXT NOT NULL,
            is_published BOOLEAN NOT NULL DEFAULT FALSE,
            created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX weekly_tasks_published_idx ON weekly_tasks (is_published, created_at DESC)"
    )

    op.execute(
        """
        CREATE TABLE quizzes (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title       TEXT NOT NULL,
            topic       TEXT NOT NULL,
            source_key  TEXT,
            difficulty  TEXT NOT NULL DEFAULT 'medium'
                         CHECK (difficulty IN ('easy','medium','hard')),
            status      TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','published')),
            created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX quizzes_status_idx ON quizzes (status, created_at DESC)")

    op.execute(
        """
        CREATE TABLE quiz_items (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quiz_id        UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            position       INTEGER NOT NULL,
            kind           TEXT NOT NULL DEFAULT 'mcq'
                            CHECK (kind IN ('mcq','short')),
            question_md    TEXT NOT NULL,
            choices        JSONB,
            correct_answer TEXT NOT NULL,
            explanation    TEXT,
            UNIQUE (quiz_id, position)
        )
        """
    )
    op.execute("CREATE INDEX quiz_items_quiz_id_idx ON quiz_items (quiz_id)")

    op.execute(
        """
        CREATE TABLE quiz_attempts (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            student_name  TEXT NOT NULL,
            answers       JSONB NOT NULL,
            score         INTEGER NOT NULL,
            total         INTEGER NOT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX quiz_attempts_quiz_id_idx ON quiz_attempts (quiz_id, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS quiz_attempts")
    op.execute("DROP TABLE IF EXISTS quiz_items")
    op.execute("DROP TABLE IF EXISTS quizzes")
    op.execute("DROP TABLE IF EXISTS weekly_tasks")
    op.execute("DROP TABLE IF EXISTS materials")
    op.execute("DROP TABLE IF EXISTS users")
