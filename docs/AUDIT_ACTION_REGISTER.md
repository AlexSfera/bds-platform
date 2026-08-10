# SYNCRO SHIFT — AUDIT ACTION REGISTER

## Propósito

Este documento es el registro maestro de hallazgos técnicos, riesgos,
errores confirmados y acciones de rectificación identificados durante la
auditoría de SYNCRO SHIFT.

Su objetivo es garantizar que ningún problema detectado durante la auditoría
se pierda antes de comenzar modificaciones de código.

Este documento es dinámico y debe actualizarse continuamente durante la
auditoría, la planificación, la corrección y la verificación.

Los documentos individuales de `docs/04-development/issues/` podrán contener
investigaciones detalladas, pero este archivo seguirá siendo el listado maestro
y la referencia de estado.

---

## Reglas de mantenimiento

1. No registrar hipótesis como errores confirmados.
2. Verificar cada hallazgo contra el código real, Supabase LIVE o evidencia
   técnica equivalente.
3. Utilizar `[NO DATA]` cuando no exista evidencia suficiente o la información
   aún no haya sido obtenida.
4. No eliminar ningún problema confirmado. Cuando cambie su situación, se
   actualizarán su estado, evidencia y acción requerida.
5. Cambiar el estado a `CORREGIDO` únicamente cuando la modificación se haya
   realizado.
6. Cambiar el estado a `VERIFICADO` únicamente después de probar y validar la
   corrección.
7. Incluir evidencia reproducible para cada problema confirmado.
8. Distinguir entre:
   - el hecho técnico demostrado;
   - el riesgo derivado pendiente de comprobar;
   - la solución propuesta, que no constituye todavía una decisión aprobada.
9. No modificar código únicamente porque un problema figure aquí. La corrección
   debe ejecutarse dentro del plan de auditoría y después de comprender el módulo
   afectado, salvo una excepción P0 que requiera intervención inmediata.
10. Priorizar la estabilidad sobre la velocidad.
11. Actualizar el historial cuando se añada un hallazgo, cambie un estado, se
    apruebe una rectificación o se verifique una corrección.
12. No sustituir evidencia LIVE por documentación. Si ambas discrepan, prevalece
    el comportamiento verificado en el código y los sistemas reales.

---

## Estados

| Estado | Significado |
|---|---|
| `DETECTADO` | Existe un indicio que requiere investigación. |
| `INVESTIGANDO` | La auditoría técnica está en curso y todavía no existe una conclusión completa. |
| `CONFIRMADO` | El hecho o problema ha sido demostrado mediante evidencia reproducible. |
| `PLANIFICADO` | La solución ha sido definida y aprobada, pero todavía no se ha ejecutado. |
| `CORREGIDO` | La modificación se ha realizado, pero aún falta su validación final. |
| `VERIFICADO` | La corrección ha sido probada y validada. |
| `DEFERRED` | Existe una decisión explícita y documentada de no corregir por el momento. |

`[NO DATA]` no es un estado: es el marcador obligatorio para un dato o una
evidencia que todavía no está disponible.

---

## Prioridades

### P0 — Crítico

Puede provocar pérdida o corrupción de datos, un fallo grave de seguridad, el
bloqueo del sistema, una modificación incorrecta masiva o una regresión crítica.

Debe investigarse de inmediato. Si se confirma, debe resolverse antes de
continuar desarrollo relevante.

### P1 — Alto

Puede provocar comportamiento incorrecto, inconsistencias de datos, errores
operativos frecuentes o fallos difíciles de detectar.

Debe resolverse antes de ampliar el módulo afectado.

### P2 — Medio

Problema técnico real con impacto operativo limitado. Debe incluirse en el plan
de estabilización.

### P3 — Bajo

Deuda técnica, limpieza o mejora estructural sin impacto inmediato demostrado.

---

## Registro maestro de hallazgos

