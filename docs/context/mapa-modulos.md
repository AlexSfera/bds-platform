# Mapa de Módulos — SYNCRO SHIFT

**Repo:** `github.com/AlexSfera/syncro_hub` (rama `main`)
Código vivo: `https://raw.githubusercontent.com/AlexSfera/syncro_hub/main/<archivo>`
Generado 2026-07-26 leyendo el repo actual.

---

## Orden de carga (index.html, líneas 2500-2523)

```
shared.js → tareas.js → incidencias.js → hypoxic.js → mantenimiento.js →
gestiones.js → checklist.js → sala.js → caja.js → syncrolab.js →
recepcion.js → mi_turno.js → incidencia_tipos.js → dashboard.js →
validacion.js → housekeeping.js → fio.js → incentivos.js → informes.js →
mi_rendimiento.js → fichaje.js → merma.js → adjuntos.js → adjuntos.js (duplicado)
```

**⚠ adjuntos.js se carga 2 veces** (líneas 2522-2523, probable error de copiar). Como última definición gana, `adjuntos.js` sobreescribe 8 funciones de `shared.js`: `_doSaveTurno`, `openNewGestionStandalone`, `openNewIncidenciaStandalone`, `saveNewGestionStandalone`, `saveNewIncidenciaStandalone`, `renderGestionesScreen`, `renderIncidenciasScreen`, `renderFollowupList`.

---

## shared.js (286 KB, ~180 funciones) — NÚCLEO

Todo lo transversal. Modificar con extremo cuidado.

### Helpers core
| Función | Línea ref | Propósito |
|---|---|---|
| `sbRequest(method, table, body, params)` | ~11 | Wrapper fetch Supabase con cache + auth anon |
| `invalidateCache(table)` | ~91 | Borra cache en memoria para la tabla |
| `localTs()` | ~249 | Timestamp ISO con +02:00 (SIEMPRE usar para escrituras) |
| `genId()` | — | Genera ID único texto |
| `today()` | — | Fecha YYYY-MM-DD hoy Madrid |
| `fmtEur(n)` | — | Formato €1.234,56 |
| `toast(msg, type)` | — | Notificación UI |
| `auditLog(action, detail)` | — | Inserta en `audit_log` |
| `dbGetAll(table, params)` | — | GET con cache inteligente |

### Permisos y roles
| Constante/Función | Propósito |
|---|---|
| `ROLE_PINS` | `{'300415':'admin', '0101':'chef'}` |
| `SUPERVISOR_DEPT_MAP` | Mapea rol → departamentos supervisados. Incluye `jefe_mantenimiento`, `subgobernante`, `adjunto_directivo:['*']` |
| `AREA_GROUPS` | Expande area del jefe a departamentos cubiertos. `'F&B'→['Sala','Cocina','Friegue',…]` |
| `PUESTO_AREA_MAP` | Mapea área → puestos válidos (para Maestro) |
| `DEPTS_CON_RESPONSABLE` | Sala, Cocina, Friegue, Housekeeping |
| `isAdmin(user)` | `rol==='admin'` |
| `canActAsAdmin(user)` | admin OR adjunto_directivo |
| `isContable(user)` | `rol==='contable'` |
| `isSupervisor(user)` | `rol==='jefe'` OR rol en `SUPERVISOR_DEPT_MAP` |
| `getSupervisorDepartments(user)` | Devuelve array de deptos que supervisa |
| `canViewDepartment(user, dept)` | Verifica acceso a un depto |
| `_esEntrenador(emp)` | Detecta entrenador por puesto (no por area) |
| `_esFisio(emp)` | Detecta fisioterapeuta por puesto |
| `_deptCatalogo(emp)` | Devuelve depto real del catálogo FIO |
| `hkIsGobernanta(user)` | Gobernanta o subgobernanta |

### Navegación
| Función | Propósito |
|---|---|
| `getScreens(rol)` | Construye menú dinámico según rol. **⚠ var hoisting trap: push antes de declarar array = TypeError silencioso → nav en blanco** |
| `showScreen(id)` | Cambia pantalla activa, llama render* correspondiente |
| `switchValTab(tab)` | Cambia tab en Validación |

### Operaciones CRUD compartidas
| Función | Tablas |
|---|---|
| `renderMaestro()` | `employees` (CRUD completo) |
| `renderGestionesScreen()` | `gestiones`, `item_comentarios` |
| `renderIncidenciasScreen()` | `incidencias`, `item_comentarios` |
| `openValidarModal(shift)` | `shifts` (modal de validación — **NO confundir con `openShiftDetail` en validacion.js que está huérfana**) |
| `renderFollowUpExtras(shift)` | `employee_notes`, gestiones, incidencias del turno |
| `_doSaveTurno()` | `shifts` (crear/cerrar turno — **sobreescrita por adjuntos.js**) |
| `renderAjustesMod()` / `renderMermaMod()` / `renderNotasMod()` | `ajustes`, `merma`, `employee_notes` |
| `filtrarValidacion()` / `valGest*` / `valInci*` / `valTask*` | Filtros y tablas en pantalla Validación |

