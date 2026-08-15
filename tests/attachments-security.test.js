import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';

import objectHandler from '../api/attachments/object.js';
import signDownloadHandler from '../api/attachments/sign-download.js';
import signUploadHandler from '../api/attachments/sign-upload.js';
import {
  ATTACHMENT_MAX_SIZE,
  normalizeAttachmentPath,
  normalizeAttachmentTarget,
  normalizeUploadRequest
} from '../lib/attachments-server.js';

const originalFetch = globalThis.fetch;
const originalEnv = Object.fromEntries([
  'SYNCRO_AUTH_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_KEY'
].map(key => [key, process.env[key]]));

beforeEach(() => {
  process.env.SYNCRO_AUTH_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  process.env.SUPABASE_SERVICE_KEY = 'service-test-key';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function token(version = 1) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'none' }) + '.' + encode({ app_metadata: { syncro_authz_version: version } }) + '.sig';
}

function mockAuthenticatedStorage() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return json({ id: 'auth-user' });
    if (url.includes('syncro_auth_identities?auth_user_id=')) return json([{
      employee_id: 'emp1', auth_user_id: 'auth-user', active: true,
      force_pin_change: false, authz_version: 1
    }]);
    if (url.includes('/rest/v1/employees?')) return json([{
      id: 'emp1', nombre: 'Empleado', area: 'Sala', puesto: 'Camarero',
      rol: 'empleado', estado: 'Activo'
    }]);
    if (url.includes('/rest/v1/tareas?')) return json([{
      id: 'task1', adjuntos: [], updated_at: '2026-08-14T00:00:00Z'
    }]);
    if (url.includes('/storage/v1/object/upload/sign/')) return json({
      url: '/object/upload/sign/adjuntos/tareas/task1/file.jpg?token=signed-token',
      token: 'signed-token'
    });
    if (url.includes('/storage/v1/object/sign/')) return json({
      signedURL: '/object/sign/adjuntos/tareas/task1/file.jpg?token=download-token'
    });
    throw new Error('Unexpected request: ' + url);
  };
  return calls;
}

test('attachment targets and paths are restricted to known operational records', () => {
  const target = normalizeAttachmentTarget('incidencias', 'inc_123');
  assert.deepEqual(target, { table: 'incidencias', recordId: 'inc_123' });
  assert.equal(normalizeAttachmentTarget('employees', 'emp1'), null);
  assert.equal(normalizeAttachmentTarget('tareas', '../bad'), null);
  assert.equal(normalizeAttachmentPath('incidencias/inc_123/file.pdf', target), 'incidencias/inc_123/file.pdf');
  assert.equal(normalizeAttachmentPath('incidencias/other/file.pdf', target), null);
  assert.equal(normalizeAttachmentPath('incidencias/inc_123/../secret', target), null);
});

test('upload signing rejects oversized and unapproved content types', () => {
  assert.equal(normalizeUploadRequest({
    table: 'tareas', record_id: 'task1', name: 'payload.html',
    type: 'text/html', size: 100
  }), null);
  assert.equal(normalizeUploadRequest({
    table: 'tareas', record_id: 'task1', name: 'photo.jpg',
    type: 'image/jpeg', size: ATTACHMENT_MAX_SIZE + 1
  }), null);
  const accepted = normalizeUploadRequest({
    table: 'tareas', record_id: 'task1', name: 'evidence.jpg',
    type: 'image/jpeg', size: 1024
  });
  assert.match(accepted.path, /^tareas\/task1\/[0-9a-f-]+\.jpg$/);
});

test('state-changing attachment endpoints require the application origin', async () => {
  const req = new Request('https://syncro.example/api/attachments/sign-upload', {
    method: 'POST',
    headers: { origin: 'https://attacker.example', authorization: 'Bearer fake' },
    body: '{}'
  });
  assert.equal((await signUploadHandler(req)).status, 403);

  const deleteReq = new Request('https://syncro.example/api/attachments/object', {
    method: 'DELETE',
    headers: { origin: 'https://attacker.example', authorization: 'Bearer fake' },
    body: '{}'
  });
  assert.equal((await objectHandler(deleteReq)).status, 403);
});

test('attachment endpoints reject missing sessions before contacting Storage', async () => {
  const req = new Request('https://syncro.example/api/attachments/sign-upload', {
    method: 'POST', headers: { origin: 'https://syncro.example' }, body: '{}'
  });
  assert.equal((await signUploadHandler(req)).status, 401);
});

test('authenticated endpoints return absolute signed Storage URLs after checking the parent record', async () => {
  const calls = mockAuthenticatedStorage();
  const accessToken = token();
  const uploadReq = new Request('https://syncro.example/api/attachments/sign-upload', {
    method: 'POST',
    headers: { origin: 'https://syncro.example', authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({
      table: 'tareas', record_id: 'task1', name: 'evidence.jpg',
      type: 'image/jpeg', size: 1024
    })
  });
  const uploadRes = await signUploadHandler(uploadReq);
  assert.equal(uploadRes.status, 200);
  assert.match((await uploadRes.json()).url, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/upload\/sign\//);

  const downloadReq = new Request('https://syncro.example/api/attachments/sign-download', {
    method: 'POST',
    headers: { origin: 'https://syncro.example', authorization: 'Bearer ' + accessToken },
    body: JSON.stringify({ table: 'tareas', record_id: 'task1', path: 'tareas/task1/file.jpg' })
  });
  const downloadRes = await signDownloadHandler(downloadReq);
  assert.equal(downloadRes.status, 200);
  assert.match((await downloadRes.json()).url, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/sign\//);

  assert.equal(calls.some(call => call.url.includes('/rest/v1/tareas?')), true);
  const recordChecks = calls.filter(call => call.url.includes('/rest/v1/tareas?'));
  assert.equal(recordChecks.every(call => call.url.includes('select=id&limit=1')), true);
  assert.equal(recordChecks.some(call => call.url.includes('updated_at')), false);
});

test('migration makes adjuntos private with limits and keeps a reconstructable rollback', async () => {
  const migration = await readFile(new URL(
    '../supabase/migrations/20260814192801_p0_private_attachments.sql', import.meta.url
  ), 'utf8');
  const rollback = await readFile(new URL(
    '../supabase/rollback/20260814192801_p0_private_attachments_rollback.sql', import.meta.url
  ), 'utf8');
  assert.match(migration, /set public = false/i);
  assert.match(migration, /file_size_limit = 10485760/i);
  assert.match(migration, /allowed_mime_types/i);
  assert.match(migration, /p0_adjuntos_policy_backup/i);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
  assert.match(rollback, /create policy/i);
  assert.match(rollback, /set public = backup\.public/i);
});

test('attachment integration is loaded exactly once', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<script src="adjuntos\.js"><\/script>/g) || []).length, 1);
  assert.match(html, /location\.protocol === 'file:'[\s\S]*location\.replace\('https:\/\/syncro-shift\.vercel\.app\/'\)/);
});
