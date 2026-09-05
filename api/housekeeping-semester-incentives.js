// /api/housekeeping-semester-incentives.js
// Registro y liquidación segura del premio semestral de Housekeeping.

import {
  adminRequest,
  jsonResponse,
  normalizeEmployeeId,
  readJson,
  requireAuthEnabled,
  requireMethod,
  requireSameOrigin
} from '../lib/auth-server.js';
import {
  isAdjuntoProfile,
  isAdminProfile,
  loadManagementActor,
  normalizeDepartment,
  supervisorDepartments
} from '../lib/authz-server.js';

export const config = { runtime: 'edge' };

const PERIOD_RE = /^(\d{4})-S([12])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORT_ABSENCES = 100;

export function parseSemesterPeriod(value) {
  const match = PERIOD_RE.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const semester = Number(match[2]);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  return {
    id: `${year}-S${semester}`,
    year,
    semester,
    start: `${year}-${semester === 1 ? '01-01' : '07-01'}`,
    end: `${year}-${semester === 1 ? '06-30' : '12-31'}`,
    label: `${semester}.º semestre ${year}`
  };
}

export function isSemesterCompleted(value, now = new Date()) {
  const period = typeof value === 'string' ? parseSemesterPeriod(value) : value;
  if (!period || !(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  return now.toISOString().slice(0, 10) > period.end;
}

export function isTenureEligible(fechaAlta, period) {
  const parsed = typeof period === 'string' ? parseSemesterPeriod(period) : period;
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaAlta || ''))) return false;
  const threshold = new Date(Date.UTC(parsed.year, parsed.semester === 1 ? -6 : 0, 1));
  const startDate = new Date(String(fechaAlta) + 'T00:00:00Z');
  return Number.isFinite(startDate.getTime()) && startDate.getTime() < threshold.getTime();
}

export function calculateHousekeepingAward({ period, fechaAlta, absenceDays, previousAwardLevel }) {
  const parsed = typeof period === 'string' ? parseSemesterPeriod(period) : period;
  const days = Number(absenceDays);
  const tenureEligible = isTenureEligible(fechaAlta, parsed);
  const absenceEligible = Number.isInteger(days) && days >= 0 && days <= 10;
  if (!tenureEligible || !absenceEligible) {
    return { tenureEligible, absenceEligible, level: 0, amount: 0 };
  }
  const previous = Number(previousAwardLevel) || 0;
  const level = Math.min(Math.max(previous, 0) + 1, 3);
  return {
    tenureEligible,
    absenceEligible,
    level,
    amount: level === 1 ? 250 : level === 2 ? 320 : 400
  };
}

// PostgREST devuelve una fila compuesta de RPC como objeto en algunas
// configuraciones y como lista en otras. Ambas respuestas son válidas.
export function singleRpcRecord(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === 'object' ? value : null;
}

