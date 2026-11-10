"""Finish quizzes and retain the answer key used for each new attempt."""
from alembic import op

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE quizzes ADD COLUMN is_completed BOOLEAN NOT NULL DEFAULT FALSE')
    op.execute('ALTER TABLE quiz_attempts ADD COLUMN review_items JSONB')


def downgrade() -> None:
    op.execute('ALTER TABLE quiz_attempts DROP COLUMN review_items')
    op.execute('ALTER TABLE quizzes DROP COLUMN is_completed')
