# 22 — FEAT-TURNO-AUTO · Asignación automática de turno

**Estado:** spec CERRADA — aprobada por CEO 2026-07-26 (sin puntos abiertos)
**Fecha:** 2026-07-26
**Antecedente:** incidente 24-jul — recepcionista de Mañana marcó turno "Tarde" a las 14:45; su traspaso ocupó el slot único de Tarde y bloqueó la operación de caja real del turno Tarde (2 empleados afectados, caja del turno sin registrar). Corregido manualmente en DB (`mryxov7pn0j4`, `ms1recmarina`).

---

## 1. Principio

El empleado **no elige turno ni servicio**. El sistema los asigna:

1. **Al ABRIR la jornada** → turno asignado automáticamente según hora actual + departamento/puesto. Queda fijado; caja, checklist y validación lo heredan.
2. **Al CERRAR** (solo Cocina y Sala) → el array de servicios se recalcula según el intervalo real trabajado (solape apertura–cierre con las ventanas de servicio).
3. **Fallback (a):** si la hora no encaja con ningún patrón, se asigna el turno más cercano igualmente y se registra `AUTO_TURNO_ATIPICO` en `audit_log`. Sin bloqueo, sin confirmación.
4. **Turno partido** (solo Cocina, Sala, Recepción SYNCROLAB, Entrenadores): cada tramo = jornada independiente → apertura y cierre propios, checklist propio. Dos declaraciones el mismo día son válidas si sus turnos asignados difieren.
5. **Excepciones manuales:** solo `admin` puede cambiar el turno asignado. `Evento`/`Otro` nunca se auto-asignan — los marca el jefe.

---

## 2. Tablas de asignación (hora de APERTURA → turno)

Regla general: se asigna el turno cuyo inicio nominal esté más cerca de la hora de apertura. Cortes = punto medio entre inicios.

### Recepción Hotel (Mañana 07–15 · Tarde 15–23 · Noche 23–07)

| Apertura | Turno | Fecha operativa |
|---|---|---|
| 03:00–10:59 | Mañana | hoy |
| 11:00–18:59 | Tarde | hoy |
| 19:00–02:59 | Noche | día de inicio (si apertura 00:00–02:59 → ayer) |

### Housekeeping (Mañana 06–14 / 07–15 · Tarde 14–22)

| Apertura | Turno |
|---|---|
| 00:00–10:59 | Mañana |
| 11:00–23:59 | Tarde |

### Mantenimiento (Mañana 07–15 · Tarde 14–22)

| Apertura | Turno |
|---|---|
| 00:00–10:59 | Mañana |
| 11:00–23:59 | Tarde |

### Recepción SYNCROLAB (08:00/08:30–16:30 · 11:30–19:30 / 13:15–21:15)

| Apertura | Turno |
|---|---|
| 00:00–10:29 | Mañana |
| 10:30–23:59 | Tarde |

### Entrenadores (formatos variables; etiquetas en uso: Mañana/Tarde)

| Apertura | Turno |
|---|---|
| 00:00–14:59 | Mañana |
| 15:00–23:59 | Tarde |

Cubre: 08:00–12:00→Mañana; tramo 2 partido 18:00–21:00→Tarde; 17:00–19:00→Tarde; 09:00–17:00→Mañana.

### Clínica (08–12 · 12–20) — aún no registran turnos; empezarán pronto. Incluir en la config desde el inicio.

| Apertura | Turno |
|---|---|
| 00:00–10:59 | Mañana |
| 11:00–23:59 | Tarde |

### Cocina y Friegue (06–15 · 09–17 · 12–16+20–00 · tarde hasta 01:00)

Turno tentativo al abrir:

| Apertura | Turno tentativo |
|---|---|
| 02:00–10:59 | Mañana |
| 11:00–16:59 | Comida |
| 17:00–01:59 | Cena |

Al cerrar → array final de servicios por solape (§3). Friegue no tiene partido (turnos 08–16, 12–16, 13–17, 20–00 → una sola declaración por tramo igualmente cubierta por la tabla).

### Sala — Balcón de La Sella (06–14 · 07–15 · 11–15+20–24 · 12–22 · 13–23 · 15–23 · 15–24)

| Apertura | Turno tentativo |
|---|---|
| 02:00–10:29 | Mañana |
| 10:30–14:59 | Comida |
| 15:00–17:59 | Tarde |
| 18:00–01:59 | Cena |

Al cerrar → array final de servicios por solape (§3).

---

## 3. Servicios por solape (solo Cocina/Friegue y Sala)

