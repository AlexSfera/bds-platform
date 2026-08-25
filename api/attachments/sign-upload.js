import {
  getBearerToken, jsonResponse, readJson, requireAuthEnabled,
  requireMethod, requireSameOrigin, sessionProfile
} from '../../lib/auth-server.js';
import {
  absoluteStorageUrl, createSignedUpload, normalizeUploadRequest, requireReadableRecord
} from '../../lib/attachments-server.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'POST');
  if (wrongMethod) return wrongMethod;
  const wrongOrigin = requireSameOrigin(req);
  if (wrongOrigin) return wrongOrigin;
  const token = getBearerToken(req);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
  try {
    const session = await sessionProfile(token);
    if (!session || session.forcePinChange) return jsonResponse({ error: 'Unauthorized' }, 401);
    const upload = normalizeUploadRequest(await readJson(req, 2048));
    if (!upload) return jsonResponse({ error: 'Invalid attachment' }, 400);
    if (!await requireReadableRecord(token, upload)) return jsonResponse({ error: 'Forbidden' }, 403);
    const signed = await createSignedUpload(upload.path);
    const rawUrl = signed?.url || signed?.signedURL || signed?.signedUrl || null;
    return jsonResponse({ path: upload.path, token: signed?.token || null, url: absoluteStorageUrl(rawUrl) });
  } catch (error) {
    if (error.message === 'REQUEST_TOO_LARGE' || error.message === 'INVALID_JSON') return jsonResponse({ error: 'Invalid request' }, 400);
    return jsonResponse({ error: 'Attachment service unavailable' }, 503);
  }
}
