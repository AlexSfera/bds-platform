# ARCH-001 — Carga duplicada de adjuntos.js

## Estado

CONFIRMADA — RIESGO ALTO — PENDIENTE DE CORRECCIÓN

## Descripción

El archivo `adjuntos.js` se carga dos veces consecutivas al final de `index.html`.

La investigación confirma que no se trata únicamente de una duplicidad visual: la segunda carga vuelve a ejecutar la inicialización del módulo y vuelve a envolver funciones globales previamente modificadas.

## Evidencia verificada

### index.html

Se han verificado dos cargas consecutivas:

- `<script src="adjuntos.js"></script>`
- `<script src="adjuntos.js"></script>`

### Funciones afectadas

Wrappers:

- openNewGestionStandalone
- openNewIncidenciaStandalone
- openTaskModal
- _doSaveTurno
- saveTask
- saveNewGestionStandalone
- saveNewIncidenciaStandalone
- renderGestionesScreen

Reemplazos completos:

- renderIncidenciasScreen
- renderFollowupList

## Riesgo

`adjuntoUploadBatch()` no implementa deduplicación.

Cada subida genera una nueva ruta mediante `Date.now()`, por lo que una doble ejecución puede provocar:

- subida duplicada del mismo archivo;
- referencias duplicadas en la base de datos;
- auditorías duplicadas;
- ejecución duplicada de wrappers;
- múltiples MutationObserver activos.

## Acción

No modificar todavía.

Programar la corrección una vez finalizada la auditoría completa del proyecto.

La corrección prevista consistirá en eliminar únicamente una de las dos cargas consecutivas de `adjuntos.js` y realizar pruebas funcionales completas sobre turnos, incidencias, gestiones y tareas.
