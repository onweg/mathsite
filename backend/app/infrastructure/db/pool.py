"""Async connection pool для Postgres + авто-регистрация pgvector."""

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool
from pgvector.psycopg import register_vector_async


async def _configure(conn: AsyncConnection) -> None:
    await register_vector_async(conn)


def create_pool(dsn: str, *, min_size: int = 2, max_size: int = 10) -> AsyncConnectionPool:
    """Пул создаётся в lifespan FastAPI и шарится между запросами.

    Регистрация pgvector происходит один раз на каждом коннекте пула через
    `configure`-колбэк.
    """
    return AsyncConnectionPool(
        conninfo=dsn,
        min_size=min_size,
        max_size=max_size,
        open=False,
        configure=_configure,
        kwargs={"autocommit": False},
    )
