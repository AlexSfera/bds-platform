\set ON_ERROR_STOP on

select test_support.assert_true(
  to_regclass('public.syncro_auth_identities') is null,
  'rollback must remove identities table'
);
select test_support.assert_true(
  to_regclass('public.syncro_auth_rate_buckets') is null,
  'rollback must remove rate buckets table'
);
select test_support.assert_true(
  to_regclass('public.syncro_auth_audit') is null,
  'rollback must remove auth audit table'
);
select test_support.assert_true(
  to_regprocedure('public.syncro_auth_context()') is null,
  'rollback must remove safe context function'
);
select test_support.assert_true(
  to_regprocedure('public.syncro_auth_begin_login(text,text)') is null,
  'rollback must remove login gate function'
);

select 'P0_AUTH_ROLLBACK_SQL_OK' as result;
