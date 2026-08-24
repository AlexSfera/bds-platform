// ═══════════════════════════════════════════════════════════════════════
// /api/bitrix-backfill-hours.js — Backfill único de horas históricas
// v3 (Ago 2026) — AHORA CREA TURNOS BXAUTO_ RETROACTIVOS.
//
// PROPÓSITO:
//   El cron diario /api/bitrix-sync empezó a operar en jul 2026 y sólo
//   guarda el día anterior. Para el panel "Horas Mensuales" necesitamos
//   la historia completa desde 2026-01-01 en `bitrix_time_records`.
//   Este endpoint hace ese backfill.
//
// NOVEDAD v3 (petición dirección, Ago 2026):
//   Además del import a `bitrix_time_records`, ejecuta un PASE DE
//   ASOCIACIÓN sobre TODO el rango histórico:
//     · Agrupa registros pendientes por (employee_id, fecha_operativa)
//     · Busca turnos manuales del empleado en ±1 día
//         (excluye id 'BXSH_%', 'BXAUTO_%' y estado 'Sin declarar')
//     · 1 candidato manual → PATCH: añade horas + referencia Bitrix
//                            (nunca toca checklist/KPIs/estado/declaraciones)
//     · >1 candidato → marca `ambiguous` (revisión Admin)
//     · 0 candidatos → AUTO-CREA turno mínimo `BXAUTO_*` estado 'Validado'
//                      con horas Bitrix reales (start_ts / end_ts),
//                      firmado por 'system_backfill_hist'.
//                      Datos históricos: no requieren validación humana
//                      (a diferencia del cron nocturno, que crea BXAUTO_ en
//                      'Pendiente' para que el empleado complete al día
//                      siguiente).
//
//   Con esto, mayo/junio 2026 (y cualquier día previo al arranque del
//   cron) quedan cubiertos igual que el proceso nocturno.
//
// DIFERENCIA VS bitrix-sync.js:
//   · Aquel procesa 1 día objetivo + ventana ±RETRY_DAYS de reintento.
//   · Éste procesa el RANGO ENTERO del backfill de una vez, cargando
//     los turnos manuales del rango en memoria (1 query en lugar de N).
//
// IDEMPOTENCIA:
//   · IDs de BXAUTO_ deterministas por (employee_id, fecha) → conflict
//     silencioso vía `Prefer: resolution=ignore-duplicates`.
//   · Registros ya `matched` de una ejecución previa no se reprocesan
//     (filtro `sync_status=eq.pending_manual_shift`).
//   · Relanzar el endpoint es seguro y no crea duplicados.
//
// AUTH:
//   A) Header 'Authorization: Bearer <CRON_SECRET>'  ← curl / cron manual
//   B) Sesión válida con rol=admin                    ← botón del panel
//
// USO desde el panel:
//   El botón "⚙ Backfill histórico" envía POST con la sesión.
//
// USO desde curl:
//   POST /api/bitrix-backfill-hours?desde=2026-01-01&hasta=2026-08-14
//        Header: Authorization: Bearer <CRON_SECRET>
//        [&dry_run=1]     → simula sin escribir
//        [&skip_asoc=1]   → sólo importar records, sin crear turnos
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BITRIX_WEBHOOK       = process.env.BITRIX_WEBHOOK;
const CRON_SECRET          = process.env.CRON_SECRET;

const MADRID_TZ     = 'Europe/Madrid';
const TOLERANCIA_MS = 60 * 60 * 1000; // ±1 hora (decisión CEO, spec bitrix-sync)

