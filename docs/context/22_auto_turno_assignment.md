# 22 — FEAT-TURNO-AUTO · Asignación automática de turno

**Estado:** IMPLEMENTADO — pendiente deploy + QA
**Spec:** cerrada y aprobada por CEO 2026-07-26
**Implementación:** 2026-07-26 (sesión única)
**Antecedente:** incidente 24-jul — recepcionista de Mañana marcó turno "Tarde" a las 14:45; su traspaso ocupó el slot único de Tarde y bloqueó la operación de caja real del turno Tarde (2 empleados afectados, caja del turno sin registrar). Corregido manualmente en DB (`mryxov7pn0j4`, `ms1recmarina`).

---

## 1. Principio

El empleado **no elige turno ni servicio**. El sistema los asigna:

1. **Al GUARDAR/CERRAR la jornada (front)** → turno TENTATIVO asignado por hora de cierre + departamento/puesto. Da valor inmediato a caja, checklist y anti-duplicado.
2. **Conciliación Bitrix 01:00 (fuente de verdad final)** → reasigna turno/servicio con la hora de APERTURA real de Bitrix (tablas §2). En Cocina/Sala recalcula array por solape §3 (≥60 min).
3. **Fallback (a):** si la hora no encaja con ningún patrón, se asigna el turno más cercano igualmente y se registra `AUTO_TURNO_ATIPICO` en `audit_log`. Sin bloqueo, sin confirmación.
4. **Turno partido** (solo Cocina, Sala, Recepción SYNCROLAB, Entrenadores): cada tramo = jornada independiente → apertura y cierre propios, checklist propio. Dos declaraciones el mismo día son válidas si sus turnos asignados difieren.
5. **Excepciones manuales:** solo `admin` puede cambiar el turno asignado libremente. Jefe solo Evento/Otro. `Evento`/`Otro` nunca se auto-asignan. La conciliación NUNCA pisa servicios con Evento/Otro ni días con turno partido (>1 shift manual → cada tramo conserva su tentativo).

---

## 2. Tablas de asignación por APERTURA (conciliación Bitrix — fuente de verdad final)

Usadas por `api/bitrix-sync.js` v4 (`TURNO_APERTURA_MAP`). El front NO usa estas tablas directamente — usa las tablas de cierre (ver doc 23, tablas front).

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
- **Atípico:** distancia entre hora y el inicio/fin nominal más cercano >90 min → `AUTO_TURNO_ATIPICO` en audit_log (`action`, `detail` con hora, depto, turno asignado). Front: vs fin nominal. Conciliación: vs inicio nominal. Timestamps con `localTs()`.
- **Reasignación conciliación:** cuando Bitrix cambia el turno tentativo del front → `AUTO_TURNO_RECONCILIADO` en audit_log.
- **UI:** el selector de turno desaparece para el empleado; se muestra chip read-only «Turno: X (asignado automáticamente)». Admin ve un botón «Cambiar turno» (con audit `TURNO_MANUAL_OVERRIDE`). Jefe conserva selector con nota pero solo Evento/Otro.
- **Bitrix/n8n:** `hora_inicio`/`hora_fin`/`servicio` de `shifts` no cambian de esquema — solo cambia quién escribe el valor. Confirmar que n8n no depende del selector manual antes de desplegar.

---

## 5. Decisiones cerradas (CEO 2026-07-26)

1. **Clínica:** empezarán a registrar turnos pronto → incluir en config desde el inicio (tabla §2).
2. **Ventanas de servicio** Desayuno 06:30–11:00 · Comida 12:30–16:30 · Cena 19:30–23:30: confirmadas.
3. **Administración:** no registra turnos en SYNCRO SHIFT → excluida de la feature (sin cambios para Administrador/Contable).
4. **Umbral atípico:** 90 min confirmado.
5. **Arquitectura front+conciliación:** SYNCRO SHIFT NO registra apertura de jornada — el horario vive en Bitrix. Front asigna tentativo por hora de cierre; Bitrix reconciliación a las 01:00 es verdad final.

---

## 6. Implementación — estado por archivo

