# 20 — Módulo Housekeeping

**Actualizado:** 2026-07-31 — verificado contra `housekeeping.js` (115 KB, 1753 líneas) y esquema Supabase
**Módulo JS:** `housekeeping.js` (55+ funciones)
**Estado:** FASE 1 implementada y activa. FASE 2 (MEWS) no implementada.

---

## 1. Objetivo

Gestión completa de limpieza del hotel: planificación diaria, ejecución con cronómetro (inicio/pausa/fin), revisión por Gobernanta, zonas públicas con panel supervisor, y tareas periódicas.

---

## 2. Tablas Supabase

| Tabla | Filas | Propósito |
|---|---|---|
| `housekeeping_rooms` | 46 | Catálogo de habitaciones |
| `housekeeping_room_clean_types` | 7 | Tipos de limpieza con tiempo estándar |
| `housekeeping_public_areas` | 71 | Zonas públicas + tareas diarias |
| `housekeeping_periodic_tasks` | 56 | Tareas periódicas (frecuencia en días) |
| `housekeeping_plans` | 19 | Planes diarios de asignación |
| `housekeeping_assignments` | 335 | Asignaciones concretas (hab/zona/periódica) |
| `housekeeping_mews_sync_log` | 0 | Log de sync MEWS ↔ HK (FASE 2, sin uso) |

### Columnas clave por tabla

**`housekeeping_rooms`:** `id`, `activa`, `numero` (unique), `tipo` (SYNCRO/PREMIUM/PANORAMIC/FLY/QUEEN), `planta`, `mews_resource_id` (unique), `tiempo_salida_min`, `mews_state`, `last_clean_ts`, `last_clean_type`, `last_clean_employee`.

**`housekeeping_public_areas`:** `id`, `activa`, `nombre`, `zona_grupo`, `tarea_grupo`, `tipo_tarea`, `dias_minutos` (JSONB: `{"LUN":15,"MAR":20,...}`), `hora_objetivo`, `tiempo_estimado_min`, `orden`, `ultima_limpieza_ts`, `ultima_limpieza_emp`.

**`housekeeping_periodic_tasks`:** `id`, `activa`, `nombre`, `categoria`, `frecuencia_dias`, `tiempo_estimado_min`, `tiempo_referencia`, `proxima_ejecucion_ts`, `ultima_ejecucion_ts`, `ultima_ejecucion_emp`.

**`housekeeping_plans`:** `id`, `fecha`, `turno` (Manana/Tarde), `creado_por`, `creado_nombre`, `estado` (default: activo).

**`housekeeping_assignments`:** `id`, `plan_id` (FK → plans, null si ad-hoc), `ad_hoc`, `employee_id`, `employee_nombre`, `tipo_objeto` (habitacion/zona_publica/tarea_periodica), `objeto_id`, `objeto_nombre`, `tipo_limpieza`, `tiempo_estimado_min`, `prioridad`, `estado`, `hora_inicio`, `hora_fin`, `pausa_inicio`, `total_pausa_min`, `tiempo_real_min`, `re_trabajo_count`, `motivo_reapertura`, `notas`, `incidencia_id` (FK → incidencias), `revisado_por`, `revisado_nombre`, `revisado_ts`, `checklist_data`, `mews_sync_status`, `mews_sync_ts`, `created_at`.

---

## 3. Roles y permisos

### Funciones de permiso

```javascript
hkIsHK(user)          → area.toLowerCase() === 'hk' || 'housekeeping'
hkIsGobernanta(user)  → admin || gobernante || subgobernante || (jefe_departamento + HK) || (jefe + HK)
hkCanRevisar(user)    → hkIsGobernanta(user)
hkCanPlanificar(user) → hkIsGobernanta(user)
hkCanConfigurar(user) → hkIsGobernanta(user)
```

### Matriz de permisos

| Acción | Admin | Gobernanta/Subgob. | Empleado HK |
|---|---|---|---|
| Ver planificación global | ✅ | ✅ | ❌ |
| Ver/ejecutar su ruta (Mi Ruta) | ✅ | ✅ | ✅ (solo asignadas) |
| Crear/editar planificación | ✅ | ✅ | ❌ |
| Auto-asignarse | ✅ | ✅ | ❌ |
| Iniciar/pausar/finalizar limpieza | ✅ | ✅ | ✅ (solo asignadas) |
| Cambiar a "Revisado" | ✅ | ✅ | ❌ |
| Reabrir asignación | ✅ | ✅ | ❌ |
| Crear incidencia desde ejecución | ✅ | ✅ | ✅ |
| Configuración HK | ✅ | ✅ | ❌ |
| Panel supervisor zonas | ✅ | ✅ | ❌ |
| Eliminar asignación | ✅ | Solo pendientes | ❌ |

---

## 4. Tipos de limpieza

