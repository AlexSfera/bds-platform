# 21 — Mantenimiento — Kanban de Tareas

**Actualizado:** 2026-09-04 — verificado contra `mantenimiento.js`
**Módulo JS:** `mantenimiento.js`
**Tablas leídas:** `tareas`, `incidencias`, `hypoxic_room_incidencias`, `housekeeping_rooms`

---

## 1. Definición

Tablero Kanban donde el departamento de Mantenimiento visualiza, planifica y ejecuta las tareas que otros departamentos le asignan. **No tiene tabla propia** — reutiliza la tabla `tareas` filtrando por `dept_destino='Mantenimiento'`.

> **Nota histórica:** la tabla `maintenance_purchases` documentada previamente **no existe en el código actual ni se referencia en ningún módulo JS**. La funcionalidad de compras de Mantenimiento no está implementada. Este módulo es exclusivamente un Kanban de tareas.

---

## 2. Visibilidad

```javascript
function _mantCanOperate(user){
  if(user.rol === 'admin') return true;
  if(user.rol === 'mantenimiento') return true;
  return String(user.area || '') === 'Mantenimiento';
}
```

Solo admin + rol `mantenimiento` + area `Mantenimiento` ven y operan el tablero.

---

## 3. Columnas Kanban (calculadas, no almacenadas)

Las columnas se **calculan** por `fecha_ejecucion` en cada render — no hay cron ni job:

| Columna | Clave | Lógica | Color |
|---|---|---|---|
| Pendiente | `a_planificar` | Sin `fecha_ejecucion` | #64748b gris |
| Urgente hoy | `hoy` | `fecha_ejecucion <= today()` (incluye vencidas) | #ef4444 rojo |
| Urgente mañana | `manana` | `fecha_ejecucion == mañana` | #f59e0b ámbar |
| Planificado | `proxima` | `fecha_ejecucion > mañana` | #3b82f6 azul |
| Hecho | `hecho` | `estado = 'Cerrada'` o `'Validada'` | #22c55e verde |

La promoción Planificado → mañana → hoy ocurre sola al renderizar (`_mantPlanOf()` recalcula).

Columna `planificacion` en BD se actualiza como espejo de la columna calculada (para compatibilidad con n8n/lecturas externas), pero la fuente de verdad es `fecha_ejecucion`.

---

## 4. Columnas de tabla `tareas` usadas

| Columna | Tipo | Uso en Kanban |
|---|---|---|
| `id` | TEXT PK | Identificador |
| `titulo` | TEXT | Título en tarjeta |
| `descripcion` | TEXT | Detalle en tarjeta |
| `dept_destino` | TEXT | Filtro = `'Mantenimiento'` |
| `dept_origen` | TEXT | Mostrado en tarjeta ("de Recepción") |
| `creado_por` | TEXT | Nombre del creador |
| `prioridad` | TEXT | Alta/Media/Baja → color borde izquierdo |
| `estado` | TEXT | Normalizado vía `normalizeTaskState()` |
| `deadline` | DATE | Mostrado + alerta "VENCIDA" si pasado |
| `fecha_ejecucion` | DATE | **Columna clave** — determina la columna Kanban |
| `planificacion` | TEXT | Espejo de columna calculada |
| `tipo` | TEXT | Badge en tarjeta |
| `room` | TEXT | Badge "🚪 nnn" en tarjeta |
| `area` | TEXT | Badge "📍 xxx" si ≠ Mantenimiento |
| `completada_por` | TEXT | Nombre de quien cerró |
| `completada_ts` | TIMESTAMPTZ | Timestamp de cierre |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Actualizado en cada escritura |

**Columna nueva requerida** (ya aplicada):
```sql
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS fecha_ejecucion date;
```

---

## 5. Drag & Drop

| Destino del drop | Acción |
|---|---|
| Urgente hoy | `fecha_ejecucion = today()` |
| Urgente mañana | `fecha_ejecucion = mañana` |
| Planificado | Abre modal con fecha obligatoria (mín = pasado mañana) |
| Pendiente | `fecha_ejecucion = null` |
| Hecho | **NO admite drop.** El cierre solo desde el modal ("✓ Marcar como HECHO") |

Al mover una tarea `Abierta` con fecha → estado cambia automáticamente a `En proceso`.

---

## 6. Operaciones

| Acción | Función | Permiso |
|---|---|---|
| Mover tarjeta (drag) | `_mantDrop(ev, targetCol)` | `_mantCanOperate` |
| Fijar fecha ejecución | `_mantSetFecha(taskId, ymd)` | `_mantCanOperate` |
| Cerrar tarea | `_mantCloseTask(taskId)` | `_mantCanOperate` |
| Reabrir tarea cerrada | `_mantReopenTask(taskId)` | `_mantCanOperate` (no si `Validada`) |
| Eliminar tarea | `_mantDeleteTask(taskId)` | Solo `admin` + audit_log ANTES + confirm |

