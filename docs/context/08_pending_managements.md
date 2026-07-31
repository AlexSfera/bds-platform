# 08 — Gestiones Pendientes

*Actualizado 30 jul 2026 — cruzado contra `shared.js`, `adjuntos.js`, `gestiones.js` del repo.*

---

## 1. Definición

Una **gestión pendiente** es un asunto operativo que queda sin resolver al final del turno y debe continuar en el siguiente. No es un problema grave (incidencia) ni una acción asignable a otro departamento (tarea).

---

## 2. Tabla Supabase: `gestiones` (424 filas)

| Columna | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | TEXT PK | ✅ | `genId()` |
| `shift_id` | TEXT | ✅ | ID del turno donde se registró |
| `employee_id` | TEXT | ✅ | ID del empleado que registra |
| `nombre` | TEXT | ✅ | Nombre legible del empleado |
| `creado_por` | TEXT | — | Nombre del creador (puede diferir de `nombre` si se crea standalone) |
| `departamento` | TEXT | ✅ | Departamento origen — nunca nulo |
| `area` | TEXT | — | Alias de departamento |
| `fecha` | TEXT | ✅ | YYYY-MM-DD |
| `servicio` | TEXT | ✅ | Turno |
| `tipo_gestion` | TEXT | ✅ | De `incidencia_tipos.js` → `GESTION_TIPOS` |
| `descripcion` | TEXT | ✅ | Qué queda pendiente |
| `prioridad` | TEXT | — | `'alta'` · `'media'` · `'baja'` — mostrada con semáforo 🔴🟡🟢 |
| `habitacion` | TEXT | — | Número de habitación (si aplica) |
| `num_reserva` | TEXT | — | Número de reserva (si aplica) |
| `accion_tomada` | TEXT | — | Obligatoria al cerrar |
| `estado` | TEXT | ✅ | `'Abierta'` → `'En proceso'` → `'Cerrada'` |
| `leido_por` | JSONB | — | Array de IDs de usuarios que han leído la gestión |
| `adjuntos` | JSONB | — | Array de URLs de archivos adjuntos (via `adjuntos.js`) |
| `cerrado_por` | TEXT | — | Nombre de quien cierra |
| `cerrado_ts` | TEXT | — | Timestamp de cierre |
| `tiempo_gestion` | INTEGER | — | Minutos apertura → cierre |
| `informado_responsable` | TEXT | ✅ | `'no'` · `'si'` |
| `created_at` | TIMESTAMPTZ | ✅ | `localTs()` |
| `updated_at` | TIMESTAMPTZ | — | Última modificación |

---

## 3. Estados

| Estado | Transición | Quién |
|---|---|---|
| `'Abierta'` | → En proceso · → Cerrada | **Cualquier empleado del dpto** · Jefe · Admin |
| `'En proceso'` | → Cerrada | **Cualquier empleado del dpto** · Jefe · Admin |
| `'Cerrada'` | → Abierta (solo admin, con motivo + audit_log) | Admin |

**⚠ A diferencia de incidencias, el empleado SÍ puede cambiar estado y cerrar gestiones de su departamento.** `bGestionEstadoClick` en `gestiones.js` es clickable sin check de rol.

---

## 4. Leído por

`leido_por` (JSONB array) registra qué usuarios han visto la gestión. Se actualiza vía PATCH directo:

```javascript
// shared.js ~4282
function registrarLecturaGestion(rec) {
  var leido = Array.isArray(rec.leido_por) ? rec.leido_por.slice() : [];
  if(leido.indexOf(currentUser.id) >= 0) return;
  leido.push(currentUser.id);
  // PATCH directo (no sbRequest por return=minimal)
  fetch(url, { body: JSON.stringify({leido_por: leido}) });
}
```

---

## 5. Adjuntos

`adjuntos.js` inyecta contenedores de adjuntos en gestiones (Mi Turno y modal standalone). Archivos en bucket `adjuntos` de Supabase Storage, guardados como JSON en `gestiones.adjuntos`.

---

## 6. Reglas de negocio

- **Todos los empleados del departamento** pueden ver y gestionar las gestiones de su departamento
- Las gestiones NO están restringidas al empleado que las creó
- La validación del turno **NO cierra** gestiones automáticamente
- Cerrada solo reabierta por admin con motivo + audit_log
- Semáforo: ≤24h 🟢 · ≤48h 🟡 · >48h 🔴
- También registrable de forma standalone (botón "Nueva gestión" fuera del flujo de turno)

---

## 7. Visibilidad por rol

| Rol | Qué ve | Puede gestionar/cerrar |
|---|---|---|
| Empleado | Todas las gestiones de **su departamento** (no cerradas) | ✅ Sí |
| Jefe Dpto | Todas las de su departamento | ✅ Sí |
| Admin/Adjunto | Todas | ✅ Sí + eliminar |

---

## 8. Eliminación

| Rol | Puede eliminar |
|---|---|
| Empleado | ❌ |
| Jefe Dpto | ✅ Solo de su departamento |
| Admin/Adjunto | ✅ Todas (`canActAsAdmin`) |

Toda eliminación: confirmación + motivo + `auditLog()` antes de `dbDelete()`.
