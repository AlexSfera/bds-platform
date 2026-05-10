# 03 — Roles y Permisos

---

## 1. Roles del sistema

| Rol | Código | Descripción |
|---|---|---|
| **Administrador** | `admin` | Acceso total a todos los departamentos y módulos |
| **Jefe de Recepción** | `jefe_recepcion` | Supervisor de Recepción Hotel |
| **Responsable de Sala / F&B Manager** | `fb` | Supervisor de Sala y Cocina |
| **Chef** | `chef` | Supervisor de Cocina y Friegue |
| **Responsable SYNCROLAB** | `coord_recepcion_syncrolab` | Supervisor SYNCROLAB |
| **Coordinador Entrenadores** | `coord_entrenadores` | Supervisor de Entrenadores |
| **Coordinador Fisioterapeutas** | `coord_fisioterapeutas` | Supervisor Clínica |
| **Gobernante/a** | `gobernante` | Supervisor Housekeeping |
| **Empleado** | `empleado` | Usuario operativo básico |

---

## 2. Departamentos por rol de supervisión

| Rol | Departamentos que supervisa |
|---|---|
| `admin` | Todos |
| `jefe_recepcion` | Recepción |
| `fb` | Sala · Cocina · Friegue |
| `chef` | Cocina · Friegue |
| `coord_recepcion_syncrolab` | Recepción SYNCROLAB |
| `coord_entrenadores` | Entrenadores · SYNCROLAB |
| `coord_fisioterapeutas` | Fisioterapeutas · Clínica |
| `gobernante` | Housekeeping · Limpieza |
| `empleado` | Solo su propio departamento (sin supervisión) |

---

## 3. Matriz de permisos

### 3.1 Mi Turno

| Acción | Empleado | Jefe Dpto | Admin |
|---|---|---|---|
| Ver turno propio | ✅ | ✅ | ✅ |
| Iniciar turno | ✅ | ✅ | ✅ |
| Completar checklist | ✅ | ✅ | ✅ |
| Registrar gestión pendiente | ✅ | ✅ | ✅ |
| Registrar incidencia operativa | ✅ | ✅ | ✅ |
| Crear tarea | ✅ | ✅ | ✅ |
| Cerrar turno | ✅ | ✅ | ✅ |
| Ver gestiones de su departamento | ✅ | ✅ | ✅ |
| **Gestionar / cerrar gestiones de su dpto** | ✅ | ✅ | ✅ |
| Ver incidencia propia (hasta cierre) | ✅ solo la suya | ✅ | ✅ |
| **Gestionar / cerrar incidencias** | ❌ | ✅ (su dpto) | ✅ |
| Ver tareas asignadas a su dpto | ✅ | ✅ | ✅ |
| **Gestionar / cerrar tareas de su dpto** | ✅ | ✅ | ✅ |
| Ver turnos de otros empleados | ❌ | ✅ (su dpto) | ✅ |

### 3.2 Caja

| Acción | Empleado | Jefe Dpto | Admin |
|---|---|---|---|
| Ver botón Caja en topbar | ✅ (si su dpto tiene caja) | ✅ (si su dpto tiene caja) | ✅ |
| Realizar cierre de caja | ✅ (su dpto) | ✅ (su dpto) | ✅ |
| Reabrir cierre de caja | ❌ | ✅ (su dpto) | ✅ |
| **Eliminar cierre de caja** | ❌ | ❌ | ✅ |
| Ver caja de otro departamento | ❌ | ❌ | ✅ |

### 3.3 Validación

| Acción | Empleado | Jefe Dpto | Admin |
|---|---|---|---|
| Ver módulo Validación | ❌ | ✅ (su dpto) | ✅ |
| Validar turno | ❌ | ✅ (su dpto) | ✅ |
| Reabrir turno validado | ❌ | ✅ (su dpto) | ✅ |
| Cambiar estado gestión en validación | ❌ | ✅ (su dpto) | ✅ |
| Cambiar estado incidencia en validación | ❌ | ✅ (su dpto) | ✅ |
| Cambiar estado tarea en validación | ❌ | ✅ (su dpto) | ✅ |
| Crear FIO en validación | ❌ | ✅ (su dpto) | ✅ |
| Revalidar FIO | ❌ | ✅ (su dpto) | ✅ |

### 3.4 Dashboard

