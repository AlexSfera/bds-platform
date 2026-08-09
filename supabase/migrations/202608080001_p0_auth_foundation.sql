-- SYNCRO SHIFT — P0 authentication foundation (ADDITIVE ONLY)
-- Status: PLANIFICADO. Do not run in LIVE without explicit approval.
-- This migration does not remove legacy PINs or change existing RLS policies.

begin;

create table if not exists public.syncro_auth_identities (
  employee_id text primary key references public.employees(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  auth_email text not null,
  active boolean not null default false,
  force_pin_change boolean not null default true,
  authz_version integer not null default 1 check (authz_version > 0),
  pin_fingerprint text,
  temporary_pin_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint syncro_auth_identities_email_nonempty check (length(trim(auth_email)) > 3)
);

create unique index if not exists syncro_auth_identities_email_lower_uidx
  on public.syncro_auth_identities (lower(auth_email));
create unique index if not exists syncro_auth_identities_pin_fingerprint_uidx
  on public.syncro_auth_identities (pin_fingerprint)
  where pin_fingerprint is not null;

create table if not exists public.syncro_auth_rate_buckets (
  scope_kind text not null check (scope_kind in ('employee', 'ip', 'system')),
  scope_key text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  failure_streak integer not null default 0 check (failure_streak >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope_kind, scope_key)
);

create table if not exists public.syncro_auth_audit (
  id bigint generated always as identity primary key,
  event_at timestamptz not null default now(),
  event_type text not null check (event_type in (
    'login_success', 'login_failure', 'login_throttled',
    'logout', 'pin_change', 'pin_reset', 'session_revoked',
    'identity_provisioned', 'employee_updated', 'employee_status',
    'employee_deleted'
  )),
  employee_id text,
  ip_hash text,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  constraint syncro_auth_audit_reason_length check (length(coalesce(reason, '')) <= 80)
);

create index if not exists syncro_auth_audit_event_at_idx
  on public.syncro_auth_audit (event_at desc);
create index if not exists syncro_auth_audit_employee_idx
  on public.syncro_auth_audit (employee_id, event_at desc);
create index if not exists syncro_auth_audit_ip_idx
  on public.syncro_auth_audit (ip_hash, event_at desc);

alter table public.syncro_auth_identities enable row level security;
alter table public.syncro_auth_rate_buckets enable row level security;
alter table public.syncro_auth_audit enable row level security;

revoke all on table public.syncro_auth_identities from public, anon, authenticated;
revoke all on table public.syncro_auth_rate_buckets from public, anon, authenticated;
revoke all on table public.syncro_auth_audit from public, anon, authenticated;
revoke all on sequence public.syncro_auth_audit_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.syncro_auth_identities to service_role;
grant select, insert, update, delete on table public.syncro_auth_rate_buckets to service_role;
grant select, insert, update, delete on table public.syncro_auth_audit to service_role;
grant usage, select on sequence public.syncro_auth_audit_id_seq to service_role;

create or replace function public.syncro_auth_reserve_bucket(
  p_scope_kind text,
  p_scope_key text,
  p_limit integer,
  p_window interval
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_window_started timestamptz;
  v_locked_until timestamptz;
  v_retry integer := 0;
begin
  if p_scope_kind not in ('employee', 'ip', 'system')
     or coalesce(length(p_scope_key), 0) = 0
     or p_limit < 1
     or p_window <= interval '0 seconds' then
    raise exception 'invalid rate bucket parameters';
  end if;

  insert into public.syncro_auth_rate_buckets (
    scope_kind, scope_key, window_started_at, attempt_count,
    failure_streak, locked_until, updated_at
  ) values (
    p_scope_kind, p_scope_key, v_now, 1, 0, null, v_now
  )
  on conflict (scope_kind, scope_key) do update set
    window_started_at = case
      when public.syncro_auth_rate_buckets.window_started_at <= v_now - p_window
        then v_now
      else public.syncro_auth_rate_buckets.window_started_at
    end,
    attempt_count = case
      when public.syncro_auth_rate_buckets.window_started_at <= v_now - p_window
        then 1
      else public.syncro_auth_rate_buckets.attempt_count + 1
    end,
    failure_streak = case
      when public.syncro_auth_rate_buckets.window_started_at <= v_now - p_window
        then 0
      else public.syncro_auth_rate_buckets.failure_streak
    end,
    locked_until = case
      when public.syncro_auth_rate_buckets.locked_until <= v_now then null
      else public.syncro_auth_rate_buckets.locked_until
    end,
    updated_at = v_now
  returning attempt_count, window_started_at, locked_until
    into v_count, v_window_started, v_locked_until;

  if v_locked_until is not null and v_locked_until > v_now then
    return greatest(1, ceil(extract(epoch from (v_locked_until - v_now)))::integer);
  end if;

  if v_count > p_limit then
    v_retry := greatest(
      1,
      ceil(extract(epoch from ((v_window_started + p_window) - v_now)))::integer
    );
    update public.syncro_auth_rate_buckets
       set locked_until = v_now + make_interval(secs => v_retry),
           updated_at = v_now
     where scope_kind = p_scope_kind and scope_key = p_scope_key;
    return v_retry;
  end if;

  return 0;
end;
$$;

create or replace function public.syncro_auth_begin_login(
  p_employee_id text,
  p_ip_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_retry integer;
  v_ip_retry integer;
  v_system_retry integer;
  v_retry integer;
begin
  if coalesce(length(p_employee_id), 0) = 0
     or coalesce(length(p_ip_hash), 0) < 32 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 60);
  end if;

  v_employee_retry := public.syncro_auth_reserve_bucket(
    'employee', p_employee_id, 10, interval '15 minutes'
  );
  v_ip_retry := public.syncro_auth_reserve_bucket(
    'ip', p_ip_hash, 30, interval '15 minutes'
  );
  v_system_retry := public.syncro_auth_reserve_bucket(
    'system', 'global', 300, interval '15 minutes'
  );
  v_retry := greatest(v_employee_retry, v_ip_retry, v_system_retry);

  if v_retry > 0 then
    insert into public.syncro_auth_audit (
      event_type, employee_id, ip_hash, reason
    ) values ('login_throttled', p_employee_id, p_ip_hash, 'rate_limit');
  end if;

  return jsonb_build_object(
    'allowed', v_retry = 0,
    'retry_after_seconds', v_retry
  );
end;
$$;

create or replace function public.syncro_auth_finish_login(
  p_employee_id text,
  p_ip_hash text,
  p_success boolean,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_employee_failures integer := 0;
  v_ip_failures integer := 0;
begin
  if p_success then
    update public.syncro_auth_rate_buckets
       set failure_streak = 0,
           locked_until = null,
           updated_at = v_now
     where scope_kind = 'employee' and scope_key = p_employee_id;

    update public.syncro_auth_identities
       set last_login_at = v_now,
           updated_at = v_now
     where employee_id = p_employee_id;

    insert into public.syncro_auth_audit (
      event_type, employee_id, ip_hash, reason
    ) values ('login_success', p_employee_id, p_ip_hash, 'success');
  else
    update public.syncro_auth_rate_buckets
       set failure_streak = failure_streak + 1,
           updated_at = v_now
     where scope_kind = 'employee' and scope_key = p_employee_id
     returning failure_streak into v_employee_failures;

    update public.syncro_auth_rate_buckets
       set failure_streak = failure_streak + 1,
           updated_at = v_now
     where scope_kind = 'ip' and scope_key = p_ip_hash
     returning failure_streak into v_ip_failures;

    if v_employee_failures >= 5 then
      update public.syncro_auth_rate_buckets
         set locked_until = greatest(
               coalesce(locked_until, v_now), v_now + interval '15 minutes'
             ),
             updated_at = v_now
       where scope_kind = 'employee' and scope_key = p_employee_id;
    end if;

    if v_ip_failures >= 20 then
      update public.syncro_auth_rate_buckets
         set locked_until = greatest(
               coalesce(locked_until, v_now), v_now + interval '15 minutes'
             ),
             updated_at = v_now
       where scope_kind = 'ip' and scope_key = p_ip_hash;
    end if;

    insert into public.syncro_auth_audit (
      event_type, employee_id, ip_hash, reason
    ) values (
      'login_failure', p_employee_id, p_ip_hash,
      left(coalesce(p_reason, 'unknown'), 80)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.syncro_auth_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'employee_id', e.id,
    'role', e.rol,
    'area', e.area,
    'responsable', coalesce(e.responsable, 0),
    'validador', coalesce(e.validador, 0),
    'authz_version', i.authz_version
  )
  from public.syncro_auth_identities i
  join public.employees e on e.id = i.employee_id
  where i.auth_user_id = (select auth.uid())
    and i.active = true
    and i.force_pin_change = false
    and case
          when coalesce(auth.jwt() -> 'app_metadata' ->> 'syncro_authz_version', '') ~ '^[0-9]+$'
            then (auth.jwt() -> 'app_metadata' ->> 'syncro_authz_version')::integer
          else 0
        end = i.authz_version
    and e.estado = 'Activo'
  limit 1;
$$;

revoke all on function public.syncro_auth_reserve_bucket(text, text, integer, interval)
  from public, anon, authenticated;
revoke all on function public.syncro_auth_begin_login(text, text)
  from public, anon, authenticated;
revoke all on function public.syncro_auth_finish_login(text, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.syncro_auth_context()
  from public, anon;

grant execute on function public.syncro_auth_reserve_bucket(text, text, integer, interval)
  to service_role;
grant execute on function public.syncro_auth_begin_login(text, text)
  to service_role;
grant execute on function public.syncro_auth_finish_login(text, text, boolean, text)
  to service_role;
grant execute on function public.syncro_auth_context()
  to authenticated, service_role;

comment on table public.syncro_auth_identities is
  'Protected mapping between Supabase Auth identities and SYNCRO employees.';
comment on table public.syncro_auth_rate_buckets is
  'Server-only atomic login rate-limit and temporary-lock buckets.';
comment on table public.syncro_auth_audit is
  'Server-only authentication audit without PINs, tokens, keys or raw IPs.';

commit;
