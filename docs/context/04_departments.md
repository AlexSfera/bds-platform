# 04 — Departamentos

*Actualizado 30 jul 2026 — cruzado contra `shared.js`, `getScreens()` y módulos JS del repo.*

---

## 1. Catálogo de departamentos

No existe un objeto `DEPT_CONFIG` centralizado en código. La configuración se distribuye entre `DEPT_ICONS`, `DEPT_COLORS`, `SUPERVISOR_DEPT_MAP`, `AREA_GROUPS` y flags en `getScreens()`.

```javascript
const DEPT_ICONS = {
  'Cocina':'🍳','Sala':'🍽','Mantenimiento':'🔧','Recepción':'🏨',
  'Administración':'📋','Economato':'📦','Limpieza':'🧹'
};
```

---

## 2. Fichas por departamento

### Cocina

| Campo | Valor |
|---|---|
| Caja | ❌ (cierre de caja es de Sala) |
| Merma | ✅ (pantalla Merma en MI DÍA) |
| Módulo JS | Lógica en `shared.js` (no existe `cocina.js`) |
| Supervisor | `chef` (Cocina + Friegue) |
| Checklist | ✅ Apertura + Cierre |
| Nav especial | Merma en MI DÍA |

### Sala

| Campo | Valor |
|---|---|
| Caja | ✅ `sala_cash_closures` via `caja.js` (98 KB) |
| Merma | ❌ |
| Supervisor | `fb` (Sala + Cocina + Friegue) |
| Checklist | ✅ Apertura + Cierre |
| Nav especial | Cierre/traspaso de caja (modal choice) |
| Incentivos | Sí — semanal 3.125€ bruto objetivo + mensual 10.125€ |

### Recepción Hotel

| Campo | Valor |
|---|---|
| Caja | ✅ `recepcion_cash` via `recepcion.js` (116 KB) |
| Merma | ❌ |
| Supervisor | `jefe_recepcion` |
| Checklist | ✅ Mañana + Tarde + Noche |
| Nav especial | Caja Recepción (con transferencias, room charges, cross-selling) |
| Incentivos | 10% ventas netas + pool colectivo 800€/mes (Booking ≥9.2) |

### SYNCROLAB (Recepción SYNCROLAB + Entrenadores + Fisioterapeutas)

| Campo | Valor |
|---|---|
| Caja | ✅ `syncrolab_cash_closures` via `syncrolab.js` (54 KB) |
| Room charges | `syncrolab_room_charges` |
| Merma | ❌ |
| Sistemas | Nubimed (Clínica) + VirtuGym (Fitness) — **no FlyBy** |
| Supervisores | `coord_recepcion_syncrolab` (Rec.SYNCROLAB + SyncroLab), `coord_entrenadores` (Entrenadores + SYNCROLAB), `coord_fisioterapeutas` (Fisio + Clínica + SYNCROLAB) |
| Checklist | `[NO DATA]` |
| Nav especial | Caja SYNCROLAB (cierre/traspaso, dual Nubimed+VirtuGym) |

**⚠ T11:** Entrenadores, Fisioterapeutas y Recepción SYNCROLAB comparten `area='SYNCROLAB'`. Toda detección debe usar `puesto`, no `area`. Helpers: `_esEntrenador()`, `_esFisio()`, `_deptCatalogo()`.

### Housekeeping

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `housekeeping.js` (115 KB) — **activo** |
| Supervisores | `gobernante`, `subgobernante` |
| Checklist | Por habitación (checklist_data en assignments) |
| Nav especial | Mi Ruta, Revisión HK, Dashboard HK, Planificación, Zonas públicas, Configuración HK |
| Tablas | `housekeeping_plans`, `housekeeping_assignments`, `housekeeping_rooms`, `housekeeping_public_areas`, `housekeeping_periodic_tasks` |
| Nav (C4) | GESTIÓN HK como dropdown separado |

### Mantenimiento

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `mantenimiento.js` (25 KB) |
| Supervisor | `jefe_mantenimiento` |
| Checklist | `[NO DATA]` |
| Nav especial | Kanban Tareas (C1: columnas Pendiente / Urgente hoy / Urgente mañana / Planificado / Hecho) |
| Nota | `maintenance_purchases` no está referenciada en código actual |

### Friegue

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | Declarable (mismo flujo Cocina; admin bypass) |
| Módulo JS | `shared.js` |
| Supervisor | Cubierto por `chef` y `fb` |
| Checklist | `[NO DATA]` |

### Administración

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `shared.js` |
| Nav | Sin incentivos, sin validación, sin fichaje. Turno manual (legacy fallback FEAT-TURNO-AUTO) |
| Nota | Angélica Camacho (`adjunto_directivo`) tiene área Administración pero acceso `['*']` |

### Economato / RRHH

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `shared.js` |
| Estado | Operativo básico |

### Fisioterapeutas / Marketing

| Campo | Valor |
|---|---|
| Estado | Portal card "Próximamente" — sin módulo activo |

---

## 3. Departamentos con responsable de turno

`DEPTS_CON_RESPONSABLE`: Sala, Cocina, Friegue, Housekeeping, Limpieza, HK.

Solo estos departamentos muestran el selector "Responsable de turno" en Mi Turno.

---

## 4. Reglas de separación

- Merma: solo Cocina y Friegue (en nav solo Cocina tiene pantalla dedicada)
- Caja: solo Sala, Recepción, SYNCROLAB — cada una su tabla
- Nunca leer tabla de caja de un depto desde otro
- Nunca mostrar checklist de un depto a empleado de otro
- Incidencias/gestiones filtradas por departamento en frontend
- `SYNCROLAB` es nombre definitivo — no usar variantes (SyncroLab solo como alias en BD)

---

## 5. Personal clave por departamento (jul 2026)

| Departamento | Responsable | Rol |
|---|---|---|
| Sala | José | `fb` |
| Cocina | Andrés | `chef` |
| Recepción Hotel | Juan Francisco Baena Espino | `jefe_recepcion` |
| Entrenadores | Sofía | `coord_entrenadores` |
| RRHH / Administración | Angélica Camacho | `adjunto_directivo` |
| Contabilidad | Carlos Marí Sendra | `contable` |
