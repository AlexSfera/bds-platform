# 03 — Roles y Permisos

*Actualizado 30 jul 2026 — cruzado contra `shared.js` (306 KB) y `validacion.js` (140 KB) del repo.*

---

## 1. Roles del sistema

| Rol (código) | Etiqueta UI | Descripción |
|---|---|---|
| `admin` | ADMIN | Acceso total, todos los departamentos y módulos |
| `adjunto_directivo` | ADJ.DIR | Acceso a todos los departamentos. Valida, gestiona Maestro. `canActAsAdmin = true` |
| `adjunto` | ADJ.DIR/RRHH | Alias legacy de `adjunto_directivo`. Mismo comportamiento |
| `contable` | CONTABLE | Solo Validación (pestaña Caja) + Dashboard. No valida turnos |
| `fb` | F&B | Supervisor Sala + Cocina + Friegue + FnB |
| `chef` | CHEF | Supervisor Cocina + Friegue |
| `jefe_recepcion` | JEF.REC | Supervisor Recepción Hotel |
| `gobernante` | GOB. | Supervisor Housekeeping + Limpieza |
| `subgobernante` | SUBGOB. | Supervisor Housekeeping + Limpieza. `canActAsAdmin = false` |
| `jefe_mantenimiento` | JEF.MANT. | Supervisor Mantenimiento. `canActAsAdmin = false` |
| `coord_recepcion_syncrolab` | COORD.LAB | Supervisor Recepción SYNCROLAB + SyncroLab |
| `coord_entrenadores` | COORD.ENTR | Supervisor Entrenadores + SYNCROLAB |
| `coord_fisioterapeutas` | COORD.FISIO | Supervisor Fisioterapeutas + Clínica + SYNCROLAB |
| `empleado` | (su área) | Usuario operativo básico, sin supervisión |

**PIN de rol:** `ROLE_PINS = {'300415':'admin', '0101':'chef'}` — se detecta en login antes de buscar empleado.

---

## 2. Funciones clave de permisos (shared.js)

| Función | Lógica |
|---|---|
| `isAdmin(user)` | `user.rol === 'admin'` |
| `isAdjuntoDirectivo(user)` | `user.rol === 'adjunto' \|\| 'adjunto_directivo'` |
| `canActAsAdmin(user)` | `isAdmin(user) \|\| isAdjuntoDirectivo(user)` — **usada para DELETEs, Maestro editable, FIO delete, IP management** |
| `isContable(user)` | `user.rol === 'contable'` |
| `isSupervisor(user)` | `user.rol === 'jefe' \|\| rol en SUPERVISOR_DEPT_MAP` |
| `getSupervisorDepartments(user)` | Devuelve array de deptos que supervisa (de `SUPERVISOR_DEPT_MAP`) o `[user.area]` |
| `canViewDepartment(user, dept)` | Verifica acceso a un depto específico |
| `hkIsGobernanta(user)` | Gobernanta o subgobernanta |
| `_esEntrenador(emp)` | Detecta entrenador por `puesto`, NO por `area` (T11: area SYNCROLAB compartida) |
| `_esFisio(emp)` | Detecta fisioterapeuta por `puesto` |
| `_deptCatalogo(emp)` | Devuelve depto real para catálogo FIO |

**⚠ Las columnas legacy `responsable` y `validador` en `employees` ya NO se usan para detección de rol.** Todo usa `SUPERVISOR_DEPT_MAP` + funciones de arriba.

---

## 3. SUPERVISOR_DEPT_MAP (shared.js ~línea 135)

```javascript
const SUPERVISOR_DEPT_MAP = {
  chef:                      ['Cocina', 'Friegue'],
  fb:                        ['Sala', 'Cocina', 'Friegue', 'FnB', 'Food & Beverage'],
  jefe_recepcion:            ['Recepción', 'Recepción SFERA'],
  gobernante:                ['Housekeeping', 'Limpieza'],
  subgobernante:             ['Housekeeping', 'Limpieza'],
  jefe_mantenimiento:        ['Mantenimiento'],
  coord_recepcion_syncrolab: ['Recepción SYNCROLAB', 'SyncroLab', 'SYNCROLAB'],
  coord_entrenadores:        ['Entrenadores', 'SYNCROLAB', 'SyncroLab'],
  coord_fisioterapeutas:     ['Fisioterapeutas', 'Clínica', 'SYNCROLAB', 'SyncroLab'],
  adjunto_directivo:         ['*'],   // todos los departamentos
  adjunto:                   ['*']    // alias legacy
};
```

`isJefe` en `getScreens()` = `isAdminU || isAdjDir || isSupervisor(user) || rol en lista explícita de supervisores` — controla acceso a Validación, Dashboard, Manager Bar.

---

## 4. Matriz de permisos por módulo

### 4.1 Mi Turno / Mi Día

