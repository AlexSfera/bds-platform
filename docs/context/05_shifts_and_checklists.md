# 05 — Turnos (Shifts)

---

## 1. Definición

El turno es la unidad operativa base de SynchroHub. Cada registro de turno representa la actividad de un empleado en un período de trabajo.

---

## 2. Tabla Supabase: `shifts`

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT | ✅ | Generado en cliente |
| `employee_id` | TEXT | ✅ | ID del empleado |
| `nombre` | TEXT | ✅ | Nombre legible |
| `departamento` | TEXT | ✅ | Nunca nulo |
| `area` | TEXT | — | Alias de departamento |
| `fecha` | TEXT | ✅ | YYYY-MM-DD |
| `turno` | TEXT | ✅ | `'Mañana'` · `'Tarde'` · `'Noche'` |
| `servicio` | TEXT | — | Alias de turno |
| `horas` | NUMERIC | ✅ | Horas trabajadas |
| `observaciones` | TEXT | — | Notas libres del empleado |
| `checklist_data` | TEXT | — | JSON del checklist completado |
| `estado` | TEXT | ✅ | `'pendiente'` · `'validado'` · `'requiere_correccion'` |
| `validado_por` | TEXT | — | Nombre de quien valida |
| `validado_ts` | TEXT | — | Timestamp de validación |
| `fio_id` | TEXT | — | Referencia al FIO si existe |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` |
| `updated_at` | TIMESTAMPTZ | — | Última modificación |

---

## 3. Reglas de turno

- Un empleado no puede tener dos turnos del mismo día sin eliminar el anterior
- El turno se guarda con estado `'pendiente'`
- El turno no se puede modificar una vez validado, salvo reapertura por jefe/admin
- Gestiones e incidencias del turno tienen ciclo de vida independiente del turno
- Validar el turno no cierra gestiones ni incidencias automáticamente
- El formulario de Mi Turno siempre aparece vacío al abrir — nunca con datos del turno anterior

---

## 4. Estados del turno

| Estado | Descripción | Quién puede cambiar |
|---|---|---|
| `'pendiente'` | Guardado por empleado, esperando validación | — |
| `'validado'` | Aprobado por jefe/admin | Jefe/Admin |
| `'requiere_correccion'` | Devuelto para corrección | Jefe/Admin |

---

## 5. KPIs que alimenta el turno

- Turnos del periodo por departamento
- Horas trabajadas por empleado y departamento
- Presencia de gestiones, incidencias, tareas, merma y FIO
- Validaciones pendientes

---

# 06 — Checklists

---

## 1. Definición

El checklist es una lista de verificación que el empleado completa durante su turno. Es específico por departamento y puede variar según el turno (Mañana / Tarde / Noche).

---

## 2. Reglas de checklist

- Cada departamento tiene su propio checklist — nunca mostrar el de otro departamento
- La selección del checklist correcto se hace por `currentUser.area` + `turno` seleccionado
- El checklist se guarda en `shifts.checklist_data` como JSON al guardar el turno
- El checklist incompleto no bloquea el guardado del turno — genera alerta visual
- El checklist completado se muestra en el modal de validación para revisión del jefe

---

## 3. Fuente de checklists

Los checklists viven en `checklist.js`. Estructura:

```javascript
const CHECKLISTS = {
  'Cocina': {
    'Apertura': ['Verificar temperaturas cámaras', 'Revisar stock mínimo', ...],
    'Cierre': ['No quedan comandas pendientes', 'Fuegos apagados', 'Gas cerrado', ...]
  },
  'Sala': {
    'Apertura': [...],
    'Cierre': [...]
  },
  'Recepción': {
    'Mañana': [...],
    'Tarde': [...],
    'Noche': [...]
  },
  // ...
};

function getChecklist(dept, turno) {
  return (CHECKLISTS[dept] && CHECKLISTS[dept][turno]) || [];
}
```

---

## 4. Tipos de respuesta en checklist

- ✅ / ❌ — ítems de verificación binaria
- Texto libre — observaciones opcionales por ítem
- Número — cuando aplica cantidad (ej. temperatura en grados)

---

## 5. Persistencia

```javascript
// Al guardar turno
record.checklist_data = JSON.stringify(checklistState);

// Al mostrar en validación
var items = JSON.parse(shift.checklist_data || '[]');
```

---

## 6. Checklists pendientes de definir

| Departamento | Estado |
|---|---|
| Cocina | ✅ Definido (Apertura + Cierre) |
| Sala | ✅ Definido (Apertura + Cierre) |
| Recepción | ✅ Definido (Mañana + Tarde + Noche) |
| SYNCROLAB | `[NO DATA]` |
| Housekeeping | Checklist final por habitación (ver `20_housekeeping.md`) |
| Mantenimiento | `[NO DATA]` |
| Friegue | `[NO DATA]` |
| Economato | `[NO DATA]` |
| RRHH | `[NO DATA]` |
