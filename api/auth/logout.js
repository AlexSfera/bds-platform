import {
  authRequest,
  clearRefreshCookie,
  getBearerToken,
  jsonResponse,
  requireAuthEnabled,
  requireMethod,
  requireSameOrigin
} from '../../lib/auth-server.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'POST');
  if (wrongMethod) return wrongMethod;
  const crossOrigin = requireSameOrigin(req);
  if (crossOrigin) return crossOrigin;

  const accessToken = getBearerToken(req);
  if (accessToken) {
    await authRequest('logout?scope=local', { method: 'POST' }, accessToken).catch(() => {});
  }
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': clearRefreshCookie()
  });
}
