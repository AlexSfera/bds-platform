# 15 — Dashboard

---

## 1. Acceso

| Rol | Acceso | Departamentos visibles |
|---|---|---|
| Admin | ✅ | Todos — puede filtrar por cualquier departamento |
| Jefe de Dpto | ✅ | Solo su departamento (filtro fijo) |
| Empleado | ❌ | Sin acceso |

---

## 2. Pestañas del dashboard

| Pestaña | Tabla fuente | Filtro principal |
|---|---|---|
| Turnos | `shifts` | `departamento` + rango de fechas |
| Incidencias | `incidencias` | `departamento` + estado + tipo |
| Gestiones Pendientes | `gestiones` | `departamento` + estado |
| FIO | `fio` | `departamento` |
| Tareas | `tareas` | `dept_destino` |
| Costes / Merma | `merma` | `departamento` = 'Cocina' (solo visible para Cocina) |

---

## 3. KPI globales — todos los departamentos

| KPI | Tabla | Cálculo |
|---|---|---|
| Turnos del periodo | `shifts` | COUNT WHERE departamento AND fecha BETWEEN |
| Horas trabajadas | `shifts` | SUM(horas) WHERE departamento AND fecha BETWEEN |
| Incidencias abiertas | `incidencias` | COUNT WHERE departamento AND estado='Abierta' |
| Incidencias cerradas | `incidencias` | COUNT WHERE departamento AND estado='Cerrada' |
| Tiempo medio resolución | `incidencias` | AVG(tiempo_gestion) WHERE cerradas |
| Gestiones abiertas | `gestiones` | COUNT WHERE departamento AND estado='Abierta' |
| Gestiones cerradas | `gestiones` | COUNT WHERE departamento AND estado='Cerrada' |
| Tareas pendientes | `tareas` | COUNT WHERE dept_destino AND estado IN ('Pendiente','En proceso') |
| Tareas vencidas | `tareas` | COUNT WHERE dept_destino AND deadline < hoy AND estado != 'Completada' |
| FIO totales | `fio` | COUNT WHERE departamento |
| FIO pendientes | `fio` | COUNT WHERE departamento AND estado != 'Cerrado' |
| Validaciones pendientes | `shifts` | COUNT WHERE departamento AND estado = 'pendiente' |

---

## 4. KPI específicos por departamento

### Recepción Hotel

| KPI | Tabla | Campo |
|---|---|---|
| Check-ins periodo | `shifts` | SUM(checkin_count) |
| Check-outs periodo | `shifts` | SUM(checkout_count) |
| Cash total cobrado | `recepcion_cash` | SUM(cash_real) |
| Tarjeta total | `recepcion_cash` | SUM(tpv_real) |
| Transferencias | `recepcion_cash` | SUM(transferencia_banco) |
| Días caja cuadrada | `recepcion_cash` | COUNT WHERE dif_total = 0 |
| Días caja descuadrada | `recepcion_cash` | COUNT WHERE ABS(dif_total) > 0.01 |
| Fondo actual en caja | `recepcion_cash` | fondo_real_a_traspasar del último registro |
| Última revisión transferencias | `recepcion_cash` | MAX(transferencia_banco_updated_at) |

### Cocina

| KPI | Tabla | Campo |
|---|---|---|
| Cubiertos totales | `shifts` | SUM(cubiertos) |
| Merma total € | `merma` | SUM(coste_estimado) |
| Incidentes APPCC | `incidencias` | COUNT WHERE tipo LIKE '%APPCC%' |

### Sala

| KPI | Tabla | Campo |
|---|---|---|
| Cubiertos totales | `shifts` | SUM(cubiertos) |
| Propinas efectivo | `sala_cash_closures` | SUM(propinas_efectivo) |
| Propinas TPV | `sala_cash_closures` | SUM(propinas_tpv) |
| Días caja cuadrada | `sala_cash_closures` | COUNT WHERE dif_total = 0 |

---

