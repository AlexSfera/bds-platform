# SYNCRO SHIFT — Matriz de acceso RLS P0

## Estado y alcance

**Estado:** `INVESTIGANDO`

**Fecha de verificación:** 2026-08-10
**Entorno modificado:** ninguno. No se ejecutaron escrituras en Supabase LIVE.

Esta matriz separa tres cosas que no deben confundirse:

1. el acceso efectivo confirmado actualmente en LIVE;
2. el acceso objetivo ya respaldado por los flujos funcionales auditados;
3. las decisiones empresariales todavía marcadas como `[NO DATA]`.

No es una migración ni autoriza cambios de grants, RLS o policies. La plantilla
`supabase/migrations/202608080002_p0_rls_cutover_TEMPLATE.sql` debe permanecer
no ejecutable mientras exista una decisión necesaria en `[NO DATA]`.

## Evidencia reproducible

- El catálogo LIVE confirmó previamente 51 tablas ordinarias en `public`, las
  51 con RLS: 43 con CRUD anónimo efectivo, tres con sólo lectura anónima y
  cinco bloqueadas por no tener policy.
- El 2026-08-10 se reconstruyó el inventario nominal a partir del snapshot de
  46 tablas de `docs/context/esquema-supabase.md` y las cinco tablas POSMEWS
  verificadas posteriormente.
- Los 51 nombres se comprobaron contra PostgREST LIVE mediante
  `select=*&limit=0`; todos respondieron HTTP 200. No se recuperaron filas ni se
  ejecutaron mutaciones.
- El endpoint OpenAPI no se usó como fuente porque LIVE exige una clave secreta
  para ese recurso. No se solicitó ni expuso esa clave.
- Los consumidores se obtuvieron mediante búsqueda literal en el JavaScript
  actual. Un consumidor genérico o indirecto puede no aparecer en la columna de
  módulos; por eso esa columna orienta la trazabilidad, pero no sustituye las
  pruebas positivas y negativas.

## Convenciones

- `S`, `I`, `U`, `D`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- `backend`: endpoint o RPC que deriva identidad, ámbito y transición desde la
  sesión; no una escritura directa confiada al navegador.
- `propio`: fila cuyo empleado/autor corresponde a la identidad autenticada.
- `ámbito`: departamento, asignación o responsabilidad obtenidos de
  `syncro_auth_context()`, nunca de campos enviados por el cliente.
- `admin/adjunto`: `admin`, `adjunto` o `adjunto_directivo` cuando el flujo
  funcional admite `canActAsAdmin()`; las excepciones se indican por tabla.
- `CONFIRMADO`: hecho verificado en LIVE o en el código actual.
- `PLANIFICADO`: regla objetivo respaldada por la auditoría, aún no desplegada.
- `[NO DATA]`: falta una regla empresarial o una comprobación que impide crear
  una policy definitiva sin inventar comportamiento.

## Reglas transversales objetivo

1. `anon` no tendrá `S/I/U/D` sobre ninguna de las 51 tablas internas.
2. Una sesión Supabase válida no bastará por sí sola: deberá existir un contexto
   activo, sin cambio obligatorio de PIN y con versión de autorización vigente.
3. Los campos de identidad, autor, departamento y estado inicial se derivarán
   en servidor cuando intervengan en una escritura.
4. Las operaciones financieras, los reemplazos de periodos, las liquidaciones,
   los borrados compuestos y las transiciones de estado se ejecutarán como
   comandos backend atómicos o con precondición; no como CRUD libre de tabla.
5. Las columnas sensibles de `employees` no se entregarán mediante lectura
   general de la tabla.
6. `service_role` permanecerá exclusivamente en servidor y nunca en el
   navegador.

## Recursos de autenticación propuestos fuera de las 51 tablas LIVE

