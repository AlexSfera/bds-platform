// ═══════════════════════════════════════════════════════════════════════
// /api/bitrix-sync.js — Sincronización Bitrix24 Timeman → SYNCRO SHIFT
//
// TRIGGERS:
//   · Vercel Cron diario (definido en vercel.json)
//   · Manual: POST /api/bitrix-sync?modo=range&fecha=YYYY-MM-DD con header
//     Authorization: Bearer <CRON_SECRET>
//
// LÓGICA:
//   1. Lee employees.bitrix_user_id IS NOT NULL desde Supabase
//   2. Por cada empleado: pide timeman.record.list del día objetivo (Bitrix V3)
//   3. Convierte startTime a Europe/Madrid → deduce fecha_operativa + servicio
//        05:00-14:59 → Mañana (día calendario)
//        15:00-22:59 → Tarde  (día calendario)
//        23:00-04:59 → Noche  (23:xx = día actual; 00-04:xx = día anterior)
//   4. Guarda intervalos raw en bitrix_time_records (idempotente)
//   5. Agrupa por (fecha, servicio) y aplica:
//        · shift existente con horas IS NULL → UPDATE horas
//        · shift existente con horas ya rellenas → SKIP (manual histórico)
//        · sin shift → CREATE esqueleto con estado='Sin declarar'
//   6. Escribe audit_log
//
// VARIABLES DE ENTORNO REQUERIDAS (Vercel Project Settings):
//   BITRIX_WEBHOOK       — URL completa del webhook Bitrix (incluye user_id/token)
//   SUPABASE_URL         — https://tsfhrpdpbkciofvejrao.supabase.co
//   SUPABASE_SERVICE_KEY — service_role key (NO la publishable/anon)
//   CRON_SECRET          — 16+ chars aleatorios (autoprovisionado por Vercel)
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BITRIX_WEBHOOK       = process.env.BITRIX_WEBHOOK;
const CRON_SECRET          = process.env.CRON_SECRET;

const MADRID_TZ = 'Europe/Madrid';

