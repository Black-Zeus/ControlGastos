"""
Simple in-memory sliding-window rate limiter.
Single-process only — sufficient for this deployment.
"""
import time
from collections import defaultdict
from fastapi import HTTPException, Request, status

# {key: [timestamps]}
_log: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_calls: int, window_seconds: int = 60):
    """FastAPI dependency: limits to max_calls per window_seconds per client IP."""
    def dependency(request: Request) -> None:
        ip = (request.client.host if request.client else "unknown")
        key = f"{ip}:{request.url.path}"
        now = time.monotonic()
        cutoff = now - window_seconds
        recent = [t for t in _log[key] if t > cutoff]
        if len(recent) >= max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos. Intenta de nuevo más tarde.",
                headers={"Retry-After": str(window_seconds)},
            )
        recent.append(now)
        _log[key] = recent
    return dependency
