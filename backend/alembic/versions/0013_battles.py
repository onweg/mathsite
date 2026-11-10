"""Student authored rounds, reviews and frozen leaderboards."""
from alembic import op

revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('''CREATE TABLE battle_rounds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL, description TEXT NOT NULL,
        reviewers JSONB NOT NULL,
        task_deadline TIMESTAMPTZ NOT NULL, solve_deadline TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','grading','closed')),
        results JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK(task_deadline <= solve_deadline)
    )''')
    op.execute('''CREATE TABLE battle_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        round_id UUID NOT NULL REFERENCES battle_rounds(id),
        author_id UUID REFERENCES students(id) ON DELETE SET NULL,
        data JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published')),
        moderation_note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(round_id, author_id)
    )''')
    op.execute('''CREATE TABLE battle_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES battle_tasks(id),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        snapshot JSONB NOT NULL, answer TEXT NOT NULL,
        ai_status TEXT NOT NULL CHECK(ai_status IN ('disabled','queued','checking','graded','failed')),
        tries INTEGER NOT NULL DEFAULT 0, next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        lease_id UUID, lease_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(task_id,student_id)
    )''')
    op.execute('''CREATE TABLE battle_reviews (
        attempt_id UUID NOT NULL REFERENCES battle_attempts(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('teacher','author','ai')),
        data JSONB NOT NULL, history JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(attempt_id,role)
    )''')
    op.execute('''CREATE TABLE battle_likes (
        task_id UUID NOT NULL REFERENCES battle_tasks(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        PRIMARY KEY(task_id,student_id)
    )''')
    op.execute('CREATE INDEX battle_queue ON battle_attempts(ai_status,next_run_at)')


def downgrade():
    for table in ('battle_likes', 'battle_reviews', 'battle_attempts', 'battle_tasks', 'battle_rounds'):
        op.execute(f'DROP TABLE {table}')
