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

## [EN PROGRESO] Listas de compra — UX mobile (detalle de lista)

Mejora visual y de usabilidad de `ShoppingListDetailPage.tsx` en teléfono (320–480 px), pensada
para usarla **en el supermercado con una mano**. Sin cambios de backend. Mantener escritorio igual
(todo bajo `sm:`). Base: 0.4.1 (refrescos silenciosos y actualización optimista ya resueltos).

### Hecho en 0.4.3

- Tarjetas en mobile vía `DataTable.renderCard` (índice y detalle): check de 24 px (también al
  tocar el nombre), cantidad con − / +, valor a ancho completo con borde ámbar si falta, total.
- Barra inferior fija con "X de Y comprados", total y "Enviar a egreso"; KPIs ocultos en mobile.
- Lista continua ("Mostrar más" de a 30), selector de orden, filtros plegados tras "Filtros (n)".

### Queda pendiente

- Filtro Pendientes/Comprados como control segmentado y buscador fijo arriba.
- Alta rápida en línea al final de la lista; animación al marcar y "Deshacer" al eliminar.

### Problema actual

- La tabla tiene 8 columnas (Comprado, Producto, Cantidad, Valor unitario, Total, Obviable,
  Estado, acciones): en mobile obliga a scroll horizontal y el check y el valor quedan lejos del
  nombre del producto.
- Inputs de cantidad/valor pequeños (`w-20`/`w-28`) y checkbox de 16 px: difíciles de tocar.
- Botones de cabecera (editar, reiniciar, enviar) y KPIs ocupan la primera pantalla; la lista
  empieza abajo.
- Paginación de 10 filas: en una lista larga hay que paginar mientras se compra.

### Propuesta

1. **Vista de tarjetas en mobile** (`sm:hidden` tarjetas / `hidden sm:block` tabla): por producto,
   fila 1 = check grande + nombre (+ observación en gris); fila 2 = cantidad con stepper `− n +`,
   valor unitario y total. Obviable/Estado como chips pequeños; acciones en menú `⋯`.
2. **Áreas táctiles ≥ 44 px**: toda la tarjeta (salvo inputs) alterna "comprado"; checkbox
   grande; input de valor con `inputMode` numérico, ancho completo y selección del texto al enfocar.
3. **Barra inferior fija** (sticky bottom, respetando `env(safe-area-inset-bottom)`):
   "X de Y comprados · Total" + botón "Enviar a egreso". Libera la cabecera.
4. **Cabecera compacta**: KPIs colapsados en una línea en mobile; editar/reiniciar en menú `⋯`.
5. **Búsqueda y filtro siempre a mano**: buscador sticky arriba con botón limpiar; filtro
   Pendientes/Comprados/Todos como segmented control. Valorar "Pendientes" por defecto y mover los
   comprados al final (o sección colapsable "Comprados (n)").
6. **Sin paginación en mobile** (lista continua) o tamaño de página grande; conservar posición.
7. **Feedback**: marcar visualmente "sin valor" en comprados sin precio (borde ámbar) para no
   descubrirlo recién al enviar; animación breve al marcar; deshacer (toast) al eliminar.
8. **Agregar producto rápido**: input en línea al final de la lista ("Agregar…" + Enter) además
   del modal completo.

### Criterios de aceptación

- Sin scroll horizontal a 320 px; marcar, cambiar cantidad y valor sin abrir modales.
- Filtro, búsqueda y posición se mantienen al editar (no regresar lo resuelto en 0.4.1).
- Escritorio sin cambios visuales. `npm run lint` y `npm run build` en verde.
- Revisar en modo claro/oscuro y con teclado virtual abierto (la barra inferior no debe tapar el input).

---

## [EN PROGRESO] Egresos e Ingresos — UX mobile

