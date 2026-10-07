"""Создание FastAPI-приложения + lifespan для внешних ресурсов."""

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import setup_logging
from app.infrastructure.db.pool import create_pool
from app.infrastructure.llm.yandex import YandexProvider
from app.infrastructure.ratelimit.base import Limit
from app.infrastructure.ratelimit.memory import InMemoryRateLimiter
from app.infrastructure.repositories.chunks_repo import PgChunksRepository

from .middleware import RequestIdMiddleware, register_error_handlers
from .routers import chat as chat_router
from .routers import embed as embed_router
from .routers import health as health_router
from .routers import rag as rag_router


@asynccontextmanager
async def _lifespan(app: FastAPI):
    pool = create_pool(
        settings.pg_dsn,
        min_size=settings.pg_pool_min,
        max_size=settings.pg_pool_max,
    )
    http_client = httpx.AsyncClient(timeout=60)

    try:
        await pool.open()
    except Exception as e:
        logging.getLogger("mathsite.lifespan").warning("db pool open failed: %s", e)

    app.state.pool = pool
    app.state.http_client = http_client
    app.state.llm = YandexProvider(
        folder_id=settings.yc_folder_id,
        api_key=settings.yc_api_key,
        model_chat=settings.yc_model_chat,
        model_embed_doc=settings.yc_model_embed_doc,
        model_embed_query=settings.yc_model_embed_query,
        client=http_client,
    )
    app.state.chunks_repo = PgChunksRepository(pool)
    app.state.rate_limiter = InMemoryRateLimiter((
        Limit(max_requests=settings.rate_limit_per_minute, window_seconds=60),
        Limit(max_requests=settings.rate_limit_per_hour, window_seconds=3600),
    ))

    try:
        yield
    finally:
        await http_client.aclose()
        await pool.close()


def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(title="Mathematica API", version="0.3.0", lifespan=_lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)

    app.include_router(health_router.router)
    app.include_router(chat_router.router)
    app.include_router(rag_router.router)
    app.include_router(embed_router.router)
    return app


app = create_app()