// ─── HELPERS TIMEZONE (verbatim de bitrix-sync.js) ───────────────────
function nowMadridTs() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const g = k => parts.find(p => p.type === k).value;
  const madridStr = `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
  const madridAsUtc = new Date(madridStr + 'Z');
  const offMin = Math.round((madridAsUtc.getTime() - d.getTime()) / 60000);
  const sign = offMin >= 0 ? '+' : '-';
  const oh = String(Math.floor(Math.abs(offMin) / 60)).padStart(2, '0');
  const om = String(Math.abs(offMin) % 60).padStart(2, '0');
  return `${madridStr}${sign}${oh}:${om}`;
}

function toMadridParts(isoStr) {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  }).formatToParts(d);
  const g = k => parts.find(p => p.type === k).value;
  return {
    fechaMadrid: `${g('year')}-${g('month')}-${g('day')}`,
    horaMadrid:  parseInt(g('hour'), 10),
    minMadrid:   parseInt(g('minute'), 10)
  };
}

function deducirFechaOperativa(isoStr) {
  const { fechaMadrid, horaMadrid } = toMadridParts(isoStr);
  if (horaMadrid >= 0 && horaMadrid < 3) {
    const [y, m, d] = fechaMadrid.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
  }
  return fechaMadrid;
}

function deducirServicio(isoStr) {
  const { horaMadrid } = toMadridParts(isoStr);
  if (horaMadrid >= 5 && horaMadrid < 15) return 'Mañana';
  if (horaMadrid >= 15 && horaMadrid < 23) return 'Tarde';
  return 'Noche';
}

function ymdShift(fechaYmd, deltaDias) {
  const [y, m, d] = fechaYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDias);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ─── ASIGNACIÓN DE TURNO SPEC 22 (verbatim de bitrix-sync.js) ────────
const SERVICE_WINDOWS = { 'Desayuno': [390, 660], 'Comida': [750, 990], 'Cena': [1170, 1410] };
const PUESTOS_ENTRENADOR = ['Entrenador(a)', 'Coordinador(a) de Entrenadores'];
const PUESTOS_FISIO      = ['Fisioterapeuta', 'Coordinador(a) de Fisioterapeutas'];

function turnoDeptKey(area, puesto) {
  const a = String(area || ''), p = String(puesto || '');
  if (a === 'Recepción') return 'Recepción';
  if (a === 'HK' || a === 'Housekeeping' || a === 'Limpieza') return 'Housekeeping';
  if (a === 'Mantenimiento') return 'Mantenimiento';
  if (a === 'Cocina' || a === 'Friegue') return 'Cocina';
  if (a === 'Sala') return 'Sala';
  if (/syncrolab|syncro lab/i.test(a)) {
    if (PUESTOS_ENTRENADOR.indexOf(p) !== -1) return 'Entrenadores';
    if (PUESTOS_FISIO.indexOf(p) !== -1) return 'Clínica';
    return 'Recepción SYNCROLAB';
  }
  if (/cl[ií]nica|fisio/i.test(a)) return 'Clínica';
  return null;
}

const TURNO_APERTURA_MAP = {
  'Recepción': {
    rangos: [ { d: 180, h: 660, t: 'Mañana' }, { d: 660, h: 1140, t: 'Tarde' }, { d: 1140, h: 180, t: 'Noche', ayerSiAperturaAntes: 180 } ],
    inicios: [420, 900, 1380]
  },
  'Housekeeping':        { rangos: [ { d: 0, h: 660, t: 'Mañana' }, { d: 660, h: 1440, t: 'Tarde' } ], inicios: [360, 420, 840] },
  'Mantenimiento':       { rangos: [ { d: 0, h: 660, t: 'Mañana' }, { d: 660, h: 1440, t: 'Tarde' } ], inicios: [420, 840] },
  'Recepción SYNCROLAB': { rangos: [ { d: 0, h: 630, t: 'Mañana' }, { d: 630, h: 1440, t: 'Tarde' } ], inicios: [480, 510, 690, 795] },
  'Entrenadores':        { rangos: [ { d: 0, h: 900, t: 'Mañana' }, { d: 900, h: 1440, t: 'Tarde' } ], inicios: [480, 540, 1020, 1080] },
  'Clínica':             { rangos: [ { d: 0, h: 660, t: 'Mañana' }, { d: 660, h: 1440, t: 'Tarde' } ], inicios: [480, 720] },
  'Cocina': {
    rangos: [ { d: 120, h: 660, t: 'Mañana' }, { d: 660, h: 1020, t: 'Comida' }, { d: 1020, h: 120, t: 'Cena' } ],
    inicios: [360, 540, 720, 1200], multi: true
  },
  'Sala': {
    rangos: [ { d: 120, h: 630, t: 'Mañana' }, { d: 630, h: 900, t: 'Comida' }, { d: 900, h: 1080, t: 'Tarde' }, { d: 1080, h: 120, t: 'Cena' } ],
    inicios: [360, 420, 660, 720, 780, 900, 1200], multi: true
  }
};

function enRango(m, r) {
  return r.d <= r.h ? (m >= r.d && m < r.h) : (m >= r.d || m < r.h);
}

function computeServiciosSolape(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const s = toMadridParts(startIso), e = toMadridParts(endIso);
  const ini = s.horaMadrid * 60 + s.minMadrid;
  let fin = e.horaMadrid * 60 + e.minMadrid;
  let dias = 0;
  if (e.fechaMadrid !== s.fechaMadrid) { dias = Math.round((new Date(e.fechaMadrid) - new Date(s.fechaMadrid)) / 86400000); }
  fin += dias * 1440;
  if (fin <= ini) return null;
  const res = [];
  Object.keys(SERVICE_WINDOWS).forEach(sv => {
    const w = SERVICE_WINDOWS[sv];
    for (let dd = 0; dd <= Math.ceil(dias); dd++) {
      const ov = Math.min(fin, w[1] + dd * 1440) - Math.max(ini, w[0] + dd * 1440);
      if (ov >= 60 && res.indexOf(sv) === -1) res.push(sv);
    }
  });
  const order = ['Desayuno', 'Comida', 'Cena'];
  res.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return res.length ? res : null;
}

function asignarTurnoSpec22(area, puesto, startIso, endIso) {
  const key = turnoDeptKey(area, puesto);
  if (!key || !TURNO_APERTURA_MAP[key]) return null;
  const cfg = TURNO_APERTURA_MAP[key];
  const { fechaMadrid, horaMadrid, minMadrid } = toMadridParts(startIso);
  const m = horaMadrid * 60 + minMadrid;
  const rango = cfg.rangos.find(r => enRango(m, r));
  if (!rango) return null;
  let fecha = fechaMadrid;
  if (rango.ayerSiAperturaAntes != null && m < rango.ayerSiAperturaAntes) {
    const [y, mo, d] = fechaMadrid.split('-').map(Number);
    const prev = new Date(Date.UTC(y, mo - 1, d)); prev.setUTCDate(prev.getUTCDate() - 1);
    fecha = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
  }
  let dist = Infinity;
  cfg.inicios.forEach(ini => { let dd = Math.abs(m - ini); if (dd > 720) dd = 1440 - dd; if (dd < dist) dist = dd; });
  let servicio = rango.t;
  if (cfg.multi) {
    const arr = computeServiciosSolape(startIso, endIso);
    servicio = JSON.stringify(arr && arr.length ? arr : [rango.t]);
  }
  return { turno: rango.t, servicio, fecha, atipico: dist > 90, distanciaMin: dist, deptKey: key, multi: !!cfg.multi };
}

// ─── BITRIX V3 ───────────────────────────────────────────────────────
async function bitrixV3(metodo, params) {
  const url = BITRIX_WEBHOOK.replace('/rest/', '/rest/api/') + '/' + metodo;
  const results = [];
  let page = 1;

  async function fetchWithRetry(body, attempt = 0) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r.status >= 500 && attempt < 1) {
        await new Promise(res => setTimeout(res, 1500));
        return fetchWithRetry(body, attempt + 1);
      }
      return r;
    } catch (e) {
      if (attempt < 1) {
        await new Promise(res => setTimeout(res, 1500));
        return fetchWithRetry(body, attempt + 1);
      }
      throw e;
    }
  }

  while (true) {
    const body = Object.assign({}, params || {}, { pagination: { page, limit: 50 } });
    const r = await fetchWithRetry(body);
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Bitrix ${metodo} HTTP ${r.status}: ${txt.slice(0, 300)}`);
    }
    const data = await r.json();
    if (data.error) throw new Error(`Bitrix ${metodo}: ${JSON.stringify(data.error)}`);
    const items = (data.result && data.result.items) || [];
    results.push(...items);
    if (items.length < 50) break;
    page++;
    if (page > 200) break;
  }
  return results;
}

