#!/bin/sh
set -e

echo "[startup] Running Alembic migrations..."
alembic upgrade head

echo "[startup] Starting server..."
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload \
  --reload-dir /app
