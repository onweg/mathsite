"""Создать пользователя-администратора или сбросить ему пароль.

Пример:
    python -m scripts.create_admin --email teacher@school.ru --name "Иван Иванович"
    (пароль будет запрошен интерактивно)

Или неинтерактивно (для docker exec):
    python -m scripts.create_admin --email a@b.ru --name A --password 'secret'

Забыли пароль — сбрасываем (пользователь должен существовать):
    python -m scripts.create_admin --email a@b.ru --name A --password 'new' --reset

Посмотреть, какие админы заведены:
    python -m scripts.create_admin --list
"""

import argparse
import asyncio
import getpass
import sys

from psycopg_pool import AsyncConnectionPool

from app.core.config import settings
from app.core.security import hash_password
from app.infrastructure.repositories.users_repo import PgUsersRepository


async def _pool() -> AsyncConnectionPool:
    pool = AsyncConnectionPool(settings.pg_dsn, min_size=1, max_size=2, open=False)
    await pool.open()
    return pool


async def run_list() -> None:
    pool = await _pool()
    try:
        async with pool.connection() as conn, conn.cursor() as cur:
            await cur.execute("SELECT email, name, role, created_at FROM users ORDER BY created_at")
            rows = await cur.fetchall()
        if not rows:
            print("админов нет — заведите первого без --reset")
            return
        for email, name, role, created_at in rows:
            print(f"{email}\t{name}\t{role}\t{created_at:%Y-%m-%d %H:%M}")
    finally:
        await pool.close()


async def run(email: str, name: str, password: str, reset: bool) -> None:
    pool = await _pool()
    try:
        repo = PgUsersRepository(pool)
        existing = await repo.get_by_email(email)

        if existing and not reset:
            print(
                f"пользователь {email} уже существует (id={existing[0].id}). "
                f"Сбросить пароль: добавьте --reset",
                file=sys.stderr,
            )
            sys.exit(1)

        if reset:
            if not existing:
                print(f"пользователя {email} нет — создайте его без --reset", file=sys.stderr)
                sys.exit(1)
            user = existing[0]
            await repo.set_password(user.id, hash_password(password))
            print(f"ok: пароль для {user.email} обновлён")
            return

        user = await repo.create(email, name, hash_password(password))
        print(f"ok: {user.email} ({user.id})")
    finally:
        await pool.close()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--list", action="store_true", help="показать всех админов и выйти")
    p.add_argument("--email")
    p.add_argument("--name")
    p.add_argument("--password", default=None, help="если не указан — спросим интерактивно")
    p.add_argument("--reset", action="store_true", help="сбросить пароль существующему админу")
    args = p.parse_args()

    if args.list:
        asyncio.run(run_list())
        return

    if not args.email or not (args.name or args.reset):
        p.error("нужны --email и --name (при --reset достаточно --email)")

    pw = args.password or getpass.getpass("пароль: ")
    if len(pw) < 8:
        print("пароль должен быть не короче 8 символов", file=sys.stderr)
        sys.exit(2)

    asyncio.run(run(args.email.strip(), (args.name or "").strip(), pw, args.reset))


if __name__ == "__main__":
    main()
