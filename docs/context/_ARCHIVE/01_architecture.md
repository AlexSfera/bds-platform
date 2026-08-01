# 01 — Arquitectura Técnica

---

## 1. Stack tecnológico actual

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Vanilla JS · HTML · CSS | Sin frameworks. Sin npm. Sin build. |
| Backend/DB | Supabase (PostgreSQL) | REST API via fetch directo |
| Hosting | Vercel | Deploy desde GitHub |
| Autenticación | PIN numérico propio | Sin Supabase Auth |
| Tiempo real | Polling manual + invalidateCache() | Sin Supabase Realtime |

---

## 2. Estructura de ficheros

```
syncro-hub/
├── index.html          → HTML global + funciones que sobreescriben módulos
├── shared.js           → Auth, DB helpers, Mi Turno genérico, topbar, DEPT_CONFIG
├── dashboard.js        → Dashboard completo — todas las pestañas, KPIs, renders
├── incidencia_tipos.js → Listas de tipos de incidencia y gestión por departamento
├── checklist.js        → Checklists por departamento y turno
├── caja.js             → Lógica de caja base (genérica)
├── sala.js             → Módulo Sala — caja, KPIs específicos
├── recepcion.js        → Módulo Recepción — caja, KPIs específicos
│
│   [PENDIENTE DE CREAR]
├── cocina.js           → Módulo Cocina — merma, KPIs específicos
└── syncrolab.js        → Módulo SYNCROLAB — caja, KPIs específicos
```

### Regla de precedencia de funciones

`index.html` se carga al final y **sobreescribe** cualquier función definida en módulos JS cargados antes. Esto es una limitación conocida del stack actual.

**Antes de editar un módulo JS, verificar siempre si `index.html` redefine la misma función:**

```bash
grep -n "function nombreFuncion" index.html recepcion.js shared.js
```

Si existe en `index.html` → editar `index.html`. Si no → editar el módulo.

---

## 3. Configuración centralizada de departamentos

Toda la lógica de departamentos vive en `DEPT_CONFIG` dentro de `shared.js`. **Nunca hardcodear nombres de departamentos fuera de esta estructura.**

```javascript
const DEPT_CONFIG = {
  'Cocina':              { emoji:'🍳', color:'#f59e0b', caja:false, merma:true,  modulo:'cocina.js'     },
  'Sala':                { emoji:'🍽', color:'#3b82f6', caja:true,  merma:false, modulo:'sala.js'        },
  'Recepción':           { emoji:'🏨', color:'#8b5cf6', caja:true,  merma:false, modulo:'recepcion.js'   },
  'Recepción SYNCROLAB': { emoji:'🏋', color:'#06b6d4', caja:true,  merma:false, modulo:'syncrolab.js'   },
  'Friegue':             { emoji:'🧽', color:'#f97316', caja:false, merma:false, modulo:'shared.js'      },
  'Housekeeping':        { emoji:'🛏', color:'#10b981', caja:false, merma:false, modulo:'shared.js'      },
  'Mantenimiento':       { emoji:'🔧', color:'#ef4444', caja:false, merma:false, modulo:'shared.js'      },
  'Economato':           { emoji:'📦', color:'#a855f7', caja:false, merma:false, modulo:'shared.js'      },
  'RRHH':                { emoji:'👥', color:'#64748b', caja:false, merma:false, modulo:'shared.js'      },
  'Administración':      { emoji:'📋', color:'#6366f1', caja:false, merma:false, modulo:'shared.js'      },
};

function getDeptConfig(dept)  { return DEPT_CONFIG[dept] || { emoji:'🏢', color:'#64748b', caja:false, merma:false }; }
function deptTieneCaja(dept)  { return getDeptConfig(dept).caja  === true; }
function deptTieneMerma(dept) { return getDeptConfig(dept).merma === true; }
```

---

## 4. Capa de datos — reglas obligatorias

### 4.1 Función de acceso a Supabase

Toda lectura/escritura pasa por las funciones centralizadas de `shared.js`:

```javascript
getDB(table)                    // GET con caché
dbInsert(table, record)         // POST — lanza throw en error
dbUpdate(table, id, patch)      // PATCH return=minimal
dbDelete(table, id)             // DELETE — siempre audit_log antes
invalidateCache(table)          // limpiar caché tras escritura
```

### 4.2 Error handling obligatorio

```javascript
// CORRECTO
try {
  await dbInsert('gestiones', record);
  invalidateCache('gestiones');
  toast('Guardado correctamente', 'ok');
} catch(e) {
  errorEl.textContent = 'Error: ' + e.message; // muestra mensaje real de Supabase
}

// INCORRECTO — nunca hacer esto
const saved = await dbInsert('gestiones', record);
if (!saved) { mostrarMensajeGenerico(); } // oculta el error real
```

### 4.3 Timestamps — siempre hora local

```javascript
// CORRECTO
function localTs() {
  var d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 19).replace('T', ' ');
}
function today() { return new Date().toISOString().split('T')[0]; }

// INCORRECTO
new Date().toISOString() // UTC — 2h menos en España
```

