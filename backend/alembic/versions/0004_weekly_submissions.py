"""weekly_submissions: решения учеников по задаче недели.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE weekly_submissions (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id         UUID NOT NULL REFERENCES weekly_tasks(id) ON DELETE CASCADE,
            student_id      UUID REFERENCES students(id) ON DELETE SET NULL,
            student_name    TEXT NOT NULL,
            class_label     TEXT NOT NULL DEFAULT '',
            solution_md     TEXT NOT NULL DEFAULT '',
            image_filename  TEXT,
            status          TEXT NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new','correct','partial','wrong')),
            teacher_comment TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_at     TIMESTAMPTZ
        )
        """
    )
    op.execute(
        "CREATE INDEX weekly_submissions_task_idx "
        "ON weekly_submissions (task_id, created_at DESC)"
    )
    # Один ученик — одно решение на задачу: повторная отправка перезаписывает прежнюю.
    # Анонимные отправки (student_id IS NULL) под ограничение не попадают.
    op.execute(
        "CREATE UNIQUE INDEX weekly_submissions_one_per_student_idx "
        "ON weekly_submissions (task_id, student_id) WHERE student_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS weekly_submissions_one_per_student_idx")
    op.execute("DROP INDEX IF EXISTS weekly_submissions_task_idx")
    op.execute("DROP TABLE IF EXISTS weekly_submissions")
