"""HTTP-уровень обработки доменных ошибок + request_id в каждом запросе."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.errors import (
    DomainError,
    LLMBadResponse,
    LLMUnavailable,
    RateLimited,
    SafetyBlocked,
)
from app.core.logging import new_request_id
from app.domain.rag.prompts import REFUSAL

log = logging.getLogger("mathsite.http")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = new_request_id()
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        return response


def _domain_to_response(exc: DomainError) -> JSONResponse:
    if isinstance(exc, SafetyBlocked):
        return JSONResponse(
            status_code=200,
            content={
                "text": REFUSAL,
                "blocked": True,
                "reason": exc.reason,
            },
        )
    if isinstance(exc, RateLimited):
        return JSONResponse(
            status_code=429,
            content={"detail": f"Слишком часто. {exc.detail}"},
        )
    if isinstance(exc, LLMUnavailable):
        return JSONResponse(
            status_code=502,
            content={"detail": f"LLM недоступен: {exc.detail or exc.provider}"},
        )
    if isinstance(exc, LLMBadResponse):
        return JSONResponse(
            status_code=502,
            content={"detail": "LLM вернул некорректный ответ"},
        )
    # остальные DomainError-ы маршрутизируются по status_code (401/403/404/409/400)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": str(exc) or exc.code, "code": exc.code},
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _handle_domain(_: Request, exc: DomainError):
        log.info("domain error: %s · %s", exc.code, exc)
        return _domain_to_response(exc)
