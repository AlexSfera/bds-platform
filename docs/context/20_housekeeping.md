# 20 — Módulo Housekeeping (v2)

**Basado en:** v1 + decisiones Alexander 2026-05-20  
**Estado:** Especificación final — lista para implementación FASE 1  
**Stack:** SYNCRO HUB (index.html + Supabase + Vercel) ↔ n8n ↔ MEWS

---

## 0. Cambios respecto a v1

| Bloque | v1 | v2 |
|---|---|---|
| Roles Gobernanta/Subgob. | Solo planifican y validan | Planifican + limpian + auto-asignan + ejecutan ad-hoc |
| Validación | Gobernanta valida cada habitación | Gobernanta **NO valida** — cambia estado a "Revisado" |
| Zonas públicas | `frecuencia_dias` | Plantilla semanal por día (LUN/MAR/MIE...) + horario objetivo |
| Tareas administrativas | Mezcladas en HK | Van al módulo `tareas.js` — fuera de HK |
| MEWS | No definido | n8n como middleware bilateral. MEWS gana en reservas, SYNCRO HUB gana en limpieza |
| Empleado HK | Rol propio | Empleado con `departamento='Housekeeping'` |
| Rol chef | "chef" | Renombrar a "Jefe de departamento" (PR separada, transversal) |
| Habitaciones inactivas 3 días | No contemplado | Auto-asignación tipo "Control" desde n8n |

---

## 1. Objetivo

Módulo operativo donde Gobernanta y Subgobernanta gestionan configuración, planificación, ejecución, control y reporting de toda la limpieza del hotel (habitaciones + zonas públicas), con sincronización bilateral a MEWS vía n8n.

**Regla fundamental:**
> Si una habitación o zona fue limpiada, debe quedar registrado: qué se limpió, quién lo hizo, cuándo empezó, cuándo terminó, cuánto pausó, cuánto tardó realmente y quién la revisó.

---

## 2. Flujo principal

```
                    ┌─────────────────┐
                    │      MEWS       │ ← fuente verdad reservas
                    └────────┬────────┘
                             │ n8n (bilateral)
                             ▼
Configuración → Planificación → Ejecución → Revisión → Dashboard → MEWS update
                             ▲
                  ┌──────────┴───────────┐
                  │  Auto-asignación     │
                  │  Hab. >3 días sin    │
                  │  uso → tipo Control  │
                  └──────────────────────┘
```

---

## 3. ROLES Y PERMISOS (definitivo)

### 3.1 Roles del sistema

| Rol | Acceso | Limpia |
|---|---|---|
| **Admin** | Todo el sistema | Opcional |
| **Jefe de departamento — Housekeeping** (= Gobernanta) | Todo HK + ver otros depts. en lectura | ✅ Sí — auto-asignada + ad-hoc |
| **Subgobernanta** | Igual que Gobernanta cuando ésta no está | ✅ Sí — auto-asignada + ad-hoc |
| **Empleado HK** (limpiadora) | Solo su planificación propia | ✅ Sí — solo asignaciones recibidas |
| **Recepción / otros depts.** | Ver estado de habitaciones (lectura) | ❌ |

**Nota transversal:** El rol "chef" se renombra a **"Jefe de departamento"** en toda la plataforma. Cada Jefe de departamento ve solo SU departamento (Housekeeping, Cocina, Sala, Recepción, etc.). Esta migración va en PR separada porque afecta a `caja.js`, `dashboard.js`, `validacion.js`, `gestiones.js`, `incidencias.js`.

### 3.2 Matriz de permisos

