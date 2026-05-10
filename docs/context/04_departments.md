# 04 — Departamentos

---

## 1. Configuración centralizada

```javascript
const DEPT_CONFIG = {
  'Cocina':         { emoji:'🍳', color:'#f59e0b', caja:false, merma:true,  modulo:'cocina.js'       },
  'Sala':           { emoji:'🍽', color:'#3b82f6', caja:true,  merma:false, modulo:'sala.js'          },
  'Recepción':      { emoji:'🏨', color:'#8b5cf6', caja:true,  merma:false, modulo:'recepcion.js'     },
  'SYNCROLAB':      { emoji:'🏋', color:'#06b6d4', caja:true,  merma:false, modulo:'syncrolab.js'     },
  'Housekeeping':   { emoji:'🛏', color:'#10b981', caja:false, merma:false, modulo:'housekeeping.js'  },
  'Mantenimiento':  { emoji:'🔧', color:'#ef4444', caja:false, merma:false, modulo:'shared.js'        },
  'Friegue':        { emoji:'🧽', color:'#f97316', caja:false, merma:false, modulo:'shared.js'        },
  'Economato':      { emoji:'📦', color:'#a855f7', caja:false, merma:false, modulo:'shared.js'        },
  'RRHH':           { emoji:'👥', color:'#64748b', caja:false, merma:false, modulo:'shared.js'        },
  'Administración': { emoji:'📋', color:'#6366f1', caja:false, merma:false, modulo:'shared.js'        },
};
```

---

## 2. Fichas por departamento

### Cocina

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ✅ |
| Módulo JS | `cocina.js` (pendiente crear) |
| KPIs turno | Cubiertos, merma €, ajustes operativos |
| Tipos incidencia | 14 tipos propios (ver `incidencia_tipos.js`) |
| Tipos gestión | 6 tipos propios |
| Checklist | Propio por turno (Apertura / Cierre) |
| Módulos específicos | Merma integrada en Mi Turno |
| Navegación extra | Ninguna |

### Sala

| Campo | Valor |
|---|---|
| Caja | ✅ (`sala_cash_closures`) |
| Merma | ❌ |
| Módulo JS | `sala.js` |
| KPIs turno | Cubiertos, propinas efectivo, propinas TPV |
| Tipos incidencia | 12 tipos propios |
| Tipos gestión | 5 tipos propios |
| Checklist | Propio por turno |
| Módulos específicos | Cierre de caja Sala |
| Navegación extra | `Cierre de caja` (derecha topbar) |

### Recepción Hotel

| Campo | Valor |
|---|---|
| Caja | ✅ (`recepcion_cash`) |
| Merma | ❌ |
| Módulo JS | `recepcion.js` |
| KPIs turno | Check-ins, check-outs, pensiones, room charge, cargo Alexander |
| Tipos incidencia | 12 tipos propios |
| Tipos gestión | 10 tipos propios |
| Checklist | Propio por turno (Mañana / Tarde / Noche) |
| Módulos específicos | Caja Recepción (con transferencias) |
| Navegación extra | `Caja Recepción` (derecha topbar) |

### SYNCROLAB

| Campo | Valor |
|---|---|
| Caja | ✅ (`syncrolab_cash` — pendiente crear) |
| Merma | ❌ |
| Módulo JS | `syncrolab.js` (pendiente crear) |
| KPIs turno | Sesiones, cobros, leads, ocupación |
| Tipos incidencia | 16 tipos propios |
| Tipos gestión | 7 tipos propios |
| Checklist | `[NO DATA]` |
| Módulos específicos | Caja SYNCROLAB |
| Navegación extra | `Caja SYNCROLAB` (derecha topbar) |

### Housekeeping

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `housekeeping.js` (pendiente crear) |
| KPIs turno | Habitaciones completadas, tiempo real vs estimado |
| Tipos incidencia | 14 tipos propios |
| Tipos gestión | 5 tipos propios |
| Checklist | Checklist final de limpieza por habitación |
| Módulos específicos | Mi ruta para hoy · Planificación de rutas (Gobernanta) |
| Navegación extra | `Mi ruta para hoy` · `Planificación de rutas` (Gobernanta) |
| Tablas específicas | `housekeeping_plans` · `housekeeping_assignments` · `housekeeping_rooms` · `housekeeping_public_areas` |

Ver `20_housekeeping.md` para especificación completa.

### Mantenimiento

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `shared.js` |
| KPIs turno | `[NO DATA]` |
| Tipos incidencia | 16 tipos propios |
| Tipos gestión | 6 tipos propios |
| Checklist | `[NO DATA]` |
| Módulos específicos | Compras necesarias |
| Navegación extra | `Compras necesarias` (izquierda topbar) |
| Tablas específicas | `maintenance_purchases` |

### Friegue

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `shared.js` |
| Tipos incidencia | 7 tipos propios |
| Tipos gestión | 4 tipos propios |
| Checklist | `[NO DATA]` |

### Economato / RRHH / Administración

| Campo | Valor |
|---|---|
| Caja | ❌ |
| Merma | ❌ |
| Módulo JS | `shared.js` |
| Tipos incidencia | Ver `incidencia_tipos.js` |
| Tipos gestión | Ver `incidencia_tipos.js` |
| Checklist | `[NO DATA]` |

---

## 3. Reglas de separación entre departamentos

- Nunca mostrar merma fuera de Cocina
- Nunca mostrar botón Caja en departamentos sin caja
- Nunca leer tabla de caja de un departamento desde otro
- Nunca mostrar incidencias de un departamento en el dashboard de otro (sin filtro correcto)
- Nunca mostrar el checklist de Cocina a un empleado de Recepción
- El nombre `SYNCROLAB` es el definitivo — no usar variantes
