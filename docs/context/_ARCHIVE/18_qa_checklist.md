# 18 — QA Checklist

---

## 1. Tests por módulo

### Mi Turno

```
□ El formulario está vacío al abrir turno nuevo (sin datos del turno anterior)
□ El checklist mostrado corresponde al departamento del empleado logueado
□ El select de tipo de gestión muestra los tipos del departamento del empleado
□ El select de tipo de incidencia muestra los tipos del departamento del empleado
□ Al guardar turno: aparece confirmación sin error
□ En Supabase tabla 'shifts': el registro existe con departamento correcto
□ En Supabase tabla 'gestiones': el registro existe con departamento correcto (si había gestión)
□ En Supabase tabla 'incidencias': el registro existe con departamento correcto (si había incidencia)
□ El campo 'created_at' está en hora local España (no 2h antes)
□ El bloque Merma aparece SOLO para empleados de Cocina
□ El botón Caja aparece SOLO para Sala, Recepción y SYNCROLAB
□ El empleado NO ve botones "En proceso" ni "Cerrar" en gestiones/incidencias
□ El empleado puede crear tareas pero no cambiar su estado
□ Un segundo turno del mismo empleado el mismo día está bloqueado
```

### Caja Recepción

```
□ El campo "Fondo recibido" se pre-rellena automáticamente con el fondo del cierre anterior
□ El campo "Fondo recibido" es readonly — no editable
□ La fórmula es correcta: Δ Cash = Cash MEWS - (Cash real - Fondo recibido)
□ Las transferencias aparecen en el bloque "Diferencias calculadas"
□ Δ Transferencia = 0 no bloquea ni genera alerta — solo es informativo
□ Si Δ Cash ≠ 0 → campo explicación obligatoria antes de guardar
□ Si Δ Tarjeta ≠ 0 → campo explicación obligatoria
□ Si Δ Stripe ≠ 0 → campo explicación obligatoria
□ Si Fondo real ≠ Fondo esperado → explicación obligatoria
□ Al guardar: aparece en lista de cierres sin recargar página
□ En Supabase tabla 'recepcion_cash': el registro existe
□ Los datos de caja de Recepción NO aparecen en tabla 'sala_cash_closures'
□ Admin puede eliminar cierre: confirmación + motivo + audit_log
□ Empleado/Jefe NO puede eliminar cierre
□ Campo "Última revisión transferencias": se actualiza automáticamente cuando transferencia_banco > 0
```

### Validación

```
□ El módulo Validación NO es accesible para empleados sin rol supervisor/admin
□ La lista de turnos muestra columnas: Fecha · Empleado · Servicio · Horas · Gestiones · Incidencias · Tareas · FIO · Estado
□ La columna Merma aparece SOLO cuando el filtro de departamento activo es Cocina
□ Al abrir modal de un turno: aparecen gestiones, incidencias y tareas del turno
□ Los botones "En proceso" y "Cerrar" están presentes para jefe/admin
□ Los botones NO están presentes si el usuario logueado es empleado
□ Al pulsar "Cerrar" en gestión/incidencia: aparece campo "Acción tomada" obligatorio
□ No permite cerrar sin escribir acción tomada
□ Al cerrar: se graban cerrado_por, cerrado_ts, tiempo_gestion en Supabase
□ La validación del turno NO cierra automáticamente gestiones o incidencias abiertas
□ El bloque Merma en el modal aparece SOLO para turnos de Cocina
□ El bloque Caja aparece SOLO para turnos de Sala/Recepción/SYNCROLAB
□ El modal "Reabrir Informe" tiene botón funcional "Reabrir" (además de Cancelar)
□ No se generan tareas automáticas al guardar gestiones pendientes
```

### Dashboard

```
□ El dashboard NO es accesible para empleados sin rol supervisor/admin
□ Los contadores muestran datos reales de Supabase (no hardcodeados)
□ El filtro de departamento funciona — los datos cambian al cambiar departamento
□ La pestaña Gestiones muestra datos de tabla 'gestiones' (no de 'incidencias')
□ La pestaña Incidencias muestra datos de tabla 'incidencias' (no 'gestiones')
□ Las columnas incluyen: Fecha apertura · Hora apertura · Fecha cierre · Hora cierre
□ El semáforo de tiempo gestión: ≤24h verde · ≤48h amarillo · >48h rojo
□ El jefe de dpto puede eliminar gestiones de su dpto — no incidencias
□ El admin puede eliminar cualquier entidad
□ Toda eliminación genera registro en audit_log
□ Las tareas vencidas aparecen destacadas en rojo
□ Los KPI de Recepción muestran: check-ins, check-outs, días cuadrados/descuadrados, fondo actual
□ FIO aparece en pestaña FIO con datos reales
```

