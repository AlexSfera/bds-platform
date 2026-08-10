\set ON_ERROR_STOP on

select test_support.assert_true(
  to_regclass('public.employee_ips') is not null,
  'employee_ips must exist'
);
select test_support.assert_true(
  (select relrowsecurity
     from pg_class
    where oid = 'public.employee_ips'::regclass),
  'RLS must be enabled on employee_ips'
);
select test_support.assert_true(
  has_table_privilege('anon', 'public.employee_ips', 'SELECT'),
  'anon SELECT must remain available to the legacy middleware'
);
select test_support.assert_true(
  not exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'employee_ips'
       and grantee = 'anon'
       and privilege_type <> 'SELECT'
  ),
  'all anon non-SELECT privileges must be revoked'
);
select test_support.assert_true(
  not exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'employee_ips'
       and grantee = 'authenticated'
  ),
  'all authenticated table privileges must be revoked'
);
select test_support.assert_true(
  not exists (
    select 1
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'employee_ips'
       and grantee = 'PUBLIC'
  ),
  'PUBLIC must not retain table privileges'
);
select test_support.assert_true(
  has_table_privilege(
    'service_role', 'public.employee_ips', 'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service_role must retain full server-side access'
);
select test_support.assert_true(
  exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'employee_ips'
       and policyname = 'syncro_employee_ips_legacy_read'
       and cmd = 'SELECT'
       and roles = array['anon']::name[]
       and qual = 'true'
  ),
  'the temporary anon SELECT policy must exist'
);
select test_support.assert_true(
  not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'employee_ips'
       and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       and roles && array['public', 'anon', 'authenticated']::name[]
  ),
  'no browser/public mutation policy may remain'
);

set role anon;
select test_support.assert_true(
  (select count(*) from public.employee_ips) = 1,
  'anon must still read the existing allowlist'
);

do $$
begin
  begin
    insert into public.employee_ips (
      id, employee_id, nombre, ip, active
    ) values (
      'IP-ANON-BLOCKED', 'EMP-ANON', 'Blocked', '203.0.113.11', true
    );
    raise exception 'anon INSERT was accepted';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.employee_ips
       set active = false
     where id = 'IP-FIXTURE-1';
    raise exception 'anon UPDATE was accepted';
  exception when insufficient_privilege then
    null;
  end;

  begin
    delete from public.employee_ips where id = 'IP-FIXTURE-1';
    raise exception 'anon DELETE was accepted';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

set role service_role;
insert into public.employee_ips (
  id, employee_id, nombre, ip, active
) values (
  'IP-SERVICE-OK', 'EMP-SERVICE', 'Service', '203.0.113.12', true
);
update public.employee_ips set active = false where id = 'IP-SERVICE-OK';
delete from public.employee_ips where id = 'IP-SERVICE-OK';
reset role;

select 'P0_EMPLOYEE_IPS_CONTAINMENT_SQL_OK' as result;
