import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

logger = logging.getLogger(__name__)

_INSECURE_ADMIN_PASSWORD = "admin1234"


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

    # Seed admin (solo se usa al crear el primer admin si no existe)
    admin_email: str = "admin@controlgastos.dev"
    admin_password: str = _INSECURE_ADMIN_PASSWORD
    admin_name: str = "Administrador"

    def warn_insecure_defaults(self) -> None:
        if self.admin_password == _INSECURE_ADMIN_PASSWORD:
            logger.critical(
                "SECURITY: admin_password usa el valor por defecto inseguro 'admin1234'. "
                "Establece ADMIN_PASSWORD en el entorno antes de exponer la app a internet."
            )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
