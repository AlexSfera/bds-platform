# 13 — Merma (Cocina · Friegue · FnB)

**Actualizado:** 2026-07-31 — verificado contra `merma.js` y `esquema-supabase.md`
**Módulo JS:** `merma.js` (26 KB, 23 fns)
**Tablas:** `merma`, `productos_compra` (lectura), `platos_carta` (lectura), `escandallo_lineas` (lectura)

---

## 1. Definición

Merma = pérdida de producto por cualquier causa: caducidad, error de producción, accidente, almacenamiento, devolución. Es un registro operativo y KPI de los departamentos con manipulación de alimentos.

Merma NO es incidencia. Son registros independientes con tablas y ciclos de vida separados.

---

## 2. Visibilidad — departamentos con acceso

```javascript
var MERMA_DEPTS = ['Cocina', 'Friegue', 'FnB'];
```

Dos funciones de permiso:

| Función | Quién pasa | Propósito |
|---|---|---|
| `canRegistrarMerma(u)` | Admin + empleados de Cocina/Friegue/FnB | Crear registros de merma |
| `canGestionarMerma(u)` | Admin + cualquier `isSupervisor(u)` | Ver todo, filtrar, gestionar precios |

El cocinero/empleado solo ve merma de **su departamento** y **del día actual**. El manager ve todo sin filtro.

---

## 3. Tabla Supabase: `merma`

