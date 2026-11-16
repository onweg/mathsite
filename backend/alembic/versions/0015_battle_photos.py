"""Round-wide submission format and private, immutable photo attachments."""
from alembic import op

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""ALTER TABLE battle_rounds ADD COLUMN submission_format TEXT NOT NULL DEFAULT 'text'
        CHECK (submission_format IN ('text','photos')),
        ADD CONSTRAINT battle_photos_no_ai CHECK (submission_format = 'text' OR NOT (reviewers ? 'ai'))""")
    op.execute("ALTER TABLE battle_attempts ADD COLUMN images JSONB NOT NULL DEFAULT '[]'")
    # Kept outside the public uploads directory. Round deletion removes photos
    # transactionally; backups retain both submissions and their attachments.
    op.execute("""CREATE TABLE battle_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        round_id UUID NOT NULL REFERENCES battle_rounds(id) ON DELETE CASCADE,
        owner_id UUID REFERENCES students(id) ON DELETE SET NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('question','reference','answer')),
        media_type TEXT NOT NULL,
        content BYTEA NOT NULL CHECK (octet_length(content) <= 8388608),
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )""")
    op.execute('CREATE INDEX battle_photos_owner ON battle_photos(round_id,owner_id)')


def downgrade():
    op.execute('DROP TABLE battle_photos')
    op.execute('ALTER TABLE battle_attempts DROP COLUMN images')
    op.execute('ALTER TABLE battle_rounds DROP CONSTRAINT battle_photos_no_ai, DROP COLUMN submission_format')
