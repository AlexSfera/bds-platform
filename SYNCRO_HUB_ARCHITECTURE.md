# SYNCRO HUB — Arquitectura y Reglas de Desarrollo
**Versión:** 1.0 | **Proyecto:** syncro-hub.vercel.app | **Stack:** index.html + shared.js + Supabase + Vercel

---

## 1. PRINCIPIO FUNDAMENTAL

> **Lo que es común a todos los departamentos va en `shared.js` o `dashboard.js`.
> Lo que es específico de un departamento va en su propio módulo JS.
> Un fix en un módulo específico NO debe tocar nunca `shared.js` ni afectar otros departamentos.
> Un fix en `shared.js` aplica a TODOS los departamentos — verificar que no rompe ninguno.**

---

## 2. DEPARTAMENTOS — CONFIGURACIÓN CENTRALIZADA

Toda la configuración de departamentos vive en `shared.js` en el objeto `DEPT_CONFIG`.
**Nunca hardcodear nombres de departamentos fuera de esta configuración.**

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
  'Administración':      { emoji:'📋', color:'#a855f7', caja:false, merma:false, modulo:'shared.js'      },
};

// Helper: obtener config de un departamento
function getDeptConfig(dept) {
  return DEPT_CONFIG[dept] || { emoji:'🏢', color:'#64748b', caja:false, merma:false };
}
// Helper: departamentos con caja
function deptTieneCaja(dept) { return getDeptConfig(dept).caja === true; }
// Helper: departamentos con merma
function deptTieneMerma(dept) { return getDeptConfig(dept).merma === true; }
```

---

## 3. TABLAS SUPABASE — ESTRUCTURA

### 3.1 Regla de separación

| Tabla | Alcance | Columna clave |
|---|---|---|
| `incidencias_{dept}` | Por departamento | `tipo_incidencia` (lista propia de cada dpto) |
| `gestiones_{dept}` | Por departamento | `tipo_gestion` (lista propia de cada dpto) |
| `tareas` | Global — todos los departamentos | `dept_destino` |
| `fio` | Global — todos los departamentos | `departamento` |
| `shifts` | Global | `departamento` |
| `merma` | Solo Cocina | `departamento` (siempre = 'Cocina') |

> **Actualmente las tablas de incidencias y gestiones son únicas (`incidencias`, `gestiones`).
> Hasta que se migren a tablas separadas por departamento, usar la columna `departamento` como discriminador
> y NUNCA filtrar por `categoria` para separar gestiones de incidencias — son tablas distintas.**

### 3.2 Columnas obligatorias en TODAS las tablas de gestiones e incidencias

```sql
id                    TEXT PRIMARY KEY,
shift_id              TEXT,           -- referencia al turno
employee_id           TEXT,           -- quien lo registra
nombre                TEXT,           -- nombre legible
departamento          TEXT NOT NULL,  -- NUNCA nulo
area                  TEXT,           -- alias de departamento
fecha                 TEXT,           -- YYYY-MM-DD hora local
servicio              TEXT,
descripcion           TEXT,
accion_tomada         TEXT,
estado                TEXT DEFAULT 'Abierta',  -- 'Abierta'|'En proceso'|'Cerrada'
cerrado_por           TEXT,
cerrado_ts            TEXT,
tiempo_gestion        INTEGER,        -- minutos apertura→cierre
informado_responsable TEXT DEFAULT 'no',
created_at            TIMESTAMPTZ DEFAULT NOW()
```

### 3.3 Columnas adicionales en incidencias

```sql
tipo_incidencia       TEXT,           -- de la lista del departamento
categoria             TEXT,           -- 'Incidencia operativa'
severidad             TEXT DEFAULT 'Media',  -- 'Baja'|'Media'|'Alta'|'Crítica'
accion_inmediata      TEXT,
requiere_formacion    TEXT DEFAULT 'no',
requiere_disciplina   TEXT DEFAULT 'no',
staff_implicado_ids   TEXT DEFAULT '[]',
staff_implicado_nombres TEXT DEFAULT '[]'
```

### 3.4 Columnas adicionales en gestiones

```sql
tipo_gestion          TEXT            -- de la lista del departamento
```

### 3.5 Valores aceptados — CHECK implícito

| Campo | Valores válidos |
|---|---|
| `estado` | `'Abierta'` \| `'En proceso'` \| `'Cerrada'` |
| `severidad` | `'Baja'` \| `'Media'` \| `'Alta'` \| `'Crítica'` |
| `requiere_formacion` | `'no'` \| `'si'` (minúscula) |
| `requiere_disciplina` | `'no'` \| `'si'` (minúscula) |
| `informado_responsable` | `'no'` \| `'si'` (minúscula) |

**NUNCA usar:** `'No'` / `'Si'` / `'Sí'` / `'Pendiente revision'` / `'Follow-up / Gestión'`

---

## 4. TIMESTAMPS — REGLA ÚNICA

**Toda fecha/hora que se graba en Supabase debe ser hora local del navegador, nunca UTC.**

```javascript
// CORRECTO — usar siempre esta función
function localTs() {
  var d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 19).replace('T', ' ');
}
function today() {
  return new Date().toISOString().split('T')[0];
}

