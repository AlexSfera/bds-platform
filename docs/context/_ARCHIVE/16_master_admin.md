# 16 — Maestro / Administración

---

## 1. Acceso

Solo el rol `admin` puede acceder al módulo Maestro.

---

## 2. Funcionalidades

| Función | Descripción |
|---|---|
| Crear empleado | Nombre, puesto, área, rol, PIN, estado |
| Editar empleado | Todos los campos excepto ID |
| Activar / desactivar empleado | `estado: 'Activo' / 'Inactivo'` |
| Asignar departamento | Campo `area` en `employees` |
| Asignar rol | Campo `rol` en `employees` |
| Gestionar tipologías | Ver y editar listas de tipos de incidencia y gestión por departamento |
| Ver audit_log | Historial completo de operaciones destructivas |
| Exportar datos | `[NO DATA]` — pendiente definir formato y alcance |

---

## 3. Tabla: `employees`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | TEXT | Generado en cliente |
| `nombre` | TEXT | Nombre completo |
| `puesto` | TEXT | Puesto de trabajo |
| `area` | TEXT | Departamento — valor de `DEPT_CONFIG` |
| `rol` | TEXT | `admin` · `fb` · `chef` · `empleado` · etc |
| `pin` | TEXT | PIN de acceso (hash recomendado) |
| `estado` | TEXT | `'Activo'` · `'Inactivo'` |
| `responsable` | INTEGER | `1` = puede supervisar · `0` = no |
| `validador` | INTEGER | `1` = puede validar · `0` = no |
| `created_at` | TIMESTAMPTZ | Fecha creación |

---

## 4. Reglas

- Un empleado inactivo no puede hacer login
- No eliminar empleados — solo desactivar (preservar historial)
- El PIN no se muestra en claro — solo se verifica en login
- El cambio de departamento de un empleado afecta a su navegación inmediatamente
- Las tipologías de incidencia y gestión son gestionables desde Maestro o directamente en `incidencia_tipos.js`

---

## 5. Audit log

Toda operación destructiva registra en `audit_log`:

```javascript
await auditLog('EMPLEADO_DESACTIVAR',
  currentUser.nombre + ' desactivó empleado ' + empleadoId
);
```

El admin puede consultar el audit_log completo desde Maestro.