Misma línea que la lista de compra, para `ExpensesPage.tsx` (~1.970 líneas) e `IncomesPage.tsx`.
Uso típico en teléfono: **registrar rápido** un gasto/ingreso y **marcarlo pagado/recibido**. Sin
cambios de backend; escritorio igual (todo bajo `sm:`). Conviene hacer primero Ingresos (más simple)
y reutilizar el componente de tarjeta en Egresos.

### Hecho en 0.4.3

- Tarjetas en mobile (descripción + monto; fecha · categoría · responsable; chips de pago,
  borrador, tipo, obviable, adjunto). Acciones de 36 px y menú ⋯; detalle expandible con desglose
  compacto (cant. × precio bajo el producto).
- Selección múltiple con "Todos" y casilla por tarjeta; selector de orden; "Mostrar más".
- KPIs de a 2 por fila en mobile; filtros secundarios plegados tras "Filtros (n)".
- Página/posición conservadas al editar (0.4.2).

### Queda pendiente

- Acción primaria con texto según estado y swipe; menú ⋯ como bottom sheet.
- Botón flotante "+" (FAB) con alta rápida; agrupación por día con subtotal.
- Toast "Deshacer" al eliminar; barra inferior para acciones masivas.

### Problema actual

- **Egresos**: 8 columnas (Fecha, Descripción, Responsable, Categoría, Tipo, Obviable, Monto, Pago)
  más hasta ~8 acciones por fila (confirmar, editar, pagar, obviable, ver adjunto, lista, devolver,
  eliminar) y columna de selección múltiple → scroll horizontal y botones pequeños. Encima: 4 KPIs,
  `DateRangeFilter` y `FilterBar` con 6 controles antes de ver el primer registro.
- **Ingresos**: 6 columnas + 2 acciones; 3 KPIs y filtros también empujan la tabla hacia abajo.
- **Mismo problema que tenía la lista de compra (resuelto en 0.4.1 solo allí)**: tras crear,
  editar o una acción masiva se llama `load()` con `setLoading(true)`, y `DataTable` vuelve a la
  página 1 con cada nuevo `data` → se pierde la página/posición. Aplicar el mismo patrón:
  refresco silencioso + `pageResetKey={JSON.stringify(filtros)}` (+ rango de fechas en Egresos).

### Propuesta

1. **Tarjetas en mobile** (`sm:hidden` / `hidden sm:block`): fila 1 = descripción + monto (alineado
   a la derecha, destacado); fila 2 = fecha · categoría/tipo · responsable en gris; chips para
   Pago/Estado, Borrador, Obviable, Recurrente y origen (lista de compra / desglose manual).
2. **Acciones**: una acción primaria visible según estado (Egresos: "Confirmar" si es borrador,
   "Pagar" si está pendiente; Ingresos: "Recibido") y el resto en menú `⋯` (bottom sheet en mobile).
   Valorar swipe (izquierda = pagar/recibido, derecha = eliminar con confirmación).
3. **Desglose (`items`) en Egresos**: en tarjeta, expandible con "Ver n ítems" en vez de la fila
   expandida de la tabla.
4. **Selección múltiple en mobile**: entrar por pulsación larga o botón "Seleccionar"; barra
   inferior con las acciones masivas (confirmar, pasar a pagado, eliminar) y el conteo.
5. **KPIs compactos**: en mobile una franja horizontal deslizable (o resumen de una línea
   "Total · Pendiente") en vez de 3–4 tarjetas apiladas.
6. **Filtros en panel**: botón "Filtros (n)" que abre un bottom sheet con `FilterBar` y el rango de
   fechas; búsqueda siempre visible arriba; chips de filtros activos con "×" para quitarlos.
7. **Alta rápida**: botón flotante "+" (FAB) que abre el formulario a pantalla completa, con monto
   primero (`inputMode` numérico), categoría/tipo recordando el último usado y fecha = hoy.
8. **Listas largas**: sin paginación en mobile (scroll continuo o "Cargar más"), agrupado por
   fecha con encabezados de día y subtotal diario.