// INCORRECTO — nunca usar esto para grabar en BD
new Date().toISOString()  // ← da UTC, 2h menos en España
```

---

## 5. MI TURNO — REGLAS POR DEPARTAMENTO

### 5.1 Elementos comunes a todos los departamentos

- Fecha + Turno + Horas trabajadas + Observación
- Sección **Gestión pendiente** (Sí/No) → tipo + descripción
- Sección **Incidencia operativa** (Sí/No) → tipo + descripción + acción + staff
- Sección **Tarea** (creación opcional, independiente del cierre)
- Historial de turnos propios (solo del empleado logueado)
- Gestiones propias pendientes (del departamento del empleado)

### 5.2 Elementos exclusivos por departamento

| Elemento | Departamentos |
|---|---|
| **Merma** | Solo Cocina |
| **Caja / Cierre de caja** | Sala, Recepción, Recepción SYNCROLAB |
| **Checklist de cierre** | Cada departamento tiene el suyo — ver `checklist.js` |
| **Campos KPI específicos** | Según módulo del departamento |

### 5.3 Regla de visibilidad — topbar

```
EMPLEADO / SUPERVISOR:
[Mi Turno] [Incidencias] [Gestiones] [Caja*] ··· [Dept] [Salir] [Cierre Caja*]

JEFE DEPARTAMENTO / ADMIN:
[Mi Turno] [Gestiones] [Incidencias] ··· [Dept] [Salir]

* Caja y Cierre de Caja: SOLO para Sala, Recepción y Recepción SYNCROLAB
  Condición: deptTieneCaja(currentUser.area) === true
```

### 5.4 Gestión y tarea desde Mi Turno — independiente del cierre

El empleado puede crear una gestión o tarea en cualquier momento desde el botón superior,
sin necesidad de guardar o cerrar su turno. Son acciones independientes.

---

## 6. TIPOS DE INCIDENCIA Y GESTIÓN — FUENTE ÚNICA

**Archivo:** `incidencia_tipos.js`
**Regla:** toda lista de tipos vive aquí. Nunca hardcodear opciones en `index.html` ni en otros JS.

```javascript
// Obtener tipos según departamento
var tipos = getInciTipos(currentUser.area);     // incidencias
var tipos = getGestionTipos(currentUser.area);  // gestiones

// Poblar selectores
populateInciTipoSelector('i-tipo-incidencia', currentUser.area);
populateGestionTipoSelector('g-tipo', currentUser.area);