| ID | Área | Prioridad | Estado | Problema o riesgo | Evidencia actual | Acción requerida |
|---|---|---:|---|---|---|---|
| ARCH-001 | Arquitectura / Adjuntos | P1 | CONFIRMADO | `adjuntos.js` se carga dos veces en `index.html`, provocando doble ejecución de wrappers, `MutationObserver` e inicialización. | `index.html` e investigación `docs/04-development/issues/ARCH-001.md`. | Eliminar la carga duplicada únicamente después de finalizar la auditoría de dependencias de `adjuntos.js`. |
| ARCH-002 | Arquitectura / Despliegue Bitrix | P1 | CONFIRMADO | Existen dos copias divergentes y versionadas de la función Bitrix. `bitrix-sync.js` raíz contiene v4, pero la ruta Vercel `/api/bitrix-sync` ejecuta `api/bitrix-sync.js`, que sigue en v3; el archivo raíz no tiene consumidor ni ruta de despliegue detectados. La documentación, en cambio, afirma que `api/bitrix-sync.js` ya es v4 y advierte expresamente que la versión nueva debe copiarse a `api/`. | `git diff --no-index --stat` muestra 178 líneas de diferencia (167 altas, 11 bajas); `api/bitrix-sync.js:549` responde `v3-asociacion-autocreate`, mientras `bitrix-sync.js:702-706` responde `v4-turno-auto-spec22`. `vercel.json:13-17` programa `/api/bitrix-sync`; `docs/context/23_feat_turno_auto_implementacion.md:13,63-68,105,123` declara v4. Despliegue y versión que responde LIVE: `[NO DATA]`. | Elegir una única fuente de verdad, revisar y probar la lógica v4 fuera de LIVE y sólo después sustituir la función desplegable mediante un cambio de código aprobado; eliminar o generar la copia secundaria para impedir nueva divergencia. |
| UI-001 | Interfaz / Modal compartido | P1 | CONFIRMADO | `openItemModal()` utiliza operadores `-` en lugar de `+` al construir varios fragmentos HTML; la resta de cadenas produce `NaN` y omite contenido del modal de gestiones e incidencias. | Verificación literal mediante `sed -n '4350,4420l' shared.js`: los operadores `-` aparecen en el bloque que construye detalles, acción previa, comentarios y textarea. | Corregir las concatenaciones únicamente en la fase aprobada; validar después ambos tipos de modal, con y sin histórico, acción previa y permiso de edición. |
| UI-002 | Interfaz / Fotos de caja | P1 | CONFIRMADO | Los selectores de fotos de cierre SYNCROLAB y comprobante de liquidación invocan `handleCajaFotosInput()`, pero esa función y los helpers `resetCajaFotos()` y `getCajaFotosUrls()` no existen en el código cargado. Seleccionar un archivo lanza un `ReferenceError`; los guardados usan el fallback de array vacío y no persisten esas fotos. | Búsqueda global en el repositorio: sólo existen llamadas en `syncrolab.js:480-510,596,720`, `recepcion.js:503,799` y `mi_rendimiento.js:794-830`; no existe definición. `index.html:2537-2563` carga todos los scripts locales y ninguno aporta esos helpers. Fallos observados por usuarios: `[NO DATA]`. | Implementar un único componente de fotos con estados de carga/error, resultado persistido y limpieza compensatoria; probar selección, cancelación, edición, error de red y reapertura antes de habilitarlo. |
| UI-003 | Interfaz / Validación Hypoxic | P1 | CONFIRMADO | La tabla de Validación muestra botones de rectificación y eliminación de incidencias Hypoxic, pero invoca `editHypoxicItem()` y `deleteHypoxicItem()`, funciones que no existen en ninguno de los scripts cargados. Pulsarlos produce un `ReferenceError` y no ejecuta la acción. | `validacion.js:616-676`; búsqueda global sólo localiza esas dos llamadas y ninguna definición. El módulo está cargado por `index.html:2541`. Fallos observados por usuarios: `[NO DATA]`. | Definir primero si rectificación y borrado deben existir y quién puede ejecutarlos; después implementar comandos autorizados y auditados o retirar los botones, con pruebas de rol, estado y resultado. |
| SUP-001 | Supabase / Core | P1 | CONFIRMADO | La invalidación de caché después de escrituras es manual y está distribuida entre módulos. | `shared.js`: `dbInsert()`, `dbUpdate()` y `dbDelete()` no llaman a `invalidateCache()`. | Diseñar una estrategia central de invalidación después de finalizar la auditoría de consumidores. |
| SUP-002 | Supabase / Core | P1 | CONFIRMADO | Existen múltiples vías de acceso a Supabase: `sbRequest()`, funciones `db*` y llamadas `fetch()` directas. | Auditoría global de archivos `.js`. | Definir un contrato único o reglas estrictas de acceso a Supabase. |
| SUP-003 | Supabase / Errores | P1 | CONFIRMADO | `sbRequest()` devuelve `null` ante errores HTTP en lugar de lanzar una excepción. | `shared.js:11-33`. | Definir un contrato consistente de errores y revisar sus consumidores. |
| SUP-004 | Supabase / Fetch directo | P1 | CONFIRMADO | Algunas escrituras mediante `fetch()` no comprueban `res.ok`; una respuesta HTTP 4xx/5xx puede no entrar en `catch`. | Verificado en diferentes módulos durante la auditoría. | Inventariar todas las escrituras directas y corregir el manejo de respuestas. |
| SUP-005 | Supabase / Caché | P2 | CONFIRMADO | `getDB()` mantiene datos en memoria durante 30 segundos. | `CACHE_TTL = 30000` en `shared.js`. | Evaluar por módulo los riesgos de datos obsoletos y concurrencia. |
| SUP-006 | Supabase / Código sin consumidores | P3 | CONFIRMADO | `dbUpsert()` está definida, pero no tiene consumidores activos detectados en el código JavaScript actual. Su semántica no afecta actualmente a ningún flujo operativo demostrado. | Búsqueda global de `dbUpsert(` en archivos `.js`: solo aparece su definición en `shared.js:58`. | Mantenerla sin cambios durante la auditoría; decidir posteriormente si debe eliminarse, documentarse o implementarse con semántica explícita antes de reutilizarla. |
| SUP-007 | Supabase / Código sin consumidores | P3 | CONFIRMADO | `setDB()` está definida, pero no tiene consumidores activos; el comentario que vinculaba su uso con la importación de backups está obsoleto. | Búsqueda global de `setDB(` en archivos `.js`: solo aparecen su definición en `shared.js:96` y un comentario en `shared.js:4152` que confirma su sustitución por `dbUpdate()`. | Corregir la documentación interna durante la estabilización y decidir después si la función debe conservarse o eliminarse. |
| SUP-008 | Supabase / Importación backup | P1 | CONFIRMADO | `importBackup()` puede continuar y comunicar una importación completada aunque alguna escritura reciba una respuesta HTTP de error, porque utiliza `dbInsert()` y `sbRequest()` convierte los errores HTTP en `null` sin lanzar una excepción. | Flujo verificado en `shared.js`: `importBackup()` → `dbInsert()` → `sbRequest()`; acceso visible a Exportar confirmado en `getScreens()` para `admin`, `adjunto` y `adjunto_directivo`. La autorización efectiva en Supabase permanece `[NO DATA]`. | Diseñar una importación con validación explícita de cada escritura, interrupción segura, resumen de errores y comprobación posterior; contrastar sus permisos con RLS/policies LIVE antes de modificar código. |
| SUP-009 | Supabase / Concurrencia | P2 | CONFIRMADO | `registrarLecturaGestion()` implementa una actualización no atómica de `leido_por`: lee el array, lo modifica localmente y reemplaza el valor completo mediante `PATCH`. Dos aperturas simultáneas pueden sobrescribirse entre sí. | `shared.js:4436-4454` y consumidor en `openItemModal()` (`shared.js:4600-4602`): se fuerza lectura fresca, pero no existe control de versión, operación atómica ni RPC; ocurrencias reales de pérdida en LIVE: `[NO DATA]`. | Diseñar una operación atómica o con control de concurrencia y crear una prueba simultánea reproducible antes de corregir. |
| SUP-010 | Supabase / Excepciones de red | P2 | CONFIRMADO | Diversas escrituras directas comprueban el resultado HTTP, pero no capturan excepciones de `fetch()`. Un fallo de red rechaza la promesa y omite el mensaje de error previsto, la invalidación de caché y la actualización posterior de la interfaz. | Flujo legacy de `shared.js` en reset/edición/estado de empleados y en `employee_ips`, notas y ajustes (`shared.js:3737-3766,5211-5271,5423-5473`); `caja.js:1628-1685` en eliminar/reabrir cierre; `incentivos.js:979-1045` en la importación y `incentivos.js:1134-1173` en edición/activación de reglas; `mantenimiento.js:250-305` en planificación/cierre/reapertura; `tareas.js:94-124,139-163,288-309` en alta y transición; `validacion.js:37-55,345-455,1132-1191,1851-1922,2277-2294` en borrados y transiciones; todas las escrituras activas de `housekeeping.js`, `hypoxic.js:210-349` y las transiciones de `fio.js:625-769,936-964`. Los guardados principales de caja, el alta FIO, el borrado de Mantenimiento y `deleteTask()` sí usan `try/catch`. | Unificar el contrato de errores de escritura y garantizar feedback explícito y estado de interfaz coherente también ante rechazo de red. |
| SUP-011 | Supabase Storage / Consistencia | P1 | CONFIRMADO | La subida y eliminación de adjuntos no coordinan el objeto de Storage con el array de metadatos del registro. `adjuntoSaveToRecord()` ignora el resultado potencialmente `null` de `dbUpdate()`; `adjuntoRemoveFromRecord()` ignora el booleano de `adjuntoRemove()`. Ambos flujos pueden registrar auditoría y mostrar éxito con objeto huérfano, referencia rota o metadato no persistido. | `adjuntos.js:63-150`: upload comprueba HTTP y lanza, pero el `PATCH` posterior hereda el contrato silencioso de `sbRequest()`; DELETE devuelve `res.ok`, que su consumidor no comprueba. Efectos reales en LIVE: `[NO DATA]`. | Diseñar una operación compensable con verificación de ambas fases, feedback fiel, auditoría solo tras éxito completo y reconciliación de objetos/metadatos huérfanos. |
| SUP-012 | Supabase / Concurrencia de adjuntos | P2 | CONFIRMADO | `adjuntoUploadBatch()` y `adjuntoRemoveFromRecord()` leen el array completo `adjuntos`, lo modifican localmente y lo reemplazan mediante `PATCH`; operaciones simultáneas sobre un registro pueden sobrescribirse y perder referencias. | `adjuntos.js:104-150`; no existe control de versión, RPC atómica ni precondición. Incidencia efectiva en LIVE: `[NO DATA]`. | Diseñar actualización atómica o control optimista y una prueba concurrente para altas y bajas de adjuntos. |
| SUP-013 | Supabase / Caja / Resultado | P1 | CONFIRMADO | `validarCierre()` ignora el resultado potencialmente `null` de `dbUpdate()` y siempre invalida caché, muestra éxito y refresca la lista; además `eliminarCierreCaja()` registra en pasado que el cierre fue eliminado antes de conocer el resultado del `DELETE`. | `caja.js:1142-1159` y `caja.js:1627-1642`; `dbUpdate()` hereda el contrato silencioso de `sbRequest()`. Una respuesta HTTP fallida puede producir confirmación o auditoría incorrectas. Incidencia real LIVE: `[NO DATA]`. | Comprobar el resultado de cada fase, registrar intento y resultado por separado y no mostrar éxito ni invalidar caché hasta confirmar la escritura. |
| SUP-014 | Supabase / Dashboard / Cuadrantes | P1 | CONFIRMADO | El flujo “Guardar cuadrante” no puede persistir con la identidad técnica actual: el frontend envía un `POST` a `cuadrantes`, pero LIVE tiene RLS activado y ninguna policy para esa tabla. El botón se presenta a todos los roles que pueden abrir el dashboard, sin distinguir quién debería poder aprobar o guardar por departamento. | `dashboard.js:22-43`, `dashboard.js:1324-1453` y botón en `dashboard.js:1509`; la escritura comprueba `res.ok`, captura excepciones, invalida caché sólo tras éxito y comunica el error. Catálogo LIVE ya verificado en `SEC-001`: `cuadrantes` está entre las cinco tablas bloqueadas. Incidencia operativa observada: `[NO DATA]`. | Definir la regla empresarial de creación/aprobación por rol y departamento dentro de la matriz asociada a `SEC-007`, `SEC-009` y `SEC-010`; habilitar la operación únicamente mediante identidad confiable y policy/backend probado fuera de LIVE. |
| SUP-015 | Supabase / Código sin consumidores / Faults | P3 | CONFIRMADO | Las escrituras de `faults.js` tienen contratos de error inseguros, pero no participan en el runtime actual: altas, validación y cierre ignoran el posible `null` de `dbInsert()`/`dbUpdate()`; el borrado ignora `res.ok`, silencia excepciones y siempre comunica éxito. | `faults.js:278-487`; búsqueda global confirma que `index.html` no carga `faults.js`, no existe `screen-faults` y ninguna función del archivo tiene consumidor externo. `docs/context/mapa-modulos.md:170-171` ya lo clasifica como reemplazado por FIO. Existencia actual de `employee_faults` y `fault_catalog` en LIVE: `[NO DATA]`. | Mantenerlo fuera del runtime. Antes de reactivarlo, decidir si debe eliminarse o reemplazarse definitivamente y, si se conserva, rehacer manejo de resultados, auditoría, autorización por ámbito y concurrencia; no diseñar policies para tablas huérfanas sin una decisión funcional. |
| SUP-016 | Supabase / Incentivos Cocina | P1 | CONFIRMADO | `_incGuardarCocina()` puede mostrar “Datos guardados” aunque el `PATCH` o `POST` haya fallado; además decide entre insertar y actualizar mediante una lectura previa no atómica. En LIVE el fallo HTTP es sistemático porque `cocina_costes_mes` está bloqueada por RLS sin policies. | `incentivos.js:535-568`: no comprueba `res.ok` del `PATCH` ni el resultado de `sbRequest()` en el alta, invalida caché y comunica éxito en ambos casos; la captura sólo cubre promesas rechazadas. `SEC-001` confirma el bloqueo LIVE. Incidencia operativa observada: `[NO DATA]`. | No habilitar la tabla sólo para hacer funcionar la pantalla. Definir permiso y unicidad por mes, usar una operación atómica con resultado verificable y probar respuestas HTTP, concurrencia e invalidación fuera de LIVE. |
| SUP-017 | Supabase / Incentivos / Importación | P1 | CONFIRMADO | `incImportarExcel()` reemplaza las ventas mensuales de cada empleado mediante `DELETE` seguido de varios `POST` independientes. Ignora el resultado del borrado y permite que un fallo intermedio deje datos antiguos duplicados, datos parcialmente insertados o un mes parcialmente borrado, mientras el resumen y la auditoría sólo reflejan el contador de altas exitosas. | `incentivos.js:979-1045`; `sbRequest()` convierte errores HTTP en `null`, no existe transacción, rollback ni exclusión de importaciones concurrentes. La caché se invalida sólo al terminar. Efecto real LIVE: `[NO DATA]`. | Sustituir el reemplazo destructivo por una importación transaccional e idempotente, con validación previa completa, clave de periodo/empleado, resumen exacto, bloqueo de concurrencia y auditoría del resultado final. |
| SUP-018 | Supabase / Incentivos / Liquidación | P1 | CONFIRMADO | La liquidación mensual es una operación de dos fases no atómica: crea la liquidación y después marca FIO individualmente, pero no comprueba ningún `res.ok` de esos `PATCH`; puede confirmar y auditar la liquidación con cero o sólo parte de los FIO saldados. Los importes llegan calculados desde parámetros del cliente y no se recalculan contra datos persistidos. | `incentivos.js:1181-1274`; el alta inicial sí comprueba el resultado, pero `incentivos_liquidaciones` está actualmente bloqueada por RLS y no puede superar esa fase con `anon`. No se invalida la caché de `fio`. Efecto real LIVE y concurrencia observada: `[NO DATA]`. | Implementar una operación backend/RPC transaccional que revalide actor y objetivo, recalcule importes, impida duplicados por empleado/mes, actualice todos los FIO y devuelva un resultado único; probar rollback, repetición y concurrencia fuera de LIVE. |
| SUP-019 | Supabase / Informes / Reemplazos | P1 | CONFIRMADO | Tres guardados de informes implementan reemplazos no atómicos mediante borrado previo y alta posterior. Los borrados no comprueban resultado; un fallo puede duplicar datos, y un alta fallida después de un borrado exitoso puede eliminar la versión anterior sin sustitución. Importaciones concurrentes del mismo periodo pueden sobrescribirse. | `informes.js:413-430` para control semanal, `informes.js:831-868` para producción de Sala y `informes.js:1997-2064` para incentivos de Entrenadores. El control semanal además no es esperado por sus consumidores y comunica “validado” con estado sólo local aunque la persistencia falle. Efectos reales LIVE: `[NO DATA]`. | Reemplazar los tres pseudo-upsert por operaciones transaccionales e idempotentes con clave de periodo, resultado único y control de concurrencia; no borrar la versión previa hasta validar por completo la nueva. |
| SUP-020 | Supabase / Informes / Borrado compuesto | P1 | CONFIRMADO | `_infDeleteSemana()` presenta como completado un borrado compuesto aunque sólo verifica el `DELETE` de `sala_produccion_semanal`; ignora los resultados de `sala_informes_control`, archivos y batches POSMEWS, y registra “Eliminado” antes de empezar. Puede quedar un periodo parcialmente borrado con auditoría y feedback incorrectos. | `informes.js:871-912`; existe comprobación `admin`, captura de excepciones e invalidación de las cuatro cachés, pero tres grupos de respuestas HTTP no se comprueban. Incidencia real LIVE: `[NO DATA]`. | Ejecutar el borrado como operación coordinada, verificar cada dependencia, registrar intento y resultado, y devolver un resumen fiel; evaluar transacción o job compensable antes de permitirlo. |
| SUP-021 | Supabase / Informes de jefe / Consistencia | P1 | CONFIRMADO | Publicar un informe intenta crear primero varias filas de `employee_status` y después guardar `dept_reports`, sin comprobar los resultados de estado ni coordinar rollback. Al habilitarse podría guardar sólo una de las dos partes o un subconjunto de empleados. Actualmente el informe no puede guardarse porque ambas tablas están bloqueadas por RLS sin policies. | `informes.js:1237-1305` y publicación separada en `informes.js:1392-1403`; el `PATCH`/`POST` de `dept_reports` sí comprueba `res.ok`, pero cada alta de `employee_status` se ignora. `SEC-001` confirma el bloqueo LIVE de ambas tablas. Incidencia operativa observada: `[NO DATA]`. | Separar o coordinar explícitamente informe y estado laboral, definir deduplicación/edición de periodos, verificar cada resultado y diseñar permisos y rollback antes de habilitar policies. |
| SUP-022 | Supabase / Informes / Configuración Entrenadores | P1 | CONFIRMADO | `_infEntrConfigGuardar()` actualiza las fichas de entrenadores una a una, ignora el posible `null` de cada `sbRequest('PATCH')` y siempre invalida, audita y comunica “Configuración guardada” si no hubo excepción de red. Una respuesta HTTP fallida o un fallo parcial queda presentado como éxito. | `informes.js:2153-2194`; la escritura afecta campos financieros de `employees` (`inc_metodo`, umbral, precio/hora y base neta). Resultado efectivo e incidencias LIVE: `[NO DATA]`. | Trasladar la operación a backend autorizado, validar todo el lote antes de escribir, comprobar el resultado completo, impedir parcialidad y no auditar éxito hasta releer y verificar los valores persistidos. |
| SUP-023 | Supabase / Mantenimiento / Resultado | P1 | CONFIRMADO | Planificar, cerrar y reabrir una tarea de Mantenimiento ignora el posible `null` de `dbUpdate()` y después invalida caché, registra auditoría, muestra éxito y refresca el tablero. Una respuesta HTTP fallida puede dejar el dato sin modificar mientras la interfaz comunica la transición como realizada. | `mantenimiento.js:250-305`; las tres funciones revalidan usuario, fila y departamento. `_mantDeleteTask()` en `mantenimiento.js:308-326` sí comprueba `res.ok`, captura excepciones e invalida sólo tras éxito, aunque su auditoría en pasado precede al borrado. Incidencia real LIVE: `[NO DATA]`. | Exigir resultado confirmado antes de cache, auditoría y feedback; registrar intento y resultado del borrado por separado y capturar también rechazos de red en los tres `PATCH`. |
| SUP-024 | Supabase / Mantenimiento / Concurrencia | P2 | CONFIRMADO | Las transiciones de planificación, cierre y reapertura leen el estado desde caché y actualizan únicamente por `id`, sin condicionar el `PATCH` al estado o versión anterior. Dos responsables pueden mover, cerrar o reabrir simultáneamente la misma tarea y la última escritura sobrescribe la anterior. | `mantenimiento.js:216-305`; `getDB('tareas')` puede servir datos hasta 30 segundos y no existe versión, `updated_at` como precondición ni RPC de transición. Colisiones reales LIVE: `[NO DATA]`. | Implementar control optimista o transición atómica con estado anterior permitido; devolver conflicto explícito, refrescar la fila y probar operaciones simultáneas. |
| SUP-025 | Supabase / Merma / Resultado | P1 | CONFIRMADO | `saveMerma()` ignora el posible `null` de `dbInsert()` y después invalida caché, audita, muestra el coste como registrado y cierra el modal. Una respuesta HTTP fallida se presenta como alta exitosa; sólo una excepción de red entra en `catch`. | `merma.js:493-565`, consumidor activo desde la pantalla y desde el flujo de turno. El fallback legacy `shared.js:5016-5054` sí comprueba el resultado, mientras `deleteMermaItem()` carece de consumidor activo y no comprueba su `dbDelete()`. Incidencias LIVE: `[NO DATA]`. | Comprobar el alta antes de cualquier efecto de éxito; verificar también el borrado si vuelve a exponerse y unificar ambos caminos para evitar contratos distintos. |
| SUP-026 | Supabase / Merma / Idempotencia | P2 | CONFIRMADO | El botón de guardar permanece habilitado durante la petición y cada invocación genera un `id` nuevo; un doble clic o reintento manual puede insertar dos mermas iguales sin clave de idempotencia ni deduplicación. | Modal en `merma.js:341-344` y flujo `saveMerma()` en `merma.js:493-565`; no existe estado “guardando”, bloqueo del botón ni token de operación. Duplicados reales LIVE: `[NO DATA]`. | Bloquear envíos simultáneos, usar una clave idempotente por operación y comprobar el resultado persistido antes de permitir reintento. |
| SUP-027 | Supabase / Mi Rendimiento / Liquidación Entrenadores | P1 | CONFIRMADO | La liquidación individual trata como éxito cualquier resultado distinto de `null`, sin verificar que el `PATCH` haya actualizado exactamente una fila. El filtro no exige `liquidado=false`; cero coincidencias se comunican como “Liquidado” y una repetición o concurrencia puede actualizar varias filas o sobrescribir fecha, actor y comprobantes de una liquidación previa. | `mi_rendimiento.js:784-852`; la función revalida `canActAsAdmin`, captura excepciones, comprueba fallo HTTP e invalida caché tras respuesta exitosa, pero no verifica cardinalidad ni estado anterior. Duplicados y repeticiones reales LIVE: `[NO DATA]`. | Exigir identidad única empleado/mes, transición atómica `pendiente → liquidado`, una sola fila devuelta y conflicto explícito si ya estaba liquidada o no existe; impedir sobrescritura de comprobantes sin un flujo de rectificación auditado. |
| SUP-028 | Supabase / Recepción / Resultado de caja | P1 | CONFIRMADO | Cierre, traspaso, reapertura, eliminación y validación de caja/turno pueden comunicar y auditar éxito aunque `dbInsert()`, `dbUpdate()` o `dbDelete()` devuelvan `null`. La conciliación de cargos SYNCROLAB ignora directamente `res.ok`. El guardado principal incluso reintenta sin adjuntos, pero tampoco valida el resultado final. | `recepcion.js:664-842`, `recepcion.js:982-1038`, `recepcion.js:1724-1850` y `recepcion.js:1886-2038`. Hay captura de excepciones e invalidación posterior, pero los errores HTTP silenciosos atraviesan el flujo. Incidencias reales LIVE: `[NO DATA]`. | Verificar cada escritura y cardinalidad antes de auditoría, feedback, cierre de modal o logout; unificar el contrato de caja y no usar la eliminación de adjuntos como retry genérico sin distinguir el error de esquema. |
| SUP-029 | Supabase / Recepción / Ventas cross-sell | P1 | CONFIRMADO | `_saveRecepcionVentas()` inserta cada venta de forma independiente. Comunica cuántas fallaron, pero no revierte las ya insertadas, no evita reinsertar el mismo turno y el flujo padre continúa hacia caja aunque el lote quede parcial; un reintento genera nuevos IDs y puede duplicar ventas que alimentan incentivos. | `recepcion.js:449-479` y `recepcion.js:1057-1129`; cada resultado se comprueba, excepciones se cuentan, la caché se invalida y la auditoría refleja el número exitoso. Atomicidad, unicidad por venta e incidencias LIVE: `[NO DATA]`. | Persistir turno y ventas mediante una operación idempotente y transaccional o compensable, con clave de origen por línea, resultado total y decisión explícita de si un lote parcial permite continuar el cierre. |
| SUP-030 | Supabase / Recepción / Concurrencia de caja | P1 | CONFIRMADO | La regla “una operación por turno y día” se comprueba con una lectura cacheada antes del alta, sin restricción atómica en la escritura; dos recepcionistas pueden superar simultáneamente el control y crear cierres/traspasos duplicados. Reapertura, validación y marcado de error actualizan sólo por `id`, sin estado anterior, por lo que transiciones concurrentes se sobrescriben. | `recepcion.js:727-742`, `recepcion.js:1353-1411`, `recepcion.js:1757-1784` y `recepcion.js:1912-2038`; `getDB()` admite hasta 30 segundos de caché. Restricciones únicas LIVE y colisiones observadas: `[NO DATA]`. | Definir unicidad operativa y transiciones permitidas en base/backend, usar precondición de estado/versión y devolver conflicto al segundo actor; probar altas y validaciones simultáneas fuera de LIVE. |
| SUP-031 | Supabase / SYNCROLAB / Guardado compuesto | P1 | CONFIRMADO | El cierre o traspaso y sus cargos a habitación se guardan como peticiones independientes sin transacción. `_labSaveCharges()` no comprueba `res.ok`, por lo que uno o todos los cargos pueden fallar por HTTP y aun así se registra auditoría, se cierra el turno y se muestra éxito. Si una excepción de red ocurre tras algunas altas, queda un lote parcial; al editar una caja, las modificaciones de cargos no se guardan en absoluto. | `syncrolab.js:130-148`, `syncrolab.js:405-456` y `syncrolab.js:555-613`. El registro principal sí comprueba HTTP, captura excepciones en el consumidor e invalida su caché; los cargos sólo se intentan durante el alta. Incidencias reales LIVE: `[NO DATA]`. | Persistir caja, cargos y cierre de turno mediante una operación transaccional e idempotente; comprobar el resultado y cardinalidad del conjunto antes de auditar, cerrar modal, comunicar éxito o cerrar sesión, e incluir un flujo explícito de edición de cargos. |
| SUP-032 | Supabase / SYNCROLAB / Relación de cargos | P1 | CONFIRMADO | Los cargos se escriben con la FK `syncrolab_cash_id`, pero los lectores de SYNCROLAB y Validación buscan `syncrolab_cash_closure_id` o `cash_closure_id`. Por ello los cargos creados por el flujo activo no vuelven a asociarse a su caja al editarla ni aparecen vinculados en la validación. | Escritura en `syncrolab.js:130-145`; lecturas en `syncrolab.js:371-375,513-517` y `validacion.js:934-963`. La documentación de esquema identifica `syncrolab_cash_id` como FK real en `docs/context/10_caja_all.md:212-218` y `docs/context/esquema-supabase.md:50`. Número de cargos afectados actualmente en LIVE: `[NO DATA]`. | Unificar el contrato de la FK, comprobar mediante consulta de solo lectura cuántos cargos quedan sin vincular en la interfaz y añadir una prueba de alta → reapertura → validación antes de corregir datos LIVE. |
| SUP-033 | Supabase / SYNCROLAB / Concurrencia | P1 | CONFIRMADO | La regla de una operación por fecha y turno es un `SELECT` seguido de un `POST`, sin garantía atómica; dos usuarios no administradores pueden superar la comprobación a la vez. Las ediciones sustituyen la fila por `id` sin versión ni estado anterior, y un reintento tras un guardado compuesto parcial genera un nuevo ID, permitiendo duplicados y sobrescrituras. | `syncrolab.js:173-178`, `syncrolab.js:252-275`, `syncrolab.js:405-456` y `syncrolab.js:555-613`. El flujo permite además duplicar deliberadamente a `admin`; restricciones únicas LIVE, duplicados existentes e incidencias concurrentes: `[NO DATA]`. | Definir con negocio si `admin` necesita una excepción auditada; imponer unicidad e idempotencia en base/backend, precondición de versión/estado para ediciones y conflicto explícito para el segundo actor. |
| SUP-034 | Supabase Storage / SYNCROLAB / Ciclo de vida | P2 | CONFIRMADO | La foto de cada cargo se sube a Storage antes de guardar la caja. Quitar la foto, borrar la línea, cancelar el modal o fallar después sólo elimina la URL local y nunca borra el objeto, por lo que pueden quedar archivos huérfanos; la aplicación construye además una URL pública directamente. | `syncrolab.js:48-55,69,93-120` y guardado posterior en `syncrolab.js:130-148`. La subida sí valida tipo/tamaño en cliente, comprueba `res.ok`, captura excepciones y muestra error. Configuración, policies, exposición efectiva y objetos huérfanos del bucket LIVE `syncrolab`: `[NO DATA]`. | Auditar el bucket LIVE de solo lectura y diseñar carga privada/temporal con confirmación o limpieza compensatoria, límites server-side y URLs firmadas; no borrar objetos existentes sin reconciliación aprobada. |
| SUP-035 | Supabase / Tareas / Resultado | P1 | CONFIRMADO | `advanceTask()` ignora el resultado potencialmente `null` de `dbUpdate()` y siempre invalida caché, registra la transición y muestra éxito. Una respuesta HTTP fallida puede dejar la tarea sin cambiar mientras la interfaz y la auditoría afirman lo contrario. | `tareas.js:288-309`; `dbUpdate()` hereda el contrato silencioso de `sbRequest()`. El alta sí comprueba el resultado de `dbInsert()` y el borrado comprueba `res.ok`; incidencias reales LIVE: `[NO DATA]`. | Exigir una fila actualizada y comprobar el resultado antes de auditoría, feedback o refresco; capturar también excepciones de red y mostrar el estado recuperado desde base. |
| SUP-036 | Supabase / Tareas / Concurrencia | P1 | CONFIRMADO | Las transiciones se autorizan contra una copia potencialmente cacheada y actualizan sólo por `id`, sin exigir el estado anterior. Dos actores pueden cerrar, validar o reabrir simultáneamente y el último `PATCH` sobrescribe al anterior, con marcas de autor y auditorías incompatibles. | `tareas.js:288-309`; `getDB()` admite hasta 30 segundos de caché, y no existe precondición de estado/versión ni operación atómica en el flujo. Transiciones concurrentes observadas en LIVE: `[NO DATA]`. | Modelar transiciones permitidas en backend, actualizar con precondición de estado/versión, derivar actor de la sesión y devolver conflicto cuando la fila cambió. |
| SUP-037 | Supabase / Validación / Borrado de turno | P1 | CONFIRMADO | `deleteShift()` elimina merma, ajustes, incidencias, ventas y finalmente el turno mediante una serie no transaccional de `DELETE`. Ignora todos los resultados potencialmente `null`; un fallo intermedio deja un borrado parcial y aun así registra “deleted”, muestra éxito y refresca. | `validacion.js:37-55`; cada `dbDelete()` hereda el contrato silencioso de `sbRequest()`. La función sí revalida `admin` y solicita confirmación. Restricciones FK, cascadas e incidencias reales LIVE: `[NO DATA]`. | Sustituir el borrado compuesto por una operación transaccional server-side con resultado único, política explícita para cada relación y auditoría posterior al éxito; probar rollback y fallo intermedio fuera de LIVE. |
| SUP-038 | Supabase / Validación / Resultado de transiciones | P1 | CONFIRMADO | Validación y envío a corrección de cajas de Recepción y SYNCROLAB ignoran `res.ok`; notas posteriores, revalidación, reapertura de turno, marcado genérico de caja y validación de Sala ignoran el posible `null` de `dbUpdate()`. Todos pueden invalidar caché, auditar, cerrar modales y comunicar éxito sin cambio persistido. | `validacion.js:345-455`, `validacion.js:861-887`, `validacion.js:992-1024` y `validacion.js:1132-1175`. Hay captura de excepciones en los `PATCH` de Recepción/SYNCROLAB, pero no de errores HTTP; los helpers genéricos heredan `SUP-003`. Incidencias reales LIVE: `[NO DATA]`. | Exigir respuesta y cardinalidad de una fila en todas las transiciones; no auditar ni comunicar éxito hasta recuperar el estado persistido y unificar el contrato con precondiciones de estado. |
| SUP-039 | Supabase / Validación / FIO y merma | P1 | CONFIRMADO | “Registrar FIO + Validar” es una operación no atómica: no comprueba el resultado de `dbInsert('fio')` y después valida el turno. A su vez `doValidacion()` actualiza cada merma y el turno mediante escrituras independientes e ignora sus resultados. Puede existir turno validado sin FIO, valoración parcial de merma o FIO creado con turno no validado, mientras el flujo comunica éxito. | `validacion.js:1851-1904` y flujo activo `doValidacion()` en `shared.js:3201-3258`; `dbInsert()`/`dbUpdate()` convierten errores HTTP en `null`. Atomicidad e inconsistencias reales LIVE: `[NO DATA]`. | Crear una operación transaccional de validación que compruebe actor, turno, estado, costes y FIO, y que persista o revierta el conjunto completo; hacer el comando idempotente y devolver un resumen verificable. |
| SUP-040 | Supabase / Validación / Borrados y auditoría | P1 | CONFIRMADO | El borrado de caja SYNCROLAB registra la eliminación antes del `DELETE` e ignora `res.ok`; los dos consumidores de borrado FIO también registran antes y tratan como éxito el posible `null` de `dbDelete()`. Pueden dejar el registro intacto con auditoría y mensaje de eliminación. La caja puede tener cargos relacionados cuya política de cascada no se comprueba. | `validacion.js:1026-1040,2277-2294` y `fio.js:771-786`. Las funciones revalidan un rol administrativo y solicitan confirmación; cascada de `syncrolab_room_charges` y efectos LIVE: `[NO DATA]`. | Auditar sólo el resultado confirmado, exigir cardinalidad y definir borrado/restricción/cascada de cargos. Para FIO, valorar baja lógica o anulación auditada frente a eliminación física antes de corregir. |
| SUP-041 | Supabase / Validación / Concurrencia de estados | P1 | CONFIRMADO | Las transiciones de turno y de las tres cajas actualizan por `id` sin exigir estado anterior ni versión. Las decisiones se basan en datos previamente leídos —a veces cacheados—, por lo que validaciones, correcciones y reaperturas simultáneas se sobrescriben; `validarCierre()` puede incluso avanzar desde un estado ya cambiado por otro actor. | `validacion.js:345-455,861-887,992-1024,1132-1191` y `shared.js:3201-3258`; no existe condición por estado/versión. Colisiones observadas LIVE: `[NO DATA]`. | Definir máquinas de estado por entidad y ejecutar comandos atómicos con actor, estado previo y versión; devolver conflicto y refrescar al segundo actor. |
| SUP-042 | Supabase / Housekeeping / Resultado compuesto | P1 | CONFIRMADO | Varias operaciones de Housekeeping comunican y auditan éxito aunque una escritura HTTP haya fallado silenciosamente. Finalizar una asignación actualiza primero el catálogo del objeto y después la asignación sin comprobar resultados ni rollback; iniciar puede pausar otra asignación antes de fallar la nueva; crear una incidencia comprueba el alta pero ignora el enlace posterior; autogenerar ignora todas las altas; borrar audita antes e ignora el resultado. | `housekeeping.js:609-735,790-840,995-1043,1458-1465`; los helpers `db*` devuelven `null` ante error HTTP. Las altas unitarias de plan y ad-hoc y las asignaciones manuales sí comprueban su resultado. Inconsistencias reales LIVE: `[NO DATA]`. | Llevar cada conjunto a un comando backend transaccional o compensable, comprobar cardinalidad y no invalidar, auditar ni mostrar éxito hasta confirmar el resultado completo. |
| SUP-043 | Supabase / Housekeeping / Idempotencia y concurrencia | P1 | CONFIRMADO | Planes, autogeneración y asignaciones no tienen idempotencia ni precondiciones: una repetición puede crear varios planes para fecha/turno o duplicar zonas/habitaciones. Las transiciones leen asignaciones potencialmente cacheadas y actualizan sólo por `id`, de modo que dos actores pueden sobrescribir estados, tiempos y revisión. | `housekeeping.js:609-703,978-1043,1388-1455,1911-1932`; cada alta genera un ID nuevo y no existe clave única, versión o condición de estado anterior. Duplicados y carreras observados LIVE: `[NO DATA]`. | Definir unicidad de plan y asignación, claves idempotentes y máquina de estados; ejecutar transiciones con estado/versión anterior y devolver conflicto explícito al segundo actor. |
| SUP-044 | Supabase / Hypoxic / Transiciones y concurrencia | P1 | CONFIRMADO | Alta, avance y cierre comprueban el resultado HTTP indirecto y sólo comunican éxito tras una respuesta válida, pero las transiciones actualizan por `id` sin exigir estado previo. Una llamada directa puede mover una fila cerrada a “En proceso”, cerrar desde cualquier estado o sobrescribir una transición concurrente; el alta tampoco tiene idempotencia. | `hypoxic.js:210-278,313-349`; las tres funciones carecen además de captura de excepciones de red y quedan relacionadas con `SUP-010`. Incidencias duplicadas o transiciones perdidas en LIVE: `[NO DATA]`. | Implementar comandos de lista cerrada `Abierta → En proceso → Cerrada`, con actor, estado previo, versión e idempotencia; devolver conflicto y refrescar la fila persistida. |
| SUP-045 | Supabase / Fichaje / Importación y matching | P1 | CONFIRMADO | La importación de alertas escribe lotes independientes de 50 filas y después crea perfiles de empleados uno a uno. Si un lote falla, los anteriores quedan persistidos sin invalidación ni auditoría; un reintento genera nuevos IDs y duplica alertas. El matching sólo se ejecuta tras éxito total de alertas y también puede dejar un subconjunto de perfiles creado. | `fichaje.js:709-820`: cada lote comprueba el posible `null`, pero no existe transacción, idempotencia, rollback ni captura de excepciones de red. La “deduplicación” de `fichajePreview()` sólo agrupa la vista previa; no impide reimportar los mismos registros. Duplicados y lotes parciales LIVE: `[NO DATA]`. | Implementar una importación backend idempotente con huella de origen/periodo, validación completa previa, transacción o compensación y resumen exacto; separar el matching de cualquier alta automática de empleado. |
| SUP-046 | Supabase / FIO / Resultado comunicado | P1 | CONFIRMADO | Alta, validación, cierre, resolución de disputa y disputa del empleado ignoran el posible `null` de `dbInsert()`/`dbUpdate()`. Tras un error HTTP pueden invalidar caché, registrar auditoría, cerrar el modal y comunicar éxito sin que la fila exista o haya cambiado; la resolución de disputa muestra incluso el éxito antes de intentar el `PATCH`. | `fio.js:471-539,625-713,718-769,936-964`; los helpers convierten errores HTTP en `null`. Sólo el alta captura excepciones de red; las demás quedan además relacionadas con `SUP-010`. Incidencias reales LIVE: `[NO DATA]`. | Exigir exactamente una fila persistida antes de invalidar, auditar, cerrar o informar; mover el feedback de disputa después de la confirmación y recuperar el estado final desde base. |
| SUP-047 | Supabase / FIO / Concurrencia e idempotencia | P1 | CONFIRMADO | Validar FIO calcula la reincidencia contando una copia potencialmente cacheada y después actualiza sólo por `id`; dos validaciones simultáneas pueden asignar el mismo ordinal/puntuación. Validar, cerrar, resolver y disputar no incluyen estado previo ni versión en la escritura, por lo que decisiones concurrentes pueden sobrescribirse; el alta genera ID nuevo y no tiene clave idempotente. | `fio.js:503-527,625-688,697-760,936-958`; `getDB()` admite caché y ninguna escritura exige estado anterior, versión o unicidad de la incidencia. Colisiones, duplicados o puntuaciones incorrectas LIVE: `[NO DATA]`. | Ejecutar alta y transiciones como comandos backend idempotentes con máquina de estados, estado/versión previa y conflicto explícito; calcular y persistir la reincidencia dentro de la misma transacción con restricción adecuada. |
| SUP-048 | Supabase / Gestiones e incidencias / Resultado | P1 | CONFIRMADO | Las transiciones y cierres de `gestiones.js`, los caminos de Validación de incidencias, el modal compartido y los borrados del dashboard ignoran resultados `null` de los helpers. Pueden invalidar, auditar, cerrar el modal y mostrar éxito sin persistencia. Añadir comentario y cambiar/cerrar el padre son escrituras separadas: una puede quedar aplicada aunque falle la otra; varios borrados auditan antes de confirmar el `DELETE`. | `gestiones.js:35-142`, `incidencias.js:125-165`, `shared.js:4605-4752,4887-4921,5514-5542` y `dashboard.js:1291-1301`. `advanceIncident()` y los flujos de alta/cierre de `mi_turno.js:249-369` sí comprueban el resultado; los `try/catch` existentes sólo cubren excepciones, no el `null` HTTP. Incidencias reales LIVE: `[NO DATA]`. | Exigir una fila persistida y cardinalidad antes de caché, auditoría, cierre o éxito; convertir comentario más transición en comando transaccional/compensable y auditar borrados después de confirmarlos. |
| SUP-049 | Supabase / Gestiones e incidencias / Concurrencia | P1 | CONFIRMADO | Las transiciones actualizan por `id` sin estado anterior ni versión. Gestiones acepta el estado suministrado por el llamador; incidencias normaliza valores desconocidos a `Abierta` en un camino y acepta valores globales sin lista cerrada en otros. Dos actores pueden cerrar, reabrir o sobrescribir acción, tiempos y validación; las altas standalone generan ID nuevo sin clave idempotente. | `gestiones.js:35-142`, `incidencias.js:20-27,109-165`, `shared.js:2429-2497,4647-4737,4887-4913,5514-5534`; no existe precondición de fila/estado/versión. Carreras o duplicados LIVE: `[NO DATA]`. | Definir máquinas de estado y comandos cerrados por entidad, usar estado/versión previa e idempotencia de alta, y devolver conflicto con refresco al segundo actor. |
| SUP-050 | Supabase / Mi Turno / Guardado compuesto | P1 | CONFIRMADO | `_doSaveTurno()` guarda o actualiza la fila `shifts` y después inserta merma, gestión, incidencia, tareas, ajustes y asociaciones Bitrix mediante escrituras independientes cuyos resultados no comprueba. Un error HTTP puede dejar hijos sin turno, turno sin hijos, lotes parciales o asociación Bitrix incompleta; aun así limpia el formulario, audita y muestra “Turno guardado/corregido”. | `shared.js:1805-2080`; las excepciones de la asociación Bitrix se reducen a `console.warn`, mientras los errores HTTP de todos los helpers son `null` y atraviesan el flujo. Persistencia parcial real LIVE: `[NO DATA]`. | Sustituir el conjunto por un comando backend transaccional o compensable con resultado estructurado; no limpiar ni comunicar éxito hasta confirmar turno, hijos y asociaciones obligatorias, y distinguir las fases opcionales. |
| SUP-051 | Supabase / Mi Turno / Corrección e idempotencia | P1 | CONFIRMADO | La corrección implementa un reemplazo destructivo `DELETE` de cinco colecciones hijas seguido de reinserciones, sin comprobar resultados, transacción ni rollback. Un fallo puede perder datos anteriores o mezclar datos viejos y nuevos. La prevención de duplicados de turno es además un `SELECT` cacheable seguido de I/U sin restricción atómica; dos guardados simultáneos pueden crear o sobrescribir turnos incompatibles. | `shared.js:1815-1831,1883-2035`; la limpieza elimina `merma`, `gestiones`, `incidencias`, `ajustes` y `recepcion_ventas` por `shift_id`, audita aunque alguna respuesta sea `null` y desactiva la marca de corrección. Duplicados y pérdidas LIVE: `[NO DATA]`. | Diseñar corrección versionada y transaccional que preserve histórico, usar unicidad/idempotencia por empleado-fecha-servicio y devolver conflicto al segundo guardado; prohibir `DELETE → INSERT` no verificable. |
| SUP-052 | Supabase / Notas / Resultado | P2 | CONFIRMADO | Crear nota comprueba el resultado antes del éxito, pero marcar como leída ignora el posible `null`. El borrado audita antes y también ignora el resultado; una nota puede seguir presente aunque el historial y la interfaz indiquen eliminación. Ninguno de los tres caminos captura excepciones de red. | `shared.js:5211-5271`; el alta invalida sólo tras respuesta válida, mientras U/D no verifican cardinalidad ni resultado. Fallos reales LIVE: `[NO DATA]`. | Verificar una fila modificada/eliminada antes de refrescar o auditar, mover la auditoría después del borrado y capturar rechazo de red con feedback explícito. |
| SUP-053 | Supabase / Allowlist IP / Integridad | P1 | CONFIRMADO | Alta de IP comprueba el resultado, pero el máximo de dos y la ausencia de duplicado se validan con lectura previa y no son atómicos; dos altas concurrentes pueden superar ambos controles. La retirada registra `EMP_IP_REMOVE` antes del `PATCH`, por lo que puede existir auditoría de baja sin desactivación. Ambos caminos carecen de captura de excepciones de red. | `shared.js:3737-3766`; la lectura LIVE agregada no halló duplicados activos, pero restricciones únicas, carreras reales y fallos de retirada: `[NO DATA]`. La gravedad de que la tabla sea escribible por `anon` queda separada en `SEC-030`. | Imponer unicidad y límite efectivo en backend/base, comprobar cardinalidad y auditar después del éxito; gestionar la allowlist únicamente con identidad server-side. |
| SUP-054 | Supabase / Ajustes / Resultado | P1 | CONFIRMADO | El alta standalone de ajustes comprueba el posible `null`, pero el borrado audita antes e ignora `dbDelete()`: puede comunicar eliminación y refrescar aunque el importe financiero permanezca. Ambos caminos carecen de captura de excepciones. | `shared.js:5423-5473`; no se localizó un consumidor de navegación para `screen-ajustes-mod`, aunque las funciones están exportadas globalmente y el elemento existe en `index.html`. Fallos LIVE: `[NO DATA]`. | Si se mantiene el módulo, comprobar cardinalidad antes de auditoría/éxito, capturar red y unificarlo con el comando autorizado de ajustes de caja; si es obsoleto, retirarlo en una fase de código aprobada. |
| POS-001 | POSMEWS / Persistencia | P1 | CONFIRMADO | `_pvSaveFile()` implementa un pseudo-upsert mediante `DELETE → POST` sin comprobar `res.ok` en ambas operaciones. El llamador no espera la persistencia, mantiene el tick local como válido y muestra “validado”; un fallo puede dejar duplicados, perder el registro anterior o confirmar sólo en memoria. El tick de compatibilidad repite el mismo patrón. | `posmews_ventas.js:236-256`, consumidores en `posmews_ventas.js:294-418` y compatibilidad en `posmews_ventas.js:421-437`. Invalida caché incluso si la respuesta HTTP falló. Efectos LIVE: `[NO DATA]`. | Diseñar una escritura atómica e idempotente, esperar y comprobar su resultado antes de actualizar la interfaz, y eliminar o coordinar el segundo pseudo-upsert legacy. |
| POS-002 | POSMEWS / Batch | P2 | CONFIRMADO | El `PATCH` que marca un batch como `complete` no comprueba el resultado HTTP; aunque falle, invalida caché y sustituye el estado visual por “BATCH COMPLETO”. | `posmews_ventas.js:258-275`; la comprobación de los cinco tipos se hace contra la base, pero el resultado de la transición final se ignora. Estado real de batches afectados LIVE: `[NO DATA]`. | Comprobar el `PATCH`, exigir una transición atómica del estado y refrescar desde la base antes de comunicar que el batch está completo. |
| POS-003 | POSMEWS / Datos | P2 | CONFIRMADO | Existen cinco tablas POSMEWS LIVE y las tablas normalizadas todavía no contienen registros parseados. | Verificación REST directa contra Supabase. | Completar los parsers durante la Fase 2 de POSMEWS. |
| POS-004 | POSMEWS / Esquema | P2 | CONFIRMADO | `posmews_weekly_summary` fue descrita como creada, pero no existe actualmente en Supabase LIVE. | PostgREST devuelve `PGRST205` / HTTP 404. | Determinar si la tabla realmente se necesita antes de crearla. |
| BIT-001 | Bitrix / Asignación de turnos | P1 | CONFIRMADO | La función desplegable continúa en v3 y no implementa la asignación por departamento/hora de apertura documentada como fuente final. Los turnos manuales asociados sólo reciben horas y referencias; los turnos `BXAUTO_*` usan el corte genérico 05:00–15:00–23:00. La v4 no desplegable añade reglas específicas, solape Cocina/Sala y reconciliación de `servicio`. | `api/bitrix-sync.js:102-129,320-406,485-518` frente a `bitrix-sync.js:102-210,406-558,639-675`; documentación objetivo en `docs/context/22_auto_turno_assignment.md` y `docs/context/23_feat_turno_auto_implementacion.md`. Turnos mal clasificados actualmente en LIVE: `[NO DATA]`. | Antes de cambiar código, decidir si v4 representa la regla empresarial vigente; después crear pruebas de frontera por departamento, madrugada, turno partido, Evento/Otro y cambio horario, y desplegar una sola implementación mediante aprobación explícita. |
| BIT-002 | Bitrix / Resultado de sincronización | P2 | CONFIRMADO | La sincronización es idempotente en varios identificadores y comprueba los errores HTTP de Bitrix y Supabase, pero es un lote de mejor esfuerzo: captura fallos por empleado o grupo, puede dejar importación/asociación parcial y aun así devuelve HTTP 200 con `ok:true`. Los fallos de asociación sólo aparecen en `detalles`; un monitor que compruebe únicamente estado HTTP u `ok` puede considerar completa una ejecución incompleta. | `api/bitrix-sync.js:137-190,242-259,288-421,467-565`. Las escrituras encadenadas `shift → bitrix_time_records` no son transaccionales, aunque IDs deterministas, `ignore-duplicates` y reintento de pendientes permiten convergencia en varios casos. Ejecuciones parciales y monitorización LIVE: `[NO DATA]`. | Definir criterio de éxito parcial/fallo, contador estructurado de grupos fallidos y alerta operativa; probar caída entre cada fase, reintento e idempotencia antes de modificar el job. |

