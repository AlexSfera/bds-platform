import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import directoryHandler from '../api/auth/directory.js';
import changePinHandler from '../api/auth/change-pin.js';
import loginHandler from '../api/auth/login.js';
import {
  clearRefreshCookie,
  filterDirectory,
  isAcceptableNewPin,
  normalizeEmployeeId,
  normalizePin,
  parseCookies,
  refreshCookie
} from '../lib/auth-server.js';

const originalFetch = globalThis.fetch;
const originalEnv = {
  SYNCRO_AUTH_ENABLED: process.env.SYNCRO_AUTH_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  SYNCRO_AUTH_RATE_LIMIT_SECRET: process.env.SYNCRO_AUTH_RATE_LIMIT_SECRET,
  SYNCRO_AUTH_PIN_FINGERPRINT_SECRET: process.env.SYNCRO_AUTH_PIN_FINGERPRINT_SECRET,
  SYNCRO_AUTH_INTERNAL_EMAIL_DOMAIN: process.env.SYNCRO_AUTH_INTERNAL_EMAIL_DOMAIN,
  SYNCRO_AUTH_TEMP_PIN_TTL_MINUTES: process.env.SYNCRO_AUTH_TEMP_PIN_TTL_MINUTES
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function accessToken(version) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return encode({ alg: 'none' }) + '.'
    + encode({ app_metadata: { syncro_authz_version: version } }) + '.signature';
}

beforeEach(() => {
  process.env.SYNCRO_AUTH_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  process.env.SUPABASE_SERVICE_KEY = 'service-test-key';
  process.env.SYNCRO_AUTH_RATE_LIMIT_SECRET = 'rate-limit-test-secret-at-least-32-bytes';
  process.env.SYNCRO_AUTH_PIN_FINGERPRINT_SECRET = 'pin-fingerprint-test-secret-at-least-32-bytes';
  process.env.SYNCRO_AUTH_INTERNAL_EMAIL_DOMAIN = 'auth.example.test';
  process.env.SYNCRO_AUTH_TEMP_PIN_TTL_MINUTES = '1440';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('validates an employee identifier and an exact six-digit PIN', () => {
  assert.equal(normalizeEmployeeId('emp_123'), 'emp_123');
  assert.equal(normalizeEmployeeId('../bad'), null);
  assert.equal(normalizePin('123456'), '123456');
  assert.equal(normalizePin('12345'), null);
  assert.equal(normalizePin('1234567'), null);
  assert.equal(normalizePin('12a456'), null);
  assert.equal(isAcceptableNewPin('123456'), false);
  assert.equal(isAcceptableNewPin('000000'), false);
  assert.equal(isAcceptableNewPin('482951'), true);
});

test('refresh cookie is host-only, HttpOnly, Secure and Strict', () => {
  const cookie = refreshCookie('refresh token');
  assert.match(cookie, /^__Host-syncro-refresh=/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.doesNotMatch(cookie, /Domain=/);
  assert.match(clearRefreshCookie(), /Max-Age=0/);

  const req = new Request('https://syncro.example/', {
    headers: { cookie: cookie.split(';')[0] }
  });
  assert.equal(parseCookies(req)['__Host-syncro-refresh'], 'refresh token');
});

test('directory output excludes PIN, email and cost fields', () => {
  const rows = [{
    id: 'emp1', nombre: 'Ana', area: 'Sala', puesto: 'Camarera',
    rol: 'empleado', responsable: 0, validador: 0, estado: 'Activo',
    pin: '123456', email: 'ana@example.test', coste: 99
  }];
  const result = filterDirectory(rows, 'sala');
  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), [
    'area', 'estado', 'id', 'nombre', 'puesto', 'responsable', 'rol', 'validador'
  ]);
});

test('disabled auth endpoint is indistinguishable from a missing route', async () => {
  process.env.SYNCRO_AUTH_ENABLED = 'false';
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  const res = await directoryHandler(new Request(
    'https://syncro.example/api/auth/directory?department=sala'
  ));
  assert.equal(res.status, 404);
  assert.equal(called, false);
});

test('directory endpoint returns only the minimal active department directory', async () => {
  globalThis.fetch = async url => {
    assert.match(String(url), /\/rest\/v1\/employees\?/);
    return json([
      {
        id: 'emp1', nombre: 'Ana', area: 'Sala', puesto: 'Camarera',
        rol: 'empleado', responsable: 0, validador: 0, estado: 'Activo',
        pin: '123456', email: 'ana@example.test', coste: 99
      },
      {
        id: 'emp2', nombre: 'Luis', area: 'Cocina', puesto: 'Cocinero',
        rol: 'empleado', responsable: 0, validador: 0, estado: 'Activo'
      }
    ]);
  };
  const res = await directoryHandler(new Request(
    'https://syncro.example/api/auth/directory?department=sala'
  ));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.employees.length, 1);
  assert.equal(body.employees[0].nombre, 'Ana');
  assert.equal('pin' in body.employees[0], false);
  assert.equal('email' in body.employees[0], false);
  assert.equal('coste' in body.employees[0], false);
});

