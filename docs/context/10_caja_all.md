# 10 — Caja: Sala · Recepción Hotel · SYNCROLAB

*Actualizado 30 jul 2026 — cruzado contra `caja.js` (98 KB), `recepcion.js` (116 KB), `syncrolab.js` (54 KB) del repo.*

---

## 0. Regla global

Cada departamento con caja tiene su propia tabla Supabase. Nunca leer ni escribir datos de caja de un departamento en la tabla de otro.

| Departamento | Tabla | Módulo JS | Estado |
|---|---|---|---|
| Sala / Restaurante | `sala_cash_closures` | `caja.js` | ✅ Activa |
| Recepción Hotel | `recepcion_cash` | `recepcion.js` | ✅ Activa |
| SYNCROLAB | `syncrolab_cash_closures` | `syncrolab.js` | ✅ Activa |
| SYNCROLAB room charges | `syncrolab_room_charges` | `syncrolab.js` | ✅ Activa |

Legacy: `recepcion_cash_closures` (0 filas, sin uso activo).

---

## 1. Permisos comunes de caja

| Acción | Empleado (su dpto) | Jefe (su dpto) | Contable | Admin/Adjunto |
|---|---|---|---|---|
| Crear cierre/traspaso | ✅ | ✅ | ❌ | ✅ (Sala: admin no crea) |
| Editar propio pendiente | ✅ | ✅ | ❌ | ✅ |
| Reabrir cierre | ❌ | ✅ | ❌ | ✅ |
| Corregir en sitio | ❌ | ✅ (`canCorrectCaja`) | ❌ | ✅ |
| Eliminar cierre | ❌ | ❌ | ❌ | ✅ (`canActAsAdmin`) |
| Ver en Validación (pestaña Caja) | ❌ | ✅ | ✅ (lectura) | ✅ |

**Regla de corrección:** "Corregir en sitio" (`corregirCajaSala`, `corregirCajaRec`, `corregirCajaLab`) permite al jefe/admin editar importes sin devolver al empleado. Marca `corregida=true`, `corrected_by`, queda auditado. Si el cierre estaba validado, mantiene estado `validado`.

**Regla redactado_por_jefe:** cuando un jefe/admin crea un cierre de caja Sala por el empleado, se marca `redactado_por_jefe=true` y aparece badge ⚠ en la tabla.

---

## 2. Fecha operativa

| Dpto | Función | Cutoff | Lógica |
|---|---|---|---|
| Sala | `_salaFechaOperativa()` en `caja.js:269` | **6h** | Hora actual < 6 → ayer |
| Recepción | `_recFechaOperativa(turno)` en `recepcion.js:235` | **7h** | Hora actual < 7 → ayer |

Los timestamps de `audit_log` van con fecha real, no operativa.

---

## 3. Tipos de operación de caja

Sala y SYNCROLAB soportan dos tipos de operación:

| Tipo | Descripción | Cuándo |
|---|---|---|
| `traspaso` | Solo traspaso de fondo al siguiente servicio | Servicios intermedios (Desayuno, Comida) |
| `cierre` | Cierre completo con cuadre de medios de pago | Último servicio del día (Cena / Evento) o turno único |

Recepción: solo cierre (una operación por turno).

---

## 4. Columnas comunes (presentes en las 3 tablas)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | TEXT PK | `genId()` |
| `fecha` | TEXT | YYYY-MM-DD (fecha operativa) |
| `turno` / `servicios` | TEXT | Turno o servicios cubiertos |
| `responsable_id` | TEXT | ID del empleado que registra |
| `responsable_nombre` | TEXT | Nombre del empleado |
| `estado` | TEXT | Ver estados por departamento |
| `corregida` | BOOLEAN | Fue corregida en sitio por jefe/admin |
| `corrected_by` | TEXT | Quién corrigió |
| `reabierto_por` | TEXT | Quién reabrió (si aplica) |
| `imagenes_adjuntas` | JSONB | Array de URLs de fotos adjuntas |
| `comentario` / `comentario_validador` | TEXT | Nota del validador |
| `validado_por` | TEXT | Quién validó |
| `validado_ts` | TEXT | Timestamp de validación |
| `created_at` | TEXT | `localTs()` |

---

# CAJA SALA / RESTAURANTE

## 5. Tabla: `sala_cash_closures` (130 filas)

### Estructura del formulario — 7 bloques

**B1 · Fondo inicial:** `fondo_inicial` (readonly, cargado del `fondo_real_sala` del último cierre). `fecha` (auto `_salaFechaOperativa()`).

**B2 · Valores POSMEWS:** `efectivo_posmews`, `tarjeta_posmews`, `stripe_posmews`.

