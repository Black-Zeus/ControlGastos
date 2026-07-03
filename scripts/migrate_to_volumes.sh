#!/usr/bin/env bash
# ==============================================================
# migrate_to_volumes.sh
# Migra datos desde bind-mounts (APP/data/{env}/) a Docker
# named volumes. Debe ejecutarse con los contenedores DETENIDOS.
#
# Uso:
#   ./scripts/migrate_to_volumes.sh --env-file .env.prd
#   ./scripts/migrate_to_volumes.sh --env-file .env.dev
# ==============================================================

set -euo pipefail

# ── Argumento --env-file ─────────────────────────────────────
ENV_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "Uso: $0 --env-file <archivo>"; exit 1 ;;
  esac
done

if [[ -z "$ENV_FILE" ]]; then
  echo "Error: debes indicar --env-file (.env.prd, .env.dev, etc.)"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: no se encuentra el archivo '$ENV_FILE'"
  exit 1
fi

# Cargar variables del env file (ignorar líneas vacías y comentarios)
set -o allexport
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
set +o allexport

PROJECT_NAME="${PROJECT_NAME:?La variable PROJECT_NAME no está definida en $ENV_FILE}"
ENV="${ENV:?La variable ENV no está definida en $ENV_FILE}"
DATA_ROOT="${DATA_ROOT:?La variable DATA_ROOT no está definida en $ENV_FILE}"

POSTGRES_SRC="${DATA_ROOT}/postgres"
MINIO_SRC="${DATA_ROOT}/minio"

VOL_POSTGRES="${PROJECT_NAME}-${ENV}-postgres"
VOL_MINIO="${PROJECT_NAME}-${ENV}-minio"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Migración bind-mount → Docker volumes"
echo "  Proyecto : $PROJECT_NAME  |  Entorno: $ENV"
echo "  Origen   : $DATA_ROOT"
echo "  Volúmenes: $VOL_POSTGRES, $VOL_MINIO"
echo "══════════════════════════════════════════════════════"
echo ""

# ── Verificar que los contenedores estén detenidos ───────────
RUNNING=$(docker ps --filter "label=stack=${PROJECT_NAME}" --filter "label=env=${ENV}" -q)
if [[ -n "$RUNNING" ]]; then
  echo "ERROR: Hay contenedores corriendo para este stack."
  echo "Detén los servicios primero:"
  echo "  docker compose --env-file $ENV_FILE -f docker-compose.yml down"
  exit 1
fi

# ── Verificar que exista data de origen ──────────────────────
if [[ ! -d "$POSTGRES_SRC" ]]; then
  echo "AVISO: No existe $POSTGRES_SRC — se omite migración de PostgreSQL"
  SKIP_POSTGRES=1
else
  SKIP_POSTGRES=0
fi

if [[ ! -d "$MINIO_SRC" ]]; then
  echo "AVISO: No existe $MINIO_SRC — se omite migración de MinIO"
  SKIP_MINIO=1
else
  SKIP_MINIO=0
fi

# ── Crear volúmenes ──────────────────────────────────────────
echo "→ Creando volúmenes Docker..."

if docker volume inspect "$VOL_POSTGRES" &>/dev/null; then
  echo "  $VOL_POSTGRES ya existe — se omite creación"
else
  docker volume create "$VOL_POSTGRES"
  echo "  Creado: $VOL_POSTGRES"
fi

if docker volume inspect "$VOL_MINIO" &>/dev/null; then
  echo "  $VOL_MINIO ya existe — se omite creación"
else
  docker volume create "$VOL_MINIO"
  echo "  Creado: $VOL_MINIO"
fi

# ── Copiar datos ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ $SKIP_POSTGRES -eq 0 ]]; then
  echo ""
  echo "→ Copiando datos de PostgreSQL..."
  docker run --rm \
    -v "${PROJECT_DIR}/${POSTGRES_SRC#./}:/source:ro" \
    -v "${VOL_POSTGRES}:/dest" \
    alpine sh -c "cp -a /source/. /dest/ && echo '  PostgreSQL: OK'"
fi

if [[ $SKIP_MINIO -eq 0 ]]; then
  echo ""
  echo "→ Copiando datos de MinIO..."
  docker run --rm \
    -v "${PROJECT_DIR}/${MINIO_SRC#./}:/source:ro" \
    -v "${VOL_MINIO}:/dest" \
    alpine sh -c "cp -a /source/. /dest/ && echo '  MinIO: OK'"
fi

# ── Resultado ────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  Migración completada."
echo ""
echo "  Próximos pasos:"
echo "  1. Levantar el stack con la nueva configuración:"
if [[ "$ENV" == "prd" ]]; then
  echo "     docker compose --env-file $ENV_FILE up -d"
elif [[ "$ENV" == "dev" ]]; then
  echo "     docker compose --env-file $ENV_FILE -f docker-compose-dev.yml up -d"
else
  echo "     docker compose --env-file $ENV_FILE -f docker-compose-${ENV}.yml up -d"
fi
echo ""
echo "  2. Verificar que la app funcione correctamente."
echo ""
echo "  3. Si todo está OK, puedes archivar los datos originales:"
echo "     mv ${DATA_ROOT} ${DATA_ROOT}.bak"
echo "══════════════════════════════════════════════════════"