| Recurso | `anon` | `authenticated` directo | Backend `service_role` | Estado |
|---|---|---|---|---|
| `syncro_auth_identities` | Sin acceso | Sin acceso de tabla | CRUD para aprovisionamiento, login, reset y revocación | PLANIFICADO; verificado localmente |
| `syncro_auth_rate_buckets` | Sin acceso | Sin acceso de tabla | Reserva atómica y bloqueo | PLANIFICADO; verificado localmente |
| `syncro_auth_audit` | Sin acceso | Sin acceso de tabla | Inserción y consulta operativa protegida | PLANIFICADO; verificado localmente |
| `syncro_auth_context()` | Sin ejecución | Devuelve únicamente el contexto propio vigente | Ejecución permitida | PLANIFICADO; verificado localmente |

## Matriz de las 51 tablas LIVE

| # | Tabla | Acceso LIVE actual | Consumidores principales | `SELECT` objetivo | `INSERT/UPDATE/DELETE` objetivo | Estado o decisión pendiente |
|---:|---|---|---|---|---|---|
| 1 | `ajustes` | CRUD anon — CONFIRMADO | Caja Sala, turno, validación | Propio durante el turno; responsables del ámbito; admin/adjunto | Alta sólo dentro de caja/turno autorizado; corrección transaccional; borrado confirmado sólo admin/adjunto | PLANIFICADO; ver `SUP-050`, `SUP-051`, `SUP-054`, `SEC-031` y `SEC-033` |
| 2 | `audit_log` | CRUD anon — CONFIRMADO | `shared.js`, caja, FIO, validación, Bitrix | Consulta protegida para auditoría | Inserción sólo server-side; U/D denegados por defecto | Retención y quién puede consultar/exportar: `[NO DATA]` |
| 3 | `bitrix_alerts` | CRUD anon — CONFIRMADO | Fichaje | Empleado propio; responsables de su ámbito; admin/adjunto | Importación backend sólo admin/adjunto, idempotente y sin alta automática de empleados; U/D denegados por defecto | Retención y autoridad de borrado: `[NO DATA]`; ver `SUP-045` y `SEC-026` |
| 4 | `bitrix_attendance` | CRUD anon — CONFIRMADO | Sin literal JS activo | Sin acceso directo hasta confirmar uso | Sólo integración si se reactiva | Conservar, retirar o reactivar: `[NO DATA]` |
| 5 | `bitrix_time_records` | CRUD anon — CONFIRMADO | Sincronización Bitrix, turnos | Responsables del ámbito y admin/adjunto; acceso propio por definir | I/U sólo integración backend; asociación a turno idempotente y coordinada; D sólo mantenimiento autorizado | Lectura directa del empleado y retención: `[NO DATA]`; ver `SUP-050` |
| 6 | `cocina_costes_mes` | Bloqueada — CONFIRMADO | Incentivos | Responsables autorizados de Cocina/F&B y admin/adjunto | Comando backend único por mes; sin D libre | Quién aprueba/corrige cada mes: `[NO DATA]` |
| 7 | `cuadrantes` | Bloqueada — CONFIRMADO | Dashboard | Empleados del departamento publicado; responsables del ámbito; admin/adjunto | Crear, aprobar y sustituir mediante comandos con versión | Autor de propuesta, aprobador y visibilidad previa: `[NO DATA]` |
| 8 | `departments` | CRUD anon — CONFIRMADO | Autorización server-side | Catálogo de lectura para sesiones vigentes | Sin escritura directa; gestión administrativa backend si se habilita | PLANIFICADO; no hay escritura activa detectada |
| 9 | `dept_incentive_rules` | CRUD anon — CONFIRMADO | Incentivos, informes, rendimiento | Empleado: regla aplicable; responsables del ámbito; admin/adjunto | Backend financiero con vigencia/versionado; sin D libre | Roles que aprueban y rectifican reglas: `[NO DATA]` |
| 10 | `dept_reports` | Bloqueada — CONFIRMADO | Dashboard, informes | Responsables del ámbito y admin/adjunto; destinatarios publicados por definir | Publicación/rectificación backend por periodo y estado | Relación transaccional con `employee_status` y visibilidad del empleado: `[NO DATA]` |
| 11 | `employee_incentives` | CRUD anon — CONFIRMADO | Sin literal JS activo | Sin acceso directo hasta confirmar uso | Sin escrituras | Conservar, sustituir o retirar: `[NO DATA]` |
| 12 | `employee_ips` | SELECT anon — VERIFICADO LIVE 10/08/2026 | Middleware, Maestro | SELECT anónimo temporal sólo por compatibilidad del middleware; objetivo final sin lectura de navegador | Contención LIVE VERIFICADO: todos los privilegios salvo SELECT retirados de `public`, `anon` y `authenticated`; escritura conservada para `service_role`; objetivo final: lectura service-role y gestión backend por admin/adjunto | P0 `SEC-030`; autoría de seis IP dinámicas: `[NO DATA]`; rollback no aplicado |
| 13 | `employee_notes` | CRUD anon — CONFIRMADO | Mi Día, Validación | Autor propio; responsables de su ámbito; admin/adjunto | I con autor derivado; marcar lectura por responsable/ámbito; D según decisión empresarial | Borrado, anonimato, retención y lectura global o por responsable: `[NO DATA]`; ver `SUP-052` y `SEC-032` |
| 14 | `employee_sales_weekly` | CRUD anon — CONFIRMADO | Dashboard, incentivos, rendimiento | Empleado propio; responsables del ámbito; admin/adjunto | Importación backend idempotente; corrección auditada; sin D libre | Autoridad final de importación/corrección: `[NO DATA]` |
| 15 | `employee_status` | Bloqueada — CONFIRMADO | Auth empleado, dashboard, informes | Empleado propio y responsables autorizados; admin/adjunto | Backend de estado con fechas y transición verificadas | Qué estados ve el empleado y quién aprueba cada tipo: `[NO DATA]` |
| 16 | `employees` | CRUD anon — CONFIRMADO | Transversal | Sin lectura cruda. `/api/auth/me`, directorio mínimo y vistas de gestión por ámbito | Alta, edición, estado, reset y borrado sólo por endpoints autorizados; borrado sólo admin y empleado ya en Baja; prohibida el alta automática desde Fichaje | PLANIFICADO; capa local y denegaciones verificadas; cerrar `SEC-026` |
| 17 | `entrenadores_incentivos_mes` | CRUD anon — CONFIRMADO | Informes, rendimiento | Entrenador propio; coordinación Entrenadores; admin/adjunto | Cálculo/liquidación backend con transición única; corrección separada | Quién congela y quién rectifica una liquidación: `[NO DATA]` |
| 18 | `entrenadores_kpi` | CRUD anon — CONFIRMADO | Informes | Entrenador propio; coordinación Entrenadores; admin/adjunto | I propio asociado a turno; U sólo antes del cierre o mediante corrección; D restringido | Ventana de edición y autoridad de corrección: `[NO DATA]` |
| 19 | `escandallo_lineas` | SELECT anon — CONFIRMADO | Merma | Lectura sólo con sesión válida | Escritura backend restringida; sin CRUD anónimo | Quién mantiene el escandallo: `[NO DATA]` |
| 20 | `fio` | CRUD anon — CONFIRMADO | FIO, validación, incentivos, rendimiento | Empleado propio; responsable de su ámbito; Dirección/RRHH para L4/L5 y disputas; admin/adjunto según función | Crear, validar, cerrar, disputar y resolver mediante comandos de lista cerrada con actor, ámbito y estado previo; reincidencia transaccional; D sólo admin/adjunto si se mantiene | Borrado físico frente a anulación auditada: `[NO DATA]`; ver `SUP-040`, `SUP-046`, `SUP-047` y `SEC-027` |
| 21 | `fio_catalog` | CRUD anon — CONFIRMADO | FIO, turno, validación | Catálogo autenticado filtrable por departamento | Gestión backend por autoridad designada; sin D libre | Quién publica/modifica el catálogo: `[NO DATA]` |
| 22 | `gestiones` | CRUD anon — CONFIRMADO | Gestiones, turno, validación, dashboard | Empleados del departamento; responsables de su ámbito; admin/adjunto | I con autor/departamento derivados; comentario y transiciones mediante comandos con estado previo; D según regla empresarial | Autoridad exacta de borrado: `[NO DATA]`; lectura atómica `SUP-009`; ver `SUP-048`, `SUP-049` y `SEC-028` |
| 23 | `housekeeping_assignments` | CRUD anon — CONFIRMADO | Housekeeping | Empleado asignado; gobernante/subgobernante/jefe HK; admin | Ejecución propia; planificación/revisión por responsables HK; reapertura de revisado sólo admin; D sólo pendiente y por planificador autorizado | PLANIFICADO según UI actual; integridad y autorización pendientes en `SEC-024`, `SUP-042` y `SUP-043` |
| 24 | `housekeeping_mews_sync_log` | CRUD anon — CONFIRMADO | Sin literal JS activo | Sólo responsables HK/admin si se necesita diagnóstico | Sólo integración; U/D denegados por defecto | Retención y visibilidad operativa: `[NO DATA]` |
| 25 | `housekeeping_periodic_tasks` | CRUD anon — CONFIRMADO | Housekeeping | Equipo HK autenticado; responsables HK; admin | Ejecución actualiza última limpieza; cambios de catálogo sólo por responsables HK/admin | Borrado frente a desactivación: `[NO DATA]` |
| 26 | `housekeeping_plans` | CRUD anon — CONFIRMADO | Housekeeping | Empleados incluidos; responsables HK; admin | Crear y autogenerar por responsables HK/admin, con unicidad fecha/turno | Estados posteriores a `activo` y archivo/reapertura: `[NO DATA]` |
| 27 | `housekeeping_public_areas` | CRUD anon — CONFIRMADO | Housekeeping | Equipo HK autenticado | Configuración backend por responsables HK/admin | PLANIFICADO; borrado debe comprobar referencias |
| 28 | `housekeeping_room_clean_types` | CRUD anon — CONFIRMADO | Housekeeping | Catálogo autenticado para HK | Configuración backend por responsables HK/admin | PLANIFICADO; borrado debe comprobar referencias |
| 29 | `housekeeping_rooms` | CRUD anon — CONFIRMADO | Housekeeping, turno | Equipo HK; Recepción sólo si un flujo lo exige; responsables/admin | Sin escritura operativa libre; catálogo/sync backend | Alcance exacto de Recepción y fuente maestra MEWS: `[NO DATA]` |
| 30 | `hypoxic_room_incidencias` | CRUD anon — CONFIRMADO | Hypoxic, validación | Recepción/Mantenimiento; responsables y admin; adjunto con acceso de Validación sólo lectura según reglas actuales | Alta por Recepción/Mantenimiento/admin; comandos `Abierta → En proceso → Cerrada`; sin D hasta decidirlo | Rectificación y borrado mostrados pero no implementados (`UI-003`): `[NO DATA]`; ver `SEC-025` y `SUP-044` |
| 31 | `incentivos_liquidaciones` | Bloqueada — CONFIRMADO | Incentivos, rendimiento | Empleado propio; responsables autorizados; admin/adjunto | Liquidación transaccional backend; sin U/D libre | Aprobador, rectificación y relación con FIO: `[NO DATA]` |
| 32 | `incidencias` | CRUD anon — CONFIRMADO | Incidencias, turno, validación y módulos operativos | Autor propio según estado; responsables del ámbito; admin/adjunto | I con autor/ámbito derivados; transiciones cerradas por responsables con estado previo; D según regla empresarial | Visibilidad del autor después del cierre y política de borrado: `[NO DATA]`; ver `SUP-048`, `SUP-049` y `SEC-029` |
| 33 | `item_comentarios` | CRUD anon — CONFIRMADO | Modal compartido | Sólo si el actor puede leer el registro padre | I con autor derivado y permiso del padre; U/D según regla específica; comentario más transición coordinados | Edición/borrado de comentario propio y retención: `[NO DATA]`; ver `SUP-048`, `SEC-028` y `SEC-029` |
| 34 | `merma` | CRUD anon — CONFIRMADO | Merma, turno, validación | Autor propio; Cocina/Friegue/F&B responsables; admin/adjunto | Alta idempotente backend; valoración/validación con estado previo; D restringido | Quién puede corregir/eliminar y hasta cuándo: `[NO DATA]` |
| 35 | `platos_carta` | SELECT anon — CONFIRMADO | Merma | Lectura sólo con sesión válida | Escritura backend restringida; sin CRUD anónimo | Quién mantiene el catálogo: `[NO DATA]` |
| 36 | `posmews_adjustments` | CRUD anon — CONFIRMADO | POSMEWS | Responsables Sala/F&B y admin/adjunto; lectura contable por definir | Ingesta backend por batch; U/D sólo rectificación o sustitución coordinada | Acceso del contable a datos crudos y retención: `[NO DATA]` |
| 37 | `posmews_payments_data` | CRUD anon — CONFIRMADO | POSMEWS | Responsables Sala/F&B y admin/adjunto; lectura contable por definir | Ingesta backend por batch; U/D sólo rectificación o sustitución coordinada | Acceso del contable a datos crudos y retención: `[NO DATA]` |
| 38 | `posmews_sales_data` | CRUD anon — CONFIRMADO | POSMEWS | Responsables Sala/F&B y admin/adjunto | Ingesta backend por batch; U/D sólo rectificación o sustitución coordinada | Nivel de detalle visible y retención: `[NO DATA]` |
| 39 | `posmews_upload_batches` | CRUD anon — CONFIRMADO | POSMEWS, informes | Responsables Sala/F&B y admin/adjunto | Crear/completar/reemplazar mediante comando idempotente; D coordinado | Quién puede borrar/reimportar un periodo cerrado: `[NO DATA]` |
| 40 | `posmews_upload_files` | CRUD anon — CONFIRMADO | POSMEWS, informes | Responsables Sala/F&B y admin/adjunto | Persistencia ligada al batch; sin `DELETE → POST` libre | Retención del archivo original y autoridad de reemplazo: `[NO DATA]` |
| 41 | `productos_compra` | SELECT anon — CONFIRMADO | Merma | Lectura sólo con sesión válida; coste visible según rol por definir | Escritura backend restringida; sin CRUD anónimo | Quién mantiene catálogo y quién puede ver costes: `[NO DATA]` |
| 42 | `recepcion_cash` | CRUD anon — CONFIRMADO | Recepción, validación, dashboard | Autor/Recepción; responsables; contable lectura; admin/adjunto | Cierre, traspaso, corrección y validación mediante comandos; D sólo admin/adjunto | Máquina de estados y reapertura exactas: `[NO DATA]` |
| 43 | `recepcion_cash_closures` | CRUD anon — CONFIRMADO | Dashboard legacy | Sin acceso directo | Sin escrituras; conservar bloqueada en el corte | Retirar o archivar tabla legacy: `[NO DATA]` |
| 44 | `recepcion_ventas` | CRUD anon — CONFIRMADO | Recepción, incentivos, rendimiento | Empleado propio; responsables del ámbito; admin/adjunto | Alta transaccional con cierre; rectificación auditada; sin D libre | Tratamiento de lote parcial y anulaciones: `[NO DATA]` |
| 45 | `sala_cash_closures` | CRUD anon — CONFIRMADO | Caja Sala, validación, dashboard | Sala/F&B responsables; contable lectura; admin/adjunto | Cierre, corrección, validación y reapertura backend; D sólo admin/adjunto | Máquina de estados y excepción de reapertura: `[NO DATA]` |
| 46 | `sala_informes_control` | CRUD anon — CONFIRMADO | Informes, POSMEWS | Responsables Sala/F&B y admin/adjunto | Reemplazo de periodo transaccional; sin D aislado | Cierre/reapertura de periodo: `[NO DATA]` |
| 47 | `sala_produccion_semanal` | CRUD anon — CONFIRMADO | Informes, POSMEWS | Empleado propio si se muestra rendimiento; responsables Sala/F&B; admin/adjunto | Importación/reemplazo backend por periodo; rectificación auditada | Visibilidad individual y cierre del periodo: `[NO DATA]` |
| 48 | `shifts` | CRUD anon — CONFIRMADO | Transversal | Empleado propio; responsables del ámbito; validadores autorizados; admin/adjunto | Alta/corrección/validación/reapertura mediante comandos idempotentes con actor, estado y versión; hijos coordinados transaccionalmente | Borrado físico y alcance exacto del contable: `[NO DATA]`; ver `SUP-050`, `SUP-051` y `SEC-031` |
| 49 | `syncrolab_cash_closures` | CRUD anon — CONFIRMADO | SYNCROLAB, validación | Recepción SYNCROLAB; responsable efectivo del subdepartamento; contable lectura; admin/adjunto | Cierre/corrección/validación backend con estado y unicidad | Excepción admin a duplicados y reglas de reapertura: `[NO DATA]` |
| 50 | `syncrolab_room_charges` | CRUD anon — CONFIRMADO | SYNCROLAB, Recepción, validación | Actores de la caja padre, Recepción autorizada y validadores | Escritura transaccional con caja; estado en lista cerrada; D/corrección auditados | Quién corrige/rechaza y ciclo de vida de comprobantes: `[NO DATA]` |
| 51 | `tareas` | CRUD anon — CONFIRMADO | Tareas, Mantenimiento, turno, validación | Autor/origen, departamento destino, responsables de ambos ámbitos, admin/adjunto | Alta con autor/origen derivados; transición backend con estado previo; D sólo admin/adjunto | Reapertura y corrección tras cierre: `[NO DATA]` |

