# 02 — Estructura Global de la Aplicación

---

## 1. Pantallas principales

| Pantalla | Ruta/ID | Acceso |
|---|---|---|
| Login (PIN) | `#login` | Todos |
| Mi Turno | `#turno` | Todos |
| Validación | `#validacion` | Jefe Dpto · Admin |
| Dashboard | `#dashboard` | Jefe Dpto · Admin |
| Caja Sala | `#caja-sala` | Sala · Admin |
| Caja Recepción | `#caja-recepcion` | Recepción · Admin |
| Caja SYNCROLAB | `#caja-syncrolab` | SYNCROLAB · Admin |
| Housekeeping — Mi ruta | `#hk-ruta` | Housekeeping · Gobernanta · Admin |
| Housekeeping — Planificación | `#hk-planificacion` | Gobernanta · Admin |
| Compras necesarias | `#compras` | Mantenimiento · Admin |
| Maestro | `#maestro` | Admin |
| Info | `#info` | Todos (lectura) |

---

## 2. Ciclo de vida de un turno

```
ESTADO: sin_turno
    ↓ [Empleado abre Mi Turno y guarda]
ESTADO: pendiente
    ↓ [Jefe/Admin entra en Validación y valida]
ESTADO: validado
    ↓ [Jefe/Admin reabre]
ESTADO: pendiente  (ciclo reinicia)
```

---

## 3. Ciclo de vida de una incidencia

```
ESTADO: Abierta       → creada por empleado al guardar turno
    ↓ [Jefe/Admin desde Validación o Dashboard]
ESTADO: En proceso    → jefe está trabajando en ello
    ↓ [Jefe/Admin — requiere "Acción tomada" obligatoria]
ESTADO: Cerrada       → resuelta con registro de acción
    ↓ [Solo Admin — requiere motivo]
ESTADO: Abierta       → reapertura excepcional con audit_log
```

---

## 4. Ciclo de vida de una gestión pendiente

Idéntico al de incidencias. Ver `08_pending_managements.md`.

---

## 5. Ciclo de vida de una tarea

```
ESTADO: Pendiente     → creada
    ↓
ESTADO: En proceso    → asignado trabaja en ella
    ↓
ESTADO: Completada    → finalizada
    ↓ (si deadline superado sin completar)
ESTADO: Vencida       → calculado automáticamente en frontend
```

---

## 6. Estructura de archivos JS

```
Carga en index.html (orden de carga = orden de ejecución):

1. incidencia_tipos.js    → listas de tipos por departamento
2. checklist.js           → checklists por departamento y turno
3. caja.js                → lógica base de caja (genérica)
4. sala.js                → módulo Sala
5. recepcion.js           → módulo Recepción
6. [cocina.js]            → pendiente crear
7. [syncrolab.js]         → pendiente crear
8. [housekeeping.js]      → pendiente crear
9. dashboard.js           → dashboard completo
10. shared.js             → auth, DB helpers, Mi Turno genérico, topbar

IMPORTANTE: index.html se parsea al final y SOBREESCRIBE funciones
definidas en cualquier módulo cargado antes.
Verificar siempre antes de editar un módulo JS.
```

---

## 7. Sistema de caché

```javascript
// La caché almacena resultados de getDB() en memoria
// Se invalida manualmente tras cada escritura

await dbInsert('gestiones', record);
invalidateCache('gestiones');   // OBLIGATORIO

// Sin invalidateCache() el usuario verá datos antiguos
// hasta recargar la página
```

---

## 8. Sistema de toasts / feedback

Toda acción de escritura debe mostrar feedback al usuario:

```javascript
toast('Gestión pendiente registrada', 'ok');   // verde
toast('Error al guardar', 'err');              // rojo
toast('Cambios guardados', 'ok');
```

No mostrar errores técnicos de Supabase directamente. Traducir a mensajes comprensibles cuando sea posible.

---

## 9. Modales

Los modales son la unidad de interacción principal para acciones complejas:
- Modal de validación de turno
- Modal de cierre de incidencia / gestión
- Modal de creación de tarea
- Modal de FIO
- Modal de reabrir informe
- Modal de cierre de caja

**Reglas de modales:**
- Siempre fondo oscuro detrás
- Botón cerrar visible
- No se cierra con click fuera en acciones destructivas
- Scroll interno si el contenido es largo
- Responsive en móvil

---

## 10. Topbar — reglas generales

```
Izquierda: logo/nombre app · botones de módulos del departamento
Derecha:   Info · Icono+nombre departamento · Salir
```

La topbar se construye dinámicamente según `currentUser.area` y `currentUser.rol`.

```javascript
// Pseudocódigo de construcción de topbar
function buildTopbar(currentUser) {
  var btns = ['Mi Turno', 'Gestiones', 'Incidencias', 'Tareas'];

  if (deptTieneCaja(currentUser.area)) btns.push('Caja');
  if (currentUser.area === 'Mantenimiento') btns.push('Compras');
  if (currentUser.area === 'Housekeeping') {
    btns.push('Mi ruta');
    if (isGobernanta(currentUser)) btns.push('Planificación');
  }
  if (isSupervisorUser || isAdminUser) btns.push('Validación');
  if (isSupervisorUser || isAdminUser) btns.push('Dashboard');
}
```
