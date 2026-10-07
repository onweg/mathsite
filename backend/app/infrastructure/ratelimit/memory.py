"""In-memory sliding window rate limiter."""

import time
from collections import defaultdict, deque

from .base import Limit


class InMemoryRateLimiter:
    def __init__(self, limits: tuple[Limit, ...]):
        self.limits = limits
        self._max_window = max(l.window_seconds for l in limits)
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> tuple[bool, str]:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self._max_window:
            hits.popleft()
        for lim in self.limits:
            recent = sum(1 for t in hits if now - t <= lim.window_seconds)
            if recent >= lim.max_requests:
                return False, f"лимит {lim.max_requests}/{lim.window_seconds}s"
        hits.append(now)
        return True, ""
