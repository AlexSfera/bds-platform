import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import provisionHandler from '../api/auth/provision.js';
import resetPinHandler from '../api/auth/reset-pin.js';
import employeeHandler from '../api/auth/employee.js';
import sendEmailHandler from '../api/send-email.js';
import {
  authzVersionFromAccessToken,
  createTechnicalAuthEmail,
  generateTemporaryPin,
  identityAllowsLogin,
  isAcceptableNewPin
} from '../lib/auth-server.js';
import {
  canCreateEmployee,
  canDeleteEmployee,
  canEditEmployee,
  canResetEmployeePin,
  canUpdateEmployee,
  normalizeEmployeeDraft
} from '../lib/authz-server.js';

const originalFetch = globalThis.fetch;
const trackedEnv = [
  'SYNCRO_AUTH_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_KEY', 'SYNCRO_AUTH_RATE_LIMIT_SECRET',
  'SYNCRO_AUTH_PIN_FINGERPRINT_SECRET', 'SYNCRO_AUTH_INTERNAL_EMAIL_DOMAIN',
  'SYNCRO_AUTH_TEMP_PIN_TTL_MINUTES', 'RESEND_API_KEY', 'SYNCRO_EMAIL_FROM'
];
const originalEnv = Object.fromEntries(trackedEnv.map(key => [key, process.env[key]]));

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
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of trackedEnv) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test('temporary PINs are exact, non-trivial six-digit values and technical emails are isolated', () => {
  for (let index = 0; index < 64; index += 1) {
    const pin = generateTemporaryPin();
    assert.match(pin, /^\d{6}$/);
    assert.equal(isAcceptableNewPin(pin), true);
  }
  const email = createTechnicalAuthEmail();
  assert.match(email, /^syncro-[0-9a-f-]+@auth\.example\.test$/);
  assert.equal(authzVersionFromAccessToken(accessToken(7)), 7);
  assert.equal(authzVersionFromAccessToken('not-a-jwt'), null);
  assert.equal(identityAllowsLogin({ active: true, force_pin_change: false }), true);
  assert.equal(identityAllowsLogin({
    active: true, force_pin_change: true, temporary_pin_expires_at: '2000-01-01T00:00:00Z'
  }), false);
});

test('server authorization preserves admin, adjunto, F&B and department boundaries', () => {
  const employeeSala = { rol: 'empleado', area: 'Sala' };
  const employeeCocina = { rol: 'empleado', area: 'Cocina' };
  const adminTarget = { rol: 'admin', area: 'Administración' };
  assert.equal(canCreateEmployee({ id: 'a', rol: 'admin' }, adminTarget), true);
  assert.equal(canCreateEmployee({ id: 'd', rol: 'adjunto' }, adminTarget), false);
  assert.equal(canCreateEmployee({ id: 'f', rol: 'fb' }, employeeSala), true);
  assert.equal(canCreateEmployee({ id: 'f', rol: 'fb' }, { rol: 'empleado', area: 'Recepción' }), false);
  assert.equal(canCreateEmployee({ id: 'j', rol: 'jefe', area: 'Sala' }, employeeSala), true);
  assert.equal(canCreateEmployee({ id: 'j', rol: 'jefe', area: 'Sala' }, employeeCocina), false);
  assert.equal(canResetEmployeePin({ id: 'd', rol: 'adjunto' }, employeeSala), true);
  assert.equal(canResetEmployeePin({ id: 'd', rol: 'adjunto' }, { rol: 'jefe', area: 'Sala' }), false);
  assert.equal(canEditEmployee({ id: 'j', rol: 'jefe', area: 'Sala' }, employeeSala), true);
  assert.equal(canUpdateEmployee(
    { id: 'j', rol: 'jefe', area: 'Sala' },
    { ...employeeSala, validador: 0 },
    { ...employeeSala, validador: 1 }
  ), false);
  assert.equal(canDeleteEmployee(
    { id: 'admin1', rol: 'admin' }, { id: 'target', rol: 'empleado', estado: 'Baja' }
  ), true);
  assert.equal(canDeleteEmployee(
    { id: 'admin1', rol: 'admin' }, { id: 'admin1', rol: 'admin', estado: 'Baja' }
  ), false);
});

