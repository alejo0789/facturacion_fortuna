"""
Rate limiter en memoria para endpoints de autenticación.
Ventana deslizante por key (IP, email, etc).
"""
import time
from collections import defaultdict


class RateLimiter:
    def __init__(self, max_attempts: int = 5, window_minutes: int = 15):
        self.max_attempts = max_attempts
        self.window_seconds = window_minutes * 60
        self._attempts: dict[str, list[float]] = defaultdict(list)

    def is_rate_limited(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]
        return len(self._attempts[key]) >= self.max_attempts

    def record_attempt(self, key: str):
        self._attempts[key].append(time.time())

    def reset(self, key: str):
        self._attempts.pop(key, None)

    def remaining_seconds(self, key: str) -> int:
        if not self._attempts[key]:
            return 0
        oldest = min(self._attempts[key])
        return max(0, int(self.window_seconds - (time.time() - oldest)))


login_limiter = RateLimiter(max_attempts=5, window_minutes=15)
register_limiter = RateLimiter(max_attempts=3, window_minutes=30)
