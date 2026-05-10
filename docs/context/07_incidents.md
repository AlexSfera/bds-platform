# 07 — Incidencias Operativas

---

## 1. Definición técnica

Una **incidencia operativa** es un problema real ocurrido durante el turno que requiere registro, seguimiento y cierre formal. No es una tarea ni una gestión pendiente.

| Concepto | Definición |
|---|---|
| **Incidencia** | Problema ocurrido. Requiere cierre con acción tomada. Tiene severidad. |
| **Gestión pendiente** | Asunto no resuelto que continúa al siguiente turno. Sin severidad. |
| **Tarea** | Acción asignable entre departamentos o usuarios. Tiene deadline y prioridad. |

---

## 2. Tabla Supabase: `incidencias`

### Columnas

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT | ✅ | Generado en cliente con `genId()` |
| `shift_id` | TEXT | ✅ | ID del turno donde se registró |
| `employee_id` | TEXT | ✅ | ID del empleado que registra |
| `nombre` | TEXT | ✅ | Nombre legible del empleado |
| `departamento` | TEXT | ✅ | Departamento origen |
| `area` | TEXT | — | Alias de departamento (mantener por compatibilidad) |
| `fecha` | TEXT | ✅ | Fecha en formato YYYY-MM-DD |
| `servicio` | TEXT | ✅ | Turno: Mañana · Tarde · Noche |
| `categoria` | TEXT | ✅ | Siempre `'Incidencia operativa'` |
| `tipo_incidencia` | TEXT | ✅ | De la lista del departamento (ver `incidencia_tipos.js`) |
| `descripcion` | TEXT | ✅ | Qué ocurrió |
| `accion_inmediata` | TEXT | — | Qué se hizo en el momento |
| `accion_tomada` | TEXT | — | Acción de cierre — obligatoria al cerrar |
| `severidad` | TEXT | ✅ | `'Baja'` · `'Media'` · `'Alta'` · `'Crítica'` |
| `requiere_formacion` | TEXT | ✅ | `'no'` · `'si'` |
| `requiere_disciplina` | TEXT | ✅ | `'no'` · `'si'` |
| `informado_responsable` | TEXT | ✅ | `'no'` · `'si'` |
| `staff_implicado_ids` | TEXT | ✅ | JSON array: `'[]'` por defecto |
| `staff_implicado_nombres` | TEXT | ✅ | JSON array: `'[]'` por defecto |
| `estado` | TEXT | ✅ | Ver estados abajo |
| `cerrado_por` | TEXT | — | Nombre de quien cierra |
| `cerrado_ts` | TEXT | — | Timestamp de cierre en hora local |
| `tiempo_gestion` | INTEGER | — | Minutos desde apertura hasta cierre |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` — hora local España |

### Estados

| Estado | Descripción | Transición permitida |
|---|---|---|
| `'Abierta'` | Recién registrada | → En proceso · → Cerrada |
| `'En proceso'` | En seguimiento activo | → Cerrada |
| `'Cerrada'` | Cerrada con acción tomada | → Abierta (solo admin, con motivo) |

---

## 3. Tipologías por departamento

Las tipologías viven en `incidencia_tipos.js` en el objeto `INCIDENCIA_TIPOS`.

| Departamento | Nº tipos |
|---|---|
| Cocina | 14 |
| Sala | 12 |
| Recepción | 12 |
| Recepción SYNCROLAB | 16 |
| Entrenadores | 14 |
| Fisioterapeutas | 14 |
| Housekeeping | 14 |
| Mantenimiento | 16 |
| Economato | 14 |
| RRHH | 16 |

Para obtener la lista de un departamento:
```javascript
var tipos = getInciTipos(currentUser.area);
populateInciTipoSelector('i-tipo-incidencia', currentUser.area);
```

---

## 4. Registro de incidencia — flujo

```
Empleado en Mi Turno
    → Activa toggle "¿Hubo incidencia?" → Sí
    → Selecciona tipo (lista de su departamento)
    → Describe qué ocurrió
    → Añade acción inmediata tomada (opcional)
    → Selecciona staff implicado (opcional)
    → Se graba en tabla 'incidencias' al guardar turno
    → estado = 'Abierta', created_at = localTs()