function isValidIsoDate(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const parsed = new Date(String(value) + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeAbsencePeriods(value) {
  if (!Array.isArray(value) || value.length > MAX_REPORT_ABSENCES) return null;
  const normalized = [];
  const seen = new Set();
  for (const row of value) {
    const employeeId = normalizeEmployeeId(row && row.employee_id);
    const start = row && row.fecha_inicio;
    const end = row && row.fecha_fin;
    if (!employeeId || !isValidIsoDate(start) || !isValidIsoDate(end)) return null;
    const startDate = new Date(start + 'T00:00:00Z');
    const endDate = new Date(end + 'T00:00:00Z');
    const duration = Math.round((endDate - startDate) / 86400000);
    if (duration < 0 || duration > 366) return null;
    const key = `${employeeId}:${start}:${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ employee_id: employeeId, fecha_inicio: start, fecha_fin: end });
  }
  return normalized;
}

function isHousekeepingArea(area) {
  const normalized = normalizeDepartment(area);
  return normalized === normalizeDepartment('Housekeeping')
    || normalized === normalizeDepartment('Limpieza')
    || normalized === normalizeDepartment('HK');
}

function canReadHousekeeping(profile) {
  if (!profile) return false;
  if (isAdminProfile(profile) || isAdjuntoProfile(profile)) return true;
  return supervisorDepartments(profile).some(isHousekeepingArea);
}

function canRecordAbsences(profile) {
  if (!profile) return false;
  if (isAdminProfile(profile) || isAdjuntoProfile(profile)) return true;
  if (profile.rol === 'gobernante') return true;
  return profile.rol === 'jefe' && isHousekeepingArea(profile.area);
}

function canLiquidateHousekeeping(profile) {
  return isAdminProfile(profile) || isAdjuntoProfile(profile);
}

function cleanNotes(value) {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  const notes = value.trim();
  return notes.length <= 1000 ? notes : null;
}

async function loadView(period) {
  const [records, allEmployees] = await Promise.all([
    adminRequest(
      'housekeeping_semester_incentives?periodo=eq.' + encodeURIComponent(period.id)
        + '&select=id,employee_id,employee_nombre,periodo,dias_baja,elegible_antiguedad,'
        + 'elegible_baja,nivel_premio,importe_premio,estado,origen,registrado_por,'
        + 'registrado_at,actualizado_at,liquidado_por,liquidado_at,notas&order=employee_nombre.asc'
    ),
    adminRequest('employees?select=id,nombre,area,puesto,estado,fecha_alta&order=nombre.asc')
  ]);
  const referenced = new Set((records || []).map(row => row.employee_id));
  const employees = (allEmployees || []).filter(employee =>
    isHousekeepingArea(employee.area)
      && (employee.estado === 'Activo' || referenced.has(employee.id))
  );
  return { records: Array.isArray(records) ? records : [], employees };
}

async function getTargetEmployee(employeeId) {
  const rows = await adminRequest(
    'employees?id=eq.' + encodeURIComponent(employeeId)
      + '&select=id,nombre,area,estado,fecha_alta&limit=1'
  );
  const employee = Array.isArray(rows) ? rows[0] : null;
  return employee && isHousekeepingArea(employee.area) ? employee : null;
}

async function actorFrom(req) {
  try { return await loadManagementActor(req); }
  catch (_) { return undefined; }
}

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;

  if (req.method === 'GET') {
    const actor = await actorFrom(req);
    if (actor === undefined) return jsonResponse({ error: 'Authentication unavailable' }, 503);
    if (!actor) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!canReadHousekeeping(actor.profile)) return jsonResponse({ error: 'Forbidden' }, 403);

    const url = new URL(req.url, 'http://x');
    const period = parseSemesterPeriod(url.searchParams.get('periodo'));
    if (!period) return jsonResponse({ error: 'Periodo semestral inválido' }, 400);
    try {
      if (isSemesterCompleted(period)) {
        await adminRequest('rpc/refresh_housekeeping_semester_incentives', {
          method: 'POST',
          body: JSON.stringify({
            p_periodo: period.id,
            p_actor_id: actor.profile.id,
            p_actor_nombre: actor.profile.nombre || actor.profile.id
          })
        });
      }
      const view = await loadView(period);
      return jsonResponse({
        period,
        records: view.records,
        employees: view.employees,
        permissions: {
          can_record: canRecordAbsences(actor.profile),
          can_liquidate: canLiquidateHousekeeping(actor.profile)
        }
      });
    } catch (_) {
      return jsonResponse({ error: 'No se pudieron cargar los datos de Housekeeping' }, 503);
    }
  }

  const wrongMethod = requireMethod(req, 'POST');
  if (wrongMethod) return wrongMethod;
  const crossOrigin = requireSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const actor = await actorFrom(req);
  if (actor === undefined) return jsonResponse({ error: 'Authentication unavailable' }, 503);
  if (!actor) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await readJson(req, 32768); }
  catch (_) { return jsonResponse({ error: 'Solicitud inválida' }, 400); }

  if (body.action === 'sync_absences') {
    if (!canRecordAbsences(actor.profile)) return jsonResponse({ error: 'Forbidden' }, 403);
    const reportId = normalizeEmployeeId(body.report_id);
    const absences = normalizeAbsencePeriods(body.absences);
    if (!reportId || absences === null) {
      return jsonResponse({ error: 'Completa la empleada y las fechas de inicio y fin de cada baja.' }, 400);
    }
    try {
      const result = await adminRequest('rpc/sync_housekeeping_report_absences', {
        method: 'POST',
        body: JSON.stringify({
          p_report_id: reportId,
          p_absences: absences,
          p_actor_id: actor.profile.id,
          p_actor_nombre: actor.profile.nombre || actor.profile.id
        })
      });
      return jsonResponse({ ok: true, result: singleRpcRecord(result) || result || {} });
    } catch (_) {
      return jsonResponse({
        error: 'No se pudieron registrar las bajas. Comprueba las fechas y que el semestre no esté liquidado.'
      }, 409);
    }
  }

  const period = parseSemesterPeriod(body.periodo);
  const employeeId = normalizeEmployeeId(body.employee_id);
  if (!period || !employeeId) return jsonResponse({ error: 'Solicitud inválida' }, 400);

  let target;
  try { target = await getTargetEmployee(employeeId); }
  catch (_) { return jsonResponse({ error: 'Employee service unavailable' }, 503); }
  if (!target) return jsonResponse({ error: 'Empleado de Housekeeping no encontrado' }, 404);

  if (body.action === 'liquidate') {
    if (!canLiquidateHousekeeping(actor.profile)) return jsonResponse({ error: 'Forbidden' }, 403);
    if (!isSemesterCompleted(period)) {
      return jsonResponse({ error: 'No se puede liquidar un semestre que todavía está abierto.' }, 409);
    }
    const notes = cleanNotes(body.notas);
    if (notes === null) return jsonResponse({ error: 'Notas inválidas' }, 400);
    try {
      const rows = await adminRequest('rpc/liquidate_housekeeping_semester_incentive', {
        method: 'POST',
        body: JSON.stringify({
          p_employee_id: target.id,
          p_periodo: period.id,
          p_actor_id: actor.profile.id,
          p_actor_nombre: actor.profile.nombre || actor.profile.id,
          p_notas: notes || null
        })
      });
      const record = singleRpcRecord(rows);
      if (!record) throw new Error('EMPTY_RESULT');
      return jsonResponse({ ok: true, record });
    } catch (_) {
      return jsonResponse({ error: 'No se pudo registrar la liquidación.' }, 409);
    }
  }

  return jsonResponse({ error: 'Acción inválida' }, 400);
}
