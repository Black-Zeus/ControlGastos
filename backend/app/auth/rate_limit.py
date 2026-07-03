"""
Rate limiter de ventana fija respaldado por Redis — compartido entre los
workers de uvicorn (un dict en memoria por proceso permitía sortear el
límite real multiplicando por N workers).
"""
from fastapi import HTTPException, Request, status

from app.redis_client import get_redis


def rate_limit(max_calls: int, window_seconds: int = 60):
    """FastAPI dependency: limita a max_calls por window_seconds por IP de cliente."""
    async def dependency(request: Request) -> None:
        ip = (request.client.host if request.client else "unknown")
        key = f"ratelimit:{request.url.path}:{ip}"
        redis = get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window_seconds)
        if count > max_calls:
            ttl = await redis.ttl(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos. Intenta de nuevo más tarde.",
                headers={"Retry-After": str(ttl if ttl and ttl > 0 else window_seconds)},
            )
    return dependency
