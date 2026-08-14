import {
  getBearerToken, jsonResponse, readJson, requireAuthEnabled,
  requireMethod, requireSameOrigin, sessionProfile
} from '../../lib/auth-server.js';
import {
  deleteAttachmentObject, normalizeAttachmentPath, normalizeAttachmentTarget,
  recordAttachmentEvent, requireReadableRecord
} from '../../lib/attachments-server.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'DELETE');
  if (wrongMethod) return wrongMethod;
  const wrongOrigin = requireSameOrigin(req);
  if (wrongOrigin) return wrongOrigin;
  const token = getBearerToken(req);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
  try {
    const session = await sessionProfile(token);
    if (!session || session.forcePinChange) return jsonResponse({ error: 'Unauthorized' }, 401);
    const payload = await readJson(req, 4096);
    const target = normalizeAttachmentTarget(payload.table, payload.record_id);
    const path = normalizeAttachmentPath(payload.path, target);
    if (!target || !path) return jsonResponse({ error: 'Invalid attachment' }, 400);
    if (!await requireReadableRecord(token, target)) return jsonResponse({ error: 'Forbidden' }, 403);
    await deleteAttachmentObject(path);
    await recordAttachmentEvent('ATTACHMENT_OBJECT_DELETE', session.profile, target, { path });
    return jsonResponse({ deleted: true });
  } catch (error) {
    if (error.message === 'REQUEST_TOO_LARGE' || error.message === 'INVALID_JSON') return jsonResponse({ error: 'Invalid request' }, 400);
    return jsonResponse({ error: 'Attachment service unavailable' }, 503);
  }
}
