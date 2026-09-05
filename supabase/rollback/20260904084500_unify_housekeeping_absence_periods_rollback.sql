-- Reversión segura de la unificación de bajas de Housekeeping.
-- Se detiene si ya existen datos creados por el nuevo flujo para no perderlos.

do $$
begin
  if exists (select 1 from public.housekeeping_absence_periods)
    or exists (
      select 1 from public.housekeeping_semester_incentives
      where origen = 'informe_jefe'
    ) then
    raise exception 'HK_ROLLBACK_REQUIRES_DATA_EXPORT';
  end if;
end;
$$;

drop function if exists public.sync_housekeeping_report_absences(text, jsonb, text, text);
drop function if exists public.refresh_housekeeping_semester_incentives(text, text, text);
drop function if exists public.hk_recalculate_employee_period(text, text, text, text);

drop index if exists public.employee_status_source_report_id_idx;
drop index if exists public.employee_status_source_absence_id_key;

alter table public.employee_status
  drop constraint if exists employee_status_source_report_id_fkey,
  drop column if exists source_absence_id,
  drop column if exists source_report_id;

drop table if exists public.housekeeping_absence_periods;

alter table public.housekeeping_semester_incentives
  drop constraint if exists housekeeping_semester_incentives_origen_check;
alter table public.housekeeping_semester_incentives
  add constraint housekeeping_semester_incentives_origen_check
  check (origen in ('registro_jefa', 'informe_junio_2026'));

grant execute on function public.save_housekeeping_semester_incentive(text, text, smallint, text, text)
  to service_role;
