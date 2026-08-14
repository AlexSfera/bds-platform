import { adminRequest, optionalEnv } from './auth-server.js';

export const ATTACHMENT_BUCKET = 'adjuntos';
export const ATTACHMENT_TABLES = new Set(['gestiones', 'incidencias', 'tareas']);
export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

function storageBase(path) {
  const base = optionalEnv('SUPABASE_URL').replace(/\/$/, '');
  if (!base) throw new Error('Missing server environment: SUPABASE_URL');
  return base + '/storage/v1' + path;
}

export function absoluteStorageUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^https:\/\//i.test(value)) return value;
  const base = optionalEnv('SUPABASE_URL').replace(/\/$/, '');
  if (!base) throw new Error('Missing server environment: SUPABASE_URL');
  if (value.startsWith('/storage/v1/')) return base + value;
  return base + '/storage/v1/' + value.replace(/^\//, '');
}

async function storageAdmin(path, init = {}) {
  const key = optionalEnv('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Missing server environment: SUPABASE_SERVICE_KEY');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', key);
  headers.set('Authorization', 'Bearer ' + key);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(storageBase(path), { ...init, headers });
  let body = null;
  try { body = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error('STORAGE_ADMIN_' + response.status);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function normalizeAttachmentTarget(table, recordId) {
  const safeTable = typeof table === 'string' ? table.trim() : '';
  const safeId = typeof recordId === 'string' ? recordId.trim() : '';
  if (!ATTACHMENT_TABLES.has(safeTable)) return null;
  if (!safeId || safeId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(safeId)) return null;
  return { table: safeTable, recordId: safeId };
}

export function normalizeAttachmentPath(value, target = null) {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path || path.length > 512 || path.includes('..') || path.startsWith('/')) return null;
  if (!/^[A-Za-z0-9._\/-]+$/.test(path)) return null;
  if (target && !path.startsWith(target.table + '/' + target.recordId + '/')) return null;
  return path;
}

export function normalizeUploadRequest(payload) {
  const target = normalizeAttachmentTarget(payload && payload.table, payload && payload.record_id);
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  const type = typeof payload?.type === 'string' ? payload.type.trim().toLowerCase() : '';
  const size = Number(payload?.size);
  if (!target || !name || name.length > 180 || !Number.isSafeInteger(size) || size < 1 || size > ATTACHMENT_MAX_SIZE) return null;
  if (!ATTACHMENT_MIME_TYPES.has(type)) return null;
  const extension = name.includes('.') ? '.' + name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const path = target.table + '/' + target.recordId + '/' + crypto.randomUUID() + extension;
  return { ...target, name, type, size, path };
}

export async function requireReadableRecord(accessToken, target) {
  const key = optionalEnv('SUPABASE_PUBLISHABLE_KEY');
  const base = optionalEnv('SUPABASE_URL').replace(/\/$/, '');
  if (!key || !base) throw new Error('Missing Supabase server environment');
  const url = base + '/rest/v1/' + target.table + '?id=eq.' + encodeURIComponent(target.recordId) + '&select=id,adjuntos,updated_at&limit=1';
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: 'Bearer ' + accessToken }
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

export async function createSignedUpload(path) {
  return storageAdmin('/object/upload/sign/' + ATTACHMENT_BUCKET + '/' + path, {
    method: 'POST',
    body: JSON.stringify({ upsert: false })
  });
}

export async function createSignedDownload(path, expiresIn = 300) {
  return storageAdmin('/object/sign/' + ATTACHMENT_BUCKET + '/' + path, {
    method: 'POST',
    body: JSON.stringify({ expiresIn })
  });
}

export async function deleteAttachmentObject(path) {
  await storageAdmin('/object/' + ATTACHMENT_BUCKET + '/' + path, { method: 'DELETE' });
}

export async function recordAttachmentEvent(eventType, profile, target, detail) {
  return adminRequest('syncro_auth_audit', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      event_type: eventType,
      employee_id: profile.id,
      reason: 'attachment',
      detail: { table: target.table, record_id: target.recordId, ...detail }
    })
  });
}