9. **Feedback**: actualización optimista al pagar/confirmar, toast con "Deshacer" al eliminar, y
   aviso claro cuando el período está cerrado (acciones deshabilitadas con motivo).

### Criterios de aceptación

- Sin scroll horizontal a 320 px; registrar y marcar pagado/recibido sin hacer zoom.
- Filtros, rango, página y posición se mantienen tras crear/editar/acciones masivas.
- Respetar reglas de período (sin crear/editar si el período no está abierto).
- Escritorio sin cambios visuales. `npm run lint` y `npm run build` en verde; claro/oscuro.

---

## [PENDIENTE] Mejoras rápidas sugeridas (revisión 2026-10-02)

- **Cierre de período — explicar el tratamiento de registros en borrador**: revisar qué
  comportamiento está soportado cuando se intenta cerrar un período con borradores y
  explicarlo en la ayuda y en el flujo de cierre, sin asumir que deben confirmarse automáticamente.
  - Aclarar si el cierre se permite, se bloquea o exige confirmar/descartar los borradores,
    y qué ocurre con ellos después del cierre: consulta, edición, confirmación y descarte.
  - Explicar cómo afectan a los totales, al reporte de cierre y a los demás reportes; indicar
    la cantidad de borradores y sus importes conocidos antes de confirmar el cierre.
  - Contrastar interfaz y API y validar períodos con y sin borradores, incluidos borradores
    sin monto. Si el comportamiento actual es ambiguo o deja registros sin una vía de resolución,
    definir y documentar la regla antes de implementarla, coordinándola con la regularización
    de borradores históricos en períodos cerrados.
- **Listas de compra — coherencia entre cantidad e importe del KPI de productos**:
  el usuario indica que el KPI cuenta los ítems no seleccionados, pero no incluye su
  importe. Revisar el cálculo para que cantidad y monto correspondan al mismo conjunto
  de productos; si cuenta todos, sumar también los no seleccionados con precio informado.
  - Diferenciar claramente el total de la lista del importe comprado/seleccionado cuando
    se muestren ambos; calcular cada producto como cantidad × precio unitario.
  - Validar listas sin selección, con selección parcial y completa, cambios de cantidades
    y precios, e ítems sin precio, evitando presentar importes incompletos como totales definitivos.
- **Listas de compra — explicar la columna "Último movimiento"**: incorporar una ayuda
  accesible junto al encabezado y en la guía de Listas de compra que explique qué representa
  la fecha y qué acciones la actualizan, según el comportamiento real de la aplicación.
  - Aclarar su diferencia respecto a la fecha de compra, creación de la lista y último envío
    a egreso, e incluir un ejemplo. Comprobar que el nombre de la columna sea coherente con
    el dato mostrado y explicar qué aparece cuando no hay movimientos.
  - Permitir consultar la ayuda también en móvil y mediante teclado, sin depender solo de hover.
- **Períodos cerrados — acciones de registros en solo lectura**: deshabilitar el menú
  desplegable de la columna Acciones y todos los iconos de modificación cuando el período
  esté cerrado; impedir también acciones masivas que modifiquen sus registros.
  - Mantener como únicos iconos activos de consulta **"Ver adjunto"**, cuando exista,
    y **"Ver registro"**. Este último debe abrir la misma vista de edición, pero en modo
    solo lectura, sin permitir cambios ni mostrar una acción de guardar.
  - Distinguir visualmente las acciones deshabilitadas y comprobar que no puedan ejecutarse
    mediante ratón o teclado; conservar la validación de período cerrado en la API.
  - Validar registros con y sin adjunto, egresos con desglose y el cambio entre períodos
    abiertos y cerrados, en escritorio y móvil.