Todas las escrituras: `dbUpdate('tareas', ...)` + `invalidateCache('tareas')` + `auditLog(...)`.

---

## 7. Modal de tarea (`_mantOpenModal`)

Muestra: badge de estado, prioridad, columna calculada, descripción, metadatos (tipo, room, area), timestamps (creación, deadline, ejecución, cierre).

**Modo planificación:** si se abre por drop en "Planificado", el input de fecha es obligatorio con `min = pasado mañana`.

Botones: Guardar fecha · Quitar fecha · ✓ Marcar como HECHO · ↩ Reabrir · 🗑 Eliminar (solo admin).

---

## 8. Orden dentro de columna

Prioridad descendente (Alta > Media > Baja), luego fecha_ejecucion/deadline ascendente.

---

## 9. Funciones expuestas (window.*)

| Función | Propósito |
|---|---|
| `renderMantenimientoMod()` | Render principal del Kanban |
| `_mantApplyDashboardFilters()` | Aplica el periodo y la habitación seleccionada |
| `_mantDragStart(ev, taskId)` | Inicio de arrastre |
| `_mantDrop(ev, targetCol)` | Drop en columna destino |
| `_mantOpenModal(taskId, opts)` | Modal de detalle/planificación |
| `_mantSetFecha(taskId, ymd)` | Fijar/quitar fecha ejecución |
| `_mantSaveFechaFromInput()` | Guardar fecha desde input del modal |
| `_mantClearFecha()` | Quitar fecha (→ Pendiente) |
| `_mantCloseTask(taskId)` | Cerrar tarea como HECHO |
| `_mantReopenTask(taskId)` | Reabrir tarea cerrada |
| `_mantDeleteTask(taskId)` | Eliminar (solo admin) |

---

## 10. Control por periodo

El Dashboard abre por defecto con el mes actual y permite elegir fecha inicial y final. Los indicadores son:

- **Tareas asignadas:** tareas con `dept_destino='Mantenimiento'` cuya `created_at` está dentro del periodo.
- **Tiempo medio de solución:** media de `completada_ts - created_at` de las tareas cuyo cierre está dentro del periodo. Las tareas sin ambos timestamps válidos no participan en la media.

El periodo no oculta tarjetas del Kanban operativo; afecta únicamente a los indicadores y al histórico por habitación.

## 11. Reparaciones por habitación

Debajo de los indicadores y antes del Kanban se muestra un selector construido con las habitaciones activas de `housekeeping_rooms` y, como respaldo histórico, habitaciones presentes en los registros. Al elegir una habitación aparece una lista cronológica que combina:

- tareas con destino `Mantenimiento` y `room`;
- incidencias generales con `room`;
- incidencias de Hypoxic Room con `room_number`.

Cada registro indica fuente, fecha, problema, descripción, estado y tiempo de solución cuando existe. Se marca una **reincidencia** cuando el mismo tipo y fuente aparecen dos o más veces para la habitación dentro del periodo. El histórico sin habitación registrada no se infiere ni se altera.

Para alimentar el histórico futuro, el formulario de tarea manual incluye una habitación opcional del catálogo activo. Cuando una tarea se genera desde una incidencia, hereda automáticamente la habitación y el tipo de esa incidencia.

## 12. QA

```
□ Kanban solo visible para Mantenimiento y Admin
□ Solo muestra tareas con dept_destino='Mantenimiento'
□ Columnas se recalculan por fecha_ejecucion en cada render
□ Tareas vencidas aparecen en "Urgente hoy" con badge ⚠ VENCIDA
□ Drop en "Hecho" bloqueado — solo desde modal
□ Drop en "Planificado" exige fecha ≥ pasado mañana
□ Mover tarea Abierta con fecha → estado pasa a En proceso
□ Reabrir: no funciona con Validada
□ Eliminar: solo admin + confirmación + audit_log ANTES del delete
□ Responsive: columnas apiladas en móvil (<760px)
□ Timestamps con localTs()
□ invalidateCache('tareas') tras toda escritura
□ Periodo inicial = mes actual
□ Tareas asignadas se cuentan por created_at dentro del periodo
□ Tiempo medio usa tareas cerradas en el periodo con created_at + completada_ts válidos
□ Selector de habitación usa el catálogo activo y conserva habitaciones históricas
□ Tarea manual permite habitación opcional y la guarda en room
□ Tarea generada desde incidencia hereda room y tipo
□ Histórico combina tarea + incidencia + Hypoxic y respeta habitación/periodo
□ El periodo analítico no filtra las columnas operativas del Kanban
```