**B3 · Cargos internos:** `room_charge`, `syncrolab_charge`, `cargo_alexander`, `pension_desayuno_pax` (nº pax), `pension_comidacena_pax` (nº pax), `eur_pension_desayuno`, `eur_pension_comidacena`. Los campos € pensiones entran en Total Bruto; los pax son informativos.

**B4 · Valores reales:** `efectivo_real`, `tarjeta_tpv`, `stripe_real`, `propinas_tpv`, `propinas_efectivo`.

**B5 · Diferencias (calculadas, readonly):**

| Diferencia | Fórmula |
|---|---|
| `diferencia_efectivo` | Fondo recibido + Cash POSMEWS − Cash real |
| `diferencia_tarjeta` | (TPV físico − Propinas TPV) − Tarjeta POSMEWS |
| `diferencia_stripe` | Stripe real − Stripe POSMEWS |
| `diferencia_operativa_sala` | Σ de las 3 diferencias |

Colores: 0 = verde, < 5€ = ámbar, > 5€ = rojo.

**B6 · Explicación (solo si diferencia ≠ 0):** `explicacion_diferencia`, `accion_diferencia`, `informado_responsable`.

**B7 · Fondo final:** `retiro_caja_fuerte`. `fondo_final` (calculado: Cash real − Retiro). `fondo_real_sala` (editable: lo que se traspasa físicamente).

**Totales:** `subtotal_neto` (manual), `total_bruto` (calculado: B2 + B3), `total_medios_pago`.

**Columnas adicionales:** `tipo` (TEXT: `'cierre'` | `'traspaso'`, default `'cierre'`), `redactado_por_jefe` (BOOLEAN), `redactado_por` (TEXT), `redactado_ts` (TEXT).

### Estados Sala

| Estado | Quién lo asigna |
|---|---|
| `Pendiente Sala` | Sistema al guardar |
| `Cuadrado Sala` | fb / admin valida |
| `Validado final` | admin validación definitiva |
| `A revisar` | admin / fb devuelve |
| `reabierto` | tras reabrir |

### Funciones JS clave (`caja.js`)

`openCajaForm(id?)`, `calcCajaDifs()`, `saveCajaForm()`, `renderCajaList()`, `corregirCajaSala(id)`, `_salaFechaOperativa()`, `startSalaTraspaso()`, `startSalaCierre()`.

---

# CAJA RECEPCIÓN HOTEL

## 6. Tabla: `recepcion_cash` (171 filas)

### Campos específicos Recepción

**Sistema MEWS:** `cash_mews`, `tarjeta_mews` (no se usa activamente), `stripe_mews`, `transferencia_mews`.

**Reales:** `cash_real` (no existe como tal, se usa lógica fondo), `tpv_real`, `stripe_real`, `transferencia_banco`.

**Fondo:** `fondo_recibido` (readonly auto del cierre anterior), `retiro_caja_fuerte`, fondo calculado.

**Especiales Recepción:**
- `room_charge_recibido` — room charges recibidos de MEWS
- `transferencia_banco` + `transferencia_banco_updated_at` — revisión de transferencias bancarias (no se revisa a diario)
- `departamento` — default `'recepcion'`

### Fórmulas Recepción

| Diferencia | Fórmula |
|---|---|
| `dif_cash` | cash_mews − (cash_real − fondo_recibido) |
| `dif_tarjeta` | tarjeta_mews − tpv_real |
| `dif_stripe` | stripe_mews − stripe_real |
| `dif_transferencia` | transferencia_mews − transferencia_banco (**informativo, no bloquea**) |
| `dif_total` | dif_cash + dif_tarjeta + dif_stripe |

Fondo esperado = fondo_recibido + cash_mews − retiro_caja_fuerte.

### Estados Recepción

Misma lógica que Sala + estado `reabierto`. Columnas: `reabierto_por`, `comentario_validador`.

### Transferencias

Solo Recepción tiene transferencias bancarias. `transferencia_banco_updated_at` se actualiza automáticamente al modificar el valor. Campo informativo para saber cuándo se revisó el banco por última vez.

### Funciones JS clave (`recepcion.js`)

`openRecCajaChoice()`, `saveRecCaja()`, `corregirCajaRec(id)`, `_recFechaOperativa(turno)`, cross-selling UI.

---

# CAJA SYNCROLAB

## 7. Tabla: `syncrolab_cash_closures` (64 filas)

**⚠ Los dos sistemas operativos de SYNCROLAB son Nubimed y VirtuGym (NO "FlyBy" — nombre descartado en implementación).**

### Arquitectura dual

SYNCROLAB trabaja con dos sistemas separados y un TPV físico unificado:

| Sistema | Tipo | Campos prefijo |
|---|---|---|
| **Nubimed** (Clínica) | PMS clínica | `*_nubimed_*` |
| **VirtuGym** (Fitness) | Software fitness | `*_virtugym_*` |
| **TPV conjunto** | Hardware compartido | `tpv_real_total` |

