// ═══════════════════════════════════════════════════════════════════════
// /api/monthly-hours.js — Agregado horas por empleado y mes
// v2 (Ago 2026) — Solo admin. Sin bypass.
//
// LEE:  bitrix_time_records + employees
// NO ESCRIBE en ninguna tabla.
//
// AUTH:  sesión válida + rol=admin
//
// SALIDA: JSON compacto ~20 KB, cacheable en servidor 10 min.
// ═══════════════════════════════════════════════════════════════════════

import {
  jsonResponse,
  requireAuthEnabled,
  requireMethod,
  adminRequest
} from '../lib/auth-server.js';
import { loadManagementActor } from '../lib/authz-server.js';

export const config = { runtime: 'edge' };

const CACHE_TTL_MS = 10 * 60 * 1000;
let _cache = null;
let _cacheKey = '';
let _cacheTs = 0;

function ymOf(fechaOperativa) {
  if (!fechaOperativa || typeof fechaOperativa !== 'string') return null;
  return fechaOperativa.slice(0, 7);
}

function monthsBetween(desde, hasta) {
  const out = [];
  const [dy, dm] = desde.split('-').map(Number);
  const [hy, hm] = hasta.split('-').map(Number);
  let y = dy, m = dm;
  while (y < hy || (y === hy && m <= hm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 60) break;
  }
  return out;
}

async function computeAggregate(desde, hasta) {
  const employees = await adminRequest(
    'employees?select=id,nombre,area,puesto,estado,bitrix_user_id'
    + '&bitrix_user_id=not.is.null'
    + '&order=nombre.asc'
  );

  const desdeYm = desde.slice(0, 7);
  const hastaYm = hasta.slice(0, 7);

  const allRecords = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const path = 'bitrix_time_records'
      + '?select=employee_id,fecha_operativa,duration_seconds,sync_status'
      + `&fecha_operativa=gte.${desde}`
      + `&fecha_operativa=lte.${hasta}`
      + '&order=fecha_operativa.asc';
    const pageRows = await adminRequest(path + `&limit=${PAGE}&offset=${from}`);
    if (!pageRows || !pageRows.length) break;
    allRecords.push(...pageRows);
    if (pageRows.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break;
  }

  const byEmp = {};
  for (const emp of employees) {
    byEmp[emp.id] = {
      id: emp.id,
      nombre: emp.nombre,
      area: emp.area || '',
      puesto: emp.puesto || '',
      estado: emp.estado || '',
      _monthlySeg: {},
      _totalSeg: 0
    };
  }

  for (const r of allRecords) {
    const eid = r.employee_id;
    if (!eid || !byEmp[eid]) continue;
    const ym = ymOf(r.fecha_operativa);
    if (!ym) continue;
    const seg = parseFloat(r.duration_seconds) || 0;
    if (seg <= 0) continue;
    byEmp[eid]._monthlySeg[ym] = (byEmp[eid]._monthlySeg[ym] || 0) + seg;
    byEmp[eid]._totalSeg += seg;
  }

  const months = monthsBetween(desdeYm, hastaYm);
  const empArr = Object.values(byEmp).map(e => {
    const monthly = {};
    months.forEach(ym => {
      monthly[ym] = Math.round(((e._monthlySeg[ym] || 0) / 3600) * 100) / 100;
    });
    return {
      id: e.id,
      nombre: e.nombre,
      area: e.area,
      puesto: e.puesto,
      estado: e.estado,
      monthly,
      total: Math.round((e._totalSeg / 3600) * 100) / 100
    };
  });

  empArr.sort((a, b) => {
    if (a.estado === 'Activo' && b.estado !== 'Activo') return -1;
    if (a.estado !== 'Activo' && b.estado === 'Activo') return 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  return {
    ok: true,
    range: { desde, hasta },
    months,
    employees: empArr,
    n_records: allRecords.length,
    computed_at: new Date().toISOString()
  };
}

export default async function handler(req) {
  const disabled = requireAuthEnabled();
  if (disabled) return disabled;
  const wrongMethod = requireMethod(req, 'GET');
  if (wrongMethod) return wrongMethod;

  let actor;
  try { actor = await loadManagementActor(req); }
  catch (_) { return jsonResponse({ error: 'Authentication unavailable' }, 503); }
  if (!actor) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!actor.profile || actor.profile.rol !== 'admin') {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const url = new URL(req.url, 'http://x');
  const desde = url.searchParams.get('desde') || '2026-01-01';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const g = k => parts.find(p => p.type === k).value;
  const hoyMadrid = `${g('year')}-${g('month')}-${g('day')}`;
  const hasta = url.searchParams.get('hasta') || hoyMadrid;
  const forceFresh = url.searchParams.get('fresh') === '1';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return jsonResponse({ error: 'Formato de fecha inválido (YYYY-MM-DD)' }, 400);
  }

  const cacheKey = desde + '_' + hasta;
  const now2 = Date.now();

  if (!forceFresh && _cache && _cacheKey === cacheKey && (now2 - _cacheTs) < CACHE_TTL_MS) {
    return jsonResponse({ ..._cache, cache: 'hit' });
  }

  try {
    const data = await computeAggregate(desde, hasta);
    _cache    = data;
    _cacheKey = cacheKey;
    _cacheTs  = now2;
    return jsonResponse({ ...data, cache: 'miss' });
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
