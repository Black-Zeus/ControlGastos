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

### Pendiente

- **Panel admin** (fuera de alcance de esta tanda): KPIs `grid-cols-2`, copias locales de `Modal`
  en `AdminCategories`/`AdminUsers`/`AdminIncomeTypes`, tabla de `AdminSettingsPage` sin
  `ScrollTable`, grid de 3 columnas en `AdminIncomeTypesPage`.
- Revisión visual completa en 320/360/375/390/412/430/480/768 px y desktop antes de mergear.
- `npm run lint` no funciona: `eslint` no está en las dependencias del frontend.

---

## [PENDIENTE] Egresos — mejoras de UX

### ~~Columna de acciones sobrecargada~~ — resuelto en `fix/ui-mobile`

`DataTable` acepta `RowAction.primary`: si alguna acción lo marca, solo las primarias quedan como
botón y el resto va a un menú "⋯" (Radix `DropdownMenu`). En Egresos quedan visibles **Editar** y
**Pasar a saldado**. Pendiente evaluar: dejar también **Confirmar borrador** como primaria (solo
en filas en borrador) y aplicar el mismo patrón a otras tablas con muchas acciones.

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

1. **Editar el título de la lista**: el backend ya lo soporta (`PATCH /shopping-lists/{id}` acepta
   `name`), falta la UI en `ShoppingListDetailPage.tsx` y/o `ShoppingListsPage.tsx` (edición inline
   o modal).
2. **Listas siempre visibles en Egresos, saldadas solo al enviarlas**: las listas de compra deben
   aparecer siempre en la pestaña Egresos (como gasto en curso o pendiente), y pasar a `saldado`
   **solo** cuando se pulsa "Enviar a egreso". Hoy la lista no aparece en Egresos hasta enviarla, y
   el envío crea el egreso directamente como `saldado`.
   - Definir cómo se representa en Egresos antes del envío: ¿egreso `pendiente` vinculado por
     `shopping_list_id` y actualizado al enviar, o una fila virtual que no suma a los totales?
     Cuidar que no se dupliquen montos en los totales del período.
   - Revisar el texto del botón y de la descripción de "Enviar a egreso" (quizá "Marcar como
     saldado" o "Cerrar compra") para que refleje el nuevo comportamiento.

### Trabajo restante — Desglose manual en el formulario de egresos

1. **Formulario de nuevo/editar egreso** — sección colapsable "Desglosar en ítems":
   - Lista editable de pares (descripción, monto)
   - Botón "Agregar ítem"
   - Total calculado en tiempo real
   - Si hay ítems, el campo de monto principal se vuelve solo lectura (= suma)
2. Reutiliza la columna `items` y la fila expandible que ya están implementadas — no requiere
   tocar el esquema ni `DataTable`, solo el formulario de `ExpensesPage.tsx`.

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
