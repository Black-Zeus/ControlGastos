# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

ControlGastos es una webapp de control de finanzas personales (ingresos/egresos por períodos
mensuales, multiusuario con datos aislados). Evolucionó desde una planilla Excel — ver README.md
para el detalle funcional completo (dashboard, catálogos, reportes PDF, recordatorios por email,
panel `/admin` separado con bootstrap de primer administrador).

Todo el código y comentarios del proyecto están en **español** (nombres de variables/funciones en
inglés donde es idiomático, pero docstrings, comentarios y mensajes de usuario en español).

## Arquitectura

```
Browser ──► nginx (puerto 80) ──┬── /       → Frontend (React+Vite, estático en prod)
                                 └── /api/   → Backend (FastAPI)
                                                  ├── PostgreSQL
                                                  ├── MinIO (evidencias/avatares)
                                                  ├── Gotenberg (PDF)
                                                  ├── Redis (rate limiting compartido)
                                                  ├── ocr-worker (polling sobre attachments pendientes)
                                                  └── reminder-worker (recordatorios diarios por email)
```

Todos los servicios corren en Docker en una red interna; solo nginx expone puerto al exterior.
Stack: Python 3.12 + FastAPI + SQLAlchemy async, React 18 + TypeScript + Vite + Tailwind,
Postgres 16, MinIO, Gotenberg 8, Redis 7.

### Backend — capas y convenciones (`backend/app/`)

**No hay capa de repositorios ni de schemas separada** (`repositories/` y `schemas/` existen pero
están vacíos). El patrón real es: cada router en `routers/*.py` define sus propios modelos Pydantic
(`*Out`, `*Create`, `*Update`) inline al principio del archivo, y consulta SQLAlchemy directamente
con `AsyncSession` inyectado vía `Depends(get_db)`. Sigue este patrón al tocar o crear routers en
vez de introducir una capa de abstracción nueva.

- `models/` — SQLAlchemy declarativo (`Mapped`/`mapped_column`), un archivo por dominio
  (`transaction.py` tiene tanto `Income` como `Expense`+`Attachment`; `shopping_list.py`,
  `catalog.py`, `period.py`, `user.py`, `settings.py`, `ingestion.py`, `password_reset.py`,
  `email_log.py`). Enums de dominio (`PaymentStatus`, `ReviewStatus`, `TransactionSource`, etc.)
  viven junto al modelo que los usa y se mapean a `Enum` de Postgres — para agregar un valor nuevo
  se extiende el enum vía migración Alembic (`ALTER TYPE ... ADD VALUE`), nunca se agrega una
  columna paralela.
- `auth/` — JWT con `token_version` en el usuario (invalida sesiones existentes al incrementarlo),
  `dependencies.py` expone `get_current_user` y `get_current_admin` (el admin además exige que
  `must_change_password` sea falso). Sesión de usuario y sesión de admin son JWT independientes con
  sus propios contextos en frontend (`AuthContext` vs `AdminAuthContext`).
- `routers/` — un router por dominio, todos montados bajo el prefijo `/api/v1` en `main.py`
  (excepto `/api/health`, sin prefijo). `admin.py` y `shopping_lists.py`/`periods.py` son los más
  grandes (800/530/650 líneas) — al editarlos, ubica la sección relevante por los comentarios de
  separador (`# ─── Schemas ───`, etc.) antes de hacer cambios grandes.
- `workers/` — procesos standalone (no FastAPI), cada uno con su propio Dockerfile
  (`Dockerfile.ocr`, `Dockerfile.reminder`) y build context en `docker-compose*.yml`.
  `ocr_worker.py` hace polling sobre attachments pendientes de OCR (Tesseract, es+en).
  `reminder_worker.py` calcula "mañana" en la zona horaria de cada usuario (default
  `America/Santiago`) para enviar el email diario de pendientes.
- `services/` — lógica de generación de PDF vía Gotenberg (`pdf_report.py`, `pdf_analytics.py`) y
  envío de correo (`email.py`).
- Reglas de período (ver docstring de `routers/expenses.py`): todo egreso/ingreso se vincula al
  período **abierto** al momento de creación; solo puede editarse/eliminarse si ese período sigue
  abierto; sin período abierto no se puede crear.
