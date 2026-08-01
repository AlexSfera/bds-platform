# 14 — Validaciones

*Actualizado 30 jul 2026 — cruzado contra `validacion.js` (140 KB) y `shared.js` (306 KB) del repo.*

---

## 1. Definición

El módulo Validación es el centro de control para jefes, contables y administradores. Agrupa la revisión de turnos, cierres de caja, incidencias, gestiones, tareas, merma, notas de empleados, hypoxic y FIO en 7 pestañas.

---

## 2. Quién puede acceder

| Rol | Alcance | Pestañas visibles |
|---|---|---|
| Admin / Adjunto Directivo | Todos los departamentos | Las 7 |
| Jefe de Departamento | Solo su(s) departamento(s) | Las 7 |
| Contable | Todos los departamentos (lectura) | **Solo Caja** (`_updateContableTabLock`) |
| Empleado | ❌ No accede | — |

`switchValTab()` fuerza `tab = 'caja'` si `isContable(currentUser)`. `_updateContableTabLock()` oculta los botones de las demás pestañas.

---

## 3. Las 7 pestañas

| # | Pestaña | ID | Contenido | Render function |
|---|---|---|---|---|
| 1 | **Follow-up** | `val-content-followup` | Lista de turnos con estado, badges, validación | `renderValidacion()` |
| 2 | **Operativo** | `val-content-operativo` | Gestiones, incidencias, tareas, notas del turno seleccionado | `renderFollowUpExtras(dept)` |
| 3 | **Caja** | `val-content-caja` | Cierres de caja (Sala, Recepción, SYNCROLAB) | `renderValCajaList()` |
| 4 | **Hypoxic** | `val-content-hypoxic` | Incidencias sala hipóxica | `renderValHypoxicList()` |
| 5 | **Merma** | `val-content-merma` | Declaraciones de merma con precios | `renderValMermaList()` |
| 6 | **Notas** | `val-content-notas` | Notas de empleados (employee_notes) | `renderValNotasList()` |
| 7 | **FIO** | `val-content-fio` | Registros FIO con KPIs, validación y eliminación | `renderValFIOList()` |

Tab por defecto: `caja` para `coord_recepcion_syncrolab` y `contable`; `followup` para el resto.

---

## 4. Pestaña Follow-up — Turnos

### Columnas en lista de turnos

| Columna | Fuente | Notas |
|---|---|---|
| Fecha | `shifts.fecha` | |
| Empleado | `shifts.nombre` | |
| Servicio | `shifts.servicio` | Asignado automáticamente (FEAT-TURNO-AUTO) |
| Horas | `shifts.horas` | Puede ser 0 si Bitrix no ha reconciliado |
| Gestiones | COUNT gestiones del turno | Badge naranja si >0 abiertas |
| Incidencias | COUNT incidencias del turno | Badge naranja si >0 abiertas |
| Tareas | COUNT tareas del turno | Badge naranja si >0 pendientes |
| Merma | COUNT mermas del turno | Solo visible en Cocina/Friegue |
| FIO | Indicador si `shift.fio === true` | Badge rojo |
| Estado | `shifts.estado` | Badge: Pendiente / validado / Validado con FIO / requiere_correccion |
| Acción | Botón "Revisar" → `openValidarModal` | Eliminar solo admin |

### Modal de validación de turno (`openValidarModal` en shared.js)

Al abrir el modal se muestra:

| Sección | Condición de visibilidad |
|---|---|
| Datos del turno (fecha, empleado, horas, servicio, puesto) | Siempre |
| Checklist completado (`checklist_items`) | Siempre |
| KPI Entrenador (`kpi_entrenador`) | Si el turno tiene el campo |
| KPI Recepción (`kpi_recepcion`) | Si el turno tiene el campo |
| Gestiones pendientes del turno | Siempre |
| Incidencias operativas del turno | Siempre |
| Tareas creadas en el turno | Siempre |
| Notas de empleado (`employee_notes`) | Bloque Operativo (C7) |
| Bloque Merma | Solo si `deptTieneMerma(shift.area)` |
| Bloque Caja | Solo si `deptTieneCaja(shift.area)` |
| Evaluación Supervisor / FIO | Solo jefe/admin |

