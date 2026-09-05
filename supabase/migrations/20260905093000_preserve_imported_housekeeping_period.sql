-- Un semestre importado y validado se presenta tal cual: una consulta no
-- añade automáticamente otras empleadas a esa liquidación cerrada.

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

  if exists (
    select 1 from public.housekeeping_semester_incentives incentive
    where incentive.periodo = p_periodo
      and incentive.origen = 'informe_junio_2026'
  ) then
    return 0;
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
    perform public.hk_recalculate_employee_period(
      v_employee_id, p_periodo, p_actor_id, p_actor_nombre
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.refresh_housekeeping_semester_incentives(text, text, text)
  from public, anon, authenticated;
grant execute on function public.refresh_housekeeping_semester_incentives(text, text, text)
  to service_role;
