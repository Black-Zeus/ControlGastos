from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.dev"), extra="ignore")

    # App
    env: str = "dev"
    debug: bool = False
    log_level: str = "INFO"

    # Database
    database_url: str

    # Auth
    secret_key: str
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # CORS — comma-separated list of allowed origins (e.g. https://app.tudominio.cl)
    allowed_origins: str = "http://localhost:5173"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str = "receipts"
    minio_use_ssl: bool = False

    # Gotenberg
    gotenberg_url: str = "http://localhost:3000"

    # Redis (rate limiting compartido entre workers)
    redis_url: str = "redis://localhost:6379/0"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def cookie_secure(self) -> bool:
        """Cookies Secure requieren HTTPS — desactivado solo en dev (http://localhost)."""
        return self.env != "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
