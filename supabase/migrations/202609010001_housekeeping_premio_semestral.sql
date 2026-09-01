-- Premio semestral Housekeeping: persistencia, cálculo y liquidación.
-- No aplicar en LIVE sin revisar plan de reversión y autorización explícita.

create table if not exists public.housekeeping_semester_incentives (
  id text primary key,
  employee_id text not null references public.employees(id) on delete restrict,
  employee_nombre text not null,
  periodo text not null check (periodo ~ '^[0-9]{4}-S[12]$'),
  dias_baja smallint check (dias_baja is null or (dias_baja >= 0 and dias_baja <= 184)),
  elegible_antiguedad boolean not null default false,
  elegible_baja boolean not null default false,
  nivel_premio smallint not null default 0 check (nivel_premio between 0 and 3),
  importe_premio numeric(10,2) not null default 0 check (importe_premio in (0, 250, 320, 400)),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'liquidado', 'historico')),
  origen text not null default 'registro_jefa' check (origen in ('registro_jefa', 'informe_junio_2026')),
  registrado_por_id text,
  registrado_por text,
  registrado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  liquidado_por_id text,
  liquidado_por text,
  liquidado_at timestamptz,
  notas text,
  unique (employee_id, periodo)
);

create index if not exists housekeeping_semester_incentives_periodo_idx
  on public.housekeeping_semester_incentives (periodo, estado);
create index if not exists housekeeping_semester_incentives_employee_idx
  on public.housekeeping_semester_incentives (employee_id, periodo);

alter table public.housekeeping_semester_incentives enable row level security;
revoke all on table public.housekeeping_semester_incentives from public, anon, authenticated;

create or replace function public.hk_semester_start(p_periodo text)
returns date
language sql
immutable
set search_path = public
as $$
  select case split_part(p_periodo, '-', 2)
    when 'S1' then make_date(split_part(p_periodo, '-', 1)::integer, 1, 1)
    when 'S2' then make_date(split_part(p_periodo, '-', 1)::integer, 7, 1)
    else null
  end;
$$;

create or replace function public.hk_previous_period(p_periodo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case split_part(p_periodo, '-', 2)
    when 'S1' then (split_part(p_periodo, '-', 1)::integer - 1)::text || '-S2'
    when 'S2' then split_part(p_periodo, '-', 1) || '-S1'
    else null
  end;
$$;

create or replace function public.save_housekeeping_semester_incentive(
  p_employee_id text,
  p_periodo text,
  p_dias_baja smallint,
  p_actor_id text,
  p_actor_nombre text
)
returns public.housekeeping_semester_incentives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_row public.housekeeping_semester_incentives%rowtype;
  v_result public.housekeeping_semester_incentives%rowtype;
  v_period_start date;
  v_previous_period text;
  v_previous_level smallint;
  v_tenure_ok boolean;
  v_absence_ok boolean;
  v_level smallint;
  v_amount numeric(10,2);
begin
  if p_periodo !~ '^[0-9]{4}-S[12]$' or p_dias_baja < 0 or p_dias_baja > 184 then
    raise exception 'HK_INVALID_INPUT';
  end if;

  select * into v_employee from public.employees where id = p_employee_id;
  if not found or lower(coalesce(v_employee.area, '')) not in ('housekeeping', 'limpieza', 'hk') then
    raise exception 'HK_EMPLOYEE_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.housekeeping_semester_incentives
    where employee_id = p_employee_id and periodo >= p_periodo and estado = 'liquidado'
  ) then
    raise exception 'HK_LIQUIDATED_PERIOD';
  end if;

  if exists (
    select 1 from public.housekeeping_semester_incentives
    where employee_id = p_employee_id and periodo = p_periodo
      and estado = 'historico' and origen = 'informe_junio_2026'
  ) then
    raise exception 'HK_HISTORICAL_RECORD_LOCKED';
  end if;

  insert into public.housekeeping_semester_incentives (
    id, employee_id, employee_nombre, periodo, dias_baja, estado, origen,
    registrado_por_id, registrado_por, registrado_at, actualizado_at
  ) values (
    'HKSI-' || md5(p_employee_id || ':' || p_periodo),
    v_employee.id, v_employee.nombre, p_periodo, p_dias_baja, 'pendiente', 'registro_jefa',
    p_actor_id, p_actor_nombre, now(), now()
  )
  on conflict (employee_id, periodo) do update set
    employee_nombre = excluded.employee_nombre,
    dias_baja = excluded.dias_baja,
    estado = 'pendiente',
    origen = 'registro_jefa',
    registrado_por_id = excluded.registrado_por_id,
    registrado_por = excluded.registrado_por,
    registrado_at = excluded.registrado_at,
    actualizado_at = excluded.actualizado_at;

  for v_row in
    select * from public.housekeeping_semester_incentives
    where employee_id = p_employee_id and periodo >= p_periodo
    order by periodo asc
  loop
    v_period_start := public.hk_semester_start(v_row.periodo);
    v_tenure_ok := v_employee.fecha_alta is not null
      and v_employee.fecha_alta < (v_period_start - interval '6 months')::date;
    v_absence_ok := v_row.dias_baja is not null and v_row.dias_baja <= 10;
    v_previous_period := public.hk_previous_period(v_row.periodo);
    select nivel_premio into v_previous_level
      from public.housekeeping_semester_incentives
      where employee_id = p_employee_id and periodo = v_previous_period;

    if v_tenure_ok and v_absence_ok then
      v_level := least(coalesce(v_previous_level, 0) + 1, 3);
      v_amount := case v_level when 1 then 250 when 2 then 320 else 400 end;
    else
      v_level := 0;
      v_amount := 0;
    end if;

    update public.housekeeping_semester_incentives set
      elegible_antiguedad = v_tenure_ok,
      elegible_baja = v_absence_ok,
      nivel_premio = v_level,
      importe_premio = v_amount,
      actualizado_at = now()
    where id = v_row.id;
  end loop;

  select * into v_result from public.housekeeping_semester_incentives
    where employee_id = p_employee_id and periodo = p_periodo;
  return v_result;