test('login keeps the refresh token out of JSON and sets a hardened cookie', async () => {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/rpc/syncro_auth_begin_login')) {
      return json({ allowed: true, retry_after_seconds: 0 });
    }
    if (url.includes('syncro_auth_identities?employee_id=')) {
      return json([{
        employee_id: 'emp1',
        auth_user_id: '11111111-1111-4111-8111-111111111111',
        auth_email: 'internal@example.test',
        active: true,
        force_pin_change: false,
        authz_version: 1,
        pin_fingerprint: 'old-fingerprint'
      }]);
    }
    if (url.includes('/auth/v1/token?grant_type=password')) {
      return json({
        access_token: accessToken(1),
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: '11111111-1111-4111-8111-111111111111' }
      });
    }
    if (url.endsWith('/auth/v1/user')) {
      return json({
        id: '11111111-1111-4111-8111-111111111111',
        app_metadata: { syncro_authz_version: 1 }
      });
    }
    if (url.includes('syncro_auth_identities?auth_user_id=')) {
      return json([{
        employee_id: 'emp1',
        auth_user_id: '11111111-1111-4111-8111-111111111111',
        active: true,
        force_pin_change: false,
        authz_version: 1,
        pin_fingerprint: 'old-fingerprint'
      }]);
    }
    if (url.includes('/rest/v1/employees?id=')) {
      return json([{
        id: 'emp1', nombre: 'Ana', area: 'Sala', puesto: 'Camarera',
        rol: 'empleado', responsable: 0, validador: 0, estado: 'Activo'
      }]);
    }
    if (url.includes('/rpc/syncro_auth_finish_login')) {
      return json({ ok: true });
    }
    throw new Error('Unexpected URL: ' + url);
  };

  const req = new Request('https://syncro.example/api/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://syncro.example',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7'
    },
    body: JSON.stringify({ employee_id: 'emp1', pin: '123456' })
  });
  const res = await loginHandler(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.access_token, accessToken(1));
  assert.equal(body.profile.id, 'emp1');
  assert.equal('refresh_token' in body, false);
  assert.match(res.headers.get('set-cookie'), /^__Host-syncro-refresh=/);
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);
  assert.ok(calls.some(call => call.url.includes('/rpc/syncro_auth_begin_login')));
  assert.ok(calls.some(call => call.url.includes('/rpc/syncro_auth_finish_login')));
});

test('login rejects a request from another origin before reading credentials', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  const req = new Request('https://syncro.example/api/auth/login', {
    method: 'POST',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ employee_id: 'emp1', pin: '123456' })
  });
  const res = await loginHandler(req);
  assert.equal(res.status, 403);
  assert.equal(called, false);
});

