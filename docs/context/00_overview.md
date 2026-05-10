# 00 — Overview: SynchroHub Follow-up SYNCROSFERA

**Versión:** 2.1  
**Fecha:** 2026-05  
**Estado:** Referencia obligatoria antes de cualquier desarrollo  
**Plataforma:** syncro-hub.vercel.app  
**Stack actual:** Vanilla JS · Supabase (PostgreSQL) · Vercel  

---

## 1. Qué es SynchroHub

SynchroHub Follow-up SYNCROSFERA es la plataforma interna de control operativo diario de SYNCROSFERA (Health Sport Hotel, España). Centraliza en un único punto los siguientes módulos, cada uno con su objetivo operativo específico:

**Registro y seguimiento de turno por departamento**
Controlar la ejecución diaria del empleado: tareas realizadas, horas trabajadas, checklist completado, incidencias registradas, gestiones pendientes declaradas y KPIs del turno. El turno es la unidad operativa base de la plataforma.

> **Regla de visibilidad y gestión por entidad:**
> - **Gestiones:** el empleado crea, ve y gestiona todas las gestiones de su departamento.
> - **Incidencias:** el empleado crea y ve solo las suyas hasta cierre. Solo el jefe/admin las procesa y cierra.
> - **Tareas:** el empleado del departamento destino ve y gestiona las tareas asignadas. El empleado origen solo ve las que creó.

**Gestión de incidencias operativas**
Dar visibilidad inmediata al supervisor para que pueda actuar. Permite medir tiempos de solución, detectar reincidencias y analizar calidad operativa por departamento y empleado.

**Seguimiento de gestiones pendientes entre turnos**
Asegurar el traspaso correcto de información entre turnos. Evitar olvidos y mantener trazabilidad de responsabilidades. Una gestión pendiente no es una incidencia — es algo que debe continuar en el siguiente turno sin necesidad de una resolución formal urgente.

**Asignación y control de tareas interdepartamentales**
Gestionar acciones necesarias entre departamentos con responsable asignado, deadline, estado y control de cumplimiento. Una tarea puede cruzar departamentos — una gestión pendiente no.

**Cierres de caja (departamentos con operación económica)**
Controlar y cuadrar cobros diarios en efectivo, TPV, Stripe y, exclusivamente en Recepción Hotel, transferencias bancarias si aplican. Aplica a tres departamentos: Sala / Restaurante, Recepción Hotel y SYNCROLAB.

**Validaciones de supervisores y jefes de departamento**
El supervisor revisa lo ocurrido en el turno, comprueba la calidad de los datos, solicita correcciones si es necesario y valida la operación. Es el punto de control formal entre la ejecución del empleado y el reporting.

**Control de merma — solo Cocina**
Controlar pérdidas de producto, asignar responsabilidad entre cocineros y justificar desviaciones por parte del Chef y su equipo. La merma es un KPI propio de Cocina, explotable en dashboard por fecha, servicio, empleado, producto, cantidad, motivo y coste estimado.

**FIO — Fallos Individuales Operativos**
Registrar errores individuales de forma objetiva para seguimiento formal, amonestaciones justificadas y posible impacto futuro en bonus o penalizaciones. El FIO no es una incidencia ni una tarea. Solo lo crea el supervisor o admin desde el módulo de Validación.

**Housekeeping — Planificación, ejecución y control de limpieza**
Gestionar la planificación diaria y semanal de habitaciones y zonas públicas, controlar tiempos reales con pausas descontadas, validar el trabajo realizado y alimentar dashboard con KPIs de productividad y cumplimiento.

**Compras necesarias — solo Mantenimiento**
Registrar solicitudes internas de compra de materiales, herramientas o productos necesarios. No deben mezclarse con tareas, incidencias ni gestiones. Tienen estado, prioridad, responsable y trazabilidad propia.

---

## 2. Ecosistema SYNCROSFERA

| Sistema | Rol | Integración SynchroHub |
|---|---|---|
| **Bitrix24** | Single Source of Truth — tareas, CRM, RRHH | Futuro: sync tareas bidireccional |
| **MEWS** | PMS hotel — reservas, check-in/out, room charges | Referencia en caja Recepción |
| **POSMEWS** | POS restaurante — comandas, cobros | Referencia en caja Sala |
| **Nubimed** | Sistema clínica — citas, historial | Referencia en SYNCROLAB |
| **SynchroHub** | Control operativo diario interno | Este sistema |

---

## 3. Departamentos operativos

