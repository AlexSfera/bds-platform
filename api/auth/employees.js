import {
  adminRequest,
  jsonResponse,
  requireAuthEnabled,
  requireMethod
} from '../../lib/auth-server.js';
import {
  isAdjuntoProfile,
  isAdminProfile,
  loadManagementActor,
  supervisorDepartments,
  targetIsInScope
} from '../../lib/authz-server.js';

export const config = { runtime: 'edge' };

const SAFE_FIELDS = Object.freeze([
  'id', 'nombre', 'area', 'puesto', 'rol', 'responsable', 'validador',
  'estado', 'fecha_alta'
]);

function pick(row, fields) {
  return Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field]]));
}

function withoutSensitiveIdentity(row) {
  const safe = { ...row };
  delete safe.pin;
  return safe;
}

export function employeeListForActor(rows, actor) {
  const canSeeAll = isAdminProfile(actor) || isAdjuntoProfile(actor);
  const isAccounting = actor && actor.rol === 'contable';
  const isSupervisor = supervisorDepartments(actor).length > 0;
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && (
      canSeeAll || row.estado === 'Activo' || row.id === actor.id
        || (isSupervisor && targetIsInScope(actor, row))
    ))
    .map(row => {
      if (canSeeAll || (isSupervisor && targetIsInScope(actor, row))) {
        return withoutSensitiveIdentity(row);
      }
      const safe = pick(row, SAFE_FIELDS);
      if (row.id === actor.id && 'email' in row) safe.email = row.email;
      if (isAccounting && 'coste' in row) safe.coste = row.coste;
      return safe;
    });
}

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'GET');
  if (wrongMethod) return wrongMethod;

  let actorSession;
  try { actorSession = await loadManagementActor(req); }
  catch (_) { return jsonResponse({ error: 'Authentication unavailable' }, 503); }
  if (!actorSession) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    const rows = await adminRequest('employees?select=*&order=nombre.asc');
    return jsonResponse({ employees: employeeListForActor(rows, actorSession.profile) });
  } catch (_) {
    return jsonResponse({ error: 'Employee service unavailable' }, 503);
  }
}
