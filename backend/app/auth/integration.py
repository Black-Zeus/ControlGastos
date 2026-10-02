"""
Autenticación de integraciones server-to-server (n8n → backend).

Los identificadores de canal (chat_id de Telegram, número de WhatsApp) no son
secretos, así que toda ruta que confíe en ellos exige además el header
X-Integration-Key, comparado en tiempo constante contra INTEGRATION_KEY.
Sin INTEGRATION_KEY configurada, esas rutas responden 503 (fail closed).
"""
import secrets

from fastapi import HTTPException, Request, status

from app.config import get_settings


def assert_integration_key(request: Request) -> None:
    expected = get_settings().integration_key
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integración por canal deshabilitada en este servidor",
        )
    provided = request.headers.get("X-Integration-Key", "")
    if not secrets.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clave de integración inválida")


async def require_integration_key(request: Request) -> None:
    """Dependencia FastAPI para rutas que solo llama la integración."""
    assert_integration_key(request)
