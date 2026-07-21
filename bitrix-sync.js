// ═══════════════════════════════════════════════════════════════════════
// /api/bitrix-sync.js — Sincronización Bitrix24 Timeman → SYNCRO SHIFT
// v3 (Jul 2026) — ASOCIACIÓN + AUTO-CREACIÓN de turnos mínimos.
//
// PRINCIPIO (decisión CEO Jul 2026):
//   · El turno MANUAL de SYNCRO SHIFT es la fuente de verdad operativa.
//   · Bitrix24 es la fuente de verdad de horas trabajadas.
//   · La integración PRIMERO asocia horas a un turno manual existente.
//   · Si NO hay turno manual → CREA un turno mínimo (id=BXAUTO_*, estado
//     Pendiente) para que las horas Bitrix no se pierdan. El empleado
//     completa los datos operativos (checklist, gestión, incidencia) vía
//     la ventana de gracia de 1 día en la app.
//   · El turno es la unidad operativa central: cero duplicados.
//
// LÓGICA:
//   1. Lee employees.bitrix_user_id IS NOT NULL desde Supabase
//   2. Por cada empleado: pide timeman.record.list del día objetivo (Bitrix V3)
//   3. Convierte startTime a Europe/Madrid → deduce fecha_operativa + servicio
//   4. Guarda intervalos raw en bitrix_time_records con
//      sync_status='pending_manual_shift' (idempotente)
//   5. PASE DE ASOCIACIÓN (también re-intenta pendientes de los últimos
//      RETRY_DAYS días): agrupa pendientes por (employee_id, fecha_operativa) y
//        · busca turnos MANUALES del empleado con fecha en ±1 día
//          (excluye id 'BXSH_%', 'BXAUTO_%' y estado 'Sin declarar')
//        · coincidencia válida: |cierre Bitrix − hora_registro del turno| ≤ 1h
//        · 1 candidato  → PATCH turno: horas + referencia Bitrix
//                          (NUNCA toca checklist, KPIs, estado, declaraciones)
//                          y marca registros sync_status='matched'
//        · >1 candidato → sync_status='ambiguous' (revisión Admin)
//        · 0 candidatos → AUTO-CREA turno mínimo (BXAUTO_*) con horas
//                          Bitrix, marca registros sync_status='matched'.
//                          El empleado lo completa desde la app con gracia 1d.
//   6. Escribe audit_log
//
// TRIGGERS:
//   · Vercel Cron diario (vercel.json)
//   · Manual: POST /api/bitrix-sync?modo=range&fecha=YYYY-MM-DD con header
//     Authorization: Bearer <CRON_SECRET>   (añade &dry_run=1 para simular)
//
// VARIABLES DE ENTORNO REQUERIDAS (Vercel Project Settings):
//   BITRIX_WEBHOOK       — URL completa del webhook Bitrix
//   SUPABASE_URL         — https://tsfhrpdpbkciofvejrao.supabase.co
//   SUPABASE_SERVICE_KEY — service_role key (NO la publishable/anon)
//   CRON_SECRET          — 16+ chars aleatorios
//
// REQUIERE (una vez): ejecutar migracion_bitrix_merge.sql en Supabase.
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BITRIX_WEBHOOK       = process.env.BITRIX_WEBHOOK;
const CRON_SECRET          = process.env.CRON_SECRET;

const MADRID_TZ   = 'Europe/Madrid';
const TOLERANCIA_MS = 60 * 60 * 1000; // ±1 hora (decisión CEO)
const RETRY_DAYS    = 7;              // reintento de pendientes

// ─── VÍNCULOS EXPLÍCITOS SYNCRO SHIFT ↔ BITRIX (decisión CEO Jul 2026) ──
// El empleado 'BOSS' de SYNCRO SHIFT es 'Alexander Kolobnev' en Bitrix24.
// En cada ejecución, si el empleado existe y aún no tiene bitrix_user_id,
// se busca su usuario en Bitrix (user.get) y se escribe el vínculo en
// employees.bitrix_user_id automáticamente (sin SQL manual).
const EMPLOYEE_BITRIX_LINKS = [
  { syncro_nombre: 'BOSS', bitrix_name: 'Alexander', bitrix_last_name: 'Kolobnev' }
];

