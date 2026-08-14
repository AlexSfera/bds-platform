-- P0 SEC-012: prepare the existing adjuntos bucket for authenticated,
-- backend-mediated access. This migration intentionally does not modify any
-- object or attachment metadata stored in operational tables.
--
-- LIVE: PLANIFICADO. Do not apply until the application deployment using
-- signed URLs is Ready and the preflight below succeeds.

begin;

create schema if not exists syncro_private;
revoke all on schema syncro_private from public, anon, authenticated;
grant usage on schema syncro_private to service_role;

create table if not exists syncro_private.p0_adjuntos_bucket_backup (
  id text primary key,
  public boolean not null,
  file_size_limit bigint,
  allowed_mime_types text[],
  captured_at timestamptz not null default now()
);

create table if not exists syncro_private.p0_adjuntos_policy_backup (
  schemaname name not null,
  tablename name not null,
  policyname name not null,
  permissive text not null,
  roles name[] not null,
  cmd text not null,
  qual text,
  with_check text,
  captured_at timestamptz not null default now(),
  primary key (schemaname, tablename, policyname)
);

revoke all on syncro_private.p0_adjuntos_bucket_backup from public, anon, authenticated;
revoke all on syncro_private.p0_adjuntos_policy_backup from public, anon, authenticated;
grant select, insert, update, delete on syncro_private.p0_adjuntos_bucket_backup to service_role;
grant select, insert, update, delete on syncro_private.p0_adjuntos_policy_backup to service_role;

do $$
declare
  bucket_count integer;
  unsafe_policy_count integer;
begin
  select count(*) into bucket_count from storage.buckets where id = 'adjuntos';
  if bucket_count <> 1 then
    raise exception 'SEC-012 preflight failed: expected one adjuntos bucket, found %', bucket_count;
  end if;

  select count(*) into unsafe_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      coalesce(qual, '') ilike '%adjuntos%'
      or coalesce(with_check, '') ilike '%adjuntos%'
    )
    and not (
      coalesce(qual, '') ilike '%bucket_id%'
      or coalesce(with_check, '') ilike '%bucket_id%'
    );
  if unsafe_policy_count <> 0 then
    raise exception 'SEC-012 preflight failed: attachment policy without bucket scope';
  end if;
end
$$;

insert into syncro_private.p0_adjuntos_bucket_backup (
  id, public, file_size_limit, allowed_mime_types
)
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'adjuntos'
on conflict (id) do nothing;

insert into syncro_private.p0_adjuntos_policy_backup (
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    coalesce(qual, '') ilike '%adjuntos%'
    or coalesce(with_check, '') ilike '%adjuntos%'
  )
on conflict (schemaname, tablename, policyname) do nothing;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from syncro_private.p0_adjuntos_policy_backup
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]
where id = 'adjuntos';

commit;
