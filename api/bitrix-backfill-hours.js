// ═══════════════════════════════════════════════════════════════════════
// /api/bitrix-backfill-hours.js — Backfill único de horas históricas
// v2 (Ago 2026) — DUAL AUTH: sesión admin O Bearer CRON_SECRET.
//
// PROPÓSITO:
//   El cron diario /api/bitrix-sync empezó a operar en jul 2026 y sólo
//   guarda el día anterior. Para el panel "Horas Mensuales" necesitamos
//   la historia completa desde 2026-01-01 en `bitrix_time_records`.
//   Este endpoint hace ese backfill UNA sola vez.
//
// DIFERENCIA CLAVE VS /api/bitrix-sync:
//   · NO ejecuta paseAsociacion() → NO crea/modifica shifts
//   · NO crea turnos BXAUTO_* → cero contaminación de la tabla operativa
//   · Sólo INSERT en bitrix_time_records con ignore-duplicates
//     (idempotente: se puede relanzar sin efectos)
//
// AUTH (v2):
//   A) Header 'Authorization: Bearer <CRON_SECRET>'  ← uso desde curl/cron
//   B) Sesión válida con rol=admin                    ← uso desde el panel
//   Cualquiera de las dos vale. La sesión se valida como en otros
//   endpoints de /api/auth/.
//
// USO desde el panel:
//   El botón "⚙ Backfill histórico" envía POST con la sesión (cookies +
//   Bearer token de Supabase Auth manejado por syncroSupabaseFetch).
//
// USO desde curl:
//   POST /api/bitrix-backfill-hours?desde=2026-01-01&hasta=2026-08-14
//        Header: Authorization: Bearer <CRON_SECRET>
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BITRIX_WEBHOOK       = process.env.BITRIX_WEBHOOK;
const CRON_SECRET          = process.env.CRON_SECRET;

const MADRID_TZ = 'Europe/Madrid';

// ─── HELPERS TIMEZONE (copiados verbatim de bitrix-sync.js) ──────────
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

// ─── AUTH: validar sesión y consultar rol ────────────────────────────
// Verifica el Bearer token contra Supabase Auth y luego busca el rol del
// empleado en employees. Devuelve el rol o null si algo falla.
async function validarSesionAdmin(bearerToken) {
  if (!bearerToken) return null;
  try {
    // 1) Verificar token contra Supabase Auth
    const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + bearerToken
      }
    });
    if (!authRes.ok) return null;
    const authUser = await authRes.json();
    if (!authUser || !authUser.id) return null;

    // 2) Buscar identidad → empleado
    const identRows = await sb('GET',
      'syncro_auth_identities?auth_user_id=eq.' + encodeURIComponent(authUser.id)
      + '&select=employee_id,active&limit=1'
    );
    const ident = (identRows && identRows[0]) || null;
    if (!ident || ident.active === false) return null;

    // 3) Buscar rol
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
    // Evitar el caso extremo Bearer == CRON_SECRET ya cubierto arriba
    const rol = await validarSesionAdmin(token);
    if (rol === 'admin') authorized = true;
  }

  if (!authorized) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const q = (req.query && typeof req.query === 'object') ? req.query
          : (new URL(req.url || '/', 'http://x').searchParams);
  const gp = k => (q.get ? q.get(k) : q[k]);

  const DRY_RUN  = String(gp('dry_run') || '') === '1';
  const desde    = gp('desde') || '2026-01-01';
  const hastaRaw = gp('hasta');
  const onlyUser = gp('only_user');

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
    let empQuery = 'employees?select=id,nombre,bitrix_user_id&bitrix_user_id=not.is.null';
    if (onlyUser) empQuery += `&bitrix_user_id=eq.${encodeURIComponent(onlyUser)}`;
    const employees = await sb('GET', empQuery);
    if (!employees || !employees.length) {
      return res.status(200).json({ ok: true, msg: 'sin empleados', desde, hasta });
    }

    const resultados = [];
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
      resultados.push(...outs);
      outs.forEach(o => {
        totalIntervals += o.intervals || 0;
        totalInserted  += o.inserted  || 0;
      });
    }

    const durMs = Date.now() - startedAt;
    const errores = resultados.filter(r => r.error);
    const resumen = `BACKFILL v2 desde=${desde} hasta=${hasta} emps=${employees.length} `
                  + `intervals=${totalIntervals} inserted_attempts=${totalInserted} `
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
      dry_run: DRY_RUN,
      desde,
      hasta,
      empleados_procesados: employees.length,
      intervalos_bitrix: totalIntervals,
      insercion_intentos: totalInserted,
      duracion_ms: durMs,
      errores,
      detalles: resultados
        .slice()
        .sort((a,b) => (b.intervals||0) - (a.intervals||0))
        .slice(0, 100)
    });

  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), desde, hasta });
  }
}
