const REFRESH_COOKIE = '__Host-syncro-refresh';
const SAFE_PROFILE_FIELDS = 'id,nombre,area,puesto,rol,responsable,validador,estado';

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing server environment: ' + name);
  return value;
}

export function optionalEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

export function isAuthEnabled() {
  return process.env.SYNCRO_AUTH_ENABLED === 'true';
}

export function requireAuthEnabled() {
  if (!isAuthEnabled()) {
    return jsonResponse({ error: 'Not found' }, 404);
  }
  return null;
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

export function requireMethod(req, method) {
  if (req.method === method) return null;
  return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: method });
}

export function requireSameOrigin(req) {
  const origin = req.headers.get('origin');
  let expected;
  try { expected = new URL(req.url).origin; }
  catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  if (!origin || origin !== expected) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }
  return null;
}

export async function readJson(req, maxBytes = 4096) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new Error('REQUEST_TOO_LARGE');
  }
  try { return JSON.parse(raw || '{}'); }
  catch (_) { throw new Error('INVALID_JSON'); }
}

export function normalizeEmployeeId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(id)) return null;
  return id;
}

export function normalizePin(value) {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value)) return null;
  return value;
}

export function isAcceptableNewPin(value) {
  const pin = normalizePin(value);
  if (!pin) return false;
  if (/^(\d)\1{5}$/.test(pin)) return false;
  const blocked = new Set([
    '012345', '123456', '234567', '345678', '456789',
    '987654', '876543', '765432', '654321', '543210',
    '111111', '121212', '112233', '123123', '000000'
  ]);
  return !blocked.has(pin);
}

export function getBearerToken(req) {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

export function parseCookies(req) {
  const cookies = {};
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try { cookies[key] = decodeURIComponent(part.slice(idx + 1).trim()); }
    catch (_) { cookies[key] = ''; }
  }
  return cookies;
}

export function getRefreshToken(req) {
  return parseCookies(req)[REFRESH_COOKIE] || null;
}

export function refreshCookie(value, maxAgeSeconds = 60 * 60 * 24 * 30) {
  return [
    REFRESH_COOKIE + '=' + encodeURIComponent(value),
    'Path=/',
    'Max-Age=' + maxAgeSeconds,
    'HttpOnly',
    'Secure',
    'SameSite=Strict'
  ].join('; ');
}

export function clearRefreshCookie() {
  return [
    REFRESH_COOKIE + '=',
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Strict'
  ].join('; ');
}

function supabaseUrl(path) {
  return env('SUPABASE_URL').replace(/\/$/, '') + path;
}

async function parseSupabaseResponse(res) {
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch (_) { body = { raw: text.slice(0, 500) }; }
  }
  return { res, body };
}

export async function adminRequest(path, init = {}) {
  const serviceKey = env('SUPABASE_SERVICE_KEY');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', serviceKey);
  headers.set('Authorization', 'Bearer ' + serviceKey);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const result = await parseSupabaseResponse(await fetch(supabaseUrl('/rest/v1/' + path), {
    ...init,
    headers
  }));
  if (!result.res.ok) {
    const err = new Error('SUPABASE_ADMIN_' + result.res.status);
    err.status = result.res.status;
    throw err;
  }
  return result.body;
}

export async function authRequest(path, init = {}, bearer = null) {
  const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', publishableKey);
  if (bearer) headers.set('Authorization', 'Bearer ' + bearer);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return parseSupabaseResponse(await fetch(supabaseUrl('/auth/v1/' + path), {
    ...init,
    headers
  }));
}

export async function adminAuthRequest(path, init = {}) {
  const serviceKey = env('SUPABASE_SERVICE_KEY');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', serviceKey);
  headers.set('Authorization', 'Bearer ' + serviceKey);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const result = await parseSupabaseResponse(await fetch(supabaseUrl('/auth/v1/' + path), {
    ...init,
    headers
  }));
  if (!result.res.ok) {
    const err = new Error('SUPABASE_AUTH_ADMIN_' + result.res.status);
    err.status = result.res.status;
    throw err;
  }
  return result.body;
}

function postgrestEq(value) {
  return encodeURIComponent(value);
}