```

---

## 5. Cierre de incidencia — flujo

```
Jefe Dpto / Admin en Validación o Dashboard
    → Abre modal del turno o ficha de incidencia
    → Pulsa "En proceso" → estado cambia, se graba updated_at
    → Pulsa "Cerrar" → aparece campo "Acción tomada" (obligatorio)
    → Al confirmar:
        estado = 'Cerrada'
        accion_tomada = texto introducido
        cerrado_por = currentUser.nombre
        cerrado_ts = localTs()
        tiempo_gestion = minutos entre created_at y cerrado_ts
    → invalidateCache('incidencias')
```

---

## 6. Reglas de negocio

- El empleado **registra** pero **no procesa** — sin botones de cambio de estado
- La validación del turno **no cierra** incidencias automáticamente
- Una incidencia cerrada puede reabrirse solo por admin con motivo escrito + audit_log
- El tiempo de gestión se calcula y graba en BD al cerrar — no se recalcula en frontend
- El semáforo de tiempo aplica también a incidencias abiertas (tiempo transcurrido desde `created_at`): ≤24h 🟢 · ≤48h 🟡 · >48h 🔴
- La incidencia permanece visible en follow-up y dashboard hasta que esté cerrada

---

## 7. Visibilidad por rol — reglas de fila

| Rol | Qué ve | Puede gestionar/cerrar |
|---|---|---|
| **Empleado** | Solo las incidencias que él mismo creó — hasta cierre | ❌ Solo registra |
| **Jefe Dpto** | Todas las incidencias de su departamento | ✅ Sí |
| **Admin** | Todas | ✅ Sí + eliminar |

> Una incidencia cerrada desaparece de la vista del empleado creador.
> El empleado NO puede cambiar el estado de sus propias incidencias.
> El jefe/admin son los únicos que procesan y cierran incidencias.

### Visibilidad por módulo

| Módulo | Qué ve | Quién |
|---|---|---|
| Mi Turno | Sus propias incidencias (hasta cierre) | Empleado |
| Mi Turno | Todas las incidencias del departamento | Jefe/Admin |
| Validación — lista turnos | Columna "Incid." con badge contador | Jefe/Admin |
| Validación — modal turno | Detalle + botones En proceso / Cerrar | Jefe/Admin |
| Dashboard — pestaña Incidencias | Todas las del departamento + filtros | Jefe/Admin |

---

## 8. Columnas en dashboard — tabla Incidencias

| Columna | Fuente | Notas |
|---|---|---|
| Fecha apertura | `created_at` | DD/MM/YYYY |
| Hora apertura | `created_at` | HH:mm hora local |
| Fecha cierre | `cerrado_ts` | Solo si cerrada |
| Hora cierre | `cerrado_ts` | Solo si cerrada |
| Departamento | `departamento` | Badge de color |
| Empleado | `nombre` | |
| Tipo | `tipo_incidencia` | |
| Descripción | `descripcion` | |
| Severidad | `severidad` | Badge |
| Estado | `estado` | Badge con color |
| Acción tomada | `accion_tomada` | Solo si cerrada |
| Tiempo gestión | `tiempo_gestion` | Semáforo 🟢🟡🔴 |
| Cerrado por | `cerrado_por` | Solo si cerrada |

---

## 9. QA — criterios de aceptación

```
□ El select de tipo muestra la lista correcta del departamento del empleado
□ Al guardar turno, la incidencia aparece en tabla 'incidencias' en Supabase
□ El campo 'departamento' nunca es nulo
□ El campo 'created_at' está en hora local España (no UTC)
□ El empleado NO ve botones "En proceso" ni "Cerrar" en su Mi Turno
□ El jefe/admin SÍ ve los botones en validación
□ Al cerrar: 'accion_tomada' es obligatoria — no permite cerrar sin ella
□ Al cerrar: se graban cerrado_por, cerrado_ts, tiempo_gestion
□ La validación del turno no cambia el estado de incidencias
□ El dashboard muestra fecha y hora de apertura Y de cierre
□ El semáforo aplica correctamente: ≤24h verde, ≤48h amarillo, >48h rojo
□ Eliminar incidencia: solo admin + confirmación + audit_log
```
