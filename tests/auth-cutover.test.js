import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIdentityCutoverPlan,
  executeIdentityCutover,
  summarizeIdentityCutoverPlan
} from '../lib/auth-cutover-server.js';

const employees = [
  { id: 'E1', nombre: 'Email', email: 'email@example.test', estado: 'Activo' },
  { id: 'E2', nombre: 'Manual', email: '', estado: 'Activo' },
  { id: 'E3', nombre: 'Ready', email: 'ready@example.test', estado: 'Activo' },
  { id: 'E4', nombre: 'Pending', email: 'pending@example.test', estado: 'Activo' },
  { id: 'E5', nombre: 'Inactive identity', email: 'inactive@example.test', estado: 'Activo' },
  { id: 'E6', nombre: 'Baja', email: 'baja@example.test', estado: 'Baja' }
];

const identities = [
  { employee_id: 'E3', active: true, force_pin_change: false, authz_version: 2 },
  { employee_id: 'E4', active: true, force_pin_change: true, authz_version: 1 },
  { employee_id: 'E5', active: false, force_pin_change: true, authz_version: 4 }
];

test('cutover plan is deterministic, excludes inactive employees and separates delivery', () => {
  const plan = buildIdentityCutoverPlan(employees, identities);
  assert.deepEqual(plan.map(entry => [entry.employee.id, entry.action, entry.delivery]), [
    ['E1', 'provision', 'email'],
    ['E2', 'provision', 'in_person'],
    ['E3', 'ready', 'email'],
    ['E4', 'reset_temporary_pin', 'email'],
    ['E5', 'activate_and_reset', 'email']
  ]);
  assert.deepEqual(summarizeIdentityCutoverPlan(plan), {
    active: 5,
    ready: 1,
    provision: 2,
    reset_temporary_pin: 1,
    activate_and_reset: 1,
    email: 3,
    in_person: 1
  });
});

test('cutover does not expose emailed PINs and returns only manual handoffs', async () => {
  const plan = buildIdentityCutoverPlan(employees, identities);
  const calls = [];
  const pins = { E1: '538204', E2: '917360', E4: '462809', E5: '730284' };
  const results = await executeIdentityCutover(plan, { appUrl: 'https://syncro.example' }, {
    provisionEmployeeIdentity: async target => {
      calls.push(['provision', target.id]);
      return { pin: pins[target.id], authUserId: 'U-' + target.id, version: 1 };
    },
    beginIdentityAuthorizationChange: async (identity, employeeId, active) => {
      calls.push(['activate', employeeId, active, identity.authz_version]);
      return { version: identity.authz_version + 1 };
    },
    resetEmployeeIdentityPin: async (identity, target) => {
      calls.push(['reset', target.id, identity.authz_version]);
      return { pin: pins[target.id], authUserId: 'U-' + target.id, version: identity.authz_version + 1 };
    },
    sendTemporaryPinEmail: async ({ target, pin }) => {
      calls.push(['email', target.id, pin]);
      return { ok: true };
    }
  });

  assert.deepEqual(results, [
    { employee_id: 'E1', status: 'email_sent' },
    { employee_id: 'E2', employee_name: 'Manual', status: 'manual_required', temporary_pin: '917360' },
    { employee_id: 'E3', status: 'ready' },
    { employee_id: 'E4', status: 'email_sent' },
    { employee_id: 'E5', status: 'email_sent' }
  ]);
  assert.deepEqual(calls, [
    ['provision', 'E1'], ['email', 'E1', '538204'],
    ['provision', 'E2'],
    ['reset', 'E4', 1], ['email', 'E4', '462809'],
    ['activate', 'E5', true, 4], ['reset', 'E5', 5], ['email', 'E5', '730284']
  ]);
  assert.equal(JSON.stringify(results).includes('538204'), false);
  assert.equal(JSON.stringify(results).includes('462809'), false);
  assert.equal(JSON.stringify(results).includes('730284'), false);
});

test('failed email becomes an explicit manual fallback', async () => {
  const plan = buildIdentityCutoverPlan([employees[0]], []);
  const results = await executeIdentityCutover(plan, { appUrl: 'https://syncro.example' }, {
    provisionEmployeeIdentity: async () => ({ pin: '538204' }),
    sendTemporaryPinEmail: async () => ({ ok: false, reason: 'provider' })
  });
  assert.deepEqual(results, [{
    employee_id: 'E1', employee_name: 'Email',
    status: 'manual_email_fallback', temporary_pin: '538204'
  }]);
});