- **Egresos — controles de período sin desplazamientos**: al cambiar de período, colocar
  el botón "Ir al activo" a la **izquierda** del selector, en un espacio estable, para que
  su aparición no desplace el selector ni los demás controles.
  - En lugar de ocultar el control que no corresponda en un período cerrado, conservar su
    espacio y mostrar "Período cerrado" en gris, deshabilitado, sin efecto hover ni acción.
  - Validar la distribución al alternar entre período activo y períodos cerrados, tanto
    en escritorio como en móvil, evitando saltos de posición y manteniendo legible el estado.
- **Reportes — comparación de ingresos entre períodos**: el usuario indica que el reporte
  de comparación actualmente solo compara egresos. Incorporar también la comparación de
  ingresos de los períodos seleccionados, tanto en la vista como en el PDF exportado.
  - Mostrar importes por período y sus diferencias, con una identificación clara de ingresos
    y egresos y un criterio de contabilización explícito para ingresos recibidos y pendientes,
    coherente con la mejora prevista de los KPI.
  - Validar períodos abiertos y cerrados, períodos sin ingresos y variaciones respecto a un
    importe cero, evitando divisiones por cero y porcentajes engañosos.
- **Períodos cerrados — regularizar registros históricos mostrados como borradores**:
  al cambiar de período y consultar uno cerrado, el usuario observa que todos o la mayoría
  de sus registros aparecen como borradores tras la migración. El usuario indica que este
  estado también afecta a los reportes de períodos cerrados, por lo que la incidencia no
  se limita a la visualización del listado. Investigar si el origen está
  en los datos migrados, la respuesta de la API o la interpretación del estado en la interfaz.
  - Identificar los registros históricos que deberían estar confirmados y corregir su estado
    o visualización, diferenciándolos de borradores reales; no confirmar indiscriminadamente
    todos los registros de un período cerrado.
  - Respaldar antes de cualquier regularización de datos y comprobar su efecto sobre los
    totales, KPI y reportes, contrastándolos con los respaldos y cierres históricos disponibles.
    Preservar el período cerrado y los estados de pago originales.
  - Revisar qué registros excluyen los reportes por estar en borrador y comprobar tanto la
    vista como los PDF exportados y los reportes de cierre almacenados. Si estos últimos
    quedaron afectados, definir su regeneración tras corregir los estados y validar que
    los importes coincidan con los registros históricos que correspondía contabilizar.
  - Validar el cambio entre períodos abiertos y cerrados y la recarga de la vista; documentar
    los registros afectados y aplicar una corrección reproducible e idempotente si corresponde.
- **Atajos de fechas — respetar el período de contexto**: limitar todos los rangos
  generados por atajos (Hoy, Esta semana, 7 días, 15 días, etc.) al período seleccionado
  en la vista; ninguna fecha inicial o final debe quedar fuera de sus límites.
  - Ejemplo: en el contexto de octubre, si "Esta semana" comienza el 28/09, el rango debe
    empezar el **01/10**, conservando la fecha final solo si pertenece a octubre.
  - Recortar los rangos que crucen el inicio o fin del período. Si el atajo no tiene
    intersección con el período seleccionado, deshabilitarlo o indicar que no aplica,
    sin cambiar de período ni proponer un rango ajeno al contexto.
  - Aplicar la misma regla en todos los filtros de fechas y calcular "hoy" con la zona
    horaria del usuario. Validar cambios de mes y año, semanas que crucen períodos y
    contextos históricos o futuros.