// ─── HELPERS TIMEZONE MADRID ──────────────────────────────────────────
function nowMadridTs() {
  // Equivalente a localTs() del proyecto pero forzando Europe/Madrid.
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const g = k => parts.find(p => p.type === k).value;
  const madridStr = `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
  // Cálculo del offset Madrid en este instante (contempla DST)
  const madridAsUtc = new Date(madridStr + 'Z');
  const offMin = Math.round((madridAsUtc.getTime() - d.getTime()) / 60000);
  const sign = offMin >= 0 ? '+' : '-';
  const oh = String(Math.floor(Math.abs(offMin) / 60)).padStart(2, '0');
  const om = String(Math.abs(offMin) % 60).padStart(2, '0');
  return `${madridStr}${sign}${oh}:${om}`;
}

// Convierte cualquier ISO con offset a parts Madrid.
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

// Deducción de servicio + fecha operativa desde startTime del fichaje.
function deducirServicioYFecha(isoStr) {
  const { fechaMadrid, horaMadrid } = toMadridParts(isoStr);
  if (horaMadrid >= 5 && horaMadrid < 15) return { servicio: 'Mañana', fecha: fechaMadrid };
  if (horaMadrid >= 15 && horaMadrid < 23) return { servicio: 'Tarde',  fecha: fechaMadrid };
  // 23:xx → Noche del mismo día
  if (horaMadrid >= 23) return { servicio: 'Noche', fecha: fechaMadrid };
  // 00-04:xx → Noche del día anterior
  const [y, m, d] = fechaMadrid.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prev.getUTCDate()).padStart(2, '0');
  return { servicio: 'Noche', fecha: `${py}-${pm}-${pd}` };
}

// Rango ATOM ±1 día para capturar noches que cruzan medianoche.
function rangoBitrixParaFechaOperativa(fechaOp) {
  const [y, m, d] = fechaOp.split('-').map(Number);
  // Inicio: día objetivo 00:00 UTC menos 6h (para pillar noches que empezaron el día anterior)
  const inicio = new Date(Date.UTC(y, m - 1, d, -6, 0, 0));
  // Fin: día objetivo +1 a 05:00 UTC (para pillar noches que terminan en madrugada)
  const fin    = new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0));
  const fmt = dt => dt.toISOString().replace(/\.\d+Z$/, '+00:00');
  return { inicio: fmt(inicio), fin: fmt(fin) };
}

// ─── BITRIX V3 ────────────────────────────────────────────────────────
async function bitrixV3(metodo, params) {
  const url = BITRIX_WEBHOOK.replace('/rest/', '/rest/api/') + '/' + metodo;
  const results = [];
  let page = 1;

  // Helper: retry con backoff exponencial (2 intentos: 0s, 1.5s)
  async function fetchWithRetry(body, attempt = 0) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      // Retry solo en 5xx o red — 4xx suele ser bug de parámetros (no retry)
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

// ─── SERVICIO EN SHIFT: MATCH LOOSE ────────────────────────────────────
// El campo `servicio` en la tabla `shifts` puede ser:
//   · JSON array serializado: '["Mañana","Tarde"]'  (Sala/Cocina multi-select)
//   · String plano: 'Mañana' | 'Tarde' | 'Noche'     (Recepción, HK, Adm, Mant, Lab)
// Esta función devuelve true si `serv` está representado en `raw`.
function shiftContieneServicio(raw, serv) {
  if (!raw) return false;
  if (raw === serv) return true;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.indexOf(serv) !== -1;
  } catch (_) {}
  return false;
}

// Formato de servicio para grabar en shifts según área del empleado.
function formatoServicioParaShift(area, serv) {
  const areaMulti = ['Sala', 'Cocina'];
  if (areaMulti.indexOf(area) !== -1) return JSON.stringify([serv]);
  return serv; // Recepción/HK/Adm/Mant/Lab: string plano
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
  // dry_run=1 → ejecuta lógica pero NO escribe en Supabase (solo lecturas + POST Bitrix).
  //           Devuelve JSON con acciones "would_*" para auditar antes de activar en real.
  const DRY_RUN = String(q.dry_run || (q.get && q.get('dry_run')) || '') === '1';
  let fechaObjetivo;
  if (modo === 'range' && (q.fecha || (q.get && q.get('fecha')))) {
    fechaObjetivo = (q.fecha || q.get('fecha'));
  } else {
    // "Ayer" en Madrid
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
    // 3) Empleados con bitrix_user_id
    const employees = await sb('GET',
      'employees?select=id,nombre,area,puesto,bitrix_user_id&bitrix_user_id=not.is.null&estado=eq.Activo'
    );
    if (!employees || !employees.length) {
      return res.status(200).json({ ok: true, fecha: fechaObjetivo, msg: 'Sin empleados con bitrix_user_id.' });
    }

    const rango = rangoBitrixParaFechaOperativa(fechaObjetivo);

    let totalIntervals = 0;
    let shiftsUpdated = 0;
    let shiftsCreated = 0;
    let shiftsSkipped = 0;
    const errores = [];

    // 4) Procesar empleados en paralelo (batches de 10 para no reventar timeout)
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

          // 4a) Agrupar por (fecha_operativa, servicio) — solo del día objetivo
          const agrupado = {};
          const rawRows = [];
          const importedTs = new Date().toISOString();
          for (const r of registros) {
            if (!r.endTime || !r.duration) continue; // fichaje en curso: ignorar
            const st = (typeof r.startTime === 'string') ? r.startTime : (r.startTime && r.startTime.date);
            if (!st) continue;
            const { servicio, fecha } = deducirServicioYFecha(st);
            if (fecha !== fechaObjetivo) continue;

            const key = fecha + '|' + servicio;
            if (!agrupado[key]) agrupado[key] = { fecha, servicio, totalSeg: 0 };
            agrupado[key].totalSeg += r.duration;

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
              imported_ts:       importedTs
            });
            totalIntervals++;
          }

          // 4b) Insertar raw en bitrix_time_records (idempotente por bitrix_record_id UNIQUE)
          if (rawRows.length && !DRY_RUN) {
            await sb('POST', 'bitrix_time_records', rawRows, {
              'Prefer': 'resolution=ignore-duplicates,return=minimal'
            });
          }

          // 4c) Por cada grupo: buscar shift → update / skip / create
          const grupos = Object.values(agrupado);
          for (const g of grupos) {
            const horas = Math.round(g.totalSeg / 36) / 100; // segundos→horas 2dec

            // Traer todos los shifts del empleado+fecha (los filtramos por servicio en JS)
            const shifts = await sb('GET',
              `shifts?employee_id=eq.${encodeURIComponent(emp.id)}&fecha=eq.${g.fecha}` +
              `&select=id,horas,estado,servicio`
            );

            const matches = (shifts || []).filter(s => shiftContieneServicio(s.servicio, g.servicio));

            if (matches.length > 0) {
              const s = matches[0];
              if (s.horas != null && parseFloat(s.horas) > 0) {
                shiftsSkipped++; // manual histórico — no tocar
              } else {
                if (!DRY_RUN) {
                  await sb('PATCH',
                    `shifts?id=eq.${encodeURIComponent(s.id)}`,
                    { horas: horas, updated_at: nowMadridTs() },
                    { 'Prefer': 'return=minimal' }
                  );
                }
                shiftsUpdated++;
              }
            } else {
              if (!DRY_RUN) {
                const ts = nowMadridTs();
                await sb('POST', 'shifts', {
                  id:                'BXSH_' + Date.now() + '_' + emp.id,
                  employee_id:       emp.id,
                  nombre:            emp.nombre,
                  area:              emp.area || 'Cocina',
                  puesto:            emp.puesto || '—',
                  fecha:             g.fecha,
                  servicio:          formatoServicioParaShift(emp.area, g.servicio),
                  horas:             horas,
                  responsable_id:    null,
                  responsable_nombre: null,
                  merma_declarada:   null,
                  incidencia_declarada: null,
                  observacion:       'Turno autogenerado desde fichaje Bitrix. Pendiente completar por el empleado.',
                  checklist_items:   '[]',
                  estado:            'Sin declarar',
                  validado_por:      null,
                  validado_ts:       null,
                  comentario_validador: null,
                  correcciones:      [],
                  hora_registro:     ts,
                  created_at:        ts,
                  updated_at:        ts
                }, { 'Prefer': 'return=minimal' });
              }
              shiftsCreated++;
            }
          }
        } catch (e) {
          errores.push({ empleado: emp.nombre, bitrix_user_id: emp.bitrix_user_id, error: String(e.message || e).slice(0, 200) });
        }
      }));
    }

    // 5) Audit log (solo en modo real)
    const durMs = Date.now() - startedAt;
    const resumen = `fecha=${fechaObjetivo} emps=${employees.length} intervals=${totalIntervals} `
                  + `updated=${shiftsUpdated} created=${shiftsCreated} skipped=${shiftsSkipped} `
                  + `errs=${errores.length} dur=${durMs}ms`;
    if (!DRY_RUN) {
      try {
        await sb('POST', 'audit_log', {
          id:      'AL_BX_' + Date.now(),
          ts:      nowMadridTs(),
          usuario: 'system_bitrix_sync',
          rol:     'system',
          action:  'BITRIX_SYNC',
          detail:  resumen + (errores.length ? ' · ' + JSON.stringify(errores).slice(0, 500) : '')
        }, { 'Prefer': 'return=minimal' });
      } catch (_) { /* audit no bloquea */ }
    }

    return res.status(200).json({
      ok: true,
      dry_run: DRY_RUN,
      fecha: fechaObjetivo,
      empleados_procesados: employees.length,
      intervalos_bitrix: totalIntervals,
      shifts_updated: DRY_RUN ? 0 : shiftsUpdated,
      shifts_created: DRY_RUN ? 0 : shiftsCreated,
      shifts_skipped: shiftsSkipped,
      would_update: DRY_RUN ? shiftsUpdated : undefined,
      would_create: DRY_RUN ? shiftsCreated : undefined,
      duracion_ms: durMs,
      errores
    });

  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), fecha: fechaObjetivo });
  }
}
