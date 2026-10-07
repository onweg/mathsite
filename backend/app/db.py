"""Соединение с Postgres (async) + адаптер pgvector."""

import psycopg
from pgvector.psycopg import register_vector_async

from .config import settings


async def connect() -> psycopg.AsyncConnection:
    conn = await psycopg.AsyncConnection.connect(settings.pg_dsn)
    await register_vector_async(conn)
    return conn