## Comprobaciones obligatorias para cada policy futura

Para cada fila deberán existir pruebas que verifiquen como mínimo:

- `anon` recibe 401/403 en `S/I/U/D`;
- sesión inexistente, temporal, inactiva o con versión obsoleta no obtiene
  contexto ni acceso;
- empleado propio frente a empleado ajeno;
- responsable dentro y fuera de su departamento efectivo;
- casos cruzados de Recepción SYNCROLAB, Entrenadores y Fisioterapia/Clínica;
- contable limitado a los recursos financieros expresamente autorizados;
- mutación con actor, departamento, estado o importes manipulados;
- transición válida frente a estado previo incorrecto o versión concurrente;
- borrado autorizado frente a borrado fuera de ámbito;
- columnas sensibles de `employees` ausentes en directorios y respuestas
  operativas;
- cardinalidad exacta y efecto persistido, no sólo respuesta HTTP exitosa.

## Bloqueos reales antes de convertir la matriz en SQL

Las decisiones `[NO DATA]` no tienen todas la misma prioridad. Antes del corte
P0 es imprescindible resolver, como mínimo:

1. quién propone, aprueba, publica, reabre y rectifica cuadrantes, informes,
   cajas, incentivos y liquidaciones;
2. si los borrados sensibles son físicos o anulaciones auditadas;
3. qué información financiera puede leer `contable`, cada empleado y cada
   responsable departamental;
4. qué tablas sin consumidor se conservan bloqueadas, se archivan o se retiran;
5. retención y acceso de auditoría, Bitrix, POSMEWS, notas y adjuntos;
6. reglas de corrección y duplicado excepcional para cajas SYNCROLAB.

Hasta resolverlas, sí se pueden preparar fixtures y pruebas negativas locales,
pero no una migración LIVE segura y completa.
