# 08 — Gestiones Pendientes

---

## 1. Definición técnica

Una **gestión pendiente** es un asunto operativo que queda sin resolver al final del turno y debe continuar en seguimiento en el siguiente. No es un problema grave (eso es una incidencia) ni una acción asignable a otro departamento (eso es una tarea).

| Concepto | Cuándo usar |
|---|---|
| **Gestión pendiente** | Algo que queda pendiente dentro del mismo departamento entre turnos |
| **Incidencia** | Problema real que ocurrió y requiere cierre formal con acción tomada |
| **Tarea** | Acción que se asigna a una persona o a otro departamento con deadline |

---

## 2. Tabla Supabase: `gestiones`

### Columnas

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT | ✅ | Generado en cliente con `genId()` |
| `shift_id` | TEXT | ✅ | ID del turno donde se registró |
| `employee_id` | TEXT | ✅ | ID del empleado que registra |
| `nombre` | TEXT | ✅ | Nombre legible del empleado |
| `departamento` | TEXT | ✅ | Departamento origen — nunca nulo |
| `area` | TEXT | — | Alias de departamento |
| `fecha` | TEXT | ✅ | YYYY-MM-DD |
| `servicio` | TEXT | ✅ | Turno: Mañana · Tarde · Noche |
| `tipo_gestion` | TEXT | ✅ | De la lista del departamento |
| `descripcion` | TEXT | ✅ | Qué queda pendiente |
| `accion_tomada` | TEXT | — | Obligatoria al cerrar |
| `estado` | TEXT | ✅ | Ver estados abajo |
| `cerrado_por` | TEXT | — | Nombre de quien cierra |
| `cerrado_ts` | TEXT | — | Timestamp de cierre |
| `tiempo_gestion` | INTEGER | — | Minutos apertura → cierre |
| `informado_responsable` | TEXT | ✅ | `'no'` · `'si'` |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` — hora local España |

### Estados

| Estado | Descripción | Transición |
|---|---|---|
| `'Abierta'` | Pendiente de gestionar | → En proceso · → Cerrada |
| `'En proceso'` | Siendo gestionada | → Cerrada |
| `'Cerrada'` | Resuelta | → Abierta (solo admin, con motivo) |

---

## 3. Tipologías por departamento

Las tipologías viven en `incidencia_tipos.js` en el objeto `GESTION_TIPOS`.

| Departamento | Tipos |
|---|---|
| Cocina | Producción/mise en place · Stock/material · Reservas/grupos · Cliente/huésped · Pedido específico · Otro |
| Sala | Cliente/huésped petición especial · Reserva/grupo/evento · Reposición/pedido material · Información a confirmar · Otro |
| Recepción | Check-in/llegada · Check-out/salida · Cobro/factura · Reserva MEWS · Comunicación cliente · Habitación/housekeeping · Solicitud especial · Gestión otro dpto · Grupo/evento · Otro |
| Recepción SYNCROLAB | Cliente/lead · Reserva · Cobro/factura · Comunicación · Documentación · Coordinación hotel · Otro |
| Resto | Tarea pendiente · Comunicación · Gestión administrativa · Otro |

Para obtener la lista:
```javascript
var tipos = getGestionTipos(currentUser.area);
populateGestionTipoSelector('g-tipo', currentUser.area);
```

---

## 4. Registro de gestión — flujo

```
Empleado en Mi Turno
    → Activa toggle "¿Queda alguna gestión pendiente?" → Sí
    → Selecciona tipo (lista de su departamento)
    → Describe qué queda pendiente
    → Se graba en tabla 'gestiones' al guardar turno
    → estado = 'Abierta', created_at = localTs()
