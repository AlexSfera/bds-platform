import {
  adminAuthRequest,
  adminRequest,
  createTechnicalAuthEmail,
  generateTemporaryPin,
  pinFingerprint,
  temporaryPinExpiresAt
} from './auth-server.js';

function authUserFromResponse(body) {
  const user = body && (body.user || body);
  return user && user.id ? user : null;
}

async function fingerprintExists(fingerprint) {
  const rows = await adminRequest(
    'syncro_auth_identities?pin_fingerprint=eq.' + encodeURIComponent(fingerprint)
      + '&select=employee_id&limit=1'
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function newUniquePin() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const pin = generateTemporaryPin();
    const fingerprint = await pinFingerprint(pin);
    if (!await fingerprintExists(fingerprint)) return { pin, fingerprint };
  }
  throw new Error('PIN_UNIQUENESS_EXHAUSTED');
}

async function deleteNewAuthUser(authUserId) {
  await adminAuthRequest('admin/users/' + encodeURIComponent(authUserId), {
    method: 'DELETE'
  }).catch(() => {});
}

export async function provisionEmployeeIdentity(target) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await newUniquePin();
    const authEmail = createTechnicalAuthEmail();
    const version = 1;
    let authUser;
    try {
      const created = await adminAuthRequest('admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: authEmail,
          password: candidate.pin,
          email_confirm: true,
          app_metadata: {
            syncro_employee_id: target.id,
            syncro_authz_version: version
          }
        })
      });
      authUser = authUserFromResponse(created);
      if (!authUser) throw new Error('AUTH_USER_RESPONSE_INVALID');
      await adminRequest('syncro_auth_identities', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          employee_id: target.id,
          auth_user_id: authUser.id,
          auth_email: authEmail,
          active: target.estado === 'Activo',
          force_pin_change: true,
          authz_version: version,
          pin_fingerprint: candidate.fingerprint,
          temporary_pin_expires_at: temporaryPinExpiresAt()
        })
      });
      return { pin: candidate.pin, authUserId: authUser.id, version };
    } catch (error) {
      if (authUser && authUser.id) await deleteNewAuthUser(authUser.id);
      if (error && error.status === 409) continue;
      throw error;
    }
  }
  throw new Error('IDENTITY_PROVISION_CONFLICT');
}

async function patchIdentityVersion(identity, expectedVersion, patch) {
  const rows = await adminRequest(
    'syncro_auth_identities?employee_id=eq.' + encodeURIComponent(identity.employee_id)
      + '&authz_version=eq.' + encodeURIComponent(String(expectedVersion)),
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    }
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function rollbackIdentityVersion(identity, reservedVersion) {
  return patchIdentityVersion(identity, reservedVersion, {
    pin_fingerprint: identity.pin_fingerprint || null,
    force_pin_change: !!identity.force_pin_change,
    active: !!identity.active,
    authz_version: identity.authz_version,
    temporary_pin_expires_at: identity.temporary_pin_expires_at || null,
    updated_at: new Date().toISOString()
  });
}

export async function resetEmployeeIdentityPin(identity, target) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = await newUniquePin();
    const version = identity.authz_version + 1;
    let reserved;
    try {
      reserved = await patchIdentityVersion(identity, identity.authz_version, {
        pin_fingerprint: candidate.fingerprint,
        force_pin_change: true,
        active: target.estado === 'Activo',
        authz_version: version,
        temporary_pin_expires_at: temporaryPinExpiresAt(),
        updated_at: new Date().toISOString()
      });
    } catch (error) {
      if (error && error.status === 409) continue;
      throw error;
    }
    if (!reserved) throw new Error('IDENTITY_CHANGED_CONCURRENTLY');
    try {
      await adminAuthRequest('admin/users/' + encodeURIComponent(identity.auth_user_id), {
        method: 'PUT',
        body: JSON.stringify({
          password: candidate.pin,
          app_metadata: {
            syncro_employee_id: target.id,
            syncro_authz_version: version
          }
        })
      });
      return { pin: candidate.pin, authUserId: identity.auth_user_id, version };
    } catch (error) {
      const rolledBack = await rollbackIdentityVersion(identity, version).catch(() => null);
      if (!rolledBack) throw new Error('IDENTITY_ROLLBACK_FAILED');
      throw error;
    }
  }
  throw new Error('PIN_UNIQUENESS_EXHAUSTED');
}

export async function reserveSelfSelectedPin(identity, newPin) {
  const fingerprint = await pinFingerprint(newPin);
  const version = identity.authz_version + 1;
  const reserved = await patchIdentityVersion(identity, identity.authz_version, {
    pin_fingerprint: fingerprint,
    force_pin_change: false,
    authz_version: version,
    temporary_pin_expires_at: null,
    updated_at: new Date().toISOString()
  });
  if (!reserved) throw new Error('IDENTITY_CHANGED_CONCURRENTLY');
  return { version };
}

export async function rollbackSelfSelectedPin(identity, reservedVersion) {
  return rollbackIdentityVersion(identity, reservedVersion);
}

export async function beginIdentityAuthorizationChange(identity, targetEmployeeId, active) {
  const version = identity.authz_version + 1;
  const reserved = await patchIdentityVersion(identity, identity.authz_version, {
    active: !!active,
    authz_version: version,
    updated_at: new Date().toISOString()
  });
  if (!reserved) throw new Error('IDENTITY_CHANGED_CONCURRENTLY');
  try {
    await adminAuthRequest('admin/users/' + encodeURIComponent(identity.auth_user_id), {
      method: 'PUT',
      body: JSON.stringify({
        app_metadata: {
          syncro_employee_id: targetEmployeeId,
          syncro_authz_version: version
        }
      })
    });
  } catch (error) {
    await rollbackIdentityVersion(identity, version).catch(() => null);
    throw error;
  }
  return { version };
}

export async function rollbackIdentityAuthorizationChange(identity, reservedVersion) {
  try {
    await adminAuthRequest('admin/users/' + encodeURIComponent(identity.auth_user_id), {
      method: 'PUT',
      body: JSON.stringify({
        app_metadata: {
          syncro_employee_id: identity.employee_id,
          syncro_authz_version: identity.authz_version
        }
      })
    });
  } catch (_) {
    return null;
  }
  return rollbackIdentityVersion(identity, reservedVersion);
}