| Acción | Empleado | Jefe Dpto | Admin |
|---|---|---|---|
| Ver dashboard | ❌ | ✅ (su dpto) | ✅ (todos) |
| Filtrar por departamento | ❌ | ❌ (fijo su dpto) | ✅ |
| **Eliminar gestión** | ❌ | ✅ (su dpto) | ✅ |
| **Eliminar incidencia** | ❌ | ✅ (su dpto) | ✅ |
| **Eliminar tarea** | ❌ | ❌ | ✅ |
| **Eliminar FIO** | ❌ | ❌ | ✅ |
| **Eliminar cierre de caja** | ❌ | ❌ | ✅ |
| Exportar datos | ❌ | ✅ (su dpto) | ✅ |

### 3.5 Maestro / Administración

| Acción | Empleado | Jefe Dpto | Admin |
|---|---|---|---|
| Acceder a Maestro | ❌ | ❌ | ✅ |
| Crear empleados | ❌ | ❌ | ✅ |
| Editar empleados | ❌ | ❌ | ✅ |
| Activar/desactivar empleados | ❌ | ❌ | ✅ |
| Gestionar tipologías | ❌ | ❌ | ✅ |
| Ver audit_log | ❌ | ❌ | ✅ |

---

## 4. Visibilidad por entidad — reglas de fila

Esta es la regla más importante para el filtrado de datos en frontend y futura RLS en Supabase.

### Gestiones

| Rol | Ve | Puede gestionar/cerrar |
|---|---|---|
| Empleado | Todas las gestiones de **su departamento** | ✅ Sí — todas las de su departamento |
| Jefe Dpto | Todas las gestiones de **su departamento** | ✅ Sí |
| Admin | Todas | ✅ Sí + eliminar |

### Incidencias

| Rol | Ve | Puede gestionar/cerrar |
|---|---|---|
| Empleado | **Solo las que él mismo creó** — hasta que estén cerradas | ❌ No — solo registra |
| Jefe Dpto | Todas las incidencias de **su departamento** | ✅ Sí |
| Admin | Todas | ✅ Sí + eliminar |

> Una incidencia cerrada desaparece de la vista del empleado que la creó.

### Tareas

| Rol | Ve | Puede gestionar/cerrar |
|---|---|---|
| Empleado (dpto **origen**) | ✅ Puede verla — es quien la creó | ❌ No gestiona |
| Empleado (dpto **destino**) | ✅ Ve todas las tareas asignadas a su dpto | ✅ Puede cambiar estado y cerrar |
| Jefe Dpto | Todas las tareas de su dpto (origen o destino) | ✅ Sí |
| Admin | Todas | ✅ Sí + eliminar |

---

## 5. Reglas de acceso por departamento

- Un jefe de departamento **solo** accede a datos de su departamento
- Un empleado **solo** accede a sus propios turnos y a los datos de su departamento
- El administrador accede a todo sin restricción de departamento
- La verificación se hace siempre en frontend comparando `currentUser.area` con el `departamento` del registro
- Nunca confiar en que Supabase filtre por rol — el filtrado es responsabilidad del frontend y de las RLS policies

---

## 6. Identificadores de rol en código

```javascript
var isAdminUser      = currentUser && currentUser.rol === 'admin';
var isSupervisorUser = currentUser && (
  currentUser.responsable === 1 ||
  currentUser.validador === 1 ||
  ['fb','chef','jefe_recepcion','gobernante',
   'coord_recepcion_syncrolab','coord_entrenadores',
   'coord_fisioterapeutas'].indexOf(currentUser.rol) !== -1
);
var isEmpleado = currentUser && !isAdminUser && !isSupervisorUser;
```

---

## 7. Visibilidad de elementos UI por rol

| Elemento UI | Condición de visibilidad |
|---|---|
| Botón "Caja" en topbar | `deptTieneCaja(currentUser.area)` |
| Botón "Cierre de Caja" | `deptTieneCaja(currentUser.area)` |
| Bloque Merma en Mi Turno | `deptTieneMerma(currentUser.area)` |
| Módulo Validación | `isSupervisorUser \|\| isAdminUser` |
| Dashboard | `isSupervisorUser \|\| isAdminUser` |
| Botón Eliminar (cualquier entidad) | `isAdminUser` (o jefe para gestiones de su dpto) |
| Botones En proceso / Cerrar en gestiones | `isSupervisorUser \|\| isAdminUser` |
| Botones En proceso / Cerrar en incidencias | `isSupervisorUser \|\| isAdminUser` |
| Maestro | `isAdminUser` |

---

## 8. Preguntas abiertas

- `[NO DATA]` — ¿Los jefes de departamento pueden ver el dashboard de otro departamento en modo lectura?
- `[NO DATA]` — ¿Existe rol "Validador" separado del jefe de departamento?
- `[NO DATA]` — ¿Un empleado puede ver sus propias incidencias cerradas en historial?
