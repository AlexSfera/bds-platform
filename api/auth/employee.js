import {
  adminAuthRequest,
  adminRequest,
  beginManagementAction,
  findIdentityByEmployee,
  getManagementProfile,
  jsonResponse,
  loginContext,
  normalizeEmployeeId,
  readJson,
  recordAuthEvent,
  requireAuthEnabled,
  requireSameOrigin
} from '../../lib/auth-server.js';
import {
  canDeleteEmployee,
  canEditEmployee,
  canUpdateEmployee,
  loadManagementActor,
  normalizeEmployeeDraft
} from '../../lib/authz-server.js';
import {
  beginIdentityAuthorizationChange,
  rollbackIdentityAuthorizationChange
} from '../../lib/identity-server.js';

export const config = { runtime: 'edge' };

const AUTHZ_FIELDS = ['area', 'rol', 'estado', 'responsable', 'validador'];

function changedAuthorization(current, proposed) {
  return AUTHZ_FIELDS.some(field => String(current[field] ?? '') !== String(proposed[field] ?? ''));
}

async function emailAlreadyUsed(email, excludedEmployeeId) {
  if (!email) return false;
  const rows = await adminRequest('employees?select=id,email');
  return Array.isArray(rows) && rows.some(row =>
    row.id !== excludedEmployeeId && row.email
      && String(row.email).trim().toLowerCase() === email.toLowerCase()
  );
}

async function managementGate(req, actor) {
  const context = await loginContext(req, actor.id);
  const retryAfter = await beginManagementAction(context, 'manage_employee');
  return { context, retryAfter };
}

async function rollbackAccess(identity, change) {
  if (!identity || !change) return true;
  return !!await rollbackIdentityAuthorizationChange(identity, change.version).catch(() => null);
}

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'PATCH, DELETE' });
  }
  const crossOrigin = requireSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  let actorSession;
  try { actorSession = await loadManagementActor(req); }
  catch (_) { return jsonResponse({ error: 'Authentication unavailable' }, 503); }
  if (!actorSession) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await readJson(req, 8192); }
  catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const employeeId = normalizeEmployeeId(body.employee_id);
  if (!employeeId) return jsonResponse({ error: 'Invalid request' }, 400);

  let target;
  let identity;
  try {
    target = await getManagementProfile(employeeId);
    identity = target ? await findIdentityByEmployee(employeeId) : null;
  } catch (_) {
    return jsonResponse({ error: 'Employee service unavailable' }, 503);
  }
  if (!target) return jsonResponse({ error: 'Empleado no encontrado' }, 404);

  let gate;
  try { gate = await managementGate(req, actorSession.profile); }
  catch (_) { return jsonResponse({ error: 'Authentication unavailable' }, 503); }
  if (gate.retryAfter > 0) {
    return jsonResponse({
      error: 'Demasiadas operaciones. Espera antes de volver a intentarlo.',
      retry_after: gate.retryAfter
    }, 429);
  }

  if (req.method === 'DELETE') {
    if (!canDeleteEmployee(actorSession.profile, target)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    let accessChange = null;
    try {
      if (identity) {
        accessChange = await beginIdentityAuthorizationChange(identity, target.id, false);
      }
      await recordAuthEvent('employee_deleted', {
        employeeId: target.id,
        ipHash: gate.context.ipHash
      }, 'hard_delete', { actor_employee_id: actorSession.profile.id });
    } catch (_) {
      await rollbackAccess(identity, accessChange);
      return jsonResponse({ error: 'No se pudo preparar la eliminación' }, 503);
    }

    let deleted;
    try {
      deleted = await adminRequest('employees?id=eq.' + encodeURIComponent(target.id), {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' }
      });
    } catch (_) {
      await rollbackAccess(identity, accessChange);
      return jsonResponse({ error: 'No se pudo eliminar el empleado' }, 409);
    }
    if (!Array.isArray(deleted) || deleted.length !== 1) {
      await rollbackAccess(identity, accessChange);
      return jsonResponse({ error: 'No se pudo eliminar el empleado' }, 409);
    }

    let authCleanupPending = false;
    if (identity) {
      try {
        await adminAuthRequest('admin/users/' + encodeURIComponent(identity.auth_user_id), {
          method: 'DELETE'
        });
      } catch (_) { authCleanupPending = true; }
    }
    return jsonResponse({ ok: true, auth_cleanup_pending: authCleanupPending });
  }

  let proposed;
  let patch;
  let eventType;
  if (body.action === 'set_status') {
    if (!new Set(['Activo', 'Baja']).has(body.estado) || !canEditEmployee(actorSession.profile, target)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    proposed = { ...target, estado: body.estado };
    patch = { estado: body.estado };
    eventType = 'employee_status';
  } else if (body.action === 'update') {
    proposed = normalizeEmployeeDraft(body.employee);
    if (!proposed) return jsonResponse({ error: 'Datos de empleado no válidos' }, 400);
    if (!canUpdateEmployee(actorSession.profile, target, proposed)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    try {
      if (await emailAlreadyUsed(proposed.email, target.id)) {
        return jsonResponse({ error: 'El correo ya está en uso' }, 409);
      }
    } catch (_) {
      return jsonResponse({ error: 'Employee service unavailable' }, 503);
    }
    patch = proposed;
    eventType = 'employee_updated';
  } else {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  let accessChange = null;
  if (identity && changedAuthorization(target, proposed)) {
    try {
      accessChange = await beginIdentityAuthorizationChange(
        identity, target.id, proposed.estado === 'Activo'
      );
    } catch (_) {
      return jsonResponse({ error: 'No se pudo actualizar la autorización' }, 409);
    }
  }

  let rows;
  try {
    rows = await adminRequest('employees?id=eq.' + encodeURIComponent(target.id), {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
  } catch (_) {
    const restored = await rollbackAccess(identity, accessChange);
    return jsonResponse({
      error: restored ? 'No se pudo actualizar el empleado' : 'Authorization state unavailable'
    }, restored ? 409 : 503);
  }
  if (!Array.isArray(rows) || rows.length !== 1) {
    const restored = await rollbackAccess(identity, accessChange);
    return jsonResponse({
      error: restored ? 'No se pudo actualizar el empleado' : 'Authorization state unavailable'
    }, restored ? 409 : 503);
  }

  await recordAuthEvent(eventType, {
    employeeId: target.id,
    ipHash: gate.context.ipHash
  }, body.action, {
    actor_employee_id: actorSession.profile.id,
    authz_version: accessChange && accessChange.version
  }).catch(() => {});

  return jsonResponse({
    ok: true,
    employee: {
      id: rows[0].id,
      nombre: rows[0].nombre,
      area: rows[0].area,
      rol: rows[0].rol,
      estado: rows[0].estado
    },
    access_pending: !identity && proposed.estado === 'Activo'
  });
}
