import {
  adminAuthRequest,
  authRequest,
  beginLoginAttempt,
  clearRefreshCookie,
  findIdentityByEmployee,
  finishLoginAttempt,
  getBearerToken,
  isAcceptableNewPin,
  jsonResponse,
  loginContext,
  normalizePin,
  readJson,
  recordAuthEvent,
  requireAuthEnabled,
  requireMethod,
  requireSameOrigin,
  sessionProfile
} from '../../lib/auth-server.js';
import {
  reserveSelfSelectedPin,
  rollbackSelfSelectedPin
} from '../../lib/identity-server.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'POST');
  if (wrongMethod) return wrongMethod;
  const crossOrigin = requireSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const accessToken = getBearerToken(req);
  if (!accessToken) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await readJson(req); }
  catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const currentPin = normalizePin(body.current_pin);
  const newPin = normalizePin(body.new_pin);
  if (!currentPin || !newPin || currentPin === newPin || !isAcceptableNewPin(newPin)) {
    return jsonResponse({ error: 'El nuevo PIN no cumple los requisitos' }, 400);
  }

  let sessionData;
  try { sessionData = await sessionProfile(accessToken); }
  catch (_) { return jsonResponse({ error: 'Authentication unavailable' }, 503); }
  if (!sessionData) return jsonResponse({ error: 'Unauthorized' }, 401);

  const employeeId = sessionData.profile.id;
  let context;
  let identity;
  try {
    context = await loginContext(req, employeeId);
    const gate = await beginLoginAttempt(context);
    if (!gate || gate.allowed !== true) {
      return jsonResponse({
        error: 'Demasiados intentos. Espera antes de volver a intentarlo.',
        retry_after: Math.max(1, Number(gate && gate.retry_after_seconds) || 60)
      }, 429);
    }
    identity = await findIdentityByEmployee(employeeId);
  } catch (_) {
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }
  if (!identity || !identity.active) return jsonResponse({ error: 'Unauthorized' }, 401);

  let reauth;
  try {
    reauth = await authRequest('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: identity.auth_email, password: currentPin })
    });
  } catch (_) {
    await finishLoginAttempt(context, false, 'pin_change_auth_unavailable').catch(() => {});
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }
  const reauthUser = reauth.body && reauth.body.user && reauth.body.user.id;
  if (!reauth.res.ok || reauthUser !== identity.auth_user_id) {
    await finishLoginAttempt(context, false, 'pin_change_invalid_current').catch(() => {});
    return jsonResponse({ error: 'No se pudo cambiar el PIN' }, 401);
  }

  let reservation;
  try {
    reservation = await reserveSelfSelectedPin(identity, newPin);
  } catch (error) {
    if (error && error.status === 409) {
      return jsonResponse({ error: 'Elige otro PIN personal' }, 409);
    }
    return jsonResponse({ error: 'No se pudo cambiar el PIN' }, 409);
  }

  try {
    await adminAuthRequest('admin/users/' + encodeURIComponent(identity.auth_user_id), {
      method: 'PUT',
      body: JSON.stringify({
        password: newPin,
        app_metadata: {
          syncro_employee_id: employeeId,
          syncro_authz_version: reservation.version
        }
      })
    });
  } catch (_) {
    const rolledBack = await rollbackSelfSelectedPin(identity, reservation.version).catch(() => null);
    return jsonResponse({
      error: rolledBack ? 'No se pudo cambiar el PIN' : 'Authentication state unavailable'
    }, rolledBack ? 503 : 409);
  }

  await finishLoginAttempt(context, true, 'pin_change_reauth').catch(() => {});
  await recordAuthEvent('pin_change', context, 'self_service', {
    authz_version: reservation.version
  }).catch(() => {});

  await authRequest('logout?scope=global', { method: 'POST' }, accessToken).catch(() => {});
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': clearRefreshCookie()
  });
}
