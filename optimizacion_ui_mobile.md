# Optimización UI Responsive para dispositivos móviles

Necesito realizar una revisión y optimización de la interfaz para dispositivos móviles, principalmente teléfonos con anchos aproximados entre **320 px y 480 px**.

Las capturas adjuntas muestran los principales problemas actuales. La aplicación funciona correctamente a nivel funcional, por lo que el objetivo de esta tarea es **mejorar exclusivamente la presentación, distribución responsive, legibilidad y usabilidad en pantallas pequeñas**, evitando modificar lógica de negocio, API, modelos de datos o comportamiento funcional existente.

## 1. Header y botón de menú

Actualmente el botón hamburguesa queda superpuesto sobre los títulos de las distintas vistas.

Ejemplos visibles:

- Dashboard.
- Ingresos.
- Egresos.
- Listas de compra.
- Períodos.
- Catálogos.

Se debe corregir la estructura del header para dispositivos móviles.

Requisitos:

- El botón de menú no debe superponerse al título.
- Debe existir separación horizontal clara entre:
  - botón hamburguesa;
  - título;
  - acciones adicionales del header, si existen.
- El título no debe comenzar debajo del botón.
- Evitar soluciones basadas solamente en `z-index`.
- Preferir una distribución mediante `flex`, `grid`, padding o una estructura específica para mobile.
- Mantener el comportamiento actual en escritorio.

Una posible estructura conceptual sería:

```text
[ ☰ ]  Título de la vista
       Subtítulo opcional
```

El botón puede permanecer flotante si la arquitectura actual lo requiere, pero debe reservarse espacio suficiente en el contenido para que nunca tape textos.

## 2. KPI / Cards del Dashboard

En teléfonos, las cards KPI actualmente están distribuidas en dos columnas, provocando:

- números truncados;
- textos cortados;
- poco espacio interno;
- dificultad para interpretar los valores.

En vista móvil deben utilizar:

```text
1 columna
```

Es decir:

```text
[ Total ingresos          ]
[ Egresos saldados        ]
[ Egresos pendientes      ]
[ Egresos reservados      ]
[ Dinero libre            ]
[ Libre solo pagado       ]
```

Cada card debe utilizar prácticamente todo el ancho disponible del contenedor.

La distribución de dos o más columnas puede mantenerse en tablet/desktop según los breakpoints existentes.

Además:

- evitar valores monetarios truncados con `...`;
- permitir que el valor monetario tenga espacio suficiente;
- mantener icono, título, valor y cantidad de registros correctamente alineados.

## 3. Tablas del Dashboard

Las siguientes tablas presentan problemas importantes en mobile:

- **Por responsable**
- **Detalle por categoría**
- **Flujo por día**
- otras tablas que presenten el mismo comportamiento.

Actualmente las columnas se comprimen y los valores terminan superpuestos.

No se debe intentar reducir indefinidamente el ancho de las columnas para hacerlas caber.

Aplicar una estrategia responsive apropiada.

### Opción A — Scroll horizontal

Mantener la tabla semánticamente completa y envolverla en:

```css
overflow-x: auto;
```

Definiendo un `min-width` razonable para la tabla.

Ejemplo conceptual:

```text
┌───────────────────────────────────────────┐
│ Responsable │ Recibido │ Pendiente │ ... │ →
└───────────────────────────────────────────┘
```

El usuario podrá desplazar horizontalmente solo la tabla.

### Opción B — Card responsive

Si la implementación actual permite hacerlo limpiamente, en mobile cada registro podría transformarse en una card:

```text
Victor Soto

Recibido      CLP 1.200.000
Pendiente     CLP   200.000
Egresos       CLP 1.144.536
Balance       CLP   255.464
```

No utilizar una solución donde los textos terminen uno encima del otro.

La misma regla debe aplicarse a todas las tablas con exceso de columnas.

## 4. Filter Bar / Secciones de filtros

La vista de **Egresos** muestra correctamente los controles individualmente, pero el conjunto de filtros se distribuye de manera irregular y genera un efecto visual tipo zigzag.

Este problema debe corregirse de forma global para **todas las interfaces que utilicen filter bars**.

