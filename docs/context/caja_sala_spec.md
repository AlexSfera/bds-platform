# SYNCRO HUB — Especificación Técnica: Caja Sala

**Versión:** 1.0  
**Proyecto:** SYNCRO HUB — SYNCROSFERA Health Sport Hotel  
**Stack:** HTML + JS vanilla · Supabase · Vercel  
**Tabla Supabase:** `sala_cash_closures`  
**Archivo JS:** `caja.js`  
**Modal HTML:** `#modal-caja` en `index.html`

---

## 1. PROPÓSITO

El módulo Caja Sala permite al responsable de turno de Sala registrar el cierre económico diario, comparando los valores del sistema POSMEWS con los valores físicos reales contados. Genera diferencias automáticas, controla el traspaso de fondo entre turnos y alimenta el Dashboard con datos de conciliación.

---

## 2. ACCESO Y PERMISOS

### Quién puede acceder

| Rol | Ver lista | Crear cierre | Editar | Validar | Eliminar |
|---|---|---|---|---|---|
| `empleado` (Sala) | Solo propios | ✅ | Solo propios pendientes | ❌ | ❌ |
| `fb` | Todos | ✅ | Todos | ✅ | ❌ |
| `admin` | Todos | ❌ | Todos | ✅ | ✅ |
| `chef` | Todos | ❌ | ❌ | ❌ | ❌ |

### Reglas de negocio de acceso

- El empleado de Sala **NO tiene botón "Cierre Caja" en el topbar**. Solo accede al formulario como oferta al finalizar su turno (modal `modal-caja-offer`).
- Un empleado solo puede **editar su propio cierre** si está en estado `Pendiente validación` o `Pendiente Sala`.
- Cierres en estado `Validado final` o `Cuadrado Sala` — botón editar muestra `—` para empleados.
- Admin **NO ve** "Mi Turno" ni "Cierre Caja" en su navegación.

---

## 3. ESTRUCTURA DEL FORMULARIO — 7 BLOQUES

### BLOQUE 1 · FONDO INICIAL

| Campo | ID HTML | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Fecha | `caja-fecha` | `date` | ✅ | Se rellena automáticamente con `today()` |
| Fondo recibido del turno anterior (€) | `caja-fondo-ini` | `number` readonly | — | Se carga async desde `fondo_real_sala` del último cierre |

**Lógica de carga del fondo inicial:**
```javascript
// Al abrir nuevo cierre:
dbGetAll('sala_cash_closures').then(rows => {
  var sorted = rows
    .filter(r => r.fondo_final != null)
    .sort((a,b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  var ultimo = sorted[0];
  if (ultimo) {
    fondoIniEl.value = parseFloat(ultimo.fondo_real_sala || ultimo.fondo_final || 0).toFixed(2);
    calcCajaDifs();
  }
});
```

> ⚠️ **Importante:** usar `fondo_real_sala` (lo que el empleado anterior realmente traspasó), no `fondo_final` (valor calculado). Si `fondo_real_sala` no existe → fallback a `fondo_final`.

---

### BLOQUE 2 · VALORES SISTEMA POSMEWS

Todos los campos disparan `calcCajaDifs()` en `oninput`.

| Campo | ID HTML | Tipo | Obligatorio |
|---|---|---|---|
| Cash POSMEWS (€) | `caja-ef-posmews` | `number` | ✅ |
| Tarjeta POSMEWS (€) | `caja-tar-posmews` | `number` | ✅ |
| Stripe POSMEWS (€) | `caja-str-posmews` | `number` | ✅ |

---

### BLOQUE 3 · CARGOS Y CONCEPTOS INTERNOS

Todos los campos disparan `calcCajaDifs()` en `oninput` (necesario para recalcular Total Bruto).

| Campo | ID HTML | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Room Charge (€) | `caja-room` | `number` | ✅ | Cargo a habitación |
| SYNCROLAB Charge clientes (€) | `caja-syncrolab` | `number` | ✅ | Talonario SYNCROLAB |
| Cargo Alexander (€) | `caja-alexander` | `number` | ✅ | Consumo interno |
| Pensiones desayunos (nº pax) | `caja-pension-desayuno-pax` | `number` | ✅ | Informativo |
| Pensiones comida+cena (nº pax) | `caja-pension-comidacena-pax` | `number` | ✅ | Informativo |
| € Pensiones Desayunos (importe) | `caja-eur-pension-desayuno` | `number` | ❌ | Entra en Total Bruto |
| € Pensiones Comidas+Cenas (importe) | `caja-eur-pension-comidacena` | `number` | ❌ | Entra en Total Bruto |

