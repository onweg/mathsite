"""FastAPI dependency-injection.

Единственное место, где конкретные реализации связываются с Protocol-ами.
Весь остальной код работает через интерфейсы.
"""

from typing import Annotated

from fastapi import Depends, Request

from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.ratelimit.base import RateLimiter
from app.infrastructure.repositories.chunks_repo import ChunksRepository
from app.services.chat_service import ChatService
from app.services.classifier_service import ClassifierService
from app.services.indexing_service import IndexingService
from app.services.rag_service import RagService


def _state(request: Request):
    return request.app.state


def get_llm(request: Request) -> LLMProvider:
    return _state(request).llm


def get_chunks_repo(request: Request) -> ChunksRepository:
    return _state(request).chunks_repo


def get_rate_limiter(request: Request) -> RateLimiter:
    return _state(request).rate_limiter


def get_classifier(
    llm: Annotated[LLMProvider, Depends(get_llm)],
) -> ClassifierService:
    return ClassifierService(llm)


def get_chat_service(
    llm: Annotated[LLMProvider, Depends(get_llm)],
    classifier: Annotated[ClassifierService, Depends(get_classifier)],
) -> ChatService:
    return ChatService(llm, classifier)


def get_rag_service(
    llm: Annotated[LLMProvider, Depends(get_llm)],
    repo: Annotated[ChunksRepository, Depends(get_chunks_repo)],
    classifier: Annotated[ClassifierService, Depends(get_classifier)],
) -> RagService:
    return RagService(llm, repo, classifier)


def get_indexing_service(
    llm: Annotated[LLMProvider, Depends(get_llm)],
    repo: Annotated[ChunksRepository, Depends(get_chunks_repo)],
) -> IndexingService:
    return IndexingService(llm, repo)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
