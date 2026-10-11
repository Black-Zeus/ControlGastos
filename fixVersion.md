# Historial de versiones — ControlGastos

Registro de cambios por versión. La versión vive en `frontend/package.json` y en
`version=` de la app FastAPI (`backend/app/main.py`).

---

## 0.4.4 — Desplegada el 2026-10-11

Solo frontend, sin migraciones. Se recrea únicamente `frontend`; backend y workers reutilizan las
imágenes anteriores reetiquetadas (el backend sigue reportando `0.4.2`).

### Visor de adjuntos (Egresos)
- Botón "Descargar" siempre visible. Si el navegador no puede mostrar el PDF embebido (Chrome en
  Android), el aviso ofrece "Descargar PDF" en vez de quedar sin salida.
- Se elimina el botón "Volver" y el listado de adjuntos: el visor muestra solo el adjunto del egreso.
- Validación de seguridad: el backend ya restringía lista y descarga a egresos del usuario
  (`Expense.user_id == current_user.id`). Prueba en dev con un usuario temporal: lista y descarga
  de un adjunto ajeno → 404; sin token → 403; dueño → 200. No había exposición de datos.

---

## 0.4.3 — Desplegada el 2026-10-11

Solo frontend, sin migraciones (Alembic `99e116fc4116`). Se recrea únicamente `frontend`; backend
y workers reutilizan las imágenes de 0.4.2 reetiquetadas (el backend sigue reportando `0.4.2`).

### Vista para teléfono (< 640 px)
- Egresos, Ingresos y Listas de compra (índice y detalle) se muestran como tarjetas: sin scroll
  horizontal, acciones siempre visibles (botones de 36 px y menú ⋯), sin paginación ("Mostrar más").
- Selector de orden (borde de 2 px) y "Todos" para la selección múltiple sobre las tarjetas.
- Egresos: detalle expandible con desglose compacto (cantidad × precio bajo cada producto).
- Lista de compra: check grande, cantidad con − / +, valor a ancho completo (ámbar si falta) y
  barra inferior fija con progreso, total y "Enviar a egreso".
- KPIs de a 2 por fila en Egresos/Ingresos y ocultos en el detalle de lista; filtros secundarios
  plegados tras "Filtros (n)" en todas las vistas con filtros.
- Escritorio sin cambios.

---

## 0.4.2 — Desplegada el 2026-10-11

Sin migraciones (Alembic `99e116fc4116`). Se recrean `frontend` y `backend`; los workers
reutilizan sus imágenes de 0.4.0 reetiquetadas como `0.4.2-<commit>`. La imagen del backend se
construye sobre la de 0.4.0 copiando solo `app/` (mismas dependencias, verificadas en la CPU del host).

### Tablas
- Orden numérico real en montos/cantidades (antes se comparaban como texto) y vacíos al final.
- Lista de compra: "Valor unitario" ordenable; "Total" y "Cantidad" ordenan por número.
- Egresos e Ingresos conservan página y posición al crear/editar/pagar o usar acciones masivas.

### Modales
- El fondo (overlay) cubre toda la pantalla: un margen heredado dejaba 20 px arriba sin cubrir
  y permitía hacer clic o seleccionar el contenido de atrás.
- Con un modal abierto el scroll de la app queda bloqueado (también con modales apilados); el
  modal hace scroll interno. Alto máximo 90% de la pantalla.
- Vistas previas de PDF/adjuntos al 70% del ancho (15% por lado) y 90% del alto desde tablet.

### Observación al enviar una lista a egreso
- PDF de evidencia: la sección Observación va sobre la tabla de productos; sin dato, "-----".
- Egresos: al expandir un egreso con desglose y observación, desglose en la col. 1 y
  observación en la col. 2.

### Desarrollo
- Entorno dev: proxy en el puerto 8080 y Mailpit en 9025.

---

## 0.4.1 — Desplegada el 2026-10-11

Hotfix solo de frontend, sin migraciones (Alembic sigue en `99e116fc4116`). Commit `266afa5`.
Solo se recreó el contenedor `frontend`; backend y workers reutilizan las imágenes de 0.4.0
reetiquetadas como `0.4.1-266afa5` (el backend sigue reportando `version=0.4.0`). Respaldo previo
(`pg_dump`, `.env.prd`, compose, IDs de imágenes) en el servidor. Frontend sirve `index-DaAPhdYS.js`.

