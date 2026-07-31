# 00 — Overview: SYNCRO SHIFT

**Actualizado:** 2026-07-31
**Plataforma:** syncro-shift.vercel.app (antes syncro-hub.vercel.app)
**Stack:** Vanilla JS · Supabase (PostgreSQL) · Vercel auto-deploy
**Repo:** github.com/AlexSfera/syncro_hub (rama `main`)

---

## 1. Qué es SYNCRO SHIFT

Plataforma interna de control operativo diario de SYNCROSFERA (Health Sport Hotel, España). Centraliza: registro de turnos, gestiones pendientes, incidencias, tareas interdepartamentales, cierres de caja (3 departamentos), validaciones de supervisores, merma, FIO, housekeeping, Kanban mantenimiento, incentivos, informes POSMEWS, fichaje Bitrix, sala hipóxica.

---

## 2. Ecosistema SYNCROSFERA

| Sistema | Rol | Integración |
|---|---|---|
| **Bitrix24** | SSOT — tareas, CRM, RRHH, fichaje | Sync fichaje vía `bitrix-sync.js` (Edge Function) + alertas |
| **MEWS** | PMS hotel — reservas, check-in/out | Referencia en caja Recepción. HK FASE 2 vía n8n (no implementada) |
| **POSMEWS** | POS restaurante — comandas, cobros | CSV upload en Informes. Caja Sala |
| **Nubimed** | Sistema clínica — citas, historial | Referencia en caja SYNCROLAB |
| **VirtuGym** | App gimnasio | Referencia en caja SYNCROLAB |
| **n8n** | Middleware automatizaciones | Cuadrantes, MEWS sync (futuro) |

---

## 3. Departamentos y módulos

| Departamento | Caja | Merma | Módulo JS | Estado |
|---|---|---|---|---|
| Cocina | ❌ | ✅ | `merma.js` (merma compartida con Friegue/FnB) | Activo |
| Sala | ✅ | ❌ | `sala.js` + `caja.js` | Activo |
| Recepción Hotel | ✅ | ❌ | `recepcion.js` | Activo |
| SYNCROLAB | ✅ | ❌ | `syncrolab.js` | Activo |
| Housekeeping | ❌ | ❌ | `housekeeping.js` | Activo (FASE 1) |
| Mantenimiento | ❌ | ❌ | `mantenimiento.js` (Kanban tareas) | Activo |
| Friegue | ❌ | ✅ | `shared.js` (base) + `merma.js` | Activo básico |
| FnB | ❌ | ✅ | `shared.js` (base) + `merma.js` | Activo básico |
| Economato | ❌ | ❌ | `shared.js` (base) | Activo básico |
| RRHH | ❌ | ❌ | `shared.js` (base) | Activo básico |
| Administración | ❌ | ❌ | `shared.js` (base) | Activo básico |

---

## 4. Separación obligatoria entre entidades

| Entidad | Cuándo usar | Tabla |
|---|---|---|
| **Incidencia** | Algo que ya ocurrió y afectó operación/cliente/calidad/dinero | `incidencias` |
| **Gestión pendiente** | Algo que debe continuar entre turnos del mismo departamento | `gestiones` |
| **Tarea** | Acción formal con deadline, puede ser interdepartamental | `tareas` |
| **FIO** | Error individual detectado por supervisor en validación | `fio` |
| **Merma** | Pérdida de producto — Cocina/Friegue/FnB | `merma` |
| **Asignación HK** | Habitación/zona/tarea periódica asignada a empleado HK | `housekeeping_assignments` |

Cada entidad tiene tabla propia. No mezclar. No crear tareas por merma. No crear incidencias por gestiones.

---

## 5. Flujo operativo estándar

```
Login (PIN)
  → Mi Turno → Inicio de turno
    → Revisar gestiones heredadas del turno anterior
    → Revisar incidencias abiertas
    → Revisar tareas pendientes
  → Durante el turno:
    → Completar checklist
    → Registrar incidencias / gestiones / tareas
    → Módulos específicos (merma, ruta HK, caja)
  → Cierre de turno → Guardar
  → Cierre de caja si aplica (Sala, Recepción, SYNCROLAB)

[Jefe/Admin] → Validación
  → Revisar checklist, gestiones, incidencias, caja, merma
  → Crear FIO si aplica
  → Validar turno

Dashboard → refleja datos en tiempo real
```

