\set ON_ERROR_STOP on

select test_support.assert_true(
  not has_table_privilege('anon', 'public.containment_demo', 'SELECT'),
  'anon must lose operational table access'
);
select test_support.assert_true(
  not has_table_privilege('anon', 'public.employees', 'SELECT'),
  'anon must lose employees access'
);
select test_support.assert_true(
  not has_table_privilege('authenticated', 'public.employees', 'SELECT'),
  'authenticated browser users must not query employees directly'
);
select test_support.assert_true(
  not has_table_privilege('authenticated', 'public.employee_ips', 'SELECT'),
  'authenticated browser users must not query employee_ips directly'
);
select test_support.assert_true(
  has_table_privilege(
    'authenticated', 'public.containment_demo', 'SELECT,INSERT,UPDATE,DELETE'
  ),
  'authenticated role must retain interim operational DML'
);
select test_support.assert_true(
  exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'containment_demo'
       and policyname = 'syncro_valid_session_ceiling'
       and permissive = 'RESTRICTIVE'
  ),
  'every operational table needs a restrictive valid-session ceiling'
);
select test_support.assert_true(
  not has_function_privilege(
    'anon', 'public.sync_shifts_horas_from_bitrix()', 'EXECUTE'
  ),
  'orphan bulk-update RPC must be blocked for anon'
);
select test_support.assert_true(
  not has_function_privilege(
    'authenticated', 'public.sync_shifts_horas_from_bitrix()', 'EXECUTE'
  ),
  'orphan bulk-update RPC must be blocked for authenticated clients'
);
select test_support.assert_true(
  not has_table_privilege('anon', 'public.containment_demo_view', 'SELECT'),
  'anon must lose public view access explicitly'
);
select test_support.assert_true(
  has_table_privilege(
    'authenticated', 'public.containment_demo_view', 'SELECT'
  ),
  'authenticated must retain security-invoker view access'
);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set request.jwt.claims = '{"app_metadata":{"syncro_authz_version":1}}';

select test_support.assert_true(
  (select count(*) from public.containment_demo) = 1,
  'valid completed identity must read operational rows'
);
select test_support.assert_true(
  (select count(*) from public.containment_demo_view) = 1,
  'security-invoker view must preserve valid-session access'
);
insert into public.containment_demo (employee_id, value)
values ('E-001', 'valid-session-write');

do $$
begin
  begin
    perform count(*) from public.employees;
    raise exception 'authenticated direct employees SELECT was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set request.jwt.claims = '{"app_metadata":{"syncro_authz_version":1}}';

select test_support.assert_true(
  (select count(*) from public.containment_demo) = 0,
  'unknown authenticated user must see no operational rows'
);
select test_support.assert_true(
  (select count(*) from public.containment_demo_view) = 0,
  'security-invoker view must preserve the session ceiling'
);

do $$
begin
  begin
    insert into public.containment_demo (employee_id, value)
    values ('E-UNKNOWN', 'blocked');
    raise exception 'unknown authenticated identity INSERT was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select 'P0_AUTHENTICATED_CONTAINMENT_SQL_OK' as result;
