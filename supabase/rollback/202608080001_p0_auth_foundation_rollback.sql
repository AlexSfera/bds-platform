-- SYNCRO SHIFT — PRE-CUTOVER rollback for 202608080001_p0_auth_foundation.sql
-- Status: PLANIFICADO. Do not run in LIVE without explicit approval.
-- DESTRUCTIVE FOR NEW AUTH AUDIT/RATE DATA: use only before cutover, after
-- disabling SYNCRO_AUTH_ENABLED and confirming that no real session depends on
-- these objects. This script does not delete users from auth.users.

begin;

revoke all on function public.syncro_auth_context()
  from public, anon, authenticated, service_role;
revoke all on function public.syncro_auth_finish_login(text, text, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.syncro_auth_begin_login(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.syncro_auth_reserve_bucket(text, text, integer, interval)
  from public, anon, authenticated, service_role;

drop function if exists public.syncro_auth_context();
drop function if exists public.syncro_auth_finish_login(text, text, boolean, text);
drop function if exists public.syncro_auth_begin_login(text, text);
drop function if exists public.syncro_auth_reserve_bucket(text, text, integer, interval);

drop table if exists public.syncro_auth_audit;
drop table if exists public.syncro_auth_rate_buckets;
drop table if exists public.syncro_auth_identities;

commit;