---

# Auditoría de seguridad Supabase

La seguridad de Supabase constituye una línea de auditoría obligatoria,
independiente y prioritaria.

No se considerará completada la auditoría técnica de SYNCRO SHIFT hasta
verificar el modelo completo de acceso a datos.

La comprobación debe realizarse contra Supabase LIVE y no únicamente contra la
documentación, la interfaz o el código frontend. La presencia de una clave
publicable o `anon` en el navegador no constituye por sí sola una vulnerabilidad:
el riesgo efectivo depende de RLS, las policies y los permisos reales aplicados
por la base de datos.

## Registro de seguridad

| ID | Área | Prioridad | Estado | Problema o riesgo | Evidencia actual | Acción requerida |
|---|---|---:|---|---|---|---|
| SEC-001 | Supabase / RLS | P0 | CONFIRMADO | Las 51 tablas ordinarias de `public` tienen RLS activado, pero en 43 resulta ineficaz como barrera de seguridad porque existen policies anónimas de CRUD completo. | Consulta LIVE de solo lectura sobre `pg_class`: 51 tablas, 51 con RLS, ninguna sin RLS y ninguna con `FORCE ROW LEVEL SECURITY`. Cinco tablas quedan bloqueadas al no tener policies (`cocina_costes_mes`, `cuadrantes`, `dept_reports`, `employee_status`, `incentivos_liquidaciones`). Existe una vista, `hk_incidencias_detalle`, con `security_invoker=on`. El inventario nominal completo se reconstruyó y los 51 recursos respondieron HTTP 200 a consultas PostgREST `limit=0`, sin leer filas; ver `docs/P0_RLS_ACCESS_MATRIX.md`. | Resolver las decisiones `[NO DATA]` de la matriz e implantar identidad confiable y policies restrictivas por usuario, rol, ámbito y fila; preparar migración y reversión antes de modificar LIVE. |
| SEC-002 | Supabase / Policies | P0 | CONFIRMADO | Las policies LIVE de `public` son estructuralmente permisivas: 43 tablas permiten CRUD anónimo completo y tres permiten lectura anónima. | Consulta LIVE de `pg_policies`: 66 policies en `public`, todas `PERMISSIVE`; 62 dirigidas a `anon` o `public`; no existe ninguna expresión `USING` o `WITH CHECK` distinta de `true` entre las policies de `public`. CRUD anónimo completo confirmado por policy y privilegios en 43 tablas; lectura anónima en `escandallo_lineas`, `platos_carta` y `productos_compra`. La enumeración individual de las 43, tres y cinco tablas está verificada en `docs/P0_RLS_ACCESS_MATRIX.md`. | Sustituir las policies abiertas por reglas restrictivas vinculadas a una identidad de aplicación verificable; validar casos permitidos y denegados en un entorno controlado antes del cambio LIVE. |
| SEC-003 | Supabase / Usuarios | P0 | CONFIRMADO | Supabase no puede aislar datos por empleado, rol o responsabilidad en el modelo actual: las peticiones del navegador comparten la identidad técnica `anon` y 43 tablas aceptan CRUD completo para ella. | El PIN actual no produce una identidad Supabase; consultas LIVE de catálogo confirman CRUD anónimo efectivo en 43 tablas. La lectura previa con la clave publicable recuperó todas las filas contabilizadas de `gestiones` (503), `incidencias` (295) y `tareas` (172). | Diseñar la correspondencia entre sesión backend, empleado y atributos de autorización; completar después la matriz Rol/Usuario × Tabla × Operación × Alcance. |
| SEC-004 | Supabase / anon | P0 | CONFIRMADO | La identidad `anon` utilizada por el frontend tiene privilegios PostgreSQL amplios y acceso efectivo de CRUD total sobre 43 tablas. | Consultas LIVE de solo lectura: `anon` posee `SELECT`, `INSERT`, `UPDATE` y `DELETE` en las 46 tablas que tienen policies; RLS deja CRUD completo efectivo en 43 y limita las otras tres a `SELECT`. No se ejecutaron mutaciones de prueba en LIVE. | Contener el acceso anónimo mediante una migración coordinada de identidad, grants y policies; ejecutar pruebas negativas de escritura únicamente en entorno controlado. |
| SEC-005 | Supabase / POSMEWS | P0 | CONFIRMADO | Las cinco tablas POSMEWS permiten CRUD anónimo completo. Las funciones frontend que crean batches y reemplazan archivos tampoco revalidan dentro de la operación el rol o departamento del actor; dependen del acceso previo a Informes/Sala. | LIVE: `posmews_adjustments`, `posmews_payments_data`, `posmews_sales_data`, `posmews_upload_batches` y `posmews_upload_files` tienen policy `anon_all`, comando `ALL`, rol `anon`, `USING true` y `WITH CHECK true`; `anon` dispone además de los cuatro privilegios de tabla. Consumidores activos en `posmews_ventas.js:208-275`. | Restringir las cinco tablas a identidades y operaciones autorizadas dentro del plan general de RLS; validar ingestión, lectura y borrado por rol/departamento, incluyendo llamadas que omitan la pantalla, antes de modificar LIVE. |
| SEC-006 | Supabase / Acceso directo | P1 | CONFIRMADO | Existen numerosas llamadas `fetch()` directas desde el frontend a `/rest/v1/`. | Auditoría del código `.js`. | Inventariar cada endpoint y contrastarlo con sus policies y permisos efectivos. |
| SEC-007 | Autorización frontend | P0 | CONFIRMADO | Las restricciones funcionales de gestión de empleados implementadas en JavaScript no son aplicadas por Supabase. | `shared.js::saveEmpleado()` valida roles y departamentos en el cliente, pero `employees` tiene LIVE una policy `ALL` para `anon, authenticated` con `USING true` y `WITH CHECK true`; `anon` posee los cuatro privilegios de tabla. | Tras implantar sesión confiable, reproducir la matriz funcional en una capa backend no eludible y en RLS/policies; validar llamadas que omitan JavaScript antes del cambio LIVE. |
| SEC-008 | Supabase / DELETE | P0 | CONFIRMADO | Una petición directa con identidad `anon` está autorizada por catálogo para borrar filas en 43 tablas, sin restricción por usuario ni fila. | LIVE: las policies y grants conceden `DELETE` efectivo a `anon` en 43 tablas; las expresiones aplicables son `true`. No se ejecutó ningún borrado de prueba en LIVE. | Diseñar y probar denegaciones de borrado por identidad, rol y alcance en un entorno controlado; modificar policies LIVE únicamente mediante una migración aprobada y reversible. |
| SEC-009 | Supabase / UPDATE | P0 | CONFIRMADO | Una petición directa con identidad `anon` está autorizada por catálogo para modificar cualquier fila en 43 tablas, incluida `employees`. | `employees` usa policy `ALL` con `USING true` y `WITH CHECK true`; `anon` dispone de `UPDATE` de tabla. El frontend envía campos sensibles desde `saveEmpleado()`. No se ejecutó ningún `UPDATE` de prueba en LIVE. | Diseñar autorización por identidad, fila y campo sensible; validar actualizaciones permitidas y rechazadas en un entorno controlado antes de modificar LIVE. |
| SEC-010 | Supabase / Datos sensibles | P0 | CONFIRMADO | La identidad anónima puede leer y modificar la tabla `employees` completa, que contiene PIN, coste, rol, validador, correo y datos organizativos. | Snapshot administrativo LIVE del 10/08/2026: policy `allow_all_anon`, `ALL` para `anon, authenticated`, `USING true`, `WITH CHECK true`; ambas identidades poseen los siete grants de tabla, incluidos `TRUNCATE`, `REFERENCES` y `TRIGGER`. La tabla contiene 76 filas; 59 están activas. Las 76 tienen PIN y coste, 55 de las activas tienen email y cuatro no. Sólo seis PIN tienen exactamente seis cifras, 70 no; no hay grupos de PIN duplicados. Son exclusivamente agregados: no se reprodujeron valores personales ni se ejecutaron mutaciones. | Tratar `employees` como dato crítico: retirar PIN y autorización del cliente, limitar columnas y filas desde backend/RLS y rotar todos los PIN activos —no sólo los de formato antiguo— durante un corte aprobado. |
| SEC-011 | Autorización frontend / Empleados | P1 | CONFIRMADO | `toggleEmp()` no revalida rol, ámbito ni fila objetivo, y `confirmarResetPin()` solo revalida el rol general del usuario; los controles visuales pueden omitirse y Supabase tampoco bloquea la petición manipulada. | `shared.js:3543-3578`, flujo legacy de `confirmarResetPin()`/`toggleEmp()` y LIVE con policy `ALL` irrestricta. En la rama local, el modo seguro deriva alta, edición, estado, reset y eliminación a endpoints que validan sesión, rol, ámbito y fila; 20 pruebas pasan. Los flags siguen apagados y no hubo mutación LIVE. | Validar la capa nueva y sus denegaciones contra PostgreSQL fuera de LIVE; completar grants/policies de columnas y retirar el camino legacy sólo durante el corte aprobado. |
| SEC-012 | Supabase Storage / Exposición | P0 | CONFIRMADO | El bucket `adjuntos` es público y autoriza a `public` lectura, inserción, actualización y borrado de objetos del bucket; no limita tamaño ni tipos MIME. | LIVE: `storage.buckets.public=true`, `file_size_limit=NULL`, `allowed_mime_types=NULL`; siete policies en `storage.objects` para `public` cubren `SELECT`, `INSERT`, `UPDATE` y `DELETE` con única condición `bucket_id='adjuntos'`; `anon` posee los cuatro grants. Siete referencias JPEG suman 28.490.358 bytes y un objeto respondió HTTP 206 sin credenciales. No se ejecutaron mutaciones de Storage. | Impedir nuevos adjuntos sensibles y diseñar migración aprobada a bucket privado con identidad confiable, URLs firmadas, límites de tamaño/MIME y retirada de EXIF; probar primero en entorno controlado. |
| SEC-013 | Autenticación / PIN | P0 | PLANIFICADO | El acceso por PIN no crea una identidad autenticada ni una sesión verificable: el navegador descarga `employees`, compara el PIN localmente y asigna el registro encontrado a la variable global `currentUser`. Además existen PIN de rol privilegiado codificados en el JavaScript entregado al cliente y reproducidos en documentación del repositorio, por lo que no pueden considerarse secretos. | `shared.js:121`, `shared.js:592-638`, `docs/context/03_roles_permissions.md:26` y `docs/context/mapa-modulos.md:43`; LIVE confirma acceso anónimo completo a `employees`. El 08/08/2026 se aprobaron selección de empleado + PIN individual de seis dígitos y entrega temporal híbrida. La implementación local desactivada incluye Supabase Auth, huella única, caducidad, versión de autorización y gestión server-side completa del maestro; 22 pruebas ordinarias y un E2E local pasan. La migración base fue aplicada dos veces y revertida con éxito en PostgreSQL 17.10 local; se verificaron RLS, grants, contexto, unicidad, rate limit, auditoría y colisión simulada de PIN. Un stack Supabase local con Postgres/Auth/PostgREST/Kong confirmó alta ficticia, login con PIN temporal, cambio obligatorio, revocación del PIN/sesión anteriores, nuevo login y HTTP 401 anónimo sobre `employees` e identidades. Snapshot agregado LIVE del 10/08/2026: 59 empleados activos, seis con PIN actual de seis cifras y 53 con otro formato; como todos los PIN actuales son legibles anónimamente, los 59 deben rotarse. Hay email para 55 activos y cuatro requieren entrega presencial; valores concretos: `[NO DATA]`. | Completar matriz RLS, protección de columnas y Storage; ampliar la integración ya superada al esquema operativo completo fuera de LIVE. Después, coordinar un corte aprobado para crear 59 identidades y PIN temporales únicos, entregar 55 por email y cuatro presencialmente, retirar PINs/descarga de empleados del cliente, cerrar acceso `anon` y obligar al cambio inicial. |
| SEC-014 | API correo / Autorización | P1 | CONFIRMADO | `/api/send-email` no autentica al usuario ni comprueba su rol; cualquier petición que alcance el endpoint puede elegir tipo de correo, destinatario, nombre, PIN y actor mostrado. La barrera actual es únicamente el middleware de IP general. | El camino LIVE/legacy continúa expuesto según `api/send-email.js`; abuso real fuera de las IP permitidas: `[NO DATA]`. En la rama local, Auth seguro hace que la ruta responda 404 y alta/reset construyen destinatario, actor y PIN en servidor con sesión, ámbito y rate limit. Los flags siguen desactivados y no se ha desplegado. | Validar los endpoints nuevos fuera de LIVE y activar la retirada efectiva del camino legacy únicamente durante el corte coordinado de Auth/RLS. |
| SEC-015 | Autorización frontend / Caja | P1 | CONFIRMADO | `validarCierre()` y `reabrirCierre()` no revalidan dentro de la función el rol ni el ámbito del actor; la restricción depende del botón que las invoca. Una llamada directa desde consola evita esa barrera. | `caja.js:974-1013` muestra Validar sólo a `admin`/`fb` y Reabrir sólo a `admin`, pero `caja.js:1142-1159` y `caja.js:1672-1685` ejecutan el cambio sin comprobarlo. LIVE autoriza `UPDATE` anónimo sobre `sala_cash_closures`; abuso efectivo: `[NO DATA]`. | Incorporar estas transiciones a una capa backend/RLS con actor, departamento, estado anterior y transición permitida verificables; añadir pruebas negativas sin UI. |
| SEC-016 | Autorización frontend / Incentivos | P1 | CONFIRMADO | Las funciones que guardan costes, importan ventas, crean/modifican reglas y confirman liquidaciones no revalidan dentro de la propia operación el rol ni el ámbito. Los botones y pestañas son la barrera principal; una llamada directa permite además suministrar identificadores, meses e importes manipulados. | `incentivos.js:50-62`, `incentivos.js:392-568` y `incentivos.js:979-1274`. LIVE bloquea `cocina_costes_mes` e `incentivos_liquidaciones`, pero `employee_sales_weekly`, `dept_incentive_rules` y `fio` quedan dentro del CRUD anónimo efectivo descrito en `SEC-001` a `SEC-004`. Abuso real: `[NO DATA]`. | Aplicar autorización server-side por operación, rol, departamento y fila, derivar actor y valores financieros desde datos confiables y añadir casos negativos directos vinculados a `SEC-007`, `SEC-008`, `SEC-009` y `SEC-010`. |
| SEC-017 | Autorización frontend / Informes | P1 | CONFIRMADO | Varias operaciones expuestas globalmente dependen del acceso previo a la pantalla y no revalidan actor o ámbito al escribir: guardar producción de Sala, guardar incentivos/configuración de Entrenadores y publicar desde el detalle. El borrado semanal sí revalida `admin` y guardar el informe sí comprueba el departamento, pero LIVE no aplica esa matriz funcional sobre las tablas actualmente abiertas. | `informes.js:69-135`, `informes.js:831-869`, `informes.js:1237-1403` y `informes.js:1997-2194`. `sala_produccion_semanal`, `entrenadores_incentivos_mes` y `employees` forman parte del acceso CRUD anónimo efectivo; `dept_reports` está bloqueada. Abuso real: `[NO DATA]`. | Definir permisos backend/RLS por tipo de informe, departamento y estado, proteger columnas financieras de `employees` y probar llamadas directas permitidas y denegadas vinculadas a `SEC-007` a `SEC-010`. |
| SEC-018 | Autorización frontend / Merma | P1 | CONFIRMADO | La pantalla restringe el alta a Cocina, Friegue, FnB y gestores, pero `saveMerma()` sólo comprueba que exista `currentUser`. Como el modal y la función son globales, cualquier usuario con sesión de interfaz puede invocarlos y construir un alta fuera de ese ámbito; Supabase LIVE permite además CRUD anónimo sobre `merma`. | `merma.js:23-37`, control visual en `merma.js:223-260` y escritura en `merma.js:493-565`; acceso LIVE derivado del inventario completo de `SEC-001` a `SEC-004`. Abuso real: `[NO DATA]`. | Revalidar ámbito en una operación backend, derivar empleado/departamento desde la sesión confiable y aplicar RLS por actor/fila; añadir pruebas negativas directas vinculadas a `SEC-007`, `SEC-009` y `SEC-010`. |
| SEC-019 | Autorización frontend / Recepción | P1 | CONFIRMADO | Varias funciones globales de Recepción no reproducen el control de acceso de la pantalla: cerrar/traspasar caja sólo usan `currentUser`, reabrir caja no valida rol, validar/marcar error no validan actor ni ámbito, y `confirmarCargoLab()` acepta el estado indicado por el llamador sin lista cerrada. Algunas funciones sensibles sí revalidan (`corregirCajaRec`, eliminación y reapertura de turno), pero Supabase no aplica ninguna de estas diferencias. | `recepcion.js:664-842`, `recepcion.js:970-1038`, `recepcion.js:1724-1909` y `recepcion.js:1912-2038`. LIVE autoriza CRUD anónimo efectivo sobre `recepcion_cash`, `recepcion_ventas`, `shifts` y `syncrolab_room_charges` dentro de `SEC-001` a `SEC-004`. Abuso real: `[NO DATA]`. | Llevar cierres, transiciones, ventas y cargos a backend/RLS con actor, departamento, fila y estado previo; derivar identidad y validar enumeraciones en servidor, con pruebas negativas relacionadas con `SEC-007` a `SEC-010`. |
| SEC-020 | Autorización frontend / SYNCROLAB | P1 | CONFIRMADO | La navegación limita la caja a Recepción SYNCROLAB y ciertos jefes, pero `submitLabTraspaso()` y `submitLabCierre()` no revalidan rol, área ni puesto dentro de la operación; cualquier usuario con `currentUser` puede invocar las funciones globales y suministrar turno e importes. Sólo la corrección posterior llama a `canCorrectCaja()`. | Acceso visual en `shared.js:683-810`; escrituras en `syncrolab.js:405-456,544-613`. LIVE autoriza CRUD anónimo efectivo sobre `syncrolab_cash_closures` y `syncrolab_room_charges` dentro de `SEC-001` a `SEC-004`. Abuso real: `[NO DATA]`. | Llevar alta, edición, cargos y corrección a backend/RLS con identidad, área, puesto, fila y transición verificables; derivar actor y fecha en servidor y añadir pruebas directas negativas relacionadas con `SEC-007` a `SEC-010`. |
| SEC-021 | Autorización frontend / Tareas | P1 | CONFIRMADO | La función global de transición acepta cualquier estado y sólo aplica permisos a `En proceso`, `Cerrada` y `Validada`; cualquier otro valor se normaliza a `Abierta` sin comprobación, permitiendo reabrir una tarea de cualquier departamento. El alta manual permite elegir `dept_origen`, y `createTask()` acepta `creado_por` proporcionado por el llamador, de modo que origen y autor se pueden suplantar. | `tareas.js:31-38,94-124,127-163,288-309`; modal visible para todos los roles en `index.html:1374-1380,2361-2379`. LIVE autoriza CRUD anónimo efectivo sobre `tareas` dentro de `SEC-001` a `SEC-004`. Abuso real: `[NO DATA]`. | Usar una lista cerrada de comandos y transiciones server-side, comprobar actor/ámbito/fila/estado previo y derivar autor y departamento de origen desde la sesión; añadir pruebas directas de reapertura, suplantación y acceso cruzado vinculadas a `SEC-007` a `SEC-010`. |
| SEC-022 | Autorización frontend / Validación | P1 | CONFIRMADO | La pantalla decide qué botones mostrar, pero numerosas funciones globales no revalidan dentro de la operación el rol, departamento, tabla, fila ni transición. `marcarCajaError()` y `marcarCajaSinControl()` aceptan incluso el nombre de tabla del llamador; `openCajaSummary(id,true)` permite construir acciones de validación sin pasar por la matriz visual. Sólo algunos borrados y correcciones revalidan el rol. | Controles visuales en `shared.js:2715-2759` y `validacion.js:700-838,900-989,1935-1988,2225-2274`; operaciones en `validacion.js:345-455,861-887,992-1024,1043-1191,1851-1922,2052-2084`. LIVE autoriza CRUD anónimo efectivo sobre las tablas afectadas dentro de `SEC-001` a `SEC-004`. Abuso real: `[NO DATA]`. | Implementar comandos backend separados y de lista cerrada para turno, cada caja, merma y FIO; validar identidad, rol, ámbito, fila y estado previo, derivar actor en servidor y añadir pruebas negativas sin UI relacionadas con `SEC-007` a `SEC-010`. |
| SEC-023 | Autorización server-side / SYNCROLAB | P1 | CONFIRMADO | La capa P0 local ampliaba indebidamente el ámbito de cualquier empleado con `rol='jefe'` y `area='SYNCROLAB'` a todos los subdepartamentos del laboratorio, mientras el frontend actualizado lo restringe según su puesto/subdepartamento efectivo. También podía negar a coordinadores el acceso a su propio equipo porque el objetivo conservaba el área genérica `SYNCROLAB`. | Evidencia original en el checkpoint `0d68fbe`: `shared.js:494-511` resolvía `_deptCatalogo(user)`, mientras `lib/authz-server.js:96-109` usaba el grupo completo y comparaba sólo `target.area`. Rectificación local actual en `lib/authz-server.js:104-143`: `effectiveDepartment()` deriva actor y objetivo desde `area`, `rol` y `puesto` confiables y `supervisorDepartments()` aplica listas separadas. Dos pruebas unitarias/de endpoint cubren acceso propio y denegaciones cruzadas; un jefe de Entrenadores recibe 403 antes de cualquier escritura al intentar un alta de Fisioterapia. Los flags permanecen apagados; explotación previa y efectos LIVE: `[NO DATA]`. | Mantener los casos positivos y negativos para Recepción SYNCROLAB, Entrenadores y Fisioterapia/Clínica al ampliar la matriz y antes de activar Auth. La corrección local aún no está desplegada. |
| SEC-024 | Autorización frontend / Housekeeping | P1 | CONFIRMADO | La interfaz decide qué acciones mostrar según propietario, gobernante o admin, pero las funciones globales `hkAction()`, `hkGuardarIncidencia()`, `hkGuardarAsig()` y `hkBorrarAsig()` no revalidan actor, rol, asignación ni transición. Un usuario con sesión de interfaz puede abrir una asignación ajena por ID y llamar directamente a iniciar, finalizar, revisar, reabrir, enlazar una incidencia, asignar o borrar; Supabase LIVE permite CRUD anónimo sobre las tablas HK. | Controles visuales en `housekeeping.js:531-588,855-978`; operaciones en `housekeeping.js:609-703,790-840,1388-1465`; exportación global en `housekeeping.js:2284-2310`; acceso de navegación en `shared.js:804-868`. Abuso real: `[NO DATA]`. | Implementar comandos backend separados para ejecución propia, planificación, revisión, reapertura, incidencia y borrado; derivar actor/ámbito, comprobar fila y estado previo y añadir pruebas directas relacionadas con `SEC-007` a `SEC-010`. |
| SEC-025 | Autorización frontend / Hypoxic | P1 | CONFIRMADO | La navegación limita el módulo operativo a Recepción, Mantenimiento y admin, pero `saveHypoxicNew()`, `advanceHypoxic()` y `saveCloseHypoxic()` están expuestas globalmente y no revalidan rol, departamento, fila o transición. Cualquier usuario con sesión de interfaz puede invocarlas; LIVE permite CRUD anónimo sobre `hypoxic_room_incidencias`. | Navegación en `shared.js:760-826`; botones y escrituras en `hypoxic.js:52-145,210-349`; exportación global en `hypoxic.js:352-364`. La Validación añade lectura y botones defectuosos documentados en `UI-003`. Abuso real: `[NO DATA]`. | Llevar alta y transiciones a backend/RLS con identidad, departamento, fila y estado previo; definir rectificación/borrado y añadir pruebas negativas sin UI relacionadas con `SEC-007` a `SEC-010`. |
| SEC-026 | Autorización frontend / Fichaje / Empleados | P1 | CONFIRMADO | La pantalla de importación de alertas sólo se presenta a admin/adjunto, pero `fichajeImportar()` no revalida el rol. Tras importar, el matching crea directamente filas en `employees` para nombres desconocidos, con PIN legacy predecible `AUTO` + seis cifras de tiempo, sin identidad Auth y fuera de los endpoints locales de aprovisionamiento. | Control visual en `fichaje.js:155-175`; operación en `fichaje.js:709-820`; alta directa y PIN en `fichaje.js:117-143`. El estado inicial `Sin asignar` impide login legacy inmediato, pero la fila contiene PIN en claro y queda huérfana del modelo Auth seguro. LIVE autoriza además CRUD anónimo sobre `bitrix_alerts` y `employees`. Abuso o perfiles huérfanos existentes: `[NO DATA]`. | Restringir la importación a backend admin/adjunto, eliminar el alta automática con PIN y enviar los nombres no conciliados a una cola de revisión; cualquier alta posterior debe usar `/api/auth/provision` y la matriz de `SEC-007` a `SEC-013`. |
| SEC-027 | Autorización frontend / FIO | P1 | CONFIRMADO | La pantalla filtra FIO por departamento y estado, pero las funciones globales no reproducen esas garantías. `saveNewFIO()` no revalida permiso ni que empleado/departamento estén dentro del ámbito; `validateFIO()` no exige ámbito, estado inicial ni lista cerrada de estados; `closeFIO()` no comprueba ningún permiso, fila o estado; la resolución crítica no comprueba ámbito y cualquier decisión distinta de `aceptar` se trata como rechazo. La disputa del empleado sí valida propietario y estado en cliente. | Controles visuales en `fio.js:29-65,158-176,280-315,546-584`; operaciones en `fio.js:471-527,625-769`; todas quedan expuestas en `window`. LIVE permite CRUD anónimo sobre `fio`; abuso real: `[NO DATA]`. | Implementar comandos backend separados para alta, validación, cierre, disputa y resolución; derivar actor/ámbito, usar estados y decisiones de lista cerrada, exigir fila/estado previo y añadir pruebas negativas directas vinculadas a `SEC-007` a `SEC-010`. |
| SEC-028 | Autorización frontend / Gestiones | P1 | CONFIRMADO | La interfaz permite actuar a miembros del departamento o responsables de su ámbito, pero `advanceGestion()`, `openCloseGestion()`, las variantes de Validación y las operaciones del modal compartido no revalidan actor, departamento, fila ni transición. Una llamada global puede cambiar/cerrar una gestión ajena o usar las variantes legacy para cambiar tareas e incidencias; el alta standalone deriva identidad y departamento del usuario, pero tampoco existe enforcement LIVE. | Reglas visuales en `mi_turno.js:48-67,146-159`, `shared.js:4562-4588` y `shared.js:3068-3094`; escrituras en `gestiones.js:35-142` y `shared.js:4647-4713`. LIVE permite CRUD anónimo sobre `gestiones`, `tareas`, `incidencias` e `item_comentarios`; abuso real: `[NO DATA]`. | Implementar comandos backend por entidad y transición, derivar actor/ámbito, prohibir variantes genéricas entre tablas y añadir pruebas negativas de otro departamento y estado vinculadas a `SEC-007` a `SEC-010`. |
| SEC-029 | Autorización frontend / Incidencias | P1 | CONFIRMADO | Existen caminos que verifican responsable y departamento, pero no de forma uniforme. `advanceIncident()` sólo comprueba permiso al pasar a “En proceso”, de modo que otros valores pueden cerrar o reabrir; las funciones de Validación y el modal compartido no revalidan ámbito. Las operaciones del modal operativo sí comprueban departamento/admin, aunque aceptan el estado almacenado en una variable global sin lista cerrada. | Comprobaciones válidas en `incidencias.js:43-66,109-123`, `mi_turno.js:316-369` y `shared.js:2429-2497`; bypasses en `incidencias.js:125-165`, `shared.js:4562-4588,4647-4737`. LIVE permite CRUD anónimo sobre `incidencias` e `item_comentarios`; abuso real: `[NO DATA]`. | Centralizar alta, comentario, transición, validación y borrado en comandos backend de lista cerrada; comprobar actor/ámbito/fila/estado previo en todos los consumidores y añadir pruebas negativas sin UI vinculadas a `SEC-007` a `SEC-010`. |
| SEC-030 | Perímetro IP / Supabase | P0 | CONFIRMADO | Antes de la contención, la allowlist dinámica del middleware no era una barrera de seguridad: `employee_ips` permitía escritura anónima y el middleware autorizaba cualquier IP con `active=true`. Un actor podía añadir directamente su IP con la clave publicable y atravesar el filtro del portal; combinado con la lectura anónima de `employees` y PIN de `SEC-010`/`SEC-013`, existía una cadena completa de acceso externo. La vía de escritura pública sobre `employee_ips` quedó cerrada en LIVE el 10/08/2026; el riesgo histórico sigue `CONFIRMADO` y el corte Auth completo continúa pendiente. | `middleware.js:22-35,38-68,85-95` usa la clave publicable en LIVE y confía en todas las filas activas; `shared.js:3701-3766` confirma el modelo funcional, pero sus controles admin/adjunto eran eludibles. Preflight administrativo LIVE: policy `anon_all` (`ALL`, `anon`) y los siete grants de tabla para `anon` y `authenticated`, incluidos `TRUNCATE`, `REFERENCES` y `TRIGGER`. Lectura agregada: 12 filas, ocho activas y cuatro inactivas; dos activas coinciden con la lista estática y seis son sólo dinámicas. Cuatro activas no tienen evento `EMP_IP_ADD` coincidente; como `audit_log` también admitía CRUD anónimo, legitimidad o abuso: `[NO DATA]`. Contención `202608100001_p0_employee_ips_containment.sql` VERIFICADO en local y LIVE: sólo policy/grant SELECT para `anon`, ningún privilegio de tabla para `public`/`authenticated`, ningún privilegio no-SELECT para `anon`, y DML de `service_role` conservado. Las 12 filas y ocho activas permanecieron; HTTP LIVE devolvió 200 con ocho activas y 401 a PATCH/DELETE sobre un ID inexistente. Rollback, reaplicación doble e idempotencia se verificaron sólo en local; rollback LIVE no aplicado. | Confirmar empresarialmente las seis IP dinámicas. Después activar identidad/backend y lectura con service key, retirar también SELECT anónimo y revisar `employees`/`audit_log`; efectos externos históricos: `[NO DATA]`. |
| SEC-031 | Autorización frontend / Mi Turno | P1 | CONFIRMADO | La interfaz sólo ofrece correcciones de turnos propios en estado “En corrección”, pero `loadForCorrection(shiftId)` acepta cualquier ID y `_doSaveTurno()` confía en las variables globales `editingShiftId`/`_correctionShiftId`. Una llamada directa puede sobrescribir una fila ajena con la identidad del actor y eliminar todos sus hijos por `shift_id`; no se comprueban propietario, estado previo ni ámbito dentro de la operación. | Control visual en `shared.js:1597-1605`; carga y escritura en `shared.js:1607-1630,1805-1918`. `shifts` y las cinco tablas hijas permiten CRUD anónimo LIVE; abuso real: `[NO DATA]`. | Implementar comandos backend separados para alta y corrección; derivar empleado de la sesión, exigir propietario/autoridad, estado “En corrección” y versión, y ejecutar la sustitución autorizada de hijos de forma transaccional con pruebas negativas vinculadas a `SEC-007` a `SEC-010`. |
| SEC-032 | Autorización frontend / Notas | P2 | CONFIRMADO | La interfaz filtra notas por autor/departamento y sólo muestra “marcar leída” a responsables, pero `markNotaLeida(nid)` no revalida actor, ámbito ni fila. Cualquier usuario con sesión de interfaz puede marcar como leída una nota ajena; la eliminación sí comprueba propietario o admin contra la fila recuperada. | Reglas visuales en `shared.js:5083-5151` y Validación; escritura global en `shared.js:5240-5251`. LIVE permite CRUD anónimo sobre `employee_notes`; abuso real: `[NO DATA]`. | Convertir lectura/gestión en comando backend con responsable y ámbito derivados; definir si el leído es global o por responsable y añadir pruebas negativas relacionadas con `SEC-007` a `SEC-010`. |
| SEC-033 | Autorización frontend / Ajustes | P1 | CONFIRMADO | `saveNewAjusteMod()` está expuesta globalmente, no revalida departamento ni rol y acepta tipo e importe del llamador. Cualquier usuario con sesión puede crear un ajuste financiero atribuido a sí mismo fuera del flujo de caja; el borrado sí exige admin. | `shared.js:5274-5473`; no se localizó enlace de navegación activo al módulo, pero `showScreen('ajustes-mod')`, el elemento de pantalla y las funciones globales permiten activarlo. LIVE permite CRUD anónimo sobre `ajustes`; abuso real: `[NO DATA]`. | Integrar el alta en un comando de caja autorizado por actor, departamento, turno y reglas de signo/importe; denegar el módulo huérfano o retirarlo y añadir pruebas directas sin UI vinculadas a `SEC-007` a `SEC-010`. |
| SEC-034 | Supabase / RPC huérfano | P1 | CONFIRMADO | `sync_shifts_horas_from_bitrix()` permite ejecutar una actualización masiva de `shifts.horas` y concede `EXECUTE` a `public`, `anon` y `authenticated`, sin consumidor ni trigger localizados. No amplía el CRUD anónimo P0 ya confirmado sobre `shifts`, pero reduce una mutación masiva a una sola llamada pública. | Inspección administrativa LIVE de firma, definición, propietario, modo invoker y grants; búsqueda global sin consumidores. La función copia `bitrix_attendance.horas` a turnos con horas nulas o cero. Ejecuciones abusivas o efectos reales: `[NO DATA]`. La migración intermedia `202608100002` revoca su ejecución a navegador y la reserva a `service_role`; verificada sólo en local, incluido rollback. | Aplicar la revocación durante el corte RLS; conservar la función sólo si existe un proceso server-side identificado y, en caso contrario, retirarla mediante cambio separado después de comprobar jobs externos. |
| SEC-035 | Supabase / Vista Housekeeping | P1 | CONFIRMADO | `hk_incidencias_detalle` concede SELECT a `anon` y expone detalles operativos, descripciones, acciones, personal implicado, validación y datos de limpieza. La vista usa `security_invoker`, por lo que no amplía el acceso anónimo ya confirmado sobre sus tablas base, pero constituía una superficie pública omitida del inventario inicial de 51 tablas. | Preflight administrativo LIVE: única vista de `public`, grants SELECT efectivos para `anon` y `authenticated`, definición sobre `incidencias` y `housekeeping_assignments`, `security_invoker=on`; búsqueda local sin consumidores. Accesos o abuso reales: `[NO DATA]`. La migración `202608100002` ampliada revoca el grant anónimo explícitamente, conserva SELECT autenticado sujeto a las RLS base y prueba doble aplicación y rollback en local. | Aplicar la revocación durante el corte RLS y mantener la vista dentro del inventario de superficie; decidir después si se conserva para consumidores externos `[NO DATA]` o se retira. |