### Listas de compra

- Editar el check, la cantidad o el valor ya no recarga toda la página: se conservan página, orden,
  filtros y posición. Cambio inmediato en pantalla y sincronización silenciosa de totales.
- Se descartan respuestas viejas cuando hay varias ediciones seguidas (la pantalla podía mostrar
  un producto como no comprado estando marcado en la base, y el envío a egreso lo rechazaba).
- El valor unitario solo se guarda si cambió.
- "Enviar a egreso" lista por nombre los productos comprados sin valor y deshabilita el envío.

### Despliegue

- `docker-compose.yml` (prd): backend, frontend y workers usan
  `${PROJECT_NAME}-release-<servicio>:${RELEASE_TAG}` en vez del `:latest` implícito.
  `RELEASE_TAG` es obligatorio en `.env.prd` (`0.4.1-266afa5`).

---

## 0.4.0 — Desplegada el 2026-10-02

Desplegada el 2026-10-02 en producción, commit `e3f7724`, revisión Alembic
`99e116fc4116`. Respaldo completo verificado en el servidor y en el host, ensayo aislado de
restauración/migraciones y validación de datos completados. Integraciones n8n excluidas;
los canales permanecen deshabilitados. Ver [registro de despliegue](docs/produccion-0.4.0.md).

### Antes de desplegar (checklist)

- **Respaldo**: `pg_dump` de la base y copia de MinIO. Esta versión trae **3 migraciones**
  (`315c19dda564`, `c7d8e9f0a1b2`, `99e116fc4116`) y una imagen anterior no arranca contra una base
  ya migrada (ver "Procedimiento de despliegue y rollback" en `TODO.md`).
- **`INTEGRATION_KEY`** en `.env.prd` (`openssl rand -hex 32`) y la misma clave en n8n como header
  `X-Integration-Key`. Sin ella, la vinculación y la ingesta por canal responden 503.
- Gotenberg operativo (lo usa el nuevo PDF de evidencia de listas de compra).

### Integraciones: Telegram / WhatsApp vía n8n

- Vinculación de canales: el usuario genera un código en **Integraciones**, lo envía por el canal y
  n8n confirma el vínculo (`POST /channels/link`). Luego la ingesta acepta `X-Channel` +
  `X-Channel-Id` en vez del token de ingesta.
- Seguridad: esas rutas exigen `X-Integration-Key` (comparación en tiempo constante contra
  `INTEGRATION_KEY`); sin la variable configurada quedan deshabilitadas.
- Panel admin con navegación agrupada por secciones y guías nuevas en Ayuda.

### Interfaz mobile (320–480 px)

- Topbar fija en mobile (el botón de menú ya no tapa títulos).
- Componentes compartidos: `Modal`, `KpiCard`, `KpiGrid`, `FormGrid`, `ScrollTable`,
  `DateRangeFilter`; `FilterBar` en columna en mobile.
- KPIs, formularios y totales en una columna en teléfono; tablas con scroll horizontal; modales
  con alto acotado (`dvh`); vista previa de PDF a pantalla completa. Aplica también al panel admin.
- Los modales solo se cierran con sus controles (no al tocar fuera).
- `DataTable`: menú "⋯" para acciones secundarias, orden por defecto y selección múltiple.

### Egresos

- **Rango de fechas** (Desde/Hasta + atajos Hoy, Esta semana, 7 y 15 días) que filtra la tabla y
  recalcula los KPIs; orden por fecha por defecto.
- **Disponible**: ingresos del período − ya pagado − pendiente en la vista − listas en curso.
- **Desglose manual de ítems** en el formulario; con desglose el monto es siempre la suma de los
  ítems (bloqueado en formulario y API).
- **Acciones masivas**: seleccionar egresos y Confirmar borradores, Pasar a pagado o Eliminar en
  bloque; cada acción indica a cuántos aplica y el resultado detalla los omitidos y su motivo.
- "Confirmar borrador" visible directamente en las filas en borrador.

### Listas de compra