En mobile:

- la sección de filtros debe ocupar `width: 100%`;
- los controles deben seguir una estructura vertical consistente;
- evitar filas con controles de distintos tamaños;
- inputs, selects, segmented controls y botones deben alinearse de manera uniforme.

Distribución recomendada:

```text
Buscar
[ Descripción........................ ]

[ + Nuevo egreso                     ]

Categoría
[ Todas las categorías               ]

Responsable
[ Todos                              ]

Tipo
[ Todos | Recurrente | Puntual       ]

Obviable
[ Todos | Sí | No                    ]

Pago
[ Todos | Pendiente | Saldado        ]
```

Dependiendo del control, los botones segmentados pueden mantener varios elementos internos en una misma fila, pero **el bloque completo debe ocupar el ancho disponible**.

La regla debe aplicarse también a:

- Ingresos.
- Catálogos.
- Listas de compra.
- cualquier otra vista que utilice filtros.

## 5. Formularios móviles: Nuevo egreso

El formulario **Nuevo egreso** actualmente mantiene algunos grupos en dos columnas.

En teléfonos debe utilizar exclusivamente una estructura vertical de **una columna por campo o grupo lógico**.

Actualmente:

```text
Fecha              Monto
[........]          [........]

Responsable        Obviable
[........]          [........]
```

Debe quedar:

```text
Fecha
[............................]

Monto
[............................]

Categoría
[............................]

Descripción
[............................]

Responsable
[............................]

Obviable
[............................]

Estado de pago
[ Pendiente | Saldado         ]

Evidencia
[............................]
```

Cada campo debe tener:

```css
width: 100%;
```

o el equivalente dentro del layout utilizado.

No deben existir grids de dos columnas en formularios cuando la pantalla sea mobile.

## 6. Formulario Nuevo ingreso

Aplicar exactamente el mismo criterio que en **Nuevo egreso**.

El formulario debe mostrarse en una única columna.

Actualmente existen combinaciones como:

```text
Fecha          Monto
```

Estas deben separarse:

```text
Fecha
[............................]

Monto
[............................]

Tipo de ingreso
[............................]

Estado
[ Recibido | Pendiente        ]

Descripción
[............................]

Responsable
[............................]
```

Todos los controles deben utilizar el ancho disponible.

## 7. Vista Períodos

Las cards KPI superiores actualmente aparecen en una cuadrícula de dos columnas.

En mobile deben utilizar **una sola columna**.

Ejemplo:

```text
[ Total períodos             ]
[ Período actual             ]
[ Períodos cerrados          ]
[ Balance                    ]
```

Evitar:

- títulos truncados;
- cifras cortadas;
- textos con `...` cuando exista espacio vertical disponible.

Las cards individuales de cada período pueden mantener su estructura interna actual, pero deben revisarse para evitar compresión horizontal innecesaria.

## 8. Vista Catálogos

Aplicar también los criterios generales responsive.

Las cards:

```text
Total
Sistema
Personal
Activas
```

deben mostrarse en una sola columna en teléfonos si el ancho actual provoca pérdida de legibilidad.

La filter bar debe seguir el mismo patrón definido anteriormente:

```text
Buscar
[...........................]

[ Actualizar                 ]

[ + Nueva categoría          ]

Tipo
[ Todas | Recurrentes | Puntuales ]

Origen
[ Todas | Sistema | Personal ]

Estado
[ Todas | Activas | Inactivas ]
```

Evitar distribuciones donde `Buscar`, `Actualizar` y `Nueva categoría` compitan por espacio horizontal.

## 9. Listas de compra

Aplicar las mismas reglas.

### KPI

Actualmente:

```text
2 x 2
```

En mobile utilizar:

```text
1 columna
```

### Barra de filtros / acciones

Actualmente:

```text
Buscar | Actualizar | Nueva lista
```

queda excesivamente comprimido.

Debe transformarse en algo similar a:

```text
Buscar
[...........................]

[ Actualizar                 ]

[ + Nueva lista              ]

Estado
[ Activas | Archivadas       ]
```

## 10. Modales

Los modales de:

- Nuevo ingreso.
- Nuevo egreso.
- Agregar producto.
- otros formularios.

deben ser revisados para teléfonos.

Requisitos:

```text
width: calc(100vw - margen lateral)
max-height: calc(100dvh - margen vertical)
overflow-y: auto
```

Evitar modales extremadamente altos o campos distribuidos en dos columnas.

El encabezado del modal debe permanecer claro:

```text
Título                         X
```

El contenido debe mantener suficiente separación vertical entre campos.

## 11. Reglas responsive generales

Definir o revisar un breakpoint común para teléfonos, idealmente alrededor de:

```css
@media (max-width: 640px)
```

o reutilizar el breakpoint equivalente del framework existente.

Dentro de ese breakpoint:

```text
KPI grids              → 1 columna
Form grids             → 1 columna
Filter bars            → flujo vertical
Inputs/selects         → width: 100%
Tablas anchas          → scroll horizontal o cards
Botones principales    → width: 100% cuando corresponda
Header                 → sin superposiciones
```

No utilizar anchos fijos que puedan producir overflow.

Preferir:

```css
width: 100%;
max-width: 100%;
min-width: 0;
```

en elementos que participan en layouts `flex` o `grid`.

## 12. Moneda y textos

Existe actualmente truncamiento de cifras como:

```text
1.60...
73.3...
1.27...
```

Esto no debe ocurrir en KPI importantes.

Los valores monetarios deben poder visualizarse completos, por ejemplo:

```text
1.600.000 CLP
73.320 CLP
1.272.316 CLP
```

Si es necesario:

- permitir que el valor utilice una línea independiente;
- disminuir moderadamente el `font-size` en pantallas muy pequeñas;
- aplicar `font-size: clamp(...)`;
- permitir `wrap`.

Evitar `text-overflow: ellipsis` para montos financieros principales.

## 13. Compatibilidad

Los cambios deben ser **responsive y no destructivos**.

No modificar innecesariamente la UI de escritorio.

Validar al menos:

```text
320 px
360 px
375 px
390 px
412 px
430 px
480 px
768 px
Desktop actual
```

Especial atención a teléfonos Android, considerando también la barra de navegación inferior y viewport dinámico.

Para alturas de modal utilizar preferentemente:

```css
100dvh
```

en lugar de depender exclusivamente de `100vh`.

## 14. Criterio general de diseño

La prioridad en teléfonos debe ser:

```text
Legibilidad
    ↓
Jerarquía visual
    ↓
Ancho disponible
    ↓
Consistencia
    ↓
Densidad de información
```

No intentar replicar literalmente el layout desktop dentro del teléfono.

Cuando exista conflicto entre mantener varias columnas o mejorar la lectura, en mobile debe priorizarse la lectura mediante **una sola columna**.

## Resultado esperado

Quiero que revises los componentes compartidos y realices la corrección de manera reutilizable, evitando aplicar parches CSS individuales pantalla por pantalla si existen componentes comunes.

Identifica especialmente componentes como:

```text
PageHeader
KpiCard / StatsCard
KpiGrid
FilterBar
ResponsiveTable
Modal / Dialog
FormGrid
FormField
SegmentedControl
```

Si existen, realiza el ajuste ahí para que el comportamiento responsive se propague automáticamente al resto de la aplicación.

No cambiar:

- lógica de negocio;
- cálculos;
- endpoints;
- API;
- persistencia;
- validaciones funcionales;
- permisos;
- comportamiento desktop que actualmente funciona correctamente.

Antes de finalizar, revisar todas las vistas móviles y confirmar que no exista:

```text
overflow horizontal global;
texto superpuesto;
controles cortados;
cabeceras cubiertas por el menú;
montos KPI truncados;
formularios de dos columnas;
filter bars irregulares;
tablas ilegibles.
```

## Instrucción final

**No corrijas solamente las pantallas mostradas en las capturas. Utilízalas como evidencia de un problema responsive transversal. Revisa componentes compartidos y busca cualquier otra pantalla que presente el mismo patrón de grid, filter bar, tabla, formulario o encabezado, aplicando la misma corrección de forma consistente.**
