-- SYNCRO SHIFT — emergency rollback for employee_ips containment
-- Status: VERIFICADO locally; LIVE remains PLANIFICADO.
-- DO NOT RUN IN LIVE WITHOUT EXPLICIT APPROVAL.
--
-- SECURITY WARNING: this restores the previously confirmed effective legacy
-- behaviour (broad browser-role grants plus anonymous CRUD policy) so that the
-- old Maestro UI can manage IPs again.
-- It deliberately reopens SEC-030 and is only a functional emergency rollback
-- while the legacy middleware uses the publishable key.

begin;

do $$
begin
  if to_regclass('public.employee_ips') is null then
    raise exception 'public.employee_ips does not exist';
  end if;
end;
$$;

drop policy if exists syncro_employee_ips_legacy_read
  on public.employee_ips;
drop policy if exists anon_all
  on public.employee_ips;

grant all privileges on table public.employee_ips to anon, authenticated;

create policy anon_all
  on public.employee_ips
  for all
  to anon
  using (true)
  with check (true);

commit;