**⚠ `openShiftDetail` en `validacion.js` es función huérfana (T8) — nunca se invoca.** El modal real es `openValidarModal` en `shared.js`.

---

## 5. Acciones en el modal de validación

### Sobre gestiones

| Acción | Quién puede |
|---|---|
| "En proceso" (estado → 'En proceso') | Empleado del dpto · Jefe · Admin |
| "Cerrar" (estado → 'Cerrada' + cerrado_por, cerrado_ts, tiempo_gestion) | Empleado del dpto · Jefe · Admin |

### Sobre incidencias

| Acción | Quién puede |
|---|---|
| "En proceso" (estado → 'En proceso') | Solo Jefe del dpto · Admin |
| "Cerrar" (estado → 'Cerrada' + "Acción tomada" obligatorio) | Solo Jefe del dpto · Admin |

### Sobre tareas

| Acción | Quién puede |
|---|---|
| "En proceso" (estado → 'En proceso') | Empleado dpto destino · Jefe · Admin |
| "Cerrar" (estado → 'Completada') | Empleado dpto destino · Jefe · Admin |

**Reglas comunes de botones:** Abierta → muestra "En proceso" y "Cerrar". En proceso → solo "Cerrar". Cerrada → sin botones.

### Sobre el turno

| Acción | Quién | Efecto |
|---|---|---|
| "Validar turno" | Jefe/Admin | `estado → 'validado'`, graba `validado_por` + `validado_ts` |
| "Validar con FIO" | Jefe/Admin | `estado → 'Validado con FIO'`, `fio → true` |
| "Reabrir informe" | Jefe/Admin | `estado → 'Pendiente'`, graba `reabierto_por` + motivo |
| "Añadir FIO" | Jefe/Admin | Abre formulario FIO inline en el modal |

---

## 6. Pestaña Caja

Muestra cierres de caja agrupados por departamento:
- **Sala:** `sala_cash_closures` — con tipo (cierre/traspaso), imágenes adjuntas, redactado_por_jefe
- **Recepción:** `recepcion_cash` — con room_charge_recibido, transferencia_banco/mews, comentario_validador
- **SYNCROLAB:** `syncrolab_cash_closures` — Nubimed + VirtuGym, con room charges vinculados

Acciones: reabrir (jefe/admin), corregir (jefe/admin), eliminar (solo `canActAsAdmin`). El contable ve todo pero no puede modificar.

---

## 7. Pestaña FIO (C6)

`renderValFIOList()` muestra todos los FIO del scope del usuario (filtrado por `_fioViewableDepts` + selector de departamento).

**KPIs en cabecera:** Pendientes (Registrado), Validados (Validado/Cerrado), Puntos totales, Disputados.

**Acciones por fila:**

| Acción | Quién puede |
|---|---|
| Ver detalle (`openFIODetail`) | Todos con acceso |
| Validar (`openFIOValidate`) | `canValidateFIO` (jefe/admin) — solo si status = 'Registrado' |
| Eliminar (`_valDeleteFIO`) | Solo `canActAsAdmin` — con audit_log + confirmación |

Límite: muestra últimos 3 meses para rendimiento.

---

## 8. Pestaña Merma

`renderValMermaList()` — lista de declaraciones de merma con producto, cantidad, causa, coste. Filtrado por departamento y rango de fechas.

---

## 9. Pestaña Notas

`renderValNotasList()` — notas de empleados (`employee_notes`): categorías Sugerencia, Queja, Mejora. Marcar como leída, eliminar (admin).

---

## 10. Pestaña Hypoxic