export async function findIdentityByEmployee(employeeId) {
  const rows = await adminRequest(
    'syncro_auth_identities?employee_id=eq.' + postgrestEq(employeeId)
      + '&select=employee_id,auth_user_id,auth_email,active,force_pin_change,authz_version,pin_fingerprint,temporary_pin_expires_at&limit=1'
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function findIdentityByAuthUser(authUserId) {
  const rows = await adminRequest(
    'syncro_auth_identities?auth_user_id=eq.' + postgrestEq(authUserId)
      + '&select=employee_id,auth_user_id,active,force_pin_change,authz_version,pin_fingerprint,temporary_pin_expires_at&limit=1'
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function getSafeProfile(employeeId) {
  const rows = await adminRequest(
    'employees?id=eq.' + postgrestEq(employeeId)
      + '&select=' + SAFE_PROFILE_FIELDS + '&limit=1'
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function getManagementProfile(employeeId) {
  const rows = await adminRequest(
    'employees?id=eq.' + postgrestEq(employeeId)
      + '&select=id,nombre,email,area,puesto,rol,estado,responsable,validador&limit=1'
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function getAuthUser(accessToken) {
  const result = await authRequest('user', { method: 'GET' }, accessToken);
  if (!result.res.ok || !result.body || !result.body.id) return null;
  return result.body;
}

export function authzVersionFromAccessToken(accessToken) {
  if (typeof accessToken !== 'string') return null;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    const version = Number(
      payload && payload.app_metadata && payload.app_metadata.syncro_authz_version
    );
    return Number.isSafeInteger(version) && version > 0 ? version : null;
  } catch (_) {
    return null;
  }
}

function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim();
  return ip || 'unknown';
}

export async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function pinFingerprint(pin) {
  const normalized = normalizePin(pin);
  if (!normalized) throw new Error('INVALID_PIN');
  return hmacHex(env('SYNCRO_AUTH_PIN_FINGERPRINT_SECRET'), 'syncro-pin-v1:' + normalized);
}

export function generateTemporaryPin() {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    let pin = '';
    while (pin.length < 6) {
      const bytes = new Uint8Array(6 - pin.length);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        // Rejection sampling avoids the modulo bias of byte % 10.
        if (byte < 250) pin += String(byte % 10);
      }
    }
    if (isAcceptableNewPin(pin)) return pin;
  }
  throw new Error('PIN_GENERATION_FAILED');
}

export function createTechnicalAuthEmail() {
  const domain = env('SYNCRO_AUTH_INTERNAL_EMAIL_DOMAIN').trim().toLowerCase().replace(/^@/, '');
  if (!/^(?=.{3,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(domain) || !domain.includes('.')) {
    throw new Error('INVALID_INTERNAL_EMAIL_DOMAIN');
  }
  return 'syncro-' + crypto.randomUUID() + '@' + domain;
}

export function temporaryPinExpiresAt() {
  const minutes = Number(optionalEnv('SYNCRO_AUTH_TEMP_PIN_TTL_MINUTES', '1440'));
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 10080) {
    throw new Error('INVALID_TEMP_PIN_TTL');
  }
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function identityAllowsLogin(identity) {
  if (!identity || !identity.active) return false;
  if (!identity.force_pin_change) return true;
  const expiresAt = Date.parse(identity.temporary_pin_expires_at || '');
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function loginContext(req, employeeId) {
  const ipHash = await hmacHex(env('SYNCRO_AUTH_RATE_LIMIT_SECRET'), getClientIp(req));
  return { employeeId, ipHash };
}

export async function beginLoginAttempt(context) {
  return adminRequest('rpc/syncro_auth_begin_login', {
    method: 'POST',
    body: JSON.stringify({
      p_employee_id: context.employeeId,
      p_ip_hash: context.ipHash
    })
  });
}

export async function beginManagementAction(context, action) {
  const limits = {
    provision: { actor: 20, ip: 40, system: 200 },
    reset_pin: { actor: 30, ip: 60, system: 300 },
    manage_employee: { actor: 60, ip: 120, system: 600 }
  };
  const selected = limits[action];
  if (!selected || !context || !context.employeeId || !context.ipHash) {
    throw new Error('INVALID_MANAGEMENT_RATE_CONTEXT');
  }
  const reserve = (scopeKind, scopeKey, limit) => adminRequest(
    'rpc/syncro_auth_reserve_bucket', {
      method: 'POST',
      body: JSON.stringify({
        p_scope_kind: scopeKind,
        p_scope_key: scopeKey,
        p_limit: limit,
        p_window: '15 minutes'
      })
    }
  );
  const retries = await Promise.all([
    reserve('employee', 'management:' + action + ':' + context.employeeId, selected.actor),
    reserve('ip', 'management:' + action + ':' + context.ipHash, selected.ip),
    reserve('system', 'management:' + action, selected.system)
  ]);
  return Math.max(0, ...retries.map(value => Number(value) || 0));
}

export async function finishLoginAttempt(context, success, reason) {
  return adminRequest('rpc/syncro_auth_finish_login', {
    method: 'POST',
    body: JSON.stringify({
      p_employee_id: context.employeeId,
      p_ip_hash: context.ipHash,
      p_success: !!success,
      p_reason: String(reason || '').slice(0, 80)
    })
  });
}

export async function recordAuthEvent(eventType, context, reason, detail = {}) {
  return adminRequest('syncro_auth_audit', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      event_type: eventType,
      employee_id: context && context.employeeId,
      ip_hash: context && context.ipHash,
      reason: String(reason || '').slice(0, 80),
      detail: detail && typeof detail === 'object' ? detail : {}
    })
  });
}

export async function sessionProfile(accessToken) {
  const authUser = await getAuthUser(accessToken);
  if (!authUser) return null;
  const identity = await findIdentityByAuthUser(authUser.id);
  if (!identityAllowsLogin(identity)) return null;
  const tokenVersion = authzVersionFromAccessToken(accessToken);
  if (tokenVersion === null || tokenVersion !== identity.authz_version) return null;
  const profile = await getSafeProfile(identity.employee_id);
  if (!profile || profile.estado !== 'Activo') return null;
  return { profile, forcePinChange: !!identity.force_pin_change };
}

export function publicSession(authBody, sessionData) {
  return {
    access_token: authBody.access_token,
    expires_in: authBody.expires_in,
    token_type: authBody.token_type || 'bearer',
    profile: sessionData.profile,
    force_pin_change: sessionData.forcePinChange
  };
}

export function directoryAreas(department) {
  const map = {
    cocina: ['Cocina', 'Friegue', 'F&B'],
    sala: ['Sala', 'F&B'],
    recepcion: ['Recepción', 'Recepción SFERA'],
    'rec-syncrolab': ['Recepción SYNCROLAB', 'SYNCROLAB'],
    entrenadores: ['Entrenadores', 'SYNCROLAB'],
    housekeeping: ['Housekeeping'],
    mantenimiento: ['Mantenimiento'],
    administracion: ['Administración', 'RRHH', 'Recursos Humanos', 'F&B']
  };
  return map[department] || null;
}

export function filterDirectory(rows, department) {
  const areas = directoryAreas(department);
  if (!areas || !Array.isArray(rows)) return [];
  const allowed = new Set(areas.map(v => v.toLocaleLowerCase('es')));
  const trainerPositions = new Set([
    'entrenador(a)', 'coordinador(a) de entrenadores'
  ]);
  return rows.filter(row => {
    if (!row || row.estado !== 'Activo') return false;
    const area = String(row.area || '').trim().toLocaleLowerCase('es');
    if (!allowed.has(area)) return false;
    const position = String(row.puesto || '').trim().toLocaleLowerCase('es');
    if (department === 'entrenadores' && area === 'syncrolab') {
      return trainerPositions.has(position);
    }
    if (department === 'rec-syncrolab' && area === 'syncrolab') {
      return !trainerPositions.has(position);
    }
    return true;
  }).map(row => ({
    id: row.id,
    nombre: row.nombre,
    area: row.area,
    puesto: row.puesto,
    rol: row.rol,
    responsable: row.responsable,
    validador: row.validador,
    estado: 'Activo'
  }));
}