- **Admin — conexiones, exportación de respaldos y restauración**: incorporar un módulo
  para gestionar las conexiones de ControlGastos a las VM existentes de PostgreSQL, Redis
  y Garage, y administrar los respaldos de la aplicación desde el panel.
  - Mostrar el destino, entorno y estado de cada conexión, permitir probarla y gestionar
    su configuración con validación previa y recuperación si el cambio falla. Proteger
    las credenciales y no mostrarlas en texto claro ni incluirlas en logs.
  - Permitir generar y descargar un respaldo del proyecto: base de datos, objetos S3
    referenciados (adjuntos, avatares y reportes), configuración necesaria y un manifiesto
    con versión de aplicación, revisión Alembic, fecha, entorno e integridad de los archivos.
    Definir si es necesario incluir estado de Redis según su uso.
  - Listar los respaldos disponibles, su estado y resultado; coordinar las escrituras para
    obtener una copia coherente entre PostgreSQL y Garage y mostrar el progreso de las tareas.
  - Evaluar la restauración desde Admin: validar integridad, compatibilidad y destino antes
    de aplicarla, mostrar qué datos se sustituirán, exigir confirmación explícita y generar
    un respaldo previo. Diseñar la recuperación aunque la base principal no esté disponible
    y comprobar el resultado antes de reabrir escrituras.
  - Limitar todas las operaciones a administradores, registrar auditoría y restringirlas
    a los datos de ControlGastos; no respaldar ni sobrescribir datos de otras aplicaciones
    alojadas en esas VM. Definir cómo recuperar las credenciales necesarias sin exponerlas
    en una descarga sin protección.
- **Infraestructura — utilizar las VM dedicadas existentes**: migrar PostgreSQL, Redis
  y almacenamiento S3 a las VM que ya dan soporte a **base de datos, Redis y Garage**.
  No crear nuevas VM ni mantener servicios equivalentes dentro del stack de ControlGastos
  cuando ya existe infraestructura dedicada que los proporciona.
  - Identificar los destinos existentes y sus conexiones, permisos y procedimientos de
    respaldo; mantener el aislamiento de datos y accesos por aplicación y entorno.
  - Mantener PostgreSQL, Redis y almacenamiento S3 locales declarados como **opcionales
    en Compose**, activables mediante perfiles explícitos. Documentar al iniciar el proyecto
    la elección entre servicios locales y conexiones a las VM existentes; no arrancar los
    locales cuando se utilicen servicios externos.
  - Adaptar las dependencias de arranque y validar la configuración de cada modalidad,
    para que backend y workers puedan iniciarse con servicios externos sin exigir
    contenedores locales desactivados. Permitir elegir la modalidad por servicio y entorno.
  - Tras respaldar, migrar y verificar cada dependencia, retirar del Compose los servicios
    locales correspondientes (`db`, `redis` y `storage`) del arranque predeterminado,
    conservándolos como opciones mediante perfiles y ajustando sus dependencias de arranque.
    Conservar los datos y respaldos anteriores durante el período de recuperación acordado.
- **Base de datos — migrar PostgreSQL a la VM de BD existente**: trasladar la base de
  ControlGastos al servicio PostgreSQL de esa VM, con base y rol propios para la aplicación
  y separación entre PRD y DEV.
  - Verificar versiones y compatibilidad, respaldar y ensayar la restauración; preservar
    esquema, datos, permisos y revisión Alembic, comprobando conteos e importes.
  - Actualizar `DATABASE_URL` en backend, OCR y recordatorios; validar migraciones,
    conectividad y funcionamiento antes de retirar PostgreSQL del stack. Coordinar las
    escrituras durante el cambio y preparar la recuperación.
- **Redis — migrar a la VM de Redis existente**: sustituir el Redis propio del stack PRD
  por el servicio de producción de esa VM dedicada; no provisionar otra instancia.
  - Configurar `REDIS_URL` y los permisos de acceso; aislar las claves de ControlGastos
    mediante un prefijo de aplicación/entorno y, cuando corresponda, una ACL específica.
  - Validar conectividad, autenticación, expiración de claves y rate limiting compartido
    entre los workers del backend; definir qué estado debe conservarse durante el cambio.
  - Adaptar el Compose de PRD y retirar su contenedor Redis solo tras verificar el servicio
    compartido. Mantener un procedimiento de recuperación y evitar que pruebas de DEV
    afecten a producción o a otras aplicaciones que utilicen la instancia.
