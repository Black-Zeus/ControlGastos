# TODO — ControlGastos

Registro de funcionalidades pendientes y propuestas.

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
