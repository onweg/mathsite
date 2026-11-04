"""Publish the teacher's answer independently for each weekly task."""
from alembic import op

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE weekly_tasks ADD COLUMN is_answer_published BOOLEAN NOT NULL DEFAULT FALSE')


def downgrade() -> None:
    op.execute('ALTER TABLE weekly_tasks DROP COLUMN is_answer_published')
