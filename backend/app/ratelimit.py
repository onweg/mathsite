"""Простой in-memory rate limiter по IP (sliding window).

Для MVP достаточно. После перехода на VPS/несколько инстансов
перейдём на Redis.
"""

import time
from collections import defaultdict, deque
from dataclasses import dataclass


@dataclass
class Limit:
    max_requests: int
    window_seconds: int


DEFAULT_LIMITS = (
    Limit(max_requests=20, window_seconds=60),       # 20 / минута
    Limit(max_requests=200, window_seconds=60 * 60), # 200 / час
)


class RateLimiter:
    def __init__(self, limits: tuple[Limit, ...] = DEFAULT_LIMITS):
        self.limits = limits
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> tuple[bool, str]:
        now = time.monotonic()
        hits = self._hits[key]
        max_window = max(l.window_seconds for l in self.limits)
        # чистим старое
        while hits and now - hits[0] > max_window:
            hits.popleft()
        for lim in self.limits:
            recent = sum(1 for t in hits if now - t <= lim.window_seconds)
            if recent >= lim.max_requests:
                return False, f"лимит {lim.max_requests}/{lim.window_seconds}s"
        hits.append(now)
        return True, ""


limiter = RateLimiter()
