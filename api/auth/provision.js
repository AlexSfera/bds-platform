import {
  adminRequest,
  beginManagementAction,
  jsonResponse,
  loginContext,
  readJson,
  recordAuthEvent,
  requireAuthEnabled,
  requireMethod,
  requireSameOrigin
} from '../../lib/auth-server.js';
import {
  canCreateEmployee,
  loadManagementActor,
  normalizeEmployeeDraft
} from '../../lib/authz-server.js';
import { sendTemporaryPinEmail } from '../../lib/email-server.js';
import { provisionEmployeeIdentity } from '../../lib/identity-server.js';

export const config = { runtime: 'edge' };

function madridDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return value.year + '-' + value.month + '-' + value.day;
}

function newEmployeeId() {
  return 'E' + Date.now() + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
}

async function emailAlreadyUsed(email) {
  if (!email) return false;
  const rows = await adminRequest('employees?select=id,email');
  return Array.isArray(rows) && rows.some(row =>
    row.email && String(row.email).trim().toLowerCase() === email.toLowerCase()
  );
}

async function deleteNewEmployee(employeeId) {
  await adminRequest('employees?id=eq.' + encodeURIComponent(employeeId), {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  }).catch(() => {});
}

async function deliveryResult(req, target, pin, actor) {
  if (!target.email) return { delivery: 'in_person', temporary_pin: pin };
  const sent = await sendTemporaryPinEmail({
    kind: 'provision', target, pin, actor, appUrl: new URL(req.url).origin
  });
  if (sent.ok) return { delivery: 'email' };
  return {
    delivery: 'in_person_fallback',
    temporary_pin: pin,
    delivery_warning: 'No se pudo enviar el correo; entrega el PIN en persona.'
  };
}

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'POST');
  if (wrongMethod) return wrongMethod;
  const crossOrigin = requireSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  let actorSession;
  try { actorSession = await loadManagementActor(req); }
  catch (_) { return jsonResponse({ error: 'Authentication unavailable' }, 503); }
  if (!actorSession) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await readJson(req, 8192); }
  catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const draft = normalizeEmployeeDraft(body);
  if (!draft) return jsonResponse({ error: 'Datos de empleado no válidos' }, 400);
  if (!canCreateEmployee(actorSession.profile, draft)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  let actorContext;
  try {
    actorContext = await loginContext(req, actorSession.profile.id);
    const retryAfter = await beginManagementAction(actorContext, 'provision');
    if (retryAfter > 0) {
      return jsonResponse({
        error: 'Demasiadas altas. Espera antes de volver a intentarlo.',
        retry_after: retryAfter
      }, 429);
    }
  } catch (_) {
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }

  try {
    if (await emailAlreadyUsed(draft.email)) {
      return jsonResponse({ error: 'El correo ya está en uso' }, 409);
    }
  } catch (_) {
    return jsonResponse({ error: 'Employee service unavailable' }, 503);
  }

  const employee = {
    ...draft,
    id: newEmployeeId(),
    pin: null,
    fecha_alta: madridDate(),
    created_at: new Date().toISOString()
  };
  try {
    const rows = await adminRequest('employees', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(employee)
    });
    if (!Array.isArray(rows) || rows.length !== 1) {
      return jsonResponse({ error: 'No se pudo crear el empleado' }, 502);
    }
  } catch (_) {
    return jsonResponse({ error: 'No se pudo crear el empleado' }, 409);
  }

  let identity;
  try { identity = await provisionEmployeeIdentity(employee); }
  catch (_) {
    await deleteNewEmployee(employee.id);
    return jsonResponse({ error: 'No se pudo crear el acceso del empleado' }, 503);
  }

  const delivery = await deliveryResult(req, employee, identity.pin, actorSession.profile);
  try {
    const context = { employeeId: employee.id, ipHash: actorContext.ipHash };
    await recordAuthEvent('identity_provisioned', context, 'employee_created', {
      actor_employee_id: actorSession.profile.id,
      delivery: delivery.delivery
    });
  } catch (_) {}

  return jsonResponse({
    ok: true,
    employee: { id: employee.id, nombre: employee.nombre, area: employee.area, rol: employee.rol },
    ...delivery
  }, 201);
}