// ─── HELPERS TIMEZONE MADRID ──────────────────────────────────────────
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

function deducirServicioYFecha(isoStr) {
  const { fechaMadrid, horaMadrid } = toMadridParts(isoStr);
  if (horaMadrid >= 5 && horaMadrid < 15) return { servicio: 'Mañana', fecha: fechaMadrid };
  if (horaMadrid >= 15 && horaMadrid < 23) return { servicio: 'Tarde',  fecha: fechaMadrid };
  if (horaMadrid >= 23) return { servicio: 'Noche', fecha: fechaMadrid };
  const [y, m, d] = fechaMadrid.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return { servicio: 'Noche', fecha: `${py}-${pm}-${pd}` };
}

function rangoBitrixParaFechaOperativa(fechaOp) {
  const [y, m, d] = fechaOp.split('-').map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, d, -6, 0, 0));
  const fin    = new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0));
  const fmt = dt => dt.toISOString().replace(/\.\d+Z$/, '+00:00');
  return { inicio: fmt(inicio), fin: fmt(fin) };
}

function ymdShift(fechaYmd, deltaDias) {
  const [y, m, d] = fechaYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDias);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ─── BITRIX V3 ────────────────────────────────────────────────────────
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
    if (data.error) throw new Error(`Bitrix ${metodo} error: ${JSON.stringify(data.error)}`);
    const items = (data.result && data.result.items) || [];
    results.push(...items);
    if (items.length < 50) break;
    page++;
    if (page > 40) break; // safety cap
  }
  return results;
}