```

También puede registrarse de forma independiente desde el botón superior de Mi Turno, sin necesidad de cerrar el turno.

---

## 5. Cierre de gestión — flujo

```
Jefe Dpto / Admin (en Validación o Dashboard)
    → Localiza la gestión en el modal de validación o en dashboard
    → Pulsa "En proceso" → estado cambia
    → Pulsa "Cerrar" → campo "Acción tomada" obligatorio
    → Al confirmar:
        estado = 'Cerrada'
        accion_tomada = texto
        cerrado_por = currentUser.nombre
        cerrado_ts = localTs()
        tiempo_gestion = minutos entre created_at y cerrado_ts
    → invalidateCache('gestiones')
```

---

## 6. Reglas de negocio

- El empleado **registra** pero **no procesa** — sin botones de cambio de estado en Mi Turno
- La validación del turno **no cierra** gestiones automáticamente
- Una gestión cerrada puede reabrirse solo por admin con motivo + audit_log
- La gestión permanece visible en follow-up y dashboard hasta que esté cerrada
- El tiempo de gestión se graba en BD al cerrar, no se recalcula en frontend
- Semáforo de tiempo: ≤24h 🟢 · ≤48h 🟡 · >48h 🔴

---

## 7. Visibilidad por rol — reglas de fila

| Rol | Qué ve | Puede gestionar/cerrar |
|---|---|---|
| **Empleado** | Todas las gestiones de su departamento | ✅ Sí — puede cambiar estado y cerrar |
| **Jefe Dpto** | Todas las gestiones de su departamento | ✅ Sí |
| **Admin** | Todas | ✅ Sí + eliminar |

> Las gestiones son visibles y gestionables por todos los empleados del departamento.
> No están restringidas al empleado que las creó.
> El empleado SÍ puede cambiar estado y cerrar gestiones de su departamento.

### Visibilidad por módulo

| Módulo | Qué ve | Quién |
|---|---|---|
| Mi Turno | Todas las gestiones pendientes de su departamento | Empleado + Jefe + Admin |
| Mi Turno | Botones En proceso / Cerrar activos | Empleado + Jefe + Admin |
| Validación — lista turnos | Columna "Gestiones" con badge contador | Jefe/Admin |
| Validación — modal turno | Detalle de cada gestión + botones acción | Jefe/Admin |
| Dashboard — Gestiones Pendientes | Todas las del departamento + filtros | Jefe/Admin |

---

## 8. Columnas en dashboard

| Columna | Fuente |
|---|---|
| Fecha apertura | `created_at` |
| Hora apertura | `created_at` |
| Fecha cierre | `cerrado_ts` |
| Hora cierre | `cerrado_ts` |
| Departamento | `departamento` |
| Empleado | `nombre` |
| Tipo | `tipo_gestion` |
| Descripción | `descripcion` |
| Estado | `estado` |
| Acción tomada | `accion_tomada` |
| Tiempo gestión | `tiempo_gestion` con semáforo |
| Cerrado por | `cerrado_por` |

---

## 9. Permisos de eliminación

| Rol | Puede eliminar |
|---|---|
| Empleado | ❌ |
| Jefe Dpto | ✅ Solo gestiones de su departamento |
| Admin | ✅ Todas |

Toda eliminación requiere: confirmación + motivo + `auditLog()` antes del `dbDelete()`.

---

## 10. QA — criterios de aceptación

```
□ El select de tipo muestra la lista correcta del departamento del empleado
□ Al guardar turno, la gestión aparece en tabla 'gestiones' en Supabase
□ El campo 'departamento' nunca es nulo
□ El campo 'created_at' está en hora local España
□ El empleado NO ve botones de cambio de estado
□ El jefe/admin SÍ puede cambiar estado desde validación y dashboard
□ Al cerrar: 'accion_tomada' es obligatoria
□ Al cerrar: se graban cerrado_por, cerrado_ts, tiempo_gestion
□ La validación del turno no cambia el estado de gestiones
□ El dashboard muestra fecha y hora de apertura y cierre
□ El jefe puede eliminar gestiones de su dpto — el empleado no puede
□ Toda eliminación genera registro en audit_log
```
