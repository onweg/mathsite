"""Solution exercises and durable AI grading jobs."""
from alembic import op

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('''CREATE TABLE solution_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        data JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
        revision INTEGER NOT NULL DEFAULT 1,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )''')
    op.execute('''CREATE TABLE solution_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id UUID NOT NULL REFERENCES solution_tasks(id),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        snapshot JSONB NOT NULL,
        answer JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','checking','graded','failed')),
        tries INTEGER NOT NULL DEFAULT 0,
        next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        lease_id UUID,
        lease_until TIMESTAMPTZ,
        ai_result JSONB,
        teacher_result JSONB,
        model_version TEXT,
        usage JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        graded_at TIMESTAMPTZ,
        UNIQUE (task_id, student_id)
    )''')
    op.execute('CREATE INDEX solution_jobs_pending ON solution_attempts (status, next_run_at)')
    op.execute('CREATE INDEX solution_student_history ON solution_attempts (student_id, created_at DESC)')


def downgrade():
    op.execute('DROP TABLE solution_attempts')
    op.execute('DROP TABLE solution_tasks')