```javascript
HK_TIPO_LIMPIEZA_LABEL = {
  repaso: 'Repaso',                    // stayover
  repaso_sabanas: 'Repaso + sábanas',
  salida_syncro: 'Salida SYNCRO',      // solo hab. tipo SYNCRO
  salida_premium: 'Salida Premium',     // solo PREMIUM/PANORAMIC/QUEEN
  salida_fly: 'Salida FLY',            // solo FLY
  inspeccion: 'Inspección',
  destripe: 'Destripe'
};

HK_TIPO_TIEMPO = {  // minutos por defecto
  repaso:15, repaso_sabanas:30,
  salida_syncro:35, salida_premium:45, salida_fly:55,
  inspeccion:1, destripe:0
};
```

### Restricciones por tipo de habitación

```javascript
HK_TLIMP_TIPOS_PERMITIDOS = {
  salida_syncro:  ['SYNCRO'],
  salida_premium: ['PREMIUM','PANORAMIC','QUEEN'],
  salida_fly:     ['FLY']
  // repaso, repaso_sabanas, inspeccion, destripe: sin restricción
};
```

---

## 5. Estados de asignación

```
pendiente → en_proceso → pausada → en_proceso → finalizado → revisado
                                                     ↓
                                              requiere_correccion (reabierto con motivo)
```

| Estado | Color | Descripción |
|---|---|---|
| `pendiente` | #9ca3af gris | Asignada, sin iniciar |
| `en_proceso` | #3b82f6 azul | Limpieza activa |
| `pausada` | #f59e0b ámbar | Pausada temporalmente |
| `finalizado` | #10b981 verde | Completada, pendiente revisión |
| `revisado` | #059669 verde oscuro | Revisada por Gobernanta |
| `requiere_correccion` | #ef4444 rojo | Reabierta con motivo obligatorio |

---

## 6. Pantallas (renderHKScreen router)

| Screen ID | Función render | Acceso |
|---|---|---|
| `ruta-mod` | `renderHKMiRuta()` | Todos HK |
| `hk-plan` | `renderHKPlanificacion()` | Gobernanta+ |
| `hk-config` | `renderHKConfig()` | Gobernanta+ |
| `hk-revision` | `renderHKRevision()` | Gobernanta+ |
| `hk-dash` | `renderHKDashboard()` | Gobernanta+ |
| `hk-zonas` | `renderHKZonasPublicas()` | Gobernanta+ (panel supervisor) |

### Mi Ruta (empleado HK)
Dos tabs: **Habitaciones** y **Zonas**. Muestra tarjetas de asignaciones con estado, tipo, tiempo estimado. Click → abre modal de ejecución.

### Planificación (Gobernanta)
- Selector de fecha (máx 7 días) y turno (Mañana/Tarde)
- Botón "Auto-generar zonas" (`hkAutogenPlan`): crea asignaciones para todas las zonas activas del día de la semana seleccionado
- Modal de asignación: seleccionar empleado + tipo limpieza + habitaciones (grid con checkboxes agrupados por planta) o zona pública
- Resumen de carga estimada por empleado
- Borrar asignación solo si estado = `pendiente`

### Panel Supervisor Zonas Públicas (`renderHKZonasPublicas`)
4 bloques:
1. **Radar del día** — KPIs y alertas de zonas pendientes
2. **Estado por zona** — tabla con rendimiento 30d, incidencias 30d
3. **Histórico** — modal con últimas 30 ejecuciones y gráfico 8 semanas
4. **Matriz empleado × zona** — distribución de trabajo

---

## 7. Ejecución (modal `hkOpenExec`)

### Acciones

| Acción | Método | Graba |
|---|---|---|
| Iniciar | `hkAction('start')` | `hora_inicio = localTs()`, `estado='en_proceso'` |
| Pausar | `hkAction('pause')` | `pausa_inicio = localTs()`, `estado='pausada'` |
| Continuar | `hkAction('resume')` | Suma pausa a `total_pausa_min`, `estado='en_proceso'` |
| Finalizar | `hkAction('finish')` | `hora_fin = localTs()`, calcula `tiempo_real_min`, `estado='finalizado'` |
| Revisar | `hkAction('revisar')` | `revisado_por/nombre/ts`, `estado='revisado'` |
| Reabrir | `hkAction('reabrir')` | `motivo_reapertura` obligatorio, `re_trabajo_count++`, `estado='requiere_correccion'` |

### Reglas de ejecución
- **Solo una activa por empleado.** Si inicia otra asignación con una `en_proceso`, la anterior se pausa automáticamente.
- **Auto-revisión:** si la Gobernanta finaliza su propia asignación, se marca automáticamente como `revisado`.
- **Re-trabajo:** al reabrir, el tiempo se acumula (no se reinicia). `re_trabajo_count` se incrementa.
- **Notas:** campo de texto libre guardado con cada acción.
- **Incidencias:** se pueden crear directamente desde el modal de ejecución (inserta en tabla `incidencias` y enlaza vía `incidencia_id`).
- Tras escritura: `invalidateCache` de todas las tablas HK relevantes.

### Actualización de habitaciones/zonas al finalizar
- `housekeeping_rooms`: actualiza `last_clean_ts`, `last_clean_type`, `last_clean_employee`
- `housekeeping_public_areas`: actualiza `ultima_limpieza_ts`, `ultima_limpieza_emp`
- `housekeeping_periodic_tasks`: actualiza `ultima_ejecucion_ts`, `ultima_ejecucion_emp`

