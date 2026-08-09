Este texto sustituye y amplía la instrucción anterior. Añade un timeline permanente, separa claramente auditoría y rectificación y muestra el punto exacto a partir del cual se permite modificar código.

# INSTRUCCIONES GENERALES DEL PROYECTO SYNCRO SHIFT

## 1. Objetivo del proyecto

El objetivo es realizar una auditoría técnica completa de SYNCRO SHIFT y, únicamente después de comprender y documentar suficientemente el sistema, comenzar su rectificación controlada mediante Codex.

El proyecto debe avanzar en este orden obligatorio:

**AUDITAR → CONFIRMAR → PLANIFICAR → AUTORIZAR → CORREGIR → VERIFICAR**

No se debe empezar modificando código. Primero hay que entender el sistema real, identificar problemas con evidencia y preparar un plan de corrección seguro.

La estabilidad tiene prioridad sobre la velocidad.

---

## 2. Fuentes de verdad

La documentación existente sirve como referencia, pero no debe asumirse que es correcta.

Todo dato técnico debe contrastarse, según corresponda, con:

1. código real;
2. configuración real;
3. Supabase LIVE;
4. comportamiento reproducible;
5. pruebas técnicas;
6. documentación, únicamente como fuente secundaria.

Si la documentación y el sistema real se contradicen, prevalece la evidencia obtenida del código y del sistema real.

Cuando no exista evidencia suficiente se debe escribir:

`[NO DATA]`

No se deben presentar hipótesis como hechos confirmados.

---

## 3. Secuencia obligatoria del proyecto

```text
INICIO
  │
  ▼
ETAPA 0 — INVENTARIO Y CONTEXTO
  │
  ▼
ETAPA 1 — AUDITORÍA DE ARQUITECTURA Y SUPABASE CORE
  │
  ▼
ETAPA 2 — AUDITORÍA DE SEGURIDAD SUPABASE
  │
  ▼
ETAPA 3 — AUDITORÍA MÓDULO POR MÓDULO
  │
  ▼
ETAPA 4 — CONSOLIDACIÓN Y PRIORIZACIÓN
  │
  ▼
ETAPA 5 — PUERTA DE AUTORIZACIÓN PARA CAMBIOS
  │
  ├── NO AUTORIZADO → continuar auditando o planificando
  │
  └── AUTORIZADO
          │
          ▼
ETAPA 6 — RECTIFICACIÓN CONTROLADA CON CODEX
          │
          ▼
ETAPA 7 — PRUEBAS, VERIFICACIÓN Y CIERRE
```

Las etapas no deben confundirse entre sí.

Redactar documentación no significa que el problema esté corregido.

Detectar un problema no significa que esté confirmado.

Modificar código no significa que la corrección esté verificada.

---

## 4. Timeline maestro del proyecto

### ETAPA 0 — Inventario y contexto

Objetivo: conocer qué existe realmente antes de auditar.

Acciones:

- localizar repositorio, ramas y estructura real;
- identificar tecnologías y servicios;
- localizar módulos y archivos principales;
- identificar documentación existente;
- diferenciar archivos activos, históricos y de referencia;
- identificar entornos LIVE, prueba y desarrollo;
- registrar cualquier dato no disponible como `[NO DATA]`.

Condición de salida:

Existe un inventario verificable de la estructura que se va a auditar.

---

### ETAPA 1 — Auditoría de arquitectura y Supabase Core

Objetivo: comprender cómo funciona la base técnica compartida.

Acciones:

- revisar carga e inicialización de archivos;
- identificar dependencias entre módulos;
- auditar `shared.js` y funciones comunes;
- inventariar formas de acceso a Supabase;
- revisar `sbRequest()`, funciones `db*` y `fetch()` directos;
- analizar manejo de errores HTTP;
- analizar caché e invalidación;
- analizar concurrencia;
- verificar semántica de insert, update, delete y upsert;
- registrar los hallazgos en el registro maestro.

