# HANDOFF — Módulo Ventas/Datos POSMEWS (SYNCRO SHIFT)

Fecha: 2026-08-04 | Autor: sesión Claude Cowork

---

## 1. QUÉ SE HIZO (Fase 1 — COMPLETADA)

### Archivos creados/modificados (todos en GitHub + Vercel)

| Archivo | Acción | Líneas | Estado GitHub |
|---|---|---|---|
| `posmews_ventas.js` | NUEVO | 445 | ✅ Subido |
| `informes.js` | MODIFICADO | 2145 | ✅ Subido |
| `index.html` | MODIFICADO (3 script tags) | — | ✅ Subido |

### Tablas Supabase creadas (proyecto `tsfhrpdpbkciofvejrao`, LIVE)

1. **`posmews_upload_batches`** — 1 batch = 1 semana (dom→sáb)
   - Columnas: `id`(text PK), `week_start`(date), `week_end`(date), `periodo`(text, UNIQUE con version), `status`(check: pending/processing/complete/error), `uploaded_by`, `uploaded_at`, `processed_at`, `version`(int default 1), `replaced_batch_id`(FK self), `validation_summary`(jsonb)

2. **`posmews_upload_files`** — tracking de cada archivo dentro del batch
   - Columnas: `id`(text PK), `batch_id`(FK CASCADE), `report_type`(check: facturas/acumulativo_ventas/acumulativo_pagos/compensaciones/descuentos), `original_name`, `format`(check: csv/xlsx), `status`(check: pending/ok/error), `error_message`, `row_count`, `parsed_at`
   - UNIQUE(batch_id, report_type)

3. **`posmews_sales_data`** — datos de ventas parseados (Facturas CSV + Acumulativo Ventas XLSX)
   - Columnas: `id`(text PK), `batch_id`(FK CASCADE), `source`(check: acumulativo_ventas/facturas), `business_date`, `item_name`, `category`, `sub_category`, `revenue_centre`, `revenue_centre_mapped`(check: Restaurante/Pensiones/Eventos/Syncrolab), `qty_sold`, `gross_sales`, `discounts`, `net_sales`, `invoice_number`, `cashier`, `employee_id`, `payment_method`, `is_cancelled`, `tip`

4. **`posmews_payments_data`** — acumulativo de pagos semanal
   - Columnas: `id`(text PK), `batch_id`(FK CASCADE), `week_start`, `week_end`, `payment_method`, `payment_count`, `payment_total`, `gratuities_total`, `gross_sales`, `refunds_total`

5. **`posmews_adjustments`** — comps, voids, descuentos
   - Columnas: `id`(text PK), `batch_id`(FK CASCADE), `adjustment_type`(check: comp/void/discount), `business_date`, `revenue_centre`, `reason`, `cashier`, `item`, `qty`, `subtotal`, `total`, `invoice_number`, `discount_pct`, `notes`

Todas con RLS enabled + `anon_all` policy (USING true WITH CHECK true). Índices en batch_id, business_date, revenue_centre_mapped, adjustment_type, periodo.

### Cambios en `index.html` (líneas ~2520-2522, antes de informes.js)

```html
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script src="posmews_ventas.js"></script>
<script src="informes.js"></script>
```

Orden crítico: SheetJS → posmews_ventas.js (define `_PV_FILE_TYPES`) → informes.js (fallback `_INF_FILE_TYPES`).

### Cambios en `informes.js`