### Actualización de estado del corte LIVE — 10/08/2026

- `SEC-013`, `SEC-014`, `SEC-030`, `SEC-034` y `SEC-035`: `VERIFICADO` para
  la corrección descrita en el corte. Las filas maestras conservan el problema
  histórico para no perder evidencia.
- `SEC-001` a `SEC-005` y `SEC-007` a `SEC-010`: la vía `anon` quedó
  `VERIFICADO` como cerrada, pero el riesgo residual de autorización lateral
  entre usuarios autenticados sigue `CONFIRMADO` hasta completar la matriz por
  rol/fila. No se declara cerrado ese alcance restante.
- Postflight LIVE: 51 tablas con policy restrictiva de sesión, 49 policies
  intermedias autenticadas, cero grants de tabla para `anon`, cero acceso
  autenticado directo a `employees`/`employee_ips`, vista y RPC públicos
  cerrados; HTTP anónimo 401 en cuatro recursos representativos.

## Alcance mínimo de la auditoría de seguridad

La auditoría deberá cubrir, como mínimo:

1. Inventario de proyectos, esquemas, tablas, vistas y funciones expuestas por
   Supabase/PostgREST.
2. Estado de RLS para cada tabla expuesta.
3. Policies reales para `SELECT`, `INSERT`, `UPDATE` y `DELETE`.
4. Roles de PostgreSQL y roles funcionales de la aplicación.
5. Relación entre `auth.uid()`, la identidad de aplicación y los registros de
   empleado o usuario.