### Columnas Nubimed

`fondo_recibido_nubimed`, `efectivo_nubimed_sistema`, `efectivo_nubimed_real`, `total_sistema_nubimed`, `total_real_nubimed`, `efectivo_traspasado_nubimed` + tarjeta/stripe/cargo MEWS equivalentes.

### Columnas VirtuGym

`fondo_recibido_virtugym`, `efectivo_virtugym_sistema`, `efectivo_virtugym_real`, `total_sistema_virtugym`, `total_real_virtugym`, `efectivo_traspasado_virtugym` + equivalentes.

### TPV conjunto

Un único TPV físico compartido. La distribución Nubimed/VirtuGym es manual.

| Campo | Tipo |
|---|---|
| TPV Nubimed (editable) | Parte atribuida a Nubimed |
| TPV VirtuGym (editable) | Parte atribuida a VirtuGym |
| TPV real total (editable) | Total del TPV físico |
| TPV esperado = Tarjeta Nubimed + Tarjeta VirtuGym | Calculado |
| Diferencia TPV = TPV real − TPV esperado | Calculado |

### Room charges (`syncrolab_room_charges`, 75 filas)

Cargos a habitación desde SYNCROLAB, vinculados a un cierre de caja.

| Columna | Descripción |
|---|---|
| `syncrolab_cash_id` | FK → `syncrolab_cash_closures.id` |
| `sistema` | `'Nubimed'` o `'VirtuGym'` |
| `habitacion` | Número de habitación |
| `huesped_nombre` | Nombre del huésped |
| `concepto` | Descripción del servicio |
| `importe` | Importe del cargo |
| `estado` | Estado del cargo |
| `imagen_url` | Foto del talonario |

### Tipos de operación SYNCROLAB

| Tipo | Descripción |
|---|---|
| `traspaso` | Solo efectivo: 2 fondos (Nubimed + VirtuGym), sin retiro |
| `cierre` | Completo: Nubimed + VirtuGym + TPV + diferencias + fondo final |

La lógica determina automáticamente si el turno puede hacer cierre o solo traspaso según horario y día (domingos = turno único = cierre directo).

### Fondo SYNCROLAB

```
Fondo esperado = Fondo Nubimed + Fondo VirtuGym + Cash real Nubimed + Cash real VirtuGym − Retiro
```

No incluye TPV, Stripe ni Cargo MEWS en el fondo.

### Funciones JS clave (`syncrolab.js`)

`openLabCajaChoice()`, `startLabTraspaso()`, `startLabCierre()`, `_labSave(record, editId)`, `corregirCajaLab(id)`, `evalLabCajaChoice()`, `skipLabCajaOp()`.

Variables de tabla: `var LAB_TABLE = 'syncrolab_cash_closures'`, `var LAB_CHARGES_TABLE = 'syncrolab_room_charges'`.

---

## 8. Conciliaciones cross-departamento (Dashboard)

| Concepto | Origen A | Origen B | Estado |
|---|---|---|---|
| Room Charge Sala→Recepción | `sala_cash_closures.room_charge` | `recepcion_cash.room_charge_recibido` | Implementado parcialmente |
| SYNCROLAB talonario | `sala_cash_closures.syncrolab_charge` | `syncrolab_cash_closures` cargo MEWS total | Implementado parcialmente |
| Pensiones pax | Sala pax | Recepción pax | Informativo |

Semáforo: Conciliado (verde), Diferencia (rojo), Falta dato (amarillo).

---

## 9. Reglas de bloqueo comunes

| Condición | Resultado |
|---|---|
| Cualquier diferencia ≠ 0 | Explicación obligatoria |
| Diferencia transferencia (Recepción) | Informativo — **no bloquea** |
| Fondo real ≠ Fondo esperado | Explicación obligatoria |
| Sin foto adjunta (si configurado) | Alerta — no bloquea |

---

## 10. Errores conocidos y soluciones

| Error | Causa | Solución |
|---|---|---|
| `getCV is not defined` | `calcCajaDifs` usa `getCV` (local) | Usar `getV` |
| Total bruto = 0 | Campos B3 sin `oninput` | Añadir `oninput="calcCajaDifs()"` a todos los campos |
| Fondo recibido incorrecto | Carga `fondo_final` en vez de `fondo_real_sala` | Priorizar `fondo_real_sala` |
| Empleado edita cierre validado | `renderCajaList` no verifica estado | Lógica `canEditThis` por estado + `responsable_id` |
| Histórico traspasos como cierres (T-TIMESTAMPS) | `sala_cash_closures.tipo` default `'cierre'` | Corregido vía SQL usando discriminadores `retiro_caja_fuerte=0 AND tarjeta_posmews=0 AND tarjeta_tpv=0` |