> Los campos `€ Pensiones` **no son obligatorios** pero sí entran en el cálculo de Total Bruto.
> Los campos `nº pax` son **informativos** — no generan diferencia obligatoria.

---

### BLOQUE 4 · VALORES REALES FÍSICOS

Todos los campos disparan `calcCajaDifs()` en `oninput`.

| Campo | ID HTML | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Cash real contado (€) | `caja-ef-real` | `number` | ✅ | Lo que hay en caja físicamente |
| TPV físico (€) | `caja-tar-tpv` | `number` | ✅ | Ticket del TPV |
| Stripe plataforma (€) | `caja-str-real` | `number` | ✅ | Valor real de Stripe |
| Propinas TPV (€) | `caja-propinas-tpv` | `number` | ✅ | Incluidas en fórmula Δ TPV |
| Propinas efectivo (€) | `caja-propinas-ef` | `number` | ❌ | Solo informativo |

---

### BLOQUE 5 · DIFERENCIAS CALCULADAS

Todos los valores son **readonly**, calculados en tiempo real por `calcCajaDifs()`.

| Display | ID HTML | Fórmula |
|---|---|---|
| Δ Cash | `caja-dif-ef` | `Fondo recibido + Cash POSMEWS - Cash real` |
| Δ TPV (neto propinas) | `caja-dif-tar` | `(TPV físico - Propinas TPV) - Tarjeta POSMEWS` |
| Δ Stripe | `caja-dif-str` | `Stripe real - Stripe POSMEWS` |
| Diferencia operativa total | `dif-sala-total` | `Δ Cash + Δ TPV + Δ Stripe` |

**Código `calcCajaDifs()` completo:**
```javascript
function calcCajaDifs() {
  function getV(id) {
    var el = document.getElementById(id);
    if (!el) return 0;
    var v = parseFloat(el.value.replace(',', '.'));
    return isNaN(v) ? 0 : v;
  }

  var fondoIni    = getV('caja-fondo-ini');
  var efReal      = getV('caja-ef-real');
  var efPosmews   = getV('caja-ef-posmews');
  var tarTpv      = getV('caja-tar-tpv');
  var tarPosmews  = getV('caja-tar-posmews');
  var propinasTpv = getV('caja-propinas-tpv');
  var strReal     = getV('caja-str-real');
  var strPosmews  = getV('caja-str-posmews');
  var retiro      = getV('caja-retiro');
  var roomCharge  = getV('caja-room');
  var syncrolab   = getV('caja-syncrolab');
  var alexander   = getV('caja-alexander');
  var eurPensD    = getV('caja-eur-pension-desayuno');
  var eurPensC    = getV('caja-eur-pension-comidacena');

  // DIFERENCIAS
  var difEf  = fondoIni + efPosmews - efReal;
  var difTar = (tarTpv - propinasTpv) - tarPosmews;
  var difStr = strReal - strPosmews;
  var difTotal = difEf + difTar + difStr;

  // FONDO ESPERADO
  var fondoEsperado = efReal - retiro;

  // TOTAL BRUTO
  var totalBruto = efPosmews + tarPosmews + strPosmews
                 + roomCharge + syncrolab + alexander
                 + eurPensD + eurPensC;
}
```

**Colores de diferencias:**
- `0.00 €` → verde (`var(--green)`)
- `< 5.00 €` → ámbar (`var(--amber)`)
- `> 5.00 €` → rojo (`var(--red)`)

Si hay diferencia > 0.01€ → mostrar bloque B6 de explicación + alerta roja.

---

### BLOQUE 6 · GESTIÓN DE DIFERENCIAS

Solo visible si `|difTotal| > 0.01`.

| Campo | ID HTML | Tipo | Obligatorio si hay diferencia |
|---|---|---|---|
| Explicación de la diferencia | `caja-expl-diferencia` | `textarea` | ✅ |
| Acción tomada | `caja-accion-diferencia` | `textarea` | ✅ |
| ¿Informado al responsable? | `caja-informado-si` / `caja-informado-no` | botones toggle | ✅ |