| Acción | Empleado | Jefe Dpto | Contable | Admin/Adjunto |
|---|---|---|---|---|
| Ver/iniciar turno propio | ✅ | ✅ | ❌ | ✅ |
| Completar checklist | ✅ | ✅ | ❌ | ✅ |
| Registrar gestión | ✅ | ✅ | ❌ | ✅ |
| Registrar incidencia | ✅ | ✅ | ❌ | ✅ |
| Crear tarea | ✅ | ✅ | ❌ | ✅ |
| Cerrar turno | ✅ | ✅ | ❌ | ✅ |
| Declarar merma (Cocina/Friegue/FnB) | ✅ | ✅ | ❌ | ❌ (bypass temporal) |
| KPI Entrenador (autodeclaración) | ✅ (entrenadores) | ❌ | ❌ | ❌ |
| Nota/Sugerencia | ✅ | ✅ | ❌ | ✅ |

### 4.2 Gestiones

| Acción | Empleado | Jefe Dpto | Admin/Adjunto |
|---|---|---|---|
| Ver gestiones de su departamento | ✅ | ✅ | ✅ (todos) |
| Avanzar/cerrar gestión de su dpto | ✅ | ✅ | ✅ |
| Eliminar gestión | ❌ | ✅ (su dpto) | ✅ |

### 4.3 Incidencias

| Acción | Empleado | Jefe Dpto | Admin/Adjunto |
|---|---|---|---|
| Ver | Solo las que creó (desaparecen al cerrar) | Todas de su dpto | Todas |
| Avanzar/cerrar | ❌ | ✅ (su dpto) | ✅ |
| Eliminar | ❌ | ✅ (su dpto) | ✅ |

### 4.4 Tareas

| Acción | Empleado dpto origen | Empleado dpto destino | Jefe Dpto | Admin/Adjunto |
|---|---|---|---|---|
| Ver | ✅ (la creó) | ✅ (asignadas a su dpto) | ✅ | ✅ |
| Avanzar/cerrar | ❌ | ✅ | ✅ | ✅ |
| Eliminar | ❌ | ❌ | ❌ | ✅ (`canActAsAdmin`) |

### 4.5 Caja

| Acción | Empleado | Jefe Dpto | Contable | Admin/Adjunto |
|---|---|---|---|---|
| Realizar cierre | ✅ (su dpto) | ✅ (su dpto) | ❌ | ✅ |
| Reabrir cierre | ❌ | ✅ (su dpto) | ❌ | ✅ |
| Eliminar cierre | ❌ | ❌ | ❌ | ✅ (`canActAsAdmin`) |
| Ver cierres (lectura) | ❌ | ✅ (su dpto) | ✅ (todos, solo Caja tab) | ✅ |

### 4.6 Validación (7 pestañas)

| Pestaña | Jefe Dpto | Contable | Admin/Adjunto |
|---|---|---|---|
| **Follow-up** (turnos) | ✅ su dpto | ❌ | ✅ todos |
| **Operativo** (gestiones/incidencias/tareas/notas) | ✅ su dpto | ❌ | ✅ todos |
| **Caja** (cierres) | ✅ su dpto | ✅ (ÚNICA pestaña visible) | ✅ todos |
| **Hypoxic** | ✅ | ❌ | ✅ |
| **Merma** | ✅ (Cocina/Friegue) | ❌ | ✅ |
| **Notas** (employee_notes) | ✅ su dpto | ❌ | ✅ |
| **FIO** | ✅ su dpto | ❌ | ✅ |

Contable: `_updateContableTabLock()` oculta todas las pestañas excepto Caja. `switchValTab` fuerza `tab = 'caja'` si `isContable`.

### 4.7 FIO

| Acción | Empleado | Jefe Dpto | Admin/Adjunto |
|---|---|---|---|
| Ver Mis FIO | ✅ (solo los suyos) | ✅ (suyos + subordinados) | ✅ |
| Disputar FIO | ✅ (solo los suyos) | ❌ | ❌ |
| Crear FIO | ❌ | ✅ (su dpto) | ✅ |
| Validar FIO | ❌ | ✅ (`canValidateFIO`) | ✅ |
| Eliminar FIO | ❌ | ❌ | ✅ (`canActAsAdmin`) |

### 4.8 Dashboard / Informes / Maestro

| Acción | Empleado | Jefe Dpto | Contable | Admin/Adjunto |
|---|---|---|---|---|
| Dashboard | ❌ | ✅ (su dpto) | ✅ | ✅ (todos) |
| Informes | ❌ | ✅ (Manager Bar) | ❌ | ✅ |
| Maestro (CRUD empleados) | ❌ | ✅ (su dpto, limitado) | ❌ | ✅ (completo) |
| Exportar | ❌ | ❌ | ❌ | ✅ |
| Fichaje / Alertas | ❌ | ✅ | ❌ | ✅ |
| Mi Rendimiento | ✅ | ✅ | ❌ | ❌ |

