-- SYNCRO SHIFT — authenticated containment for operational public tables
-- Status: VERIFICADO locally on 2026-08-10; not yet applied to LIVE.
--
-- Goal: remove anonymous browser access while preserving the current feature
-- surface for valid, fully-onboarded employees. This is an interim ceiling;
-- table-specific role/row policies from P0_RLS_ACCESS_MATRIX remain required.

begin;

create schema if not exists syncro_private;
revoke all on schema syncro_private from public, anon, authenticated;
grant usage on schema syncro_private to service_role;

create table if not exists syncro_private.p0_cutover_table_grants (
  migration_id text not null,
  table_name text not null,
  grantee text not null,
  privilege_type text not null,
  primary key (migration_id, table_name, grantee, privilege_type)
);

create table if not exists syncro_private.p0_cutover_sequence_grants (
  migration_id text not null,
  sequence_name text not null,
  grantee text not null,
  privilege_type text not null,
  primary key (migration_id, sequence_name, grantee, privilege_type)
);

revoke all on all tables in schema syncro_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema syncro_private to service_role;

insert into syncro_private.p0_cutover_table_grants (
  migration_id, table_name, grantee, privilege_type
)
select '202608100002', table_name, grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public'
   and grantee in ('PUBLIC', 'anon', 'authenticated')
on conflict do nothing;

insert into syncro_private.p0_cutover_sequence_grants (
  migration_id, sequence_name, grantee, privilege_type
)
select '202608100002', object_name, grantee, privilege_type
  from information_schema.usage_privileges
 where object_schema = 'public'
   and object_type = 'SEQUENCE'
   and grantee in ('PUBLIC', 'anon', 'authenticated')
on conflict do nothing;

do $cutover$
declare
  resource record;
  context_expression constant text := '(select public.syncro_auth_context()) is not null';
begin
  for resource in
    select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname not like 'syncro_auth_%'
     order by c.relname
  loop
    execute format('alter table public.%I enable row level security', resource.table_name);
    execute format(
      'drop policy if exists syncro_valid_session_ceiling on public.%I',
      resource.table_name
    );
    execute format(
      'create policy syncro_valid_session_ceiling on public.%I as restrictive for all to public using (%s) with check (%s)',
      resource.table_name, context_expression, context_expression
    );
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      resource.table_name
    );

    if resource.table_name not in ('employees', 'employee_ips') then
      execute format(
        'drop policy if exists syncro_authenticated_containment on public.%I',
        resource.table_name
      );
      execute format(
        'create policy syncro_authenticated_containment on public.%I as permissive for all to authenticated using (%s) with check (%s)',
        resource.table_name, context_expression, context_expression
      );
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        resource.table_name
      );
    else
      execute format(
        'drop policy if exists syncro_authenticated_containment on public.%I',
        resource.table_name
      );
    end if;
  end loop;

  for resource in
    select c.relname as sequence_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'S'
       and c.relname not like 'syncro_auth_%'
  loop
    execute format(
      'revoke all privileges on sequence public.%I from public, anon, authenticated',
      resource.sequence_name
    );
    execute format(
      'grant usage, select on sequence public.%I to authenticated',
      resource.sequence_name
    );
  end loop;

  for resource in
    select c.relname as view_name,
           c.relkind,
           coalesce(c.reloptions @> array['security_invoker=true'], false)
             as security_invoker
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      resource.view_name
    );
    if resource.relkind = 'v' and resource.security_invoker then
      execute format(
        'grant select on table public.%I to authenticated',
        resource.view_name
      );
    end if;
  end loop;
end;
$cutover$;

do $rpc$
begin
  if to_regprocedure('public.sync_shifts_horas_from_bitrix()') is not null then
    revoke all on function public.sync_shifts_horas_from_bitrix()
      from public, anon, authenticated;
    grant execute on function public.sync_shifts_horas_from_bitrix()
      to service_role;
  end if;
end;
$rpc$;

notify pgrst, 'reload schema';

commit;
