-- Emergency rollback for 202608100002 authenticated containment.
-- Status: VERIFICADO locally. Applying this reopens the previous anon access.

begin;

do $rollback$
declare
  resource record;
begin
  for resource in
    select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname not like 'syncro_auth_%'
  loop
    execute format(
      'drop policy if exists syncro_valid_session_ceiling on public.%I',
      resource.table_name
    );
    execute format(
      'drop policy if exists syncro_authenticated_containment on public.%I',
      resource.table_name
    );
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      resource.table_name
    );
  end loop;

  for resource in
    select c.relname as view_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      resource.view_name
    );
  end loop;

  for resource in
    select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) privileges
      from syncro_private.p0_cutover_table_grants
     where migration_id = '202608100002'
     group by table_name, grantee
  loop
    execute format(
      'grant %s on table public.%I to %s',
      resource.privileges,
      resource.table_name,
      case when resource.grantee = 'PUBLIC'
        then 'public'
        else quote_ident(resource.grantee)
      end
    );
  end loop;

  for resource in
    select c.relname as sequence_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format(
      'revoke all privileges on sequence public.%I from public, anon, authenticated',
      resource.sequence_name
    );
  end loop;

  for resource in
    select sequence_name, grantee,
           string_agg(privilege_type, ', ' order by privilege_type) privileges
      from syncro_private.p0_cutover_sequence_grants
     where migration_id = '202608100002'
     group by sequence_name, grantee
  loop
    execute format(
      'grant %s on sequence public.%I to %s',
      resource.privileges,
      resource.sequence_name,
      case when resource.grantee = 'PUBLIC'
        then 'public'
        else quote_ident(resource.grantee)
      end
    );
  end loop;
end;
$rollback$;

do $rpc$
begin
  if to_regprocedure('public.sync_shifts_horas_from_bitrix()') is not null then
    grant execute on function public.sync_shifts_horas_from_bitrix()
      to public, anon, authenticated;
  end if;
end;
$rpc$;

notify pgrst, 'reload schema';

commit;