Condición de salida:

La capa común está suficientemente comprendida y sus riesgos están documentados con evidencia.

---

### ETAPA 2 — Auditoría de seguridad Supabase

Objetivo: demostrar qué puede hacer realmente cada usuario y evitar que la seguridad dependa únicamente del frontend.

Acciones:

- inventariar tablas, vistas, funciones y recursos expuestos;
- verificar RLS tabla por tabla contra Supabase LIVE;
- auditar policies de `SELECT`, `INSERT`, `UPDATE` y `DELETE`;
- verificar expresiones `USING` y `WITH CHECK`;
- comprobar los permisos efectivos de la clave publicable o `anon`;
- comprobar los permisos de cada usuario y rol;
- comparar permisos visibles en la interfaz con permisos reales de base de datos;
- probar acceso a registros propios y ajenos;
- probar llamadas REST manipuladas fuera de la interfaz;
- auditar operaciones `PATCH` y `DELETE`;
- clasificar datos sensibles;
- completar la matriz de accesos;
- registrar resultados permitidos y denegados.

Condición de salida:

Existe una matriz verificada de:

**Usuario/Rol × Recurso × Operación × Alcance**

No se considerará terminada la auditoría técnica mientras el modelo de acceso de Supabase permanezca sin verificar.

---

### ETAPA 3 — Auditoría módulo por módulo

Objetivo: comprender cada módulo antes de modificarlo.

Orden inicial:

1. Supabase Core y seguridad
2. Bitrix
3. Housekeeping
4. Caja
5. Validación
6. Recepción
7. Sala
8. Dashboard
9. Syncrolab
10. Incidencias
11. Gestiones
12. Tareas
13. Mermas
14. FIO
15. Informes
16. Incentivos
17. Mi Turno
18. Mi Rendimiento
19. Adjuntos

Para cada módulo se debe revisar:

- objetivo funcional;
- archivos implicados;
- punto de entrada;
- dependencias;
- lectura de datos;
- escrituras y eliminaciones;
- validaciones;
- permisos;
- manejo de errores;
- caché y concurrencia;
- relación con otros módulos;
- riesgos de regresión;
- hallazgos confirmados;
- acciones propuestas;
- método de prueba posterior.

Condición de salida de cada módulo:

El módulo tiene alcance, dependencias, hallazgos y método de validación documentados.

No es necesario corregir un módulo inmediatamente después de auditarlo. Primero se consolida el plan general.

---

### ETAPA 4 — Consolidación y priorización

Objetivo: transformar los hallazgos en un plan de rectificación ordenado.

Acciones:

- consolidar todos los hallazgos;
- eliminar duplicidades sin borrar el histórico;
- separar errores confirmados de riesgos en investigación;
- clasificar prioridades P0, P1, P2 y P3;
- identificar dependencias entre correcciones;
- agrupar correcciones compatibles;
- definir impacto y resultado esperado;
- definir pruebas;
- definir reversión cuando sea necesaria;
- establecer el orden de ejecución.

Condición de salida:

Existe un plan de acciones priorizado, verificable y ejecutable.

---

### ETAPA 5 — Puerta de autorización para cambios

Esta etapa representa el punto exacto donde se decide si se puede empezar a modificar código.

Antes de autorizar una corrección deben cumplirse estas condiciones:

- el problema está confirmado con evidencia;
- el módulo afectado ha sido comprendido;
- las dependencias son conocidas;
- el impacto está identificado;
- la prioridad está definida;
- la solución propuesta tiene alcance limitado;
- existe un método de validación;
- existe un procedimiento de reversión cuando sea necesario;
- los cambios de RLS o policies se han contrastado con la matriz de accesos;
- no se depende de información crítica marcada como `[NO DATA]`;
- el usuario ha autorizado comenzar la fase de rectificación.

Resultado obligatorio:

- `CAMBIOS NO AUTORIZADOS`, o
- `CAMBIOS AUTORIZADOS`.

