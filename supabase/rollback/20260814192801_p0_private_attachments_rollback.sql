-- Roll back the SEC-012 bucket containment without modifying stored objects.
-- DO NOT RUN IN LIVE WITHOUT EXPLICIT APPROVAL.

begin;

do $$
declare
  backup_count integer;
  policy_row record;
  role_list text;
  statement text;
begin
  select count(*) into backup_count
  from syncro_private.p0_adjuntos_bucket_backup
  where id = 'adjuntos';
  if backup_count <> 1 then
    raise exception 'SEC-012 rollback preflight failed: bucket backup missing';
  end if;

  for policy_row in
    select * from syncro_private.p0_adjuntos_policy_backup
    order by policyname
  loop
    select string_agg(case when role_name = 'public' then 'public' else quote_ident(role_name) end, ', ')
      into role_list
    from unnest(policy_row.roles::text[]) as policy_roles(role_name);

    statement := format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      policy_row.permissive,
      policy_row.cmd,
      role_list
    );
    if policy_row.qual is not null then
      statement := statement || ' using (' || policy_row.qual || ')';
    end if;
    if policy_row.with_check is not null then
      statement := statement || ' with check (' || policy_row.with_check || ')';
    end if;
    execute statement;
  end loop;
end
$$;

update storage.buckets as bucket
set public = backup.public,
    file_size_limit = backup.file_size_limit,
    allowed_mime_types = backup.allowed_mime_types
from syncro_private.p0_adjuntos_bucket_backup as backup
where bucket.id = backup.id
  and bucket.id = 'adjuntos';

drop table syncro_private.p0_adjuntos_policy_backup;
drop table syncro_private.p0_adjuntos_bucket_backup;

commit;
