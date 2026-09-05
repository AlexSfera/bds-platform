-- Housekeeping: períodos de baja informados por la jefa y cálculo semestral.
-- La tabla normalizada es la fuente financiera. employee_status recibe una
-- copia operativa para planificación, pero no interviene en el premio.

create table if not exists public.housekeeping_absence_periods (
  id text primary key,
  report_id text not null references public.dept_reports(id) on delete cascade,
  employee_id text not null references public.employees(id) on delete restrict,
  employee_nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  registrado_por_id text,
  registrado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint housekeeping_absence_periods_dates_check
    check (fecha_fin >= fecha_inicio and fecha_fin - fecha_inicio <= 366),
  constraint housekeeping_absence_periods_report_employee_dates_key
    unique (report_id, employee_id, fecha_inicio, fecha_fin)
);

create index if not exists housekeeping_absence_periods_employee_dates_idx
  on public.housekeeping_absence_periods (employee_id, fecha_inicio, fecha_fin);
create index if not exists housekeeping_absence_periods_report_idx
  on public.housekeeping_absence_periods (report_id);

alter table public.housekeeping_absence_periods enable row level security;
revoke all on table public.housekeeping_absence_periods from public, anon, authenticated;
grant select, insert, update, delete on table public.housekeeping_absence_periods to service_role;

alter table public.employee_status
  add column if not exists source_report_id text,
  add column if not exists source_absence_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_status_source_report_id_fkey'
      and conrelid = 'public.employee_status'::regclass
  ) then
    alter table public.employee_status
      add constraint employee_status_source_report_id_fkey
      foreign key (source_report_id) references public.dept_reports(id) on delete cascade;
  end if;
end;
$$;

create unique index if not exists employee_status_source_absence_id_key
  on public.employee_status (source_absence_id)
  where source_absence_id is not null;

alter table public.housekeeping_semester_incentives
  drop constraint if exists housekeeping_semester_incentives_origen_check;
alter table public.housekeeping_semester_incentives
  add constraint housekeeping_semester_incentives_origen_check
  check (origen in ('registro_jefa', 'informe_junio_2026', 'informe_jefe'));

-- La carga manual de un total de días deja de ser una vía válida. La fuente
-- pasa a ser exclusivamente el informe publicado con intervalos de fechas.
revoke all on function public.save_housekeeping_semester_incentive(text, text, smallint, text, text)
  from service_role;

create or replace function public.hk_recalculate_employee_period(
  p_employee_id text,
  p_periodo text,
  p_actor_id text,
  p_actor_nombre text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_period_start date;
  v_period_end date;
  v_days smallint;
  v_previous_level smallint;
  v_tenure_ok boolean;
  v_absence_ok boolean;
  v_level smallint;
  v_amount numeric(10,2);
begin
  if p_periodo !~ '^[0-9]{4}-S[12]$' then
    raise exception 'HK_INVALID_PERIOD';
  end if;

  select * into v_employee from public.employees where id = p_employee_id;
  if not found or lower(coalesce(v_employee.area, '')) not in ('housekeeping', 'limpieza', 'hk') then
    raise exception 'HK_EMPLOYEE_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.housekeeping_semester_incentives
    where employee_id = p_employee_id and periodo = p_periodo
      and estado in ('liquidado', 'historico')
  ) then
    return;
  end if;

  v_period_start := public.hk_semester_start(p_periodo);
  v_period_end := (v_period_start + interval '6 months - 1 day')::date;

  select count(distinct day_value)::smallint into v_days
  from public.housekeeping_absence_periods absence
  cross join lateral generate_series(
    greatest(absence.fecha_inicio, v_period_start)::timestamp,
    least(absence.fecha_fin, v_period_end)::timestamp,
    interval '1 day'
  ) as days(day_value)
  where absence.employee_id = p_employee_id
    and absence.fecha_inicio <= v_period_end
    and absence.fecha_fin >= v_period_start;

  v_days := coalesce(v_days, 0);
  v_tenure_ok := v_employee.fecha_alta is not null
    and v_employee.fecha_alta < (v_period_start - interval '6 months')::date;
  v_absence_ok := v_days <= 10;

  select nivel_premio into v_previous_level
  from public.housekeeping_semester_incentives
  where employee_id = p_employee_id
    and periodo = public.hk_previous_period(p_periodo);

  if v_tenure_ok and v_absence_ok then
    v_level := least(coalesce(v_previous_level, 0) + 1, 3);
    v_amount := case v_level when 1 then 250 when 2 then 320 else 400 end;
  else
    v_level := 0;
    v_amount := 0;
  end if;

  insert into public.housekeeping_semester_incentives (
    id, employee_id, employee_nombre, periodo, dias_baja,
    elegible_antiguedad, elegible_baja, nivel_premio, importe_premio,
    estado, origen, registrado_por_id, registrado_por,
    registrado_at, actualizado_at
  ) values (
    'HKSI-' || md5(v_employee.id || ':' || p_periodo),
    v_employee.id, v_employee.nombre, p_periodo, v_days,
    v_tenure_ok, v_absence_ok, v_level, v_amount,
    'pendiente', 'informe_jefe', p_actor_id, p_actor_nombre, now(), now()
  )
  on conflict (employee_id, periodo) do update set
    employee_nombre = excluded.employee_nombre,
    dias_baja = excluded.dias_baja,
    elegible_antiguedad = excluded.elegible_antiguedad,
    elegible_baja = excluded.elegible_baja,
    nivel_premio = excluded.nivel_premio,
    importe_premio = excluded.importe_premio,
    origen = case
      when public.housekeeping_semester_incentives.origen = 'informe_junio_2026'
        then public.housekeeping_semester_incentives.origen
      else 'informe_jefe'
    end,
    registrado_por_id = excluded.registrado_por_id,
    registrado_por = excluded.registrado_por,
    actualizado_at = now()
  where public.housekeeping_semester_incentives.estado = 'pendiente';