- Renombrar la lista y **fecha de compra** (fecha en que se imputa la compra).
- **Borrador en Egresos**: cada lista activa con compras sin enviar aparece como fila de solo
  lectura "Lista compra [Borrador] - nombre" (no suma en KPIs; "Editar lista" lleva a la lista).
- **Cada envío crea un egreso nuevo** (p. ej. la feria semanal) con un **PDF de evidencia**
  adjunto: productos, cantidades, precios y fechas de creación, compra, egreso y envío.
- Tras enviar se elige obligatoriamente: dejar la lista como plantilla o eliminarla.
- Descripción editable al enviar (por defecto, el nombre de la lista); la nota pasa a llamarse
  "Observación".
- Los ítems y el monto de un egreso de lista quedan bloqueados aunque la lista se elimine;
  **"Devolver a lista de compra"** convierte el egreso en una lista para corregirlo y reenviarlo.
- Columna "Comprado" con el monto ya marcado en cada lista.

### Reglas y correcciones

- **Regla de período**: egresos, ingresos, recibos de ingesta, fecha de compra de listas y su
  envío solo aceptan fechas dentro del período abierto (validado en backend).
- La fecha de "hoy" se calcula en hora local / zona del usuario (antes UTC: de noche proponía el
  día siguiente).
- Al eliminar un egreso se borran también sus archivos en MinIO (antes quedaban huérfanos).
- Fechas sin hora mostradas sin desfase UTC en Listas de compra.

### Infraestructura y calidad

- Migraciones: `315c19dda564` (canales), `c7d8e9f0a1b2` (`shopping_lists.planned_date`),
  `99e116fc4116` (`expenses.items_from_list`, con backfill de los egresos que ya tenían ítems).
- Nueva variable `INTEGRATION_KEY` en los tres compose y en `.env.example`.
- ESLint 10 (flat config) instalado y `npm run lint` en verde.

---

## 0.3.0 — Desplegada el 2026-10-01

### Nueva funcionalidad: ingesta de recibos por bot (OCR)

- Flujo completo para integraciones externas (n8n, bots de WhatsApp/Telegram): se envía una foto
  del recibo vía `POST /ingestion/receipts` (autenticado con token de ingesta, gestionable por el
  propio usuario), el worker la procesa con Tesseract (`--psm 6` — validado contra boletas físicas
  reales; el modo automático de Tesseract pierde las líneas de montos en fotos arrugadas o en
  ángulo) y propone monto y categoría. El bot consulta `GET .../status` (polling) y confirma con
  `POST .../confirm` (`/aceptar` con body vacío, `/modificar` con overrides parciales de los
  campos a corregir) o descarta con `DELETE .../{id}` (`/cancelar`).
- La categoría propuesta **aprende por usuario**: al confirmar un recibo se guarda qué categoría
  se eligió para ese comercio (según la primera línea con contenido del texto OCR), y la próxima
  boleta del mismo comercio ya la sugiere sola (`merchant_category_memory`). Aplica tanto al flujo
  de bot como al formulario manual.
- El token de ingesta queda acotado estrictamente a borradores propios sin confirmar — una vez
  confirmado, ni `/status`, `/modificar` ni `/cancelar` pueden volver a tocarlo (404, no 409, para
  no filtrar siquiera que el registro existe). No puede leer ni modificar nada creado por otra vía.
- Nuevo `POST /expenses/ocr-preview`: el formulario "Nuevo egreso" ahora puede leer una foto
  adjunta on-demand (OCR sincrónico, no persiste nada). Si el formulario está vacío autocompleta
  monto/categoría directo; si ya hay datos cargados, pide confirmación antes de reemplazarlos
  (modal "Analizando…" + modal de reemplazo).
- Un borrador de ingesta sin confirmar deja de contar en los totales del período — Dashboard,
  resumen de Períodos, reporte Por categoría y cierre de período lo excluyen. En Egresos se
  muestra con badge "Borrador" y banner explicativo, con una acción de confirmación rápida (con
  modal de confirmación, no de un solo clic).

### Correcciones

