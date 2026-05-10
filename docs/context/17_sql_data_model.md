# 17 — Modelo de Datos SQL

---

## 1. Principios de diseño

1. **Tablas comunes** para entidades que comparten estructura entre todos los departamentos
2. **Tablas específicas** para entidades con estructura diferente por departamento (cajas)
3. **Discriminador `departamento`** para filtrar en tablas comunes cuando los datos coexisten
4. **Nunca mezclar** datos de caja de Sala con Recepción — tablas separadas obligatorias
5. **Auditoría** en toda operación destructiva (DELETE, cambio de estado crítico)
6. **Timestamps** siempre en hora local España — columna `created_at TIMESTAMPTZ`

---

## 2. Tablas comunes

### `employees`
```sql
CREATE TABLE employees (
  id              TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,
  puesto          TEXT,
  area            TEXT NOT NULL,        -- departamento
  rol             TEXT NOT NULL,        -- admin · fb · chef · empleado · etc
  pin             TEXT,                 -- hash del PIN de acceso
  estado          TEXT DEFAULT 'Activo', -- Activo · Inactivo
  responsable     INTEGER DEFAULT 0,   -- 1 = es supervisor
  validador       INTEGER DEFAULT 0,   -- 1 = puede validar
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `shifts`
```sql
CREATE TABLE shifts (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(id),
  nombre          TEXT NOT NULL,
  departamento    TEXT NOT NULL,
  area            TEXT,
  fecha           TEXT NOT NULL,        -- YYYY-MM-DD
  turno           TEXT NOT NULL,        -- Mañana · Tarde · Noche
  servicio        TEXT,                 -- alias de turno
  horas           NUMERIC,
  observaciones   TEXT,
  checklist_data  TEXT,                 -- JSON del checklist completado
  estado          TEXT DEFAULT 'pendiente',  -- pendiente · validado · requiere_correccion
  validado_por    TEXT,
  validado_ts     TEXT,
  fio_id          TEXT,                 -- referencia al FIO si existe
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ
);
```

### `incidencias`
```sql
CREATE TABLE incidencias (
  id                      TEXT PRIMARY KEY,
  shift_id                TEXT REFERENCES shifts(id),
  employee_id             TEXT NOT NULL,
  nombre                  TEXT NOT NULL,
  departamento            TEXT NOT NULL,
  area                    TEXT,
  fecha                   TEXT NOT NULL,
  servicio                TEXT,
  categoria               TEXT DEFAULT 'Incidencia operativa',
  tipo_incidencia         TEXT NOT NULL,
  descripcion             TEXT NOT NULL,
  accion_inmediata        TEXT,
  accion_tomada           TEXT,
  severidad               TEXT DEFAULT 'Media',
    -- CHECK: 'Baja' · 'Media' · 'Alta' · 'Crítica'
  requiere_formacion      TEXT DEFAULT 'no',
    -- CHECK: 'no' · 'si'
  requiere_disciplina     TEXT DEFAULT 'no',
    -- CHECK: 'no' · 'si'
  informado_responsable   TEXT DEFAULT 'no',
    -- CHECK: 'no' · 'si'
  staff_implicado_ids     TEXT DEFAULT '[]',
  staff_implicado_nombres TEXT DEFAULT '[]',
  estado                  TEXT DEFAULT 'Abierta',
    -- CHECK: 'Abierta' · 'En proceso' · 'Cerrada'
  cerrado_por             TEXT,
  cerrado_ts              TEXT,
  tiempo_gestion          INTEGER,      -- minutos apertura → cierre
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidencias_departamento ON incidencias(departamento);
CREATE INDEX idx_incidencias_fecha        ON incidencias(fecha);
CREATE INDEX idx_incidencias_estado       ON incidencias(estado);
CREATE INDEX idx_incidencias_shift_id     ON incidencias(shift_id);
```

### `gestiones`
```sql
CREATE TABLE gestiones (
  id                    TEXT PRIMARY KEY,
  shift_id              TEXT REFERENCES shifts(id),
  employee_id           TEXT NOT NULL,
  nombre                TEXT NOT NULL,
  departamento          TEXT NOT NULL,
  area                  TEXT,
  fecha                 TEXT NOT NULL,
  servicio              TEXT,
  tipo_gestion          TEXT NOT NULL,
  descripcion           TEXT NOT NULL,
  accion_tomada         TEXT,
  estado                TEXT DEFAULT 'Abierta',
    -- CHECK: 'Abierta' · 'En proceso' · 'Cerrada'
  cerrado_por           TEXT,
  cerrado_ts            TEXT,
  tiempo_gestion        INTEGER,
  informado_responsable TEXT DEFAULT 'no',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gestiones_departamento ON gestiones(departamento);
CREATE INDEX idx_gestiones_fecha        ON gestiones(fecha);
CREATE INDEX idx_gestiones_estado       ON gestiones(estado);
```

### `tareas`
```sql
CREATE TABLE tareas (
  id                  TEXT PRIMARY KEY,
  shift_id            TEXT,
  titulo              TEXT NOT NULL,
  descripcion         TEXT NOT NULL,
  dept_origen         TEXT NOT NULL,
  dept_destino        TEXT NOT NULL,
  usuario_id          TEXT NOT NULL,
  usuario_nombre      TEXT NOT NULL,
  responsable_id      TEXT,
  responsable_nombre  TEXT,
  prioridad           TEXT DEFAULT 'Media',
    -- CHECK: 'Baja' · 'Media' · 'Alta' · 'Urgente'
  estado              TEXT DEFAULT 'Pendiente',
    -- CHECK: 'Pendiente' · 'En proceso' · 'Bloqueada' · 'Completada' · 'Vencida' · 'Cancelada'
  deadline            TEXT,             -- YYYY-MM-DD
  comentarios         TEXT,
  cerrado_por         TEXT,
  cerrado_ts          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tareas_dept_destino ON tareas(dept_destino);
CREATE INDEX idx_tareas_estado       ON tareas(estado);
CREATE INDEX idx_tareas_deadline     ON tareas(deadline);
```

### `fio` (Fallos Individuales Operativos)
```sql
CREATE TABLE fio (
  id                  TEXT PRIMARY KEY,
  shift_id            TEXT REFERENCES shifts(id),
  departamento        TEXT NOT NULL,
  fecha               TEXT NOT NULL,
  empleado_id         TEXT,
  empleado_nombre     TEXT,
  evaluador_id        TEXT,
  evaluador_nombre    TEXT,
  concepto_fio        TEXT,
  severidad_fio       TEXT,
  impacto_bonus       TEXT,
  descripcion         TEXT,
  comentario          TEXT,
  estado              TEXT DEFAULT 'Abierto',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fio_departamento ON fio(departamento);
CREATE INDEX idx_fio_fecha        ON fio(fecha);
```

### `audit_log`
```sql
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  accion      TEXT NOT NULL,           -- nombre de la acción
  descripcion TEXT NOT NULL,           -- detalle legible
  usuario_id  TEXT,
  usuario_nombre TEXT,
  tabla       TEXT,                    -- tabla afectada
  registro_id TEXT,                    -- ID del registro afectado
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Tablas específicas de caja

### `sala_cash_closures` — Caja Sala
```sql
CREATE TABLE sala_cash_closures (
  id                    TEXT PRIMARY KEY,
  shift_id              TEXT,
  fecha                 TEXT NOT NULL,
  turno                 TEXT NOT NULL,
  usuario_id            TEXT,
  usuario_nombre        TEXT,
  responsable_id        TEXT,
  responsable_nombre    TEXT,
  estado                TEXT DEFAULT 'cerrado',

  -- Ingresos según POSMEWS
  efectivo_posmews      NUMERIC DEFAULT 0,
  tarjeta_posmews       NUMERIC DEFAULT 0,
  stripe_posmews        NUMERIC DEFAULT 0,
  invitaciones          NUMERIC DEFAULT 0,
  propinas_efectivo     NUMERIC DEFAULT 0,
  propinas_tpv          NUMERIC DEFAULT 0,

  -- Ingresos reales contados
  efectivo_real         NUMERIC DEFAULT 0,
  tarjeta_real          NUMERIC DEFAULT 0,
  stripe_real           NUMERIC DEFAULT 0,

  -- Diferencias
  dif_efectivo          NUMERIC DEFAULT 0,
  dif_tarjeta           NUMERIC DEFAULT 0,
  dif_stripe            NUMERIC DEFAULT 0,
  dif_total             NUMERIC DEFAULT 0,

  -- Pensiones (excl. desayunos)
  pensiones_personas    INTEGER DEFAULT 0,

  -- Explicación diferencias
  explicacion_diferencia TEXT,
  accion_diferencia      TEXT,

  -- Auditoría
  validado_por          TEXT,
  validado_ts           TEXT,
  reabierto_por         TEXT,
  comentario            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ
);
```

### `recepcion_cash` — Caja Recepción Hotel
```sql
CREATE TABLE recepcion_cash (
  id                          TEXT PRIMARY KEY,
  shift_id                    TEXT,
  fecha                       TEXT NOT NULL,
  turno                       TEXT NOT NULL,
  usuario_id                  TEXT,
  usuario_nombre              TEXT,
  responsable_id              TEXT,
  responsable_nombre          TEXT,
  estado                      TEXT DEFAULT 'cerrado',

  -- Traspaso de fondo
  fondo_recibido              NUMERIC DEFAULT 0,   -- readonly, del cierre anterior
  fondo_real_a_traspasar      NUMERIC DEFAULT 0,   -- calculado: fondo_recibido + cash_mews - retiro_caja_fuerte
  retiro_caja_fuerte          NUMERIC DEFAULT 0,
  fondo_inicial_siguiente     NUMERIC,              -- solo turno Noche

  -- Según MEWS
  cash_mews                   NUMERIC DEFAULT 0,
  tarjeta_mews                NUMERIC DEFAULT 0,
  stripe_mews                 NUMERIC DEFAULT 0,
  transferencia_mews          NUMERIC DEFAULT 0,

  -- Real contado
  cash_real                   NUMERIC DEFAULT 0,
  tpv_real                    NUMERIC DEFAULT 0,
  stripe_real                 NUMERIC DEFAULT 0,
  transferencia_banco         NUMERIC DEFAULT 0,

  -- Diferencias
  dif_cash                    NUMERIC DEFAULT 0,
  dif_tarjeta                 NUMERIC DEFAULT 0,
  dif_stripe                  NUMERIC DEFAULT 0,
  dif_transferencia           NUMERIC DEFAULT 0,
  dif_total                   NUMERIC DEFAULT 0,
  dif_fondo_traspaso          NUMERIC DEFAULT 0,

  -- Cargos adicionales
  room_charge_recibido        NUMERIC DEFAULT 0,
  syncrolab_room_charged      NUMERIC DEFAULT 0,
  desayunos_confirmados_mews  NUMERIC DEFAULT 0,
  pensiones_personas          INTEGER DEFAULT 0,   -- media pensión + pensión completa (excl. desayunos)
  cargo_alexander             NUMERIC DEFAULT 0,

  -- Transferencias — control de revisión
  transferencia_banco_updated_at TIMESTAMPTZ,      -- fecha última revisión transferencias bancarias

  -- Explicación diferencias
  explicacion_diferencia      TEXT,
  accion_diferencia           TEXT,

  -- Auditoría
  informado_responsable       TEXT DEFAULT 'false',
  validado_por                TEXT,
  validado_ts                 TIMESTAMPTZ,
  reabierto_por               TEXT,
  comentario                  TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ
);

CREATE INDEX idx_recepcion_cash_fecha  ON recepcion_cash(fecha);
CREATE INDEX idx_recepcion_cash_turno  ON recepcion_cash(turno);
```

### `syncrolab_cash` — Caja SYNCROLAB (pendiente crear)
```sql
-- [NO DATA] — estructura pendiente de definir
-- Crear cuando se implemente el módulo SYNCROLAB
CREATE TABLE syncrolab_cash (
  id              TEXT PRIMARY KEY,
  shift_id        TEXT,
  fecha           TEXT NOT NULL,
  turno           TEXT NOT NULL,
  -- ... campos específicos SYNCROLAB
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `merma` — Cocina exclusivamente
```sql
CREATE TABLE merma (
  id              TEXT PRIMARY KEY,
  shift_id        TEXT REFERENCES shifts(id),
  employee_id     TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  departamento    TEXT DEFAULT 'Cocina',  -- siempre Cocina
  fecha           TEXT NOT NULL,
  producto        TEXT NOT NULL,
  cantidad        NUMERIC NOT NULL,
  unidad          TEXT,
  motivo          TEXT,
  coste_estimado  NUMERIC,
  validado        INTEGER DEFAULT 0,
  precio_unitario NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Tablas de catálogos (Maestro)

```sql
-- Tipos de incidencia por departamento (alternativa a incidencia_tipos.js)
CREATE TABLE department_incident_types (
  id              TEXT PRIMARY KEY,
  departamento    TEXT NOT NULL,
  tipo            TEXT NOT NULL,
  activo          INTEGER DEFAULT 1,
  orden           INTEGER DEFAULT 0
);

-- Tipos de gestión por departamento
CREATE TABLE department_management_types (
  id              TEXT PRIMARY KEY,
  departamento    TEXT NOT NULL,
  tipo            TEXT NOT NULL,
  activo          INTEGER DEFAULT 1,
  orden           INTEGER DEFAULT 0
);

-- Plantillas de checklist por departamento y turno
CREATE TABLE checklist_templates (
  id              TEXT PRIMARY KEY,
  departamento    TEXT NOT NULL,
  turno           TEXT,                 -- Mañana · Tarde · Noche · null = todos
  item            TEXT NOT NULL,
  orden           INTEGER DEFAULT 0,
  activo          INTEGER DEFAULT 1
);
```

---

## 5. RLS Policies — Supabase

Todas las tablas tienen RLS habilitado con política permisiva para el MVP:

```sql
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON public.incidencias
  FOR ALL USING (true) WITH CHECK (true);
```

**Nota:** La autorización real se gestiona en frontend comparando `currentUser.rol` y `currentUser.area`. En producción madura se deben migrar a RLS policies basadas en JWT claims.

---

## 6. Fórmulas de cálculo — Caja Recepción

```sql
-- Diferencia Cash (único que descuenta el fondo)
dif_cash = cash_mews - (cash_real - fondo_recibido)

-- Resto de diferencias
dif_tarjeta     = tarjeta_mews - tpv_real
dif_stripe      = stripe_mews - stripe_real
dif_transferencia = transferencia_mews - transferencia_banco

-- Total diferencia operativa (sin transferencias — informativo)
dif_total = dif_cash + dif_tarjeta + dif_stripe

-- Fondo a traspasar
fondo_real_a_traspasar = fondo_recibido + cash_mews - retiro_caja_fuerte
```
