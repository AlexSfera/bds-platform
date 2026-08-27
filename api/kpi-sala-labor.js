// /api/kpi-sala-labor.js — Horas y coste semanal para KPI Sala
// Lee bitrix_time_records + employees. No crea ni modifica shifts.

import {
  adminRequest,
  jsonResponse,
  requireAuthEnabled,
  requireMethod
} from '../lib/auth-server.js';
import {
  isAdminProfile,
  loadManagementActor,
  normalizeDepartment,
  supervisorDepartments
} from '../lib/authz-server.js';

export const config = { runtime: 'edge' };

const PAGE_SIZE = 1000;
const MAX_RANGE_DAYS = 31;

export function canReadSalaLabor(profile) {
  if (isAdminProfile(profile)) return true;
  return supervisorDepartments(profile).some(
    dept => normalizeDepartment(dept) === normalizeDepartment('Sala')
  );
}

export function validDateRange(desde, hasta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '')
      || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) return false;
  const start = Date.parse(desde + 'T00:00:00Z');
  const end = Date.parse(hasta + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;
  if (new Date(start).toISOString().slice(0, 10) !== desde
      || new Date(end).toISOString().slice(0, 10) !== hasta) return false;
  return ((end - start) / 86400000) < MAX_RANGE_DAYS;
}

export function aggregateSalaLabor(records, employees) {
  const salaEmployees = new Map(
    (Array.isArray(employees) ? employees : [])
      .filter(emp => normalizeDepartment(emp.area) === normalizeDepartment('Sala'))
      .map(emp => [emp.id, emp])
  );
  const hoursByEmployee = new Map();

  for (const record of (Array.isArray(records) ? records : [])) {
    if (!record || !salaEmployees.has(record.employee_id)) continue;
    const seconds = Number(record.duration_seconds) || 0;
    if (seconds <= 0) continue;
    hoursByEmployee.set(
      record.employee_id,
      (hoursByEmployee.get(record.employee_id) || 0) + seconds / 3600
    );
  }

  return Array.from(hoursByEmployee, ([employeeId, rawHours]) => {
    const employee = salaEmployees.get(employeeId);
    const hours = Math.round(rawHours * 100) / 100;
    const hourlyCost = Number(employee.coste) || 0;
    return {
      employee_id: employeeId,
      nombre: employee.nombre,
      horas: hours,
      coste_hora: hourlyCost,
      coste_total: Math.round(hours * hourlyCost * 100) / 100
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

async function loadTimeRecords(desde, hasta) {
  const records = [];
  let offset = 0;
  while (true) {
    const path = 'bitrix_time_records'
      + '?select=employee_id,duration_seconds,fecha_operativa'
      + '&fecha_operativa=gte.' + encodeURIComponent(desde)
      + '&fecha_operativa=lte.' + encodeURIComponent(hasta)
      + '&order=fecha_operativa.asc'
      + '&limit=' + PAGE_SIZE + '&offset=' + offset;
    const page = await adminRequest(path);
    if (!Array.isArray(page) || !page.length) break;
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset > 200000) throw new Error('KPI_SALA_RANGE_TOO_LARGE');
  }
  return records;
}

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'GET');
  if (wrongMethod) return wrongMethod;

  let actor;
  try { actor = await loadManagementActor(req); }
  catch (_) { return jsonResponse({ error: 'Authentication unavailable' }, 503); }
  if (!actor) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!canReadSalaLabor(actor.profile)) return jsonResponse({ error: 'Forbidden' }, 403);

  const url = new URL(req.url, 'http://x');
  const desde = url.searchParams.get('desde') || '';
  const hasta = url.searchParams.get('hasta') || '';
  if (!validDateRange(desde, hasta)) {
    return jsonResponse({ error: 'Rango de fechas inválido' }, 400);
  }

  try {
    const [records, employees] = await Promise.all([
      loadTimeRecords(desde, hasta),
      adminRequest('employees?select=id,nombre,area,coste&area=eq.Sala&order=nombre.asc')
    ]);
    return jsonResponse({
      desde,
      hasta,
      source: 'bitrix_time_records',
      rows: aggregateSalaLabor(records, employees)
    });
  } catch (_) {
    return jsonResponse({ error: 'No se pudieron calcular las horas del KPI' }, 503);
  }
}