---

### COMENTARIO GENERAL

| Campo | ID HTML | Tipo | Obligatorio |
|---|---|---|---|
| Comentario general | `caja-comentario` | `textarea` | ❌ |

---

### BLOQUE 7 · FONDO FINAL Y TRASPASO

| Campo | ID HTML | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Retiro efectivo caja fuerte (€) | `caja-retiro` | `number` | ❌ | Dispara `calcCajaDifs()` |
| Fondo esperado a traspasar (€) | `caja-fondo-esperado` | display readonly | — | Calculado automáticamente |
| Fondo real a traspasar (€) | `caja-fondo-real` | `number` | ✅ | Lo que el empleado traspasa físicamente |
| Diferencia fondo | `caja-fondo-dif` | display readonly | — | `Fondo real - Fondo esperado` |

**Fórmula Fondo esperado:**
```
Fondo esperado = Cash real contado - Retiro efectivo caja fuerte
```

**Lógica display:**
```javascript
if (efReal === 0 && retiro > 0) {
  fondoEspEl.textContent = '— (introduce Cash real primero)';
} else {
  fondoEspEl.textContent = fondoEsperado.toFixed(2) + ' €';
}
```

**Traspaso al siguiente turno:**
- `fondo_real_sala` (lo que el empleado rellena en "Fondo real a traspasar") se guarda en Supabase
- El siguiente turno carga este valor como "Fondo recibido del turno anterior"

---

### BLOQUE TOTALES

| Campo | ID HTML | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Total neto sin IVA (€) | `caja-total-neto-manual` | `number` | ❌ | Manual |
| Total bruto — Calculado automáticamente | `caja-total-bruto-display` | display readonly | — | Calculado |
| (hidden) | `caja-total-bruto-manual` | `hidden` | — | Alias para save |
| Verificación con reales | `caja-total-verif` | display | — | Cuadre POSMEWS vs reales |

**Fórmula Total Bruto:**
```
Total Bruto = Cash POSMEWS + Tarjeta POSMEWS + Stripe POSMEWS
            + Room Charge + SYNCROLAB Charge + Cargo Alexander
            + € Pensiones Desayunos + € Pensiones Comidas+Cenas
```

**Verificación (informativa):**
```
Verificación = Total Bruto - (Cash real + (TPV físico - Propinas TPV) + Stripe real)
```
- Si = 0 → "✓ Cuadrado" (verde)
- Si ≠ 0 → "Δ ±X.XX€" (rojo)

---

## 4. VALIDACIONES ANTES DE GUARDAR

```javascript
// Campos obligatorios (excepto: € Pensiones, Propinas efectivo)
var requiredFields = [
  ['caja-ef-posmews',           'Cash POSMEWS'],
  ['caja-tar-posmews',          'Tarjeta POSMEWS'],
  ['caja-str-posmews',          'Stripe POSMEWS'],
  ['caja-room',                 'Room Charge'],
  ['caja-syncrolab',            'SYNCROLAB Charge'],
  ['caja-alexander',            'Cargo Alexander'],
  ['caja-pension-desayuno-pax', 'Pensiones desayunos (pax)'],
  ['caja-pension-comidacena-pax','Pensiones comida+cena (pax)'],
  ['caja-ef-real',              'Cash real contado'],
  ['caja-tar-tpv',              'TPV físico'],
  ['caja-str-real',             'Stripe plataforma'],
  ['caja-propinas-tpv',         'Propinas TPV'],
  ['caja-fondo-real',           'Fondo real a traspasar']
];

// Si hay diferencia → comentario obligatorio
if (Math.abs(difTotal) > 0.01 && !comentario.trim()) {
  toast('Hay diferencia en caja — el comentario es obligatorio', 'err');
  return;
}
```

---

## 5. TABLA SUPABASE — `sala_cash_closures`

### Columnas principales

