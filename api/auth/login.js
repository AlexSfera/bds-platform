import {
  authRequest,
  beginLoginAttempt,
  findIdentityByEmployee,
  finishLoginAttempt,
  identityAllowsLogin,
  jsonResponse,
  loginContext,
  normalizeEmployeeId,
  normalizePin,
  publicSession,
  readJson,
  refreshCookie,
  requireAuthEnabled,
  requireMethod,
  requireSameOrigin,
  sessionProfile
} from '../../lib/auth-server.js';

export const config = { runtime: 'edge' };

function genericLoginError() {
  return jsonResponse({ error: 'No se pudo iniciar sesión' }, 401);
}

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'POST');
  if (wrongMethod) return wrongMethod;
  const crossOrigin = requireSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  let body;
  try { body = await readJson(req); }
  catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }

  const employeeId = normalizeEmployeeId(body.employee_id);
  const pin = normalizePin(body.pin);
  if (!employeeId || !pin) return genericLoginError();

  let context;
  try {
    context = await loginContext(req, employeeId);
    const gate = await beginLoginAttempt(context);
    if (!gate || gate.allowed !== true) {
      return jsonResponse({
        error: 'Demasiados intentos. Espera antes de volver a intentarlo.',
        retry_after: Math.max(1, Number(gate && gate.retry_after_seconds) || 60)
      }, 429);
    }
  } catch (_) {
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }

  let identity = null;
  try { identity = await findIdentityByEmployee(employeeId); }
  catch (_) {
    await finishLoginAttempt(context, false, 'identity_lookup_failed').catch(() => {});
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }

  const authEmail = identityAllowsLogin(identity)
    ? identity.auth_email
    : 'invalid-login@invalid.local';

  let authResult;
  try {
    authResult = await authRequest('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: authEmail, password: pin })
    });
  } catch (_) {
    await finishLoginAttempt(context, false, 'auth_unavailable').catch(() => {});
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }

  if (!authResult.res.ok || !authResult.body || !authResult.body.access_token) {
    await finishLoginAttempt(context, false, 'invalid_credentials').catch(() => {});
    return genericLoginError();
  }

  const sessionData = await sessionProfile(authResult.body.access_token).catch(() => null);
  const expectedUser = identity && identity.auth_user_id;
  const actualUser = authResult.body.user && authResult.body.user.id;
  if (!sessionData || !expectedUser || actualUser !== expectedUser) {
    await finishLoginAttempt(context, false, 'identity_mismatch').catch(() => {});
    return genericLoginError();
  }

  await finishLoginAttempt(context, true, 'success').catch(() => {});
  return jsonResponse(publicSession(authResult.body, sessionData), 200, {
    'Set-Cookie': refreshCookie(authResult.body.refresh_token)
  });
}
