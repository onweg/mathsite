"""Создать пользователя-администратора.

Пример:
    python -m scripts.create_admin --email teacher@school.ru --name "Иван Иванович"
    (пароль будет запрошен интерактивно)

Или неинтерактивно (для docker exec):
    python -m scripts.create_admin --email a@b.ru --name A --password 'secret'
"""

import argparse
import asyncio
import getpass
import sys

from psycopg_pool import AsyncConnectionPool

from app.core.config import settings
from app.core.security import hash_password
from app.infrastructure.repositories.users_repo import PgUsersRepository


async def run(email: str, name: str, password: str) -> None:
    pool = AsyncConnectionPool(settings.pg_dsn, min_size=1, max_size=2, open=False)
    await pool.open()
    try:
        repo = PgUsersRepository(pool)
        existing = await repo.get_by_email(email)
        if existing:
            print(f"пользователь {email} уже существует (id={existing[0].id})", file=sys.stderr)
            sys.exit(1)
        user = await repo.create(email, name, hash_password(password))
        print(f"ok: {user.email} ({user.id})")
    finally:
        await pool.close()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--password", default=None, help="если не указан — спросим интерактивно")
    args = p.parse_args()

    pw = args.password or getpass.getpass("пароль: ")
    if len(pw) < 8:
        print("пароль должен быть не короче 8 символов", file=sys.stderr)
        sys.exit(2)

    asyncio.run(run(args.email.strip(), args.name.strip(), pw))


if __name__ == "__main__":
    main()