`renderValHypoxicList()` — incidencias de sala hipóxica con CO2, altitud, estado. Filtrado por fechas.

---

## 11. Bloqueos en validación

| Condición | Resultado |
|---|---|
| Merma sin precio asignado (Cocina) | Alerta — puede bloquear validación |
| Gestión abierta | Permite validar — no bloquea |
| Incidencia abierta | Permite validar — no bloquea |
| Caja no cuadrada | Alerta visual — no bloquea |

---

## 12. Reglas absolutas

- La validación del turno **NO cierra** automáticamente ninguna gestión, incidencia ni tarea
- Gestiones, incidencias y tareas tienen ciclo de vida **independiente** del turno
- Un turno puede validarse con gestiones o incidencias abiertas
- El cierre de gestiones/incidencias es acción manual del jefe/admin
- Todo cambio de estado queda en `audit_log`

---

## 13. FIO — Fallo Individual Operativo

### Catálogo

110 faltas en `fio_catalog` distribuidas por departamento. Entrenadores: 23 faltas (A01–A06 client failures, B01–B15 operational, C01–C03 coexistence).

### Niveles

`FIO_LEVELS` en `fio.js`: L0 (sin puntos), L1 (leve), L2 (parcial/reincidencia), L3 (grave). Cada nivel tiene `code`, `name`, `color`, `points`.

### Campos del registro FIO

| Campo | Descripción |
|---|---|
| `employee_id` | Empleado al que se aplica |
| `fault_id` | Referencia a `fio_catalog.id` |
| `incentive_month` | Mes de incentivo afectado (YYYY-MM) |
| `level_code` | L0/L1/L2/L3 |
| `applied_points` | Puntos aplicados (puede recalcularse por reincidencia) |
| `status` | Registrado → Validado / Disputado / Rechazado / Cerrado |
| `saldado` | Si la falta fue saldada |
| `evidence_image` | URL de imagen de evidencia |

### Permisos FIO

| Acción | Quién |
|---|---|
| Crear | Jefe/Admin (desde modal de validación o pantalla FIO) |
| Validar | `canValidateFIO` (jefe del dpto / admin) |
| Disputar | Solo el empleado afectado (desde Mis FIO) |
| Eliminar | Solo `canActAsAdmin` (con audit_log) |

### Impacto en incentivos

Escala de penalización: 0 pts = 0%, escalando hasta ≥15 pts = 100% eliminación del bonus. FIO disputados penalizan por defecto hasta resolución por admin.

---

## 14. QA — criterios de aceptación

```
□ Validación NO accesible a empleados sin rol supervisor
□ Contable solo ve pestaña Caja (demás ocultas por _updateContableTabLock)
□ 7 pestañas visibles para jefe/admin: Follow-up, Operativo, Caja, Hypoxic, Merma, Notas, FIO
□ Lista de turnos muestra columnas: Gestiones, Incidencias, Tareas, Merma (solo Cocina), FIO, Estado
□ Modal de validación muestra gestiones, incidencias, tareas, notas, checklist, KPIs del turno
□ Botones "En proceso" / "Cerrar" visibles para jefe/admin, no para empleado
□ "Cerrar incidencia" requiere texto en "Acción tomada"
□ Al cerrar: cerrado_por, cerrado_ts y tiempo_gestion grabados
□ Validar turno graba validado_por y validado_ts
□ "Validar con FIO" cambia estado a 'Validado con FIO' y fio=true
□ Reabrir turno graba reabierto_por y motivo
□ Validar turno NO cambia estado de gestiones/incidencias abiertas
□ Merma tab muestra declaraciones con precios (renderValMermaList)
□ FIO tab muestra KPIs + tabla con acciones (ver/validar/eliminar)
□ _valDeleteFIO usa canActAsAdmin (no solo isAdmin)
□ openShiftDetail en validacion.js sigue huérfana — no invocarla
□ Bloque Caja solo para turnos de Sala/Recepción/SYNCROLAB
```
