# 20 — Módulo Housekeeping

**Basado en:** `10_MODULE_HOUSEKEEPING_SYNCROSFERA_FULL_PRO.md`  
**Estado:** Especificación completa — pendiente de implementación  

---

## 1. Objetivo

Crear un módulo operativo completo para que Gobernanta y Subgobernanta gestionen la configuración, planificación, ejecución, control, validación y reporting de todo el trabajo de limpieza del hotel.

**Regla fundamental:**
> Si una habitación o zona fue limpiada, debe quedar registrado: qué se limpió, quién lo hizo, cuándo empezó, cuándo terminó, cuánto pausó, cuánto tardó realmente y quién lo validó.

---

## 2. Flujo principal

```
Configuración → Planificación → Ejecución → Validación → Dashboard
```

---

## 3. Bloques funcionales

### Bloque 1 — Configuración

**Habitaciones:**
- 46 habitaciones (lista pendiente de carga por Alexander)
- Campos por habitación: número, nombre, tipo, planta, tiempo_repaso_min, tiempo_checkout_min, tiempo_control_min, activa
- Tipos de limpieza: `Repaso` · `Check-out` · `Control`
- Importación desde Excel/CSV: `[NO DATA]` formato pendiente

**Zonas públicas:**
- Lista pendiente de carga por Alexander
- Campos: nombre, descripción, frecuencia_dias, tiempo_estimado_min, activa
- Semáforo de estado según última limpieza vs frecuencia:
  - 🟢 Verde — no toca todavía
  - 🟡 Amarillo — próxima limpieza pronto
  - 🔴 Rojo — limpieza obligatoria o vencida
  - ⚫ Gris — zona inactiva

**Tiempos estándar:**
- Repaso: `[NO DATA]`
- Check-out: `[NO DATA]`
- Control: `[NO DATA]`
- Definidos por Gobernanta desde configuración

### Bloque 2 — Planificación

- Planificación hasta 7 días por adelantado (no más)
- Turnos: Mañana · Tarde (no usar "servicio")
- Asignar empleados a cada turno
- Asignar habitaciones a empleados con tipo de limpieza
- Asignar zonas públicas a empleados
- Cálculo automático de carga estimada por empleado (suma de tiempos estándar)
- Alerta de sobrecarga si la carga supera el tiempo disponible del turno
- La planificación se puede crear para hoy o para fechas futuras

### Bloque 3 — Ejecución

El empleado desde "Mi ruta para hoy" ve sus asignaciones del día.

Para cada habitación o zona asignada puede:

| Acción | Graba en BD |
|---|---|
| Iniciar limpieza | `hora_inicio = localTs()` |
| Pausar | `pausa_inicio = localTs()` |
| Continuar | `pausa_fin = localTs()`, acumula `total_pausa_min` |
| Finalizar | `hora_fin = localTs()`, calcula `tiempo_real_min = (hora_fin - hora_inicio) - total_pausa_min` |

**Reglas:**
- No se puede finalizar sin haber iniciado
- No hay tiempos negativos — validar antes de guardar
- Las pausas se descuentan del tiempo real
- El tiempo real es la fuente de verdad para KPIs

### Bloque 4 — Validación

Gobernanta (y Subgobernanta si tiene permiso) puede:

| Acción | Descripción |
|---|---|
| Validar asignación | Marcar habitación o zona como validada |
| Reabrir asignación | Devolver para corrección |
| Crear FIO | Si detecta fallo individual del empleado |
| Ver plan completo | Todas las asignaciones del día |
| Editar tiempo real | Solo Gobernanta y Admin |

El empleado lineal no puede validar ni crear FIO.

### Bloque 5 — Dashboard Housekeeping

| KPI | Fuente | Cálculo |
|---|---|---|
| Habitaciones completadas | `housekeeping_assignments` | COUNT WHERE estado='finalizado' |
| Tiempo real medio por habitación | `housekeeping_assignments` | AVG(tiempo_real_min) |
| Desviación estándar vs real | — | `tiempo_real_min - tiempo_estimado_min` |
| Cumplimiento (%) | — | Completadas / Planificadas × 100 |
| Zonas vencidas | `housekeeping_public_areas` | Semáforo rojo |
| Incidencias Housekeeping | `incidencias` WHERE departamento='Housekeeping' | — |
| Productividad por empleado | `housekeeping_assignments` | Tiempo real / habitaciones por empleado |

---

## 4. Roles y permisos

| Acción | Admin | Gobernanta | Subgobernanta | Empleado HK |
|---|---|---|---|---|
| Ver planificación global | ✅ | ✅ | ✅ | ❌ |
| Ver planificación propia | ✅ | ✅ | ✅ | ✅ |
| Crear/editar planificación | ✅ | ✅ | ✅ | ❌ |
| Configurar habitaciones | ✅ | ✅ | Limitado | ❌ |
| Configurar zonas públicas | ✅ | ✅ | Limitado | ❌ |
| Asignar habitaciones/zonas | ✅ | ✅ | ✅ | ❌ |
| Iniciar / pausar / finalizar limpieza | ✅ | ✅ | ✅ | Solo asignadas |
| Crear incidencia | ✅ | ✅ | ✅ | Desde sus asignaciones |
| Completar checklist | ✅ | ✅ | ✅ | Solo propio |
| Validar limpieza | ✅ | ✅ | Limitado | ❌ |
| Crear FIO | ✅ | ✅ | Si es validador | ❌ |
| Ver estadísticas globales | ✅ | ✅ | Limitado | ❌ |
| Ver estadísticas propias | ✅ | ✅ | ✅ | ✅ |
| Editar tiempo real manualmente | ✅ | ✅ | ❌ | ❌ |
| Eliminar registro | ✅ | Con permiso | ❌ | ❌ |

