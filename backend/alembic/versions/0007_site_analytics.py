"""Local visit and engagement analytics.

Revision ID: 0007
Revises: 0006
"""
from alembic import op

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('''
        CREATE TABLE site_activity (
            id UUID PRIMARY KEY,
            visit_id UUID NOT NULL,
            student_id UUID REFERENCES students(id) ON DELETE SET NULL,
            page TEXT NOT NULL,
            active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    ''')
    op.execute('CREATE INDEX site_activity_student_idx ON site_activity (student_id, created_at DESC)')
    op.execute('CREATE INDEX site_activity_created_idx ON site_activity (created_at DESC)')
    op.execute('CREATE INDEX site_activity_visit_idx ON site_activity (visit_id)')
    op.execute('CREATE INDEX quiz_attempts_created_idx ON quiz_attempts (created_at DESC)')


def downgrade() -> None:
    op.execute('DROP INDEX quiz_attempts_created_idx')
    op.execute('DROP TABLE site_activity')
