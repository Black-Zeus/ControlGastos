# ControlGastos

Aplicación web personal para el control de ingresos y egresos mensuales. Diseñada para uso individual o familiar, con cuentas aisladas por usuario, acceso desde cualquier dispositivo y generación de reportes PDF.

---

## ¿Qué es?

ControlGastos nació de la necesidad de digitalizar un control de finanzas personales que vivía en una planilla Excel. En lugar de replicar el modelo de "una hoja por mes", se construyó una webapp completa con base de datos, API REST, interfaz responsive y reportería automática.

La idea central es simple: **cada usuario lleva su propio registro de ingresos y egresos por períodos mensuales**. Los datos de cada cuenta son completamente aislados entre sí.

---

## Funcionalidades principales

### Para el usuario

- **Dashboard** con KPIs del período activo: total ingresos, egresos saldados, egresos pendientes, dinero libre.
- **Ingresos**: registro por fecha, tipo, monto y responsable (etiqueta interna opcional).
- **Egresos**: registro por fecha, categoría, tipo (recurrente/puntual), monto, estado de pago (saldado/pendiente) y observación. Permite adjuntar evidencia fotográfica del gasto.
- **Períodos mensuales**: cada mes es un período que se abre, se trabaja y se cierra. Un período cerrado genera un reporte PDF y puede reabrirse si es necesario.
- **Catálogos propios**: cada usuario gestiona sus categorías de egreso y tipos de ingreso. Puede crear nuevos, activar/desactivar y editar los que no son del sistema.
- **Reportes PDF**: tres tipos de reporte exportables — por categorías, por tendencia mensual y comparación entre períodos. Generados en el servidor vía Gotenberg.
- **Perfil**: nombre, avatar y cambio de contraseña.
- **Recuperación de contraseña**: por email con OTP o token de enlace directo.

### Panel de administración

Acceso separado en `/admin` con credenciales propias:

- **Usuarios**: crear, activar/desactivar, forzar cambio de contraseña. No permite eliminar al único administrador.
- **Catálogos del sistema**: categorías y tipos de ingreso disponibles como base para todos los usuarios.
- **Configuración SMTP**: servidor de correo para envío de bienvenida, recuperación y reportes.
- **Primer acceso bootstrap**: en una instalación nueva sin usuarios, cualquier email con contraseña `admin` crea el primer administrador y fuerza el cambio de contraseña inmediato.

---

## Arquitectura

```
Browser / Móvil
      │
   nginx (proxy reverso, puerto 80)
      ├── /          → Frontend (React + Vite, estáticos servidos por nginx)
      └── /api/      → Backend (FastAPI + Python)
                          ├── PostgreSQL  (datos)
                          ├── MinIO       (evidencias / avatares)
                          └── Gotenberg   (generación de PDF)
```

Todos los servicios corren en una red Docker interna. Solo nginx expone el puerto 80 al exterior.

### Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Python 3.12 + FastAPI + SQLAlchemy (async) |
| Base de datos | PostgreSQL 16 |
| Almacenamiento | MinIO (compatible S3) |
| PDF | Gotenberg 8 |
| Proxy | nginx |
| Contenedores | Docker + Docker Compose |

---

## Entornos

El proyecto incluye tres configuraciones de compose:

| Archivo | Uso |
|---|---|
| `docker-compose-dev.yml` | Desarrollo: hot reload, logs verbose, backend y Vite expuestos |
| `docker-compose-qa.yml` | QA: build de producción, datos aislados de PRD |
| `docker-compose.yml` | Producción: imágenes optimizadas, solo puerto 80 expuesto |

Cada entorno usa su propio archivo de variables: `.env` (base compartida) + `.env.dev` / `.env.prd` (overrides por entorno).

---

## Puesta en marcha (PRD)

### Requisitos

- Docker Engine 24+
- Docker Compose v2
- CPU con soporte x86-64 (para MinIO)

### Primera vez

```bash
# 1. Clonar y entrar al directorio
git clone <repo> controlgastos && cd controlgastos

# 2. Crear variables de entorno
cp .env.example .env
cp .env.prd.example .env.prd
# Editar .env con credenciales seguras
# Editar .env.prd con la IP/dominio del servidor y configuración SMTP

# 3. Levantar el stack (las migraciones corren automáticamente al iniciar el backend)
docker compose --env-file .env --env-file .env.prd up -d --build

# 4. Verificar que todo esté corriendo
docker compose --env-file .env --env-file .env.prd ps
```

### Primer acceso

Acceder a `http://<IP>` y entrar a `/admin`. Con cualquier email y contraseña `admin` se crea el primer administrador. El sistema forzará el cambio de contraseña en el primer login.

### Actualizaciones

```bash
git pull
docker compose --env-file .env --env-file .env.prd up -d --build
```

Las migraciones de base de datos se aplican automáticamente al reiniciar el backend.

---

## Variables de entorno relevantes

| Variable | Descripción |
|---|---|
| `POSTGRES_PASSWORD` | Contraseña de la base de datos |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | Credenciales de MinIO |
| `SECRET_KEY` | Clave para firma de tokens JWT (`openssl rand -hex 32`) |
| `ALLOWED_ORIGINS` | Dominio o IP de la app para CORS (ej. `https://miapp.com`) |
| `VITE_API_BASE_URL` | Prefijo de la API en el frontend (`/api` en todos los entornos con nginx) |
| `PROXY_PORT` | Puerto expuesto al exterior (por defecto `80`) |

---

## Próximas mejoras

### Integración con bots (WhatsApp / Telegram)

El módulo de tokens de ingesta ya está implementado: el administrador puede generar tokens de API y asociarlos a un usuario desde el panel de administración, y el backend tiene el endpoint de recepción listo. Lo que falta es el lado del bot — un conector que reciba mensajes del usuario, interprete el gasto o ingreso descrito en lenguaje natural y lo registre vía API usando el token. Esto permitiría registrar gastos sin abrir la app.

### OCR sobre evidencias

La infraestructura está en su lugar: el contenedor `ocr-worker` corre con Tesseract instalado (español e inglés), el modelo de datos tiene el campo `ocr_raw_text` en los adjuntos y el worker ya hace polling sobre la base de datos buscando imágenes pendientes. Lo que falta es la implementación del procesamiento en sí: descargar la imagen desde MinIO, pasarla por `pytesseract` y guardar el texto extraído. Una segunda fase parseará ese texto para sugerir automáticamente el monto y la fecha del gasto.

---

## Origen del proyecto

Este proyecto es la evolución de una planilla Excel de control financiero personal. El Excel original tenía una hoja por mes con registros de ingresos y egresos, una hoja de catálogos y una hoja de resumen con KPIs. Toda esa lógica fue reescrita como una aplicación web moderna, conservando el modelo de datos y la forma de trabajar que ya era familiar.
