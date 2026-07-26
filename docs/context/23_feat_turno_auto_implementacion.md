# 23 — FEAT-TURNO-AUTO · Implementación (addendum a spec 22)

**Fecha:** 2026-07-26 · **Estado:** implementado, pendiente deploy + QA en producción
**Decisión CEO (2026-07-26, sustituye la mecánica de "apertura" de la spec 22):**
SYNCRO SHIFT NO registra apertura de jornada — el horario de trabajo vive en Bitrix.

## Arquitectura final (confirmada CEO)

1. El empleado NO elige turno (sin cambios respecto a spec 22).
2. **Front (al guardar/cerrar):** turno TENTATIVO por hora de cierre — fin nominal
   de turno más cercano, cortes = punto medio. Da valor inmediato a caja,
   checklist y anti-duplicado.
3. **Conciliación Bitrix 01:00 (`api/bitrix-sync.js` v4) = fuente de verdad FINAL:**
   reasigna turno/servicio con la hora de APERTURA real de Bitrix (tablas §2 de
   la spec) y en Cocina/Sala recalcula el array por solape §3 (≥60 min).
4. Overrides: admin libre · jefe solo Evento/Otro · Administración excluida.
   La conciliación NUNCA pisa servicios con Evento/Otro ni días con turno
   partido (>1 shift manual del día — cada tramo conserva su tentativo).
5. Atípico >90 min → `AUTO_TURNO_ATIPICO` en audit_log (front: vs fin nominal;
   conciliación: vs inicio nominal, según spec). Reasignaciones de la
   conciliación → `AUTO_TURNO_RECONCILIADO`. Overrides → `TURNO_MANUAL_OVERRIDE`.

## Tablas front (hora de CIERRE → turno tentativo)

| Depto | Fines nominales → turno | Nocturno (fecha ayer) |
|---|---|---|
| Recepción | 15:00 M · 23:00 T · 07:00 N | T <06:00 · N <11:00 (Noche = día de inicio) |
| Housekeeping | 14:00/15:00 M · 22:00 T | — |
| Mantenimiento | 15:00 M · 22:00 T | — |
| Rec. SYNCROLAB | 16:30 M · 19:30/21:15 T | — |
| Entrenadores | 12:00/17:00 M · 19:00/21:00 T | — |
| Clínica | 12:00 M · 20:00 T | — |
| Cocina/Friegue | 15:00 M · 16:00/17:00 Comida · 00:00/01:00 Cena | Cena <06:00 |
| Sala | 14:00 M · 15:00 Comida · 22:00/23:00 T · 24:00 Cena | Cena <06:00 |

## Cambios por archivo (todos sobre main de 2026-07-26, `node --check` OK)

- **shared.js** (+206 líneas): `SERVICE_WINDOWS` · `TURNO_CIERRE_MAP` ·
  `autoAssignTurno(area,puesto[,date])` · `computeServicios(ini,fin)` ·
  `_turnoAutoDeptKey` (Entrenadores/Clínica por puesto, trampa 7) ·
  `_turnoAutoManualAllowed` · `_applyTurnoAutoUI` (chip read-only «Turno: X
  (asignado automáticamente)» + oculta selectores al empleado; admin/jefe
  conservan selector con nota). `clearTurnoForm` y `saveTurno` delegan la fecha
  operativa en `autoAssignTurno` (una sola versión de la regla). `_doSaveTurno`:
  doble declaración mismo día+turno → reutiliza shift (no duplica); turno
  distinto → shift nuevo (partido); audit atípico/override tras guardar; en
  corrección se conserva el servicio original (`_editingShiftServicioOriginal`).
- **caja.js** (+58): `getServicioValue()` = punto único de lectura con auto +
  reglas de override (el resto de módulos hereda); cuerpo manual renombrado a
  `_getServicioManual()`. `_salaFechaOperativa` cutoff 2h→6h (spec §4).
  `getSalaTurnoServicio` hereda servicio de caja por fin de ventana §3
  (`_salaCajaServicioAuto`, margen 150 min; fuera → botones Evento/Otro).
  FIX-CIERRE-02 intacto.
- **recepcion.js** (+16): `getRecTurnoValue` → radio marcado manda (lock caja
  conserva prioridad), sin radio → auto. Guardia FIX-TURNO-HORA ahora valida
  contra `autoAssignTurno` (se mantiene como cinturón). FIX-TARDE-MIDNIGHT ya
  estaba desplegado.
- **syncrolab.js** (+10): `_labCurrentTurno` → radio || auto. Reglas de negocio
  sin cambios (Tarde cierra · domingo cierra · Mañana traspasa · 1 op/turno+día).
  `getLabOpToday` verificado: sin cruce de medianoche en LAB, `today()` correcto.
- **checklist.js**: variantes por turno (Rec/LAB/Entrenadores) con fallback auto;
  `turno-entr` era selector huérfano (siempre caía a 'Mañana') — ahora usa auto.
- **bitrix-sync.js → api/bitrix-sync.js** (v4, +178): tablas §2 por departamento
  (`TURNO_APERTURA_MAP` + `turnoDeptKey` copia servidor) · `computeServiciosSolape`
  §3 · asignación en import de intervalos y en el pase de asociación · PATCH de
  `servicio` en matched (con las exclusiones del punto 4) · audit
  AUTO_TURNO_RECONCILIADO / AUTO_TURNO_ATIPICO. Legacy `deducirServicioYFecha`
  queda como fallback. Versión respuesta: `v4-turno-auto-spec22`.