- **Almacenamiento — migrar de MinIO a la VM de Garage existente**: crear en ese Garage el conjunto de buckets
  de ControlGastos para **producción y desarrollo**, separados por entorno, con credenciales
  y permisos independientes para evitar accesos cruzados.
  - Inventariar y respaldar los objetos actuales de MinIO; copiar evidencias, avatares y
    reportes conservando sus claves, tipos de contenido y referencias en la base de datos.
  - Adaptar el cliente S3, la configuración y los Compose de ambos entornos; validar
    compatibilidad con Garage para subir, consultar, descargar y eliminar archivos.
  - Comprobar integridad y completitud de la copia y probar adjuntos, avatares, PDF y OCR.
    Coordinar el cambio para no perder escrituras y conservar MinIO y sus respaldos hasta
    validar la migración, con un procedimiento de recuperación.
- **Adjuntos — simplificar la visualización del único adjunto por registro**: al pulsar
  "Ver adjunto", abrir directamente la vista previa, respetando la regla de un solo adjunto
  por registro. Eliminar el botón "Volver" que lleva al listado de posibles adjuntos y el
  modal intermedio de selección, ya que no son necesarios.
  - Mantener un control claro para cerrar la vista previa y regresar a la pantalla de origen.
    Validar imágenes y PDF, en escritorio y móvil, y el caso de un registro sin adjunto.
- **OCR — preparar el registro completo desde un adjunto**: analizar el comprobante e
  intentar completar todos los datos que puedan extraerse o inferirse con suficiente
  confianza, no solo el monto: fecha, comercio/descripción, categoría, observación y,
  cuando el documento lo permita, productos, cantidades y precios para el desglose.
  - Mostrar una propuesta editable antes de guardar, señalando los datos dudosos o faltantes
    y distinguiendo los extraídos del documento de los sugeridos por el sistema.
  - No inventar información ni dar por recibido/pagado un movimiento sin evidencia suficiente;
    mantener los campos no determinables pendientes de revisión.
  - Conservar el adjunto como evidencia y respetar las reglas del período abierto. Comprobar
    que el total y el desglose cuadren y tratar lecturas parciales, imágenes deficientes y duplicados.
- **Listas de compra — dividir una lista en varias**: permitir que el usuario indique
  cuántas listas quiere generar a partir de una existente y cómo repartir sus productos.
  - Mostrar una vista previa del reparto y permitir nombrar las listas resultantes antes
    de confirmar; definir si el reparto inicial será manual o automático.
  - Conservar cantidades, precios, observaciones y estados de los productos, sin perderlos
    ni duplicarlos involuntariamente. Preservar la trazabilidad de productos ya enviados a egresos.
  - Definir qué ocurre con la lista original tras dividirla (conservar, archivar o sustituir)
    y validar la cantidad solicitada, el tratamiento de listas vacías y la suma total resultante.
- **Egresos — cantidad y suma de los seleccionados**: mostrar un resumen tipo Excel con
  la cantidad de egresos seleccionados y la suma de sus importes, actualizado al marcar o
  desmarcar filas y al seleccionar todos los resultados filtrados, incluso entre páginas.
  - Respetar la moneda y el formato numérico del usuario; sumar una sola vez el monto total
    de cada egreso, sin volver a sumar sus ítems de desglose.
  - Mostrar el resumen junto a las acciones masivas, también en móvil, y ocultarlo o dejarlo
    en cero cuando no haya selección. Validar selecciones individuales, múltiples y entre páginas.
- **Contraste de iconos en modo claro y oscuro**: revisar todos los iconos de la aplicación
  para que sean visibles sobre sus fondos en ambos temas, incluidos controles nativos.
  - Corregir especialmente el icono del calendario de los selectores de fecha: en modo
    oscuro actualmente no se distingue.
  - Comprobar formularios y filtros en las vistas de usuario y administración, tanto en
    escritorio como en móvil, y los estados normal, hover, foco y deshabilitado.
