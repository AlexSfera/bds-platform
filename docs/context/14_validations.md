# 14 — Validaciones

---

## 1. Definición

La validación es el proceso por el cual un jefe de departamento o administrador revisa y aprueba el cierre de turno de un empleado, y gestiona el estado de las incidencias, gestiones y tareas asociadas.

---

## 2. Quién puede validar

| Rol | Alcance |
|---|---|
| Administrador | Todos los departamentos |
| Jefe de Departamento | Solo su departamento |
| Empleado | ❌ No puede validar |

---

## 3. Qué se valida en el modal de turno

Al abrir el modal de validación de un turno, el validador ve:

| Sección | Condición de visibilidad |
|---|---|
| Datos del turno (fecha, empleado, horas, servicio) | Siempre |
| Checklist completado | Siempre |
| Gestiones pendientes del turno | Siempre |
| Incidencias operativas del turno | Siempre |
| Tareas creadas en el turno | Siempre |
| FIO (si existe) | Siempre |
| Bloque Merma | Solo si `deptTieneMerma(shift.departamento)` |
| Bloque Caja | Solo si `deptTieneCaja(shift.departamento)` |
| Sección Evaluación Supervisor / FIO | Solo jefe/admin |

---

## 4. Acciones disponibles en el modal

### Sobre gestiones

| Botón | Acción | Quién puede usar |
|---|---|---|
| "En proceso" | estado → 'En proceso' | **Empleado del dpto** · Jefe · Admin |
| "Cerrar" | estado → 'Cerrada' + graba cerrado_por, cerrado_ts, tiempo_gestion | **Empleado del dpto** · Jefe · Admin |

> El empleado SÍ puede gestionar y cerrar las gestiones de su departamento desde el modal.

### Sobre incidencias

| Botón | Acción | Quién puede usar |
|---|---|---|
| "En proceso" | estado → 'En proceso' | Solo **Jefe del dpto** · Admin |
| "Cerrar" | estado → 'Cerrada' + campo "Acción tomada" obligatorio | Solo **Jefe del dpto** · Admin |

> El empleado NO puede gestionar ni cerrar incidencias. Solo puede verlas hasta que estén cerradas.

### Sobre tareas

| Botón | Acción | Quién puede usar |
|---|---|---|
| "En proceso" | estado → 'En proceso' | **Empleado dpto destino** · Jefe · Admin |
| "Cerrar" | estado → 'Completada' | **Empleado dpto destino** · Jefe · Admin |

**Reglas comunes:**
- Si estado = 'Abierta' → muestra "En proceso" y "Cerrar"
- Si estado = 'En proceso' → muestra solo "Cerrar"
- Si estado = 'Cerrada' → no muestra botones

### Sobre el turno

| Botón | Acción | Quién |
|---|---|---|
| "Validar turno" | estado del shift → 'validado', graba validado_por y validado_ts | Jefe/Admin |
| "Reabrir informe" | estado del shift → 'pendiente', graba reabierto_por y motivo | Jefe/Admin |
| "Añadir FIO" | Abre formulario de FIO para el turno | Jefe/Admin |

---

## 5. Estados del turno (shift)

| Estado | Descripción |
|---|---|
| `'pendiente'` | Turno cerrado por empleado, pendiente de validación |
| `'validado'` | Validado por jefe/admin |
| `'requiere_correccion'` | Devuelto al empleado para corrección |

---

## 6. Columnas en lista de turnos (módulo Validación)

| Columna | Fuente | Notas |
|---|---|---|
| Fecha | `shifts.fecha` | |
| Empleado | `shifts.nombre` | |
| Servicio | `shifts.turno` | |
| Horas | `shifts.horas` | |
| Gestiones | COUNT gestiones del turno | Badge naranja si >0 abiertas |
| Incidencias | COUNT incidencias del turno | Badge naranja si >0 abiertas |
| Tareas | COUNT tareas del turno | Badge naranja si >0 pendientes |
| Merma | COUNT mermas del turno | Solo columna visible en Cocina |
| FIO | Indicador si existe FIO | |
| Estado | `shifts.estado` | Badge: pendiente/validado/requiere corrección |
| Acción | Botón "Revisar" · Botón eliminar (solo admin) | |

---

## 7. Bloqueos en validación

| Condición | Resultado |
|---|---|
| Merma sin precio asignado (Cocina) | No permite validar — muestra alerta |
| Gestión abierta | Permite validar — no bloquea — gestión permanece abierta |
| Incidencia abierta | Permite validar — no bloquea — incidencia permanece abierta |
| Caja no cuadrada | Alerta visual — no bloquea la validación |

---

## 8. Reglas absolutas de validación

- **La validación del turno NO cierra automáticamente ninguna gestión ni incidencia**
- **Las gestiones e incidencias tienen ciclo de vida independiente del turno**
- Un turno puede validarse aunque tenga gestiones o incidencias abiertas
- El cierre de gestiones e incidencias es una acción manual del jefe/admin

---

## 9. Trazabilidad

Toda acción de validación debe quedar registrada:

```javascript
// Al validar turno
await dbUpdate('shifts', shiftId, {
  estado:       'validado',
  validado_por: currentUser.nombre,
  validado_ts:  localTs()
});

// Al cerrar incidencia desde validación
await dbUpdate('incidencias', inciId, {
  estado:        'Cerrada',
  accion_tomada: texto,
  cerrado_por:   currentUser.nombre,
  cerrado_ts:    localTs(),
  tiempo_gestion: minutosDesdeApertura
});
invalidateCache('incidencias');
```

---

## 10. FIO — Fallo Individual Operativo

El FIO se crea desde el modal de validación por el jefe o admin.

Campos del formulario FIO:
- ¿Hay FIO? Sí / No / Sin error
- Empleado(s) responsable(s) — búsqueda por nombre
- Concepto FIO (desplegable)
- Severidad FIO
- Impacto en bonus (desplegable)
- Comentario supervisor (obligatorio)

Permisos:
- Crear FIO: jefe/admin
- Revalidar FIO: solo admin y responsable de departamento

---

## 11. QA — criterios de aceptación

```
□ El módulo Validación no es accesible a empleados sin rol supervisor
□ La lista de turnos muestra columnas Gestiones, Incidencias y Tareas
□ La columna Merma aparece solo cuando el departamento activo es Cocina
□ El modal de validación muestra gestiones, incidencias y tareas del turno
□ Los botones "En proceso" y "Cerrar" son visibles para jefe/admin
□ El empleado logueado no ve botones de acción en el modal
□ "Cerrar" requiere texto en "Acción tomada" — no permite cerrar sin él
□ Al cerrar: cerrado_por, cerrado_ts y tiempo_gestion se graban en Supabase
□ Validar turno graba validado_por y validado_ts
□ Reabrir turno graba reabierto_por y motivo
□ El modal "Reabrir Informe" tiene botón "Reabrir" funcional
□ Validar el turno no cambia el estado de gestiones/incidencias abiertas
□ El bloque Merma en el modal solo aparece para turnos de Cocina
□ El bloque Caja solo aparece para turnos de Sala/Recepción/SYNCROLAB
```
