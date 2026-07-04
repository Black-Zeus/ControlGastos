# Historial de versiones — ControlGastos

Registro de cambios por versión. La versión vive en `frontend/package.json` y en
`version=` de la app FastAPI (`backend/app/main.py`).

---

## 0.2.1 — En curso

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