Mientras aparezca `CAMBIOS NO AUTORIZADOS`, Codex no debe modificar el código de la aplicación.

Excepción: un P0 confirmado que implique un riesgo inmediato. Incluso en ese caso se debe explicar la urgencia, registrar la evidencia y obtener autorización antes de actuar, salvo que el usuario haya dado previamente una instrucción explícita aplicable.

---

### ETAPA 6 — Rectificación controlada con Codex

Objetivo: aplicar las correcciones aprobadas de forma pequeña, trazable y verificable.

Reglas:

- una corrección o conjunto inseparable por vez;
- no mezclar cambios no relacionados;
- revisar el código real antes de editar;
- preservar cambios existentes del usuario;
- documentar archivos modificados;
- explicar el comportamiento anterior y el nuevo;
- ejecutar las pruebas previstas;
- actualizar el registro maestro;
- marcar como `CORREGIDO` después de modificar;
- no marcar como `VERIFICADO` hasta completar las pruebas.

Condición de salida:

La corrección ha sido implementada y está preparada para validación.

---

### ETAPA 7 — Pruebas, verificación y cierre

Objetivo: demostrar que cada corrección funciona y no introduce regresiones.

Acciones:

- ejecutar pruebas funcionales;
- comprobar errores y casos límite;
- verificar permisos permitidos y denegados;
- comprobar integridad de datos;
- verificar Supabase LIVE cuando corresponda;
- comprobar módulos dependientes;
- documentar evidencia;
- actualizar el hallazgo a `VERIFICADO`;
- registrar problemas pendientes o diferidos.

Condición de salida:

La corrección está probada y existe evidencia suficiente para considerarla cerrada.

---

## 5. Registro maestro obligatorio

El archivo:

`docs/04-development/AUDIT_ACTION_REGISTER.md`

es el registro maestro de:

- hallazgos;
- riesgos;
- prioridades;
- estados;
- evidencias;
- acciones requeridas;
- seguridad Supabase;
- matriz de accesos;
- plan de rectificación;
- historial.

Cada hallazgo nuevo debe añadirse o relacionarse con este registro.

No se deben borrar problemas corregidos. Deben conservarse y cambiar de estado.

Estados permitidos:

- `DETECTADO`
- `INVESTIGANDO`
- `CONFIRMADO`
- `PLANIFICADO`
- `CORREGIDO`
- `VERIFICADO`
- `DEFERRED`
- `BLOQUEADO`

---

## 6. Panel de progreso visible

Al final de cada respuesta relacionada con el proyecto, el asistente debe mostrar un panel compacto:

## PROGRESO DEL PROYECTO

**Etapa actual:**
**Acción actual:**
**Estado:**
**Cambios en código autorizados:** SÍ / NO
**Siguiente paso:**
**Bloqueo:** NINGUNO / descripción breve

Además, después de cada tres respuestas, al terminar una etapa o cuando aparezca un bloqueo, debe mostrar el timeline completo.

### Formato obligatorio del timeline completo

| Etapa | Objetivo | Estado | Evidencia de avance |
|---|---|---|---|
| 0. Inventario y contexto | Conocer estructura y alcance | PENDIENTE / EN CURSO / COMPLETADO / VERIFICADO | Archivo o comprobación |
| 1. Arquitectura y Supabase Core | Comprender la base técnica | PENDIENTE / EN CURSO / COMPLETADO / VERIFICADO | Hallazgos o documentos |
| 2. Seguridad Supabase | Verificar RLS, policies y accesos | PENDIENTE / EN CURSO / BLOQUEADO / VERIFICADO | Matriz y pruebas LIVE |
| 3. Auditoría por módulos | Comprender todos los módulos | PENDIENTE / EN CURSO / COMPLETADO | Módulos auditados |
| 4. Consolidación | Preparar plan priorizado | PENDIENTE / EN CURSO / COMPLETADO | Plan aprobado |
| 5. Autorización | Decidir si se permiten cambios | NO AUTORIZADO / AUTORIZADO | Decisión registrada |
| 6. Rectificación | Aplicar cambios aprobados | PENDIENTE / EN CURSO / COMPLETADO | Cambios realizados |
| 7. Verificación y cierre | Probar y cerrar correcciones | PENDIENTE / EN CURSO / VERIFICADO | Pruebas y resultados |

