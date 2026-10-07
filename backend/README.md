# Mathematica Backend

Минимальный FastAPI-бэк с YandexGPT. Postgres и RAG — следующий шаг.

## Первый запуск

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Запуск dev-сервера

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Открой: http://localhost:8000/docs — swagger-интерфейс, можно потыкать `/chat` руками.

## Эндпоинты

- `GET /health` — проверка
- `POST /chat` — `{messages: [{role, text}], section?}` → `{text, usage}`
- `POST /embed` — `{text, kind: "doc"|"query"}` → `{embedding, dim}`

## Остановка

Ctrl+C в терминале где запущен uvicorn.