- **Perfil — filas por página en tablas de datos**: permitir que cada usuario configure
  cuántas filas mostrar por página, con **30 por defecto** cuando no tenga una preferencia
  guardada. Aplicar la configuración a las tablas paginadas de su cuenta.
  - Persistir la preferencia por usuario y conservarla al cerrar sesión, recargar o acceder
    desde otro dispositivo; modificarla no debe afectar a otras cuentas.
  - Validar que el tamaño sea un entero positivo dentro de los límites admitidos y reajustar
    la página actual cuando el cambio deje la paginación fuera de rango.
- **Excluir ingresos pendientes de los KPI de Dashboard y Egresos**: contabilizar únicamente
  ingresos con `payment_status=recibido` en el total de ingresos y en los cálculos derivados
  (dinero libre, saldo y disponible). Los ingresos `pendiente` deben seguir visibles en su
  listado, sin aumentar el dinero disponible, para no confundir la lectura.
  - Al pasar de pendiente a recibido, incluir su importe; al volver a pendiente, excluirlo.
  - Validar un período con ingresos recibidos y pendientes, otro con solo pendientes y los
    cambios de estado, manteniendo las mismas reglas de período y filtros de cada vista.
- **Rango de fechas en Ingresos**: reutilizar `ui/DateRangeFilter` (mismos atajos) y que los KPIs
  se recalculen con el rango, como en Egresos.
- **Egresos recuerda mes y rango en la URL** (p. ej. `/egresos?mes=2026-10&desde=…&hasta=…`):
  hoy se pierden al volver desde una lista de compra o al recargar.
- **Reemplazar `alert()` nativos por avisos de la app** (9 archivos): en mobile se ven mal.
- Revisar `date.today()` en `routers/periods.py` (usa la fecha del servidor, en UTC); el resto de
  "hoy" ya usa hora local / zona del usuario.

---

## [PENDIENTE] Egresos — mejoras de UX

### ~~Columna de acciones sobrecargada~~ — resuelto en `fix/ui-mobile`

`DataTable` acepta `RowAction.primary`: si alguna acción lo marca, solo las primarias quedan como
botón y el resto va a un menú "⋯" (Radix `DropdownMenu`). En Egresos quedan visibles **Editar** y
**Pasar a saldado**, y **Confirmar borrador** solo en filas en borrador.

### ~~Rango de fechas y disponible por compromisos~~ — hecho

`DateRangeFilter` (Desde/Hasta + atajos Hoy, Esta semana, 7 y 15 días hacia adelante) filtra la
tabla y los KPIs. La tarjeta **Disponible** calcula ingresos del período − ya pagado en el período −
pendiente en la vista (rango + filtros). La tabla ordena por fecha ascendente por defecto.
Posible extensión: el mismo selector en Ingresos.

### ~~Selección múltiple y acciones masivas~~ — hecho

`DataTable` admite selección (`selectable`/`selectedKeys`/`onSelectionChange`; "seleccionar todo"
abarca lo filtrado en todas las páginas). En Egresos, al seleccionar aparece una barra con
**Confirmar borradores**, **Pasar a pagado** y **Eliminar**, cada una con la cantidad de
seleccionados a los que aplica (un borrador no pasa a pagado; sin monto no se confirma).
`POST /expenses/bulk` valida cada egreso con las reglas individuales y devuelve los omitidos con
su motivo. Al eliminar egresos (individual o masivo) también se borran sus archivos en MinIO.

### ~~Regla de período para todos los registros~~ — hecho

Egresos, ingresos, recibos de ingesta, fecha de compra de listas y su envío solo aceptan fechas
dentro del período abierto (`services/period_rules.py`, validado en backend; calendarios acotados).

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
   - La fecha de compra y la del envío deben estar dentro del período abierto (regla general).

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

## [POSTERIOR] App Mobile — React Native / Expo Lite

> Hoja de ruta: fuera del alcance de las sesiones actuales; no se trabaja hasta nuevo aviso.

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
