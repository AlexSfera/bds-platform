-- SYNCRO SHIFT — P0 containment for the dynamic IP allowlist
-- Status: VERIFICADO locally and in LIVE on 2026-08-10.
-- DO NOT RUN IN LIVE WITHOUT EXPLICIT APPROVAL.
--
-- Compatibility goal before the full Auth/RLS cutover:
--   * keep anonymous SELECT temporarily so the current middleware can load
--     the existing allowlist with its publishable key;
--   * deny every non-SELECT table privilege to browser/public roles;
--   * keep full server-side access for service_role.
--
-- Expected temporary limitation: the legacy Maestro UI cannot add or remove
-- IPs until those actions are moved to an authenticated backend endpoint.

begin;

do $$
begin
  if to_regclass('public.employee_ips') is null then
    raise exception 'public.employee_ips does not exist';
  end if;
end;
$$;

alter table public.employee_ips enable row level security;

-- Remove every mutation-capable policy that applies to a browser/public role.
-- The loop avoids depending on the unknown LIVE policy name while preserving
-- policies that are exclusively server-side.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'employee_ips'
       and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       and roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute format(
      'drop policy %I on public.employee_ips',
      v_policy.policyname
    );
  end loop;
end;
$$;

-- LIVE preflight confirmed that anon/authenticated also held TRUNCATE,
-- REFERENCES and TRIGGER. Revoke the complete grant set, then add back only
-- the one privilege required by the legacy middleware.
revoke all privileges on table public.employee_ips
  from public, anon, authenticated;
grant select on table public.employee_ips to anon;
grant select, insert, update, delete on table public.employee_ips
  to service_role;

drop policy if exists syncro_employee_ips_legacy_read
  on public.employee_ips;
create policy syncro_employee_ips_legacy_read
  on public.employee_ips
  for select
  to anon
  using (true);

-- Fail the transaction if a public/browser mutation policy survived.
do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'employee_ips'
       and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       and roles && array['public', 'anon', 'authenticated']::name[]
  ) then
    raise exception 'browser mutation policy still applies to employee_ips';
  end if;

  if exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'employee_ips'
       and grantee in ('PUBLIC', 'anon', 'authenticated')
       and privilege_type <> 'SELECT'
  ) then
    raise exception 'a browser/public role still has non-SELECT grants on employee_ips';
  end if;
end;
$$;

commit;