6. Alcance permitido por fila, centro, departamento, responsabilidad y propiedad
   del dato, cuando corresponda.
7. Restricciones sobre columnas sensibles.
8. Permisos efectivos de la clave publicable/`anon` sin una sesión autenticada.
9. Permisos efectivos de cada tipo de usuario autenticado.
10. Protección frente a llamadas REST manipuladas fuera de la interfaz.
11. Acceso a Storage, Edge Functions, RPC y Realtime, si existen. Su existencia
    y configuración actuales permanecen en `[NO DATA]` hasta verificarlas.
12. Registro, trazabilidad y capacidad de detectar operaciones no autorizadas.

## Matriz de accesos — pendiente de completar

Esta matriz deberá completarse exclusivamente con evidencia obtenida del sistema
LIVE. Cada fila debe representar una combinación verificable de identidad o rol,
recurso y operación. No debe deducirse el acceso a partir de botones visibles en
la interfaz.

| Usuario o rol | Identidad técnica | Recurso / tabla | `SELECT` | `INSERT` | `UPDATE` | `DELETE` | Alcance de filas | Restricción de columnas | Policy / evidencia LIVE | Resultado de prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sin sesión / `anon` | Clave publicable del frontend → rol PostgreSQL `anon` | `employees` | PERMITIDO | PERMITIDO | PERMITIDO | PERMITIDO | Todas las filas (`USING true`) | Sin restricción de columnas a nivel de tabla | `allow_all_anon`, `ALL`, `anon, authenticated`, `USING true`, `WITH CHECK true`; cuatro grants para `anon` | Autorización efectiva confirmada por catálogo; no se ejecutó mutación LIVE | CONFIRMADO |
| Sin sesión / `anon` | Clave publicable del frontend → rol PostgreSQL `anon` | 43 tablas `public` enumeradas en `docs/P0_RLS_ACCESS_MATRIX.md` | PERMITIDO | PERMITIDO | PERMITIDO | PERMITIDO | Todas las filas | Sin restricción de columnas a nivel de tabla | `pg_policies` + `has_table_privilege()` LIVE | Autorización efectiva confirmada por catálogo; pruebas de escritura no ejecutadas | CONFIRMADO |
| Sin sesión / `anon` | Clave publicable del frontend → rol PostgreSQL `anon` | `escandallo_lineas`, `platos_carta`, `productos_compra` | PERMITIDO | BLOQUEADO POR RLS | BLOQUEADO POR RLS | BLOQUEADO POR RLS | Todas las filas para lectura | Sin restricción de columnas de lectura a nivel de tabla | Policy `SELECT` para `anon` con `USING true`; grants de tabla existentes | Resultado derivado de policy y grants LIVE; sin mutaciones | CONFIRMADO |
| Sin sesión / `anon` | Clave publicable del frontend → rol PostgreSQL `anon` | `cocina_costes_mes`, `cuadrantes`, `dept_reports`, `employee_status`, `incentivos_liquidaciones` | BLOQUEADO POR RLS | BLOQUEADO POR RLS | BLOQUEADO POR RLS | BLOQUEADO POR RLS | Ninguna fila | No aplicable mientras no exista policy | RLS activado sin policies | Bloqueo confirmado por catálogo; efecto REST previo observado en tablas sin policy | CONFIRMADO |
| Sin sesión / `anon` | Clave publicable del frontend → rol PostgreSQL `anon` | `storage.objects`, bucket `adjuntos` | PERMITIDO | PERMITIDO | PERMITIDO | PERMITIDO | Todos los objetos cuyo `bucket_id='adjuntos'` | Sin límite MIME o tamaño en el bucket | Siete policies para `public` y cuatro grants para `anon`; bucket público | Descarga anónima confirmada; mutaciones no ejecutadas | CONFIRMADO |