---

## Módulos por dominio

### caja.js (96 KB, 63 fns)
**Cierres de caja Sala.** Tablas: `sala_cash_closures`.
Funciones principales: `corregirCajaSala`, `_salaFechaOperativa()` (cutoff hora 2).
Expone `window._cajaCorrectMode` (también definida en shared, recepcion, syncrolab, validacion — último gana).

### recepcion.js (111 KB, 67 fns)
**Cierres + operativa Recepción Hotel.** Tablas: `recepcion_cash`, `recepcion_ventas`, `syncrolab_room_charges`, `shifts`.
Funciones principales: `_recFechaOperativa(turno)` (cutoff hora 7), `corregirCajaRec`, cross-selling UI.

### syncrolab.js (53 KB, 44 fns)
**Cierres de caja SYNCROLAB (Nubimed + VirtuGym).** Tablas: `syncrolab_cash_closures` (var `LAB_TABLE`), `syncrolab_room_charges` (var `LAB_CHARGES_TABLE`).
Función principal: `corregirCajaLab`.

### validacion.js (140 KB, 77 fns)
**Pantalla de validación central.** Tablas: `shifts`, `sala_cash_closures`, `recepcion_cash`, `syncrolab_cash_closures`, `merma`, `ajustes`, `fio`, `incidencias`, `recepcion_ventas`.
Funciones principales: `renderValCajaRecepcion`, `renderValCajaLab`, `renderValMermaList`, `renderValFIOList`, `renderValAjustes`, `renderValHypoxicList`, `renderValNotasList`, `_updateContableTabLock()`, `_renderKpisTurno`.
Contiene `openShiftDetail` — **huérfana, nunca invocada**. El modal real es `openValidarModal` en shared.js.

### housekeeping.js (115 KB, 55 fns)
**HK completo: planificación, ejecución, revisión, zonas.** Tablas: `housekeeping_plans`, `housekeeping_assignments`, `housekeeping_rooms`, `housekeeping_public_areas`, `housekeeping_periodic_tasks`, `employees`, `incidencias`.
Funciones principales: `renderHKScreen`, `renderHKPlanificacion`, `renderHKDashboard`, `renderHKRevision`, `renderHKZonasPublicas`, `renderHKConfig`, `hkAutogenPlan`, `hkIsGobernanta`, `hkIsHK`.

### mi_turno.js (90 KB, 25 fns)
**Pantalla "Mi Día" del empleado.** Tablas: `shifts`, `incidencias` (lectura).
Funciones principales: `renderInfoScreen`, `buildInfoContent`, KPI entrenador (`openEntrKpiModal`, `submitEntrKpi`).

### fio.js (53 KB, 27 fns)
**Gestión FIO (registrar, validar, disputar).** Tablas: `fio`, `fio_catalog`.
Funciones principales: `renderFIOScreen`, `renderMisFIOScreen`, `openNewFIOModal`, `saveNewFIO`, `validateFIO`, `disputeMisFIO`, `deleteFIO`.

### incentivos.js (65 KB, 35 fns)
**Motor de incentivos Sala + Cocina + Entrenadores.** Tablas: `dept_incentive_rules`, `employee_sales_weekly`, `fio`, `incentivos_liquidaciones`, `recepcion_ventas`, `cocina_costes_mes`.
Funciones principales: `renderIncentivos`, `renderIncentivosGestor`, `calcularIncentivosGestor`, `incImportarExcel`, `incLiquidarMes`, `renderIncReglas`.

### informes.js (124 KB, 54 fns)
**Panel Informes (POSMEWS, RRHH, Entrenadores).** Tablas: `employees`, `entrenadores_incentivos_mes`, `dept_incentive_rules`, `dept_reports`, `employee_status`, `sala_produccion_semanal`, `sala_informes_control`.
Funciones principales: `renderInformes`, POSMEWS upload (`_infControlDrop`, `_infHandleDrop`, `_infLoadCSV`), config entrenadores (`_infEntrConfigOpen`).

