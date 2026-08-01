# 05 — Turnos (Shifts) y Checklists

*Actualizado 30 jul 2026 — cruzado contra `shared.js` y specs 22/23 FEAT-TURNO-AUTO.*

---

## 1. Definición

El turno es la unidad operativa base de SYNCRO SHIFT. Cada registro representa la actividad de un empleado en un período de trabajo. Desde jul 2026, el turno (servicio) se asigna automáticamente según la hora de cierre de jornada Bitrix y departamento/puesto.

---

## 2. Tabla Supabase: `shifts`

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT PK | ✅ | Generado en cliente (`genId()`) |
| `employee_id` | TEXT | ✅ | ID del empleado |
| `nombre` | TEXT | ✅ | Nombre legible del empleado |
| `puesto` | TEXT | — | Puesto del empleado (clave para T11: Entrenadores vs Rec.SYNCROLAB) |
| `area` | TEXT | ✅ | Departamento / área del empleado |
| `fecha` | TEXT | ✅ | YYYY-MM-DD. **⚠ T-FECHA-CAST: es `text`, no `date` — requiere `fecha::date` y prefiltro regex para comparaciones** |
| `servicio` | TEXT | ✅ | Turno asignado: `'Mañana'` · `'Tarde'` · `'Noche'` · `'Desayuno'` · `'Comida'` · `'Cena'` (Cocina/Sala) |
| `horas` | NUMERIC | ✅ | Horas trabajadas (inicialmente 0; reconciliadas por Bitrix) |
| `horas_bitrix` | NUMERIC | — | Horas reales según fichaje Bitrix (sync nocturno) |
| `horas_source` | TEXT | — | `'manual'` o `'bitrix'` — origen del valor de horas |
| `responsable_id` | TEXT | — | ID del responsable de turno (solo deptos con responsable) |
| `responsable_nombre` | TEXT | — | Nombre del responsable de turno |
| `follow_up` | TEXT | ✅ | `'si'` / `'no'` — hay gestiones pendientes |
| `merma_declarada` | TEXT | ✅ | `'si'` / `'no'` — se declaró merma |
| `incidencia_declarada` | TEXT | ✅ | `'si'` / `'no'` — se declaró incidencia |
| `observacion` | TEXT | — | Notas libres del empleado |
| `checklist_items` | TEXT | — | JSON del checklist completado (**no `checklist_data`**) |
| `ajustes_sala` | TEXT (JSON) | — | Ajustes de Sala serializados |
| `kpi_entrenador` | JSONB | — | KPI autodeclarado por entrenadores |
| `kpi_recepcion` | TEXT (JSON) | — | Cross-selling y KPI de recepción |
| `estado` | TEXT | ✅ | `'Pendiente'` · `'validado'` · `'Validado con FIO'` · `'requiere_correccion'` |
| `validado_por` | TEXT | — | Nombre de quien valida |
| `validado_ts` | TEXT | — | Timestamp de validación |
| `fio` | BOOLEAN | — | `true` si tiene FIO asociado |
| `bitrix_shift_id` | TEXT (unique) | — | Vínculo con registro Bitrix |
| `fecha_operativa` | TEXT | — | Fecha operativa (puede diferir de `fecha` por turnos noche) |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` al crear |

**Deptos con responsable de turno** (`DEPTS_CON_RESPONSABLE`): Sala, Cocina, Friegue, Housekeeping, Limpieza, HK.

---

## 3. FEAT-TURNO-AUTO — Asignación automática de turno

**Specs:** `22_auto_turno_assignment.md` y `23_feat_turno_auto_implementacion.md`.

### 3.1 Concepto

El empleado **ya no elige su turno manualmente**. El sistema lo asigna automáticamente según:
- La hora de cierre de jornada Bitrix (fuente definitiva)
- El departamento y puesto del empleado
- Las ventanas de servicio configuradas

### 3.2 Componentes

| Componente | Ubicación | Propósito |
|---|---|---|
| `TURNO_CIERRE_MAP` | `shared.js ~233` | Mapeo dept → rangos de minutos para clasificar turno por hora de cierre |
| `SERVICE_WINDOWS` | `shared.js ~227` | Ventanas de servicio: Desayuno 06:30–11:00, Comida 12:30–16:30, Cena 19:30–23:30 |
| `autoAssignTurno(area, puesto, dateOpt)` | `shared.js ~267` | Calcula turno tentativo. Resuelve T11 (Entrenadores/Fisio/RecSYNCROLAB por puesto) |
| `computeServicios(horaInicio, horaFin)` | `shared.js ~310` | Calcula servicios con ≥60min overlap, soporte midnight-crossing. Solo Cocina/Sala |
| `window._turnoAutoResult` | shared state | Estado compartido entre `saveTurno()` y consumidores downstream |
| `_hasAutoTurno` | flag | Oculta selectores manuales de turno para deptos con auto-asignación |
| `api/bitrix-sync.js` v4 | Vercel Edge Function | Reconciliación a las ~01:00 — fuente de verdad final usando hora de apertura Bitrix |

### 3.3 Flujo

1. **Front (tentativo):** al abrir Mi Turno, `autoAssignTurno()` asigna turno por hora de cierre (`TURNO_CIERRE_MAP`)
2. **`saveTurno()` fija** `window._turnoAutoResult` como estado compartido
3. **Bitrix sync (01:00):** reconcilia con hora real de apertura → fuente de verdad final
4. **Duplicado mismo día:** si ya existe turno del mismo empleado + fecha + servicio + no validado → UPDATE (no INSERT)

### 3.4 Override admin

Admin/jefe puede override manual vía `_showTurnoOverrideUI()` con auditoría: `TURNO_MANUAL_OVERRIDE` en `audit_log`. Administración mantiene selección manual (legacy fallback).

---

## 4. Fecha operativa

La fecha operativa puede diferir de la fecha calendario para turnos nocturnos:
- `_salaFechaOperativa()` — cutoff **6h** (hora < 6 = ayer). En `caja.js`
- `_recFechaOperativa(turno)` — cutoff **7h** (hora < 7 = ayer). En `recepcion.js`

**Regla:** toda referencia operativa a "hoy" usa fecha operativa. Los timestamps de `audit_log` van con fecha real.

---

## 5. Estados del turno

| Estado | Descripción | Quién puede cambiar |
|---|---|---|
| `'Pendiente'` | Guardado por empleado, esperando validación | — (estado inicial) |
| `'validado'` | Aprobado por jefe/admin | Jefe/Admin |
| `'Validado con FIO'` | Aprobado pero con FIO registrado | Jefe/Admin |
| `'requiere_correccion'` | Devuelto para corrección | Jefe/Admin |

---

## 6. Reglas de turno

- Un empleado no puede tener dos turnos del mismo día+servicio sin validar (se reutiliza el existente)
- El turno se guarda con estado `'Pendiente'`
- El turno no se puede modificar una vez validado, salvo reapertura por jefe/admin
- Gestiones, incidencias y tareas tienen ciclo de vida **independiente** del turno
- Validar el turno **NO** cierra gestiones ni incidencias automáticamente
- El formulario de Mi Turno siempre aparece vacío al abrir (no carga turno anterior)
- Merma: admin/adjunto (`canActAsAdmin`) están exentos de declarar merma (bypass temporal en `shared.js ~1754`)

---

## 7. KPIs que alimenta el turno

- Turnos del periodo por departamento
- Horas trabajadas por empleado y departamento (manual vs Bitrix)
- Presencia de gestiones, incidencias, tareas, merma y FIO
- Validaciones pendientes
- KPI entrenadores (autodeclaración por turno: PT, PT dúo, PT30, clases, valoraciones)
- KPI recepción (cross-selling)

---

## 8. Horas Bitrix

El sync nocturno (`api/bitrix-sync.js` v4, ~01:00) escribe `horas_bitrix` y `horas_source='bitrix'` en el shift vinculado. Si no hay match, el shift mantiene `horas=0` y `horas_source='manual'`.

---

# Checklists

---

## 9. Definición

Lista de verificación que el empleado completa durante su turno. Específica por departamento y turno.

---

## 10. Reglas de checklist

- Cada departamento tiene su propio checklist — nunca mostrar el de otro
- Selección por `currentUser.area` + turno (servicio) seleccionado
- Se guarda en `shifts.checklist_items` como JSON al guardar turno (**no `checklist_data`**)
- Checklist incompleto **no bloquea** el guardado — genera alerta visual
- El checklist completado se muestra en el modal de validación

---

## 11. Fuente de checklists

Los checklists viven en `checklist.js`. Estructura basada en `CHECKLISTS[dept][turno]`.

Tipos de respuesta: verificación binaria (✅/❌), texto libre, numérico (ej. temperatura).

Persistencia:
```javascript
// Al guardar turno
shift.checklist_items = JSON.stringify(_chkSavedState);

// Al mostrar en validación
var chk = JSON.parse(s.checklist_items || '[]');
```

---

## 12. Estado de definición de checklists

| Departamento | Estado |
|---|---|
| Cocina | ✅ Definido (Apertura + Cierre) |
| Sala | ✅ Definido (Apertura + Cierre) |
| Recepción | ✅ Definido (Mañana + Tarde + Noche) |
| Housekeeping | Checklist por habitación (ver `20_housekeeping.md`) |
| SYNCROLAB | `[NO DATA]` |
| Mantenimiento | `[NO DATA]` |
| Friegue | `[NO DATA]` |
| Entrenadores | `[NO DATA]` |
