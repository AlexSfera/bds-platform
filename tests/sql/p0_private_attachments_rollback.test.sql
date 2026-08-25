do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'adjuntos' and public = true
      and file_size_limit is null and allowed_mime_types is null
  ) then raise exception 'bucket settings were not restored'; end if;

  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects') <> 4 then
    raise exception 'storage policies were not restored';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'adjuntos') <> 1 then
    raise exception 'stored objects changed during rollback';
  end if;
  if to_regclass('syncro_private.p0_adjuntos_policy_backup') is not null then
    raise exception 'policy backup table remains after rollback';
  end if;
end
$$;
