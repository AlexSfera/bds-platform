# Esquema Supabase — SYNCRO SHIFT

**Proyecto:** `tsfhrpdpbkciofvejrao` · **46 tablas en `public`** · Generado 2026-07-26 desde `pg_policies` + `list_tables`.

---

## Auditoría RLS (25/07/2026)

| Hallazgo | Detalle |
|---|---|
| Policies totales | 61 |
| USING(true) para anon/public | 56 de 61 (las 5 restantes son INSERT sin restricción) |
| **Tablas bloqueadas** (RLS on, sin policy) | `cocina_costes_mes`, `cuadrantes`, `dept_reports`, `employee_status`, `incentivos_liquidaciones` |
| Solo SELECT | `platos_carta`, `productos_compra`, `escandallo_lineas` |
| **Conclusión** | RLS es decorativo — cualquier cliente anon tiene CRUD total en 38 tablas. La seguridad real está en JS (PIN + rol). |

---

## Tablas por dominio

### CORE

| Tabla | Filas | Propósito | Columnas clave | FKs |
|---|---|---|---|---|
| `employees` | 73 | Maestro de personal | id(text PK), nombre, area, puesto, pin, rol, estado, email, inc_metodo, inc_umbral, inc_precio_hora, inc_base_neto, bitrix_user_id | ← employee_ips.employee_id |
| `shifts` | 1895 | Turnos / cierre de turno | id(text PK), employee_id, fecha, fecha_operativa, area, puesto, servicio, horas, estado, follow_up, merma_declarada, ajustes_sala(json), kpi_entrenador(jsonb), horas_bitrix, horas_source, bitrix_shift_id(unique) | — |
| `departments` | 6 | Catálogo departamentos | id(uuid PK), name, code(unique) | — |
| `audit_log` | 6018 | Auditoría de acciones | id, ts, usuario, rol, **action**, **detail**, usuario_id, tabla, registro_id | — |
| `item_comentarios` | 376 | Comentarios en gestiones/incidencias/tareas | id, item_type, item_id, autor, texto | — |
| `employee_notes` | 4 | Notas de empleado (Sugerencia/Queja/Mejora) | id, employee_id, categoria(check), texto, leida | — |
| `employee_ips` | 10 | IPs autorizadas para fichaje | id, employee_id → employees.id, ip, label, active | FK employees |
| `employee_status` | 0 | Bajas/vacaciones (**BLOQUEADA — sin policy**) | id, employee_id, tipo, fecha_inicio, fecha_fin | — |

### GESTIONES · INCIDENCIAS · TAREAS

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `gestiones` | 424 | Gestiones operativas por depto | id, shift_id, employee_id, departamento, tipo_gestion, estado(Abierta→En proceso→Cerrada), prioridad, leido_por(jsonb), habitacion, adjuntos(jsonb) |
| `incidencias` | 267 | Incidencias de servicio | id, shift_id, employee_id, departamento, categoria, severidad, tipo_incidencia, estado, staff_implicado_ids, adjuntos(jsonb) |
| `tareas` | 140 | Tareas inter-departamentales | id, dept_destino, dept_origen, prioridad, deadline, estado(Pendiente→…→Hecho), planificacion, room, tipo, fecha_ejecucion, adjuntos(jsonb) |

### CAJA

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `sala_cash_closures` | 130 | Cierres de caja Sala (POSMEWS) | id, fecha, servicios, efectivo_posmews, efectivo_real, tarjeta_posmews, tarjeta_tpv, stripe_posmews, stripe_real, diferencia_*, fondo_*, estado, tipo(cierre/traspaso), reabierto_*, corregida, imagenes_adjuntas(jsonb), redactado_por_jefe |
| `recepcion_cash` | 171 | Cierres de caja Recepción (MEWS) | id, shift_id, fecha, turno, cash_mews, tpv_real, stripe_*, dif_*, transferencia_banco/mews, room_charge_recibido, departamento(default recepcion), reabierto_*, corregida, imagenes_adjuntas(jsonb), comentario_validador |
| `recepcion_cash_closures` | 0 | Cierres Recepción (legacy, sin uso activo) | Similar a recepcion_cash |
| `syncrolab_cash_closures` | 64 | Cierres de caja SYNCROLAB (Nubimed + VirtuGym) | id, fecha, turno, tipo, *_nubimed_sistema/real, *_virtugym_sistema/real, diferencia_*, efectivo_traspasado_*, reabierto_*, corregida, imagenes_adjuntas(jsonb) |
| `syncrolab_room_charges` | 75 | Cargos a habitación desde SYNCROLAB | id, syncrolab_cash_id, sistema, habitacion, huesped_nombre, concepto, importe, estado, imagen_url |
| `recepcion_ventas` | 64 | Cross-selling Recepción | id, shift_id, empleado_id, tipo_venta, importe, reserva_mews, departamento_relacionado |
| `ajustes` | 26 | Ajustes Sala (descuentos, anulaciones, invitaciones) | id, shift_id, employee_id, tipo, importe, motivo, estado_aprobacion |

### MERMA

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `merma` | 89 | Declaraciones de merma (solo Cocina/Friegue/F&B) | id, shift_id, employee_id, producto, cantidad, unidad, causa, coste_unitario, coste_total, area |

