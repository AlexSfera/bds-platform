-- SYNCRO SHIFT — isolated local fixture for employee_ips containment.
-- TEST ONLY: never apply this file to LIVE.

begin;

create schema if not exists test_support;
create or replace function test_support.assert_true(
  condition boolean,
  message text
) returns void
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

create table public.employee_ips (
  id text primary key,
  employee_id text not null,
  nombre text not null default '',
  ip text not null,
  label text not null default '',
  active boolean not null default true,
  ts timestamptz
);

alter table public.employee_ips enable row level security;
-- Reproduce the broad LIVE browser-role grants confirmed by the preflight
-- snapshot, including TRUNCATE, REFERENCES and TRIGGER.
grant all privileges on table public.employee_ips
  to anon, authenticated, service_role;

create policy fixture_employee_ips_open
  on public.employee_ips
  for all
  to anon, authenticated
  using (true)
  with check (true);

insert into public.employee_ips (
  id, employee_id, nombre, ip, active, ts
) values (
  'IP-FIXTURE-1', 'EMP-FIXTURE-1', 'Fixture', '203.0.113.10', true, now()
);

commit;