| Acción | Admin | Gobernanta | Subgob. | Empleado HK |
|---|---|---|---|---|
| Ver planificación global | ✅ | ✅ | ✅ | ❌ |
| Ver planificación propia | ✅ | ✅ | ✅ | ✅ |
| Crear/editar planificación | ✅ | ✅ | ✅ | ❌ |
| **Auto-asignarse en planificación** | ✅ | ✅ | ✅ | ❌ |
| **Ejecutar zona pública ad-hoc (sin planificar)** | ✅ | ✅ | ✅ | ❌ |
| Configurar habitaciones | ✅ | ✅ | ✅ | ❌ |
| Configurar zonas públicas | ✅ | ✅ | ✅ | ❌ |
| Configurar plantilla semanal zonas | ✅ | ✅ | ✅ | ❌ |
| Asignar habitaciones/zonas a otros | ✅ | ✅ | ✅ | ❌ |
| Iniciar/pausar/finalizar limpieza | ✅ | ✅ | ✅ | Solo asignadas a sí mismo |
| **Cambiar estado a "Revisado"** | ✅ | ✅ | ✅ | ❌ |
| Reabrir asignación finalizada | ✅ | ✅ | ✅ | ❌ |
| Crear incidencia desde limpieza | ✅ | ✅ | ✅ | ✅ Solo de sus asignaciones |
| Crear FIO | ✅ | ✅ | ✅ | ❌ |
| Completar checklist | ✅ | ✅ | ✅ | Solo propio |
| Ver estadísticas globales HK | ✅ | ✅ | ✅ | ❌ |
| Ver estadísticas propias | ✅ | ✅ | ✅ | ✅ |
| Editar tiempo real manualmente | ✅ | ✅ | ❌ | ❌ |
| Forzar sync MEWS | ✅ | ✅ | ❌ | ❌ |
| Eliminar registro | ✅ | ❌ | ❌ | ❌ |

**Quién revisa el trabajo de la Gobernanta cuando ella limpia:**  
Se auto-marca como Revisado al finalizar (es la máxima autoridad HK). Queda log en `audit_log`. Excepción: el Admin puede reabrirlo.

---

## 4. BLOQUES FUNCIONALES

### Bloque 1 — Configuración

#### 4.1 Habitaciones (46 unidades)

**Origen:**
- **FASE 1:** carga manual desde Excel/CSV (pendiente Alexander)
- **FASE 2:** sincronización con MEWS (`resources/getAll`)

**Campos:**
```
id, mews_resource_id (FASE 2), numero, nombre, tipo, planta,
tiempo_repaso_min (default 20),
tiempo_checkout_min (default 45),
tiempo_control_min (default 10),
last_clean_ts, last_clean_type, last_clean_employee,
activa
```

**Tipos de limpieza:**
- `Repaso` — huésped sigue alojado (stayover)
- `Check-out` — huésped acaba de salir
- `Control` — habitación vacía >3 días, revisión preventiva

#### 4.2 Zonas públicas — modelo nuevo

**Tipos de tarea:**
- `Limpieza` (ej: GYM, PISCINA, VESTUARIOS)
- `Reposición` (ej: reponer secamanos, gel, papel higiénico)
- ❌ Las tareas **administrativas** (briefings, imprimir listados, despacho Alex) **NO van aquí** — van al módulo `tareas.js`

**Modelo: plantilla semanal**  
Cada zona define en qué días de la semana se limpia + opcionalmente horario objetivo:

```
nombre: "PISCINA"
dias_semana: ['LUN','MAR','MIE','JUE','VIE','SAB','DOM']
hora_objetivo: null
tiempo_estimado_min: 45
tipo_tarea: 'Limpieza'

nombre: "REPASO VESTUARIOS CLIENTES 12H"
dias_semana: ['LUN','MAR','MIE','JUE','VIE','SAB','DOM']
hora_objetivo: '12:00'
tiempo_estimado_min: 15
tipo_tarea: 'Limpieza'

nombre: "CLINICA - MÁQUINAS Y POLVO"
dias_semana: ['MAR','JUE','SAB']
hora_objetivo: null
tiempo_estimado_min: 30
tipo_tarea: 'Limpieza'
```

**Generación automática diaria:**  
Cada día a las 05:00 (cron / n8n), el sistema crea las asignaciones del día siguiente leyendo qué zonas tocan según `dias_semana`. La Gobernanta puede añadir/quitar zonas manualmente después.

**Semáforo de estado:**
- 🟢 Verde — limpiada en su día correspondiente
- 🟡 Amarillo — pendiente del día (no hecha aún, dentro de horario)
- 🔴 Rojo — pasado horario objetivo o día sin completar
- ⚫ Gris — zona inactiva

#### 4.3 Tiempos estándar (defaults — Alexander confirmará reales)

| Tipo | Tiempo | Notas |
|---|---|---|
| Repaso | 20 min | Stayover |
| Check-out | 45 min | Salida completa |
| Control | 10 min | Verificación >3 días |

---

### Bloque 2 — Planificación