### Criterios de verificación de la matriz

Para cada combinación de la matriz se deberán probar tanto los casos permitidos
como los casos que deben ser rechazados:

- sin sesión autenticada y usando únicamente la clave publicable/`anon`;
- con cada tipo de usuario real identificado durante la auditoría;
- acceso a registros propios y ajenos;
- acceso dentro y fuera del ámbito organizativo autorizado;
- lectura y escritura de campos sensibles;
- llamadas directas a REST que no pasen por la interfaz;
- `INSERT`, `UPDATE` y `DELETE` con identificadores o filtros manipulados;
- resultado HTTP y efecto real en la base de datos.

Los usuarios de prueba, roles reales, tablas, policies y resultados permanecen
en `[NO DATA]` hasta su comprobación.

---

## Plan de rectificación

### Contención prioritaria de P0

**Estado:** PLANIFICADO

La auditoría funcional restante está pausada por decisión del usuario mientras
se prepara la contención de los P0 confirmados. La arquitectura, el despliegue
por etapas, las pruebas y la reversión están documentados en
`docs/P0_SECURITY_CONTAINMENT_PLAN.md`. Se aprobó selección del empleado más PIN
personal de seis dígitos; la ejecución requiere autorización específica.
La entrega temporal aprobada es híbrida: correo individual cuando exista y
entrega presencial cuando no exista o el envío falle.