---

## 8. Funciones expuestas (window.*)

| Función | Propósito |
|---|---|
| `renderHKScreen(id)` | Router de pantallas HK |
| `renderHKMiRuta()` | Mi Ruta del empleado |
| `renderHKPlanificacion()` | Planificación diaria |
| `renderHKZonasPublicas()` | Panel supervisor zonas |
| `renderHKConfig()` | Configuración HK |
| `renderHKRevision()` | Revisión de asignaciones |
| `renderHKDashboard()` | Dashboard HK |
| `hkOpenExec(asigId)` | Abre modal de ejecución |
| `hkCloseExec()` | Cierra modal ejecución |
| `hkAction(act)` | Ejecuta acción (start/pause/resume/finish/revisar/reabrir) |
| `hkCreatePlan()` | Crea plan del día |
| `hkAutogenPlan()` | Auto-genera zonas del día de la semana |
| `hkOpenAsignar(tipo)` | Modal de asignación (habitacion/zona_publica/tarea_periodica) |
| `hkGuardarAsig()` | Guarda asignación(es) |
| `hkBorrarAsig(id)` | Elimina asignación pendiente |
| `hkToggleInciPanel()` | Panel de incidencia en modal ejecución |
| `hkGuardarIncidencia()` | Guarda incidencia desde HK |
| `hkCrearIncidencia(asigId)` | Abre panel incidencia para una asignación |
| `hkRenderHabCheckboxes()` | Renderiza grid de habitaciones por planta |
| `hkSelAllHab(sel)` | Seleccionar/deseleccionar todas las habitaciones |
| `hkUpdateHabResumen()` | Actualiza resumen de habitaciones seleccionadas |
| `hkRecalcEst()` | Recalcula tiempo estimado |
| `hkIsHK(user)` | ¿Es empleado HK? |
| `hkIsGobernanta(user)` | ¿Es Gobernanta/Subgobernante/Admin? |
| `hkAdHocZona(id, nombre, min)` | Ejecución ad-hoc de zona sin planificación |
| `hkZonaVerHistorico(zonaId, zonaNombre)` | Modal histórico de zona |

---

## 9. FASE 2 — Integración MEWS (NO implementada)

Arquitectura prevista: `SYNCRO HUB ←── n8n ────→ MEWS Connector API v1`.

| Funcionalidad FASE 2 | Estado |
|---|---|
| Sync catálogo habitaciones desde MEWS | ❌ Pendiente |
| Sync estados de limpieza HUB→MEWS | ❌ Pendiente |
| Webhooks MEWS → n8n → Supabase | ❌ Pendiente |
| Auto-asignación Control >3 días sin uso | ❌ Pendiente |
| Coste por habitación (tiempo × salario/hora) | ❌ Pendiente |
| Export Excel / Power BI | ❌ Pendiente |
| Replicación incidencias HK a MEWS tasks | ❌ Pendiente |

Tabla `housekeeping_mews_sync_log` existe (0 filas). Campos `mews_sync_status` y `mews_sync_ts` en assignments están preparados pero sin uso.

Regla de conflicto prevista: MEWS gana en reservas, SYNCRO HUB gana en estado de limpieza.

---

## 10. Constantes y helpers

```javascript
HK_DIAS = ['DOM','LUN','MAR','MIE','JUE','VIE','SAB'];
hkTodayDow()       → día actual como 'LUN', 'MAR', etc.
hkNowHM()          → hora actual 'HH:MM'
hkGenId(prefix)    → ID único con prefijo (ej: 'hkpl_..', 'hkas_..')
hkParseDiasMin(json) → parsea JSONB dias_minutos a objeto
hkFmtDuration(min) → formatea minutos a 'Xh Ym'
hkBadge(label, color) → HTML de badge con color
```

---

## 11. QA

```
□ Empleado HK solo ve Mi Ruta (sus asignaciones)
□ Gobernanta/Subgobernante ve todas las pantallas HK
□ Admin ve todo
□ Solo una asignación activa por empleado (auto-pausa de la anterior)
□ Pausas se descuentan del tiempo real
□ No hay tiempos negativos
□ Gobernanta auto-revisa sus propias asignaciones al finalizar
□ Reapertura exige motivo obligatorio
□ Re-trabajo acumula tiempo (no reinicia)
□ re_trabajo_count se incrementa
□ Empleado no puede cambiar a Revisado ni reabrir
□ Grid de habitaciones agrupado por planta con filtro por tipo
□ salida_syncro solo para hab SYNCRO; salida_premium solo PREMIUM/PANORAMIC/QUEEN; salida_fly solo FLY
□ Auto-generar zonas crea asignaciones según dias_minutos del día de la semana
□ Incidencia se puede crear desde modal de ejecución
□ last_clean_ts se actualiza en rooms al finalizar
□ ultima_limpieza_ts se actualiza en zonas al finalizar
□ Timestamps con localTs()
□ invalidateCache tras cada escritura
□ Panel supervisor zonas: radar + estado + histórico + matriz
```