Columnas escritas por `saveMerma()`:

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT PK | ✅ | `genId()` |
| `fecha` | TEXT | ✅ | `today()` YYYY-MM-DD |
| `producto` | TEXT | ✅ | Nombre del producto o plato seleccionado |
| `tipo` | TEXT | ✅ | `'producto'` o `'plato'` |
| `producto_id` | UUID | — | FK a `productos_compra.id` (solo si tipo=producto) |
| `plato_id` | UUID | — | FK a `platos_carta.id` (solo si tipo=plato) |
| `cantidad` | NUMERIC | ✅ | Cantidad perdida |
| `unidad` | TEXT | ✅ | `g` · `ml` · `unidades` · `raciones` (calculada por `_mermaGetUnidadLabel`) |
| `causa` | TEXT | ✅ | Una de `MERMA_CAUSAS` |
| `notas` | TEXT | — | Descripción adicional (textarea libre) |
| `coste_unitario` | NUMERIC | ✅ | Calculado automáticamente (5 decimales) |
| `coste_total` | NUMERIC | ✅ | `coste_unitario × cantidad` (2 decimales) |
| `nombre` | TEXT | ✅ | `currentUser.nombre` |
| `empleado_id` | TEXT | — | `currentUser.id` |
| `departamento` | TEXT | ✅ | `currentUser.area` (Cocina/Friegue/FnB) |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` |
| `updated_at` | TIMESTAMPTZ | ✅ | `localTs()` |

Columnas en esquema adicionales (lecturas): `shift_id`, `employee_id`, `area`.

---

## 4. Causas de merma (`MERMA_CAUSAS`)

```javascript
var MERMA_CAUSAS = [
  'Caducidad / fecha vencida',
  'Mal almacenamiento',
  'Error de producción',
  'Exceso de producción',
  'Rotura / accidente',
  'Deterioro por temperatura',
  'Devolución cliente',
  'Control de calidad',
  'Otra causa'
];
```

---

## 5. Búsqueda dual de productos (`mermaSearchProducto`)

El buscador busca simultáneamente en dos tablas y devuelve resultados mixtos:

| Tabla | Método | Límite | Campos usados |
|---|---|---|---|
| `productos_compra` | Server-side `ilike` en `nombre_busqueda` | 8 resultados | id, nombre, categoria, unidad_compra, unidad_escandallo, coste_por_g, coste_unidad_compra, cantidad_unidad_g, merma_pct |
| `platos_carta` | Client-side filter sobre cache local | 4 resultados | id, nombre, nombre_busqueda, categoria, precio_venta |

Búsqueda con debounce 250ms. Mínimo 2 caracteres. Normalización: minúsculas sin tildes (NFD + strip diacritics).

---

## 6. Cálculo automático de coste (`_mermaCalcCoste`)

| Tipo | Fórmula |
|---|---|
| **Plato** | `cantidad × PVP × 0.30` (food cost estándar 30%) |
| **Producto con coste_por_g** | `cantidad × coste_por_g` |
| **Producto con coste_unidad + cantidad_unidad_g** | `cantidad × (coste_unidad / cantidad_unidad_g)` |
| **Producto solo coste_unidad** (vinos, etc.) | `cantidad × coste_unidad` |
| **Sin datos de coste** | `0` |

El coste se muestra en tiempo real al escribir la cantidad. No se necesita asignación manual de precio — es automático desde el catálogo.

---

## 7. Funciones expuestas (window.*)

| Función | Propósito |
|---|---|
| `renderMermaScreen()` | Pantalla principal: botón +Añadir, filtros (si manager), tabla |
| `openMermaModal()` | Abre modal de registro con buscador |
| `closeMermaModal()` | Cierra modal |
| `saveMerma()` | Valida, calcula coste, inserta en Supabase, auditLog |
| `mermaSearchProducto(query)` | Búsqueda dual productos + platos |

Internas relevantes: `_mermaBuscarDebounce`, `_mermaSeleccionar`, `_mermaActualizarCoste`, `_mermaCalcCoste`, `_mermaFormatCoste`, `_mermaGetUnidadLabel`, `_renderMermaTabla`, `_mermaRefresh`.

---

## 8. Vista por rol

**Cocinero/empleado:** tarjetas simples con producto, cantidad, causa, hora. Solo datos de su departamento y del día.

**Manager/supervisor:** tabla completa con fecha, producto (badge "Plato" si aplica), cantidad, causa, coste (⚠ "Sin coste" en naranja si = 0), departamento, empleado. Filtros por causa y fecha.

---

## 9. KPIs de merma en dashboard

| KPI | Cálculo |
|---|---|
| Merma total € | `SUM(coste_total)` del periodo |
| Merma por producto | `GROUP BY producto` — top productos |
| Merma por empleado | `GROUP BY empleado_id` |
| Merma por departamento | `GROUP BY departamento` (Cocina/Friegue/FnB) |
| Merma sin coste | `COUNT WHERE coste_total = 0` |

---

## 10. Reglas operativas

- El coste se calcula automáticamente desde `productos_compra` o `platos_carta` — no manual
- La merma se registra durante el turno desde "Mi Turno" o desde la pantalla Merma
- No genera tareas ni incidencias automáticamente
- El modal inyecta su HTML en `document.body` al cargar `merma.js` (`_mermaEnsureModal`)
- Tras guardar: `invalidateCache('merma')` + `auditLog('MERMA_REGISTRADA', ...)`
- Cache de platos y productos se limpia tras guardar para forzar recarga

---

## 11. QA

```
□ Merma visible para Cocina, Friegue Y FnB (no solo Cocina)
□ Merma NO visible para Sala, Recepción, Housekeeping, Mantenimiento, SYNCROLAB
□ Cocinero solo ve merma de su departamento + solo del día
□ Manager/admin ve todo con filtros
□ Buscador encuentra productos por nombre (ilike server-side)
□ Buscador encuentra platos de carta (filter client-side)
□ Badge "Plato" aparece para items tipo plato
□ Coste se calcula automáticamente al seleccionar producto y poner cantidad
□ Platos: coste = PVP × 0.30 × cantidad
□ Productos: coste desde coste_por_g o coste_unidad
□ Unidad cambia automáticamente: g, ml, unidades, raciones
□ Causa es select con 9 opciones (no texto libre)
□ created_at en hora local España (localTs)
□ audit_log se escribe tras guardar
□ invalidateCache('merma') tras escritura
```