- **mi_turno.js**: SIN CAMBIOS — cubierto por `_applyTurnoAutoUI` (shared) y
  `getServicioValue` (caja). No desplegar.

## Tests ejecutados (node, 2026-07-26)

Front 15/15 OK (incl. caso Rebecca 14:46→Mañana; Tarde 00:10→fecha ayer; Noche
06:30→ayer; HK 17:30 atípico). Conciliación 16/16 OK = QA §7 de la spec
(14:45→Tarde; Cocina partido 12:05/20:10 con fechas correctas; Sala
06:10–14:00→["Desayuno","Comida"]; Entrenador 17:30→Tarde; HK 17:30→Tarde+atípico;
ejemplos §3; corte LAB 10:30; Administración→null).

## Flujo de datos — window._turnoAutoResult

`saveTurno()` calcula y almacena en `window._turnoAutoResult`:

```
{
  turno:          'Tarde',           // turno tentativo (por hora de CIERRE, fin nominal)
  fechaOperativa: '2026-07-26',      // fecha operativa calculada
  servicio:       'Tarde',           // = turno para la mayoría; la conciliación Bitrix
                                     //   lo reemplaza con array al día siguiente en Cocina/Sala
  atipico:        false,             // true si distancia al fin nominal > 90 min
  distanciaMin:   15,                // minutos al fin nominal más cercano
  areaEfectiva:   'Recepción'        // área resuelta (trampa T11)
}
```

**Consumidores front:**
- `_doSaveTurno()` → `fecha` y `servicio` del shift
- `getServicioValue()` (caja.js) → todas las cajas
- `getRecTurnoValue()` (recepcion.js) → caja Recepción
- `_labCurrentTurno()` (syncrolab.js) → caja SYNCROLAB
- `openRecCajaChoice()` / `openSalaCajaChoice()` / `openLabCajaChoice()` → modal de caja
- Registro de gestión/incidencia (mi_turno.js, vía `getServicioValue`)

**Consumidor backend:**
- `api/bitrix-sync.js` v4 (01:00) → recalcula con `TURNO_APERTURA_MAP` + hora real Bitrix → PATCH `shifts.servicio` → sustituye el tentativo del front (excepto Evento/Otro y partido).

## Pendientes iteración 2

| Elemento | Detalle | Estado |
|---|---|---|
| **computeServicios al cerrar (front)** | El front guarda turno tentativo como string; el array definitivo lo calcula la conciliación Bitrix. Opcionalmente integrar en front para UX inmediata. | Cubierto por conciliación — front queda tentativo |
| **Doble apertura / anti-duplicado** | Mismo empleado+fecha+turno → reutilizar shift. Turno distinto → shift nuevo (partido). | ✅ Implementado en `_doSaveTurno` |
| **fichaje.js** | Verificar que apertura de jornada y fichaje comparten mismo timestamp. | ⏳ Pendiente post-deploy |
| **checklist.js turno partido** | Confirmar que genera 2 checklists independientes (por `shift_id`). | ⏳ Pendiente QA caso 3 |
| **n8n** | Confirmar que ningún flujo depende del selector manual ni del formato de `shifts.servicio`. La conciliación ahora ESCRIBE servicio. | ⏳ Pendiente antes del deploy |
| **index.html grep** | Verificar que ninguna función redefinida pisa las nuevas. | ✅ Verificado — re-verificar tras cambios |
| **Guardia FIX-TURNO-HORA** | Decidir si retirar cuando el auto esté rodado (2 semanas). | ⏳ Pendiente |
| **Vigilar audit_log** | `AUTO_TURNO_ATIPICO` / `AUTO_TURNO_RECONCILIADO` durante 2 semanas post-deploy. | ⏳ Pendiente |

## Deploy (orden) y pendientes operativos

1. `shared.js` → 2. `checklist.js` → 3. `caja.js` → 4. `recepcion.js` →
   5. `syncrolab.js` → 6. `api/bitrix-sync.js` (⚠ subir a `api/`, no a raíz).
   Tras deploy: Ctrl+Shift+R. DDL: ninguno.
- [ ] **n8n:** confirmar que ningún flujo depende del selector manual ni del
  formato de `shifts.servicio` (la conciliación ahora ESCRIBE servicio).
- [ ] QA §9 de spec 22 en incógnito tras deploy.
- [ ] Subir spec 22 + este doc a `docs/context/`.
- [ ] Vigilar `AUTO_TURNO_ATIPICO` / `AUTO_TURNO_RECONCILIADO` 2 semanas.
- [ ] Decidir si retirar la guardia FIX-TURNO-HORA cuando el auto esté rodado.
- Limitación conocida: en días de turno partido la conciliación asigna las
  horas Bitrix del día al tramo cuyo registro coincide (≤1h) con el cierre —
  normalmente el último. Los tentativos de cada tramo se conservan.
- Riesgo heredado: 666€ del 24-jul duplicados (traspaso Marina + cierre Noche)
  — decisión consciente CEO, explicación en `ms1recmarina` y audit_log.