Al cerrar la jornada, `servicio` se recalcula: se incluyen todos los servicios cuya ventana solape ≥60 min con el intervalo apertura–cierre real.

| Servicio | Ventana (confirmada CEO) |
|---|---|
| Desayuno | 06:30–11:00 |
| Comida | 12:30–16:30 |
| Cena | 19:30–23:30 |

Si el intervalo no solapa ninguna ventana ≥60 min → se mantiene el turno tentativo (Mañana/Tarde) como valor único. Ejemplos: 06:00–15:00 → `["Desayuno","Comida"]`; 12:00–16:00 → `["Comida"]`; 20:00–00:30 → `["Cena"]`; 09:00–11:30 → `["Desayuno"]`.

---

## 4. Reglas transversales

- **Fecha operativa:** sin cambios en Recepción Noche (cutoff <09:00 → ayer). NUEVO: cualquier cierre entre 00:00–05:59 de un turno abierto el día anterior conserva la fecha operativa del día de apertura (fix del bug de medianoche en Tarde/Cena).
- **Anti-duplicado caja:** la regla "una operación por turno y día" no cambia — ahora es fiable porque el turno ya no es manual.
- **Doble apertura mismo turno:** si un empleado abre dos veces y el turno asignado coincide, la segunda apertura reutiliza/continúa la jornada abierta (no crea shift duplicado). Turnos distintos (partido) → shift nuevo.
- **Atípico:** distancia entre hora de apertura y el inicio nominal más cercano >90 min → `AUTO_TURNO_ATIPICO` en audit_log (`action`, `detail` con hora, depto, turno asignado). Timestamps con `localTs()`.
- **UI:** el selector de turno desaparece para el empleado; se muestra chip read-only «Turno: X (asignado automáticamente)». Admin ve un botón «Cambiar turno» (con audit).
- **Bitrix/n8n:** `hora_inicio`/`hora_fin`/`servicio` de `shifts` no cambian de esquema — solo cambia quién escribe el valor. Confirmar que n8n no depende del selector manual antes de desplegar.

---

## 5. Decisiones cerradas (CEO 2026-07-26)

1. **Clínica:** empezarán a registrar turnos pronto → incluir en `TURNO_AUTO_MAP` desde el inicio (tabla §2).
2. **Ventanas de servicio** Desayuno 06:30–11:00 · Comida 12:30–16:30 · Cena 19:30–23:30: confirmadas.
3. **Administración:** no registra turnos en SYNCRO SHIFT → excluida de la feature (sin cambios para Administrador/Contable).
4. **Umbral atípico:** 90 min confirmado.

---

## 6. Impacto en código

| Archivo | Cambio |
|---|---|
| `shared.js` | Config `TURNO_AUTO_MAP` (tablas §2) + ventanas §3 + helper `autoAssignTurno(area, puesto, date)` → `{turno, fechaOperativa, atipico}` + `computeServicios(inicio, fin)` |
| `mi_turno.js` | Apertura: fija turno auto, elimina selector empleado; cierre: recalcula servicios (Cocina/Sala); doble apertura |
| `recepcion.js` | Hereda turno auto (elimina radio `rec-turno` manual); fix `_recFechaOperativa` Tarde <06:00 → ayer |
| `caja.js` | Hereda turno auto; revisar `_salaFechaOperativa` (cutoff 2h) contra regla §4 |
| `syncrolab.js` | Hereda turno auto |
| `fichaje.js` | Verificar que apertura de jornada y fichaje comparten el mismo timestamp de referencia |
| `checklist.js` | Checklist por tramo en partidos (2/día) |

DDL: ninguno (columnas existentes). n8n: sin DROP, verificar consumo de `servicio`.

---

## 7. QA mínimo antes de deploy

1. Recepción: abrir 06:50→Mañana; 14:45→Tarde (caso Rebecca: ya no puede equivocarse); 22:50→Noche; cerrar Noche 06:30→fecha ayer.
2. Recepción caja: traspaso Tarde a las 23:55 y a las 00:10 → misma fecha operativa, sin bloqueo del día siguiente.
3. Cocina partido: abrir 12:05→Comida, cerrar 16:00; abrir 20:10→Cena, cerrar 00:20 → 2 shifts, fecha correcta en ambos.
4. Sala 06:10–14:00 → `["Desayuno","Comida"]`.
5. Entrenador 17:30→Tarde.
6. Apertura atípica (ej. HK a las 17:30) → asigna Tarde + `AUTO_TURNO_ATIPICO` en audit_log.
7. Dos recepcionistas mismo turno: uno traspasa, el otro cierra sin caja — sin cambios.
