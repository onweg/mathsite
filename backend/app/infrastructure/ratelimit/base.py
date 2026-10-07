"""RateLimiter Protocol. Реализации: memory (сейчас) → redis (после VPS)."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Limit:
    max_requests: int
    window_seconds: int


class RateLimiter(Protocol):
    def check(self, key: str) -> tuple[bool, str]:
        """True — пропустить. False + причина — отказать (слой выше бросит RateLimited)."""
        ...
