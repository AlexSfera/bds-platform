\set ON_ERROR_STOP on

-- Minimal Supabase-compatible fixture for the additive P0 Auth migration.
-- This file is test-only: it creates no operational SYNCRO SHIFT data.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin noinherit';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin noinherit';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin noinherit bypassrls';
  end if;
end;
$$;

alter role service_role bypassrls;

create schema if not exists auth;
grant usage on schema auth to authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

grant execute on function auth.uid() to authenticated, service_role;
grant execute on function auth.jwt() to authenticated, service_role;

create table if not exists public.employees (
  id text primary key,
  nombre text not null,
  area text not null,
  puesto text not null,
  rol text not null,
  responsable integer not null default 0,
  validador integer not null default 0,
  estado text not null
);

insert into public.employees (
  id, nombre, area, puesto, rol, responsable, validador, estado
) values
  ('E-001', 'Empleado Test', 'Sala', 'Camarero', 'empleado', 0, 0, 'Activo'),
  ('E-002', 'Supervisor Test', 'Sala', 'Jefe de Sala', 'jefe', 1, 1, 'Activo')
on conflict (id) do update set
  nombre = excluded.nombre,
  area = excluded.area,
  puesto = excluded.puesto,
  rol = excluded.rol,
  responsable = excluded.responsable,
  validador = excluded.validador,
  estado = excluded.estado;

create schema if not exists test_support;

create or replace function test_support.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

grant usage on schema test_support to anon, authenticated, service_role;
grant execute on function test_support.assert_true(boolean, text)
  to anon, authenticated, service_role;
