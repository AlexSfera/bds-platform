import {
  getBearerToken,
  jsonResponse,
  requireAuthEnabled,
  requireMethod,
  sessionProfile
} from '../../lib/auth-server.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'GET');
  if (wrongMethod) return wrongMethod;

  const accessToken = getBearerToken(req);
  if (!accessToken) return jsonResponse({ error: 'Unauthorized' }, 401);
  try {
    const sessionData = await sessionProfile(accessToken);
    if (!sessionData) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse(sessionData);
  } catch (_) {
    return jsonResponse({ error: 'Authentication unavailable' }, 503);
  }
}