```sql
id                        TEXT PRIMARY KEY
fecha                     TEXT           -- 'YYYY-MM-DD'
servicios                 TEXT           -- JSON array: '["Comida","Cena"]'
responsable_id            TEXT
responsable_nombre        TEXT
estado                    TEXT           -- ver estados más abajo

-- BLOQUE 1
fondo_inicial             NUMERIC DEFAULT 0

-- BLOQUE 2 POSMEWS
efectivo_posmews          NUMERIC DEFAULT 0
tarjeta_posmews           NUMERIC DEFAULT 0
stripe_posmews            NUMERIC DEFAULT 0

-- BLOQUE 3 CARGOS
room_charge               NUMERIC DEFAULT 0
syncrolab_charge          NUMERIC DEFAULT 0
cargo_alexander           NUMERIC DEFAULT 0
pension_desayuno_pax      INTEGER DEFAULT 0
pension_comidacena_pax    INTEGER DEFAULT 0
eur_pension_desayuno      NUMERIC DEFAULT 0
eur_pension_comidacena    NUMERIC DEFAULT 0

-- BLOQUE 4 REALES
efectivo_real             NUMERIC DEFAULT 0
tarjeta_tpv               NUMERIC DEFAULT 0
stripe_real               NUMERIC DEFAULT 0
propinas_tpv              NUMERIC DEFAULT 0
propinas_efectivo         NUMERIC DEFAULT 0

-- BLOQUE 5 DIFERENCIAS (calculadas y guardadas)
diferencia_efectivo       NUMERIC DEFAULT 0
diferencia_tarjeta        NUMERIC DEFAULT 0
diferencia_stripe         NUMERIC DEFAULT 0
diferencia_operativa_sala NUMERIC DEFAULT 0
diferencia_caja           NUMERIC DEFAULT 0   -- alias de diferencia_operativa_sala

-- BLOQUE 7 FONDO
retiro_caja_fuerte        NUMERIC DEFAULT 0
fondo_final               NUMERIC DEFAULT 0   -- fondo esperado calculado
fondo_real_sala           NUMERIC DEFAULT 0   -- fondo real traspasado (clave para siguiente turno)

-- TOTALES
subtotal_neto             NUMERIC DEFAULT 0
total_bruto               NUMERIC DEFAULT 0
total_medios_pago         NUMERIC DEFAULT 0

-- DIFERENCIAS EXPLICACIÓN
explicacion_diferencia    TEXT
accion_diferencia         TEXT
informado_responsable     BOOLEAN DEFAULT FALSE

-- VALIDACIÓN
estado                    TEXT DEFAULT 'Pendiente Sala'
validado_por              TEXT
validado_ts               TEXT
comentario                TEXT

-- AUDITORÍA
created_at                TEXT
updated_at                TEXT
```

### Estados del cierre

| Estado | Descripción | Quién lo asigna |
|---|---|---|
| `Pendiente Sala` | Recién creado | Sistema al guardar |
| `Pendiente validación` | Alias de Pendiente Sala | Sistema |
| `Cuadrado Sala` | Revisado por F&B/Admin | `fb`, `admin` |
| `Validado final` | Validación definitiva | `admin` |
| `A revisar` | Devuelto para corrección | `admin`, `fb`, `jefe_recepcion` |

---

## 6. CONCILIACIONES — DASHBOARD

### Qué se concilia

| Concepto | Origen Sala | Origen Recepción | Estado |
|---|---|---|---|
| Room Charge | `room_charge` Sala | `rec-room-charge` Recepción | Pendiente implementar |
| Pensiones pax | `pension_desayuno_pax` + `pension_comidacena_pax` | ídem Recepción | Pendiente implementar |
| SYNCROLAB talonario | `syncrolab_charge` Sala | `rec-syncrolab-charge` Recepción | Pendiente implementar |

### KPIs en Dashboard

```javascript
// Total caja Sala del periodo
var totalBruto   = cierres.reduce((a, c) => a + (c.total_bruto || 0), 0);
var difTotal     = cierres.reduce((a, c) => a + (c.diferencia_operativa_sala || 0), 0);
var cierresSC    = cierres.filter(c => c.coste_merma === 0).length; // sin coste

// Semáforo diferencia
// Verde: |dif| < 0.01
// Ámbar: 0.01 <= |dif| <= 5
// Rojo: |dif| > 5
```

---

## 7. FLUJO COMPLETO DE UN CIERRE

