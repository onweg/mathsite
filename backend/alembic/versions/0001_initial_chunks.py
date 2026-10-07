"""initial: pgvector extension + chunks table

Revision ID: 0001
Revises:
Create Date: 2026-10-07
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        """
        CREATE TABLE chunks (
            id          BIGSERIAL PRIMARY KEY,
            source      TEXT NOT NULL,
            page        INT,
            chapter     TEXT,
            text        TEXT NOT NULL,
            tokens      INT,
            embedding   VECTOR(256) NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        "CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)"
    )
    op.execute("CREATE INDEX chunks_source_idx ON chunks (source)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS chunks_source_idx")
    op.execute("DROP INDEX IF EXISTS chunks_embedding_hnsw")
    op.execute("DROP TABLE IF EXISTS chunks")
    # vector extension не трогаем на downgrade — она глобальная,
    # могут быть другие таблицы (появятся позже).