### Fase 0 — Preservación y evidencia

**Estado:** EN CURSO

Objetivo: evitar modificaciones prematuras y mantener evidencia reproducible.

- registrar cada hallazgo con su fuente;
- separar hechos confirmados de riesgos pendientes;
- documentar el comportamiento actual antes de modificarlo;
- definir para cada corrección un método de validación y, cuando corresponda,
  una vía de reversión.

### Fase 1 — Auditoría Supabase Core y seguridad

**Estado:** EN CURSO

- completar el inventario de accesos a Supabase;
- verificar `dbUpsert()` y `setDB()`;
- inventariar escrituras directas;
- auditar errores HTTP, caché, concurrencia e invalidación;
- obtener el inventario LIVE de RLS y policies;
- completar la matriz de accesos;
- ejecutar pruebas negativas de autorización;
- clasificar los datos sensibles.

### Fase 2 — Auditoría funcional por módulos

**Estado:** PENDIENTE

- auditar los módulos siguiendo el orden establecido;
- identificar consumidores y dependencias antes de proponer cambios;
- incorporar cada nuevo hallazgo a este registro;
- definir impacto, prioridad y método de validación.

### Fase 3 — Diseño y aprobación de correcciones

**Estado:** PENDIENTE

- agrupar correcciones por dependencia y riesgo;
- definir el resultado esperado;
- identificar migraciones y compatibilidad necesarias;
- definir pruebas y procedimiento de reversión;
- cambiar a `PLANIFICADO` solo las acciones aprobadas.

### Fase 4 — Ejecución controlada

**Estado:** PENDIENTE

- aplicar cambios pequeños y trazables;
- no mezclar correcciones no relacionadas;
- actualizar a `CORREGIDO` después de modificar;
- preservar el histórico del hallazgo.

### Fase 5 — Verificación y cierre

**Estado:** PENDIENTE

- ejecutar las pruebas previstas;
- verificar regresiones y permisos negativos;
- contrastar el resultado contra Supabase LIVE cuando corresponda;
- cambiar a `VERIFICADO` solo con evidencia suficiente.

---

## Orden de auditoría de módulos

1. Supabase Core y seguridad — **EN CURSO**
2. Bitrix — **PENDIENTE**
3. Housekeeping — **PENDIENTE**
4. Caja — **PENDIENTE**
5. Validación — **PENDIENTE**
6. Recepción — **PENDIENTE**
7. Sala — **PENDIENTE**
8. Dashboard — **PENDIENTE**
9. Syncrolab — **PENDIENTE**
10. Incidencias — **PENDIENTE**
11. Gestiones — **PENDIENTE**
12. Tareas — **PENDIENTE**
13. Mermas — **PENDIENTE**
14. FIO — **PENDIENTE**
15. Informes — **PENDIENTE**
16. Incentivos — **PENDIENTE**
17. Mi Turno — **PENDIENTE**
18. Mi Rendimiento — **PENDIENTE**
19. Adjuntos — **PENDIENTE**

El orden podrá cambiar únicamente mediante una decisión explícita registrada en
el historial, especialmente si aparece un hallazgo P0.

---

## Condiciones para empezar correcciones

No comenzar correcciones generales hasta que, para el cambio correspondiente:

- la arquitectura relevante haya sido auditada;
- las dependencias y consumidores sean conocidos;
- exista evidencia reproducible del problema;
- se haya identificado el impacto operativo y técnico;
- se haya establecido la prioridad;
- la solución y su alcance estén definidos;
- exista un método de validación posterior;
- se haya definido una vía de reversión cuando el riesgo lo requiera;
- los cambios de esquema, RLS o policies hayan sido contrastados con la matriz de
  accesos prevista;
- no se dependa de datos marcados como `[NO DATA]` para autorizar la corrección.

### Excepción P0

Un P0 confirmado que implique riesgo inmediato podrá corregirse antes de terminar
la auditoría general. Incluso en ese caso deberán registrarse la evidencia, el
alcance, la decisión, la modificación, la prueba y el resultado.

---

## Historial

### 2026-08-10

- Reconstrucción y verificación nominal del inventario Supabase: las 46 tablas
  del snapshot documentado más las cinco tablas POSMEWS forman exactamente los
  51 recursos LIVE; todos respondieron HTTP 200 con `limit=0`, sin recuperar
  filas ni ejecutar mutaciones.
- Creación de `docs/P0_RLS_ACCESS_MATRIX.md`: enumera las 51 tablas, conserva el
  acceso LIVE como `CONFIRMADO`, separa las reglas objetivo `PLANIFICADO` de las
  decisiones empresariales `[NO DATA]` y mantiene no ejecutable la migración de
  corte RLS.
- Auditoría de escrituras de `housekeeping.js`: incorporación de `SUP-042` y
  `SUP-043` por resultados compuestos no verificados, duplicados y transiciones
  concurrentes; alta de `SEC-024` porque las funciones globales no reproducen
  los controles de propietario/gobernante/admin. Efectos LIVE: `[NO DATA]`.
- Auditoría de escrituras de `hypoxic.js`: incorporación de `SUP-044` por
  transiciones sin estado previo e idempotencia y de `SEC-025` por autorización
  sólo de navegación. Alta de `UI-003` porque Validación invoca dos funciones de
  rectificación/borrado inexistentes. Efectos LIVE: `[NO DATA]`.
- Auditoría de escrituras de `fichaje.js`: incorporación de `SUP-045` por lotes
  parciales y reimportación no idempotente; alta de `SEC-026` porque la función
  global no revalida admin/adjunto y el matching crea perfiles directos con PIN
  legacy fuera del aprovisionamiento Auth. Efectos LIVE: `[NO DATA]`.
- Auditoría de escrituras de `fio.js`: ampliación de `SUP-010` y `SUP-040`;
  incorporación de `SUP-046` y `SUP-047` por confirmaciones falsas, cálculo de
  reincidencia no atómico y transiciones sin estado previo; alta de `SEC-027`
  porque las operaciones globales no reproducen ámbito, permiso, estado ni
  listas cerradas de la interfaz. Efectos LIVE: `[NO DATA]`.
- Auditoría conjunta de `gestiones.js`, `incidencias.js` y sus consumidores en
  `shared.js`, `mi_turno.js` y `dashboard.js`: actualización de la evidencia de
  `SUP-009`; incorporación de `SUP-048`/`SUP-049` por resultados no verificados,
  escrituras compuestas parciales y transiciones concurrentes; alta de
  `SEC-028`/`SEC-029` por autorización y listas de estados no uniformes. Los
  caminos que sí verifican resultado o ámbito se conservaron expresamente.
  Efectos LIVE: `[NO DATA]`.
- Incorporación inmediata de `SEC-030` P0: la allowlist dinámica del middleware
  confía en `employee_ips`, pero LIVE permite CRUD anónimo sobre esa tabla. Una
  inserción directa puede autorizar el IP del atacante y, combinada con los PIN
  legibles de `employees`, atravesar el perímetro. Explotación real: `[NO DATA]`;
  no se modificaron policies, datos ni configuración LIVE.
- Auditoría del guardado central de Mi Turno en `shared.js`: incorporación de
  `SUP-050`/`SUP-051` por resultado compuesto no verificable, corrección
  destructiva no atómica y deduplicación concurrente; alta de `SEC-031` porque
  el camino global de corrección no exige propietario, ámbito ni estado previo.
  Efectos LIVE: `[NO DATA]`.
- Cierre de escrituras auxiliares de `shared.js`: ampliación de `SUP-010` y
  alta de `SUP-052` a `SUP-054` por resultados/auditoría de notas, allowlist IP
  y ajustes; incorporación de `SEC-032` por lectura de notas eludible y de
  `SEC-033` por alta financiera global fuera del flujo de caja. La creación de
  nota, IP y ajuste sí comprueba el resultado HTTP. Efectos LIVE: `[NO DATA]`.
- Contención local de `SEC-030` autorizada: creación de migración y rollback
  específicos para `employee_ips`, fixture y prueba SQL. Se verificaron
  SELECT anónimo conservado, I/U/D anónimos denegados, acceso service-role,
  respuesta HTTP local 200/401, rollback, reaplicación doble e idempotencia.
  Los objetos ficticios se retiraron; no hubo cambios LIVE.
- Contención LIVE de `SEC-030` autorizada y aplicada. El preflight confirmó
  policy `anon_all` y grants completos, incluidos `TRUNCATE`, `REFERENCES` y
  `TRIGGER`, para `anon` y `authenticated`; la migración se reforzó y volvió a
  verificarse localmente antes del corte. En LIVE quedaron únicamente policy y
  grant SELECT para `anon`, ningún privilegio para `public`/`authenticated` y
  acceso DML para `service_role`. Las 12 filas y ocho activas se conservaron;
  HTTP LIVE confirmó lectura 200 y PATCH/DELETE 401 sobre un ID inexistente.
  El rollback no se aplicó.
- Snapshot administrativo de solo lectura para `SEC-010`/`SEC-013`: `employees`
  mantiene policy `ALL` irrestricta y los siete grants de tabla para `anon` y
  `authenticated`. Hay 76 filas, 59 activas; sólo seis PIN actuales tienen seis
  cifras y 70 no. Como todos son anónimamente legibles, la rotación segura debe
  abarcar los 59 activos: 55 tienen email y cuatro requieren entrega presencial.
  No se reprodujeron valores personales ni se modificaron datos o policies.

### 2026-08-08

- Creación del registro maestro durante la auditoría de la capa Supabase.
- Incorporación de los hallazgos iniciales `ARCH-001`, `SUP-001` a `SUP-007` y
  `POS-001` a `POS-004`.
