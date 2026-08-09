import {
  beginManagementAction,
  findIdentityByEmployee,
  getManagementProfile,
  jsonResponse,
  loginContext,
  normalizeEmployeeId,
  readJson,
  recordAuthEvent,
  requireAuthEnabled,
  requireMethod,
  requireSameOrigin
} from '../../lib/auth-server.js';
import {
  canResetEmployeePin,
  loadManagementActor
} from '../../lib/authz-server.js';
import { sendTemporaryPinEmail } from '../../lib/email-server.js';
import {
  provisionEmployeeIdentity,
  resetEmployeeIdentityPin
} from '../../lib/identity-server.js';

export const config = { runtime: 'edge' };

async function deliveryResult(req, target, pin, actor) {
  if (!target.email) return { delivery: 'in_person', temporary_pin: pin };
  const sent = await sendTemporaryPinEmail({
    kind: 'reset', target, pin, actor, appUrl: new URL(req.url).origin
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
  try { body = await readJson(req); }
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
  if (!canResetEmployeePin(actorSession.profile, target)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  let actorContext;
  try {
    actorContext = await loginContext(req, actorSession.profile.id);
    const retryAfter = await beginManagementAction(actorContext, 'reset_pin');
    if (retryAfter > 0) {
      return jsonResponse({
        error: 'Demasiados restablecimientos. Espera antes de volver a intentarlo.',
        retry_after: retryAfter
      }, 429);
    }
  } catch (_) {
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }

  let reset;
  try {
    reset = identity
      ? await resetEmployeeIdentityPin(identity, target)
      : await provisionEmployeeIdentity(target);
  } catch (error) {
    const status = error && error.message === 'IDENTITY_CHANGED_CONCURRENTLY' ? 409 : 503;
    return jsonResponse({ error: 'No se pudo restablecer el PIN' }, status);
  }

  const delivery = await deliveryResult(req, target, reset.pin, actorSession.profile);
  try {
    const context = { employeeId: target.id, ipHash: actorContext.ipHash };
    await recordAuthEvent('pin_reset', context, identity ? 'reset' : 'identity_created', {
      actor_employee_id: actorSession.profile.id,
      delivery: delivery.delivery
    });
  } catch (_) {}

  return jsonResponse({
    ok: true,
    employee: { id: target.id, nombre: target.nombre },
    force_pin_change: true,
    ...delivery
  });
}