DDL: ninguno (columnas existentes). n8n: sin DROP, verificar consumo de `servicio`.
Orden de deploy: `shared.js` → `checklist.js` → `caja.js` → `recepcion.js` → `syncrolab.js` → `api/bitrix-sync.js` (⚠ subir a `api/`, no a raíz).

### shared.js — ✅ HECHO (+206 líneas)

| Elemento | Ubicación | Detalle |
|---|---|---|
| `TURNO_CIERRE_MAP` | después de `_deptCatalogo` | Rangos por fin nominal de turno (hora de CIERRE). 8 áreas: Recepción, Housekeeping, Mantenimiento, Recepción SYNCROLAB, Entrenadores, Clínica, Cocina, Sala. Aliases: `Friegue→Cocina`, `HK/Limpieza→Housekeeping`, `Fisioterapeutas→Clínica`. |
| `SERVICE_WINDOWS` | ídem | `{ Desayuno:[390,660], Comida:[750,990], Cena:[1170,1410] }` — minutos desde medianoche. |
| `TURNO_PARTIDO_DEPTS` | ídem | `['Cocina','Friegue','Sala','Recepción SYNCROLAB','Entrenadores']` |
| `autoAssignTurno(area, puesto, dateOpt)` | ídem | Retorna `{ turno, fechaOperativa, atipico, distanciaMin, areaEfectiva }`. Usa `TURNO_CIERRE_MAP` (fin nominal más cercano). Resuelve trampa T11 (Entrenadores/Fisio/RecSYNCROLAB comparten `area='SYNCROLAB'` → detecta por puesto vía `_esEntrenador`/`_esFisio`). Fecha operativa centralizada: Noche rec <06:00→ayer, Cena cocina/sala <06:00→ayer, regla genérica <06:00 para tarde/noche→ayer. |
| `computeServicios(horaInicioStr, horaFinStr)` | ídem | Retorna array de servicios con solape ≥60 min. Acepta `HH:MM` o ISO timestamp. Maneja cruce de medianoche. |
| `_turnoAutoDeptKey(area, puesto)` | ídem | Resuelve área efectiva para Entrenadores/Clínica por puesto (trampa T11). |
| `_turnoAutoManualAllowed(user)` | ídem | Admin: libre. Jefe: solo Evento/Otro. Empleado: no. |
| `_applyTurnoAutoUI(areaEfectiva)` | ídem | Chip read-only «Turno: X (asignado automáticamente)» + oculta selectores al empleado. Admin/jefe conservan selector con nota. |
| `saveTurno()` | ~L1666 (reescrita) | Llama `autoAssignTurno` en lugar de `getServicioValue()`. Fecha operativa delegada (elimina cutoffs inline hardcoded). Guarda resultado en `window._turnoAutoResult`. Áreas sin mapa (Administración): fallback a `getServicioValue()` legacy. Audit `AUTO_TURNO_ATIPICO` si distancia >90 min. |
| `_doSaveTurno()` | ~L1773 | Lee `window._turnoAutoResult` para `fecha` y `servicio` (fallback legacy si no existe). Doble declaración mismo día+turno → reutiliza shift (no duplica); turno distinto → shift nuevo (partido). En corrección conserva servicio original (`_editingShiftServicioOriginal`). |
| `clearTurnoForm()` | ~L1576 | Fecha operativa vía `autoAssignTurno` centralizado. Muestra chip `#turno-auto-chip`. |
| Form config (area block) | ~L1380 | Crea dinámicamente `#turno-auto-chip` (div violeta read-only). Para áreas con `TURNO_CIERRE_MAP`: oculta todos los selectores manuales (rec-turno, servicio-sala, servicio-cocina, servicio-hk, servicio-lab, servicio-adm). Admin ve botón "✏ Cambiar turno". Input hidden `#turno-auto-override`. Cada rama (Rec, Sala, Cocina, HK, SYNCROLAB) con `if(!_hasAutoTurno)` para fallback legacy. |

### caja.js — ✅ HECHO (+58 líneas)

