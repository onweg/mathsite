"""FastAPI dependency-injection.

Единственное место, где конкретные реализации связываются с Protocol-ами.
Весь остальной код работает через интерфейсы.
"""

from typing import Annotated

from fastapi import Depends, Header, Request

from app.core.errors import Forbidden, NotAuthenticated
from app.domain.auth.types import User
from app.infrastructure.llm.base import LLMProvider
from app.infrastructure.ratelimit.base import RateLimiter
from pathlib import Path

from fastapi import Cookie

from app.core.config import settings
from app.domain.student.types import Student
from app.infrastructure.repositories.chunks_repo import ChunksRepository
from app.infrastructure.repositories.materials_repo import MaterialsRepository
from app.infrastructure.repositories.quizzes_repo import QuizzesRepository
from app.infrastructure.repositories.students_repo import StudentsRepository
from app.infrastructure.repositories.users_repo import UsersRepository
from app.infrastructure.repositories.weekly_repo import WeeklyTasksRepository
from app.services.auth_service import AuthService
from app.services.chat_service import ChatService
from app.services.classifier_service import ClassifierService
from app.services.indexing_service import IndexingService
from app.services.materials_service import MaterialsService
from app.services.quiz_service import QuizService
from app.services.rag_service import RagService
from app.services.students_import_service import StudentsImportService
from app.services.students_service import StudentsService
from app.services.weekly_service import WeeklyTaskService

STUDENT_COOKIE_NAME = "mathsite_student"
STUDENT_COOKIE_MAX_AGE = 365 * 24 * 3600  # 1 год


def is_prod() -> bool:
    return settings.app_env.lower() == "prod"


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


def get_users_repo(request: Request) -> UsersRepository:
    return _state(request).users_repo


def get_auth_service(
    users: Annotated[UsersRepository, Depends(get_users_repo)],
) -> AuthService:
    return AuthService(users)


async def get_current_admin(
    auth: Annotated[AuthService, Depends(get_auth_service)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise NotAuthenticated("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user = await auth.user_from_token(token)
    if user.role != "admin":
        raise Forbidden("admin only")
    return user


def get_quizzes_repo(request: Request) -> QuizzesRepository:
    return _state(request).quizzes_repo


def get_quiz_service(
    llm: Annotated[LLMProvider, Depends(get_llm)],
    quizzes: Annotated[QuizzesRepository, Depends(get_quizzes_repo)],
    chunks: Annotated[ChunksRepository, Depends(get_chunks_repo)],
) -> QuizService:
    return QuizService(llm, quizzes, chunks)


def get_weekly_repo(request: Request) -> WeeklyTasksRepository:
    return _state(request).weekly_repo


def get_weekly_service(
    repo: Annotated[WeeklyTasksRepository, Depends(get_weekly_repo)],
    llm: Annotated[LLMProvider, Depends(get_llm)],
    chunks: Annotated[ChunksRepository, Depends(get_chunks_repo)],
) -> WeeklyTaskService:
    return WeeklyTaskService(repo, llm, chunks)


def get_materials_repo(request: Request) -> MaterialsRepository:
    return _state(request).materials_repo


def get_materials_service(
    repo: Annotated[MaterialsRepository, Depends(get_materials_repo)],
    chunks: Annotated[ChunksRepository, Depends(get_chunks_repo)],
    llm: Annotated[LLMProvider, Depends(get_llm)],
) -> MaterialsService:
    indexer = IndexingService(llm, chunks)
    return MaterialsService(
        repo, chunks, indexer, upload_dir=Path(settings.upload_dir)
    )


def get_students_repo(request: Request) -> StudentsRepository:
    return _state(request).students_repo


def get_students_service(
    repo: Annotated[StudentsRepository, Depends(get_students_repo)],
) -> StudentsService:
    return StudentsService(repo)


def get_students_import_service(
    students: Annotated[StudentsService, Depends(get_students_service)],
) -> StudentsImportService:
    return StudentsImportService(students)


async def get_optional_student(
    svc: Annotated[StudentsService, Depends(get_students_service)],
    cookie_value: Annotated[str | None, Cookie(alias=STUDENT_COOKIE_NAME)] = None,
) -> Student | None:
    """Мягкий guard: вернёт Student если cookie валиден, иначе None.

    Используется в публичных эндпоинтах, где анонимный доступ допустим
    (например, прохождение квиза).
    """
    if not cookie_value:
        return None
    return await svc.by_token(cookie_value)


async def get_current_student(
    student: Annotated[Student | None, Depends(get_optional_student)],
) -> Student:
    """Строгий guard: 401 если cookie отсутствует/невалиден."""
    if not student:
        from app.core.errors import NotAuthenticated

        raise NotAuthenticated("ученик не авторизован")
    return student
