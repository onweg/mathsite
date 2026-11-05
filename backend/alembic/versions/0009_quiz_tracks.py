"""Separate library exam practice from existing general quizzes."""
from alembic import op

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE quizzes ADD COLUMN track TEXT NOT NULL DEFAULT 'general' CHECK (track IN ('general', 'oge', 'ege'))")


def downgrade() -> None:
    op.execute('ALTER TABLE quizzes DROP COLUMN track')
