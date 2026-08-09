import {
  authRequest,
  clearRefreshCookie,
  getRefreshToken,
  jsonResponse,
  publicSession,
  refreshCookie,
  requireAuthEnabled,
  requireMethod,
  requireSameOrigin,
  sessionProfile
} from '../../lib/auth-server.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'POST');
  if (wrongMethod) return wrongMethod;
  const crossOrigin = requireSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const refreshToken = getRefreshToken(req);
  if (!refreshToken) return jsonResponse({ error: 'No active session' }, 401);

  try {
    const authResult = await authRequest('token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!authResult.res.ok || !authResult.body || !authResult.body.access_token) {
      return jsonResponse({ error: 'No active session' }, 401, {
        'Set-Cookie': clearRefreshCookie()
      });
    }
    const sessionData = await sessionProfile(authResult.body.access_token);
    if (!sessionData) {
      return jsonResponse({ error: 'No active session' }, 401, {
        'Set-Cookie': clearRefreshCookie()
      });
    }
    return jsonResponse(publicSession(authResult.body, sessionData), 200, {
      'Set-Cookie': refreshCookie(authResult.body.refresh_token)
    });
  } catch (_) {
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }
}
