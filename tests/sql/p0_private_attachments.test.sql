do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'adjuntos' and public = false and file_size_limit = 10485760
      and 'image/jpeg' = any(allowed_mime_types)
      and 'application/pdf' = any(allowed_mime_types)
  ) then raise exception 'adjuntos bucket was not made private with limits'; end if;

  if exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ilike '%adjuntos%' or coalesce(with_check, '') ilike '%adjuntos%')
  ) then raise exception 'adjuntos policies remain active'; end if;

  if (select count(*) from syncro_private.p0_adjuntos_policy_backup) <> 4 then
    raise exception 'policy backup is incomplete';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'adjuntos') <> 1 then
    raise exception 'stored objects changed';
  end if;
end
$$;