---

## 5. Tablas Supabase

### `housekeeping_rooms` — Catálogo de habitaciones

```sql
CREATE TABLE housekeeping_rooms (
  id                    TEXT PRIMARY KEY,
  numero                TEXT NOT NULL,
  nombre                TEXT,
  tipo                  TEXT,
  planta                TEXT,
  tiempo_repaso_min     INTEGER DEFAULT 20,
  tiempo_checkout_min   INTEGER DEFAULT 45,
  tiempo_control_min    INTEGER DEFAULT 10,
  activa                INTEGER DEFAULT 1,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### `housekeeping_public_areas` — Catálogo de zonas públicas

```sql
CREATE TABLE housekeeping_public_areas (
  id                    TEXT PRIMARY KEY,
  nombre                TEXT NOT NULL,
  descripcion           TEXT,
  frecuencia_dias       INTEGER NOT NULL,
  tiempo_estimado_min   INTEGER,
  ultima_limpieza_ts    TIMESTAMPTZ,
  proxima_limpieza_ts   TIMESTAMPTZ,  -- calculado: ultima_limpieza_ts + frecuencia_dias
  activa                INTEGER DEFAULT 1,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### `housekeeping_plans` — Planificaciones diarias

```sql
CREATE TABLE housekeeping_plans (
  id              TEXT PRIMARY KEY,
  fecha           TEXT NOT NULL,       -- YYYY-MM-DD
  turno           TEXT NOT NULL,       -- 'Mañana' · 'Tarde'
  creado_por      TEXT,
  creado_nombre   TEXT,
  estado          TEXT DEFAULT 'activo',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `housekeeping_assignments` — Asignaciones por plan

```sql
CREATE TABLE housekeeping_assignments (
  id                    TEXT PRIMARY KEY,
  plan_id               TEXT NOT NULL REFERENCES housekeeping_plans(id),
  employee_id           TEXT NOT NULL,
  employee_nombre       TEXT NOT NULL,
  tipo_objeto           TEXT NOT NULL,   -- 'habitacion' · 'zona_publica'
  objeto_id             TEXT NOT NULL,   -- ID de room o public_area
  objeto_nombre         TEXT NOT NULL,
  tipo_limpieza         TEXT,            -- 'Repaso' · 'Check-out' · 'Control' (solo habitaciones)
  tiempo_estimado_min   INTEGER,
  hora_inicio           TEXT,
  hora_fin              TEXT,
  total_pausa_min       INTEGER DEFAULT 0,
  tiempo_real_min       INTEGER,
  estado                TEXT DEFAULT 'pendiente',
    -- pendiente · en_proceso · finalizado · validado · requiere_correccion
  validado_por          TEXT,
  validado_ts           TEXT,
  checklist_data        TEXT,            -- JSON del checklist final
  incidencia_id         TEXT,            -- referencia si se creó incidencia
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Navegación

**Empleado Housekeeping:**
```
[ Mi turno ] [ Mi ruta para hoy ] [ Gestiones pendientes ] [ Incidencias ] [ Tareas ]
```

**Gobernanta / Subgobernanta:**
```
[ Mi turno ] [ Mi ruta para hoy ] [ Planificación de rutas ] [ Gestiones pendientes ] [ Incidencias ] [ Tareas ]
```

---

## 7. Riesgos a evitar

- No mezclar Housekeeping con lógica de servicio de Sala/Cocina
- No usar "servicio" en lugar de "turno"
- No permitir que empleado lineal vea configuración ni valide
- No permitir que empleado lineal cree FIO
- No olvidar descontar pausas del tiempo real
- No borrar habitaciones o zonas con histórico — solo desactivar
- No mostrar estadísticas como castigo automático al empleado
- No dejar zonas públicas sin actualizar su `ultima_limpieza_ts`

---

## 8. Datos pendientes de confirmar

```
Lista real de 46 habitaciones:                [NO DATA] — pendiente Alexander
Lista real de zonas públicas:                 [NO DATA] — pendiente Alexander
Frecuencia exacta de limpieza por zona:       [NO DATA] — pendiente Alexander
Tiempos estándar reales por tipo habitación:  [NO DATA] — pendiente Alexander
Roles exactos Gobernanta/Subgobernanta:       [NO DATA]
Límite de deadline para planificación:        7 días confirmado
```

---

## 9. QA — criterios de aceptación (resumen)

Ver checklist completo en documento original `10_MODULE_HOUSEKEEPING_SYNCROSFERA_FULL_PRO.md`.

```
□ Gobernanta puede acceder al módulo
□ Empleado lineal solo ve su planificación propia
□ Admin ve todo
□ Habitaciones se guardan y recargan correctamente
□ Semáforo de zonas públicas funciona: verde/amarillo/rojo/gris
□ Planificación hasta 7 días — no más
□ Cálculo de tiempo real descuenta pausas
□ No hay tiempos negativos
□ Checklist final persiste en BD
□ Gobernanta puede validar y reabrir
□ Empleado lineal no valida ni crea FIO
□ Dashboard muestra KPIs reales
□ No aparecen arrays crudos, null, undefined, NaN
□ Responsive funciona en móvil
```