```
1. Empleado Sala finaliza turno
       ↓
2. Checklist pre-envío
       ↓
3. Modal "¿Ajustes en turno?" (descuentos, anulaciones...)
       ↓
4. Modal "¿Realizar cierre de caja ahora?"
       ↓ (si acepta)
5. Modal Cierre Caja — 7 bloques
   B1: Fecha + Fondo recibido (auto, readonly)
   B2: Valores POSMEWS
   B3: Cargos internos + Pensiones
   B4: Valores reales físicos
   B5: Diferencias calculadas (auto)
   B6: Explicación (si hay diferencia)
   B7: Retiro + Fondo esperado (auto) + Fondo real
   Totales: Neto manual + Bruto calculado (auto)
       ↓
6. "Guardar Cierre" → POST a sala_cash_closures
   Estado: Pendiente Sala
       ↓
7. Admin / F&B → Validación → pestaña "Cierre Caja"
   Ver resumen → Validar → Estado: Cuadrado Sala
       ↓
8. Admin → Validar final → Estado: Validado final
```

---

## 8. FUNCIONES JS CLAVE

| Función | Archivo | Descripción |
|---|---|---|
| `openCajaForm(id?)` | `caja.js` | Abre modal. Sin id = nuevo, con id = editar |
| `calcCajaDifs()` | `caja.js` | Recalcula todas las diferencias en tiempo real |
| `calcCajaTotal()` | `caja.js` | Alias de `calcCajaDifs()` |
| `saveCajaForm()` | `caja.js` | Valida y guarda en Supabase |
| `renderCajaList()` | `caja.js` | Renderiza tabla de cierres con filtro de periodo |
| `renderValCajaList()` | `caja.js` / `index.html` | Lista para validación (admin/fb) |
| `openCajaSummary(id, showValidar)` | `caja.js` / `index.html` | Modal resumen para validar |
| `validarCierre(id)` | `caja.js` / `index.html` | Avanza estado del cierre |
| `reabrirCierre(id)` | `caja.js` / `index.html` | Devuelve a estado "A revisar" |
| `setCajaInformado(bool)` | `index.html` | Toggle "Informado responsable" |
| `fixLeadingZeros(el)` | `index.html` | Limpia ceros iniciales en inputs numéricos |

---

## 9. UX / DISEÑO

### Estructura visual

- Bloques separados con `border-radius: 8px` y borde de color diferenciado:
  - B1, B2, B4: borde `var(--border)` (gris neutro)
  - B3 Cargos: borde `#f59e0b` (ámbar) — sección destacada
  - B5 Diferencias: borde `#3b82f6` (azul) — sección de control
  - B6 Explicación: borde `var(--red)` — solo visible si hay diferencia

### Comportamiento esperado

- `oninput` en **todos** los campos numéricos → recalculo inmediato
- Campos readonly con `opacity: 0.65; cursor: not-allowed`
- Diferencias en color según umbral (verde/ámbar/rojo)
- Bloque B6 aparece/desaparece dinámicamente
- Total bruto se actualiza al cambiar cualquier campo de B2 o B3
- Fondo esperado se actualiza al cambiar Cash real o Retiro
- Mensaje de ayuda si Cash real = 0 y Retiro > 0

### Accesibilidad

- Labels en `font-family: var(--font-mono)`, `font-size: 10px`, `text-transform: uppercase`
- Campos obligatorios marcados con `<span class="req">*</span>` (color ámbar)
- Toast de error en validación antes de guardar
- Botón "Guardar Cierre" solo al final — no duplicar

---

## 10. ERRORES CONOCIDOS Y SOLUCIONES

| Error | Causa | Solución |
|---|---|---|
| `getCV is not defined` | `calcCajaDifs` usa `getCV` (local de `saveCajaForm`) | Usar `getV` en `calcCajaDifs` |
| Total bruto = 0 | Campos B3 sin `oninput="calcCajaDifs()"` | Añadir `oninput` a todos los campos B3 |
| Fondo esperado = 0 | `caja-total-bruto-display` no existe en HTML (versión antigua) | Actualizar `index.html` con el elemento display |
| `calcCajaDifs` duplicada | Función definida en `index.html` Y en `caja.js` | Eliminar la versión de `index.html` |
| Empleado edita cierre validado | `renderCajaList` no verifica estado | Añadir lógica `canEditThis` según estado y `responsable_id` |
| Fondo recibido incorrecto | Carga `fondo_final` en vez de `fondo_real_sala` | Priorizar `fondo_real_sala` al cargar el último cierre |

---

## 11. SQL — MIGRACIÓN COMPLETA