// Poblar filtros del dashboard
populateDashInciFilter(currentUser.area);
populateDashGestionFilter(currentUser.area);
```

**Llamar siempre** al abrir la pantalla de Mi Turno y al cambiar de departamento en el dashboard.

---

## 7. VALIDACIÓN DE TURNO — REGLAS

### 7.1 El modal de validación debe mostrar SIEMPRE

- Checklist completado (ítems marcados/desmarcados)
- Gestiones del turno (de tabla `gestiones`) — con estado actual
- Incidencias del turno (de tabla `incidencias`) — con estado actual
- Tareas creadas en el turno (de tabla `tareas`) — con estado actual
- FIO del turno si existe (de tabla `fio`)
- **Merma**: SOLO si `deptTieneMerma(shift.departamento) === true`
- **Caja**: SOLO si `deptTieneCaja(shift.departamento) === true`

### 7.2 Acciones disponibles desde el modal de validación

El supervisor/admin puede actuar sobre gestiones, incidencias y tareas del turno **sin salir del modal**:

| Elemento | Acciones disponibles |
|---|---|
| Gestión | → En proceso · → Cerrar (con campo "Acción tomada" obligatorio) |
| Incidencia | → En proceso · → Cerrar (con campo "Acción tomada" obligatorio) |
| Tarea | → En proceso · → Cerrar |

**Reglas de los botones de acción:**

- **"En proceso"** → cambia estado a `'En proceso'`. Graba `updated_at = localTs()`. No cierra.
- **"Cerrar"** → abre campo inline para escribir "Acción tomada". Al confirmar: estado = `'Cerrada'`, graba `cerrado_por`, `cerrado_ts`, `tiempo_gestion` (minutos desde `created_at`).
- Los botones se muestran según el estado actual: si ya está "En proceso" no aparece ese botón. Si está "Cerrada" no aparece ninguno.
- Tras cualquier cambio de estado → `invalidateCache()` de la tabla correspondiente → re-render del bloque sin cerrar el modal.

### 7.3 Reglas de bloqueo en validación

| Condición | Resultado |
|---|---|
| Hay merma sin precio asignado | No se puede validar (solo Cocina) |
| Incidencia en estado 'Abierta' | Se puede validar — NO se cierra automáticamente |
| Gestión en estado 'Abierta' | Se puede validar — NO se cierra automáticamente |
| Caja no cuadrada | Alerta visual — no bloquea validación |

### 7.4 La validación NO hace nunca

- Cerrar incidencias automáticamente
- Cerrar gestiones automáticamente
- Crear tareas automáticamente

### 7.5 Columnas de la tabla de lista de turnos en validación

`Fecha | Empleado | Servicio | Horas | Gestiones | Incidencias | Tareas | Merma* | FIO | Estado | Acción`

`*` Merma: columna visible solo si el filtro de departamento activo tiene `merma: true`

Cada celda de Gestiones / Incidencias / Tareas muestra:
- `—` si no hay ninguna
- Número en badge naranja si hay alguna abierta
- Número en badge verde si todas cerradas

---

## 8. DASHBOARD — REGLAS

### 8.1 Fuentes de datos por pestaña

| Pestaña | Tabla Supabase | Filtro |
|---|---|---|
| Turnos | `shifts` | `departamento` |
| Incidencias | `incidencias` | `departamento` |
| Gestiones Pendientes | `gestiones` | `departamento` |
| FIO | `fio` | `departamento` |
| Tareas | `tareas` | `dept_destino` |
| Costes | `merma` | `departamento` (solo Cocina) |

### 8.2 Contadores KPI — iguales para todos los departamentos

```
Turnos del periodo         → COUNT shifts WHERE departamento
Horas trabajadas           → SUM horas WHERE departamento
Incidencias abiertas       → COUNT incidencias WHERE estado='Abierta' AND departamento
Incidencias cerradas       → COUNT incidencias WHERE estado='Cerrada' AND departamento
Gestiones abiertas         → COUNT gestiones WHERE estado='Abierta' AND departamento
Gestiones cerradas         → COUNT gestiones WHERE estado='Cerrada' AND departamento
Tareas abiertas            → COUNT tareas WHERE estado='Abierta' AND dept_destino
Tareas cerradas            → COUNT tareas WHERE estado='Cerrada' AND dept_destino
FIO totales                → COUNT fio WHERE departamento
FIO pendientes             → COUNT fio WHERE estado!='Cerrada' AND departamento
```

### 8.3 KPI específicos por departamento (en pestaña Turnos)

Cada departamento tiene sus propios campos de cierre de turno.
El dashboard solo muestra los KPI del departamento seleccionado.

| Departamento | KPI adicionales |
|---|---|
| Cocina | Cubiertos, merma €, ajustes |
| Sala | Cubiertos, propinas, ajustes TPV |
| Recepción | Check-ins, check-outs, ocupación, caja cuadrada |
| Recepción SYNCROLAB | Sesiones, cobros, leads |

### 8.4 Filtros del dashboard

El filtro de **Tipo** en Incidencias y Gestiones debe poblarse con la lista del departamento seleccionado.
Llamar a `populateDashInciFilter(dept)` y `populateDashGestionFilter(dept)` al cambiar el filtro de departamento.

### 8.5 Columnas obligatorias — Incidencias y Gestiones

Igual para todos los departamentos sin excepción:

| Columna | Fuente | Notas |
|---|---|---|
| Fecha apertura | `created_at` | Formato DD/MM/YYYY |
| Hora apertura | `created_at` | Hora local España |
| Fecha cierre | `cerrado_ts` | Solo si estado = 'Cerrada' |
| Hora cierre | `cerrado_ts` | Hora local España |
| Departamento | `departamento` | Badge de color |
| Empleado | `nombre` | Quien registró |
| Tipo | `tipo_incidencia` / `tipo_gestion` | De la lista del departamento |
| Descripción | `descripcion` | |
| Acción tomada | `accion_tomada` | Vacío si abierta |
| Estado | `estado` | Badge con color |
| Tiempo gestión | `tiempo_gestion` | Semáforo: ≤24h 🟢 / ≤48h 🟡 / >48h 🔴 |
| Cerrado por | `cerrado_por` | Solo si estado = 'Cerrada' |

**Regla de tiempo de gestión:**
- Se calcula en el momento del cierre: `tiempo_gestion = minutos entre created_at y cerrado_ts`
- Se graba en BD al cerrar — no se recalcula en frontend
- El semáforo se aplica también a registros abiertos usando tiempo transcurrido desde `created_at`

### 8.6 Columnas obligatorias — Tareas

| Columna | Fuente | Notas |
|---|---|---|
| Fecha creación | `created_at` | Formato DD/MM/YYYY HH:mm |
| Descripción | `descripcion` | |
| Departamento destino | `dept_destino` | |
| Responsable | `responsable_nombre` | |
| Deadline | `deadline` | Rojo si vencida |
| Estado | `estado` | Badge con color |

---

## 9. CAJA — REGLAS

### 9.1 Departamentos con caja

`Sala`, `Recepción`, `Recepción SYNCROLAB`

**Verificar siempre:** `deptTieneCaja(currentUser.area)` antes de mostrar cualquier elemento de caja.

### 9.2 Fórmula de diferencias — igual para todos los departamentos con caja

```
Δ Cash     = Cash MEWS - (Cash real - Fondo recibido)
Δ Tarjeta  = Tarjeta MEWS - TPV real
Δ Stripe   = Stripe MEWS - Stripe real
Δ Transfer = Transferencia MEWS - Transferencia real   ← SIEMPRE mostrar
Δ Total    = Δ Cash + Δ Tarjeta + Δ Stripe + Δ Transfer