- Planificación hasta **7 días por adelantado**
- Turnos: **Mañana · Tarde** (NUNCA usar "servicio")
- Asignación de empleados a turno → habitaciones + zonas
- Gobernanta y Subgobernanta pueden auto-asignarse como una limpiadora más
- Cálculo automático de carga estimada por persona (suma tiempos estándar)
- Alerta de sobrecarga si carga > tiempo disponible del turno
- Lista de habitaciones de MEWS (FASE 2): muestra estado real (Dirty/Clean/Inspected), reservas previstas y tipo deducido (Repaso/Check-out)

---

### Bloque 3 — Ejecución

#### 3.1 Regla de oro: solo una asignación activa por empleado

Si un empleado intenta iniciar una segunda asignación mientras tiene otra `en_proceso`:
- Sistema pregunta: "¿Pausar la anterior y empezar esta?"
- Si confirma → la anterior pasa automáticamente a `pausa_inicio = localTs()`

#### 3.2 Acciones por asignación

| Acción | Graba |
|---|---|
| Iniciar | `hora_inicio = localTs()`, `estado='en_proceso'` |
| Pausar | `pausa_inicio = localTs()` |
| Continuar | `pausa_fin = localTs()`, suma a `total_pausa_min` |
| Finalizar | `hora_fin = localTs()`, calcula `tiempo_real_min = (hora_fin - hora_inicio) - total_pausa_min` |

**Reglas:**
- No se puede finalizar sin haber iniciado
- No hay tiempos negativos — validar antes de guardar
- Pausa >15 min → alerta en panel Gobernanta (no penalización automática)
- Si empleado olvida finalizar al cerrar turno → queda `en_proceso`, pendiente para Gobernanta resuelva manualmente

#### 3.3 Ejecución ad-hoc de zona pública (Gobernanta/Subgob.)

Flujo alternativo sin pasar por planificación:
1. Gobernanta entra en "Zonas públicas"
2. Selecciona zona → botón "Limpiar ahora"
3. Crea automáticamente una `housekeeping_assignment` con `plan_id = NULL` y `ad_hoc = 1`
4. Inicia/finaliza normalmente
5. Queda registrado igual en estadísticas

---

### Bloque 4 — Revisión (NO validación)

> **CAMBIO CRÍTICO v2:** Gobernanta NO valida cada habitación. Cambia estado a "Revisado".

#### 4.1 Estados de asignación

```
pendiente → en_proceso → finalizado → revisado
                             ↓
                      requiere_correccion (reabierto)
```

#### 4.2 Acciones de Gobernanta/Subgobernanta

| Acción | Descripción |
|---|---|
| Cambiar a "Revisado" | Confirma que la limpieza es correcta |
| Reabrir asignación | Devuelve a `requiere_correccion` con motivo obligatorio |
| Editar tiempo real | Solo Gobernanta y Admin |
| Crear FIO desde asignación | Si hay fallo individual del empleado |
| Ver plan completo del día | Todas las asignaciones |

#### 4.3 Re-trabajo

Si una asignación se reabre y el empleado la finaliza de nuevo:
- El tiempo real **se acumula** al anterior (no se reinicia)
- Campo `re_trabajo_count` se incrementa
- KPI clave: % asignaciones con re-trabajo

---

### Bloque 5 — Sincronización MEWS (FASE 2 — vía n8n)

#### 5.1 Arquitectura

```
SYNCRO HUB ←──── n8n ────→ MEWS Connector API v1
            (middleware)
```

- n8n contiene credenciales MEWS (no exponer en frontend)
- n8n traduce conceptos SYNCRO HUB ↔ MEWS
- Webhooks MEWS (`ServiceOrderUpdated`, etc.) → n8n → Supabase
- Cambios en SYNCRO HUB → trigger Supabase → n8n → MEWS

#### 5.2 MEWS → SYNCRO HUB (lectura)

