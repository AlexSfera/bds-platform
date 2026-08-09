-- SYNCRO SHIFT — local Supabase integration fixture.
-- TEST ONLY: this is not a production migration and must never be pushed to LIVE.

begin;

create table public.employees (
  id text primary key,
  nombre text not null,
  email text,
  area text not null,
  puesto text not null,
  rol text not null,
  estado text not null default 'Activo',
  responsable integer not null default 0,
  validador integer not null default 0,
  obs text not null default '',
  coste numeric not null default 0,
  pin text,
  fecha_alta date,
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;

revoke all on table public.employees from public, anon, authenticated;
grant select, insert, update, delete on table public.employees to service_role;

commit;