```sql
-- Crear tabla si no existe
CREATE TABLE IF NOT EXISTS public.sala_cash_closures (
  id TEXT PRIMARY KEY,
  fecha TEXT,
  servicios TEXT,
  responsable_id TEXT,
  responsable_nombre TEXT,
  estado TEXT DEFAULT 'Pendiente Sala',
  fondo_inicial NUMERIC DEFAULT 0,
  efectivo_posmews NUMERIC DEFAULT 0,
  tarjeta_posmews NUMERIC DEFAULT 0,
  stripe_posmews NUMERIC DEFAULT 0,
  room_charge NUMERIC DEFAULT 0,
  syncrolab_charge NUMERIC DEFAULT 0,
  cargo_alexander NUMERIC DEFAULT 0,
  pension_desayuno_pax INTEGER DEFAULT 0,
  pension_comidacena_pax INTEGER DEFAULT 0,
  eur_pension_desayuno NUMERIC DEFAULT 0,
  eur_pension_comidacena NUMERIC DEFAULT 0,
  efectivo_real NUMERIC DEFAULT 0,
  tarjeta_tpv NUMERIC DEFAULT 0,
  stripe_real NUMERIC DEFAULT 0,
  propinas_tpv NUMERIC DEFAULT 0,
  propinas_efectivo NUMERIC DEFAULT 0,
  diferencia_efectivo NUMERIC DEFAULT 0,
  diferencia_tarjeta NUMERIC DEFAULT 0,
  diferencia_stripe NUMERIC DEFAULT 0,
  diferencia_operativa_sala NUMERIC DEFAULT 0,
  diferencia_caja NUMERIC DEFAULT 0,
  retiro_caja_fuerte NUMERIC DEFAULT 0,
  fondo_final NUMERIC DEFAULT 0,
  fondo_real_sala NUMERIC DEFAULT 0,
  subtotal_neto NUMERIC DEFAULT 0,
  total_bruto NUMERIC DEFAULT 0,
  total_medios_pago NUMERIC DEFAULT 0,
  explicacion_diferencia TEXT,
  accion_diferencia TEXT,
  informado_responsable BOOLEAN DEFAULT FALSE,
  validado_por TEXT,
  validado_ts TEXT,
  comentario TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Añadir columnas si ya existe (ALTER seguro)
ALTER TABLE public.sala_cash_closures
  ADD COLUMN IF NOT EXISTS syncrolab_charge NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_charge NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cargo_alexander NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_desayuno_pax INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_comidacena_pax INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eur_pension_desayuno NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eur_pension_comidacena NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS explicacion_diferencia TEXT,
  ADD COLUMN IF NOT EXISTS accion_diferencia TEXT,
  ADD COLUMN IF NOT EXISTS informado_responsable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS propinas_tpv NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS propinas_efectivo NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fondo_real_sala NUMERIC DEFAULT 0;

-- Recargar schema cache
SELECT pg_notify('pgrst', 'reload schema');
```

---

## 12. CHECKLIST DE QA

### Nuevo cierre

- [ ] Fondo recibido se carga automáticamente del cierre anterior
- [ ] Diferencias recalculan al escribir en cualquier campo
- [ ] Total bruto = suma correcta de B2 + B3
- [ ] Fondo esperado = Cash real - Retiro
- [ ] Si hay diferencia → aparece B6 automáticamente
- [ ] Sin comentario con diferencia → no guarda
- [ ] Campos obligatorios validados antes de guardar
- [ ] Toast de confirmación al guardar

### Permisos

- [ ] Empleado NO ve "Cierre Caja" en topbar
- [ ] Empleado solo edita sus propios cierres pendientes
- [ ] Cierres validados muestran `—` en columna editar para empleados
- [ ] Admin NO ve "Mi Turno" ni "Cierre Caja" en navegación

### Traspaso de fondo

- [ ] `fondo_real_sala` del cierre A aparece como fondo recibido en cierre B
- [ ] El fondo recibido es readonly

### Validación

- [ ] F&B / Admin ven botón "Validar" en tabla validación
- [ ] Al validar → estado cambia a "Cuadrado Sala"
- [ ] Segunda validación Admin → "Validado final"
- [ ] "Revisar" disponible para admin, fb, jefe_recepcion, coordinador_syncrolab
