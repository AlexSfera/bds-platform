# 10 — Caja Sala / 11 — Caja Recepción Hotel / 12 — Caja SYNCROLAB

---

## REGLA GLOBAL DE CAJAS

> Cada departamento con caja tiene su propia tabla Supabase.
> Nunca leer ni escribir datos de caja de un departamento en la tabla de otro.
> Las transferencias bancarias son exclusivas de Recepción Hotel.

| Departamento | Tabla | Estado |
|---|---|---|
| Sala | `sala_cash_closures` | Activa |
| Recepción Hotel | `recepcion_cash` | Activa |
| SYNCROLAB | `syncrolab_cash` | Pendiente crear |

---

# 10 — Caja Sala / Restaurante

## Objetivo

Cuadrar los cobros del servicio de restauración entre lo registrado en POSMEWS y lo contado físicamente.

## Campos

| Campo | Descripción |
|---|---|
| `fecha` | Fecha del cierre |
| `turno` | Mañana · Tarde · Noche |
| `efectivo_posmews` | Efectivo según POSMEWS |
| `tarjeta_posmews` | Tarjeta según POSMEWS |
| `stripe_posmews` | Stripe según POSMEWS |
| `invitaciones` | Importe invitaciones |
| `propinas_efectivo` | Propinas en efectivo |
| `propinas_tpv` | Propinas en tarjeta |
| `efectivo_real` | Efectivo contado |
| `tarjeta_real` | Tarjeta real (TPV físico) |
| `stripe_real` | Stripe real |
| `pensiones_personas` | Nº personas en régimen pensión (excl. desayunos) |
| `dif_efectivo` | `efectivo_posmews - efectivo_real` |
| `dif_tarjeta` | `tarjeta_posmews - tarjeta_real` |
| `dif_stripe` | `stripe_posmews - stripe_real` |
| `dif_total` | Suma de diferencias |
| `explicacion_diferencia` | Obligatoria si dif ≠ 0 |

## Fórmulas Sala

```
Δ Efectivo = Efectivo POSMEWS - Efectivo real
Δ Tarjeta  = Tarjeta POSMEWS - Tarjeta real
Δ Stripe   = Stripe POSMEWS - Stripe real
Δ Total    = Δ Efectivo + Δ Tarjeta + Δ Stripe
```

No hay transferencias en Sala. No hay fondo de caja en Sala.

## Reglas de bloqueo

| Condición | Resultado |
|---|---|
| Δ Efectivo ≠ 0 | Explicación obligatoria |
| Δ Tarjeta ≠ 0 | Explicación obligatoria |
| Δ Stripe ≠ 0 | Explicación obligatoria |

---

# 11 — Caja Recepción Hotel

## Objetivo

Controlar el efectivo en caja, cuadrar cobros del PMS MEWS y registrar el traspaso de fondo entre turnos.

## Campos

| Campo | Descripción |
|---|---|
| `fondo_recibido` | Del cierre anterior — **readonly, auto-rellenado** |
| `fondo_real_a_traspasar` | Calculado: `fondo_recibido + cash_mews - retiro_caja_fuerte` |
| `retiro_caja_fuerte` | Importe retirado a caja fuerte |
| `cash_mews` | Efectivo según MEWS |
| `tarjeta_mews` | Tarjeta según MEWS |
| `stripe_mews` | Stripe según MEWS |
| `transferencia_mews` | Transferencias según MEWS |
| `cash_real` | Efectivo contado |
| `tpv_real` | TPV físico real |
| `stripe_real` | Stripe real |
| `transferencia_banco` | Transferencias revisadas en banco |
| `transferencia_banco_updated_at` | Fecha/hora última revisión de transferencias (auto) |
| `room_charge_recibido` | Room charges recibidos de MEWS |
| `syncrolab_room_charged` | Cargos de SYNCROLAB a habitaciones |
| `desayunos_confirmados_mews` | Desayunos según MEWS |
| `pensiones_personas` | Nº personas régimen pensión excl. desayunos |
| `cargo_alexander` | Cargo directo autorizado por Alexander |
| `dif_cash` | Δ Cash (ver fórmula) |
| `dif_tarjeta` | Δ Tarjeta |
| `dif_stripe` | Δ Stripe |
| `dif_transferencia` | Δ Transferencia (informativo, no bloquea) |
| `dif_total` | `dif_cash + dif_tarjeta + dif_stripe` |
| `dif_fondo_traspaso` | `fondo_traspasado - fondo_real_a_traspasar` |
| `explicacion_diferencia` | Obligatoria si dif cash/tarjeta/stripe ≠ 0 |

## Fórmulas Recepción

```
Δ Cash         = cash_mews - (cash_real - fondo_recibido)
Δ Tarjeta      = tarjeta_mews - tpv_real
Δ Stripe       = stripe_mews - stripe_real
Δ Transferencia = transferencia_mews - transferencia_banco  ← informativo, no bloquea
Δ Total        = Δ Cash + Δ Tarjeta + Δ Stripe

Fondo esperado = fondo_recibido + cash_mews - retiro_caja_fuerte
```

## Traspaso de fondo

- `fondo_recibido` = `fondo_real_a_traspasar` del último cierre del mismo departamento
- Campo **readonly** — el empleado no lo edita
- Se auto-rellena al abrir el formulario de caja
- "Fondo esperado a traspasar" y "Fondo inicial día siguiente" son el **mismo campo** — no duplicar

## Campo transferencias — control de revisión

Bajo el campo "Transferencia real" mostrar:
`Última revisión: DD/MM/YYYY HH:mm`

Se actualiza automáticamente en `transferencia_banco_updated_at = localTs()` cada vez que `transferencia_banco` se modifica con valor > 0. No editable por el usuario. Sirve para saber cuándo se revisó por última vez el banco (no se revisa a diario).

## Reglas de bloqueo

| Condición | Resultado |
|---|---|
| Δ Cash ≠ 0 | Explicación obligatoria |
| Δ Tarjeta ≠ 0 | Explicación obligatoria |
| Δ Stripe ≠ 0 | Explicación obligatoria |
| Δ Transferencia ≠ 0 | Informativo — no bloquea |
| Fondo real ≠ Fondo esperado | Explicación obligatoria |

## Permisos de caja Recepción

| Acción | Empleado | Jefe | Admin |
|---|---|---|---|
| Realizar cierre | ✅ | ✅ | ✅ |
| Reabrir cierre | ❌ | ✅ | ✅ |
| Eliminar cierre | ❌ | ❌ | ✅ |

---

# 12 — Caja SYNCROLAB

## Estado

`[NO DATA]` — estructura pendiente de definir.

## Lo que se sabe

- SYNCROLAB tiene operación económica propia
- Tabla: `syncrolab_cash` (pendiente crear en Supabase)
- Módulo: `syncrolab.js` (pendiente crear)
- No tiene transferencias bancarias propias por defecto
- `[NO DATA]` — ¿usa MEWS como referencia o Nubimed?
- `[NO DATA]` — ¿los cobros de SYNCROLAB se integran con el PMS del hotel?

## Campos mínimos previstos

```sql
CREATE TABLE syncrolab_cash (
  id              TEXT PRIMARY KEY,
  shift_id        TEXT,
  fecha           TEXT NOT NULL,
  turno           TEXT NOT NULL,
  usuario_id      TEXT,
  usuario_nombre  TEXT,
  estado          TEXT DEFAULT 'cerrado',
  -- campos de cobros: [NO DATA]
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

Completar cuando se confirme la estructura operativa de SYNCROLAB.