1. **Línea 295**: Routing ventas → `renderPosmewsVentas(tc)` cuando dept=Sala
2. **`_INF_FILE_TYPES`**: Reemplazado con fallback: `var _INF_FILE_TYPES = (typeof _PV_FILE_TYPES !== 'undefined') ? _PV_FILE_TYPES : [];`
3. **`_renderInformesSala()`** (línea 630): REESCRITA — ya no tiene upload panel, muestra KPI header con navegador semanal (◄►), llama a `_infLoadSalaFromDB()`
4. **`_infLoadSalaFromDB()`** (línea 666): NUEVA — carga de `sala_produccion_semanal` por periodo, reconstruye formato `{fechas, usuarios, porUsuario}` para `_renderSalaTabla()`
5. **`_infShiftKpiWeek()`** + `_infKpiPrev`/`_infKpiNext`** (líneas 653-662): Navegación semanal independiente para KPI
6. **`_renderVentasDatos()`**: ELIMINADA (movida a posmews_ventas.js)
7. **Código dead** (funciones huérfanas): `_infControlDrop`, `_infControlFiles`, `_infControlValidateFile`, `_renderControlBody`, `_infLoadControlTicks`, `_infControlSaveTick`, `_infControlPrev/Next`, `_infShiftControlWeek` — referenciaban `_INF_FILE_TYPES` fallback, no rompen pero deberían limpiarse

### `posmews_ventas.js` — Estructura completa

- `_PV_FILE_TYPES` (5 tipos con detección):
  - CSV: por headers (Fecha+Usuario+Total)
  - XLSX: por nombre (`/acumulativo/i`, `/compensacion|anulacion/i`, `/descuento/i`)
  - Disambiguación Acumulativo: SheetJS `XLSX.read()` → ≥3 sheets = Ventas, <3 = Pagos
- `renderPosmewsVentas(el)` — render principal (dropzone + 5 tarjetas + instrucciones colapsables)
- Batch management: `_pvEnsureBatch`, `_pvLoadBatch`, `_pvCheckBatchComplete`
- Validación: `_pvValidateFile` (tipo + extensión + fechas 7 días + coincidencia semana + contenido)
- Upload UI: `_pvRenderControlBody`, `_pvDrop`, `_pvFiles`
- Legacy: `_pvSaveLegacyTick` → escribe en `sala_informes_control` para compatibilidad KPI
- Auto-parse: Facturas CSV → `_infParsePOSMEWS()` → `_renderSalaTabla()` (preview producción por camarero)
- Helpers: `_pvReadText`, `_pvReadArrayBuffer`, `_pvGetWeekOf`, `_pvFmtDate`, `_pvExtractDates`, `_pvIs7Days`

---

## 2. QUÉ FALTA (Fase 2 — PENDIENTE)

### 2A. Parsers XLSX (escriben a las 3 tablas de datos)

Los archivos se validan y registran en `posmews_upload_files`, pero **no se parsean** a las tablas de datos. Faltan 4 parsers:

| Archivo POSMEWS | Parser | Tabla destino |
|---|---|---|
| Acumulativo Ventas XLSX | `_pvParseAcumulativoVentas(wb)` | `posmews_sales_data` |
| Acumulativo Pagos XLSX | `_pvParseAcumulativoPagos(wb)` | `posmews_payments_data` |
| Compensaciones XLSX | `_pvParseCompensaciones(wb)` | `posmews_adjustments` (type=comp/void) |
| Descuentos XLSX | `_pvParseDescuentos(wb)` | `posmews_adjustments` (type=discount) |

Cada parser debe:
1. Leer con SheetJS (`XLSX.read()` + `XLSX.utils.sheet_to_json()`)
2. Mapear columnas del XLSX a columnas de la tabla
3. Hacer INSERT batch a Supabase
4. Actualizar `row_count` en `posmews_upload_files`

Para Facturas CSV ya existe el auto-parse (`_infParsePOSMEWS()`) pero **solo genera preview en pantalla** — también debería escribir a `posmews_sales_data`.

### 2B. Dashboard `posmews_dashboard.js`

Nuevo módulo propuesto en el documento de análisis:
- **4 centros de ingreso**: Restaurante, Pensiones, Eventos, SYNCROLAB
- Gráficos (Chart.js): barras por semana, tendencia, distribución métodos de pago
- Filtros: por método de pago, por periodo, por centro de ingreso
- KPIs: ventas brutas, netas, descuentos, comps/voids, propinas
- Lee de `posmews_sales_data`, `posmews_payments_data`, `posmews_adjustments`

