-- ═══════════════════════════════════════════════════════════════
-- SPRINT 2 — RECEPCIÓN + BUGS GLOBALES
-- Idempotente. Ejecutar en Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. COLUMNAS NUEVAS EN cash_closings (Recepción caja ampliada) ──
alter table public.cash_closings
  add column if not exists rec_transferencia_mews    numeric default 0,
  add column if not exists rec_transferencia_real    numeric default 0,
  add column if not exists diferencia_transferencia  numeric default 0,
  add column if not exists rec_room_charge           numeric default 0,
  add column if not exists rec_syncrolab_charge      numeric default 0,
  add column if not exists rec_desayunos_pension     integer default 0,
  add column if not exists rec_media_pension         integer default 0,
  add column if not exists rec_pension_completa      integer default 0,
  add column if not exists rec_cargo_alexander       numeric default 0,
  add column if not exists rec_cf_importe            numeric default 0,
  add column if not exists rec_fondo_esperado        numeric default 0;

-- ── 2. COLUMNAS FALTANTES EN incidencias (tiempo de gestión) ──
alter table public.incidencias
  add column if not exists cerrado_ts     text,
  add column if not exists cerrado_por    text,
  add column if not exists tiempo_gestion integer,
  add column if not exists accion_tomada  text;

-- ── 3. COLUMNAS FALTANTES EN tareas (tiempo de gestión) ──
alter table public.tareas
  add column if not exists tiempo_gestion  integer,
  add column if not exists completado_ts   text,
  add column if not exists completado_por  text,
  add column if not exists accion_tomada   text;

-- ── 4. shifts: columna area en caso de no existir ──
alter table public.shifts
  add column if not exists area text;

-- ── FIN ──
