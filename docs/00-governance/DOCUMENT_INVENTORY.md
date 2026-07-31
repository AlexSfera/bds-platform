# SYNCRO SHIFT — Inventario inicial de documentación y repositorio

## Control

- Repositorio analizado: `syncro_hub`
- Rama detectada: `main`
- Fecha del inventario: 2026-07-31
- Estado: inventario técnico inicial; contenido todavía no validado módulo por módulo

## Hallazgos críticos iniciales

1. El repositorio contiene cambios locales sin commit: documentos modificados, eliminados y nuevos.
2. La carpeta `.git` y `.claude/settings.local.json` fueron incluidas en el ZIP. No deben formar parte de futuros paquetes de transferencia.
3. No se detectaron `package.json`, configuración de tests ni migraciones SQL versionadas en la raíz analizada. Estado de build y pruebas: `[NO DATA]`.
4. Existen documentos activos y una carpeta `_ARCHIVE`; todavía debe verificarse si el archivo archivado fue sustituido realmente por documentación vigente.
5. El código es una aplicación JavaScript de gran tamaño, con `shared.js` como archivo central de aproximadamente 5.442 líneas. Esto supone riesgo de acoplamiento y debe documentarse antes de refactorizar.

## Inventario documental

| ID | Archivo | Área | Líneas | Estado preliminar | Título |
|---|---|---:|---:|---|---|
| DOC-001 | docs/context/00_overview.md | General | 150 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 00 — Overview: SYNCRO SHIFT |
| DOC-002 | docs/context/03_roles_permissions.md | Roles y permisos | 237 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 03 — Roles y Permisos |
| DOC-003 | docs/context/04_departments.md | Departamentos | 159 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 04 — Departamentos |
| DOC-004 | docs/context/05_shifts_and_checklists.md | Turnos | 183 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 05 — Turnos (Shifts) y Checklists |
| DOC-005 | docs/context/07_incidents.md | Incidencias | 88 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 07 — Incidencias Operativas |
| DOC-006 | docs/context/08_pending_managements.md | General | 108 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 08 — Gestiones Pendientes |
| DOC-007 | docs/context/09_tasks.md | Tareas | 124 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 09 — Tareas |
| DOC-008 | docs/context/10_caja_all.md | Caja | 283 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 10 — Caja: Sala · Recepción Hotel · SYNCROLAB |
| DOC-009 | docs/context/13_kitchen_waste.md | Merma | 170 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 13 — Merma (Cocina · Friegue · FnB) |
| DOC-010 | docs/context/14_validations.md | Validaciones | 244 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 14 — Validaciones |
| DOC-011 | docs/context/20_housekeeping.md | Housekeeping | 271 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 20 — Módulo Housekeeping |
| DOC-012 | docs/context/21_maintenance_purchases.md | Mantenimiento | 155 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | 21 — Mantenimiento — Kanban de Tareas |
| DOC-013 | docs/context/22_auto_turno_assignment.md | Turnos | 153 | RECIENTE · VALIDAR IMPLEMENTACIÓN | 22 — FEAT-TURNO-AUTO · Asignación automática de turno |
| DOC-014 | docs/context/23_feat_turno_auto_implementacion.md | Turnos | 135 | RECIENTE · VALIDAR IMPLEMENTACIÓN | 23 — FEAT-TURNO-AUTO · Implementación (addendum a spec 22) |
| DOC-015 | docs/context/_ARCHIVE/01_architecture.md | Arquitectura | 261 | ARCHIVADO / REVISAR | 01 — Arquitectura Técnica |
| DOC-016 | docs/context/_ARCHIVE/02_global_app_structure.md | Arquitectura | 166 | ARCHIVADO / REVISAR | 02 — Estructura Global de la Aplicación |
| DOC-017 | docs/context/_ARCHIVE/15_dashboard.md | Dashboard | 199 | ARCHIVADO / REVISAR | 15 — Dashboard |
| DOC-018 | docs/context/_ARCHIVE/16_master_admin.md | General | 63 | ARCHIVADO / REVISAR | 16 — Maestro / Administración |
| DOC-019 | docs/context/_ARCHIVE/17_sql_data_model.md | Datos | 412 | ARCHIVADO / REVISAR | 17 — Modelo de Datos SQL |
| DOC-020 | docs/context/_ARCHIVE/18_qa_checklist.md | QA | 173 | ARCHIVADO / REVISAR | 18 — QA Checklist |
| DOC-021 | docs/context/_ARCHIVE/19_open_questions.md | General | 67 | ARCHIVADO / REVISAR | 19 — Preguntas Abiertas y Decisiones Pendientes |
| DOC-022 | docs/context/_ARCHIVE/SYNCRO_HUB_ARCHITECTURE N.md | Arquitectura | 593 | ARCHIVADO / REVISAR | SYNCRO HUB — Arquitectura y Reglas de Desarrollo |
| DOC-023 | docs/context/esquema-supabase.md | Datos | 125 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | Esquema Supabase — SYNCRO SHIFT |
| DOC-024 | docs/context/mapa-modulos.md | Módulos | 189 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | Mapa de Módulos — SYNCRO SHIFT |
| DOC-025 | docs/context/trampas.md | Riesgos técnicos | 70 | ACTIVO · NO VERIFICADO CONTRA CÓDIGO | Trampas Confirmadas — SYNCRO SHIFT |