## 5. Columnas en tabla Incidencias

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
| Estado | `estado` | Badge |
| Acción tomada | `accion_tomada` | Solo si cerrada |
| Tiempo gestión | `tiempo_gestion` | Semáforo 🟢🟡🔴 |
| Cerrado por | `cerrado_por` | |
| Acciones | — | Ver · Eliminar (solo admin) |

**Semáforo de tiempo:**
- Incidencias cerradas: usa `tiempo_gestion` (en minutos)
- Incidencias abiertas: calcula tiempo transcurrido desde `created_at` hasta ahora
- ≤ 1440 min (24h) → 🟢 Verde
- ≤ 2880 min (48h) → 🟡 Amarillo
- > 2880 min (48h) → 🔴 Rojo

---

## 6. Columnas en tabla Gestiones

Idénticas a Incidencias excepto:
- `tipo_gestion` en lugar de `tipo_incidencia`
- Sin columnas `severidad`, `staff_implicado`
- Acciones: Ver · Eliminar (admin) · Eliminar (jefe, solo su dpto)

---

## 7. Columnas en tabla Tareas

| Columna | Fuente | Notas |
|---|---|---|
| Fecha creación | `created_at` | DD/MM/YYYY HH:mm |
| Título | `titulo` | |
| Descripción | `descripcion` | |
| Prioridad | `prioridad` | Badge |
| Dpto origen | `dept_origen` | |
| Dpto destino | `dept_destino` | |
| Responsable | `responsable_nombre` | |
| Deadline | `deadline` | Rojo si vencida |
| Estado | `estado` | Badge |
| Acciones | — | Ver · Eliminar (solo admin) |

---

## 8. Filtros del dashboard

### Filtros globales (aplican a todas las pestañas)
- Departamento (desplegable — admin puede cambiar, jefe fijo)
- Desde / Hasta (selector de fechas con calendario desplegable)

### Filtros específicos por pestaña

| Pestaña | Filtros adicionales |
|---|---|
| Incidencias | Tipo (lista del departamento seleccionado) · Severidad · Estado |
| Gestiones | Tipo (lista del departamento seleccionado) · Estado |
| Tareas | Prioridad · Estado · Responsable |
| FIO | Estado |

**Regla de populate de filtros de tipo:**
Al cambiar el filtro de departamento, repoblar inmediatamente los selectores de tipo:
```javascript
populateDashInciFilter(dept);
populateDashGestionFilter(dept);
```

---

## 9. Permisos de eliminación desde dashboard

| Entidad | Empleado | Jefe Dpto | Admin |
|---|---|---|---|
| Gestión | ❌ | ✅ Solo su dpto | ✅ |
| Incidencia | ❌ | ❌ | ✅ |
| Tarea | ❌ | ❌ | ✅ |
| FIO | ❌ | ❌ | ✅ |
| Cierre de caja | ❌ | ❌ | ✅ |

**Proceso de eliminación obligatorio:**
```
1. Confirmar con el usuario
2. Solicitar motivo (texto obligatorio)
3. auditLog() antes del dbDelete()
4. dbDelete()
5. invalidateCache()
6. Re-render de la tabla
```

---

## 10. QA — criterios de aceptación

```
□ Empleados no pueden acceder al dashboard
□ Jefe de dpto solo ve datos de su departamento
□ Admin puede filtrar por cualquier departamento
□ Los contadores KPI reflejan datos reales de Supabase
□ La pestaña Gestiones lee de tabla 'gestiones' (no 'incidencias')
□ La pestaña Incidencias lee de tabla 'incidencias'
□ Fecha y hora de apertura Y cierre están presentes en ambas tablas
□ El semáforo de tiempo es correcto: ≤24h verde, ≤48h amarillo, >48h rojo
□ El filtro de tipo se repuebla al cambiar departamento
□ Las tareas vencidas están destacadas visualmente
□ La pestaña Costes/Merma solo aparece para departamento Cocina
□ Jefe puede eliminar gestiones de su dpto — admin puede eliminar todo
□ Toda eliminación genera registro en audit_log
□ Los filtros Desde/Hasta usan calendario desplegable
```