| Departamento | Caja | Merma | Módulo JS | Estado |
|---|---|---|---|---|
| Cocina | ❌ | ✅ | `cocina.js` | Pendiente crear |
| Sala | ✅ | ❌ | `sala.js` | Activo |
| Recepción Hotel | ✅ | ❌ | `recepcion.js` | Activo |
| SYNCROLAB | ✅ | ❌ | `syncrolab.js` | Pendiente crear |
| Housekeeping | ❌ | ❌ | `housekeeping.js` | Pendiente crear |
| Mantenimiento | ❌ | ❌ | `shared.js` | Activo básico |
| Friegue | ❌ | ❌ | `shared.js` | Activo básico |
| Economato | ❌ | ❌ | `shared.js` | Activo básico |
| RRHH | ❌ | ❌ | `shared.js` | Activo básico |
| Administración | ❌ | ❌ | `shared.js` | Activo básico |

> **Nombre definitivo confirmado: `SYNCROLAB`**
> Usar de forma consistente en tablas, dashboard, permisos y código.
> No usar variantes: "Recepción SYNCROLAB", "RecepcionSyncrolab", "syncrolab".

---

## 4. Módulos principales y KPI

| Módulo | Alimenta dashboard | KPIs principales |
|---|---|---|
| Mi Turno | ✅ | Horas, turnos, incidencias, gestiones por turno |
| Validación | ✅ | Validaciones pendientes, tiempo medio validación |
| Incidencias | ✅ | Abiertas, cerradas, tiempo medio resolución, reincidencias |
| Gestiones Pendientes | ✅ | Abiertas, cerradas, tiempo medio resolución |
| Tareas | ✅ | Pendientes, vencidas, completadas, por departamento |
| FIO | ✅ | Totales, pendientes, por empleado, por tipo |
| Merma (Cocina) | ✅ | Coste total, por producto, por empleado, por servicio |
| Caja | ✅ | Diferencias, cuadre, fondos, días cuadrados/descuadrados |
| Housekeeping | ✅ | Tiempos real vs estimado, cumplimiento, incidencias |
| Compras necesarias | `[NO DATA]` | Pendiente definir KPI para Mantenimiento |
| Mi ruta para hoy | ✅ | Habitaciones completadas, tiempo por habitación |
| Planificación de rutas | ✅ | Carga estimada vs real, cumplimiento |
| Maestro | ❌ | Sin KPI directo |
| Info | ❌ | Sin KPI — solo informativo |

---

## 5. Navegación estándar por departamento operativo

### Base común — todos los departamentos

```
[ Mi turno ] [ Gestiones pendientes ] [ Incidencias ] [ Tareas ]
                        ···
[ Info ] [ 🏢 Nombre departamento ] [ Salir ]
```

**Reglas:**
- Los 4 botones principales siempre visibles para todos los roles
- `Info` siempre a la derecha — solo lectura, no operativo
- Icono y nombre de departamento visibles pero no clicables
- `Salir` siempre visible
- No mostrar botones de otros departamentos
- No duplicar botones
- No mezclar navegación de Admin con empleado lineal

### Módulos adicionales por departamento

| Departamento | Botones adicionales |
|---|---|
| Sala | `Cierre de caja` (derecha) |
| Recepción Hotel | `Caja Recepción` (derecha) |
| SYNCROLAB | `Caja SYNCROLAB` (derecha) |
| Cocina | *(merma integrada en Mi Turno — sin botón adicional)* |
| Housekeeping empleado | `Mi ruta para hoy` (izquierda) |
| Gobernanta / Subgobernanta | `Mi ruta para hoy` · `Planificación de rutas` (izquierda) |
| Mantenimiento | `Compras necesarias` (izquierda) |

### Navegación completa — Housekeeping empleado

```
[ Mi turno ] [ Mi ruta para hoy ] [ Gestiones pendientes ] [ Incidencias ] [ Tareas ]
                        ···
[ Info ] [ 🛏 Housekeeping ] [ Salir ]
```

### Navegación completa — Gobernanta / Subgobernanta

```
[ Mi turno ] [ Mi ruta para hoy ] [ Planificación de rutas ] [ Gestiones pendientes ] [ Incidencias ] [ Tareas ]
                        ···
[ Info ] [ 🛏 Housekeeping ] [ Salir ]
```

### Navegación completa — Mantenimiento

```
[ Mi turno ] [ Compras necesarias ] [ Tareas ] [ Gestiones pendientes ] [ Incidencias ]
                        ···
[ Info ] [ 🔧 Mantenimiento ] [ Salir ]
```

---

## 6. Flujo operativo estándar

```
Login
    ↓
Mi Turno → Inicio de turno
    → Revisar gestiones pendientes heredadas del turno anterior
    → Revisar incidencias abiertas
    → Revisar tareas pendientes asignadas
    ↓
Durante el turno:
    → Completar checklist del departamento
    → Registrar incidencias si ocurren
    → Registrar gestiones pendientes que queden abiertas
    → Crear tareas si es necesario
    → Registrar KPIs específicos del departamento si aplica
    → Registrar módulos específicos (merma, ruta, compras)
    ↓
Cierre de turno
    → Guardar turno
    → Cierre de caja si aplica (Sala, Recepción, SYNCROLAB)
    ↓
[Jefe / Admin] → Validación
    → Revisar checklist
    → Procesar gestiones e incidencias (cambiar estado, cerrar)
    → Revisar caja si aplica
    → Crear FIO si aplica
    → Validar turno
    ↓
Dashboard → refleja datos en tiempo real
    ↓
Logout
```