### HOUSEKEEPING

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `housekeeping_rooms` | 46 | Catálogo de habitaciones | id, numero(unique), tipo, planta, mews_resource_id(unique), tiempo_salida_min, mews_state |
| `housekeeping_room_clean_types` | 7 | Tipos de limpieza (repaso, salida, etc.) | id, nombre, tiempo_min |
| `housekeeping_public_areas` | 71 | Zonas públicas + tareas diarias | id, nombre, zona_grupo, tipo_tarea, dias_minutos, hora_objetivo |
| `housekeeping_periodic_tasks` | 56 | Tareas periódicas HK | id, nombre, categoria, frecuencia_dias, proxima_ejecucion_ts |
| `housekeeping_plans` | 19 | Planes diarios de asignación | id, fecha, turno, estado | FK ← assignments |
| `housekeeping_assignments` | 335 | Asignaciones concretas | id, plan_id → plans.id, employee_id, tipo_objeto, objeto_id, tipo_limpieza, estado, revisado_por, checklist_data, mews_sync_* |
| `housekeeping_mews_sync_log` | 0 | Log de sync MEWS ↔ HK | id, direccion, entidad, mews_resource_id, resultado |

### FIO (Fault Individual Operation)

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `fio_catalog` | 110 | Catálogo de faltas por depto | id, departamento, categoria, nombre, nivel_default, puntos_default, critico |
| `fio` | 60 | Registros FIO individuales | id, employee_id, fault_id, incentive_month, level_code, applied_points, status(Registrado→…), saldado, evidence_image |

### INCENTIVOS

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `dept_incentive_rules` | 2 | Reglas de incentivo por depto (Sala) | id, departamento, periodo, **objetivo**(no objetivo_ventas), importe_bonus, **updated_by**(no updated_at) |
| `employee_sales_weekly` | 1 | Ventas semanales por empleado (Sala) | id, employee_id, year_week, fecha_inicio_semana, ventas, comensales |
| `employee_incentives` | 0 | Liquidaciones incentivos Sala | id, employee_id, month, ventas_total, bonus_*, fio_count, fio_points, penalty_percent, status |
| `incentivos_liquidaciones` | 0 | Liquidaciones genéricas (**BLOQUEADA — sin policy**) | id, empleado_id, mes, incentivo_bruto/final |

### ENTRENADORES

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `entrenadores_kpi` | 0 | KPI diarios por entrenador | id, employee_id, fecha, turno, k_pt, k_pt_duo, k_pt_30, k_dir_efectivas, k_val_funcional, k_visbody, k_banera_hielo |
| `entrenadores_incentivos_mes` | 18 | Incentivos mensuales congelados | id, employee_id, ym, sesiones_efectivas, umbral, incentivo_bruto, metodo_calculo, horas_efectivas, precio_hora, base_neto, liquidado, liquidado_fotos(jsonb) |

### COCINA (escandallo)

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `productos_compra` | 1279 | Catálogo de productos (**SELECT only**) | id(uuid), nombre, categoria, proveedor, coste_unidad_compra, coste_por_g(generated), merma_pct | FK ← escandallo_lineas |
| `platos_carta` | 58 | Catálogo de platos (**SELECT only**) | id(uuid), nombre, categoria, precio_venta | FK ← escandallo_lineas |
| `escandallo_lineas` | 0 | Líneas de escandallo (**SELECT only**) | id(uuid), plato_id → platos_carta, producto_id → productos_compra, cantidad_racion, es_batch |
| `cocina_costes_mes` | 0 | Coste materia prima mensual (**BLOQUEADA — sin policy**) | id, mes, ventas_comida, coste_mp, porcentaje |

### BITRIX (fichaje externo)

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `bitrix_time_records` | 2056 | Fichajes crudos importados Bitrix24 Timeman | id, bitrix_record_id(unique bigint), bitrix_user_id, employee_id, start_ts, end_ts, duration_seconds, fecha_operativa, sync_status, matched_shift_id |
| `bitrix_attendance` | 0 | Resumen diario fichaje Bitrix (sync n8n) | id, employee_id, bitrix_user_id, fecha, hora_entrada/salida, horas_trabajadas |
| `bitrix_alerts` | 622 | Alertas de control (IP sospechosa, etc.) | id, ts, nombre_empleado, tipo_alerta, ip_detectada, fecha_exacta |

### REPORTING

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `sala_produccion_semanal` | 52 | Producción Sala importada de CSV POSMEWS Facturas | id, employee_id, nombre, semana_inicio, semana_fin, periodo, produccion_bruta, facturas, detalle_diario(jsonb) |
| `sala_informes_control` | 25 | Control de subida semanal de 4 informes POSMEWS | id, periodo, semana_inicio/fin, tipo, formato_ok, periodo_ok, contenido_ok |
| `dept_reports` | 0 | Informes departamentales (**BLOQUEADA — sin policy**) | id, departamento, tipo, periodo, contenido_json, estado |
| `cuadrantes` | 0 | Cuadrantes semanales (**BLOQUEADA — sin policy**) | id, departamento, semana, propuesta_json, estado |

### HYPOXIC

| Tabla | Filas | Propósito | Columnas clave |
|---|---|---|---|
| `hypoxic_room_incidencias` | 4 | Incidencias sala hipóxica | id, shift_id, room_number, incident_types, co2_level, door_open_*, estado(Pendiente→…), current/set_point_altitude_m |
