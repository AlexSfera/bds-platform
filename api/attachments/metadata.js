import {
  adminRequest, getBearerToken, jsonResponse, readJson, requireAuthEnabled,
  requireMethod, requireSameOrigin, sessionProfile
} from '../../lib/auth-server.js';
import {
  normalizeAttachmentMetadata, normalizeAttachmentPath, normalizeAttachmentTarget,
  requireManageableRecord
} from '../../lib/attachments-server.js';

export const config = { runtime: 'edge' };

function parseAttachments(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

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
    const payload = await readJson(req, 8192);
    const target = normalizeAttachmentTarget(payload.table, payload.record_id);
    if (!target) return jsonResponse({ error: 'Invalid attachment' }, 400);
    if (!await requireManageableRecord(token, target, session.profile)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const rows = await adminRequest(
      target.table + '?id=eq.' + encodeURIComponent(target.recordId) + '&select=id,adjuntos&limit=1'
    );
    if (!Array.isArray(rows) || rows.length !== 1) return jsonResponse({ error: 'Record not found' }, 404);
    let next = parseAttachments(rows[0].adjuntos);

    if (payload.action === 'add') {
      if (!Array.isArray(payload.attachments) || !payload.attachments.length) {
        return jsonResponse({ error: 'Invalid attachment' }, 400);
      }
      const additions = payload.attachments.map(item =>
        normalizeAttachmentMetadata(item, target, session.profile)
      );
      if (additions.some(item => !item)) return jsonResponse({ error: 'Invalid attachment' }, 400);
      const knownPaths = new Set(next.map(item => item && item.path).filter(Boolean));
      for (const item of additions) {
        if (!knownPaths.has(item.path)) {
          next.push(item);
          knownPaths.add(item.path);
        }
      }
      if (next.length > 5) return jsonResponse({ error: 'Too many attachments' }, 409);
    } else if (payload.action === 'remove') {
      const path = normalizeAttachmentPath(payload.path, target);
      if (!path) return jsonResponse({ error: 'Invalid attachment' }, 400);
      next = next.filter(item => item && item.path !== path);
    } else {
      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    const updated = await adminRequest(
      target.table + '?id=eq.' + encodeURIComponent(target.recordId) + '&select=id',
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ adjuntos: JSON.stringify(next) })
      }
    );
    if (!Array.isArray(updated) || updated.length !== 1) {
      return jsonResponse({ error: 'Attachment metadata not saved' }, 409);
    }
    return jsonResponse({ attachments: next });
  } catch (error) {
    if (error.message === 'REQUEST_TOO_LARGE' || error.message === 'INVALID_JSON') {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }
    console.error('ATTACHMENT_METADATA_FAILED', error?.message || 'unknown');
    return jsonResponse({ error: 'Attachment service unavailable' }, 503);
  }
}