- Migraciones: Alembic, `script_location = alembic` (dentro de `backend/`). `env.py` importa
  `app.models.Base` (todos los modelos deben registrarse en `models/__init__.py` para que
  autogenerate los detecte) y lee la URL desde `Settings.database_url`.

### Egresos compuestos / Listas de compra (feature en curso)

`expenses.items` (JSONB, nullable) permite que un egreso sea "compuesto": guarda un desglose de
ítems sin cambiar cómo se contabiliza (sigue siendo un registro, una categoría, un monto total).
Dos orígenes: **Listas de Compra** (`shopping_lists.py` + `ShoppingList`/`ShoppingListItem`,
implementado — "enviar a egreso" crea un `Expense` con `items` = snapshot y
`shopping_list_id` apuntando a la lista, que no se cierra ni se modifica) y **desglose manual
ad-hoc** desde el formulario de egreso normal (pendiente, ver TODO.md). No dupliques
`expenses.source` (ya es el enum `TransactionSource`) al integrar orígenes nuevos (p. ej. mobile).

Ver `TODO.md` para el diseño completo de esta feature y de la futura app mobile
(React Native/Expo, sync offline-first con SQLite).

### Frontend (`frontend/src/`)

- Sin capa `api/` centralizada: los clientes HTTP viven en `lib/userApi.ts` (usuario) y
  `lib/adminApi.ts` (admin), cada uno con su propio `request<T>()` wrapper. El access token vive
  **solo en memoria** (`setAuthToken`/`authToken` en el módulo, nunca `localStorage`) — lo fija el
  contexto de auth correspondiente tras login/refresh.
- `contexts/AuthContext.tsx` / `AdminAuthContext.tsx` — sesiones de usuario y admin son
  independientes (rutas, tokens y layouts separados: `AppLayout` vs `AdminLayout`).
- `router/` define todas las rutas con `ProtectedRoute`/`AdminRoute` como guards; nuevas páginas se
  registran ahí.
- `stores/userStore.ts` usa Zustand.
- `components/ui/` — primitivas basadas en Radix; `DataTable` ya soporta filas expandibles
  (`isExpandable`/`renderExpanded`), usado para mostrar el desglose de `items` en egresos.
- Alias `@/` → `frontend/src`.

## Comandos

No hay suite de tests automatizados (ni backend ni frontend) en este repo — verifica cambios
manualmente vía el entorno dev o revisando lógica/tipos.

### Entorno de desarrollo (Docker, con hot-reload)

```bash
docker compose --env-file .env --env-file .env.dev -f docker-compose-dev.yml up -d --build
docker compose --env-file .env --env-file .env.dev -f docker-compose-dev.yml logs -f <servicio>
docker compose --env-file .env --env-file .env.dev -f docker-compose-dev.yml down
```

Servicios: `backend` (puerto 8000, `--reload`), `frontend` (Vite, vía proxy `nginx`),
`proxy` (puerto 80, nginx sin TLS), `db`, `storage` (MinIO), `gotenberg`, `redis`, `mailpit`
(puerto 8025, captura correos salientes en dev), `ocr-worker`, `reminder-worker`. En dev, docs de
FastAPI disponibles en `/api/docs` (`debug=true`).

También existe `docker_tools_v3.sh`, un gestor interactivo (menú, no acepta flags de línea de
comandos) para levantar/bajar/inspeccionar el stack — ver [[feedback_docker_tools_v3]] en memoria
para las convenciones que debe respetar cualquier archivo compose/env nuevo.

### Backend — comandos sueltos (dentro del contenedor o venv local)

```bash
cd backend
alembic upgrade head                              # aplicar migraciones (también corre automático en start.sh/Dockerfile)
alembic revision --autogenerate -m "descripción"   # nueva migración a partir de cambios en models/
```

### Frontend — comandos sueltos

```bash
cd frontend
npm run dev       # Vite dev server (normalmente vía docker-compose-dev, no local)
npm run build     # tsc -b && vite build
npm run lint      # eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
```

### Entornos

Tres archivos de compose (`docker-compose-dev.yml`, `-qa.yml`, `.yml`=prod), cada uno con su
`.env.<entorno>` de overrides sobre el `.env` base compartido. Nunca fijar imágenes con `:latest`
— siempre versión estable explícita (ver [[feedback_docker_versiones]] en memoria).
