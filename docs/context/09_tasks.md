# 09 — Tareas

*Actualizado 30 jul 2026 — cruzado contra `tareas.js` (20 KB) y `shared.js` del repo.*

---

## 1. Definición

Una **tarea** es una acción concreta y asignable, con deadline y responsable, que puede cruzar departamentos. Es la única entidad con `dept_origen` diferente a `dept_destino`.

---

## 2. Tabla Supabase: `tareas` (140 filas)

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT PK | ✅ | `genId()` |
| `shift_id` | TEXT | — | ID del turno donde se creó (si aplica) |
| `titulo` | TEXT | ✅ | Título breve |
| `descripcion` | TEXT | — | Descripción detallada |
| `dept_origen` | TEXT | ✅ | Departamento que crea la tarea |
| `dept_destino` | TEXT | ✅ | Departamento responsable de ejecutarla |
| `creado_por` | TEXT | ✅ | Nombre del creador |
| `prioridad` | TEXT | ✅ | `'Baja'` · `'Media'` · `'Alta'` |
| `estado` | TEXT | ✅ | Ver estados abajo |
| `deadline` | TEXT | ✅ | YYYY-MM-DD (mañana → +7 días) |
| `origen` | TEXT | — | `'manual'` o contexto de creación |
| `adjuntos` | JSONB | — | Array de URLs (via `adjuntos.js`) |
| `completada_por` | TEXT | — | Quien cerró la tarea |
| `completada_ts` | TEXT | — | Timestamp de cierre |
| `verificada_por` | TEXT | — | Quien verificó (admin) |
| `verificada_ts` | TEXT | — | Timestamp de verificación |
| `notas_cierre` | TEXT | — | Notas del cierre |
| `planificacion` | TEXT | — | Tipo de planificación (Mantenimiento Kanban) |
| `room` | TEXT | — | Habitación (si aplica) |
| `tipo` | TEXT | — | Tipo de tarea |
| `fecha_ejecucion` | TEXT | — | Fecha planificada de ejecución |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` |
| `updated_at` | TIMESTAMPTZ | — | Última modificación |

---

## 3. Estados (TASK_STATES en shared.js)

```javascript
const TASK_STATES = {
  ABIERTA:    'Abierta',
  EN_PROCESO: 'En proceso',
  CERRADA:    'Cerrada',
  VALIDADA:   'Validada'
};
```

| Estado | Descripción | Transición |
|---|---|---|
| `'Abierta'` (o `'Pendiente'` normalizado) | Creada, sin empezar | → En proceso · → Cerrada |
| `'En proceso'` | En ejecución | → Cerrada |
| `'Cerrada'` (o `'Completada'` normalizado) | Finalizada por dpto destino | → Validada |
| `'Validada'` (o `'Verificada'` normalizado) | Verificada por admin/jefe origen | Estado final |

`normalizeTaskState()` mapea aliases: `Pendiente` → `Abierta`, `Completada` → `Cerrada`, `Verificada` → `Validada`.

Vencida no es un estado BD — se calcula en frontend (`isOverdue`: deadline pasado + no cerrada).

**⚠ No existen los estados `Bloqueada` ni `Cancelada` en el código actual.**

---

## 4. Flujo completo

```
1. Creación (empleado/jefe/admin)
   → estado: Abierta

2. Ejecución (empleado dpto destino / jefe / admin)
   → En proceso → Cerrada (con notas_cierre)

3. Verificación (admin / jefe origen)
   → Validada (estado final)
```

---

## 5. Deadline

- Selector calendario: mínimo = mañana, máximo = +7 días (`getMinTaskDeadline`, `getMaxTaskDeadline`)
- `validateTaskDeadline()` rechaza fechas fuera del rango
- Si deadline pasado sin cerrar → badge "Vencida" en UI (calculado, no escrito en BD)

---

## 6. Permisos

| Rol | Ve | Puede avanzar/cerrar | Puede verificar | Puede eliminar |
|---|---|---|---|---|
| Empleado dpto **origen** | ✅ (la creó) | ❌ | ❌ | ❌ |
| Empleado dpto **destino** | ✅ (asignadas a su dpto) | ✅ `canCloseTask` | ❌ | ❌ |
| Jefe Dpto | ✅ (origen o destino de su dpto) | ✅ | ✅ `canValidateTask` (si es del scope) | ❌ |
| Admin/Adjunto | ✅ Todas | ✅ | ✅ | ✅ (`canActAsAdmin`) |

```javascript
function canValidateTask(user, task) {
  return isAdmin(user); // Solo admin puede verificar
}
function canCloseTask(user, task) {
  if(isSupervisor(user)) return canViewDepartment(user, task.dept_destino);
  return currentUser.area === task.dept_destino;
}
```

---

## 7. Mantenimiento — Kanban (C1)

Para Mantenimiento, las tareas se muestran en Kanban con columnas:
- Pendiente / Urgente hoy / Urgente mañana / Planificado / Hecho

Drag & drop entre columnas via `mantenimiento.js` (`_mantDragStart`, `_mantDrop`). Los keys de BD no cambiaron (mapeo en frontend).

---

## 8. Adjuntos

`adjuntos.js` inyecta contenedores de adjuntos en el modal de tareas. Archivos en bucket `adjuntos` de Supabase Storage, guardados en `tareas.adjuntos`.
