# Mathematica Backend

FastAPI + YandexGPT + pgvector. Чистая слоёная архитектура: `api → services → domain`, инфраструктура подключается через Protocol'ы.

## Структура

```
app/
  core/            # Settings, DomainError, JSON logger
  domain/          # Чистые типы и функции (без I/O)
    chat/         # Message, ChatReply, ModerationResult
    rag/          # Chunk, SearchHit, build_rag_prompt, system prompts
    safety/       # pre_filter, post_filter, PII mask
  services/        # Use cases: ChatService, RagService, IndexingService, ClassifierService
  infrastructure/  # I/O адаптеры за Protocol'ами
    llm/          # LLMProvider Protocol + YandexProvider
    db/           # AsyncConnectionPool + pgvector
    repositories/ # ChunksRepository
    pdf/          # pypdf extractor, chunker
    ratelimit/    # In-memory sliding window
  api/             # HTTP: роутеры, DI, middleware, lifespan
  schemas/         # HTTP DTO (pydantic)
```

## Первый запуск

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Dev-сервер

```bash
cd backend
source .venv/bin/activate
alembic upgrade head           # накатить схему (идемпотентно)
uvicorn app.api.app_factory:app --reload --port 8000
```

Swagger: http://localhost:8000/docs

## Миграции (Alembic)

Схема БД версионируется в `backend/alembic/versions/`. Autogenerate выключен —
миграции пишем руками через `op.execute(...)`, т.к. в приложении ORM нет.

```bash
alembic upgrade head              # применить все
alembic current                   # текущая ревизия
alembic history                   # история
alembic downgrade -1              # откатить последнюю
alembic revision -m "add users"   # создать новую пустую миграцию
```

Детали — `backend/alembic/README.md`.

## Эндпоинты

- `GET /health`
- `POST /chat` — `{messages, topic?, section?, temperature?}` → `{text, blocked, reason, usage}`
- `POST /rag/ask` — `{query, topic?, limit?}` → `{text, blocked, reason, chunks}`
- `POST /embed` — `{text, kind}` → `{embedding, dim}`

## Индексация учебников

```bash
python -m scripts.index_books          # все PDF
python -m scripts.index_books algebra  # только Макарычева
```

## Добавить нового LLM-провайдера

1. Реализовать `LLMProvider` Protocol в `app/infrastructure/llm/<provider>.py` (4 метода: `chat`, `stream_chat`, `embed`, `moderate`).
2. Подменить `YandexProvider` на новый класс в `app/api/app_factory.py` (lifespan).
3. Всё, остальной код не трогаем.