- Incorporación de la línea prioritaria de auditoría de seguridad Supabase.
- Registro de `SEC-001` a `SEC-010`.
- Creación de la matriz de accesos pendiente de completar contra Supabase LIVE.
- Incorporación de `SUP-008` y confirmación de su alcance visible para `admin`, `adjunto` y `adjunto_directivo`; autorización efectiva en Supabase todavía `[NO DATA]`.
- Revisión de `SUP-006` y `SUP-007`: ambas funciones carecen de consumidores activos en el código JavaScript auditado.
- Ampliación de evidencia de `SEC-007`, `SEC-009` y `SEC-010` mediante la auditoría de `shared.js::saveEmpleado()`; enforcement de Supabase LIVE todavía `[NO DATA]`.
- Incorporación de `UI-001`: operadores de resta confirmados en la construcción HTML de `openItemModal()`.
- Incorporación de `SUP-009`: actualización no atómica confirmada sobre `gestiones.leido_por`; incidencia efectiva en LIVE todavía `[NO DATA]`.
- Incorporación de `SUP-010`: excepciones de red no capturadas en los tres `PATCH` directos sobre `employees` de `shared.js`.
- Incorporación de `SEC-011`: controles por fila de `renderMaestro()` eludibles en `toggleEmp()` y parcialmente eludibles en `confirmarResetPin()`; enforcement LIVE todavía `[NO DATA]`.
- Incorporación de `SUP-011` y `SUP-012`: inconsistencia entre Storage y metadatos y reemplazo no atómico del array de adjuntos.
- Incorporación inicial de `SEC-012` como investigación P0 sobre exposición y policies LIVE del bucket `adjuntos`.
- Decisión explícita del usuario de priorizar la verificación LIVE de solo lectura de `SEC-012` frente a continuar primero el inventario estático.
- Confirmación LIVE de `SEC-012`: un adjunto respondió HTTP 206 sin credenciales; se solicitaron únicamente un byte y cabeceras. Ampliación de evidencia parcial de `SEC-003` y `SEC-004`; permisos de escritura y configuración interna permanecen `[NO DATA]`.
- Ampliación de `SEC-012`: siete referencias JPEG (28.490.358 bytes agregados); listado anónimo bloqueado, pero listado de tres prefijos permitido con la clave publicable incluida en el frontend.
- Clasificación visual autorizada de `SEC-012`: no se observan datos personales evidentes en los siete adjuntos actuales; sí detalles operativos internos y metadatos EXIF de dispositivo/fecha. Las copias locales se trataron como temporales para su eliminación tras la revisión.
- Incorporación de `SEC-013`: autenticación PIN íntegramente en frontend sin identidad verificable para Supabase.
- Incorporación de `SEC-014`: endpoint de correo sin autenticación ni autorización por usuario, dependiente únicamente del control de IP general.
- Ampliación P0 de `SEC-013`: PIN de rol privilegiado codificado en frontend y documentación; los valores no se reproducen en el registro.
- Ampliación de `SEC-001` y `SEC-002` con una auditoría histórica local de julio de 2026 que describe policies ampliamente permisivas; estado LIVE actual conservado como `[NO DATA]` hasta repetir la consulta.
- Decisión aprobada para `SEC-013`: conservar la experiencia de PIN mediante validación exclusiva en backend, hash, limitación de intentos y sesión segura; no conservar el mecanismo actual.
- Verificación LIVE de solo lectura de RLS y policies: 51 tablas `public`, todas con RLS; 66 policies `public`, todas permisivas; 43 tablas con CRUD anónimo efectivo, tres con lectura anónima y cinco bloqueadas sin policy.
- Confirmación P0 de `SEC-001` a `SEC-005` y `SEC-007` a `SEC-010`; ampliación LIVE de `SEC-011` con la policy y grants irrestrictos de `employees`.
- Ampliación LIVE de `SEC-012`: bucket `adjuntos` público, sin límites MIME/tamaño y con policies y grants que autorizan `SELECT`, `INSERT`, `UPDATE` y `DELETE` a la identidad anónima; no se ejecutaron mutaciones.
- Decisión de priorizar la contención de los P0 y pausar el inventario funcional restante. Se documentó en `docs/P0_SECURITY_CONTAINMENT_PLAN.md` una arquitectura basada en Supabase Auth, despliegue aditivo, prueba paralela, corte coordinado y reversión de emergencia. La elección entre sólo PIN e identificador individual más PIN permanece pendiente.
- Decisión empresarial para `SEC-013`: cada empleado seleccionará su nombre y utilizará un PIN individual de seis dígitos. Se mantienen como controles obligatorios los límites por identidad, IP y sistema, el retraso progresivo, el bloqueo temporal y la eliminación de PIN compartido.
- Creación autorizada de la rama `codex/p0-security-containment` e inicio de la implementación local aditiva. Se añadieron backend Auth, sesión con refresh token `HttpOnly`, selección empleado + PIN, cambio obligatorio de PIN temporal, transporte autenticado central, migración base y rollback no ejecutados. Los dos flags permanecen desactivados; 12 pruebas locales pasan y no se modificó Supabase LIVE.
- Decisión empresarial de entrega híbrida: correo individual para el PIN temporal cuando exista y entrega presencial cuando no exista. La rama local añade fallback presencial ante fallo del proveedor.
- Ampliación local de la contención: alta/reset autorizados por rol, ámbito y fila; PIN aleatorio server-side, huella HMAC única, caducidad predeterminada de 24 horas, cambio obligatorio, rate limit administrativo y versión de autorización para rechazar tokens anteriores. `/api/send-email` queda 404 en modo seguro. Los flags continúan desactivados; 19 pruebas pasan y Supabase LIVE no fue modificado.
- Ampliación local de `SEC-007`, `SEC-009` y `SEC-011`: edición, activación/baja y eliminación del maestro pasan por backend en modo seguro. Los cambios de autorización rotan versión; la eliminación requiere admin, Baja, auditoría previa y no permite autoeliminación. El total asciende a 20 pruebas; flags desactivados y LIVE sin cambios.
- Cierre trazable de `adjuntos.js` mediante los hallazgos ya confirmados `SUP-011` y `SUP-012`.
- Auditoría de escrituras de `caja.js`: guardados principales con comprobación HTTP, captura e invalidación; ampliación de `SUP-010` y alta de `SUP-013` por confirmación/auditoría falsa y `SEC-015` por transiciones financieras protegidas sólo por UI. Efectos reales LIVE conservados como `[NO DATA]`.
- Auditoría de la escritura de `dashboard.js`: incorporación de `SUP-014` porque “Guardar cuadrante” maneja correctamente errores y caché, pero no puede persistir con la identidad actual al estar `cuadrantes` bloqueada por RLS sin policies; el ámbito empresarial permitido permanece pendiente de definir.
- Auditoría de las escrituras de `faults.js`: incorporación de `SUP-015` como P3 porque el manejo de resultados es defectuoso, pero el archivo, su pantalla y sus funciones carecen de consumidores activos; tablas LIVE actuales conservadas como `[NO DATA]`.
- Auditoría de escrituras de `incentivos.js`: ampliación de `SUP-010` y alta de `SUP-016` a `SUP-018` por falso éxito en costes, reemplazo Excel no atómico y liquidación parcial; incorporación de `SEC-016` por autorización eludible y parámetros financieros confiados al cliente. Dos destinos permanecen bloqueados por RLS y los efectos reales se conservan como `[NO DATA]`.
- Auditoría de escrituras de `informes.js`: incorporación de `SUP-019` a `SUP-022` por reemplazos no atómicos, borrado compuesto parcial, inconsistencia informe/estado y configuración financiera con falso éxito; alta de `SEC-017` por operaciones globales sin revalidación uniforme. No se ejecutaron escrituras LIVE.
- Auditoría de escrituras de `mantenimiento.js`: ampliación de `SUP-010` y alta de `SUP-023`/`SUP-024` por confirmación falsa y transiciones sin control de concurrencia. Las funciones sí revalidan actor y departamento; el `DELETE` comprueba HTTP. Incidencias LIVE conservadas como `[NO DATA]`.
- Auditoría de escrituras de `merma.js`: incorporación de `SUP-025`/`SUP-026` por alta con confirmación falsa y falta de idempotencia; alta de `SEC-018` porque la función global no reproduce el ámbito del control visual. El borrado legacy carece de consumidor activo. Efectos LIVE conservados como `[NO DATA]`.
- Auditoría de la escritura de `mi_rendimiento.js`: incorporación de `SUP-027` porque la liquidación valida rol, HTTP, excepciones y caché, pero no cardinalidad ni transición previa y puede confirmar cero filas o sobrescribir una liquidación repetida. Efectos LIVE conservados como `[NO DATA]`.
- Cierre trazable de las escrituras de `posmews_ventas.js`: ampliación de `POS-001`, `POS-002` y `SEC-005` con consumidores, feedback, caché y autorización frontend; no se ejecutaron mutaciones LIVE.
- Auditoría de escrituras de `recepcion.js`: incorporación de `SUP-028` a `SUP-030` por confirmaciones falsas, lote cross-sell parcial y concurrencia financiera; alta de `SEC-019` por controles de función inconsistentes y estados manipulables. Efectos reales LIVE conservados como `[NO DATA]`.
- Auditoría de escrituras de `syncrolab.js`: incorporación de `SUP-031` a `SUP-034` por guardado compuesto no verificable, FK incoherente, concurrencia y objetos de Storage huérfanos; alta de `SEC-020` por autorización sólo de navegación y `UI-002` por helpers de fotos inexistentes. Efectos y configuración LIVE no comprobados se conservan como `[NO DATA]`.
- Auditoría de escrituras de `tareas.js`: ampliación de `SUP-010`, incorporación de `SUP-035`/`SUP-036` por confirmación falsa y transiciones concurrentes, y alta de `SEC-021` por reapertura sin autorización y campos de identidad controlados por el cliente. Efectos reales LIVE conservados como `[NO DATA]`.
- Auditoría de escrituras de `validacion.js` y su consumidor `doValidacion()` en `shared.js`: ampliación de `SUP-010`, incorporación de `SUP-037` a `SUP-041` por borrados parciales, confirmaciones falsas, FIO/merma no atómicos y carreras de estado; alta de `SEC-022` por funciones de validación globales sin autorización interna uniforme. Efectos reales LIVE conservados como `[NO DATA]`.
- Cierre del inventario HTTP con Bitrix: incorporación de `ARCH-002` y `BIT-001` por divergencia entre la v4 raíz y la v3 realmente desplegable, y `BIT-002` por semántica de éxito parcial del job. Las llamadas POST a Bitrix son lecturas de su API y validan HTTP/error; el helper Supabase server-side también lanza ante HTTP fallido. Versión y efectos LIVE conservados como `[NO DATA]`.
- Verificación SQL local autorizada de `SEC-013`: instalación de PostgreSQL 17.10, creación de dos bases aisladas sin TCP, aplicación repetida de la migración base, pruebas de RLS/grants/contexto/unicidad/rate limit/auditoría y verificación separada del rollback. Se añadió una colisión simulada de PIN a las 20 pruebas JavaScript. En ese paso el E2E Auth/PostgREST aún no se había ejecutado; no hubo mutaciones LIVE.
- Verificación E2E local de `SEC-013` con Supabase Auth/PostgREST/Kong: usuario y empleado ficticios, PIN temporal aleatorio de seis dígitos, cambio obligatorio, revocación del PIN y sesión anteriores, nuevo login, auditoría y ausencia de PIN en claro. `anon` recibió HTTP 401 sobre `employees` e identidades. El stack fue reiniciado con API, DB y Mailpit vinculados sólo a `127.0.0.1`. El esquema operativo completo y los efectos LIVE permanecen `[NO DATA]`; no hubo mutaciones LIVE.
- Tras el merge local de `main`, incorporación de `SEC-023`: la nueva restricción frontend de jefes SYNCROLAB por subdepartamento no está reproducida en `lib/authz-server.js`, que concede el grupo completo a `rol='jefe'`. Los flags siguen apagados, no se modificó LIVE y la explotación permanece `[NO DATA]`.
- Rectificación local de `SEC-023`: el backend deriva el subdepartamento efectivo para actor y objetivo, aplica ámbitos separados de Recepción SYNCROLAB, Entrenadores y Fisioterapia/Clínica y añade pruebas cruzadas de alta, edición y reset. Pasan 22 pruebas ordinarias y el E2E Supabase; no hubo despliegue ni mutaciones LIVE.

### 2026-08-10

- Preparación del corte: Vercel conserva el flujo nuevo apagado,
  pero ya tiene configuradas para Production y Preview las seis variables Auth
  nuevas, incluidas dos claves aleatorias que no se escribieron en archivos,
  consola ni documentación. No se desplegó código en este paso.
- Aplicación LIVE autorizada de
  `202608080001_p0_auth_foundation.sql`. El preflight confirmó ausencia de los
  tres recursos; el postflight confirmó tres tablas con RLS, cero identidades,
  ausencia de acceso directo para `anon` y `authenticated`, DML reservado a
  `service_role` y contexto ejecutable por sesiones autenticadas. No se tocaron
  `employees`, PIN legacy ni policies operativas.
- Verificación y endurecimiento de Auth LIVE: longitud mínima exacta de seis
  caracteres confirmada; altas públicas, enlace manual y acceso anónimo Auth
  quedaron desactivados. La tabla de identidades continúa vacía y el flujo
  legacy de empleados no cambió.
- Implementación local del aprovisionamiento inicial reiniciable: distingue
  altas, PIN temporal pendiente, identidad inactiva y acceso completado; no
  devuelve PIN enviados por correo y separa las entregas presenciales. Pasan 28
  pruebas ordinarias, una E2E Supabase real y todas las comprobaciones de
  sintaxis/whitespace. El corte de RLS, identidades y código sigue pendiente.
- Commit `4009869` creado, rama `codex/p0-security-containment` publicada y
  `main` avanzado sin conflicto. Vercel verificó `Ready` tanto en Preview como
  en Production. El dominio canónico cargó portal y aplicación con
  `SyncroAuth.enabled === false`; no se activaron identidades ni RLS nuevas.
- Incorporación de `SEC-034`: el RPC LIVE huérfano
  `sync_shifts_horas_from_bitrix()` permite a `public`, `anon` y
  `authenticated` lanzar una actualización masiva de horas. No amplía el CRUD
  anónimo P0 ya confirmado sobre `shifts`; abuso o ejecución real: `[NO DATA]`.
- Implementación local del endpoint autenticado `GET /api/auth/employees` y
  sustitución de la lectura directa de `employees` en modo seguro. Las
  respuestas excluyen siempre el PIN y aplican campos por rol, ámbito y fila.
- Creación y verificación local de la contención intermedia
  `202608100002_p0_authenticated_containment.sql`: aplicada dos veces en una
  base aislada, retiró acceso anónimo, reservó `employees`/`employee_ips` al
  backend, bloqueó el RPC huérfano y exigió contexto Auth vigente. El rollback
  restauró grants y RPC; la base de prueba se eliminó. Su riesgo residual queda
  explícito: usuarios autenticados mantienen CRUD directo sobre las restantes
  tablas hasta completar las reglas empresariales por rol/fila. LIVE aún no se
  modificó con esta migración.
- El preflight final detectó la vista pública `hk_incidencias_detalle`, ausente
  del inventario de 51 tablas. Se incorporó `SEC-035`, se amplió la migración
  para retirar su SELECT anónimo explícitamente y se añadió cobertura de vista
  `security_invoker`. La prueba local detectó y corrigió además el tratamiento
  del grantee especial `PUBLIC` en rollback; doble aplicación y reversión
  completa quedaron `VERIFICADO`. LIVE aún no se modificó con esta migración.
- Corte Auth LIVE ejecutado: se crearon 59 identidades activas con huellas de
  PIN únicas; 55 entregas definitivas por correo y cuatro entregas presenciales
  se completaron sin fallo. El archivo presencial quedó fuera del repositorio,
  con modo `0600`. Dos ejecuciones parciales previas fueron invalidadas por una
  rotación final; cualquier correo anterior quedó obsoleto y sólo sirve el más
  reciente. No se reproducen nombres, correos ni PIN en este registro.
- Vercel activó `SYNCRO_AUTH_ENABLED=true`; el commit `dc5b70d` activó el
  cliente y quedó `Ready` en Production. El portal mostró seis posiciones de
  PIN, el directorio backend respondió HTTP 200 y el correo legacy quedó 404.
- Aplicación LIVE de `202608100002_p0_authenticated_containment.sql` después de
  publicar `fce70f8`. El postflight confirmó 51/51 tablas con ceiling de sesión,
  49 policies autenticadas intermedias, cero grants anónimos, cero acceso
  autenticado directo a `employees`/`employee_ips`, RPC sólo `service_role` y
  vista sin acceso de navegador. Se conservaron 76 empleados, 12 IP y 59
  identidades; 58 seguían con cambio obligatorio, por lo que al menos una ya
  completó el flujo LIVE. HTTP anónimo devolvió 401 sobre `employees`,
  `shifts`, `employee_ips` y `hk_incidencias_detalle`. Rollback LIVE no aplicado.
