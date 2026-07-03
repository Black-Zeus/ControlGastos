from redis.asyncio import Redis, ConnectionPool
from app.config import get_settings

settings = get_settings()
_pool = ConnectionPool.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> Redis:
    return Redis(connection_pool=_pool)
