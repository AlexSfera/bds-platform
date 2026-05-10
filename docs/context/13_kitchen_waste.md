# 13 — Merma (Cocina)

---

## 1. Definición

La merma es la pérdida de producto en Cocina por cualquier causa: deterioro, error de producción, accidente, exceso de preparación o fallo de proveedor. Es un registro operativo específico de Cocina y un KPI propio del departamento.

> **Merma NO es una incidencia operativa. Son registros independientes.**
> Si la pérdida tiene causa operativa grave que también afecta a cliente o a operación, se puede registrar también una incidencia — pero son registros separados.

---

## 2. Visibilidad

- Merma **solo visible** para departamento Cocina
- Verificación siempre: `deptTieneMerma(currentUser.area) === true`
- El bloque de merma NO aparece en: Mi Turno de otros departamentos, modal de validación de otros departamentos, dashboard de otros departamentos
- Si hay merma sin precio asignado → bloquear validación del turno de Cocina

---

## 3. Tabla Supabase: `merma`

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT | ✅ | Generado en cliente |
| `shift_id` | TEXT | ✅ | ID del turno |
| `employee_id` | TEXT | ✅ | Quien registra |
| `nombre` | TEXT | ✅ | Nombre del empleado |
| `departamento` | TEXT | ✅ | Siempre `'Cocina'` |
| `fecha` | TEXT | ✅ | YYYY-MM-DD |
| `producto` | TEXT | ✅ | Nombre del producto |
| `cantidad` | NUMERIC | ✅ | Cantidad perdida |
| `unidad` | TEXT | ✅ | kg · l · ud · g |
| `motivo` | TEXT | ✅ | Causa de la merma |
| `coste_estimado` | NUMERIC | — | Coste total estimado |
| `precio_unitario` | NUMERIC | — | Precio por unidad |
| `validado` | INTEGER | ✅ | `0` = sin precio · `1` = precio asignado |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` |

---

## 4. KPIs de merma en dashboard Cocina

| KPI | Cálculo |
|---|---|
| Merma total € | `SUM(coste_estimado)` del periodo |
| Merma por producto | `GROUP BY producto` — top productos con más merma |
| Merma por empleado | `GROUP BY employee_id` |
| Merma por servicio | `GROUP BY turno` |
| Merma sin precio | `COUNT WHERE validado = 0` — alerta si > 0 |

---

## 5. Reglas operativas

- El Chef o responsable debe justificar pérdidas con su equipo
- Una merma sin `precio_unitario` asignado bloquea la validación del turno
- Los precios los asigna el supervisor o admin, no el empleado
- La merma se registra durante el turno en el bloque específico de Mi Turno (solo Cocina)
- No crear tareas ni incidencias automáticamente por merma — son registros independientes

---

## 6. QA

```
□ El bloque Merma solo aparece para empleados de Cocina
□ Merma no aparece en Mi Turno de Sala, Recepción, Housekeeping
□ Merma no aparece en el modal de validación de turnos que no son de Cocina
□ Si hay merma sin precio → el turno no se puede validar
□ El dashboard de Cocina muestra KPIs reales de merma
□ created_at en hora local España
```
