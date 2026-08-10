-- Isolated fixture for 202608100002. TEST ONLY.

begin;

alter table public.employees enable row level security;
grant all privileges on table public.employees to anon, authenticated, service_role;
drop policy if exists fixture_employees_open on public.employees;
create policy fixture_employees_open on public.employees for all
  to anon, authenticated using (true) with check (true);

create table if not exists public.employee_ips (
  id text primary key,
  employee_id text not null,
  ip text not null,
  active boolean not null default true
);
alter table public.employee_ips enable row level security;
grant all privileges on table public.employee_ips to anon, authenticated, service_role;
drop policy if exists fixture_employee_ips_open on public.employee_ips;
create policy fixture_employee_ips_open on public.employee_ips for all
  to anon, authenticated using (true) with check (true);

create table if not exists public.containment_demo (
  id bigint generated always as identity primary key,
  employee_id text not null,
  value text not null
);
alter table public.containment_demo enable row level security;
grant all privileges on table public.containment_demo to anon, authenticated, service_role;
grant all privileges on sequence public.containment_demo_id_seq to anon, authenticated, service_role;
drop policy if exists fixture_containment_demo_open on public.containment_demo;
create policy fixture_containment_demo_open on public.containment_demo for all
  to anon, authenticated using (true) with check (true);
insert into public.containment_demo (employee_id, value)
values ('E-001', 'before-cutover');

create or replace function public.sync_shifts_horas_from_bitrix()
returns table(updated_count integer)
language sql
as $$ select 0::integer $$;
grant execute on function public.sync_shifts_horas_from_bitrix()
  to public, anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'containment@local.test')
on conflict (id) do nothing;

insert into public.syncro_auth_identities (
  employee_id, auth_user_id, auth_email, active, force_pin_change,
  authz_version, pin_fingerprint
) values (
  'E-001', '11111111-1111-4111-8111-111111111111',
  'containment@local.test', true, false, 1, 'fixture-containment-fingerprint'
) on conflict (employee_id) do update set
  auth_user_id = excluded.auth_user_id,
  active = true,
  force_pin_change = false,
  authz_version = 1;

commit;
