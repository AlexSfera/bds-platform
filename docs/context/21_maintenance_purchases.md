# 21 — Compras Necesarias (Mantenimiento)

---

## 1. Definición

Las compras necesarias son solicitudes internas de compra de materiales, herramientas o productos que el departamento de Mantenimiento necesita para ejecutar su trabajo. No son tareas, ni incidencias, ni gestiones pendientes — son registros propios con estado y trazabilidad independiente.

> Una tarea puede generar una compra necesaria, pero deben ser registros separados con su propio estado y ciclo de vida.

---

## 2. Visibilidad

- Módulo visible solo para **Mantenimiento** y **Admin**
- El botón `Compras necesarias` aparece en topbar solo si `currentUser.area === 'Mantenimiento'` o `isAdminUser`
- No mezclar con tareas interdepartamentales generales

---

## 3. Tabla Supabase: `maintenance_purchases`

```sql
CREATE TABLE maintenance_purchases (
  id              TEXT PRIMARY KEY,
  shift_id        TEXT,                 -- turno donde se registró (opcional)
  tarea_id        TEXT,                 -- referencia si deriva de una tarea (opcional)
  employee_id     TEXT NOT NULL,
  nombre          TEXT NOT NULL,
  departamento    TEXT DEFAULT 'Mantenimiento',
  articulo        TEXT NOT NULL,        -- qué hay que comprar
  descripcion     TEXT,                 -- detalle adicional
  cantidad        NUMERIC,
  unidad          TEXT,                 -- ud · kg · l · m · etc
  prioridad       TEXT DEFAULT 'Media', -- 'Baja' · 'Media' · 'Alta' · 'Urgente'
  estado          TEXT DEFAULT 'Pendiente',
    -- 'Pendiente' · 'En proceso' · 'Pedido' · 'Recibido' · 'Cancelado'
  responsable_id  TEXT,
  responsable_nombre TEXT,
  coste_estimado  NUMERIC,
  proveedor       TEXT,
  comentario      TEXT,
  fecha_solicitud TEXT NOT NULL,        -- YYYY-MM-DD
  fecha_necesidad TEXT,                 -- cuándo se necesita
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maintenance_purchases_estado    ON maintenance_purchases(estado);
CREATE INDEX idx_maintenance_purchases_prioridad ON maintenance_purchases(prioridad);
```

---

## 4. Estados

| Estado | Descripción |
|---|---|
| `'Pendiente'` | Solicitud creada, sin gestionar |
| `'En proceso'` | Alguien está buscando el artículo o tramitando el pedido |
| `'Pedido'` | Ya está pedido al proveedor |
| `'Recibido'` | Material recibido en Mantenimiento |
| `'Cancelado'` | Cancelado con motivo |

---

## 5. Permisos

| Acción | Empleado Mant. | Jefe Mant. | Admin |
|---|---|---|---|
| Crear solicitud | ✅ | ✅ | ✅ |
| Ver solicitudes del dpto | ✅ | ✅ | ✅ |
| Cambiar estado | ❌ | ✅ | ✅ |
| Eliminar solicitud | ❌ | ❌ | ✅ |

---

## 6. KPI en dashboard Mantenimiento

`[NO DATA]` — pendiente definir si se quiere KPI de compras en dashboard.

Candidatos:
- Solicitudes pendientes
- Solicitudes urgentes
- Solicitudes recibidas en el periodo
- Coste estimado acumulado

---

## 7. Vinculación con tareas

Una compra necesaria puede originarse de una tarea. En ese caso, guardar `tarea_id` como referencia para trazabilidad. Los dos registros son independientes y tienen estados separados.

---

## 8. QA

```
□ El botón "Compras necesarias" solo aparece para Mantenimiento y Admin
□ El formulario tiene campos: artículo, cantidad, unidad, prioridad, fecha necesidad, comentario
□ Al crear solicitud: aparece en lista sin error
□ El empleado de Mantenimiento no puede cambiar estado
□ El jefe/admin sí puede cambiar estado
□ Eliminar: solo admin + confirmación + audit_log
□ No mezclar con tareas ni incidencias
□ created_at en hora local España
```