| Cambio | Detalle |
|---|---|
| `getServicioValue()` | Punto único de lectura con auto + reglas de override. El resto de módulos hereda. Cuerpo manual renombrado a `_getServicioManual()`. |
| `_salaFechaOperativa()` (L267) | Cutoff ampliado de `<2h` a `<6h` (spec §4: Cena termina 00:30–01:00; cutoff 2h insuficiente). |
| `getSalaTurnoServicio` | Hereda servicio de caja por fin de ventana §3 (`_salaCajaServicioAuto`, margen 150 min; fuera → botones Evento/Otro). |
| FIX-CIERRE-02 | Intacto. |

### recepcion.js — ✅ HECHO (+16 líneas)

| Cambio | Detalle |
|---|---|
| `getRecTurnoValue()` (L258) | Radio marcado manda (lock caja conserva prioridad), sin radio → auto. |
| Guardia FIX-TURNO-HORA (L1686) | Ahora valida contra `autoAssignTurno` (se mantiene como cinturón). |
| `_recFechaOperativa` | Sin cambios — FIX-TARDE-MIDNIGHT ya desplegado (sesión anterior). |

### syncrolab.js — ✅ HECHO (+10 líneas)

| Cambio | Detalle |
|---|---|
| `_labCurrentTurno()` (L160) | Radio || auto. Reglas de negocio sin cambios (Tarde cierra · domingo cierra · Mañana traspasa · 1 op/turno+día). |
| `getLabOpToday` | Verificado: sin cruce de medianoche en LAB, `today()` correcto. |

### checklist.js — ✅ HECHO

| Cambio | Detalle |
|---|---|
| Variantes por turno | Rec/LAB/Entrenadores con fallback auto. `turno-entr` era selector huérfano (siempre caía a 'Mañana') — ahora usa auto. |

### api/bitrix-sync.js — ✅ HECHO (v4, +178 líneas)

| Elemento | Detalle |
|---|---|
| `TURNO_APERTURA_MAP` | Tablas §2 por departamento (hora de APERTURA → turno). Fuente de verdad final. |
| `turnoDeptKey` | Copia servidor de `_turnoAutoDeptKey` — resuelve área efectiva por puesto. |
| `computeServiciosSolape` | §3 (≥60 min). Recalcula array en Cocina/Sala. |
| Asignación en import | En import de intervalos y en el pase de asociación. |
| PATCH `servicio` en matched | Con exclusiones: NUNCA pisa Evento/Otro ni turno partido (>1 shift/día). |
| Audit | `AUTO_TURNO_RECONCILIADO` (reasignación) + `AUTO_TURNO_ATIPICO` (>90 min vs inicio nominal). |
| Legacy | `deducirServicioYFecha` queda como fallback. |
| Versión respuesta | `v4-turno-auto-spec22` |

### mi_turno.js — SIN CAMBIOS

Cubierto por `_applyTurnoAutoUI` (shared) y `getServicioValue` (caja). No desplegar.

### fichaje.js — ⏳ PENDIENTE verificación

Verificar que apertura de jornada y fichaje comparten el mismo timestamp de referencia. Sin cambios de código previstos — solo visual check post-deploy.

---

## 7. Flujo de datos — window._turnoAutoResult

`saveTurno()` calcula y almacena en `window._turnoAutoResult`:

```
{
  turno:          'Tarde',           // turno tentativo (por hora de cierre)
  fechaOperativa: '2026-07-26',      // fecha operativa calculada
  servicio:       'Tarde',           // = turno para la mayoría; la conciliación Bitrix
                                     //   lo reemplaza con array al día siguiente en Cocina/Sala
  atipico:        false,             // true si distancia al fin nominal > 90 min
  distanciaMin:   15,                // minutos al fin nominal más cercano
  areaEfectiva:   'Recepción'        // área resuelta (trampa T11)
}
```

Consumidores front:
- `_doSaveTurno()` → `fecha` y `servicio` del shift
- `getServicioValue()` → todas las cajas
- `getRecTurnoValue()` → caja Recepción
- `openRecCajaChoice()` / `openSalaCajaChoice()` / `openLabCajaChoice()` → modal de caja
- Registro de gestión/incidencia en mi_turno.js

Consumidor backend:
- `api/bitrix-sync.js` v4 (01:00) → recalcula con `TURNO_APERTURA_MAP` + hora real Bitrix → PATCH `shifts.servicio` → sustituye el tentativo del front.

