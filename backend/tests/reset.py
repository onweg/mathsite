"""Reset only the dedicated test DB between browser scenarios (no HTTP backdoor)."""
from tests.support import configure_environment, reset_database

if __name__ == '__main__':
    configure_environment()
    reset_database()
