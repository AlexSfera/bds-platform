# 19 — Preguntas Abiertas y Decisiones Pendientes

Las siguientes decisiones afectan al desarrollo y deben ser respondidas antes de implementar los módulos correspondientes.

---

## Roles y permisos

- `[NO DATA]` ¿Los jefes de departamento pueden ver el dashboard de otro departamento en modo solo lectura?
- `[NO DATA]` ¿Existe un rol "Validador" separado e independiente del jefe de departamento?
- `[NO DATA]` ¿Un empleado puede ver el historial de sus propias incidencias cerradas?
- `[NO DATA]` ¿Puede un empleado reasignar una tarea que le asignaron?

## Dashboard

- `[NO DATA]` ¿El administrador ve un dashboard global con todos los departamentos simultáneamente, o siempre filtra por uno?
- `[NO DATA]` ¿Hay exportación de datos a Excel o PDF? ¿Quién tiene acceso?
- `[NO DATA]` ¿Se necesita dashboard histórico (semanas/meses anteriores) o solo datos del día/semana actual?

## Caja SYNCROLAB

- `[NO DATA]` Estructura completa de campos para el cierre de caja de SYNCROLAB
- `[NO DATA]` ¿SYNCROLAB usa MEWS como referencia o su propio sistema (Nubimed)?
- `[NO DATA]` ¿Los cobros de SYNCROLAB se integran con el PMS del hotel?

## Integración Bitrix24

- `[NO DATA]` ¿Las tareas de SynchroHub se sincronizan con Bitrix24 o son independientes?
- `[NO DATA]` ¿La sincronización es unidireccional (SynchroHub → Bitrix) o bidireccional?
- `[NO DATA]` ¿Qué campos se sincronizan: título, estado, responsable, deadline?

## Integración MEWS

- `[NO DATA]` ¿Los datos de cash/tarjeta según MEWS se importan automáticamente o los introduce el empleado manualmente?
- `[NO DATA]` ¿Existe API de MEWS accesible para automatizar la importación de datos de caja?

## Merma

- `[NO DATA]` ¿La merma genera automáticamente una incidencia si supera un umbral?
- `[NO DATA]` ¿Existe un catálogo de productos para la merma o es texto libre?
- `[NO DATA]` ¿El coste estimado de merma se calcula automáticamente (precio × cantidad) o se introduce manualmente?

## Checklist

- `[NO DATA]` ¿Los checklists son editables desde Maestro o están hardcodeados en `checklist.js`?
- `[NO DATA]` ¿El checklist incompleto bloquea el cierre del turno o solo genera alerta?

## Notificaciones

- `[NO DATA]` ¿Existe sistema de notificaciones (email, push, WhatsApp) para incidencias críticas?
- `[NO DATA]` ¿Se notifica al jefe de departamento cuando se registra una incidencia de severidad Alta/Crítica?
- `[NO DATA]` ¿Se notifica cuando una tarea está próxima a vencer?

## Historial y archivo

- `[NO DATA]` ¿Cuántos meses de historial son visibles en dashboard?
- `[NO DATA]` ¿Los registros cerrados se archivan o permanecen en la tabla principal?
- `[NO DATA]` ¿Existe proceso de purga/archivo de datos antiguos?

## Módulos pendientes de crear

- `[PENDIENTE]` `cocina.js` — módulo específico de Cocina con merma y KPIs
- `[PENDIENTE]` `syncrolab.js` — módulo específico de SYNCROLAB con caja
- `[PENDIENTE]` `syncrolab_cash` — tabla Supabase para caja SYNCROLAB
- `[PENDIENTE]` Módulo de notificaciones
- `[PENDIENTE]` Exportación a CSV/Excel
- `[PENDIENTE]` Integración Bitrix24