---

## 8. Pendiente para iteración 2

| Elemento | Detalle | Estado |
|---|---|---|
| **computeServicios al cerrar (front)** | Integrar llamada en el flujo de cierre de Cocina/Sala cuando `hora_fin` esté disponible en el shift. Ahora el front guarda turno tentativo como string; el array definitivo `["Desayuno","Comida"]` lo calcula la conciliación Bitrix al día siguiente. | Cubierto por conciliación — front queda tentativo |
| **Doble apertura / anti-duplicado** | `saveTurno` + `_doSaveTurno`: si ya existe shift abierto del mismo empleado+fecha+turno → reutilizar (no duplicar). Si turno difiere (partido) → shift nuevo. | ✅ Implementado en `_doSaveTurno` |
| **fichaje.js** | Verificar que el timestamp de apertura de jornada y el de fichaje coinciden. | ⏳ Pendiente post-deploy |
| **checklist.js** | Confirmar que turno partido genera 2 checklists independientes (asociados por `shift_id`). | ⏳ Pendiente QA caso 3 |
| **n8n** | Confirmar que ningún flujo depende del selector manual ni del valor literal de `shifts.servicio`. La conciliación ahora ESCRIBE servicio. | ⏳ Pendiente antes del deploy |
| **index.html** | Verificar que ninguna función redefinida pisa las nuevas. Grep hecho: limpio a fecha de implementación. | ✅ Verificado — re-verificar tras cambios |
| **Guardia FIX-TURNO-HORA** | Decidir si retirar cuando el auto esté rodado (2 semanas). | ⏳ Pendiente |
| **Vigilar audit_log** | `AUTO_TURNO_ATIPICO` / `AUTO_TURNO_RECONCILIADO` durante 2 semanas post-deploy. | ⏳ Pendiente |

---

## 9. QA mínimo antes de deploy

1. Recepción: abrir 06:50→Mañana; 14:45→Tarde (caso Rebecca: ya no puede equivocarse); 22:50→Noche; cerrar Noche 06:30→fecha ayer.
2. Recepción caja: traspaso Tarde a las 23:55 y a las 00:10 → misma fecha operativa, sin bloqueo del día siguiente.
3. Cocina partido: abrir 12:05→Comida, cerrar 16:00; abrir 20:10→Cena, cerrar 00:20 → 2 shifts, fecha correcta en ambos.
4. Sala 06:10–14:00 → `["Desayuno","Comida"]` (calculado por conciliación Bitrix; front guarda tentativo "Mañana").
5. Entrenador 17:30→Tarde.
6. Apertura atípica (ej. HK a las 17:30) → asigna Tarde + `AUTO_TURNO_ATIPICO` en audit_log.
7. Dos recepcionistas mismo turno: uno traspasa, el otro cierra sin caja — sin cambios.

---

## 10. Riesgos abiertos

1. **shared.js es el archivo más peligroso** (287 KB + 206 líneas con la feature). Deploy por Ctrl+A overwrite. Verificar que `registrarLecturaGestion` y demás funciones clave están presentes tras pegar.
2. **Los 666€ del 24-jul** duplicados en informes (traspaso Marina + cierre Noche) — decisión consciente del CEO; explicación en `audit_log` y comentario del registro `ms1recmarina`.
3. **Empleados con horarios irregulares** (sustituciones): el fallback asigna igualmente. Vigilar `AUTO_TURNO_ATIPICO` en audit_log las 2 primeras semanas.
4. **Cutoff _salaFechaOperativa cambiado a <6h**: antes era <2h. Si algún empleado de Sala abre jornada entre las 02:00 y las 05:59 (poco probable pero posible para Desayuno), la fecha se fijará como ayer. `autoAssignTurno` asigna Mañana correctamente pero la fecha puede ser incorrecta para un turno de Desayuno que empieza pronto. Monitorizar.
5. **Turno partido + conciliación:** en días de turno partido la conciliación asigna las horas Bitrix del día al tramo cuyo registro coincide (≤1h) con el cierre — normalmente el último. Los tentativos de cada tramo se conservan.
