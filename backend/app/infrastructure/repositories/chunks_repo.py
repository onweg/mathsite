"""Chunks repository: единственное место, где живёт SQL для таблицы chunks."""

from typing import Protocol

from psycopg_pool import AsyncConnectionPool

from app.domain.rag.chunk import Chunk, SearchHit, Source


class ChunksRepository(Protocol):
    async def delete_by_source(self, source: Source) -> None: ...

    async def insert_many(self, chunks: list[tuple[Chunk, list[float]]]) -> int: ...

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
