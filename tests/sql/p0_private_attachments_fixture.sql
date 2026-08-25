-- TEST ONLY: minimal Supabase Storage catalog for SEC-012 migration tests.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (id bigint primary key, bucket_id text not null, name text not null);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', true);
insert into storage.objects values (1, 'adjuntos', 'tareas/task1/file.jpg');

create policy adjuntos_select on storage.objects for select to public using (bucket_id = 'adjuntos');
create policy adjuntos_insert on storage.objects for insert to public with check (bucket_id = 'adjuntos');
create policy adjuntos_update on storage.objects for update to public
  using (bucket_id = 'adjuntos') with check (bucket_id = 'adjuntos');
create policy adjuntos_delete on storage.objects for delete to public using (bucket_id = 'adjuntos');