### mi_rendimiento.js (56 KB, 26 fns)
**Vista empleado de su rendimiento + liquidación entrenadores.** Tablas: `entrenadores_incentivos_mes`, `employee_sales_weekly`, `fio`, `incentivos_liquidaciones`, `recepcion_ventas`.
Funciones principales: `renderMiRendimiento`, `renderLiquidacionEntr`.
**⚠ Si `renderMiRendimiento` existiera en `incentivos.js`, mi_rendimiento.js gana (carga después).**

### fichaje.js (39 KB, 20 fns)
**Control de fichaje + alertas Bitrix.** Tablas: `bitrix_alerts`.
Función principal: `_fichajeOnShow` (renderiza fichaje con alertas subordinados para jefes).

### merma.js (26 KB, 23 fns)
**CRUD merma con búsqueda de productos.** Tablas: `merma`, `productos_compra` (lectura).
Funciones principales: `renderMermaScreen`, `mermaSearchProducto`.

### dashboard.js (83 KB, 45 fns)
**Dashboard operativo.** Tablas: `cuadrantes`, `employee_sales_weekly`, `employee_status`.
Funciones principales: `renderDashPrevision`, `_dashGuardarCuadrante`.
**⚠ B7 Dashboard redesign pendiente — no tocar sin sesión de diseño previa.**

### hypoxic.js (21 KB, ~12 fns)
**Incidencias sala hipóxica.** Tabla: `hypoxic_room_incidencias`.
Funciones principales: `renderHypoxicScreen`, `saveHypoxicNew`, `advanceHypoxic`, `openCloseHypoxic`.

### mantenimiento.js (25 KB, ~10 fns)
**Kanban de tareas mantenimiento.** Tabla: `tareas` (filtrado por dept).
Funciones principales: `renderMantenimientoMod`, `_mantDragStart`, `_mantDrop`.
Columnas Kanban: Pendiente / Urgente hoy / Urgente mañana / Planificado / Hecho.

### tareas.js (20 KB, 20 fns)
**Lógica de tareas compartida.** Sin acceso directo a tablas (usa helpers de shared/adjuntos).
Funciones principales: `openTaskModal`, `createTask`, `canValidateTask`, `canCloseTask`.

### incidencias.js (13 KB, 13 fns)
**Lógica de incidencias compartida.** Sin acceso directo (usa shared/adjuntos).
Funciones principales: `advanceIncident`, `canCloseIncident`, `buildInciObj`.

### gestiones.js (13 KB, 11 fns)
**Lógica de gestiones compartida.** Sin acceso directo.
Funciones principales: `advanceGestion`, `openCloseGestion`.

### checklist.js (27 KB)
**Checklists de turno.** Tablas: `employees`, `incidencias`, `merma`, `shifts`, `tareas`.
Función: `clearChkLocalStorage`.

### sala.js (8 KB, 11 fns)
**UI de ajustes Sala dentro del cierre de turno.** Sin acceso directo a tablas.
Funciones: `collectSalaData`, `openAjustesModal`, `confirmAjustes`.

### incidencia_tipos.js (13 KB)
**Catálogo de tipos de incidencia por departamento.** Expone `window.ENTRENADORES_AREAS`.

### faults.js (26 KB, ~12 fns)
**Sistema de faltas (paralelo a FIO, posible legacy).** Tabla referenciada: `employee_faults`.
Funciones: `renderFaultsScreen`, `openNewFaultModal`, `saveNewFault`, `validateFault`, `deleteFault`.

### adjuntos.js (50 KB, 30 fns)
**Gestión de adjuntos + overrides de CRUD.** Tablas: `gestiones`, `incidencias`.
**⚠ SOBREESCRIBE funciones de shared.js:** `_doSaveTurno`, `openNewGestionStandalone`, `saveNewGestionStandalone`, `openNewIncidenciaStandalone`, `saveNewIncidenciaStandalone`, `renderGestionesScreen`, `renderIncidenciasScreen`, `renderFollowupList`. Versiones en adjuntos.js añaden soporte de archivos adjuntos.

### bitrix-sync.js (26 KB, 12 fns)
**Sync Bitrix24 Timeman → Supabase.** Tablas: `bitrix_time_records`, `employees`, `shifts`, `audit_log`.
Funciones: `bitrixV3` (handler principal), `autoLinkEmployees`, `deducirServicioYFecha`.
Se ejecuta como Vercel Edge Function, no en el cliente.

### Archivos no-módulo
| Archivo | Propósito |
|---|---|
| `index.html` (181 KB) | Shell HTML: nav, modales, selects de puesto, scripts. Contiene estructura completa de la SPA. |
| `middleware.js` (6 KB) | Vercel Edge middleware (headers, redirects) |
| `vercel.json` | Config Vercel (routes, headers) |
| `PATCH_shared_js_horas_bitrix.html` | Parche documentado (referencia histórica) |
