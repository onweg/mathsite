"""students table + student_id в quiz_attempts.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE students (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT NOT NULL,
            class_label TEXT NOT NULL DEFAULT '',
            qr_token    TEXT UNIQUE NOT NULL,
            note        TEXT,
            created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX students_class_label_idx ON students (class_label, name)"
    )

    # Привязка попыток к ученику (nullable — для анонимных прохождений)
    op.execute(
        "ALTER TABLE quiz_attempts "
        "ADD COLUMN student_id UUID REFERENCES students(id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX quiz_attempts_student_id_idx ON quiz_attempts (student_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS quiz_attempts_student_id_idx")
    op.execute("ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS student_id")
    op.execute("DROP INDEX IF EXISTS students_class_label_idx")
    op.execute("DROP TABLE IF EXISTS students")