| Dato MEWS | Endpoint | Uso en SYNCRO HUB |
|---|---|---|
| Catálogo habitaciones | `resources/getAll` | Sincroniza `housekeeping_rooms` |
| Estado físico (Dirty/Clean/Inspected/OOS/OOO) | `resources/getAll` (State) | Estado actual |
| Ocupación día | `resources/getOccupancyState` | Vacant/Reserved/InternalUse |
| Reservas (in/out/stayover) | `reservations/getAll` | Deducir Repaso vs Check-out |
| Notas huésped (VIP, alergias) | `customers/getAll` | Mostrar en tarjeta habitación |
| Hora prevista check-in/out | `reservations.ScheduledStartUtc / EndUtc` | Priorización |
| Bloqueos OOO/OOS | `resourceBlocks/getAll` | No planificar |
| Nº huéspedes / companions | `reservations` + `customers` | Calcular toallas/amenities |

**Webhooks MEWS suscritos:**
- `ServiceOrderUpdated` — cambios de reserva
- Resource state changes
- New reservations

**Deducciones que hace n8n (no nativas MEWS):**
- `Repaso` ↔ reserva activa con `EndUtc > hoy`
- `Check-out` ↔ reserva con `EndUtc == hoy`
- `Control` ↔ habitación sin movimiento >3 días

#### 5.3 SYNCRO HUB → MEWS (escritura)

| Acción SYNCRO HUB | Endpoint MEWS | Cómo |
|---|---|---|
| Limpieza iniciada | `resources/update` | `State.Value = Dirty` + `StateReason = "En limpieza — {empleado} — {ts}"` |
| Limpieza finalizada | `resources/update` | `State.Value = Clean` + `StateReason = "Limpiada — {empleado} — {ts}"` |
| Cambio a Revisado | `resources/update` | `State.Value = Inspected` + `StateReason = "Revisado — {gobernanta} — {ts}"` |
| Bloqueo manual | `resourceBlocks/add` | Período + motivo |
| Incidencia HK | `tasks/add` | Departamento + descripción + URL foto |

**Limitaciones MEWS aceptadas:**
- Empleado que limpió → solo va en `StateReason` (texto libre)
- Hora real de finalización → solo en `StateReason`
- Fotos incidencias → URL en descripción de la tarea
- "En proceso" no existe en MEWS → mantener `Dirty` hasta finalizar

#### 5.4 Conflictos MEWS ↔ SYNCRO HUB

**Regla:** MEWS gana en reservas. SYNCRO HUB gana en estado de limpieza.

| Caso | Quién gana |
|---|---|
| MEWS dice "ocupada" / SYNCRO HUB no tiene plan | MEWS — actualizar |
| SYNCRO HUB dice "Limpia" / MEWS dice "Dirty" | SYNCRO HUB — push update a MEWS |
| MEWS bloquea habitación OOO | MEWS — quitar de planificación |
| Reserva creada en MEWS hace 5 min | MEWS — webhook actualiza tipo de limpieza |

#### 5.5 Auto-asignación tipo Control (>3 días sin uso)

**Implementación en n8n:**
- Cron diario a las 04:00
- Query MEWS: habitaciones con `OccupancyState = Vacant` Y `LastUpdated > 72h`
- Inserta en `housekeeping_assignments` con:
  - `tipo_limpieza = 'Control'`
  - `prioridad = 'alta'`
  - `auto_generada = 1`
  - `motivo = 'Habitación >3 días sin uso — control preventivo'`
- Gobernanta ve estas asignaciones al planificar el día siguiente

---

### Bloque 6 — Dashboard Housekeeping

#### 6.1 KPIs FASE 1

| KPI | Fuente | Cálculo |
|---|---|---|
| Habitaciones completadas hoy | `housekeeping_assignments` | COUNT WHERE estado IN ('finalizado','revisado') |
| Tiempo real medio por habitación | `housekeeping_assignments` | AVG(tiempo_real_min) por tipo_limpieza |
| Desviación estándar vs real | — | `tiempo_real_min - tiempo_estimado_min` |
| Cumplimiento (%) | — | (Finalizadas / Planificadas) × 100 |
| Zonas vencidas | `housekeeping_public_assignments` | Semáforo rojo |
| Incidencias HK | `incidencias WHERE departamento='Housekeeping'` | Contador y lista |
| Productividad por empleado | `housekeeping_assignments` | Tiempo real / habitaciones por empleado |
| Re-trabajo (%) | `housekeeping_assignments` | (con `re_trabajo_count > 0`) / total |
| Pausas > 15 min | `housekeeping_assignments` | Lista incidentes |

#### 6.2 KPIs FASE 2