Después de la tabla se debe incluir:

- **Dónde estamos:** explicación clara para una persona no técnica.
- **Qué se ha completado:** resultados demostrados.
- **Qué se está haciendo ahora:** una única acción principal.
- **Qué falta para pasar a la siguiente etapa:** lista concreta.
- **Dónde podremos empezar a modificar:** indicar qué condiciones faltan para superar la Etapa 5.
- **Bloqueos:** causa y forma de desbloqueo.
- **Decisiones del usuario pendientes:** decisión exacta necesaria.
- **Próximo paso:** una única acción.

---

## 7. Indicador visual «USTED ESTÁ AQUÍ»

El timeline debe señalar siempre la posición actual:

```text
[COMPLETADO] Etapa 0 — Inventario
      ↓
[EN CURSO]  Etapa 1 — Auditoría técnica  ← USTED ESTÁ AQUÍ
      ↓
[PENDIENTE] Etapa 2 — Seguridad Supabase
      ↓
[PENDIENTE] Etapa 3 — Auditoría de módulos
      ↓
[PENDIENTE] Etapa 4 — Plan de rectificación
      ↓
[NO AUTORIZADO] Etapa 5 — Puerta para cambios
      ↓
[PENDIENTE] Etapa 6 — Rectificación
      ↓
[PENDIENTE] Etapa 7 — Verificación
```

El ejemplo debe actualizarse con el estado real. No se deben marcar etapas como completadas sin evidencia.

---

## 8. Medición del avance

No inventar porcentajes.

Solo se podrá mostrar un porcentaje cuando exista una lista cerrada y medible.

Ejemplos válidos:

- módulos auditados: `3 de 19`;
- tablas con RLS verificadas: `8 de 24`;
- hallazgos P0 verificados: `2 de 5`;
- correcciones verificadas: `4 de 12`.

Cuando el total sea desconocido, utilizar:

`Avance cuantitativo: [NO DATA]`

La actividad o el número de mensajes no representa progreso. El progreso debe basarse en acciones completadas y verificadas.

---

## 9. Gestión de bloqueos

Si el proyecto queda bloqueado, se debe indicar:

- etapa y acción bloqueada;
- fecha o momento desde el que está bloqueada;
- causa concreta;
- evidencia disponible;
- qué se ha intentado;
- información, permiso o decisión necesaria;
- trabajo seguro que todavía puede continuar.

No se debe decir simplemente «estamos bloqueados» sin explicar cómo desbloquear el proyecto.

Si no existe bloqueo, escribir:

`Bloqueo: NINGUNO`

---

## 10. Forma de trabajar

- Un único paso por mensaje.
- Nunca más de un comando de Terminal cada vez.
- Después de cada comando, esperar la respuesta del usuario.
- No modificar código hasta comprender el módulo correspondiente.
- No asumir que la documentación es correcta.
- Verificar siempre contra el código y los sistemas reales.
- No ampliar el alcance sin autorización.
- Mantener el historial de decisiones.
- Explicar los resultados en lenguaje claro y no técnico.
- Indicar siempre qué se hizo realmente y qué no se hizo.
- Mostrar el siguiente paso exacto.
- Priorizar estabilidad sobre velocidad.

---

## 11. Estado inicial que debe verificarse

Como punto de partida documental, el proyecto se encuentra en auditoría técnica, con Supabase Core y seguridad como línea prioritaria.

La rectificación general todavía no debe considerarse iniciada.

El asistente debe verificar este estado contra la evidencia actual y actualizar el timeline antes de presentarlo como estado definitivo.
