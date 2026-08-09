import test from 'node:test';
import assert from 'node:assert/strict';

import changePinHandler from '../api/auth/change-pin.js';
import loginHandler from '../api/auth/login.js';
import {
  adminAuthRequest,
  adminRequest,
  findIdentityByEmployee,
  pinFingerprint,
  sessionProfile
} from '../lib/auth-server.js';
import { provisionEmployeeIdentity } from '../lib/identity-server.js';

const runLocalE2E = process.env.SYNCRO_SUPABASE_E2E === 'true';

function request(path, body, accessToken) {
  const headers = {
    'content-type': 'application/json',
    origin: 'http://local.test',
    'x-forwarded-for': '127.0.0.42'
  };
  if (accessToken) headers.authorization = 'Bearer ' + accessToken;
  return new Request('http://local.test' + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

test('local Supabase provisions, authenticates and rotates a six-digit PIN', {
  skip: !runLocalE2E
}, async () => {
  const employee = {
    id: 'E2E-' + crypto.randomUUID(),
    nombre: 'Empleado Local E2E',
    email: '',
    area: 'Administración',
    puesto: 'Administrador',
    rol: 'admin',
    estado: 'Activo',
    responsable: 1,
    validador: 1,
    obs: '',
    coste: 0,
    pin: null,
    fecha_alta: '2026-08-08',
    created_at: new Date().toISOString()
  };
  let authUserId = null;

  try {
    const created = await adminRequest('employees', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(employee)
    });
    assert.equal(created.length, 1);

    const provisioned = await provisionEmployeeIdentity(employee);
    authUserId = provisioned.authUserId;
    assert.match(provisioned.pin, /^\d{6}$/);

    const initialIdentity = await findIdentityByEmployee(employee.id);
    assert.ok(initialIdentity);
    assert.equal(initialIdentity.force_pin_change, true);
    assert.notEqual(initialIdentity.pin_fingerprint, provisioned.pin);

    const employeeRows = await adminRequest(
      'employees?id=eq.' + encodeURIComponent(employee.id) + '&select=id,pin'
    );
    assert.deepEqual(employeeRows, [{ id: employee.id, pin: null }]);

    const firstLogin = await loginHandler(request('/api/auth/login', {
      employee_id: employee.id,
      pin: provisioned.pin
    }));
    const firstSession = await firstLogin.json();
    assert.equal(firstLogin.status, 200);
    assert.equal(firstSession.profile.id, employee.id);
    assert.equal(firstSession.force_pin_change, true);
    assert.match(firstLogin.headers.get('set-cookie') || '', /HttpOnly/);

    const personalPin = '460297';
    const changed = await changePinHandler(request('/api/auth/change-pin', {
      current_pin: provisioned.pin,
      new_pin: personalPin
    }, firstSession.access_token));
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { ok: true });

    assert.equal(await sessionProfile(firstSession.access_token), null);

    const oldPinLogin = await loginHandler(request('/api/auth/login', {
      employee_id: employee.id,
      pin: provisioned.pin
    }));
    assert.equal(oldPinLogin.status, 401);

    const secondLogin = await loginHandler(request('/api/auth/login', {
      employee_id: employee.id,
      pin: personalPin
    }));
    const secondSession = await secondLogin.json();
    assert.equal(secondLogin.status, 200);
    assert.equal(secondSession.force_pin_change, false);

    const finalIdentity = await findIdentityByEmployee(employee.id);
    assert.equal(finalIdentity.force_pin_change, false);
    assert.equal(finalIdentity.temporary_pin_expires_at, null);
    assert.equal(finalIdentity.pin_fingerprint, await pinFingerprint(personalPin));
    assert.notEqual(finalIdentity.pin_fingerprint, personalPin);

    const auditRows = await adminRequest(
      'syncro_auth_audit?employee_id=eq.' + encodeURIComponent(employee.id)
        + '&select=event_type&order=event_at.asc'
    );
    const events = auditRows.map(row => row.event_type);
    assert.ok(events.includes('login_success'));
    assert.ok(events.includes('login_failure'));
    assert.ok(events.includes('pin_change'));
  } finally {
    if (authUserId) {
      await adminAuthRequest('admin/users/' + encodeURIComponent(authUserId), {
        method: 'DELETE'
      }).catch(() => {});
    }
    await adminRequest('employees?id=eq.' + encodeURIComponent(employee.id), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    }).catch(() => {});
  }
});