test('employee input derives area from the position and ignores a forged browser area', () => {
  const draft = normalizeEmployeeDraft({
    nombre: 'Ana', puesto: 'Camarera', area: 'Administración', rol: 'empleado',
    email: 'ana@example.test', obs: '', estado: 'Activo', coste: 14,
    responsable: 0, validador: 0
  });
  assert.equal(draft.area, 'Sala');
  assert.equal('pin' in draft, false);
});

test('secure mode disables the legacy client-controlled email endpoint', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  const res = await sendEmailHandler(new Request('https://syncro.example/api/send-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tipo: 'pin_cambiado', nombre: 'Víctima', email: 'victim@example.test', pin: '123456'
    })
  }));
  assert.equal(res.status, 404);
  assert.equal(called, false);
});

test('reset endpoint generates the PIN server-side and returns it once only for in-person delivery', async () => {
  let authPassword = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    if (url.endsWith('/auth/v1/user') && method === 'GET') {
      return json({
        id: '11111111-1111-4111-8111-111111111111',
        app_metadata: { syncro_authz_version: 3 }
      });
    }
    if (url.includes('syncro_auth_identities?auth_user_id=')) {
      return json([{
        employee_id: 'actor1', auth_user_id: '11111111-1111-4111-8111-111111111111',
        active: true, force_pin_change: false, authz_version: 3, pin_fingerprint: 'actor-fp'
      }]);
    }
    if (url.includes('employees?id=eq.actor1')) {
      return json([{
        id: 'actor1', nombre: 'Admin', area: 'Administración', puesto: 'Administrador',
        rol: 'admin', responsable: 1, validador: 1, estado: 'Activo'
      }]);
    }
    if (url.includes('employees?id=eq.target1')) {
      return json([{
        id: 'target1', nombre: 'Ana', email: '', area: 'Sala', puesto: 'Camarera',
        rol: 'empleado', responsable: 0, validador: 0, estado: 'Activo'
      }]);
    }
    if (url.includes('syncro_auth_identities?employee_id=eq.target1') && method === 'GET') {
      return json([{
        employee_id: 'target1', auth_user_id: '22222222-2222-4222-8222-222222222222',
        auth_email: 'target@auth.example.test', active: true, force_pin_change: false,
        authz_version: 5, pin_fingerprint: 'old-target-fp'
      }]);
    }
    if (url.includes('syncro_auth_identities?pin_fingerprint=eq.')) return json([]);
    if (url.includes('/rpc/syncro_auth_reserve_bucket')) return json(0);
    if (url.includes('syncro_auth_identities?employee_id=eq.target1') && method === 'PATCH') {
      const update = JSON.parse(init.body);
      assert.equal(update.force_pin_change, true);
      assert.equal(update.authz_version, 6);
      return json([{ employee_id: 'target1', ...update }]);
    }
    if (url.includes('/auth/v1/admin/users/') && method === 'PUT') {
      const update = JSON.parse(init.body);
      authPassword = update.password;
      assert.equal(update.app_metadata.syncro_authz_version, 6);
      return json({ id: '22222222-2222-4222-8222-222222222222' });
    }
    if (url.endsWith('/rest/v1/syncro_auth_audit') && method === 'POST') {
      const event = JSON.parse(init.body);
      assert.equal(event.detail.actor_employee_id, 'actor1');
      assert.equal('pin' in event.detail, false);
      return new Response(null, { status: 201 });
    }
    throw new Error('Unexpected URL: ' + method + ' ' + url);
  };

  const res = await resetPinHandler(new Request('https://syncro.example/api/auth/reset-pin', {
    method: 'POST',
    headers: {
      origin: 'https://syncro.example', authorization: 'Bearer ' + accessToken(3),
      'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7'
    },
    body: JSON.stringify({ employee_id: 'target1', pin: '999999', email: 'attacker@example.test' })
  }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.delivery, 'in_person');
  assert.match(body.temporary_pin, /^\d{6}$/);
  assert.equal(body.temporary_pin, authPassword);
  assert.notEqual(body.temporary_pin, '999999');
});

