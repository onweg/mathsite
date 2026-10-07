# Миграции БД

```bash
cd backend
source .venv/bin/activate

alembic upgrade head              # применить все
alembic current                   # текущая ревизия
alembic history                   # история
alembic downgrade -1              # откатить последнюю
alembic revision -m "add users"   # создать новую пустую миграцию
```

Autogenerate выключен — миграции пишем руками в `versions/NNNN_name.py`
через `op.execute(...)`, `op.create_table(...)` и т.д. Причина: в приложении
нет SQLAlchemy-моделей, работаем через голый psycopg.
