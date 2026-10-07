#!/bin/sh
set -e

python - <<'PY'
import os, time, sys, psycopg
dsn = f"postgresql://{os.environ['POSTGRES_USER']}:{os.environ['POSTGRES_PASSWORD']}@{os.environ['POSTGRES_HOST']}:{os.environ['POSTGRES_PORT']}/{os.environ['POSTGRES_DB']}"
deadline = time.time() + 60
while time.time() < deadline:
    try:
        with psycopg.connect(dsn, connect_timeout=3) as conn:
            conn.execute("SELECT 1")
        print("postgres ready"); sys.exit(0)
    except Exception as e:
        print(f"waiting: {e}"); time.sleep(2)
sys.exit("timeout")
PY

alembic upgrade head
exec "$@"
