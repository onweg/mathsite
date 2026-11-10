"""Reserve one quiz attempt per pupil without deleting legacy attempts."""
from alembic import op

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('''CREATE TABLE quiz_attempt_claims (
        quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        PRIMARY KEY (quiz_id, student_id)
    )''')
    op.execute('''INSERT INTO quiz_attempt_claims (quiz_id, student_id)
        SELECT DISTINCT quiz_id, student_id FROM quiz_attempts WHERE student_id IS NOT NULL''')


def downgrade() -> None:
    op.execute('DROP TABLE quiz_attempt_claims')