// ─── BITRIX REST CLÁSICO (webhook v2: user.get, etc.) ─────────────────
async function bitrixV2(metodo, params) {
  const base = BITRIX_WEBHOOK.replace(/\/+$/, '');
  const r = await fetch(base + '/' + metodo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Bitrix ${metodo} HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  const data = await r.json();
  if (data.error) throw new Error(`Bitrix ${metodo} error: ${JSON.stringify(data.error)}`);
  return data.result;
}

// ─── AUTO-VÍNCULO employees.bitrix_user_id ────────────────────────────
// Para cada entrada de EMPLOYEE_BITRIX_LINKS: si el empleado existe en
// SYNCRO SHIFT y no tiene bitrix_user_id, localiza el usuario en Bitrix
// por nombre+apellido (user.get) y escribe el vínculo. Idempotente.
// Falla en silencio controlado (se reporta en 'errores', no bloquea el sync).
async function autoLinkEmployees(DRY_RUN, errores) {
  let linked = 0;
  for (const link of EMPLOYEE_BITRIX_LINKS) {
    try {
      const emps = await sb('GET',
        'employees?nombre=eq.' + encodeURIComponent(link.syncro_nombre)
        + '&select=id,nombre,bitrix_user_id,estado'
      );
      const emp = (emps || []).find(e => e.estado !== 'Baja');
      if (!emp) { errores.push({ link: link.syncro_nombre, error: 'empleado no encontrado en SYNCRO SHIFT' }); continue; }
      if (emp.bitrix_user_id != null && emp.bitrix_user_id !== '') continue; // ya vinculado

      const users = await bitrixV2('user.get', {
        FILTER: { NAME: link.bitrix_name, LAST_NAME: link.bitrix_last_name, ACTIVE: true }
      });
      const arr = Array.isArray(users) ? users : [];
      if (arr.length !== 1) {
        errores.push({ link: link.syncro_nombre, error: 'user.get devolvió ' + arr.length + ' usuarios para ' + link.bitrix_name + ' ' + link.bitrix_last_name + ' (se requiere exactamente 1)' });
        continue;
      }
      if (!DRY_RUN) {
        await sb('PATCH', 'employees?id=eq.' + encodeURIComponent(emp.id),
          { bitrix_user_id: arr[0].ID },
          { 'Prefer': 'return=minimal' });
        try {
          await sb('POST', 'audit_log', {
            id: 'AL_BXLINK_' + Date.now(),
            ts: nowMadridTs(),
            usuario: 'system_bitrix_sync',
            rol: 'system',
            action: 'BITRIX_LINK',
            detail: emp.nombre + ' (' + emp.id + ') vinculado a Bitrix user ' + arr[0].ID + ' (' + link.bitrix_name + ' ' + link.bitrix_last_name + ')'
          }, { 'Prefer': 'return=minimal' });
        } catch (_) {}
      }
      linked++;
    } catch (e) {
      errores.push({ link: link.syncro_nombre, error: String(e.message || e).slice(0, 200) });
    }
  }
  return linked;
}

// ─── SUPABASE ─────────────────────────────────────────────────────────
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

// ─── PASE DE ASOCIACIÓN ───────────────────────────────────────────────
// Procesa TODOS los bitrix_time_records con sync_status='pending_manual_shift'
// cuya fecha_operativa esté entre (fechaObjetivo - RETRY_DAYS) y (fechaObjetivo + 1).
// Devuelve contadores para el resumen.
async function paseAsociacion(fechaObjetivo, DRY_RUN) {
  const desde = ymdShift(fechaObjetivo, -RETRY_DAYS);
  const hasta = ymdShift(fechaObjetivo, 1);

  const pendientes = await sb('GET',
    'bitrix_time_records?sync_status=eq.pending_manual_shift'
    + `&fecha_operativa=gte.${desde}&fecha_operativa=lte.${hasta}`
    + '&select=id,bitrix_record_id,employee_id,start_ts,end_ts,duration_seconds,fecha_operativa,servicio'
    + '&order=start_ts.asc'
  ) || [];

  let matched = 0, ambiguous = 0, stillPending = 0, autoCreated = 0;
  const detalles = [];

  // Agrupar por empleado + fecha_operativa (unidad = jornada Bitrix cerrada)
  const grupos = {};
  for (const r of pendientes) {
    if (!r.end_ts) { stillPending++; continue; } // fichaje sin cierre: esperar
    const key = r.employee_id + '|' + r.fecha_operativa;
    if (!grupos[key]) grupos[key] = { employee_id: r.employee_id, fecha: r.fecha_operativa, recs: [] };
    grupos[key].recs.push(r);
  }

  for (const g of Object.values(grupos)) {
    try {
      const totalSeg = g.recs.reduce((a, r) => a + (parseFloat(r.duration_seconds) || 0), 0);
      const horasBx  = Math.round(totalSeg / 36) / 100;
      const cierreBx = g.recs.reduce((max, r) => {
        const t = new Date(r.end_ts).getTime();
        return (!isNaN(t) && t > max) ? t : max;
      }, 0);
      if (!cierreBx || totalSeg <= 0) { stillPending += g.recs.length; continue; }

      // Turnos MANUALES del empleado en fecha ±1 día
      const fDesde = ymdShift(g.fecha, -1);
      const fHasta = ymdShift(g.fecha, 1);
      const shifts = await sb('GET',
        `shifts?employee_id=eq.${encodeURIComponent(g.employee_id)}`
        + `&fecha=gte.${fDesde}&fecha=lte.${fHasta}`
        + '&id=not.like.BXSH_*'
        + '&id=not.like.BXAUTO_*'
        + '&estado=neq.Sin%20declarar'
        + '&select=id,fecha,servicio,estado,horas,hora_registro,created_at,bitrix_shift_id,nombre'
      ) || [];

      // Coincidencia: |cierre Bitrix − hora_registro (o created_at)| ≤ 1h
      // Excluir auto-creados (BXAUTO_) por seguridad en JS también
      const candidatos = shifts.filter(s => {
        if (s.id && (s.id.startsWith('BXAUTO_') || s.id.startsWith('BXSH_'))) return false;
        const ref = s.hora_registro || s.created_at;
        if (!ref) return false;
        const t = new Date(ref).getTime();
        return !isNaN(t) && Math.abs(t - cierreBx) <= TOLERANCIA_MS;
      });

      if (candidatos.length === 1) {
        const s = candidatos[0];
        if (!DRY_RUN) {
          // SOLO horas + referencia Bitrix. Nunca checklist/KPIs/estado/declaraciones.
          await sb('PATCH', `shifts?id=eq.${encodeURIComponent(s.id)}`, {
            horas:                   horasBx,
            horas_bitrix:            horasBx,
            horas_source:            'bitrix',
            bitrix_shift_id:         g.recs.map(r => r.bitrix_record_id).join(','),
            bitrix_started_at:       g.recs[0].start_ts,
            bitrix_closed_at:        g.recs[g.recs.length - 1].end_ts,
            bitrix_duration_minutes: Math.round(totalSeg / 60),
            bitrix_synced_at:        nowMadridTs(),
            updated_at:              nowMadridTs()
          }, { 'Prefer': 'return=minimal' });
          await sb('PATCH', `bitrix_time_records?id=in.(${g.recs.map(r=>r.id).join(',')})`, {
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
          await sb('PATCH', `bitrix_time_records?id=in.(${g.recs.map(r=>r.id).join(',')})`, {
            sync_status: 'ambiguous',
            sync_error:  'multiple_manual_shift_candidates: ' + candidatos.map(c => c.id).join(',')
          }, { 'Prefer': 'return=minimal' });
        }
        ambiguous++;
        detalles.push(`ambiguous ${g.employee_id} ${g.fecha} (${candidatos.length} candidatos)`);
      } else {
        // 0 candidatos → AUTO-CREAR turno mínimo (v3 Jul 2026)
        // El empleado completa datos operativos vía la ventana de gracia 1d.
        try {
          const empData = await sb('GET',
            'employees?id=eq.' + encodeURIComponent(g.employee_id)
            + '&select=id,nombre,area,puesto&limit=1'
          );
          const emp = (empData && empData.length) ? empData[0] : null;
          if (emp && totalSeg > 0) {
            // ID determinista: mismo employee+fecha siempre genera mismo ID → idempotente
            const autoId = 'BXAUTO_' + g.employee_id.replace(/[^a-zA-Z0-9]/g, '_')
                         + '_' + g.fecha.replace(/-/g, '');
            const servDeducido = (g.recs[0] && g.recs[0].servicio) || 'Mañana';

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
                estado:                'Pendiente',
                responsable_id:        null,
                responsable_nombre:    '',
                follow_up:             'no',
                merma_declarada:       'no',
                incidencia_declarada:  'no',
                observacion:           'Turno auto-creado por bitrix-sync (sin turno manual registrado)',
                bitrix_shift_id:       g.recs.map(r => r.bitrix_record_id).join(','),
                bitrix_started_at:     g.recs[0].start_ts,
                bitrix_closed_at:      g.recs[g.recs.length - 1].end_ts,
                bitrix_duration_minutes: Math.round(totalSeg / 60),
                bitrix_synced_at:      nowMadridTs(),
                created_at:            nowMadridTs()
              }, { 'Prefer': 'resolution=ignore-duplicates,return=minimal' });

              // Marcar bitrix_time_records como matched contra el turno auto-creado
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

  return { matched, ambiguous, stillPending, autoCreated, detalles };
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────
export default async function handler(req, res) {
  // 1) Auth
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (!CRON_SECRET || auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // 2) Parámetros: por defecto sincroniza el DÍA ANTERIOR (Madrid)
  const q = (req.query && typeof req.query === 'object') ? req.query
          : (new URL(req.url || '/', 'http://x').searchParams);
  const modo = (q.modo || (q.get && q.get('modo')) || 'daily');
  const DRY_RUN = String(q.dry_run || (q.get && q.get('dry_run')) || '') === '1';
  let fechaObjetivo;
  if (modo === 'range' && (q.fecha || (q.get && q.get('fecha')))) {
    fechaObjetivo = (q.fecha || q.get('fecha'));
  } else {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const g = k => parts.find(p => p.type === k).value;
    const [hy, hm, hd] = [g('year'), g('month'), g('day')].map(Number);
    const ayer = new Date(Date.UTC(hy, hm - 1, hd));
    ayer.setUTCDate(ayer.getUTCDate() - 1);
    fechaObjetivo = `${ayer.getUTCFullYear()}-${String(ayer.getUTCMonth() + 1).padStart(2, '0')}-${String(ayer.getUTCDate()).padStart(2, '0')}`;
  }

  const startedAt = Date.now();

  try {
    const errores = [];

    // 2b) Auto-vínculo de empleados declarados en EMPLOYEE_BITRIX_LINKS
    const autoLinked = await autoLinkEmployees(DRY_RUN, errores);

    // 3) Empleados con bitrix_user_id — correspondencia estable por ID, nunca por nombre
    const employees = await sb('GET',
      'employees?select=id,nombre,area,puesto,bitrix_user_id&bitrix_user_id=not.is.null&estado=eq.Activo'
    );

    let totalIntervals = 0;

    // 4) Importar intervalos raw del día objetivo (idempotente)
    if (employees && employees.length) {
      const rango = rangoBitrixParaFechaOperativa(fechaObjetivo);
      const BATCH = 10;
      for (let i = 0; i < employees.length; i += BATCH) {
        const chunk = employees.slice(i, i + BATCH);
        await Promise.all(chunk.map(async (emp) => {
          try {
            const registros = await bitrixV3('timeman.record.list', {
              filter: [
                ['userId', parseInt(emp.bitrix_user_id, 10)],
                ['startTime', 'between', [rango.inicio, rango.fin]]
              ],
              select: ['id', 'userId', 'startTime', 'endTime', 'duration', 'breakLength', 'isApproved'],
              order:  { startTime: 'ASC' }
            });
            if (!registros.length) return;

            const rawRows = [];
            const importedTs = new Date().toISOString();
            for (const r of registros) {
              if (!r.endTime || !r.duration) continue; // fichaje en curso: ignorar
              const st = (typeof r.startTime === 'string') ? r.startTime : (r.startTime && r.startTime.date);
              if (!st) continue;
              const { servicio, fecha } = deducirServicioYFecha(st);
              if (fecha !== fechaObjetivo) continue;

              rawRows.push({
                id:                'BX_' + r.id,
                bitrix_record_id:  r.id,
                bitrix_user_id:    emp.bitrix_user_id,
                employee_id:       emp.id,
                start_ts:          st,
                end_ts:            (typeof r.endTime === 'string') ? r.endTime : (r.endTime && r.endTime.date),
                duration_seconds:  r.duration,
                break_length:      r.breakLength || null,
                is_approved:       !!r.isApproved,
                fecha_operativa:   fecha,
                servicio:          servicio,
                imported_ts:       importedTs,
                sync_status:       'pending_manual_shift'
              });
              totalIntervals++;
            }

            if (rawRows.length && !DRY_RUN) {
              await sb('POST', 'bitrix_time_records', rawRows, {
                'Prefer': 'resolution=ignore-duplicates,return=minimal'
              });
            }
            // v2: NUNCA se crean ni actualizan shifts aquí.
            // Toda escritura sobre shifts ocurre solo en paseAsociacion().
          } catch (e) {
            errores.push({ empleado: emp.nombre, bitrix_user_id: emp.bitrix_user_id, error: String(e.message || e).slice(0, 200) });
          }
        }));
      }
    }

    // 5) Pase de asociación (día objetivo + reintento de pendientes RETRY_DAYS)
    const aso = await paseAsociacion(fechaObjetivo, DRY_RUN);

    // 6) Audit log (solo en modo real)
    const durMs = Date.now() - startedAt;
    const resumen = `v3 fecha=${fechaObjetivo} emps=${(employees||[]).length} intervals=${totalIntervals} `
                  + `matched=${aso.matched} auto_created=${aso.autoCreated} ambiguous=${aso.ambiguous} `
                  + `pending=${aso.stillPending} autolinked=${autoLinked} errs=${errores.length} dur=${durMs}ms`;
    if (!DRY_RUN) {
      try {
        await sb('POST', 'audit_log', {
          id:      'AL_BX_' + Date.now(),
          ts:      nowMadridTs(),
          usuario: 'system_bitrix_sync',
          rol:     'system',
          action:  'BITRIX_SYNC',
          detail:  resumen + (errores.length ? ' · ' + JSON.stringify(errores).slice(0, 400) : '')
        }, { 'Prefer': 'return=minimal' });
      } catch (_) { /* audit no bloquea */ }
    }

    return res.status(200).json({
      ok: true,
      version: 'v3-asociacion-autocreate',
      dry_run: DRY_RUN,
      fecha: fechaObjetivo,
      empleados_procesados: (employees||[]).length,
      empleados_autovinculados: autoLinked,
      intervalos_bitrix: totalIntervals,
      turnos_asociados: aso.matched,
      conflictos_ambiguous: aso.ambiguous,
      registros_pendientes: aso.stillPending,
      shifts_auto_creados: aso.autoCreated,
      detalles: aso.detalles.slice(0, 50),
      duracion_ms: durMs,
      errores
    });

  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), fecha: fechaObjetivo });
  }
}
