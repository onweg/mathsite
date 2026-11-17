"""Chunks repository: единственное место, где живёт SQL для таблицы chunks."""

from typing import Protocol

from psycopg_pool import AsyncConnectionPool

from app.domain.rag.chunk import Chunk, SearchHit, Source


class ChunksRepository(Protocol):
    async def delete_by_source(self, source: Source) -> None: ...

    async def insert_many(self, chunks: list[tuple[Chunk, list[float]]]) -> int: ...

    async def hybrid_search(
        self,
        query: str,
        query_vec: list[float],
        *,
        source: Source | None,
        limit: int,
        min_similarity: float,
    ) -> list[SearchHit]: ...

    async def semantic_search(
        self,
        query_vec: list[float],
        *,
        source: Source | None,
        limit: int,
        min_similarity: float,
    ) -> list[SearchHit]: ...


class PgChunksRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def hybrid_search(
        self,
        query: str,
        query_vec: list[float],
        *,
        source: Source | None,
        limit: int,
        min_similarity: float,
    ) -> list[SearchHit]:
        """Search book text as well as embeddings, without ANN post-filter loss.

        Materialize the selected book before ranking: its small corpus can be
        searched exactly. Russian full-text matches bypass the cosine cutoff;
        similarity remains the actual cosine value, not a confidence score.
        Join words split by PDF line-wrap hyphens for lexical search only.
        Russian Snowball produces different stems for корень (корен) and
        корня/корни (корн); expand those equivalents in both directions.
        """
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                r"""
                WITH book AS MATERIALIZED (
                    SELECT id, source, page, text, embedding
                    FROM chunks
                    WHERE (%s::text IS NULL OR source = %s)
                ), scored AS (
                    SELECT id, source, page, text,
                           1 - (embedding <=> %s::vector) AS similarity,
                           to_tsvector('russian', regexp_replace(
                               text, '([[:alpha:]])-[[:space:]]+([[:alpha:]])',
                               '\1\2', 'g'
                           )) AS document,
                           ts_rewrite(ts_rewrite(
                               plainto_tsquery('russian', %s),
                               'корен'::tsquery, 'корен | корн'::tsquery
                           ), 'корн'::tsquery, 'корен | корн'::tsquery) AS terms
                    FROM book
                )
                SELECT id, source, page, text, similarity
                FROM scored
                WHERE document @@ terms OR similarity >= %s
                ORDER BY (document @@ terms) DESC,
                         ts_rank_cd(document, terms) DESC,
                         similarity DESC, id
                LIMIT %s
                """,
                (source, source, query_vec, query, min_similarity, limit),
            )
            rows = await cur.fetchall()
        return [
            SearchHit(id=row[0], source=row[1], page=row[2], text=row[3],
                      similarity=round(float(row[4]), 4))
            for row in rows
        ]

    async def delete_by_source(self, source: Source) -> None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("DELETE FROM chunks WHERE source = %s", (source,))
            await conn.commit()

    async def insert_many(self, chunks: list[tuple[Chunk, list[float]]]) -> int:
        if not chunks:
            return 0
        async with self._pool.connection() as conn, conn.cursor() as cur:
            for chunk, vec in chunks:
                await cur.execute(
                    """
                    INSERT INTO chunks (source, page, text, tokens, embedding)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (chunk.source, chunk.page, chunk.text, chunk.tokens, vec),
                )
            await conn.commit()
        return len(chunks)

    async def insert_one(self, chunk: Chunk, vec: list[float]) -> None:
        """Удобно для потоковой индексации — не копим батч в памяти."""
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO chunks (source, page, text, tokens, embedding)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (chunk.source, chunk.page, chunk.text, chunk.tokens, vec),
            )
            await conn.commit()

    async def semantic_search(
        self,
        query_vec: list[float],
        *,
        source: Source | None,
        limit: int,
        min_similarity: float,
    ) -> list[SearchHit]:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            if source:
                await cur.execute(
                    """
                    SELECT id, source, page, text,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM chunks
                    WHERE source = %s
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (query_vec, source, query_vec, limit),
                )
            else:
                await cur.execute(
                    """
                    SELECT id, source, page, text,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM chunks
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (query_vec, query_vec, limit),
                )
            rows = await cur.fetchall()

        hits: list[SearchHit] = []
        for row in rows:
            sim = float(row[4])
            if sim < min_similarity:
                continue
            hits.append(
                SearchHit(
                    id=row[0],
                    source=row[1],
                    page=row[2],
                    text=row[3],
                    similarity=round(sim, 4),
                )
            )
        return hits
