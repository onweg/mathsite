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

## Общая статистика учителя

Админка → «Статистика»: посещения и активное время, результаты тестов,
решения задач недели, просмотры библиотеки и ответы на опросы.
Фильтры периода (включительно, по Москве), класса и ученика общие для всех вкладок.
Существующие экраны статистики остаются доступны в своих разделах.

Перед первым запуском обновлённого backend применить миграцию `0007`:

```bash
cd backend                 # из корня репозитория
.venv/bin/alembic upgrade head
```

В production миграции применяет существующий Docker entrypoint.
`POST /analytics/pulse` принимает только идентификаторы визита/просмотра,
название раздела из фиксированного списка и накопленное активное время.
Ученик определяется сервером по cookie. URL, QR-токены и текст ввода не записываются.
Повторный pulse не прибавляет то же время второй раз.

Новый визит начинается после 30 минут без активности или смены ученика.
Время считается только в видимой активной вкладке, с паузой после 2 минут без действий.
Админка и браузер с сохранённым входом учителя исключены из нового счётчика.
Посещения до обновления восстановить нельзя. Старые учебные результаты и
события библиотеки берутся из прежних таблиц. Задачи/опросы показывают текущую
сохранённую версию; их повторная отправка раньше заменяла предыдущую.

`GET /admin/analytics` требует авторизацию учителя. Все счётчики агрегируются
в PostgreSQL, независимо от ограничения журнала тестов на 500 записей.

Проверки (из `backend/`):

```bash
.venv/bin/python -m unittest discover -s tests -v
# Дополнительно: интеграционные проверки на уже запущенном тестовом PostgreSQL.
# Создают только временные таблицы соединения, которые удаляются при закрытии.
ANALYTICS_TEST_DSN=postgresql://localhost/postgres .venv/bin/python -m unittest discover -s tests -v
```

### Анализ статистики через YandexGPT

«Статистика → Анализ ИИ → Сформировать анализ» отправляет сводку за выбранные
даты по всему сайту. Фильтры класса и ученика не применяются. Запрос запускается
только кнопкой; обновление статистики и переключение вкладок модель не вызывают.
Используется существующий `LLMProvider`, новый ключ или миграция не нужны.

`POST /admin/analytics/insights` принимает только `start` и `end`, требует
авторизацию учителя и ограничен 3 запросами в минуту / 12 в час на учителя
(in-memory, в рамках одного процесса). Ожидание модели ограничено 55 секундами.

Отдельный SQL-источник агрегирует показатели без выборки имён, токенов,
текстов решений и комментариев. В модель попадает явный список числовых полей
и фиксированных категорий. Даже названия тестов/материалов заменяются кодами:
сервер подставляет их обратно только после валидации ответа. Условные ссылки
в ответе проверяются по карте объектов; произвольный текст клиента не принимается.

Для сложности отдельно считаются первые за всю историю попытки вошедших учеников,
сделанные в выбранном периоде. При числе первых попыток меньше пяти уверенность
в выводе принудительно снижается. Анонимные попытки и повторы учитываются отдельно.
Включены опубликованные материалы/тесты без активности; отсутствие просмотров
не трактуется как отсутствие интереса. Даты публикации и число показов неизвестны.

При большом каталоге детальные данные ограничены: 60 тестов, 80 материалов,
12 разделов, 20 задач и 20 опросов. Выбираются наиболее и наименее используемые
объекты; охват показывается в отчёте. Общие показатели за период остаются полными.
Тесты используют подставной LLM и временные таблицы PostgreSQL; реальные данные
и запросы в YandexGPT для тестирования не нужны.
