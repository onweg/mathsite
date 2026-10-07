"""Pipeline модерации: pre-filter, post-filter как чистые Checker'ы.

LLM-классификатор темы — отдельный Checker в services/, т.к. ему нужен I/O.
"""

from dataclasses import dataclass
from typing import Protocol

from . import rules


@dataclass(frozen=True)
class CheckResult:
    allowed: bool
    reason: str = ""
    cleaned: str = ""   # текст после редактирования (PII-маскинг)

    @classmethod
    def ok(cls, text: str = "") -> "CheckResult":
        return cls(allowed=True, cleaned=text)

    @classmethod
    def blocked(cls, reason: str) -> "CheckResult":
        return cls(allowed=False, reason=reason)


class Checker(Protocol):
    name: str

    def __call__(self, text: str) -> CheckResult: ...


def mask_pii(text: str) -> tuple[str, bool]:
    masked = text
    found = False
    for pat, repl in rules.PII_PATTERNS:
        new = pat.sub(repl, masked)
        if new != masked:
            found = True
            masked = new
    return masked, found


def pre_filter(text: str) -> CheckResult:
    """Слой 1 — вход от ученика."""
    stripped = (text or "").strip()
    if not stripped:
        return CheckResult.blocked("empty")
    if len(stripped) > rules.MAX_USER_MSG_LEN:
        return CheckResult.blocked(f"too_long:{rules.MAX_USER_MSG_LEN}")

    masked, _ = mask_pii(stripped)
    normalized = rules.normalize(masked)
    for word in rules.FORBIDDEN_WORDS:
        if word in normalized:
            return CheckResult.blocked(f"forbidden:{word}")
    return CheckResult.ok(masked)


def post_filter(text: str) -> CheckResult:
    """Слой 4 — ответ модели."""
    if not text or not text.strip():
        return CheckResult.blocked("empty_reply")
    lowered = text.lower()
    for hint in rules.SYSTEM_LEAK_HINTS:
        if hint in lowered:
            return CheckResult.blocked(f"system_leak:{hint}")
    normalized = rules.normalize(text)
    for word in rules.POST_FILTER_WORDS:
        if word in normalized:
            return CheckResult.blocked(f"forbidden_in_reply:{word}")
    return CheckResult.ok(text)