### 2C. Limpieza de código muerto en informes.js

Funciones huérfanas que ya no se llaman (el upload se movió a posmews_ventas.js):
- `_infControlDrop`, `_infControlFiles`, `_infControlValidateFile`
- `_renderControlBody` (la de informes.js, no la de posmews_ventas.js)
- `_infLoadControlTicks`, `_infControlSaveTick`
- `_infControlPrev`, `_infControlNext`, `_infShiftControlWeek`
- `_readFileArrayBuffer` (reemplazado por `_pvReadArrayBuffer`)

### 2D. Actualizar esquema-supabase.md

Añadir las 5 tablas nuevas a la documentación del esquema.

---

## 3. DECISIONES TÉCNICAS CLAVE

1. **Upload unificado**: Todo el upload está en Ventas/Datos (posmews_ventas.js). KPI en informes.js solo lee de DB (`sala_produccion_semanal`). No hay uploads duplicados.

2. **Pensiones = método de pago, no Revenue Centre**: Toda la facturación sale por RC "Restaurante". Los extras (café, alcohol) van aparte como Room Charge/Tarjeta/Efectivo = Restaurante. El campo discriminador es `payment_method = 'Pensiones'`.

3. **Disambiguación Acumulativo XLSX**: Ambos archivos tienen "acumulativo" en el nombre. Se distinguen por nº de hojas SheetJS: ≥3 = Ventas, <3 = Pagos.

4. **Columna duplicada "Tarjeta - Importe" en Facturas CSV**: col[17] siempre 0, col[21] tiene dato real. El parser usa col[21].

5. **Discrepancia ventas brutas vs pagos**: Sales=16,259.84€ vs Payments=15,666.32€. Diferencia = comps/voids. Total recaudado coincide: 15,648.40€.

6. **Métodos de pago conocidos**: Efectivo, Tarjeta, Pensiones, Room Charge, Stripe Deposit, Transferencia bancaria.

7. **Tipos de descuento**: Alexander 70%, Syncrolab 10%, Empleados 15%.

8. **Legacy**: `_pvSaveLegacyTick()` escribe a `sala_informes_control` para que el KPI existente siga funcionando.

9. **Sin ES modules**: Todo en `window`. `localTs()` para timestamps. `invalidateCache()` después de escritura.

---

## 4. DOCUMENTO DE REFERENCIA

`/docs/POSMEWS_Ventas_Datos_Analisis_Previo.html` — análisis pre-desarrollo aprobado. Contiene la arquitectura de referencia (2 módulos JS + 5 tablas normalizadas). Es la fuente de verdad para decisiones de diseño.

---

## 5. STACK Y REGLAS

- HTML + JS vanilla modular, sin frameworks/npm/build
- Supabase PostgREST como API (proyecto: `tsfhrpdpbkciofvejrao`)
- Vercel auto-deploy desde GitHub (repo: `AlexSfera/syncro_hub`)
- SheetJS v0.20.3 CDN para parseo XLSX browser-side
- Batch model: 1 batch = 1 semana, versionado, 5 archivos tracked
- Timestamps: siempre `localTs()` (ISO +02:00), NUNCA `new Date().toISOString()`
- PATCH employees: fetch directo con `return=minimal`
- DELETE: `audit_log` ANTES + solo admin + confirmación
- Tras escritura: `invalidateCache(table)`
- `audit_log` columnas: `id/ts/usuario/rol/action/detail`

---

## 6. PRÓXIMO PASO INMEDIATO

Empezar por **2A: parsers XLSX**, específicamente necesitas muestras reales de cada XLSX para mapear columnas. Pide a Alexander que suba un ejemplo de cada uno de los 4 XLSX o que te muestre las columnas/headers de cada archivo.
