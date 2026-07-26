# Trampas Confirmadas — SYNCRO SHIFT

Errores que ya causaron bugs en producción. Verificados contra el código actual (2026-07-26).

---

## T1 · Timestamps de escritura
**Usar siempre `localTs()`** (ISO con +02:00). **NUNCA `new Date().toISOString()`** — genera UTC y rompe filtros por fecha en Madrid. `localTs()` está en `shared.js:249`.

## T2 · audit_log — columnas correctas
`id / ts / usuario / rol / action / detail` (+ `usuario_id`, `tabla`, `registro_id`).
**NO existen:** `accion`, `detalle`, `created_at`. Usar nombres incorrectos = INSERT silencioso fallido.

## T3 · PATCH employees = fetch directo
Siempre con header `Prefer: return=minimal`. **No usar `sbRequest`** para PATCH employees — `sbRequest` con `return=minimal` suprime el body de respuesta, lo que confunde si necesitas leer el resultado.

## T4 · DELETE = audit_log ANTES + admin + confirmación
Secuencia obligatoria: (1) insertar `audit_log`, (2) confirmar con el usuario, (3) ejecutar DELETE. Solo `canActAsAdmin` puede borrar.

## T5 · invalidateCache(table) tras escritura
Toda operación POST/PATCH/DELETE debe llamar `invalidateCache(table)` después. Si no, la UI muestra datos stale del cache en memoria.

## T6 · Sin ES modules — última definición gana
No hay `import`/`export`. Todo vive en `window`. Si dos archivos definen la misma función, el que carga último en `index.html` gana **sin error ni warning**.

**Caso real:** `adjuntos.js` (carga en posición 23-24) sobreescribe 8 funciones de `shared.js` (posición 1): `_doSaveTurno`, `openNewGestionStandalone`, `saveNewGestionStandalone`, `openNewIncidenciaStandalone`, `saveNewIncidenciaStandalone`, `renderGestionesScreen`, `renderIncidenciasScreen`, `renderFollowupList`.

**Regla:** Antes de crear/editar una función, `grep` en TODOS los .js del repo para verificar que no existe en otro archivo.

## T7 · var hoisting en getScreens()
En `getScreens(rol)` de `shared.js`, los arrays `miDia`, `miDpto`, `gestion` se declaran con `var` secuencialmente. Colocar un `.push()` antes de la línea `var gestion = []` causa `TypeError: Cannot read properties of undefined (reading 'push')` — `var` hoistea la declaración pero NO la asignación, así que el array es `undefined` en ese punto. **Resultado: nav completamente en blanco, sin error visible en UI.**

**Regla:** Siempre verificar orden de declaración antes de añadir `.push()` en `getScreens()`.

## T8 · openShiftDetail está huérfana
`openShiftDetail` en `validacion.js` **nunca se invoca**. El modal de validación real es `openValidarModal` en `shared.js`. Editar `openShiftDetail` no tiene efecto visible.

## T9 · POSMEWS — detección por contenido, no por nombre
POSMEWS exporta TODOS los CSV como `Acumulativo_YYYYMMDD-YYYYMMDD.csv` independientemente del contenido. La clasificación por nombre de archivo es **imposible**. Usar funciones `detect()` que analizan las cabeceras del CSV:
- **Facturas:** primera línea contiene `Fecha` + `Usuario` + `Total`
- **Pagos/Acumulativo:** contiene `Métodos de pago` + `Usuarios` pero NO `Ventas netas`

## T10 · Fecha operativa ≠ fecha calendario
- `_recFechaOperativa(turno)` en `recepcion.js:235` — cutoff hora 7 → turno de noche devuelve ayer.
- `_salaFechaOperativa()` en `caja.js:267` — cutoff hora 2.
- Usar en todas las referencias operativas de `today()`. Los timestamps de audit van con fecha real.

## T11 · Entrenadores: area='SYNCROLAB' compartida
Entrenadores y Recepción SYNCROLAB comparten `area='SYNCROLAB'`. Toda detección de departamento para entrenadores **debe usar `puesto`**, no `area`. Helpers: `_esEntrenador(emp)`, `_deptCatalogo(emp)` en `shared.js`.

## T12 · _cajaCorrectMode definida en 5 archivos
`window._cajaCorrectMode` se asigna en: `shared.js`, `caja.js`, `recepcion.js`, `syncrolab.js`, `validacion.js`. Como es una variable (no función), cada asignación sobreescribe. Tener cuidado con el timing de quién escribe último.

## T13 · Ctrl+A en GitHub web editor
Al pegar archivos completos (workflow habitual de deploy), Ctrl+A selecciona TODO el contenido del editor. Si pegas sin haber seleccionado todo, el código se **concatena** en lugar de reemplazar. Verificar siempre que una función conocida (ej. `registrarLecturaGestion`) está presente tras pegar.

## T14 · sbRequest con return=minimal suprime body
`sbRequest` con header `Prefer: return=minimal` **no devuelve datos** en la respuesta. Para lecturas que necesitan el body, usar `fetch` directo o `dbGetAll`.

## T15 · dept_incentive_rules — nombres de columna
Columna de objetivo: **`objetivo`** (no `objetivo_ventas`). Columna de auditoría: **`updated_by`** (no `updated_at`). Equivocarse = writes silenciosos que no llegan.

## T16 · "MUSE" = MEWS
En conversaciones, screenshots y docs legacy aparece "MUSE" — es siempre MEWS (el PMS). Nunca usar portugués en código ni UI.

## T17 · Semanas Sala: domingo→sábado
Las semanas de producción Sala corren de domingo a sábado. Una semana pertenece al mes de su domingo. Ej: semana 26/04→02/05 = semana de abril. `incDistribuirPorSemana` usaba ISO (lunes) y fue corregido a domingo.

## T18 · adjuntos.js cargado 2 veces
En `index.html` líneas 2522-2523, `adjuntos.js` aparece dos veces. No causa error funcional (segunda carga es idempotente), pero sí desperdicia una request HTTP.