// ─── SUPABASE (service key para escribir) ────────────────────────────
async function sb(method, path, body, extraHeaders) {
  const url = SUPABASE_URL + '/rest/v1/' + path;
  const headers = Object.assign({
    'apikey':        SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    'Content-Type':  'application/json'
  }, extraHeaders || {});
  const opts = { method, headers };
  if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase ${method} ${path} HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  if (r.status === 204) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Helper: página larga (>1000 filas) usando offset explícito.
async function sbGetAllPaged(pathBase, pageSize) {
  const PAGE = pageSize || 1000;
  const out = [];
  let from = 0;
  while (true) {
    const sep = pathBase.indexOf('?') >= 0 ? '&' : '?';
    const rows = await sb('GET', `${pathBase}${sep}limit=${PAGE}&offset=${from}`);
    if (!rows || !rows.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
    if (from > 500000) break;
  }
  return out;
}

// ─── AUTH: validar sesión y consultar rol ────────────────────────────
async function validarSesionAdmin(bearerToken) {
  if (!bearerToken) return null;
  try {
    const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + bearerToken
      }
    });
    if (!authRes.ok) return null;
    const authUser = await authRes.json();
    if (!authUser || !authUser.id) return null;

    const identRows = await sb('GET',
      'syncro_auth_identities?auth_user_id=eq.' + encodeURIComponent(authUser.id)
      + '&select=employee_id,active&limit=1'
    );
    const ident = (identRows && identRows[0]) || null;
    if (!ident || ident.active === false) return null;

    const empRows = await sb('GET',
      'employees?id=eq.' + encodeURIComponent(ident.employee_id)
      + '&select=id,rol,estado&limit=1'
    );
    const emp = (empRows && empRows[0]) || null;
    if (!emp) return null;
    if (emp.estado === 'Baja') return null;
    return emp.rol || null;
  } catch (_) {
    return null;
  }
}