end;
$$;

create or replace function public.liquidate_housekeeping_semester_incentive(
  p_employee_id text,
  p_periodo text,
  p_actor_id text,
  p_actor_nombre text,
  p_notas text default null
)
returns public.housekeeping_semester_incentives
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.housekeeping_semester_incentives%rowtype;
begin
  update public.housekeeping_semester_incentives set
    estado = 'liquidado',
    liquidado_por_id = p_actor_id,
    liquidado_por = p_actor_nombre,
    liquidado_at = now(),
    notas = nullif(trim(p_notas), ''),
    actualizado_at = now()
  where employee_id = p_employee_id
    and periodo = p_periodo
    and estado = 'pendiente'
    and elegible_antiguedad = true
    and elegible_baja = true
    and importe_premio > 0
  returning * into v_result;

  if not found then
    raise exception 'HK_NOT_LIQUIDATABLE';
  end if;
  return v_result;
end;
$$;

revoke all on function public.save_housekeeping_semester_incentive(text, text, smallint, text, text) from public, anon, authenticated;
revoke all on function public.liquidate_housekeeping_semester_incentive(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_housekeeping_semester_incentive(text, text, smallint, text, text) to service_role;
grant execute on function public.liquidate_housekeeping_semester_incentive(text, text, text, text, text) to service_role;

-- Datos informados en "INFORME SOBRE SISTEMA DE PREMIO SEMESTRAL JUNIO 2026".
-- Los niveles de 2025 se preservan como histórico (sin inventar días de baja).
-- Para enero–junio 2026 el informe declara ausencia de baja médica de las
-- personas con premio, por eso se carga 0 días y queda pendiente de liquidar.
with seed(nombre_ref, periodo, dias_baja, nivel_premio, importe_premio, estado) as (
  values
    ('YESSICA',  '2025-S1', null::smallint, 1::smallint, 250::numeric, 'historico'),
    ('YESSICA',  '2025-S2', null::smallint, 2::smallint, 320::numeric, 'historico'),
    ('YESSICA',  '2026-S1', 0::smallint,    3::smallint, 400::numeric, 'pendiente'),
    ('KRISTINA', '2025-S1', null::smallint, 1::smallint, 250::numeric, 'historico'),
    ('KRISTINA', '2025-S2', null::smallint, 2::smallint, 320::numeric, 'historico'),
    ('KRISTINA', '2026-S1', 0::smallint,    3::smallint, 400::numeric, 'pendiente'),
    ('ISABEL',   '2025-S1', null::smallint, 1::smallint, 250::numeric, 'historico'),
    ('ISABEL',   '2025-S2', null::smallint, 2::smallint, 320::numeric, 'historico'),
    ('ISABEL',   '2026-S1', 0::smallint,    3::smallint, 400::numeric, 'pendiente'),
    ('ANYELY',   '2025-S1', null::smallint, 1::smallint, 250::numeric, 'historico'),
    ('ANYELY',   '2026-S1', 0::smallint,    1::smallint, 250::numeric, 'pendiente'),
    ('INGRID',   '2025-S1', null::smallint, 1::smallint, 250::numeric, 'historico'),
    ('INGRID',   '2025-S2', null::smallint, 2::smallint, 320::numeric, 'historico'),
    ('INGRID',   '2026-S1', 0::smallint,    3::smallint, 400::numeric, 'pendiente'),
    ('VERO',     '2025-S1', null::smallint, 1::smallint, 250::numeric, 'historico'),
    ('VERO',     '2025-S2', null::smallint, 2::smallint, 320::numeric, 'historico'),
    ('VERO',     '2026-S1', 0::smallint,    3::smallint, 400::numeric, 'pendiente'),
    ('IRINA',    '2026-S1', 0::smallint,    1::smallint, 250::numeric, 'pendiente')
)
insert into public.housekeeping_semester_incentives (
  id, employee_id, employee_nombre, periodo, dias_baja, elegible_antiguedad,
  elegible_baja, nivel_premio, importe_premio, estado, origen, registrado_por,
  registrado_at, actualizado_at
)
select
  'HKSI-LEGACY-' || matched.id || '-' || replace(seed.periodo, '-', ''),
  matched.id, matched.nombre, seed.periodo, seed.dias_baja, true,
  true, seed.nivel_premio, seed.importe_premio, seed.estado,
  'informe_junio_2026', 'Importación informe junio 2026', now(), now()
from seed
join lateral (
  select min(employee.id) as id, min(employee.nombre) as nombre
  from public.employees employee
  where lower(coalesce(employee.area, '')) in ('housekeeping', 'limpieza', 'hk')
    and employee.nombre ilike '%' || seed.nombre_ref || '%'
  having count(*) = 1
) matched on matched.id is not null
on conflict (employee_id, periodo) do nothing;