### 4.9 Housekeeping (específicos)

| Acción | Empleado HK | Gobernante/Subgob. | Admin/Adjunto |
|---|---|---|---|
| Mi Ruta | ✅ | ✅ | ✅ |
| Checklist HK | ✅ | ✅ | ✅ |
| Revisión HK | ❌ | ✅ (GESTIÓN HK dropdown) | ✅ |
| Dashboard HK | ❌ | ✅ (GESTIÓN HK dropdown) | ✅ |
| Planificación HK | ❌ | ✅ (GESTIÓN HK dropdown) | ✅ |
| Zonas públicas | ❌ | ✅ (GESTIÓN HK dropdown) | ✅ |
| Configuración HK | ❌ | ✅ (Manager Bar) | ✅ |

### 4.10 Mantenimiento

| Acción | Empleado Mant. | Jefe Mantenimiento | Admin/Adjunto |
|---|---|---|---|
| Kanban Tareas | ✅ | ✅ | ✅ |
| Drag & drop columnas | ✅ | ✅ | ✅ |

---

## 5. Navegación — estructura `getScreens(rol)`

La función `getScreens()` (shared.js ~línea 680) construye el menú dinámico. Hay 4 bloques principales:

| Bloque | Contenido | Quién lo ve |
|---|---|---|
| **MI DÍA** | Turno, Checklist, Merma, Caja, Gestiones, Tareas, Incidencias, Hypoxic, Nota | Todos (varía por dpto) |
| **MI DEPARTAMENTO** | Validación, Kanban Mant., Fichaje, Mis FIO, Mi Rendimiento | Jefes + empleados (no Administración) |
| **GESTIÓN HK** (dropdown) | Revisión, Dashboard HK, Planificación, Zonas públicas | Solo Gobernante/Subgob. + Admin |
| **MANAGER BAR** (dropdown) | Dashboard, Maestro, FIO, Informes, Config HK | Solo jefes + Admin/Adjunto |

Rutas especiales: Admin no tiene Mi Turno ni Info. Contable solo ve Validación + Dashboard. Adjunto tiene estructura propia con acceso completo a Manager Bar.

---

## 6. Reglas de acceso por departamento

- Un jefe solo accede a datos de sus departamentos (según `SUPERVISOR_DEPT_MAP`)
- Un empleado solo accede a sus propios turnos y datos de su departamento
- `canActAsAdmin` (admin + adjunto_directivo) accede a todo sin restricción
- Contable: acceso cross-departamento solo en pestaña Caja de Validación
- El filtrado es responsabilidad del frontend (JS). RLS es decorativo (61 policies `USING(true)` para anon)
- Nunca confiar en que Supabase filtre por rol

---

## 7. Identificadores de rol en código (actual)

```javascript
// shared.js — funciones definitivas
function isAdmin(user)           { return !!user && user.rol === 'admin'; }
function isAdjuntoDirectivo(user){ return !!user && (user.rol === 'adjunto' || user.rol === 'adjunto_directivo'); }
function canActAsAdmin(user)     { return isAdmin(user) || isAdjuntoDirectivo(user); }
function isContable(user)        { return !!user && user.rol === 'contable'; }
function isSupervisor(user)      { return !!user && (user.rol === 'jefe' || SUPERVISOR_DEPT_MAP.hasOwnProperty(user.rol)); }

// getScreens() — flag compuesto:
var isJefe = isAdminU || isAdjDir
  || (typeof isSupervisor === 'function' && isSupervisor(currentUser))
  || ['chef','fb','jefe_recepcion','supervisor','jefe',
      'coord_recepcion_syncrolab','coord_entrenadores',
      'coord_fisioterapeutas','gobernante',
      'jefe_mantenimiento','subgobernante'].indexOf(rol) >= 0;
```

**⚠ Las columnas `responsable` y `validador` en `employees` son legacy — NO se usan para detección de rol.**

---

## 8. Personal clave actual (jul 2026)

| Persona | Rol | Código | Nota |
|---|---|---|---|
| Alexander (CEO) | admin | `admin` | PIN 300415 |
| Angélica Camacho | Adjunta Directiva / RRHH | `adjunto_directivo` | Reemplaza a Natalia Khotuleva |
| José | Jefe de Sala | `fb` | Reemplaza a Stefan (despedido) |
| Andrés | Chef / Jefe de Cocina | `chef` | PIN 0101 |
| Juan Francisco Baena Espino | Jefe de Recepción Hotel | `jefe_recepcion` | |
| Sofía | Coordinadora Entrenadores | `coord_entrenadores` | |
| Carlos Marí Sendra | Contable | `contable` | Solo Caja + Dashboard |
| Carles Mari Seguí | Administrador | — | |