test('login accepts only six digits before any external request', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  const req = new Request('https://syncro.example/api/auth/login', {
    method: 'POST',
    headers: { origin: 'https://syncro.example', 'content-type': 'application/json' },
    body: JSON.stringify({ employee_id: 'emp1', pin: '1234' })
  });
  const res = await loginHandler(req);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'No se pudo iniciar sesión' });
  assert.equal(called, false);
});

test('PIN change rejects a common sequence before any external request', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  const req = new Request('https://syncro.example/api/auth/change-pin', {
    method: 'POST',
    headers: {
      origin: 'https://syncro.example',
      authorization: 'Bearer ' + accessToken(1),
      'content-type': 'application/json'
    },
    body: JSON.stringify({ current_pin: '482951', new_pin: '123456' })
  });
  const res = await changePinHandler(req);
  assert.equal(res.status, 400);
  assert.equal(called, false);
});

test('PIN change reauthenticates, updates Auth and revokes the session', async () => {
  let passwordUpdate = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    if (url.endsWith('/auth/v1/user') && method === 'GET') {
      return json({
        id: '11111111-1111-4111-8111-111111111111',
        app_metadata: { syncro_authz_version: 1 }
      });
    }
    if (url.includes('syncro_auth_identities?auth_user_id=')) {
      return json([{
        employee_id: 'emp1',
        auth_user_id: '11111111-1111-4111-8111-111111111111',
        active: true,
        force_pin_change: true,
        authz_version: 1,
        pin_fingerprint: 'old-fingerprint',
        temporary_pin_expires_at: '2999-01-01T00:00:00.000Z'
      }]);
    }
    if (url.includes('/rest/v1/employees?id=')) {
      return json([{
        id: 'emp1', nombre: 'Ana', area: 'Sala', puesto: 'Camarera',
        rol: 'empleado', responsable: 0, validador: 0, estado: 'Activo'
      }]);
    }
    if (url.includes('/rpc/syncro_auth_begin_login')) {
      return json({ allowed: true, retry_after_seconds: 0 });
    }
    if (url.includes('syncro_auth_identities?employee_id=') && method === 'GET') {
      return json([{
        employee_id: 'emp1',
        auth_user_id: '11111111-1111-4111-8111-111111111111',
        auth_email: 'internal@example.test',
        active: true,
        force_pin_change: true,
        authz_version: 1,
        pin_fingerprint: 'old-fingerprint',
        temporary_pin_expires_at: '2999-01-01T00:00:00.000Z'
      }]);
    }
    if (url.includes('/auth/v1/token?grant_type=password')) {
      return json({ user: { id: '11111111-1111-4111-8111-111111111111' } });
    }
    if (url.includes('/auth/v1/admin/users/') && method === 'PUT') {
      passwordUpdate = JSON.parse(init.body);
      return json({ id: '11111111-1111-4111-8111-111111111111' });
    }
    if (url.includes('syncro_auth_identities?employee_id=') && method === 'PATCH') {
      const update = JSON.parse(init.body);
      assert.equal(update.force_pin_change, false);
      assert.equal(update.authz_version, 2);
      assert.equal(typeof update.pin_fingerprint, 'string');
      return json([{ employee_id: 'emp1', ...update }]);
    }
    if (url.includes('/rpc/syncro_auth_finish_login')) return json({ ok: true });
    if (url.endsWith('/rest/v1/syncro_auth_audit')) return new Response(null, { status: 201 });
    if (url.includes('/auth/v1/logout?scope=global')) return new Response(null, { status: 204 });
    throw new Error('Unexpected URL: ' + method + ' ' + url);
  };

  const req = new Request('https://syncro.example/api/auth/change-pin', {
    method: 'POST',
    headers: {
      origin: 'https://syncro.example',
      authorization: 'Bearer ' + accessToken(1),
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7'
    },
    body: JSON.stringify({ current_pin: '482951', new_pin: '739204' })
  });
  const res = await changePinHandler(req);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(passwordUpdate, {
    password: '739204',
    app_metadata: {
      syncro_employee_id: 'emp1',
      syncro_authz_version: 2
    }
  });
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
});