- Coste por habitación (tiempo × salario/hora) → tabla `empleados.coste_hora`
- Cumplimiento SLA (% finalizadas en tiempo estándar)
- Export Excel/Power BI (no en FASE 1)

#### 6.3 Decisión: NO mostrar ranking competitivo de limpiadoras

Riesgo de uso punitivo. KPIs por empleado solo visibles a Gobernanta+ y a la propia empleada (su perfil). NO leaderboard público.

---

## 5. TIPOS DE INCIDENCIA HOUSEKEEPING (propuesta)

A insertar en `incidencia_tipos` cuando `departamento = 'Housekeeping'`:

| Código | Nombre | Destino |
|---|---|---|
| HK-01 | Daño en mobiliario (cama, mesa, sillas) | Mantenimiento |
| HK-02 | Daño en baño (grifo, ducha, sanitario) | Mantenimiento |
| HK-03 | Electrodoméstico no funciona (TV, A/C, secador) | Mantenimiento |
| HK-04 | Mancha grave en textil (sábana, toalla, alfombra) | Lavandería |
| HK-05 | Falta amenity / consumible | Stock / Compras |
| HK-06 | Objeto olvidado por huésped | Recepción |
| HK-07 | Cliente VIP — atención especial requerida | Recepción |
| HK-08 | Habitación en mal estado al check-in (cliente quejas) | FIO + Recepción |
| HK-09 | Olor anormal (humedad, tabaco, comida) | Mantenimiento |
| HK-10 | Insectos / plaga | Mantenimiento urgente |
| HK-11 | Llave/tarjeta no funciona | Recepción |
| HK-12 | Ropa de cama insuficiente / no coincide | Lavandería |
| HK-13 | Limpieza incorrecta detectada en revisión | FIO interna |
| HK-14 | Acceso restringido (huésped DND prolongado) | Recepción |
| HK-15 | Pérdida/rotura por parte de limpiadora | FIO + Mantenimiento |

Cada incidencia HK que vaya a Mantenimiento se replica a MEWS vía `tasks/add` (n8n).

---

## 6. TABLAS SUPABASE (esquema v2)

### `housekeeping_rooms` — Catálogo habitaciones

