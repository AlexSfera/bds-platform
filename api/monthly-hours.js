// ═══════════════════════════════════════════════════════════════════════
// /api/monthly-hours.js — Agregado horas por empleado y mes
// v3 (Ago 2026) — Añade patrones horarios y ranking.
//
// LEE:  bitrix_time_records + employees
// NO ESCRIBE en ninguna tabla.
//
// AUTH:  sesión válida + rol=admin
//
// NOVEDADES v3:
//   · patterns por empleado: horaEntradaMediaMin, horaSalidaMediaMin,
//     franjas {Mañana, Tarde, Noche}, %jornadasPartidas, diasTrabajados,
//     mediaHorasPorDiaTrabajado, coefVariacionMensual, diaSemanaFav.
//   · rankings: globalPos y areaPos (por total horas del rango).
//
// SALIDA extendida (mantiene backward compat con v2):
//   {
//     ok, range, months, employees[], n_records, computed_at, cache
//   }
//   Cada employee incluye ahora:
//     patterns: { horaEntradaMediaMin, horaSalidaMediaMin, franjas,
//                 pctPartidas, diasTrabajados, mediaHorasPorDia,
//                 coefVar, diaSemanaFav, diaSemanaHoras[] }
//     rankGlobal, rankArea
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

const MADRID_TZ = 'Europe/Madrid';

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

// Convertir ISO → { horaMin: 0-1439, diaSemana: 0=Dom...6=Sáb } en TZ Madrid
function madridTimeParts(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: MADRID_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false, weekday: 'short'
    }).formatToParts(d);
    const g = k => parts.find(p => p.type === k).value;
    const hh = parseInt(g('hour'), 10);
    const mm = parseInt(g('minute'), 10);
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { horaMin: hh * 60 + mm, diaSemana: wdMap[g('weekday')] ?? 0 };
  } catch (_) { return null; }
}

function franjaDeMinutos(horaMin) {
  const h = Math.floor(horaMin / 60);
  if (h >= 5 && h < 15) return 'Mañana';
  if (h >= 15 && h < 23) return 'Tarde';
  return 'Noche';
}

