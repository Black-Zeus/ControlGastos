from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.seed import seed_system_catalogs
from app.routers import auth, admin, catalog, ingestion
from app.routers import expenses, incomes, periods, attachments, profile, recovery, reports

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        await seed_system_catalogs(db)
    yield


# Docs only in debug/dev — never exposed in production
_docs_url   = "/api/docs"   if settings.debug else None
_redoc_url  = "/api/redoc"  if settings.debug else None
_openapi_url = "/api/openapi.json" if settings.debug else None

app = FastAPI(
    title="ControlGastos API",
    version="0.1.0",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
    lifespan=lifespan,
)

# CORS — never use wildcard with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


PREFIX = "/api/v1"

app.include_router(auth.router,      prefix=PREFIX)
app.include_router(admin.router,     prefix=PREFIX)
app.include_router(catalog.router,   prefix=PREFIX)
app.include_router(ingestion.router, prefix=PREFIX)
app.include_router(expenses.router,  prefix=PREFIX)
app.include_router(incomes.router,   prefix=PREFIX)
app.include_router(periods.router,   prefix=PREFIX)
app.include_router(attachments.router, prefix=PREFIX)
app.include_router(profile.router,    prefix=PREFIX)
app.include_router(recovery.router,   prefix=PREFIX)
app.include_router(reports.router,    prefix=PREFIX)


@app.get("/api/health")
async def health():
    return {"status": "ok", "env": settings.env}