### 4.4 Campos obligatorios en todo insert

```javascript
{
  id:           genId(),           // siempre generado en cliente
  departamento: currentUser.area,  // nunca nulo
  area:         currentUser.area,  // alias — mantener por compatibilidad
  employee_id:  currentUser.id,
  nombre:       currentUser.nombre,
  created_at:   localTs(),         // hora local, nunca UTC
}
```

### 4.5 Caché

Tras toda operación de escritura, invalidar la caché de la tabla afectada:

```javascript
await dbInsert('incidencias', record);
invalidateCache('incidencias'); // obligatorio
```

### 4.6 DELETE — auditoría obligatoria

```javascript
// Antes de cualquier DELETE
await auditLog('ENTITY_DELETE',
  currentUser.nombre + ' eliminó ' + tabla + ' id=' + id + ' motivo=' + motivo
);
await dbDelete(tabla, id);
invalidateCache(tabla);
```

---

## 5. Tablas Supabase — inventario

### Tablas comunes (todos los departamentos)

| Tabla | Descripción |
|---|---|
| `employees` | Usuarios del sistema |
| `shifts` | Turnos de todos los departamentos |
| `tareas` | Tareas interdepartamentales |
| `fio` | Fallos Individuales Operativos |
| `audit_log` | Registro de auditoría |

### Tablas por módulo (con discriminador `departamento`)

| Tabla | Descripción | Discriminador |
|---|---|---|
| `incidencias` | Incidencias operativas | `departamento` |
| `gestiones` | Gestiones pendientes | `departamento` |

### Tablas específicas por departamento

| Tabla | Departamento |
|---|---|
| `sala_cash_closures` | Sala |
| `recepcion_cash` | Recepción Hotel |
| `syncrolab_cash` | SYNCROLAB (pendiente crear) |
| `merma` | Cocina |

---

## 6. Valores de campos — enum implícito

Estos valores son los únicos aceptados. Supabase rechaza cualquier otro con error 400.

| Campo | Valores válidos |
|---|---|
| `estado` (incidencias/gestiones) | `'Abierta'` · `'En proceso'` · `'Cerrada'` |
| `severidad` | `'Baja'` · `'Media'` · `'Alta'` · `'Crítica'` |
| `requiere_formacion` | `'no'` · `'si'` *(minúscula)* |
| `requiere_disciplina` | `'no'` · `'si'` *(minúscula)* |
| `informado_responsable` | `'no'` · `'si'` *(minúscula)* |
| `estado` (tareas) | `'Pendiente'` · `'En proceso'` · `'Completada'` · `'Bloqueada'` · `'Vencida'` · `'Cancelada'` |

**Nunca usar:** `'No'` · `'Si'` · `'Sí'` · `'Pendiente revision'` · `'Follow-up / Gestión'`

---

## 7. Colores de botones — globales

| Acción | Color | Clase |
|---|---|---|
| Guardar / Confirmar | 🔵 Primario | `btn-primary` |
| Validar | 🟢 Verde | `btn-success` |
| En proceso | 🟡 Amarillo | `btn-warning` |
| Cerrar | 🟠 Naranja | `btn-orange` |
| Reabrir | ⚪ Secundario | `btn-secondary` |
| Eliminar | 🔴 Rojo | `btn-danger` |

---

## 8. Reglas de desarrollo — checklist pre-deploy

```
□ ¿El fix toca shared.js?
  → Probar con empleado de Cocina, Sala y Recepción antes de deploy

□ ¿El fix toca index.html?
  → Verificar que no existe función duplicada en módulos JS

□ ¿Se añade campo nuevo a un insert?
  → Verificar que la columna existe en Supabase antes de deploy
  → SQL: SELECT column_name FROM information_schema.columns WHERE table_name = 'tabla';

□ ¿Se usa new Date().toISOString()?
  → Cambiar a localTs()

□ ¿Se hardcodea un nombre de departamento?
  → Mover a DEPT_CONFIG

□ ¿Se muestra merma?
  → Verificar: deptTieneMerma(dept) === true

□ ¿Se muestra caja?
  → Verificar: deptTieneCaja(dept) === true

□ ¿Se invalida caché tras escritura?
  → invalidateCache('tabla')

□ ¿El error de Supabase llega al usuario?
  → try/catch con e.message visible en UI

□ ¿Se hace un DELETE?
  → auditLog() antes del dbDelete()
```

---

## 9. Riesgos arquitecturales conocidos

| Riesgo | Descripción | Mitigación |
|---|---|---|
| Funciones duplicadas | `index.html` sobreescribe módulos JS | Grep antes de editar módulo |
| Schema desconocido | Supabase puede rechazar campos inexistentes | Verificar columns antes de deploy |
| UTC vs local | `new Date().toISOString()` da UTC | Usar siempre `localTs()` |
| Caché stale | Datos antiguos tras escritura | `invalidateCache()` obligatorio |
| Mezcla de tablas | Leer caja Sala desde tabla Recepción | Nunca cruzar tablas de caja |
| Merma visible en otros depts | Bloque merma sin guard de departamento | `deptTieneMerma()` siempre |