test('a supervisor cannot provision an employee outside their department', async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    if (url.endsWith('/auth/v1/user') && method === 'GET') {
      return json({
        id: '33333333-3333-4333-8333-333333333333',
        app_metadata: { syncro_authz_version: 2 }
      });
    }
    if (url.includes('syncro_auth_identities?auth_user_id=')) {
      return json([{
        employee_id: 'chef1', auth_user_id: '33333333-3333-4333-8333-333333333333',
        active: true, force_pin_change: false, authz_version: 2, pin_fingerprint: 'chef-fp'
      }]);
    }
    if (url.includes('employees?id=eq.chef1')) {
      return json([{
        id: 'chef1', nombre: 'Chef', area: 'Cocina', puesto: 'Jefe de Cocina',
        rol: 'jefe', responsable: 1, validador: 1, estado: 'Activo'
      }]);
    }
    throw new Error('Authorization should stop before this request: ' + method + ' ' + url);
  };

  const res = await provisionHandler(new Request('https://syncro.example/api/auth/provision', {
    method: 'POST',
    headers: {
      origin: 'https://syncro.example', authorization: 'Bearer ' + accessToken(2),
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      nombre: 'Ana', puesto: 'Camarera', area: 'Cocina', rol: 'empleado',
      email: '', obs: '', estado: 'Activo', coste: 14, responsable: 0, validador: 0
    })
  }));
  assert.equal(res.status, 403);
});

test('provisioning stores no plaintext PIN and omits an emailed PIN from the response', async () => {
  process.env.RESEND_API_KEY = 'resend-test-key';
  let employeeInsert;
  let authCreate;
  let emailRequest;
  let fingerprintChecks = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    if (url.endsWith('/auth/v1/user') && method === 'GET') {
      return json({
        id: '44444444-4444-4444-8444-444444444444',
        app_metadata: { syncro_authz_version: 1 }
      });
    }
    if (url.includes('syncro_auth_identities?auth_user_id=')) {
      return json([{
        employee_id: 'admin1', auth_user_id: '44444444-4444-4444-8444-444444444444',
        active: true, force_pin_change: false, authz_version: 1, pin_fingerprint: 'admin-fp'
      }]);
    }
    if (url.includes('employees?id=eq.admin1')) {
      return json([{
        id: 'admin1', nombre: 'Admin', area: 'Administración', puesto: 'Administrador',
        rol: 'admin', responsable: 1, validador: 1, estado: 'Activo'
      }]);
    }
    if (url.includes('/rpc/syncro_auth_reserve_bucket')) return json(0);
    if (url.endsWith('/rest/v1/employees?select=id,email')) return json([]);
    if (url.endsWith('/rest/v1/employees') && method === 'POST') {
      employeeInsert = JSON.parse(init.body);
      return json([employeeInsert], 201);
    }
    if (url.includes('syncro_auth_identities?pin_fingerprint=eq.')) {
      fingerprintChecks += 1;
      return json(fingerprintChecks === 1 ? [{ employee_id: 'collision-test' }] : []);
    }
    if (url.endsWith('/auth/v1/admin/users') && method === 'POST') {
      authCreate = JSON.parse(init.body);
      return json({ id: '55555555-5555-4555-8555-555555555555' }, 201);
    }
    if (url.endsWith('/rest/v1/syncro_auth_identities') && method === 'POST') {
      const identity = JSON.parse(init.body);
      assert.equal(identity.employee_id, employeeInsert.id);
      assert.equal(identity.pin_fingerprint.length, 64);
      assert.equal(identity.force_pin_change, true);
      assert.ok(Date.parse(identity.temporary_pin_expires_at) > Date.now());
      return new Response(null, { status: 201 });
    }
    if (url === 'https://api.resend.com/emails' && method === 'POST') {
      emailRequest = JSON.parse(init.body);
      return json({ id: 'email1' }, 200);
    }
    if (url.endsWith('/rest/v1/syncro_auth_audit') && method === 'POST') {
      return new Response(null, { status: 201 });
    }
    throw new Error('Unexpected URL: ' + method + ' ' + url);
  };

  const res = await provisionHandler(new Request('https://syncro.example/api/auth/provision', {
    method: 'POST',
    headers: {
      origin: 'https://syncro.example', authorization: 'Bearer ' + accessToken(1),
      'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7'
    },
    body: JSON.stringify({
      nombre: 'Ana', puesto: 'Camarera', area: 'Administración', rol: 'empleado',
      email: 'ana@example.test', obs: '', estado: 'Activo', coste: 14,
      responsable: 0, validador: 0, pin: '999999'
    })
  }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.delivery, 'email');
  assert.equal('temporary_pin' in body, false);
  assert.equal(employeeInsert.pin, null);
  assert.equal(employeeInsert.area, 'Sala');
  assert.equal(fingerprintChecks, 2);
  assert.match(authCreate.password, /^\d{6}$/);
  assert.notEqual(authCreate.password, '999999');
  assert.notEqual(authCreate.email, 'ana@example.test');
  assert.deepEqual(emailRequest.to, ['ana@example.test']);
  assert.match(emailRequest.html, new RegExp(authCreate.password));
});

