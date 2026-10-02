# TODO — ControlGastos

Registro de funcionalidades pendientes y propuestas.

---

## [EN PROGRESO] Optimización UI mobile — vistas de usuario mergeadas en `main`

Especificación en `optimizacion_ui_mobile.md` (raíz). Breakpoint único: `sm` (640 px) de Tailwind;
todo cambio va bajo `sm:`/`lg:` para no alterar escritorio.

### Hecho

- Componentes compartidos en `components/ui/`: `Modal`, `KpiCard` (unificada), `KpiGrid`,
  `FormGrid` (`Grids.tsx`), `ScrollTable`; `FilterBar` con flujo vertical en mobile.
- `AppLayout`: topbar sticky en mobile (el ☰ ya no tapa títulos). Eliminado `TopBar.tsx` (sin uso).
- KPIs en 1 columna (mobile) / 2 (tablet) / N (desktop) en todas las vistas de usuario; montos
  sin truncar.
- Tablas: `DataTable` (datos con orden/paginación) y `ScrollTable` (resúmenes hechos a mano en
  Dashboard y reportes). Se decidió **mantener los dos componentes**.
- Modales: las copias locales se reemplazaron por `ui/Modal` (alto con `dvh`, cuerpo con scroll);
  vista previa de PDF a pantalla completa en mobile.
- Formularios de Ingreso, Egreso, Agregar producto, Nuevo período y Perfil en 1 columna.

- Panel admin con los mismos componentes (KPIs, `Modal`, `ScrollTable`).
- `eslint` 10 (flat config) instalado; `npm run lint` en verde.

### Pendiente

- Evaluar las reglas de `react-hooks` 7 orientadas al React Compiler (`set-state-in-effect`,
  `static-components`, `preserve-manual-memoization`), hoy desactivadas en `eslint.config.js`.

---

## [PENDIENTE] Egresos — mejoras de UX

### ~~Columna de acciones sobrecargada~~ — resuelto en `fix/ui-mobile`

`DataTable` acepta `RowAction.primary`: si alguna acción lo marca, solo las primarias quedan como
botón y el resto va a un menú "⋯" (Radix `DropdownMenu`). En Egresos quedan visibles **Editar** y
**Pasar a saldado**, y **Confirmar borrador** solo en filas en borrador. Pendiente evaluar el mismo
patrón en otras tablas con muchas acciones.

### ~~Rango de fechas y disponible por compromisos~~ — hecho

`DateRangeFilter` (Desde/Hasta + atajos Hoy, Esta semana, 7 y 15 días hacia adelante) filtra la
tabla y los KPIs. La tarjeta **Disponible** calcula ingresos del período − ya pagado en el período −
pendiente en la vista (rango + filtros). La tabla ordena por fecha ascendente por defecto.
Posible extensión: el mismo selector en Ingresos.

### Selección múltiple y acciones masivas

Permitir marcar varios egresos (checkbox por fila + "seleccionar todos" sobre lo filtrado) y
aplicar una acción en bloque. Caso principal: **confirmar todos los borradores** de una vez
(egresos en borrador que vienen de la ingesta/OCR). Otras candidatas: marcar como saldado o
pendiente y eliminar.

- Frontend: `DataTable` no soporta selección hoy; hay que agregarla sin romper las filas
  expandibles (`isExpandable`/`renderExpanded`).
- Backend: evaluar un endpoint bulk (p. ej. `POST /expenses/bulk` con `ids` + `action`) en vez de N
  llamadas, respetando las reglas de período (solo egresos de un período abierto) y devolviendo el
  resultado por ítem para informar cuáles fallaron.
- Confirmar un borrador exige monto, categoría y fecha válidos: definir qué pasa con los que no los
  tienen (omitirlos e informarlos, o bloquear la acción).

---

## [EN PROGRESO] Egresos Compuestos y Listas de Compra

### Qué busca cubrir

Actualmente un egreso es un monto único con una descripción. Hay situaciones cotidianas donde
ese monto es el resultado de varios ítems distintos comprados en el mismo acto o evento:

