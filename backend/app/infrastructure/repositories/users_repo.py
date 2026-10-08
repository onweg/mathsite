"""Users repository: SQL для таблицы users (учителя-админы)."""

from typing import Protocol
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.domain.auth.types import User


class UsersRepository(Protocol):
    async def get_by_email(self, email: str) -> tuple[User, str] | None: ...

    async def get_by_id(self, user_id: UUID) -> User | None: ...

    async def create(self, email: str, name: str, password_hash: str) -> User: ...


class PgUsersRepository:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def get_by_email(self, email: str) -> tuple[User, str] | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT id, email, name, role, created_at, password_hash "
                "FROM users WHERE lower(email) = lower(%s)",
                (email,),
            )
            row = await cur.fetchone()
        if not row:
            return None
        return User(id=row[0], email=row[1], name=row[2], role=row[3], created_at=row[4]), row[5]

    async def get_by_id(self, user_id: UUID) -> User | None:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                "SELECT id, email, name, role, created_at FROM users WHERE id = %s",
                (user_id,),
            )
            row = await cur.fetchone()
        if not row:
            return None
        return User(id=row[0], email=row[1], name=row[2], role=row[3], created_at=row[4])

    async def create(self, email: str, name: str, password_hash: str) -> User:
        async with self._pool.connection() as conn, conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO users (email, name, password_hash)
                VALUES (%s, %s, %s)
                RETURNING id, email, name, role, created_at
                """,
                (email, name, password_hash),
            )
            row = await cur.fetchone()
            await conn.commit()
        return User(id=row[0], email=row[1], name=row[2], role=row[3], created_at=row[4])
