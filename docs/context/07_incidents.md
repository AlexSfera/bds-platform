# 07 — Incidencias Operativas

*Actualizado 30 jul 2026 — cruzado contra `shared.js`, `adjuntos.js`, `incidencias.js` del repo.*

---

## 1. Definición

Una **incidencia operativa** es un problema real ocurrido durante el turno que requiere registro, seguimiento y cierre formal. No es una gestión pendiente ni una tarea.

---

## 2. Tabla Supabase: `incidencias` (267 filas)

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT PK | ✅ | `genId()` |
| `shift_id` | TEXT | ✅ | ID del turno donde se registró |
| `employee_id` | TEXT | ✅ | ID del empleado que registra |
| `nombre` | TEXT | ✅ | Nombre legible del empleado |
| `departamento` | TEXT | ✅ | Departamento origen — nunca nulo |
| `area` | TEXT | — | Alias de departamento (compatibilidad) |
| `fecha` | TEXT | ✅ | YYYY-MM-DD |
| `servicio` | TEXT | ✅ | Turno: Mañana · Tarde · Noche (o auto-asignado) |
| `categoria` | TEXT | ✅ | `'Incidencia operativa'` |
| `tipo_incidencia` | TEXT | ✅ | De `incidencia_tipos.js` → `INCIDENCIA_TIPOS` |
| `room` | TEXT | — | Habitación afectada normalizada; necesaria para el informe de Mantenimiento |
| `visible_companeros` | BOOLEAN | ✅ | `false` por defecto; el empleado decide si sus compañeros del mismo departamento pueden verla mientras esté activa |
| `descripcion` | TEXT | ✅ | Qué ocurrió |
| `accion_inmediata` | TEXT | — | Qué se hizo en el momento |
| `accion_tomada` | TEXT | — | Obligatoria al cerrar |
| `severidad` | TEXT | ✅ | `'Baja'` · `'Media'` · `'Alta'` · `'Crítica'` |
| `requiere_formacion` | TEXT | ✅ | `'no'` · `'si'` |
| `requiere_disciplina` | TEXT | ✅ | `'no'` · `'si'` |
| `informado_responsable` | TEXT | ✅ | `'no'` · `'si'` |
| `staff_implicado_ids` | TEXT | ✅ | JSON array (`'[]'` default) |
| `staff_implicado_nombres` | TEXT | ✅ | JSON array (`'[]'` default) |
| `adjuntos` | JSONB | — | Array de URLs de archivos adjuntos (via `adjuntos.js`) |
| `estado` | TEXT | ✅ | `'Abierta'` → `'En proceso'` → `'Cerrada'` |
| `cerrado_por` | TEXT | — | Nombre de quien cierra |
| `cerrado_ts` | TEXT | — | Timestamp de cierre (`localTs()`) |
| `tiempo_gestion` | INTEGER | — | Minutos desde apertura hasta cierre |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` |

---

## 3. Estados

| Estado | Transición | Quién |
|---|---|---|
| `'Abierta'` | → En proceso · → Cerrada | Jefe / Admin |
| `'En proceso'` | → Cerrada | Jefe / Admin |
| `'Cerrada'` | → Abierta (solo admin, con motivo + audit_log) | Admin |

El empleado **NO puede cambiar estado** — solo registra.

---

## 4. Visibilidad de incidencias y staff implicado

`adjuntos.js` extiende la visibilidad: una incidencia también es visible para empleados del departamento de los `staff_implicado_ids`, no solo del departamento creador. Si `visible_companeros=true`, los compañeros del mismo departamento la ven en Mi Turno mientras permanezca activa. La opción es voluntaria y las incidencias históricas permanecen privadas por defecto.

---

## 5. Adjuntos

`adjuntos.js` inyecta contenedores de adjuntos en el formulario de incidencia (tanto en Mi Turno como en modal standalone). Los archivos se suben al bucket `adjuntos` de Supabase Storage y se guardan como array JSON en `incidencias.adjuntos`.

---

## 6. Reglas de negocio

- El empleado **registra** pero **no procesa** — sin botones de cambio de estado
- La validación del turno **NO cierra** incidencias automáticamente
- Una incidencia cerrada puede reabrirse solo por admin con motivo + audit_log
- El tiempo de gestión se calcula y graba en BD al cerrar
- Semáforo: ≤24h 🟢 · ≤48h 🟡 · >48h 🔴
- Permanece en follow-up y dashboard hasta cierre
- En la vista de Incidencias para jefes y Admin se puede filtrar la lista de incidencias activas por `tipo_incidencia`.

---

## 7. Visibilidad por rol

| Rol | Qué ve | Puede gestionar/cerrar |
|---|---|---|
| Empleado | Solo las que creó + las donde es staff implicado (hasta cierre) | ❌ |
| Jefe Dpto | Todas las de su departamento | ✅ |
| Admin/Adjunto | Todas | ✅ + eliminar (`canActAsAdmin`) |

Incidencia cerrada desaparece de la vista del empleado creador.