- La feria semanal (10–20 productos)
- Los gastos de una fiesta en múltiples locales
- La compra mensual del supermercado
- Un regalo entre varias personas con distintos costos

Hoy la única opción es agrupar todo bajo una descripción genérica ("Feria 28 junio") y perder
el detalle. La columna `expenses.items` (JSONB) guarda ese desglose sin cambiar cómo el sistema
contabiliza el egreso (sigue siendo un registro, una categoría, un monto total) — y sirve a **dos
orígenes distintos**:

1. **Listas de Compra** (implementado): una lista reutilizable (supermercado, feria, cumpleaños)
   donde se van marcando productos comprados y su monto. Al "enviar a egreso" se crea un Expense
   con `items` = snapshot de los productos comprados y `shopping_list_id` apuntando a la lista de
   origen — pero la lista en sí **no se modifica ni se cierra**, sigue disponible para la próxima
   compra (ver `backend/app/routers/shopping_lists.py` y `frontend/src/pages/ShoppingList*.tsx`).
2. **Desglose manual ad-hoc** (pendiente): agregar ítems directamente desde el formulario de un
   egreso normal, sin pasar por una lista de compra — ver "Trabajo restante" abajo.

### Concepto

Un egreso puede ser **simple** (como hoy) o **compuesto** (tiene ítems internos, en `items`).
Desde afuera del registro no cambia nada: mismo período, misma categoría, mismo total.
Desde adentro: se puede expandir (fila expandible en Egresos, ya implementada en `DataTable`
vía `isExpandable`/`renderExpanded`) y ver la composición.

### Integración con el sistema actual

**No rompe nada existente.** El cambio es aditivo:
- Los egresos sin ítems siguen funcionando igual
- Los reportes y totales de período no cambian (cuentan el monto del egreso, no los ítems)

### Nota sobre `source` — no dupliques esta columna

La primera versión de esta propuesta sugería agregar `source: VARCHAR(20) nullable` a `expenses`
para distinguir `"web"`/`"mobile"`/`"api"`. **Esto ya existe**: `expenses.source` es un enum
Postgres (`TransactionSource`, hoy `web`/`ingestion`). Cuando la app mobile necesite distinguir su
origen, la forma correcta es extender ese enum (`ALTER TYPE transaction_source ADD VALUE 'mobile'`
vía migración Alembic) — no agregar una columna paralela.

### Trabajo restante — Listas de Compra

1. ~~**Editar el título de la lista**~~ — hecho (lápiz junto al título en el detalle). El listado
   muestra además el monto ya comprado de cada lista.
