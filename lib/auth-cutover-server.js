import { adminRequest } from './auth-server.js';
import { sendTemporaryPinEmail } from './email-server.js';
import {
  beginIdentityAuthorizationChange,
  provisionEmployeeIdentity,
  resetEmployeeIdentityPin
} from './identity-server.js';

const ACTIVE_STATE = 'Activo';

export function buildIdentityCutoverPlan(employees, identities) {
  const identityByEmployee = new Map(
    (Array.isArray(identities) ? identities : []).map(identity => [identity.employee_id, identity])
  );
  return (Array.isArray(employees) ? employees : [])
    .filter(employee => employee && employee.estado === ACTIVE_STATE)
    .map(employee => {
      const identity = identityByEmployee.get(employee.id) || null;
      let action = 'provision';
      if (identity && !identity.force_pin_change && identity.active) action = 'ready';
      else if (identity && identity.active) action = 'reset_temporary_pin';
      else if (identity) action = 'activate_and_reset';
      return {
        employee,
        identity,
        action,
        delivery: employee.email ? 'email' : 'in_person'
      };
    });
}

export function summarizeIdentityCutoverPlan(plan) {
  const summary = {
    active: 0,
    ready: 0,
    provision: 0,
    reset_temporary_pin: 0,
    activate_and_reset: 0,
    email: 0,
    in_person: 0
  };
  for (const entry of Array.isArray(plan) ? plan : []) {
    summary.active += 1;
    if (Object.hasOwn(summary, entry.action)) summary[entry.action] += 1;
    if (entry.action !== 'ready' && Object.hasOwn(summary, entry.delivery)) {
      summary[entry.delivery] += 1;
    }
  }
  return summary;
}

async function prepareTemporaryPin(entry, dependencies) {
  if (entry.action === 'provision') {
    return dependencies.provisionEmployeeIdentity(entry.employee);
  }
  let identity = entry.identity;
  if (entry.action === 'activate_and_reset') {
    await dependencies.beginIdentityAuthorizationChange(identity, entry.employee.id, true);
    identity = { ...identity, active: true, authz_version: identity.authz_version + 1 };
  }
  return dependencies.resetEmployeeIdentityPin(identity, entry.employee);
}

export async function executeIdentityCutover(plan, options = {}, injected = {}) {
  const dependencies = {
    provisionEmployeeIdentity,
    resetEmployeeIdentityPin,
    beginIdentityAuthorizationChange,
    sendTemporaryPinEmail,
    ...injected
  };
  const results = [];
  for (const entry of Array.isArray(plan) ? plan : []) {
    if (entry.action === 'ready') {
      results.push({ employee_id: entry.employee.id, status: 'ready' });
      continue;
    }
    try {
      const identity = await prepareTemporaryPin(entry, dependencies);
      if (entry.delivery === 'email') {
        const sent = await dependencies.sendTemporaryPinEmail({
          kind: 'provision',
          target: entry.employee,
          pin: identity.pin,
          actor: options.actor || null,
          appUrl: options.appUrl
        });
        if (sent && sent.ok) {
          results.push({ employee_id: entry.employee.id, status: 'email_sent' });
          continue;
        }
      }
      results.push({
        employee_id: entry.employee.id,
        employee_name: entry.employee.nombre,
        status: entry.delivery === 'email' ? 'manual_email_fallback' : 'manual_required',
        temporary_pin: identity.pin
      });
    } catch (error) {
      results.push({
        employee_id: entry.employee.id,
        status: 'failed',
        reason: error && error.message ? error.message : 'unknown_error'
      });
    }
  }
  return results;
}

export async function loadIdentityCutoverPlan() {
  const [employees, identities] = await Promise.all([
    adminRequest(
      'employees?estado=eq.Activo&select=id,nombre,email,area,puesto,rol,estado,responsable,validador&order=id.asc'
    ),
    adminRequest(
      'syncro_auth_identities?select=employee_id,auth_user_id,auth_email,active,force_pin_change,authz_version,pin_fingerprint,temporary_pin_expires_at&order=employee_id.asc'
    )
  ]);
  return buildIdentityCutoverPlan(employees, identities);
}