test('status changes run through server authorization and revoke the previous authorization version', async () => {
  let identityPatch;
  let authMetadata;
  let employeePatch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    if (url.endsWith('/auth/v1/user') && method === 'GET') {
      return json({
        id: '66666666-6666-4666-8666-666666666666',
        app_metadata: { syncro_authz_version: 1 }
      });
    }
    if (url.includes('syncro_auth_identities?auth_user_id=')) {
      return json([{
        employee_id: 'admin1', auth_user_id: '66666666-6666-4666-8666-666666666666',
        active: true, force_pin_change: false, authz_version: 1, pin_fingerprint: 'admin-fp'
      }]);
    }
    if (url.includes('employees?id=eq.admin1')) {
      return json([{
        id: 'admin1', nombre: 'Admin', area: 'Administración', puesto: 'Administrador',
        rol: 'admin', responsable: 1, validador: 1, estado: 'Activo'
      }]);
    }
    if (url.includes('employees?id=eq.target2') && method === 'GET') {
      return json([{
        id: 'target2', nombre: 'Luis', email: '', area: 'Cocina', puesto: 'Cocinero',
        rol: 'empleado', responsable: 0, validador: 0, estado: 'Activo'
      }]);
    }
    if (url.includes('syncro_auth_identities?employee_id=eq.target2') && method === 'GET') {
      return json([{
        employee_id: 'target2', auth_user_id: '77777777-7777-4777-8777-777777777777',
        auth_email: 'target@auth.example.test', active: true, force_pin_change: false,
        authz_version: 5, pin_fingerprint: 'target-fp', temporary_pin_expires_at: null
      }]);
    }
    if (url.includes('/rpc/syncro_auth_reserve_bucket')) return json(0);
    if (url.includes('syncro_auth_identities?employee_id=eq.target2') && method === 'PATCH') {
      identityPatch = JSON.parse(init.body);
      return json([{ employee_id: 'target2', ...identityPatch }]);
    }
    if (url.includes('/auth/v1/admin/users/') && method === 'PUT') {
      authMetadata = JSON.parse(init.body);
      return json({ id: '77777777-7777-4777-8777-777777777777' });
    }
    if (url.includes('employees?id=eq.target2') && method === 'PATCH') {
      employeePatch = JSON.parse(init.body);
      return json([{
        id: 'target2', nombre: 'Luis', area: 'Cocina', rol: 'empleado', estado: 'Baja'
      }]);
    }
    if (url.endsWith('/rest/v1/syncro_auth_audit') && method === 'POST') {
      return new Response(null, { status: 201 });
    }
    throw new Error('Unexpected URL: ' + method + ' ' + url);
  };

  const res = await employeeHandler(new Request('https://syncro.example/api/auth/employee', {
    method: 'PATCH',
    headers: {
      origin: 'https://syncro.example', authorization: 'Bearer ' + accessToken(1),
      'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7'
    },
    body: JSON.stringify({ action: 'set_status', employee_id: 'target2', estado: 'Baja' })
  }));
  assert.equal(res.status, 200);
  assert.equal(identityPatch.active, false);
  assert.equal(identityPatch.authz_version, 6);
  assert.equal(authMetadata.app_metadata.syncro_authz_version, 6);
  assert.deepEqual(employeePatch, { estado: 'Baja' });
  assert.equal((await res.json()).employee.estado, 'Baja');
});
