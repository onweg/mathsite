"""Alembic environment.

DSN берём из app.core.config.Settings (один источник правды — .env).
Autogenerate не используем: пишем миграции руками через op.execute / op.create_table,
т.к. в приложении ORM-моделей нет.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings

config = context.config
# postgresql+psycopg:// — SQLAlchemy использует psycopg3 вместо psycopg2.
_alembic_dsn = settings.pg_dsn.replace("postgresql://", "postgresql+psycopg://", 1)
config.set_main_option("sqlalchemy.url", _alembic_dsn)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None  # autogenerate off


def run_migrations_offline() -> None:
    """Генерация SQL без подключения к БД: alembic upgrade head --sql."""
    context.configure(
        url=_alembic_dsn,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
