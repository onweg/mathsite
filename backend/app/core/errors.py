"""Доменные исключения. HTTP-коды живут в api/middleware.py."""


class DomainError(Exception):
    """Корень иерархии ошибок бизнес-уровня."""

    code: str = "domain_error"


class SafetyBlocked(DomainError):
    """Сработал один из 4 слоёв защиты. reason — машинный идентификатор."""

    code = "safety_blocked"

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class RateLimited(DomainError):
    code = "rate_limited"

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class LLMUnavailable(DomainError):
    code = "llm_unavailable"

    def __init__(self, provider: str, detail: str = ""):
        super().__init__(f"{provider}: {detail}" if detail else provider)
        self.provider = provider
        self.detail = detail


class LLMBadResponse(DomainError):
    """Провайдер ответил, но формат ответа некорректен."""

    code = "llm_bad_response"


class RepositoryError(DomainError):
    code = "repository_error"
