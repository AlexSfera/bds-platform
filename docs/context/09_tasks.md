# 09 — Tareas

---

## 1. Definición técnica

Una **tarea** es una acción concreta y asignable, con deadline y responsable, que puede cruzar departamentos. Es la única entidad que puede tener departamento origen diferente al departamento destino.

| Concepto | Diferencia |
|---|---|
| **Tarea** | Asignable a persona o departamento. Tiene deadline. Puede ser interdepartamental. |
| **Gestión pendiente** | Queda dentro del mismo departamento entre turnos. Sin deadline. |
| **Incidencia** | Problema ocurrido. Requiere cierre con severidad y acción tomada. |

---

## 2. Tabla Supabase: `tareas`

### Columnas

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT | ✅ | Generado en cliente |
| `shift_id` | TEXT | — | ID del turno donde se creó (si aplica) |
| `titulo` | TEXT | ✅ | Título breve de la tarea |
| `descripcion` | TEXT | ✅ | Descripción detallada |
| `dept_origen` | TEXT | ✅ | Departamento que crea la tarea |
| `dept_destino` | TEXT | ✅ | Departamento responsable de ejecutarla |
| `usuario_id` | TEXT | ✅ | ID del empleado creador |
| `usuario_nombre` | TEXT | ✅ | Nombre del creador |
| `responsable_id` | TEXT | — | ID del responsable asignado |
| `responsable_nombre` | TEXT | — | Nombre del responsable |
| `prioridad` | TEXT | ✅ | `'Baja'` · `'Media'` · `'Alta'` · `'Urgente'` |
| `estado` | TEXT | ✅ | Ver estados abajo |
| `deadline` | TEXT | — | Fecha límite YYYY-MM-DD (selector calendario) |
| `comentarios` | TEXT | — | Notas adicionales |
| `cerrado_por` | TEXT | — | Quien marca como completada |
| `cerrado_ts` | TEXT | — | Timestamp de cierre |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` |

### Estados

| Estado | Descripción |
|---|---|
| `'Pendiente'` | Creada, sin empezar |
| `'En proceso'` | En ejecución |
| `'Bloqueada'` | Bloqueada por dependencia externa |
| `'Completada'` | Finalizada |
| `'Vencida'` | Deadline superado sin completar (calculado automáticamente) |
| `'Cancelada'` | Cancelada con motivo |

---

## 3. Tipología de tareas

Las tareas tienen una tipología **común para todos los departamentos** — no diferenciada por departamento. Ejemplos:

- Revisión / comprobación
- Reparación / mantenimiento
- Comunicación / coordinación
- Seguimiento / gestión
- Limpieza / orden
- Compra / pedido
- Preparación / montaje
- Formación / instrucción
- Otro

---

## 4. Asignación interdepartamental — ejemplos

| Origen | Destino | Ejemplo |
|---|---|---|
| Recepción | Mantenimiento | Avería en habitación 201 |
| SYNCROLAB | Housekeeping | Habitación atleta lista para las 14:00 |
| Sala | Cocina | Menú especial para evento mañana |
| Dirección | Cualquier dpto | Tarea de gestión o seguimiento |
| Recepción | Recepción | Tarea interna del mismo departamento |

---

## 5. Reglas de deadline

- El deadline **debe seleccionarse con calendario desplegable** — nunca campo de texto libre
- El deadline solo permite **fechas futuras** desde el momento de creación
- Si el deadline se supera sin completar → el estado pasa a `'Vencida'` automáticamente (calculado en frontend al renderizar)
- Las tareas vencidas se destacan visualmente en dashboard (fondo rojo suave)

---

## 6. Permisos — reglas de fila

La visibilidad y gestión de tareas depende del departamento origen vs destino.

| Rol | Ve | Puede gestionar/cerrar |
|---|---|---|
| **Empleado dpto origen** (quien creó la tarea) | ✅ Ve la tarea que creó | ❌ No gestiona |
| **Empleado dpto destino** (quien la ejecuta) | ✅ Ve todas las tareas asignadas a su dpto | ✅ Puede cambiar estado y cerrar |
| **Jefe Dpto** | ✅ Ve todas (origen o destino de su dpto) | ✅ Sí |
| **Admin** | ✅ Todas | ✅ Sí + eliminar |

| Acción adicional | Empleado | Jefe Dpto | Admin |
|---|---|---|---|
| Crear tarea | ✅ | ✅ | ✅ |
| Asignar tarea a otro departamento | ✅ | ✅ | ✅ |
| Eliminar tarea | ❌ | ❌ | ✅ |

---

## 7. Visibilidad en Mi Turno

- El empleado del **departamento destino** ve las tareas asignadas a su departamento y puede gestionarlas (cambiar estado, cerrar)
- El empleado del **departamento origen** ve las tareas que creó (seguimiento) pero no las gestiona
- El empleado **no puede eliminar** tareas en ningún caso

---

## 8. Visibilidad en dashboard

Dashboard pestaña **Tareas** — columnas:

| Columna | Fuente | Notas |
|---|---|---|
| Fecha creación | `created_at` | DD/MM/YYYY HH:mm |
| Título | `titulo` | |
| Descripción | `descripcion` | |
| Prioridad | `prioridad` | Badge color |
| Dpto origen | `dept_origen` | |
| Dpto destino | `dept_destino` | |
| Responsable | `responsable_nombre` | |
| Deadline | `deadline` | Rojo si vencida |
| Estado | `estado` | Badge |

---

## 9. QA — criterios de aceptación

```
□ El deadline usa calendario desplegable — no campo de texto libre
□ No permite fechas pasadas al crear
□ Las tareas vencidas aparecen en rojo en dashboard
□ El empleado no puede cambiar estado de tareas
□ El jefe/admin puede cambiar estado desde validación y dashboard
□ La asignación a otro departamento funciona correctamente
□ El campo 'created_at' está en hora local España
□ Eliminar tarea: solo admin + confirmación + audit_log
□ El filtro por departamento en dashboard usa 'dept_destino'
□ Las tareas aparecen en la validación del turno donde se crearon
```