---

## 6. Documentación del proyecto — índice

### Activos (actualizados julio 2026)

| Doc | Contenido |
|---|---|
| `03_roles_permissions.md` | Roles, SUPERVISOR_DEPT_MAP, matrices de permisos, personal clave |
| `04_departments.md` | Configuración departamental, módulos JS activos |
| `05_shifts_and_checklists.md` | Turnos, columnas, FEAT-TURNO-AUTO, checklist_items |
| `07_incidents.md` | Incidencias: columnas, adjuntos, visibilidad, cierre |
| `08_pending_managements.md` | Gestiones: columnas, leido_por, prioridad, cierre |
| `09_tasks.md` | Tareas: estados, deadline, verificación, adjuntos |
| `10_caja_all.md` | Cierres de caja Sala + Recepción + SYNCROLAB (unificado) |
| `13_kitchen_waste.md` | Merma: Cocina/Friegue/FnB, búsqueda dual, cálculo coste |
| `14_validations.md` | Validación: 7 pestañas, contable, FIO, merma |
| `20_housekeeping.md` | HK: planificación, ejecución, revisión, zonas, FASE 2 |
| `21_maintenance_purchases.md` | Mantenimiento: Kanban tareas con fecha_ejecucion |
| `22_auto_turno_assignment.md` | Asignación automática de turno |
| `23_feat_turno_auto_implementacion.md` | Implementación FEAT-TURNO-AUTO |

### Referencia compacta

| Doc | Contenido |
|---|---|
| `trampas.md` | 18 trampas confirmadas que causaron bugs |
| `mapa-modulos.md` | Mapa completo de módulos JS, funciones, sobreescrituras |
| `esquema-supabase.md` | 46 tablas, columnas clave, auditoría RLS |

### Archivados (`_ARCHIVE/`)

| Doc | Razón |
|---|---|
| `01_architecture.md` | Cubierto por mapa-modulos.md |
| `02_global_app_structure.md` | Cubierto por mapa-modulos.md |
| `15_dashboard.md` | B7 redesign pendiente; KPIs de referencia |
| `16_master_admin.md` | Cubierto por esquema-supabase.md + mapa-modulos.md |
| `17_sql_data_model.md` | Cubierto por esquema-supabase.md |
| `18_qa_checklist.md` | Tests absorbidos en docs individuales + trampas.md |
| `19_open_questions.md` | Mayoría respondidas por implementación |
| `SYNCRO_HUB_ARCHITECTURE N.md` | Cubierto por mapa-modulos.md + memoria |

### Eliminados (reemplazados)

| Doc | Reemplazado por |
|---|---|
| `10_11_12_cash_closures.md` | `10_caja_all.md` |
| `caja_sala_spec.md` | `10_caja_all.md` |
| `Caja SyncroLab.md` | `10_caja_all.md` |

---

## 7. Preguntas abiertas residuales

| Pregunta | Estado |
|---|---|
| ¿Jefes ven dashboard de otro dpto en lectura? | `adjunto_directivo` con `['*']` sí. Jefe normal no. |
| ¿Exportación a Excel/PDF desde dashboard? | No implementado. B7 scope. |
| ¿Dashboard histórico (semanas/meses anteriores)? | Sí — filtros Desde/Hasta con calendar picker. |
| ¿Sync bidireccional tareas ↔ Bitrix24? | No implementado. Solo fichaje sync activo. |
| ¿API MEWS para importar datos de caja? | No implementado. Datos manuales. |
| ¿Merma genera incidencia automática si supera umbral? | No. Son independientes. |
| ¿Checklists editables desde Maestro? | No. Hardcodeados en `checklist.js`. |
| ¿Notificaciones (email/push/WhatsApp)? | No implementado. |
| ¿Purga/archivo de datos antiguos? | No implementado. Todo en tabla principal. |