2. ~~**Listas siempre visibles en Egresos**~~ — hecho. Cada lista activa con productos comprados
   sin enviar aparece en Egresos como fila de solo lectura "Lista compra [Borrador] - nombre"
   (calculada en el frontend con `pending_send_amount`; no se guarda ni suma en los KPIs, pero
   sí se resta aparte en "Disponible"). Su fecha es `shopping_lists.planned_date` ("Fecha de
   compra", p. ej. 24/12 para Navidad) o hoy; solo se ve en el mes de esa fecha. "Editar" lleva a
   la lista. Al enviar se crea el egreso real y el modal obliga a elegir: dejar la lista como
   plantilla (reiniciar) o eliminarla.
   - **Cada envío crea un egreso nuevo** (p. ej. la feria de cada semana) con un PDF de evidencia
     (Gotenberg) como adjunto único; nunca modifica un egreso ya registrado. Un ítem enviado
     (`sent_at`) no se reenvía hasta reiniciar la lista.
   - Ítems y monto de esos egresos quedan bloqueados (`expenses.items_from_list`). Para
     corregirlos: **"Devolver a lista de compra"** (`POST /shopping-lists/from-expense/{id}`) crea
     una lista con los ítems comprados y elimina el egreso con su adjunto.
   - Pendiente evaluar: el egreso enviado se registra en el período abierto aunque la fecha de
     compra caiga en otro mes (mismo comportamiento que antes de esta función).

### ~~Desglose manual en el formulario de egresos~~ — hecho

Sección "Desglosar en ítems" en el formulario de egreso. La API acepta `items` en create/update y
usa su suma como monto; los egresos de lista de compra no admiten desglose manual.

#### Mobile (React Native / Expo — pendiente de arrancar)

El modelo de lista de compras en SQLite se diseña para convertirse en un egreso compuesto:
- Lista local: `shopping_lists` + `shopping_list_items` (solo en SQLite, nunca sube)
- Al "cerrar" la lista, crea un payload equivalente a `POST /shopping-lists/{id}/send-to-expense`
- Se encola en la cola de sincronización y sube al servidor cuando hay conexión
- El servidor ya tiene el modelo de datos (`ShoppingList`/`ShoppingListItem`) — el trabajo mobile
  es sincronizar contra ese mismo esquema, no inventar uno nuevo

---

## [EN PROGRESO] Integraciones — vinculación de canales (Telegram/WhatsApp vía n8n)

Implementado en `backend/app/routers/channels.py` + `frontend/src/pages/IntegrationsPage.tsx`
(migración `315c19dda564`). Mergeado en `main`; **aún no desplegado en producción.**

### ~~Autenticar a n8n en la ingesta por canal~~ — resuelto

`POST /channels/link` y la ingesta por canal (`X-Channel` + `X-Channel-Id`) exigen el header
`X-Integration-Key`, validado con `secrets.compare_digest` contra la variable `INTEGRATION_KEY`
(ver `app/auth/integration.py`). Si la variable está vacía, esas rutas responden 503. El esquema
`Bearer <ingestion_token>` no cambia.

### Para desplegar

- Generar la clave (`openssl rand -hex 32`) y ponerla en `.env.prd` del CT108 como
  `INTEGRATION_KEY=...`; la misma clave va en las credenciales de n8n.
- En los flujos de n8n, enviar `X-Integration-Key` en `POST /channels/link` y en todas las
  llamadas a `/ingestion/*` que usen `X-Channel`/`X-Channel-Id`.
- Opcional (defensa en profundidad): restringir esas rutas en nginx a la IP o red de n8n.

### Otros pendientes

- Lint del frontend: `npm run lint` no corre porque `eslint` no está en las dependencias (los
  tipos sí se verificaron con `tsc -b`).
- Probar end-to-end con n8n real en dev. Contra la API ya se probó con curl: código →
  `POST /channels/link` → recibo con headers de canal (401 sin clave o con clave errónea).
- Revisar en el navegador lo que entró con la rama: `/integraciones` (generar código, ver el
  vínculo, desvincular), el menú agrupado de `/admin` expandido/colapsado en desktop y mobile, y
  que las imágenes de las guías carguen en `/ayuda`.

---

## [PENDIENTE] App Mobile — React Native / Expo Lite

### Qué busca cubrir

Versión mínima de la app para registro rápido de gastos e ingresos desde el celular,
con soporte offline (SQLite local) y sincronización con el backend cuando hay conexión.

### Features planeadas

- Registro de egresos e ingresos offline
- Cola de sincronización append-only (los conflictos no existen: todo se registra, nada se edita desde mobile)
- **Listas de compras** → conversión a egreso compuesto (ver sección anterior)
- Vista de egresos recientes (solo lectura, desde el servidor)
- Autenticación con el mismo token JWT del sistema

### Integración y sincronización

La app permite **crear y editar** registros del período activo. El sync no es append-only:
hay que resolver conflictos cuando web y mobile modificaron el mismo registro.

#### Flujo de sincronización

```
Mobile inicia sync
  → envía al servidor: lista de cambios locales con su updated_at
  → servidor responde: cambios en web desde el último sync del dispositivo

Para cada registro en conflicto (modificado en ambos lados):
  → se muestra al usuario una pantalla de resolución:
       [Versión web]          [Versión mobile]
       Monto: $12.000         Monto: $14.500
       Desc: "Almuerzo"       Desc: "Almuerzo trabajo"
       Modificado: ayer 14h   Modificado: hoy 09h
       [ Mantener web ]       [ Mantener mobile ]

Al resolver todos los conflictos:
  → mobile aplica las versiones ganadoras en SQLite
  → sube al servidor los registros donde ganó mobile
  → descarga del servidor los registros donde ganó web
  → estado final: web y mobile idénticos
```

#### Reglas de conflicto

- **Sin conflicto (web más nuevo)**: mobile descarga y sobreescribe su copia local
- **Sin conflicto (mobile más nuevo)**: mobile sube el cambio, servidor aplica
- **Conflicto real** (ambos modificados desde el último sync): resolución manual obligatoria
- Los registros **nuevos** (creados en mobile sin contraparte en web) nunca tienen conflicto

#### Campos requeridos en el modelo

- `updated_at: timestamp` — ya debe existir en la tabla (para comparar versiones)
- `device_id` o `last_sync_token` — para que el servidor sepa desde cuándo calcular cambios

#### SQLite local

Tablas: `expenses_local`, `incomes_local`, `shopping_lists`, `shopping_list_items`, `sync_meta`

`sync_meta` guarda: `last_sync_at`, `device_id`, `period_id_activo`

### Stack propuesto

- React Native + Expo SDK
- `expo-sqlite` para persistencia local
- Zustand para estado global
- Mismo sistema de categorías e income types descargado del servidor al iniciar sesión

---

## [PENDIENTE] Operación de producción (post-despliegue 0.3.0, 2026-10-01)

Producción corre en el CT108 de PVE2 (`/docker/vsoto.cl/PrivateApp/ControlGastos`, compose con
`--env-file .env --env-file .env.prd`). Pendientes que dejó el despliegue de la 0.3.0:

### Restricción de CPU del host (VIA Nano X2, sin x86-64-v2)

El host no soporta SSE4.2, y numpy >= 2.5 exige x86-64-v2: al importarse (vía `pytesseract` o
`pandas`) crashea el backend y el `ocr-worker` al arrancar. Por eso `numpy==2.3.5` está fijado en
`backend/requirements.txt`.

- Al actualizar dependencias con binarios (numpy, pandas, Pillow, etc.), verificar el import en el
  host **antes** de desplegar:
  `docker run --rm --entrypoint python <imagen> -c "import numpy, pandas, pytesseract"`.
- Si se migra la app a un host con CPU x86-64-v2 o superior, se puede quitar el pin.

### Reconstruir imágenes de forma limpia

Las imágenes `controlgastos-{backend,ocr-worker,reminder-worker}:latest` en producción son un
hotfix (imagen 0.3.0 + `pip install numpy==2.3.5` en una capa extra). Funcionan igual, pero hay que
reconstruirlas con `docker compose ... build` cuando el pin esté en `main` y se haya hecho
`git pull` en el CT108, para que la imagen corresponda exactamente al Dockerfile.

### Limpieza de respaldos e imágenes del despliegue

- Imágenes `controlgastos-*:0.3.0-numpyfail`: borrar (no sirven).
- Imágenes `controlgastos-*:pre-0.3.0` y respaldo
  `/root/backups/controlgastos/20261001-085100-pre-0.3.0/` (dump DB, MinIO, config): conservar un
  período de gracia y luego borrar o mover fuera del CT.
- Evaluar respaldos periódicos de la DB y MinIO fuera del CT108 (hoy no hay ninguno automatizado).

### Procedimiento de despliegue y rollback

El backend ejecuta `alembic upgrade head` al arrancar, así que **una imagen anterior no arranca
contra una DB ya migrada** (falla con `Can't locate revision`). Un rollback real exige: imágenes
`pre-<versión>` + `git checkout` del commit previo + restaurar el `pg_dump`. Documentar el
procedimiento de despliegue (respaldo → build → stop → migrar → verificar) en el README o en un
script, y evaluar separar la migración del arranque del contenedor.
