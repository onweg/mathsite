"""Hide a battle without resetting its phase, submissions or final results."""
from alembic import op

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('ALTER TABLE battle_rounds ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT TRUE')


def downgrade():
    op.execute('ALTER TABLE battle_rounds DROP COLUMN is_visible')