- `app/models/__init__.py` no importaba `ShoppingList` / `ShoppingListItem` — cualquier proceso
  fuera del backend principal (como el worker de OCR) rompía al tocar `Category` por una foreign
  key sin resolver hacia `shopping_lists`.
- Un borrador de ingesta con monto ya propuesto por OCR se sumaba en los totales del período antes
  de que el usuario lo confirmara.

### Infraestructura

- `tesseract-ocr` instalado también en la imagen del backend principal (antes solo la tenía el
  worker de OCR separado) — necesario para el OCR sincrónico bajo demanda.
- `.gitignore`: se excluyen las carpetas `evidencias-*/` (capturas de QA) y los `*.tsbuildinfo`.

---

## 0.2.1

### Mejoras sobre Listas de Compra

- El campo Cantidad se normaliza como unidades enteras positivas (paquetes/unidades), manteniendo
  controles nativos de `input type="number"` con `step=1`; Valor unitario mantiene formato de
  moneda según configuración del usuario.
- El formulario de producto agrega `Observación` por línea (por ejemplo marca o tamaño distinto);
  se persiste en `shopping_list_items.observation`, pero no se muestra como columna en la tabla.
- El detalle de lista incorpora el botón "Enviar a egreso" junto a Volver/Reiniciar lista,
  reutilizando el mismo modal del listado.
- El modal "Enviar a egreso" queda alineado con Egresos: campo visible `Descripción`,
  responsable por defecto = usuario conectado, y selector de Responsable con autocomplete/DDL
  compartido con el modal de egresos.
- El envío a egreso deja el pago como `saldado` y, si la lista ya generó un egreso en el período
  abierto, actualiza ese egreso agregando solo productos nuevos en vez de crear uno duplicado.
- La detección de pendientes de envío es por período abierto: una lista enviada en un período
  cerrado puede volver a enviarse en el nuevo período, mientras que dentro del mismo período no
  recobra productos ya incluidos.
- La tabla de Listas de Compra reemplaza "Última actualización" por "Último envío" y agrega un
  estado operativo (`Sin compras`, `En proceso`, `Procesada`) separado del estado de archivo.

---

## 0.2.0

### Nueva funcionalidad