Fondo esperado a traspasar = Fondo recibido + Cash MEWS - Retiro caja fuerte
```

**Δ Transfer se muestra siempre en el bloque de diferencias**, aunque sea 0 o se considere aceptable.
La diferencia de transferencia no bloquea ni genera alerta — solo se informa.

### 9.3 Reglas de bloqueo en cierre de caja

| Condición | Acción |
|---|---|
| Δ Cash ≠ 0 | Explicación obligatoria |
| Δ Tarjeta ≠ 0 | Explicación obligatoria |
| Δ Stripe ≠ 0 | Explicación obligatoria |
| Δ Transfer ≠ 0 | Informativo — no bloquea |
| Fondo real ≠ Fondo esperado | Explicación obligatoria |

### 9.4 Traspaso de fondo

- `Fondo recibido del turno anterior` = `fondo_real_a_traspasar` del último cierre del mismo departamento
- Campo **readonly** — no editable por el empleado
- `Fondo esperado a traspasar` y `Fondo inicial día siguiente` son el **mismo campo** — unificar en uno

### 9.5 Tabla Supabase por departamento

| Departamento | Tabla |
|---|---|
| Sala | `sala_cash_closures` |
| Recepción | `recepcion_cash` |
| Recepción SYNCROLAB | `syncrolab_cash` (o `recepcion_cash` con discriminador) |

**Nunca leer/escribir caja de Sala en tabla de Recepción ni viceversa.**

---

## 10. MERMA — REGLAS

- **Solo departamento Cocina**
- Verificar siempre: `deptTieneMerma(currentUser.area)` o `deptTieneMerma(shift.departamento)`
- El bloque de merma NO debe aparecer en: Mi Turno de otros departamentos, modal de validación de otros departamentos, dashboard de otros departamentos
- Si hay merma sin precio asignado → bloquear validación del turno de Cocina

---

## 11. FIO — REGLAS

- Tabla global `fio` con columna `departamento`
- Se registra durante la validación del turno (solo supervisores/admin)
- Aparece en dashboard pestaña FIO filtrado por departamento
- Contadores: FIO totales + FIO pendientes (sin cerrar)
- El botón Revalidar en el modal FIO es solo para **admin** y **responsable de departamento**

---

## 12. BOTONES — COLORES GLOBALES

Aplicar en TODOS los departamentos sin excepción:

| Acción | Color | Clase CSS |
|---|---|---|
| En proceso | 🟡 Amarillo | `btn-warning` |
| Cerrar | 🟠 Naranja | `btn-orange` |
| Validar | 🟢 Verde | `btn-success` |
| Eliminar | 🔴 Rojo | `btn-danger` |
| Reabrir | ⚪ Secundario | `btn-secondary` |
| Guardar | 🔵 Primario | `btn-primary` |

---

## 13. REGLAS DE CÓDIGO — OBLIGATORIAS

### 13.1 Antes de cualquier fix

1. Identificar si el bug afecta a **un departamento** o a **todos**
2. Si afecta a uno → tocar solo el módulo JS de ese departamento
3. Si afecta a todos → tocar `shared.js` y verificar que no rompe ningún departamento
4. Nunca tocar `shared.js` para resolver un bug de un solo departamento

### 13.2 Inserts en Supabase

Siempre incluir:
```javascript
departamento: currentUser.area || '',
area:         currentUser.area || '',
created_at:   localTs(),   // NUNCA new Date().toISOString()
```

Nunca enviar campos que no existen en la tabla → error 400 silencioso.
Verificar schema antes de añadir campos nuevos al record.

### 13.3 Invalidar caché tras escritura

```javascript
await dbInsert('gestiones', record);
invalidateCache('gestiones');   // obligatorio tras toda escritura
```

### 13.4 Manejo de errores

```javascript
try {
  await dbInsert('tabla', record);
  invalidateCache('tabla');
  toast('Guardado', 'ok');
} catch(e) {
  errorEl.textContent = 'Error: ' + e.message;  // mostrar mensaje real de Supabase
}
// NUNCA: if(!saved){ mostrar mensaje genérico }
```

### 13.5 Funciones duplicadas

`index.html` puede definir funciones que sobreescriben las de módulos JS cargados antes.
**Regla:** si una función existe en `index.html` Y en un módulo JS, la de `index.html` siempre gana.
Antes de editar un módulo JS, verificar si `index.html` redefine la misma función.

```bash
grep -n "function nombreFuncion" index.html recepcion.js shared.js
```

### 13.6 Populate de selectores al abrir pantallas

Al abrir Mi Turno, siempre llamar:
```javascript
populateInciTipoSelector('i-tipo-incidencia', currentUser.area);
populateGestionTipoSelector('g-tipo', currentUser.area);
```
Al cambiar departamento en dashboard:
```javascript
populateDashInciFilter(dept);
populateDashGestionFilter(dept);
```

---

## 14. CHECKLIST — REGLAS

- Cada departamento tiene su propio checklist definido en `checklist.js`
- El checklist se carga según `currentUser.area` y `turno` (Mañana/Tarde/Noche)
- **Nunca mostrar el checklist de Cocina a un empleado de Recepción ni viceversa**
- El checklist NO es obligatorio para guardar el turno — es informativo
- El estado del checklist se guarda en el shift (`checklist_data` como JSON)

---

## 15. ARCHIVOS — RESPONSABILIDADES

| Archivo | Responsabilidad |
|---|---|
| `shared.js` | Auth, DB helpers, funciones comunes, Mi Turno genérico, topbar, DEPT_CONFIG |
| `index.html` | HTML estructura, funciones que sobreescriben módulos, modal de validación |
| `dashboard.js` | Dashboard — todas las pestañas, filtros, renders, KPIs |
| `incidencia_tipos.js` | Listas de tipos de incidencia y gestión por departamento |
| `checklist.js` | Checklists por departamento y turno |
| `caja.js` | Lógica de caja genérica (base) |
| `sala.js` | Módulo específico Sala — caja Sala, KPIs Sala |
| `recepcion.js` | Módulo específico Recepción — caja Recepción, KPIs Recepción |

**Módulos pendientes de crear:**
- `syncrolab.js` — caja y KPIs SYNCROLAB
- `cocina.js` — merma, KPIs cocina (actualmente en shared.js)

---

## 16. VERIFICACIÓN ANTES DE DEPLOY

```
□ ¿El fix toca shared.js? → Probar con empleado de Cocina, Sala y Recepción
□ ¿El fix toca index.html? → Verificar que no hay función duplicada en módulos JS
□ ¿Se añade campo nuevo a un insert? → Verificar que existe la columna en Supabase
□ ¿Se usa new Date().toISOString()? → Cambiar a localTs()
□ ¿Se hardcodea un nombre de departamento? → Mover a DEPT_CONFIG
□ ¿Se muestra merma? → Verificar que solo aplica a Cocina
□ ¿Se muestra caja? → Verificar que solo aplica a Sala/Recepción/SYNCROLAB
□ ¿Se invalida caché tras escritura? → invalidateCache('tabla')
□ ¿El error de Supabase llega al usuario? → try/catch con e.message
```