---

## 2. Test End-to-End — flujo completo

### E2E-01: Turno Recepción con gestión e incidencia

```
1. Login como empleado de Recepción
2. Mi Turno → Nuevo turno
3. Verificar que el checklist es el de Recepción (no Cocina)
4. Verificar que el select de gestión muestra los 10 tipos de Recepción
5. Activar "Gestión pendiente" → Sí → Tipo: "Check-in / llegada pendiente" → Descripción
6. Activar "Incidencia" → Sí → Tipo: "Error en reserva / MEWS" → Descripción
7. Guardar turno → sin error
8. Verificar en Supabase:
   - shifts: nuevo registro con departamento='Recepción'
   - gestiones: nuevo registro tipo_gestion='Check-in / llegada pendiente'
   - incidencias: nuevo registro tipo_incidencia='Error en reserva / MEWS'
9. Login como jefe de Recepción
10. Validación → ver el turno recién creado
11. Verificar que aparece "1" en columna Gestiones e "1" en Incidencias
12. Abrir modal del turno
13. Verificar que aparecen los detalles de gestión e incidencia
14. Pulsar "En proceso" en la gestión → estado cambia
15. Pulsar "Cerrar" en la incidencia → escribir acción tomada → confirmar
16. Verificar en Supabase:
    - gestiones: estado='En proceso'
    - incidencias: estado='Cerrada', cerrado_por, cerrado_ts, tiempo_gestion
17. Dashboard → Gestiones Pendientes → verificar que aparece la gestión
18. Dashboard → Incidencias → verificar que aparece la incidencia con estado Cerrada
```

### E2E-02: Cierre de caja Recepción

```
1. Login como empleado de Recepción
2. Pulsar "Caja Recepción" en topbar
3. Verificar que "Fondo recibido" tiene valor del cierre anterior (readonly)
4. Rellenar: Cash MEWS=500, Cash real=600 (diferencia intencional)
5. Verificar que Δ Cash = 500 - (600 - fondo_recibido)
6. Si Δ ≠ 0: verificar que aparece campo de explicación obligatoria
7. Intentar guardar sin explicación → debe bloquearse
8. Escribir explicación → guardar
9. Verificar en Supabase tabla 'recepcion_cash': nuevo registro
10. Verificar que el registro NO aparece en 'sala_cash_closures'
11. Login como admin → Dashboard → verificar que aparece el cierre
12. Admin elimina el cierre → confirmación + motivo → verificar en audit_log
```

### E2E-03: Permisos de empleado

```
1. Login como empleado de Cocina
2. Verificar que NO ve botón "Caja" en topbar
3. Verificar que SÍ ve bloque Merma en Mi Turno
4. Verificar que NO ve módulo Validación
5. Verificar que NO ve Dashboard
6. Registrar gestión e incidencia → guardar turno → sin error
7. Verificar que NO aparecen botones "En proceso" / "Cerrar" en sus gestiones/incidencias
```

---

## 3. QA — campos y valores

```
□ severidad nunca es 'Pendiente revision' — solo 'Baja'·'Media'·'Alta'·'Crítica'
□ requiere_formacion / requiere_disciplina / informado_responsable: solo 'no' · 'si' (minúscula)
□ estado de incidencias/gestiones: solo 'Abierta'·'En proceso'·'Cerrada'
□ created_at nunca en UTC — siempre hora local España
□ departamento nunca nulo en incidencias, gestiones ni shifts
□ shift_id siempre presente si el registro viene de un turno
□ Los arrays '[]' no aparecen visibles en UI — siempre renderizados como texto legible
□ No aparecen errores técnicos en pantalla — solo mensajes de usuario
```

---

## 4. QA — responsive y UX

```
□ La aplicación es usable en móvil (pantalla 375px)
□ Los botones son suficientemente grandes para uso táctil
□ Los modales no se salen de la pantalla en móvil
□ El formulario de turno no requiere scroll horizontal
□ Los selects tienen opciones legibles sin scroll
□ El feedback de guardado (toast) aparece en menos de 2 segundos
□ No hay botones duplicados o contradictorios en el mismo modal
□ Los colores de botón son consistentes: verde=validar, naranja=cerrar, rojo=eliminar
□ El semáforo de tiempo es visible y entendible sin explicación
```