- **Listas de Compra**: nueva sección para armar listas reutilizables (supermercado, feria,
  cumpleaños, etc.), ir marcando productos comprados con su monto, y enviarlas como un egreso
  del período abierto — la lista no se cierra ni se elimina al enviarla, queda disponible para
  la próxima compra. Incluye reiniciar lista y clonar lista.
  - Backend: tablas `shopping_lists` / `shopping_list_items`, columnas `expenses.items` (snapshot
    de ítems) y `expenses.shopping_list_id` (trazabilidad), router `shopping_lists.py` con
    `send-to-expense`, `reset` y `clone`.
  - Frontend: páginas `ShoppingListsPage` / `ShoppingListDetailPage`, entrada nueva en el menú
    lateral, e integración con Egresos (ícono hacia la lista de origen y fila expandible con el
    detalle de productos comprados).
  - `DataTable` ahora soporta filas expandibles (`isExpandable` / `renderExpanded`), reutilizado
    también para desglose de ítems en Egresos.
  - Protección contra doble envío: cada ítem lleva `sent_at`, así reenviar la misma lista sin
    reiniciarla no vuelve a cobrar los mismos productos (400 si no hay nada nuevo por enviar).
  - Los montos de productos en la lista de compra ahora respetan la configuración de moneda del
    usuario (helper compartido `frontend/src/lib/money.ts`, también usado ahora por Egresos e
    Ingresos, que antes lo duplicaban cada uno por su lado).
  - Desde Egresos, un ícono en la columna de Acciones (deshabilitado, no oculto, cuando no aplica)
    abre una vista de solo lectura de la lista de compra de origen — filtrada a los productos
    comprados con su total, disponible también dentro del modal de editar egreso.
  - UI de Listas de Compra alineada al patrón de Egresos: título → barra de KPI → filtro/acciones
    en ambas páginas (listado y detalle). "Clonar" y "Enviar a egreso" viven como acciones de fila
    en el listado; dentro del detalle de una lista solo están Volver / Reiniciar lista, y "Agregar
    producto" vive en la misma fila que el filtro (con su propio modal, igual que "Nueva lista").
    Badge que indica si la lista ya se envió a un egreso alguna vez.
  - El modal "Agregar/Editar producto" pide Cantidad × Precio unitario y calcula el total en
    vivo, y suma un check "Obviable" (mismo concepto que en Egresos: producto no obligatorio de
    comprar) — nueva columna `shopping_list_items.obviable`, se preserva al clonar una lista.
  - Refactor: `shopping_list_items` ahora persiste `quantity` y `unit_price` como campos reales
    (antes solo se guardaba un monto total colapsado, sin poder recuperar cantidad/precio al
    editar). La tabla de productos muestra columnas propias Cantidad / Valor unitario / Total
    (calculado), ambas editables directamente en la tabla; el botón "Editar" en Acciones abre un
    modal que recupera todos los valores actuales del producto (mismo formulario que "Agregar
    producto"). El monto del egreso generado por `send-to-expense` ahora es `cantidad × precio`.

### Otros cambios

- Se fusiona la propuesta pendiente "Egresos Compuestos" del `TODO.md` con esta feature, ya que
  comparten esquema (`expenses.items`) y UI (fila expandible). Se corrige además una propuesta
  anterior que duplicaba innecesariamente la columna `source` (ya existe como enum).

---

## 0.1.0 — Base del sistema

Todo el trabajo previo a llevar un registro de versiones formal queda agrupado aquí.

### Núcleo de la aplicación

- Registro de ingresos y egresos, categorías y tipos de ingreso personalizables (con catálogo
  de sistema + overrides por usuario), gestión de períodos mensuales (abrir/cerrar/reabrir) con
  generación de reporte PDF (Gotenberg) y almacenamiento en MinIO, reportes de comparación/
  tendencia/por categoría, panel de administración de usuarios.
- Recordatorios diarios por correo configurables (hora por usuario) para egresos/ingresos
  pendientes del día siguiente.
- Último acceso y conteo de períodos visibles en el módulo de usuarios del panel admin.

### Seguridad

- Rate limiting distribuido con Redis entre los workers de uvicorn (antes era en memoria por
  proceso, lo que multiplicaba el límite real según el worker que respondiera).
- Refresh tokens movidos a cookies httpOnly (antes viajaban accesibles desde JS).
- Invalidación de sesiones activas al cambiar la contraseña (`token_version`).
- Eliminación del bootstrap fantasma de admin con contraseña fija — ahora el primer admin se
  crea vía bootstrap público con cambio de contraseña forzado.
- Sanitización de SVG en reportes PDF y tipado de la dependencia de ingesta (tokens OCR).
- Hardening de Nginx: restricción de `/admin` por red y cabeceras de seguridad adicionales;
  luego corregido para permitir redes internas de Docker sin abrir el acceso públicamente.

### Infraestructura

- Persistencia de Postgres/MinIO migrada a volúmenes nombrados de Docker.
- `.env.dev.example` / `.env.qa.example` / `.env.prd.example` consolidados en un único
  `.env.example`.
- Resolución DNS dinámica en Nginx (`resolver` + `proxy_pass` con variable) para que un reinicio
  del backend o frontend no deje al proxy apuntando a una IP vieja (502 hasta recargar a mano).

### UI / UX

- Rediseño de las plantillas de correo con un sistema visual propio.
- Logo visible en ambos paneles (usuario y admin), modal "Acerca de", botón flotante de volver
  arriba, reordenamiento del menú lateral.
- Panel de "Mi perfil" unificado (información personal, seguridad, notificaciones en una sola
  vista con secciones).
- Botón de mostrar/ocultar contraseña y barra de fortaleza compartida en todos los formularios
  que la involucran (login, recuperación, cambio forzado, administración de usuarios).
- Módulo de Ayuda: guías paso a paso en orden lógico (crear período → interfaz → ingresos →
  egresos → catálogos → cerrar → reabrir período) y preguntas frecuentes con explicación
  ampliada (qué es / para qué sirve / cómo se activa) e imágenes donde aporta.

### Correcciones

- Crash (`MultipleResultsFound`) al abrir un tercer período o reabrir con 2+ períodos cerrados,
  por consultas sin `.limit(1)`.