// ─── PASE DE ASOCIACIÓN RETROACTIVA ───────────────────────────────────
// Procesa TODO el rango [desde, hasta] de una sola vez:
//   · Carga todos los pending del rango
//   · Carga todos los shifts manuales del rango ±1 día en memoria
//   · Agrupa pendientes por (empleado, fecha_operativa) y decide
//   · Idempotente: BXAUTO_ id determinista + ignore-duplicates
//
// Devuelve: { matched, ambiguous, autoCreated, stillPending, detalles }
async function paseAsociacionBackfill(desde, hasta, DRY_RUN, empleadosById) {
  const fDesde = ymdShift(desde, -1);
  const fHasta = ymdShift(hasta, 1);

  // 1. Pending del rango (pueden ser miles: paginar)
  const pendientes = await sbGetAllPaged(
    'bitrix_time_records?sync_status=eq.pending_manual_shift'
    + `&fecha_operativa=gte.${desde}&fecha_operativa=lte.${hasta}`
    + '&select=id,bitrix_record_id,employee_id,start_ts,end_ts,duration_seconds,fecha_operativa,servicio'
    + '&order=start_ts.asc'
  );

  // 2. Todos los shifts manuales del rango ampliado, en memoria
  //    (excluye 'Sin declarar'; los BXSH_/BXAUTO_ se filtran en JS)
  const shiftsRango = await sbGetAllPaged(
    'shifts?'
    + `fecha=gte.${fDesde}&fecha=lte.${fHasta}`
    + '&estado=neq.Sin%20declarar'
    + '&select=id,employee_id,fecha,servicio,estado,horas,hora_registro,created_at,bitrix_shift_id,nombre'
  );
  // Índice por employee_id → array de shifts
  const shiftsByEmp = {};
  for (const s of shiftsRango) {
    if (!s || !s.employee_id) continue;
    if (s.id && (s.id.startsWith('BXAUTO_') || s.id.startsWith('BXSH_'))) continue;
    if (!shiftsByEmp[s.employee_id]) shiftsByEmp[s.employee_id] = [];
    shiftsByEmp[s.employee_id].push(s);
  }

  // 3. Agrupar pendientes por (empleado, fecha_operativa)
  let matched = 0, ambiguous = 0, autoCreated = 0, stillPending = 0;
  const detalles = [];
  const grupos = {};
  for (const r of pendientes) {
    if (!r.end_ts) { stillPending++; continue; }
    const key = r.employee_id + '|' + r.fecha_operativa;
    if (!grupos[key]) grupos[key] = { employee_id: r.employee_id, fecha: r.fecha_operativa, recs: [] };
    grupos[key].recs.push(r);
  }

  // 4. Procesar cada grupo
  for (const g of Object.values(grupos)) {
    try {
      const totalSeg = g.recs.reduce((a, r) => a + (parseFloat(r.duration_seconds) || 0), 0);
      const horasBx  = Math.round(totalSeg / 36) / 100;
      const cierreBx = g.recs.reduce((max, r) => {
        const t = new Date(r.end_ts).getTime();
        return (!isNaN(t) && t > max) ? t : max;
      }, 0);
      if (!cierreBx || totalSeg <= 0) { stillPending += g.recs.length; continue; }

      const emp     = empleadosById[g.employee_id] || null;
      const inicioBx = g.recs[0].start_ts;
      const finBxTs  = g.recs[g.recs.length - 1].end_ts;
      const asig     = emp ? asignarTurnoSpec22(emp.area, emp.puesto, inicioBx, finBxTs) : null;

      // Candidatos: shifts manuales del empleado dentro de ±1 día del cierre
      const fInf = ymdShift(g.fecha, -1);
      const fSup = ymdShift(g.fecha, 1);
      const shiftsEmp = (shiftsByEmp[g.employee_id] || []).filter(s => {
        return s.fecha >= fInf && s.fecha <= fSup;
      });
      const candidatos = shiftsEmp.filter(s => {
        const ref = s.hora_registro || s.created_at;
        if (!ref) return false;
        const t = new Date(ref).getTime();
        return !isNaN(t) && Math.abs(t - cierreBx) <= TOLERANCIA_MS;
      });

      if (candidatos.length === 1) {
        const s = candidatos[0];
        const shiftsMismoDia = shiftsEmp.filter(x => x.fecha === g.fecha).length;
        const servActual = String(s.servicio || '');
        const puedeReasignar = asig && shiftsMismoDia <= 1 && !/Evento|Otro/.test(servActual);

        if (!DRY_RUN) {
          const patchBody = {
            horas:                   horasBx,
            horas_bitrix:            horasBx,
            horas_source:            'bitrix',
            bitrix_shift_id:         g.recs.map(r => r.bitrix_record_id).join(','),
            bitrix_started_at:       g.recs[0].start_ts,
            bitrix_closed_at:        g.recs[g.recs.length - 1].end_ts,
            bitrix_duration_minutes: Math.round(totalSeg / 60),
            bitrix_synced_at:        nowMadridTs(),
            updated_at:              nowMadridTs()
          };
          if (puedeReasignar && String(asig.servicio) !== servActual) {
            patchBody.servicio = asig.servicio;
          }
          await sb('PATCH', `shifts?id=eq.${encodeURIComponent(s.id)}`, patchBody, { 'Prefer': 'return=minimal' });
          await sb('PATCH', `bitrix_time_records?id=in.(${g.recs.map(r => r.id).join(',')})`, {
            sync_status:      'matched',
            matched_shift_id: s.id,
            matched_ts:       nowMadridTs(),
            sync_error:       null
          }, { 'Prefer': 'return=minimal' });
        }
        matched++;
        detalles.push(`match ${g.employee_id} ${g.fecha} → ${s.id} (${horasBx}h)`);
      } else if (candidatos.length > 1) {
        if (!DRY_RUN) {
          await sb('PATCH', `bitrix_time_records?id=in.(${g.recs.map(r => r.id).join(',')})`, {
            sync_status: 'ambiguous',
            sync_error:  'multiple_manual_shift_candidates: ' + candidatos.map(c => c.id).join(',')
          }, { 'Prefer': 'return=minimal' });
        }
        ambiguous++;
        detalles.push(`ambiguous ${g.employee_id} ${g.fecha} (${candidatos.length} candidatos)`);
      } else {
        // 0 candidatos → AUTO-CREAR turno BXAUTO_
        try {
          if (emp && totalSeg > 0) {
            const autoId = 'BXAUTO_' + g.employee_id.replace(/[^a-zA-Z0-9]/g, '_')
                         + '_' + g.fecha.replace(/-/g, '');
            const servDeducido = (asig && asig.servicio) || (g.recs[0] && g.recs[0].servicio) || 'Mañana';

            if (!DRY_RUN) {
              await sb('POST', 'shifts', {
                id:                    autoId,
                employee_id:           emp.id,
                nombre:                emp.nombre || '',
                puesto:                emp.puesto || '',
                area:                  emp.area || '',
                fecha:                 g.fecha,
                servicio:              servDeducido,
                horas:                 horasBx,
                horas_bitrix:          horasBx,
                horas_source:          'bitrix',
                estado:                'Validado',
                validado_por:          'system_backfill_hist',
                responsable_id:        null,
                responsable_nombre:    '',
                follow_up:             'no',
                merma_declarada:       'no',
                incidencia_declarada:  'no',
                observacion:           'Turno auto-creado por backfill Bitrix (sin turno manual registrado)',
                bitrix_shift_id:       g.recs.map(r => r.bitrix_record_id).join(','),
                bitrix_started_at:     g.recs[0].start_ts,
                bitrix_closed_at:      g.recs[g.recs.length - 1].end_ts,
                bitrix_duration_minutes: Math.round(totalSeg / 60),
                bitrix_synced_at:      nowMadridTs(),
                created_at:            nowMadridTs()
              }, { 'Prefer': 'resolution=ignore-duplicates,return=minimal' });

              await sb('PATCH',
                'bitrix_time_records?id=in.(' + g.recs.map(r => r.id).join(',') + ')', {
                sync_status:      'matched',
                matched_shift_id: autoId,
                matched_ts:       nowMadridTs(),
                sync_error:       null
              }, { 'Prefer': 'return=minimal' });
            }
            autoCreated++;
            detalles.push('auto-created ' + g.employee_id + ' ' + g.fecha
                        + ' → ' + autoId + ' (' + horasBx + 'h)');
          } else {
            stillPending += g.recs.length;
          }
        } catch (eAuto) {
          detalles.push('auto-create-error ' + g.employee_id + ' ' + g.fecha
                      + ': ' + String(eAuto.message || eAuto).slice(0, 150));
          stillPending += g.recs.length;
        }
      }
    } catch (e) {
      detalles.push(`error ${g.employee_id} ${g.fecha}: ${String(e.message || e).slice(0, 150)}`);
    }
  }

  return { matched, ambiguous, autoCreated, stillPending, detalles, pendientes_procesados: pendientes.length };
}

