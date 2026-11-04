"""Migrate an already-created, dedicated test database and seed one teacher."""
from tests.support import configure_environment, reset_database, database_dsn

configure_environment()
database_dsn()  # Fail before importing Alembic/app settings on unsafe/missing DSN.
from alembic import command
from alembic.config import Config

if __name__ == '__main__':
    command.upgrade(Config('alembic.ini'), 'head')
    reset_database()
    print('Test database migrated and seeded.')
