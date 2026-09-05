-- Corrección de compatibilidad: employees.fecha_alta es texto en el esquema
-- LIVE actual. Se convierte de forma segura antes de comparar antigüedad.

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
  v_fecha_alta date;
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
  begin
    v_fecha_alta := nullif(trim(v_employee.fecha_alta::text), '')::date;
  exception when others then
    v_fecha_alta := null;
  end;
  v_tenure_ok := v_fecha_alta is not null
    and v_fecha_alta < (v_period_start - interval '6 months')::date;
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

revoke all on function public.hk_recalculate_employee_period(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.hk_recalculate_employee_period(text, text, text, text)
  to service_role;