## Inventario de código principal

| Archivo | Líneas | Caracteres |
|---|---:|---:|
| `adjuntos.js` | 984 | 46444 |
| `api/bitrix-sync.js` | 567 | 25248 |
| `api/send-email.js` | 150 | 7967 |
| `bitrix-sync.js` | 723 | 34253 |
| `caja.js` | 1686 | 96398 |
| `checklist.js` | 490 | 27793 |
| `dashboard.js` | 1570 | 79579 |
| `faults.js` | 487 | 24515 |
| `fichaje.js` | 835 | 35493 |
| `fio.js` | 965 | 50937 |
| `gestiones.js` | 213 | 12325 |
| `housekeeping.js` | 2310 | 109273 |
| `hypoxic.js` | 364 | 19992 |
| `incentivos.js` | 1275 | 63179 |
| `incidencia_tipos.js` | 402 | 11936 |
| `incidencias.js` | 217 | 11565 |
| `index.html` | 2527 | 179539 |
| `informes.js` | 2096 | 120312 |
| `mantenimiento.js` | 447 | 23375 |
| `merma.js` | 565 | 24594 |
| `mi_rendimiento.js` | 934 | 53138 |
| `mi_turno.js` | 1440 | 83210 |
| `middleware.js` | 189 | 6417 |
| `recepcion.js` | 2039 | 109679 |
| `sala.js` | 180 | 8039 |
| `shared.js` | 5442 | 295044 |
| `syncrolab.js` | 730 | 51632 |
| `tareas.js` | 362 | 19079 |
| `validacion.js` | 2436 | 136055 |
| `vercel.json` | 19 | 292 |

## Estado Git observado

```text
## main...origin/main
 M docs/context/00_overview.md
 D docs/context/01_architecture.md
 D docs/context/02_global_app_structure.md
 M docs/context/03_roles_permissions.md
 M docs/context/04_departments.md
 M docs/context/05_shifts_and_checklists.md
 M docs/context/07_incidents.md
 M docs/context/08_pending_managements.md
 M docs/context/09_tasks.md
 D docs/context/10_11_12_cash_closures.md
 M docs/context/13_kitchen_waste.md
 M docs/context/14_validations.md
 D docs/context/15_dashboard.md
 D docs/context/16_master_admin.md
 D docs/context/17_sql_data_model.md
 D docs/context/18_qa_checklist.md
 D docs/context/19_open_questions.md
 M docs/context/20_housekeeping.md
 M docs/context/21_maintenance_purchases.md
 D "docs/context/Caja SyncroLab.md"
 D "docs/context/SYNCRO_HUB_ARCHITECTURE N.md"
 D docs/context/caja_sala_spec.md
?? .claude/
?? docs/context/10_caja_all.md
?? docs/context/_ARCHIVE/
```

## Próxima validación obligatoria

Comparar, uno por uno, los documentos de producto y arquitectura con el código real, comenzando por `00_overview.md`, `mapa-modulos.md`, `esquema-supabase.md` y los documentos archivados de arquitectura.
