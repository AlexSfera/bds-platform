\set ON_ERROR_STOP on

select test_support.assert_true(
  to_regclass('public.syncro_auth_identities') is not null,
  'syncro_auth_identities must exist'
);
select test_support.assert_true(
  to_regclass('public.syncro_auth_rate_buckets') is not null,
  'syncro_auth_rate_buckets must exist'
);
select test_support.assert_true(
  to_regclass('public.syncro_auth_audit') is not null,
  'syncro_auth_audit must exist'
);

select test_support.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.syncro_auth_identities'::regclass),
  'RLS must be enabled on identities'
);
select test_support.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.syncro_auth_rate_buckets'::regclass),
  'RLS must be enabled on rate buckets'
);
select test_support.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.syncro_auth_audit'::regclass),
  'RLS must be enabled on auth audit'
);

select test_support.assert_true(
  not has_table_privilege('anon', 'public.syncro_auth_identities', 'SELECT'),
  'anon must not read identities'
);
select test_support.assert_true(
  not has_table_privilege('authenticated', 'public.syncro_auth_identities', 'SELECT'),
  'authenticated must not read identities directly'
);
select test_support.assert_true(
  has_table_privilege('service_role', 'public.syncro_auth_identities', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role must manage identities'
);
select test_support.assert_true(
  has_function_privilege('authenticated', 'public.syncro_auth_context()', 'EXECUTE'),
  'authenticated must execute only the safe context function'
);
select test_support.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.syncro_auth_begin_login(text,text)',
    'EXECUTE'
  ),
  'authenticated must not execute rate-limit management functions'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'e1@auth.example.test'),
  ('00000000-0000-4000-8000-000000000002', 'e2@auth.example.test')
on conflict (id) do nothing;

insert into public.syncro_auth_identities (
  employee_id, auth_user_id, auth_email, active, force_pin_change,
  authz_version, pin_fingerprint, temporary_pin_expires_at
) values (
  'E-001', '00000000-0000-4000-8000-000000000001',
  'e1@auth.example.test', true, false, 1,
  repeat('a', 64), null
);

do $$
begin
  begin
    insert into public.syncro_auth_identities (
      employee_id, auth_user_id, auth_email, active, force_pin_change,
      authz_version, pin_fingerprint
    ) values (
      'E-002', '00000000-0000-4000-8000-000000000002',
      'E1@AUTH.EXAMPLE.TEST', true, false, 1, repeat('b', 64)
    );
    raise exception 'case-insensitive duplicate auth_email was accepted';
  exception when unique_violation then
    null;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.syncro_auth_identities (
      employee_id, auth_user_id, auth_email, active, force_pin_change,
      authz_version, pin_fingerprint
    ) values (
      'E-002', '00000000-0000-4000-8000-000000000002',
      'e2@auth.example.test', true, false, 1, repeat('a', 64)
    );
    raise exception 'duplicate PIN fingerprint was accepted';
  exception when unique_violation then
    null;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001',
  false
);
select set_config(
  'request.jwt.claims',
  '{"app_metadata":{"syncro_authz_version":"1"}}',
  false
);

set role authenticated;
select test_support.assert_true(
  public.syncro_auth_context() ->> 'employee_id' = 'E-001',
  'valid identity and authorization version must resolve context'
);
select test_support.assert_true(
  public.syncro_auth_context() ->> 'role' = 'empleado',
  'context must derive role from employees'
);

do $$
begin
  begin
    perform * from public.syncro_auth_identities;
    raise exception 'authenticated direct identity read was accepted';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.syncro_auth_begin_login('E-001', repeat('f', 64));
    raise exception 'authenticated rate-limit management call was accepted';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

set role anon;
do $$
begin
  begin
    perform * from public.syncro_auth_audit;
    raise exception 'anon auth audit read was accepted';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

update public.syncro_auth_identities
set force_pin_change = true,
    temporary_pin_expires_at = now() + interval '1 hour'
where employee_id = 'E-001';
set role authenticated;
select test_support.assert_true(
  public.syncro_auth_context() is null,
  'temporary identity must not receive application authorization context'
);
reset role;

update public.syncro_auth_identities
set force_pin_change = false,
    temporary_pin_expires_at = null
where employee_id = 'E-001';
select set_config(
  'request.jwt.claims',
  '{"app_metadata":{"syncro_authz_version":"2"}}',
  false
);
set role authenticated;
select test_support.assert_true(
  public.syncro_auth_context() is null,
  'stale authorization version must not resolve context'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"app_metadata":{"syncro_authz_version":"1"}}',
  false
);
update public.employees set estado = 'Baja' where id = 'E-001';
set role authenticated;
select test_support.assert_true(
  public.syncro_auth_context() is null,
  'inactive employee must not resolve context'
);
reset role;
update public.employees set estado = 'Activo' where id = 'E-001';

set role service_role;
select test_support.assert_true(
  (public.syncro_auth_begin_login('RATE-E', repeat('1', 64)) ->> 'allowed')::boolean,
  'first login attempt must be allowed'
);
select public.syncro_auth_begin_login('RATE-E', repeat('1', 64)) from generate_series(1, 9);
select test_support.assert_true(
  not (public.syncro_auth_begin_login('RATE-E', repeat('1', 64)) ->> 'allowed')::boolean,
  'eleventh employee attempt must be throttled'
);

select public.syncro_auth_begin_login('FAIL-E', repeat('2', 64));
select public.syncro_auth_finish_login('FAIL-E', repeat('2', 64), false, 'bad_pin')
from generate_series(1, 5);
select test_support.assert_true(
  not (public.syncro_auth_begin_login('FAIL-E', repeat('2', 64)) ->> 'allowed')::boolean,
  'five failures must lock the employee bucket'
);
select test_support.assert_true(
  (select count(*) > 0 from public.syncro_auth_audit),
  'throttling and failures must be audited'
);
reset role;

select test_support.assert_true(
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'syncro_auth_identities', 'syncro_auth_rate_buckets', 'syncro_auth_audit'
      )
      and grantee in ('anon', 'authenticated')
  ),
  'no direct auth-table grants may leak to browser roles'
);

select 'P0_AUTH_FOUNDATION_SQL_OK' as result;