end;
$$;

create or replace function public.refresh_housekeeping_semester_incentives(
  p_periodo text,
  p_actor_id text,
  p_actor_nombre text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id text;
  v_count integer := 0;
begin
  if p_periodo !~ '^[0-9]{4}-S[12]$' then
    raise exception 'HK_INVALID_PERIOD';
  end if;

  for v_employee_id in
    select employee.id
    from public.employees employee
    where lower(coalesce(employee.area, '')) in ('housekeeping', 'limpieza', 'hk')
      and (
        employee.estado = 'Activo'
        or exists (
          select 1 from public.housekeeping_semester_incentives incentive
          where incentive.employee_id = employee.id and incentive.periodo = p_periodo
        )
      )
    order by employee.id
  loop
    -- El informe de junio de 2026 ya fue validado por Dirección. Una simple
    -- consulta no debe reescribirlo; solo un nuevo informe publicado lo hace.
    if exists (
      select 1 from public.housekeeping_semester_incentives incentive
      where incentive.employee_id = v_employee_id
        and incentive.periodo = p_periodo
        and incentive.estado = 'pendiente'
        and incentive.origen = 'informe_junio_2026'
    ) then
      continue;
    end if;
    perform public.hk_recalculate_employee_period(
      v_employee_id, p_periodo, p_actor_id, p_actor_nombre
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.sync_housekeeping_report_absences(
  p_report_id text,
  p_absences jsonb,
  p_actor_id text,
  p_actor_nombre text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.dept_reports%rowtype;
  v_absence jsonb;
  v_employee public.employees%rowtype;
  v_absence_id text;
  v_start date;
  v_end date;
  v_old_employee_ids text[];
  v_new_employee_ids text[];
  v_employee_id text;
  v_periodo text;
  v_saved integer := 0;
begin
  if p_report_id is null or length(trim(p_report_id)) = 0
    or jsonb_typeof(p_absences) <> 'array'
    or jsonb_array_length(p_absences) > 100 then
    raise exception 'HK_INVALID_INPUT';
  end if;

  select * into v_report from public.dept_reports where id = p_report_id for update;
  if not found or lower(coalesce(v_report.departamento, '')) not in ('housekeeping', 'limpieza', 'hk') then
    raise exception 'HK_REPORT_NOT_FOUND';
  end if;

  select array_agg(distinct employee_id) into v_old_employee_ids
  from public.housekeeping_absence_periods
  where report_id = p_report_id;

  for v_absence in select value from jsonb_array_elements(p_absences)
  loop
    if coalesce(v_absence->>'employee_id', '') = ''
      or coalesce(v_absence->>'fecha_inicio', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(v_absence->>'fecha_fin', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'HK_INVALID_ABSENCE';
    end if;

    begin
      v_start := (v_absence->>'fecha_inicio')::date;
      v_end := (v_absence->>'fecha_fin')::date;
    exception when others then
      raise exception 'HK_INVALID_ABSENCE';
    end;

    if v_end < v_start or v_end - v_start > 366 then
      raise exception 'HK_INVALID_ABSENCE';
    end if;

    select * into v_employee
    from public.employees
    where id = v_absence->>'employee_id';
    if not found or lower(coalesce(v_employee.area, '')) not in ('housekeeping', 'limpieza', 'hk') then
      raise exception 'HK_EMPLOYEE_NOT_FOUND';
    end if;

    if exists (
      select 1 from public.housekeeping_semester_incentives incentive
      where incentive.employee_id = v_employee.id
        and incentive.estado = 'liquidado'
        and v_start <= (public.hk_semester_start(incentive.periodo) + interval '6 months - 1 day')::date
        and v_end >= public.hk_semester_start(incentive.periodo)
    ) then
      raise exception 'HK_LIQUIDATED_PERIOD';
    end if;
  end loop;

  if exists (
    select 1
    from public.housekeeping_absence_periods old_absence
    join public.housekeeping_semester_incentives incentive
      on incentive.employee_id = old_absence.employee_id
     and incentive.estado = 'liquidado'
    where old_absence.report_id = p_report_id
      and old_absence.fecha_inicio <= (public.hk_semester_start(incentive.periodo) + interval '6 months - 1 day')::date
      and old_absence.fecha_fin >= public.hk_semester_start(incentive.periodo)
  ) then
    raise exception 'HK_LIQUIDATED_PERIOD';
  end if;

  delete from public.employee_status where source_report_id = p_report_id;
  delete from public.housekeeping_absence_periods where report_id = p_report_id;

  for v_absence in select value from jsonb_array_elements(p_absences)
  loop
    v_start := (v_absence->>'fecha_inicio')::date;
    v_end := (v_absence->>'fecha_fin')::date;
    select * into v_employee from public.employees where id = v_absence->>'employee_id';
    v_absence_id := 'HKAP-' || md5(
      p_report_id || ':' || v_employee.id || ':' || v_start::text || ':' || v_end::text
    );

    insert into public.housekeeping_absence_periods (
      id, report_id, employee_id, employee_nombre, fecha_inicio, fecha_fin,
      registrado_por_id, registrado_por, created_at, updated_at
    ) values (
      v_absence_id, p_report_id, v_employee.id, v_employee.nombre,
      v_start, v_end, p_actor_id, p_actor_nombre, now(), now()
    )
    on conflict (report_id, employee_id, fecha_inicio, fecha_fin) do nothing;

    insert into public.employee_status (
      id, employee_id, tipo, fecha_inicio, fecha_fin, notas,
      creado_por, ts, source_report_id, source_absence_id
    ) values (
      'es_hk_' || md5(v_absence_id), v_employee.id, 'baja_medica',
      v_start, v_end, '', p_actor_nombre, now(), p_report_id, v_absence_id
    )
    on conflict (source_absence_id) where source_absence_id is not null do update set
      employee_id = excluded.employee_id,
      fecha_inicio = excluded.fecha_inicio,
      fecha_fin = excluded.fecha_fin,
      creado_por = excluded.creado_por,
      ts = excluded.ts,
      source_report_id = excluded.source_report_id;

    v_saved := v_saved + 1;
  end loop;

  select array_agg(distinct value->>'employee_id') into v_new_employee_ids
  from jsonb_array_elements(p_absences);

  for v_employee_id in
    select distinct employee_id
    from unnest(coalesce(v_old_employee_ids, '{}'::text[]) || coalesce(v_new_employee_ids, '{}'::text[])) as ids(employee_id)
    where employee_id is not null and employee_id <> ''
  loop
    for v_periodo in
      select distinct periodo from (
        select incentive.periodo
        from public.housekeeping_semester_incentives incentive
        where incentive.employee_id = v_employee_id
          and incentive.estado = 'pendiente'
        union
        select extract(year from day_value)::integer::text || '-S'
          || case when extract(month from day_value) <= 6 then '1' else '2' end
        from public.housekeeping_absence_periods absence
        cross join lateral generate_series(
          absence.fecha_inicio::timestamp,
          absence.fecha_fin::timestamp,
          interval '1 day'
        ) as days(day_value)
        where absence.employee_id = v_employee_id
      ) periods
      order by periodo
    loop
      perform public.hk_recalculate_employee_period(
        v_employee_id, v_periodo, p_actor_id, p_actor_nombre
      );
    end loop;
  end loop;

  update public.dept_reports
  set estado = 'publicado', ts = now()
  where id = p_report_id;

  return jsonb_build_object('ok', true, 'saved', v_saved);
end;
$$;

revoke all on function public.hk_recalculate_employee_period(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.refresh_housekeeping_semester_incentives(text, text, text)
  from public, anon, authenticated;
revoke all on function public.sync_housekeeping_report_absences(text, jsonb, text, text)
  from public, anon, authenticated;

grant execute on function public.hk_recalculate_employee_period(text, text, text, text)
  to service_role;
grant execute on function public.refresh_housekeeping_semester_incentives(text, text, text)
  to service_role;
grant execute on function public.sync_housekeeping_report_absences(text, jsonb, text, text)
  to service_role;
