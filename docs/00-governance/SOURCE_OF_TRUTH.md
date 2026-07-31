# SYNCRO Shift — Fuentes oficiales de verdad

## 1. Objetivo

Este documento define qué fuente debe considerarse válida cuando existan contradicciones entre código, documentación, conversaciones, tareas o configuraciones del proyecto SYNCRO Shift.

## 2. Jerarquía técnica

La prioridad técnica es la siguiente:

1. Código aprobado en la rama `main` de GitHub.
2. Estructura real de Supabase y migraciones versionadas.
3. Documentación aprobada dentro del repositorio.
4. Decisiones registradas en documentos de arquitectura o ADR.
5. Tareas técnicas aprobadas.
6. Conversaciones de Claude o Codex.

Las conversaciones de Claude y Codex son material de trabajo. No sustituyen al código, a la documentación aprobada ni a una decisión registrada.

## 3. Jerarquía operativa y de negocio

La prioridad operativa es la siguiente:

1. Bitrix24 como fuente central de tareas, responsables, plazos y control de ejecución.
2. Reglas de negocio aprobadas y documentadas dentro del repositorio.
3. Configuración operativa real de SYNCRO Shift.
4. Conversaciones, mensajes o propuestas todavía no formalizadas.

Si una tarea, decisión o responsabilidad no está registrada en Bitrix24, no se considera oficialmente asignada ni controlada.

## 4. Sistemas oficiales

| Área | Fuente oficial |
|---|---|
| Código | GitHub |
| Rama estable | `main` |
| Base de datos | Supabase |
| Tareas y responsables | Bitrix24 |
| Despliegue | Vercel |
| Arquitectura técnica | Documentación aprobada en GitHub |
| Especificaciones funcionales | Documentación aprobada en GitHub |
| Historial técnico | Git |
| Conversaciones de apoyo | Claude y Codex |

## 5. Regla ante contradicciones

Cuando dos fuentes se contradigan:

1. No modificar el código inmediatamente.
2. Registrar la contradicción.
3. Verificar el comportamiento real.
4. Comparar código, base de datos y documentación.
5. Solicitar decisión humana cuando afecte reglas de negocio.
6. Actualizar la fuente incorrecta.
7. Registrar la decisión final.

## 6. Uso de Claude

Claude se utilizará principalmente para:

- arquitectura;
- análisis funcional;
- especificaciones;
- revisión técnica;
- análisis de errores complejos;
- detección de contradicciones;
- propuesta de soluciones.

Claude no debe asumir que su memoria o una conversación anterior representan el estado real del proyecto.

## 7. Uso de Codex

Codex se utilizará principalmente para:

- inspección del repositorio;
- implementación;
- modificación de archivos;
- creación y ejecución de pruebas;
- corrección de errores;
- refactorización controlada;
- generación de informes técnicos.

Codex debe verificar el código y la documentación antes de modificar archivos.

## 8. Regla de modificación

Durante una tarea concreta:

- solo un agente modifica el código;
- el otro agente puede revisar o proponer;
- Git registra todos los cambios;
- los cambios críticos requieren aprobación humana;
- ninguna funcionalidad se considera terminada sin validación.

## 9. Datos desconocidos

Cuando no exista información verificable, debe indicarse:

`[NO DATA]`

No se deben inventar estructuras, tablas, campos, integraciones, estados ni reglas de negocio.

## 10. Aprobación

Responsable funcional: Alexander Kolobnev

Estado del documento: BORRADOR

Fecha: 2026-07-31