---

## 7. Separación obligatoria entre entidades

> **Incidencias, gestiones pendientes y tareas son entidades diferentes.
> No deben compartir tabla principal ni usarse como sustitutos entre sí.**

| Entidad | Cuándo usar | Tabla SQL |
|---|---|---|
| **Incidencia** | Algo que ya ocurrió y afectó operación, cliente, calidad o dinero | `incidencias` |
| **Gestión pendiente** | Algo que debe continuar entre turnos del mismo departamento | `gestiones` |
| **Tarea** | Acción formal asignada con deadline, puede ser interdepartamental | `tareas` |
| **FIO** | Error individual detectado por supervisor en validación | `fio` |
| **Merma** | Pérdida de producto — solo Cocina | `merma` |
| **Compra necesaria** | Solicitud de compra — solo Mantenimiento | `maintenance_purchases` |
| **Ruta Housekeeping** | Plan diario de limpieza | `housekeeping_plans` |
| **Asignación Housekeeping** | Habitación o zona asignada a empleado | `housekeeping_assignments` |

---

## 8. FIO — definición y reglas

El FIO no es una incidencia operativa ni una tarea. Es un fallo individual operativo detectado por el supervisor durante la validación del turno.

**Finalidad:**
- Registrar errores objetivos de un empleado específico
- Documentar reincidencias con trazabilidad
- Justificar amonestaciones formales de forma objetiva
- Posible impacto futuro en bonus o penalizaciones

**Reglas obligatorias:**
- Solo lo crea supervisor o admin — nunca el empleado
- Se crea exclusivamente desde el módulo de Validación
- Campos obligatorios: empleado afectado, tipo, severidad, comentario, fecha, responsable que lo registra
- Se refleja en dashboard y reportes de control de personal
- El empleado no puede crear FIO ni ver FIO de otros empleados

---

## 9. Vinculación entre departamentos

La plataforma permite relación entre departamentos sin mezclar datos entre sus tablas.

| Ejemplo operativo | Mecanismo técnico |
|---|---|
| Recepción crea tarea para Mantenimiento | `tareas`: `dept_origen='Recepción'`, `dept_destino='Mantenimiento'` |
| SYNCROLAB crea tarea para Housekeeping | `tareas`: `dept_origen='SYNCROLAB'`, `dept_destino='Housekeeping'` |
| Sala registra incidencia con impacto en Cocina | `incidencias`: `departamento='Sala'` |
| Mantenimiento registra compra derivada de tarea | `maintenance_purchases` con `tarea_id` de referencia |
| Admin visualiza todo | Sin filtro de departamento |
| Jefe visualiza y valida solo su ámbito | Filtro fijo por `departamento` |

Cada vínculo interdepartamental debe guardar: `departamento` origen, `dept_destino`, `employee_id`, `responsable_id`, `estado`, `fecha`, `created_at` y registro en `audit_log` si hay DELETE.

---

## 10. Módulo Info

Apartado informativo no operativo que puede mostrar instrucciones del departamento, reglas de uso, criterios operativos, ayuda rápida o procedimientos internos. No guarda datos operativos ni alimenta dashboard. Es de solo lectura para todos los roles excepto admin.

---

## 11. Regla técnica — estructura SQL

Cada entidad tiene su tabla con responsabilidad exclusiva. No cruzar datos entre tablas de cajas ni usar `incidencias` para guardar gestiones.

| Tabla | Entidad exclusiva |
|---|---|
| `shifts` | Turnos |
| `incidencias` | Incidencias operativas |
| `gestiones` | Gestiones pendientes |
| `tareas` | Tareas interdepartamentales |
| `fio` | Fallos Individuales Operativos |
| `merma` | Merma Cocina |
| `maintenance_purchases` | Compras necesarias Mantenimiento |
| `housekeeping_plans` | Planificaciones Housekeeping |
| `housekeeping_assignments` | Asignaciones Housekeeping |
| `housekeeping_rooms` | Catálogo habitaciones |
| `housekeeping_public_areas` | Catálogo zonas públicas |
| `sala_cash_closures` | Caja Sala |
| `recepcion_cash` | Caja Recepción Hotel |
| `syncrolab_cash` | Caja SYNCROLAB |
| `audit_log` | Auditoría |

**Transferencias bancarias: exclusivo de `recepcion_cash`. No añadir a Sala ni SYNCROLAB.**