```sql
CREATE TABLE housekeeping_rooms (
  id                    TEXT PRIMARY KEY,
  mews_resource_id      TEXT UNIQUE,           -- NULL en FASE 1, poblado en FASE 2
  numero                TEXT NOT NULL,
  nombre                TEXT,
  tipo                  TEXT,
  planta                TEXT,
  tiempo_repaso_min     INTEGER DEFAULT 20,
  tiempo_checkout_min   INTEGER DEFAULT 45,
  tiempo_control_min    INTEGER DEFAULT 10,
  last_clean_ts         TEXT,                  -- hora local
  last_clean_type       TEXT,                  -- 'Repaso' | 'Check-out' | 'Control'
  last_clean_employee   TEXT,
  mews_state            TEXT,                  -- cache último estado MEWS
  mews_state_synced_at  TIMESTAMPTZ,
  activa                INTEGER DEFAULT 1,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### `housekeeping_public_areas` — Catálogo zonas

```sql
CREATE TABLE housekeeping_public_areas (
  id                    TEXT PRIMARY KEY,
  nombre                TEXT NOT NULL,
  descripcion           TEXT,
  tipo_tarea            TEXT NOT NULL,         -- 'Limpieza' | 'Reposición'
  dias_semana           TEXT NOT NULL,         -- JSON array: ["LUN","MIE","VIE"]
  hora_objetivo         TEXT,                  -- 'HH:MM' o NULL
  tiempo_estimado_min   INTEGER NOT NULL,
  ultima_limpieza_ts    TEXT,
  ultima_limpieza_emp   TEXT,
  activa                INTEGER DEFAULT 1,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### `housekeeping_plans` — Planificaciones diarias

```sql
CREATE TABLE housekeeping_plans (
  id              TEXT PRIMARY KEY,
  fecha           TEXT NOT NULL,                -- YYYY-MM-DD
  turno           TEXT NOT NULL,                -- 'Mañana' | 'Tarde'
  creado_por      TEXT,
  creado_nombre   TEXT,
  estado          TEXT DEFAULT 'activo',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `housekeeping_assignments` — Asignaciones

```sql
CREATE TABLE housekeeping_assignments (
  id                    TEXT PRIMARY KEY,
  plan_id               TEXT REFERENCES housekeeping_plans(id),  -- NULL si ad-hoc
  ad_hoc                INTEGER DEFAULT 0,
  auto_generada         INTEGER DEFAULT 0,     -- 1 si viene de cron n8n (Control)
  motivo_auto           TEXT,                  -- ej: 'Habitación >3 días sin uso'
  prioridad             TEXT DEFAULT 'normal', -- 'normal' | 'alta'
  employee_id           TEXT NOT NULL,
  employee_nombre       TEXT NOT NULL,
  tipo_objeto           TEXT NOT NULL,         -- 'habitacion' | 'zona_publica'
  objeto_id             TEXT NOT NULL,
  objeto_nombre         TEXT NOT NULL,
  tipo_limpieza         TEXT,                  -- 'Repaso' | 'Check-out' | 'Control' (solo hab.)
  tiempo_estimado_min   INTEGER,
  hora_inicio           TEXT,
  hora_fin              TEXT,
  pausa_inicio          TEXT,                  -- activa si pausada ahora
  total_pausa_min       INTEGER DEFAULT 0,
  tiempo_real_min       INTEGER,
  re_trabajo_count      INTEGER DEFAULT 0,
  estado                TEXT DEFAULT 'pendiente',
    -- 'pendiente' | 'en_proceso' | 'finalizado' | 'revisado' | 'requiere_correccion'
  revisado_por          TEXT,
  revisado_nombre       TEXT,
  revisado_ts           TEXT,
  motivo_reapertura     TEXT,
  checklist_data        TEXT,                  -- JSON
  incidencia_id         TEXT,                  -- FK a incidencias
  mews_sync_status      TEXT,                  -- 'pending' | 'synced' | 'failed' | NULL
  mews_sync_ts          TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### `housekeeping_mews_sync_log` — Auditoría sync (FASE 2)

```sql
CREATE TABLE housekeeping_mews_sync_log (
  id                TEXT PRIMARY KEY,
  direccion         TEXT NOT NULL,             -- 'mews_to_hub' | 'hub_to_mews'
  entidad           TEXT NOT NULL,             -- 'room' | 'reservation' | 'task'
  entidad_id        TEXT,
  mews_resource_id  TEXT,
  payload           TEXT,                      -- JSON
  resultado         TEXT,                      -- 'ok' | 'error'
  error_msg         TEXT,
  ts                TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. NAVEGACIÓN UI

**Empleado HK (limpiadora):**
```
[ Mi turno ] [ Mi ruta de hoy ] [ Gestiones pendientes ] [ Incidencias ] [ Tareas ]
```

**Gobernanta / Subgobernanta:**
```
[ Mi turno ] [ Mi ruta de hoy ] [ Planificación ] [ Zonas públicas ]
[ Configuración HK ] [ Gestiones ] [ Incidencias ] [ Tareas ] [ Dashboard HK ]
```

**Admin:** todo lo anterior + [ Sync MEWS ] [ Logs ]

---

## 8. FASES DE IMPLEMENTACIÓN

### FASE 1 — MVP (despliegue inmediato)

- [ ] Tablas Supabase (sin campos `mews_*`)
- [ ] Configuración habitaciones (carga manual Excel)
- [ ] Configuración zonas públicas + plantilla semanal
- [ ] Planificación diaria (hasta 7 días)
- [ ] Auto-asignación Gobernanta/Subgob.
- [ ] Ejecución (inicio/pausa/fin) + regla "una activa"
- [ ] Alerta pausa > 15 min
- [ ] Revisión (cambio de estado, no validación)
- [ ] Reapertura con motivo
- [ ] Ejecución ad-hoc zona pública
- [ ] Checklist único por habitación
- [ ] Dashboard KPIs básicos
- [ ] Tipos incidencia HK-01 a HK-15

### FASE 2 — MEWS + Avanzado

- [ ] Integración n8n ↔ MEWS bilateral
- [ ] Sync catálogo habitaciones (lectura)
- [ ] Sync estados de limpieza (escritura)
- [ ] Webhooks MEWS → n8n → Supabase
- [ ] Cron auto-asignación Control >3 días
- [ ] Cálculo de coste por habitación
- [ ] Export Excel / Power BI
- [ ] Cumplimiento SLA
- [ ] Replicación incidencias HK a MEWS Tasks

### Transversal (PR separada)

- [ ] Renombrado rol `chef` → `jefe_departamento`
- [ ] Restricción jefe_departamento a ver solo su departamento

---

## 9. RIESGOS A EVITAR

- ❌ Mezclar HK con servicio Sala/Cocina
- ❌ Usar "servicio" en lugar de "turno"
- ❌ Empleado lineal viendo configuración o creando FIO
- ❌ Empleado pudiendo cambiar a "Revisado"
- ❌ No descontar pausas del tiempo real
- ❌ Tiempos negativos
- ❌ Borrar habitaciones/zonas con histórico (solo desactivar)
- ❌ Ranking público de limpiadoras (uso punitivo)
- ❌ Mezclar tareas administrativas en HK (briefings, despachos)
- ❌ Exponer credenciales MEWS en frontend (van en n8n)
- ❌ Olvidar invalidateCache('housekeeping_*') tras escritura
- ❌ Hardcodear estados MEWS sin mapeo claro

---

## 10. DATOS PENDIENTES (FASE 1)

```
□ Lista real 46 habitaciones (Excel/CSV)         → Alexander
□ Tiempos estándar reales por tipo               → Alexander
□ Lista normalizada zonas públicas               → Extraer de Ruta_semanal__1_.xlsx
□ Confirmar dias_semana cada zona                → Alexander valida
□ Horarios objetivo zonas con hora fija (12:00)  → Alexander valida
□ Lista empleados HK actuales                    → SYNCRO HUB tabla empleados
□ Identificar usuario Gobernanta y Subgob.       → Alexander
□ Credenciales MEWS Connector API (FASE 2)       → Alexander
□ URL endpoint n8n (FASE 2)                      → Architect
```

---

## 11. QA — Criterios de aceptación

### FASE 1
```
□ Gobernanta accede a configuración HK
□ Gobernanta se auto-asigna en planificación
□ Gobernanta ejecuta zona pública ad-hoc sin plan
□ Subgobernanta tiene mismos permisos que Gobernanta
□ Empleado HK solo ve su planificación propia
□ Admin ve todo
□ Habitaciones se guardan y recargan
□ Plantilla semanal genera asignaciones automáticas
□ Semáforo zonas funciona: verde/amarillo/rojo/gris
□ Planificación hasta 7 días — no más
□ Solo una asignación activa por empleado
□ Pausa >15 min lanza alerta
□ Tiempo real descuenta pausas
□ No hay tiempos negativos
□ Olvido de finalizar deja asignación pendiente
□ Checklist persiste en BD
□ Gobernanta cambia estado a "Revisado" (no valida)
□ Reapertura exige motivo
□ Re-trabajo acumula tiempo (no reinicia)
□ Empleado lineal no cambia a Revisado, no crea FIO
□ Dashboard muestra KPIs reales
□ Sin arrays crudos, null, undefined, NaN
□ Responsive móvil
□ Timestamps en hora local del navegador (no UTC)
□ Tras escritura: invalidateCache('housekeeping_*')
```

### FASE 2 (MEWS)
```
□ n8n lee resources/getAll y popula housekeeping_rooms
□ Webhook ServiceOrderUpdated actualiza ocupación
□ Cambio estado SYNCRO HUB → MEWS resources/update
□ StateReason incluye empleado + timestamp
□ Conflicto MEWS-SYNCRO: aplica regla "MEWS reserva, HUB limpieza"
□ Habitación >3 días sin uso → asignación Control auto
□ Habitación OOO en MEWS no entra en planificación
□ Incidencia HK a Mantenimiento se replica a MEWS tasks/add
□ housekeeping_mews_sync_log registra todas las syncs
□ Errores de sync visibles a Admin
```

---

## 12. Próximos pasos inmediatos

1. Alexander confirma este documento
2. Alexander entrega lista 46 habitaciones (Excel)
3. Architect extrae zonas públicas de `Ruta_semanal__1_.xlsx` → propone normalización → Alexander valida
4. Crear tablas Supabase FASE 1
5. Crear `housekeeping.js` siguiendo patrón de `recepcion.js` y `validacion.js`
6. Integrar pestaña en `index.html`
7. Tests QA FASE 1
8. Despliegue Vercel
9. FASE 2 planificada con Architect (n8n + MEWS)