async function computeAggregate(desde, hasta) {
  const employees = await adminRequest(
    'employees?select=id,nombre,area,puesto,estado,bitrix_user_id'
    + '&bitrix_user_id=not.is.null'
    + '&order=nombre.asc'
  );

  const desdeYm = desde.slice(0, 7);
  const hastaYm = hasta.slice(0, 7);

  // Ahora traemos también start_ts y end_ts para poder calcular patrones
  const allRecords = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const path = 'bitrix_time_records'
      + '?select=employee_id,fecha_operativa,duration_seconds,start_ts,end_ts,servicio'
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
      _totalSeg: 0,
      // Acumuladores para patrones
      _entradaMinAcc: 0,
      _entradaCount: 0,
      _salidaMinAcc:  0,
      _salidaCount:   0,
      _franjas: { 'Mañana': 0, 'Tarde': 0, 'Noche': 0 },
      _diaSemanaSeg: [0,0,0,0,0,0,0], // Dom..Sáb
      _diasSet: new Set(),
      _diasConMultipleFichaje: new Set(),
      _diasVistos: new Set() // para saber en qué días había >1 fichaje
    };
  }

  // Índice provisional día→conteos por empleado (para detectar partidas)
  const empDayCount = {}; // empId -> { 'YYYY-MM-DD': N }

  for (const r of allRecords) {
    const eid = r.employee_id;
    if (!eid || !byEmp[eid]) continue;
    const ym = ymOf(r.fecha_operativa);
    if (!ym) continue;
    const seg = parseFloat(r.duration_seconds) || 0;
    if (seg <= 0) continue;

    const e = byEmp[eid];
    e._monthlySeg[ym] = (e._monthlySeg[ym] || 0) + seg;
    e._totalSeg += seg;

    // Patrones
    const start = madridTimeParts(r.start_ts);
    const end   = madridTimeParts(r.end_ts);
    if (start) {
      e._entradaMinAcc += start.horaMin;
      e._entradaCount++;
      const franja = r.servicio || franjaDeMinutos(start.horaMin);
      if (e._franjas[franja] != null) e._franjas[franja]++;
      else e._franjas[franjaDeMinutos(start.horaMin)]++;
      e._diaSemanaSeg[start.diaSemana] += seg;
    }
    if (end) {
      e._salidaMinAcc += end.horaMin;
      e._salidaCount++;
    }

    // Días trabajados y jornadas partidas
    const dia = r.fecha_operativa;
    e._diasSet.add(dia);
    if (!empDayCount[eid]) empDayCount[eid] = {};
    empDayCount[eid][dia] = (empDayCount[eid][dia] || 0) + 1;
  }

  // Cerrar cálculo de jornadas partidas: días con >=2 fichajes
  for (const eid of Object.keys(empDayCount)) {
    for (const dia of Object.keys(empDayCount[eid])) {
      if (empDayCount[eid][dia] >= 2) {
        byEmp[eid]._diasConMultipleFichaje.add(dia);
      }
    }
  }

  const months = monthsBetween(desdeYm, hastaYm);

  const empArr = Object.values(byEmp).map(e => {
    const monthly = {};
    months.forEach(ym => {
      monthly[ym] = Math.round(((e._monthlySeg[ym] || 0) / 3600) * 100) / 100;
    });
    const total = Math.round((e._totalSeg / 3600) * 100) / 100;

    // Patrones
    const nFranjas = e._franjas['Mañana'] + e._franjas['Tarde'] + e._franjas['Noche'];
    const franjas = nFranjas > 0 ? {
      Mañana: Math.round(e._franjas['Mañana']*1000/nFranjas)/10,
      Tarde:  Math.round(e._franjas['Tarde']*1000/nFranjas)/10,
      Noche:  Math.round(e._franjas['Noche']*1000/nFranjas)/10
    } : { Mañana: 0, Tarde: 0, Noche: 0 };

    const diasTrabajados = e._diasSet.size;
    const mediaHorasPorDia = diasTrabajados > 0
      ? Math.round((e._totalSeg / 3600) / diasTrabajados * 100) / 100
      : 0;
    const pctPartidas = diasTrabajados > 0
      ? Math.round(e._diasConMultipleFichaje.size * 1000 / diasTrabajados) / 10
      : 0;

    const horaEntradaMediaMin = e._entradaCount > 0
      ? Math.round(e._entradaMinAcc / e._entradaCount)
      : null;
    const horaSalidaMediaMin = e._salidaCount > 0
      ? Math.round(e._salidaMinAcc / e._salidaCount)
      : null;

    // Coeficiente de variación mensual (desviación estándar / media) para
    // los meses con datos. Baja cifra = ritmo constante, alta = irregular.
    const monthlyVals = months.map(ym => e._monthlySeg[ym] || 0).filter(v => v > 0);
    let coefVar = null;
    if (monthlyVals.length >= 2) {
      const mean = monthlyVals.reduce((a,b) => a+b, 0) / monthlyVals.length;
      if (mean > 0) {
        const varSum = monthlyVals.reduce((a,v) => a + Math.pow(v-mean, 2), 0);
        const stdDev = Math.sqrt(varSum / monthlyVals.length);
        coefVar = Math.round((stdDev / mean) * 1000) / 10; // en %
      }
    }

    // Día de la semana favorito (más horas acumuladas)
    let maxDia = 0, maxIdx = 0;
    e._diaSemanaSeg.forEach((v, i) => { if (v > maxDia) { maxDia = v; maxIdx = i; } });
    const diaSemanaFav = maxDia > 0 ? maxIdx : null;
    const diaSemanaHoras = e._diaSemanaSeg.map(s => Math.round(s/3600*10)/10);

    return {
      id: e.id,
      nombre: e.nombre,
      area: e.area,
      puesto: e.puesto,
      estado: e.estado,
      monthly,
      total,
      patterns: {
        horaEntradaMediaMin,
        horaSalidaMediaMin,
        franjas,
        pctPartidas,
        diasTrabajados,
        mediaHorasPorDia,
        coefVar,
        diaSemanaFav,
        diaSemanaHoras
      }
    };
  });

  // Rankings — solo entre empleados activos con horas > 0
  const activosConHoras = empArr.filter(e => e.estado === 'Activo' && e.total > 0);
  const sortedByTotal = activosConHoras.slice().sort((a,b) => b.total - a.total);
  const rankGlobalById = {};
  sortedByTotal.forEach((e, i) => { rankGlobalById[e.id] = i + 1; });
  const totalActivos = sortedByTotal.length;

  // Ranking por área
  const rankAreaById = {};
  const areaTotals = {};
  const byArea = {};
  activosConHoras.forEach(e => {
    if (!byArea[e.area]) byArea[e.area] = [];
    byArea[e.area].push(e);
  });
  Object.keys(byArea).forEach(area => {
    const sorted = byArea[area].sort((a,b) => b.total - a.total);
    areaTotals[area] = sorted.length;
    sorted.forEach((e, i) => { rankAreaById[e.id] = i + 1; });
  });

  empArr.forEach(e => {
    e.rankGlobal = rankGlobalById[e.id] || null;
    e.rankGlobalOf = totalActivos;
    e.rankArea = rankAreaById[e.id] || null;
    e.rankAreaOf = areaTotals[e.area] || 0;
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