// ─── HANDLER ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Auth dual:
  //   A) Bearer CRON_SECRET  → autorización de sistema
  //   B) Bearer <access_token> de sesión + rol=admin → botón del panel
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  let authorized = false;

  if (CRON_SECRET && auth === 'Bearer ' + CRON_SECRET) {
    authorized = true;
  } else if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const rol = await validarSesionAdmin(token);
    if (rol === 'admin') authorized = true;
  }

  if (!authorized) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const q = (req.query && typeof req.query === 'object') ? req.query
          : (new URL(req.url || '/', 'http://x').searchParams);
  const gp = k => (q.get ? q.get(k) : q[k]);

  const DRY_RUN   = String(gp('dry_run')   || '') === '1';
  const SKIP_ASOC = String(gp('skip_asoc') || '') === '1';
  const desde     = gp('desde') || '2026-01-01';
  const hastaRaw  = gp('hasta');
  const onlyUser  = gp('only_user');

  let hasta;
  if (hastaRaw) {
    hasta = hastaRaw;
  } else {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const g = k => parts.find(p => p.type === k).value;
    hasta = `${g('year')}-${g('month')}-${g('day')}`;
  }

  const startedAt = Date.now();
  const rangeStart = `${desde}T00:00:00+01:00`;
  const rangeEnd   = `${hasta}T23:59:59+02:00`;

  try {
    // ── 1. Empleados vinculados a Bitrix ──────────────────────────────
    let empQuery = 'employees?select=id,nombre,area,puesto,bitrix_user_id&bitrix_user_id=not.is.null';
    if (onlyUser) empQuery += `&bitrix_user_id=eq.${encodeURIComponent(onlyUser)}`;
    const employees = await sb('GET', empQuery);
    if (!employees || !employees.length) {
      return res.status(200).json({ ok: true, msg: 'sin empleados', desde, hasta });
    }

    const empleadosById = {};
    employees.forEach(e => { empleadosById[e.id] = e; });

    // ── 2. Importar intervalos raw de Bitrix (concurrente por empleado) ──
    const resultadosImport = [];
    let totalIntervals = 0;
    let totalInserted  = 0;

    const CONCURRENCY = 4;
    for (let i = 0; i < employees.length; i += CONCURRENCY) {
      const chunk = employees.slice(i, i + CONCURRENCY);
      const outs = await Promise.all(chunk.map(async (emp) => {
        try {
          const registros = await bitrixV3('timeman.record.list', {
            filter: [
              ['userId', parseInt(emp.bitrix_user_id, 10)],
              ['startTime', 'between', [rangeStart, rangeEnd]]
            ],
            select: ['id', 'userId', 'startTime', 'endTime', 'duration', 'breakLength', 'isApproved'],
            order:  { startTime: 'ASC' }
          });

          if (!registros.length) {
            return { emp: emp.nombre, intervals: 0, inserted: 0 };
          }

          const rows = [];
          const importedTs = new Date().toISOString();
          for (const r of registros) {
            if (!r.endTime || !r.duration) continue;
            const st = (typeof r.startTime === 'string') ? r.startTime : (r.startTime && r.startTime.date);
            const et = (typeof r.endTime   === 'string') ? r.endTime   : (r.endTime   && r.endTime.date);
            if (!st) continue;

            const fecha    = deducirFechaOperativa(st);
            const servicio = deducirServicio(st);

            rows.push({
              id:                'BX_' + r.id,
              bitrix_record_id:  r.id,
              bitrix_user_id:    emp.bitrix_user_id,
              employee_id:       emp.id,
              start_ts:          st,
              end_ts:            et,
              duration_seconds:  r.duration,
              break_length:      r.breakLength || null,
              is_approved:       !!r.isApproved,
              fecha_operativa:   fecha,
              servicio:          servicio,
              imported_ts:       importedTs,
              sync_status:       'pending_manual_shift'
            });
          }

          let inserted = 0;
          if (rows.length && !DRY_RUN) {
            await sb('POST', 'bitrix_time_records', rows, {
              'Prefer': 'resolution=ignore-duplicates,return=minimal'
            });
            inserted = rows.length;
          }
          return { emp: emp.nombre, intervals: rows.length, inserted };
        } catch (e) {
          return { emp: emp.nombre, error: String(e.message || e).slice(0, 200) };
        }
      }));
      resultadosImport.push(...outs);
      outs.forEach(o => {
        totalIntervals += o.intervals || 0;
        totalInserted  += o.inserted  || 0;
      });
    }

    // ── 3. Pase de asociación retroactiva (crea BXAUTO_ / matchea manuales) ──
    let aso = { matched: 0, ambiguous: 0, autoCreated: 0, stillPending: 0, detalles: [], pendientes_procesados: 0 };
    if (!SKIP_ASOC) {
      aso = await paseAsociacionBackfill(desde, hasta, DRY_RUN, empleadosById);
    }

    // ── 4. Audit + respuesta ──────────────────────────────────────────
    const durMs = Date.now() - startedAt;
    const errores = resultadosImport.filter(r => r.error);
    const resumen = `BACKFILL v3 desde=${desde} hasta=${hasta} emps=${employees.length} `
                  + `intervals=${totalIntervals} inserted=${totalInserted} `
                  + `matched=${aso.matched} auto_created=${aso.autoCreated} `
                  + `ambiguous=${aso.ambiguous} pending=${aso.stillPending} `
                  + `errs=${errores.length} dur=${durMs}ms`;

    if (!DRY_RUN) {
      try {
        await sb('POST', 'audit_log', {
          id:      'AL_BXBF_' + Date.now(),
          ts:      nowMadridTs(),
          usuario: 'system_bitrix_backfill',
          rol:     'system',
          action:  'BITRIX_BACKFILL_HOURS',
          detail:  resumen + (errores.length ? ' · ' + JSON.stringify(errores).slice(0, 400) : '')
        }, { 'Prefer': 'return=minimal' });
      } catch (_) {}
    }

    return res.status(200).json({
      ok: true,
      version: 'v3-backfill-con-asociacion',
      dry_run: DRY_RUN,
      skip_asoc: SKIP_ASOC,
      desde,
      hasta,
      empleados_procesados:  employees.length,
      intervalos_bitrix:     totalIntervals,
      insercion_intentos:    totalInserted,
      // Métricas del pase de asociación
      shifts_matched:        aso.matched,
      shifts_auto_creados:   aso.autoCreated,
      shifts_ambiguous:      aso.ambiguous,
      records_still_pending: aso.stillPending,
      pendientes_procesados: aso.pendientes_procesados,
      duracion_ms:           durMs,
      errores,
      detalles_import: resultadosImport
        .slice()
        .sort((a,b) => (b.intervals||0) - (a.intervals||0))
        .slice(0, 100),
      detalles_asociacion: (aso.detalles || []).slice(0, 100)
    });

  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), desde, hasta });
  }
}
