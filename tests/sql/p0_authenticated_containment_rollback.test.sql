\set ON_ERROR_STOP on

select test_support.assert_true(
  has_table_privilege('anon', 'public.containment_demo', 'SELECT'),
  'rollback must restore prior anon operational SELECT'
);
select test_support.assert_true(
  has_table_privilege('anon', 'public.employees', 'SELECT'),
  'rollback must restore prior anon employees SELECT'
);
select test_support.assert_true(
  has_table_privilege('authenticated', 'public.employees', 'SELECT'),
  'rollback must restore prior authenticated employees SELECT'
);
select test_support.assert_true(
  has_sequence_privilege(
    'anon', 'public.containment_demo_id_seq', 'USAGE,SELECT'
  ),
  'rollback must restore prior anon sequence privileges'
);
select test_support.assert_true(
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'containment_demo'
       and policyname in (
         'syncro_valid_session_ceiling',
         'syncro_authenticated_containment'
       )
  ),
  'rollback must remove containment policies'
);
select test_support.assert_true(
  has_function_privilege(
    'anon', 'public.sync_shifts_horas_from_bitrix()', 'EXECUTE'
  ),
  'rollback must restore prior anon RPC execution'
);

select 'P0_AUTHENTICATED_CONTAINMENT_ROLLBACK_SQL_OK' as result;
