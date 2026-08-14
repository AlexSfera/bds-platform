// ═══════════════════════════════════════════════════════════════════════
// HORAS_MENSUALES.JS · Panel de horas mensuales trabajadas
// v2 (Ago 2026) — Sólo admin. Botón backfill integrado.
//
// DOS VISTAS con pestañas:
//   1. "Por trabajador (mes)"  → barras horizontales + línea vertical media
//   2. "Evolución mensual"     → líneas por empleado + línea media global
//
// Botón BACKFILL: sólo visible para admin. Ejecuta backfill histórico
// enero-agosto 2026 desde el navegador. Confirmación tipeando "BACKFILL".
//
// Cero escritura sobre shifts. Datos vía /api/monthly-hours.
// ═══════════════════════════════════════════════════════════════════════

var _hmData        = null;
var _hmActiveTab   = 'porMes';
var _hmSelectedYm  = '';
var _hmFilterArea  = '';
var _hmIncluirBaja = false;
var _hmBackfillEnCurso = false;

async function renderHorasMensuales(){
  var el = document.getElementById('horas-mes-content');
  if(!el) return;

  el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">'
    + '⏱ Cargando datos de Bitrix Timeman…</p></div>';

  try {
    await _hmLoadData(false);
    _hmRender();
  } catch (e) {
    // Si el endpoint devuelve error, mostrar CTA para backfill si hay poca
    // data (probable que aún no se haya lanzado).
    var msg = String(e.message || e);
    el.innerHTML = '<div class="card">'
      + '<p style="color:var(--red);padding:20px 0;">'
      +   '❌ Error cargando datos: ' + _hmEsc(msg)
      + '</p>'
      + '<button class="btn" onclick="renderHorasMensuales()">Reintentar</button>'
      + '</div>';
  }
}
window.renderHorasMensuales = renderHorasMensuales;

async function _hmLoadData(forceFresh){
  var url = '/api/monthly-hours?desde=2026-01-01' + (forceFresh ? '&fresh=1' : '');
  var res = await syncroSupabaseFetch(url, { method: 'GET' });
  if(!res.ok){
    var body = await res.text();
    throw new Error('HTTP ' + res.status + ' — ' + body.slice(0, 200));
  }
  _hmData = await res.json();

  if(!_hmSelectedYm && _hmData.months && _hmData.months.length){
    var ms = _hmData.months.slice().reverse();
    for(var i = 0; i < ms.length; i++){
      var ym = ms[i];
      var hay = _hmData.employees.some(function(e){ return (e.monthly[ym] || 0) > 0; });
      if(hay){ _hmSelectedYm = ym; break; }
    }
    if(!_hmSelectedYm) _hmSelectedYm = _hmData.months[_hmData.months.length - 1];
  }
}

function _hmRender(){
  var el = document.getElementById('horas-mes-content');
  if(!el || !_hmData) return;

  var areas = _hmUniqueAreas();
  var areaOpts = '<option value="">Todas las áreas</option>'
    + areas.map(function(a){
        return '<option value="' + _hmEsc(a) + '"'
             + (a === _hmFilterArea ? ' selected' : '')
             + '>' + _hmEsc(a) + '</option>';
      }).join('');

  var monthOpts = _hmData.months.map(function(ym){
    return '<option value="' + ym + '"'
         + (ym === _hmSelectedYm ? ' selected' : '')
         + '>' + _hmMonthLabel(ym) + '</option>';
  }).join('');

  var meta = _hmData.cache === 'hit' ? '📦 caché servidor' : '🔄 recalculado';
  var nRecords = (_hmData.n_records != null) ? _hmData.n_records : '?';

  // Aviso si hay pocos datos (probable backfill pendiente)
  var avisoBackfill = '';
  var hayHistoria = _hmData.employees.some(function(e){
    return (e.monthly['2026-01'] || 0) > 0 || (e.monthly['2026-02'] || 0) > 0;
  });
  if(!hayHistoria){
    avisoBackfill = ''
      + '<div style="background:rgba(251,191,36,.1);border:1px solid var(--amber);border-radius:6px;'
      +      'padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--amber);">'
      +   '⚠ <strong>Faltan datos históricos.</strong> Sólo se ven registros del cron nocturno '
      +   '(desde julio 2026). Para ver enero-junio, ejecuta el backfill una vez con el botón '
      +   '<strong>⚙ Backfill histórico</strong>.'
      + '</div>';
  }

  el.innerHTML = ''
    + avisoBackfill
    + '<div class="card" style="margin-bottom:14px;">'
    +   '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">'
    +     '<div class="fg" style="min-width:170px;flex:1;">'
    +       '<label>Área</label>'
    +       '<select id="hm-area" onchange="_hmOnArea(this.value)">' + areaOpts + '</select>'
    +     '</div>'
    +     '<div class="fg" id="hm-month-wrap" style="min-width:170px;flex:1;'
    +           (_hmActiveTab === 'porMes' ? '' : 'display:none;') + '">'
    +       '<label>Mes</label>'
    +       '<select id="hm-month" onchange="_hmOnMonth(this.value)">' + monthOpts + '</select>'
    +     '</div>'
    +     '<div class="fg" style="min-width:170px;">'
    +       '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">'
    +         '<input type="checkbox" id="hm-baja"' + (_hmIncluirBaja ? ' checked' : '') + ' onchange="_hmOnBaja(this.checked)"/>'
    +         '<span>Incluir bajas / inactivos</span>'
    +       '</label>'
    +     '</div>'
    +     '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">'
    +       '<span style="font-size:10px;color:var(--text3);font-family:var(--font-mono);">' + meta + ' · ' + nRecords + ' regs</span>'
    +       '<button class="btn" onclick="_hmForceReload()" style="font-size:11px;padding:6px 12px;">🔄 Recargar</button>'
    +       '<button class="btn" onclick="_hmExportCsv()" style="font-size:11px;padding:6px 12px;">⬇ CSV</button>'
    +       '<button class="btn" onclick="_hmAbrirBackfill()" style="font-size:11px;padding:6px 12px;background:var(--bg4);border:1px solid var(--amber);color:var(--amber);">⚙ Backfill histórico</button>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="card" style="margin-bottom:0;padding:0;overflow:hidden;">'
    +   '<div style="display:flex;border-bottom:1px solid var(--border);">'
    +     _hmTabBtn('porMes',    '📊 Por trabajador — mes')
    +     _hmTabBtn('evolucion', '📈 Evolución mensual')
    +   '</div>'
    +   '<div id="hm-tab-body" style="padding:16px;">'
    +     (_hmActiveTab === 'porMes' ? _hmRenderPorMes() : _hmRenderEvolucion())
    +   '</div>'
    + '</div>';
}

function _hmTabBtn(id, label){
  var active = id === _hmActiveTab;
  return '<button onclick="_hmOnTab(\'' + id + '\')" style="'
    + 'flex:1;padding:12px 16px;background:' + (active ? 'var(--bg4)' : 'transparent') + ';'
    + 'border:none;border-bottom:2px solid ' + (active ? 'var(--amber)' : 'transparent') + ';'
    + 'color:' + (active ? 'var(--amber)' : 'var(--text3)') + ';'
    + 'font-family:var(--font-mono);font-size:11px;font-weight:700;'
    + 'letter-spacing:.1em;text-transform:uppercase;cursor:pointer;'
    + '">' + label + '</button>';
}

function _hmFilterEmployees(){
  if(!_hmData) return [];
  return _hmData.employees.filter(function(e){
    if(!_hmIncluirBaja && e.estado !== 'Activo') return false;
    if(_hmFilterArea && e.area !== _hmFilterArea) return false;
    return true;
  });
}

function _hmUniqueAreas(){
  if(!_hmData) return [];
  var s = {};
  _hmData.employees.forEach(function(e){ if(e.area) s[e.area] = true; });
  return Object.keys(s).sort();
}

// ─── VISTA 1: BARRAS POR TRABAJADOR EN UN MES ────────────────────────
function _hmRenderPorMes(){
  var ym = _hmSelectedYm;
  var emps = _hmFilterEmployees()
    .map(function(e){ return { nombre: e.nombre, area: e.area, horas: e.monthly[ym] || 0 }; })
    .filter(function(e){ return e.horas > 0; })
    .sort(function(a, b){ return b.horas - a.horas; });

  if(!emps.length){
    return '<p style="color:var(--text3);text-align:center;padding:30px 0;">'
         + 'No hay datos para ' + _hmMonthLabel(ym) + ' con los filtros actuales.</p>';
  }

  var suma = emps.reduce(function(a, e){ return a + e.horas; }, 0);
  var media = suma / emps.length;
  var maxH  = Math.max.apply(null, emps.map(function(e){ return e.horas; }));
  var minH  = Math.min.apply(null, emps.map(function(e){ return e.horas; }));

  var kpis = ''
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">'
    +   _hmKpi('Empleados',     emps.length + '',            'var(--text)')
    +   _hmKpi('Horas totales', suma.toFixed(1) + ' h',      'var(--cyan)')
    +   _hmKpi('Media / empleado', media.toFixed(1) + ' h',  'var(--amber)')
    +   _hmKpi('Máx.',           maxH.toFixed(1) + ' h',     'var(--green)')
    +   _hmKpi('Mín.',           minH.toFixed(1) + ' h',     'var(--orange)')
    + '</div>';

  var W = 720;
  var rowH = 22, gap = 6;
  var PAD_L = 180, PAD_R = 60, PAD_T = 20, PAD_B = 30;
  var chartW = W - PAD_L - PAD_R;
  var chartH = emps.length * (rowH + gap);
  var H = PAD_T + chartH + PAD_B;

  var scaleMax = Math.max(maxH * 1.1, media * 1.2, 1);
  var xPos = function(v){ return PAD_L + (v / scaleMax) * chartW; };

  var bars = emps.map(function(e, i){
    var y = PAD_T + i * (rowH + gap);
    var w = xPos(e.horas) - PAD_L;
    var isAbove = e.horas >= media;
    var col = isAbove ? 'var(--green)' : 'var(--orange)';
    var nombreCorto = e.nombre.length > 24 ? e.nombre.slice(0, 22) + '…' : e.nombre;
    return '<g>'
      + '<text x="' + (PAD_L - 8) + '" y="' + (y + rowH/2 + 4) + '" text-anchor="end" '
      +   'font-size="10" font-family="var(--font-ui)" fill="var(--text2)">'
      +   _hmEsc(nombreCorto)
      + '</text>'
      + '<rect x="' + PAD_L + '" y="' + y + '" width="' + w + '" height="' + rowH
      +   '" rx="3" fill="' + col + '" opacity=".85"/>'
      + '<text x="' + (PAD_L + w + 6) + '" y="' + (y + rowH/2 + 4) + '" '
      +   'font-size="10" font-family="var(--font-mono)" fill="var(--text)" font-weight="700">'
      +   e.horas.toFixed(1) + 'h'
      + '</text>'
      + '</g>';
  }).join('');

  var mediaX = xPos(media);
  var lineaMedia = ''
    + '<line x1="' + mediaX + '" y1="' + PAD_T + '" x2="' + mediaX + '" y2="' + (PAD_T + chartH)
    +   '" stroke="var(--amber)" stroke-width="2" stroke-dasharray="4,3"/>'
    + '<text x="' + mediaX + '" y="' + (PAD_T - 6) + '" text-anchor="middle" '
    +   'font-size="10" fill="var(--amber)" font-family="var(--font-mono)" font-weight="700">'
    +   '↓ media ' + media.toFixed(1) + 'h'
    + '</text>';

  var ticks = [0, 0.25, 0.5, 0.75, 1].map(function(f){
    var v = scaleMax * f;
    var x = xPos(v);
    return '<line x1="' + x + '" y1="' + (PAD_T + chartH) + '" x2="' + x + '" y2="' + (PAD_T + chartH + 4)
      +      '" stroke="var(--border)"/>'
      +    '<text x="' + x + '" y="' + (PAD_T + chartH + 16) + '" text-anchor="middle" '
      +      'font-size="9" fill="var(--text3)" font-family="var(--font-mono)">'
      +      Math.round(v) + 'h</text>';
  }).join('');

  var svg = '<div style="overflow-x:auto;">'
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" '
    +   'style="width:100%;min-width:' + Math.min(W, 500) + 'px;display:block;" '
    +   'xmlns="http://www.w3.org/2000/svg">'
    + '<line x1="' + PAD_L + '" y1="' + (PAD_T + chartH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + chartH)
    +   '" stroke="var(--border)"/>'
    + ticks + bars + lineaMedia
    + '</svg></div>';

  var subtitulo = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);'
    + 'margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase;">'
    + 'Horas trabajadas · ' + _hmMonthLabel(ym)
    + (_hmFilterArea ? ' · ' + _hmEsc(_hmFilterArea) : '')
    + '</div>';

  return kpis + subtitulo + svg;
}

// ─── VISTA 2: EVOLUCIÓN MENSUAL (LÍNEAS) ─────────────────────────────
function _hmRenderEvolucion(){
  var emps = _hmFilterEmployees().filter(function(e){ return e.total > 0; });
  var months = _hmData.months;

  if(!emps.length || !months.length){
    return '<p style="color:var(--text3);text-align:center;padding:30px 0;">'
         + 'No hay datos suficientes con los filtros actuales.</p>';
  }

  var mediaPorMes = months.map(function(ym){
    var vals = emps.map(function(e){ return e.monthly[ym] || 0; })
                   .filter(function(v){ return v > 0; });
    if(!vals.length) return { ym: ym, v: 0, n: 0 };
    var sum = vals.reduce(function(a, b){ return a + b; }, 0);
    return { ym: ym, v: sum / vals.length, n: vals.length };
  });

  var conDatos = mediaPorMes.filter(function(m){return m.v>0;});
  var mediaGlobal = conDatos.length ? conDatos.reduce(function(a, m){ return a + m.v; }, 0) / conDatos.length : 0;

  var totalGlobal = emps.reduce(function(a, e){ return a + e.total; }, 0);
  var kpis = ''
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">'
    +   _hmKpi('Empleados',     emps.length + '',              'var(--text)')
    +   _hmKpi('Meses',         months.length + '',            'var(--text2)')
    +   _hmKpi('Horas totales', totalGlobal.toFixed(0) + ' h', 'var(--cyan)')
    +   _hmKpi('Media / mes',   mediaGlobal.toFixed(1) + ' h', 'var(--amber)')
    + '</div>';

  var W = 720, H = 380;
  var PAD_L = 50, PAD_R = 20, PAD_T = 30, PAD_B = 40;
  var chartW = W - PAD_L - PAD_R;
  var chartH = H - PAD_T - PAD_B;

  var maxV = 0;
  emps.forEach(function(e){
    months.forEach(function(ym){
      var v = e.monthly[ym] || 0;
      if(v > maxV) maxV = v;
    });
  });
  maxV = Math.max(maxV * 1.1, 10);

  var xStep = chartW / Math.max(1, months.length - 1);
  var xPos = function(i){ return PAD_L + i * xStep; };
  var yPos = function(v){ return PAD_T + chartH - (v / maxV) * chartH; };

  var yticks = [0, 0.25, 0.5, 0.75, 1].map(function(f){
    var v = maxV * f;
    var y = yPos(v);
    return '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y
      +      '" stroke="var(--border)" stroke-dasharray="2,3" opacity=".4"/>'
      +    '<text x="' + (PAD_L - 6) + '" y="' + (y + 3) + '" text-anchor="end" '
      +      'font-size="9" fill="var(--text3)" font-family="var(--font-mono)">'
      +      Math.round(v) + 'h</text>';
  }).join('');

  var xticks = months.map(function(ym, i){
    var x = xPos(i);
    return '<text x="' + x + '" y="' + (H - PAD_B + 14) + '" text-anchor="middle" '
      +      'font-size="9" fill="var(--text3)" font-family="var(--font-mono)">'
      +      _hmMonthLabelCorto(ym) + '</text>';
  }).join('');

  var PALETTE = ['#60a5fa','#c084fc','#22d3ee','#fbbf24','#34d399','#f87171','#fb923c','#a78bfa','#f472b6','#67e8f9','#facc15','#4ade80'];

  var lineas = emps.map(function(e, idx){
    var col = PALETTE[idx % PALETTE.length];
    var puntos = months.map(function(ym, i){
      var v = e.monthly[ym] || 0;
      return xPos(i) + ',' + yPos(v);
    }).join(' ');
    return '<polyline points="' + puntos + '" fill="none" stroke="' + col
      +      '" stroke-width="1.5" opacity=".55"/>';
  }).join('');

  var puntosMedia = mediaPorMes.map(function(m, i){
    return xPos(i) + ',' + yPos(m.v);
  }).join(' ');
  var lineaMedia = ''
    + '<polyline points="' + puntosMedia + '" fill="none" stroke="var(--amber)" stroke-width="3"/>'
    + mediaPorMes.map(function(m, i){
        return '<circle cx="' + xPos(i) + '" cy="' + yPos(m.v) + '" r="3.5" '
          +      'fill="var(--amber)" stroke="var(--bg3)" stroke-width="1.5"/>';
      }).join('');

  var svg = '<div style="overflow-x:auto;">'
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" '
    +   'style="width:100%;min-width:500px;display:block;" '
    +   'xmlns="http://www.w3.org/2000/svg">'
    + yticks + xticks + lineas + lineaMedia
    + '<line x1="' + PAD_L + '" y1="' + PAD_T + '" x2="' + PAD_L + '" y2="' + (PAD_T + chartH)
    +   '" stroke="var(--border)"/>'
    + '<line x1="' + PAD_L + '" y1="' + (PAD_T + chartH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + chartH)
    +   '" stroke="var(--border)"/>'
    + '</svg></div>';

  var leyenda = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;'
    + 'font-size:10px;font-family:var(--font-mono);color:var(--text3);">'
    + '<span><span style="display:inline-block;width:24px;height:3px;background:var(--amber);vertical-align:middle;margin-right:5px;"></span>Media mensual</span>'
    + '<span><span style="display:inline-block;width:20px;height:1.5px;background:var(--blue);vertical-align:middle;margin-right:5px;opacity:.55;"></span>Cada línea = un empleado</span>'
    + '</div>';

  var subtitulo = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);'
    + 'margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase;">'
    + 'Evolución mensual · ' + emps.length + ' empleados'
    + (_hmFilterArea ? ' · ' + _hmEsc(_hmFilterArea) : '')
    + '</div>';

  return kpis + subtitulo + svg + leyenda;
}

// ─── BACKFILL — MODAL Y EJECUCIÓN ────────────────────────────────────
function _hmAbrirBackfill(){
  var overlay = document.createElement('div');
  overlay.id = 'hm-backfill-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);'
    + 'display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
  overlay.innerHTML = ''
    + '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:12px;'
    +      'padding:24px;max-width:520px;width:100%;box-shadow:var(--shadow);">'
    +   '<h2 style="font-family:var(--font-mono);font-size:14px;color:var(--amber);'
    +        'letter-spacing:.15em;text-transform:uppercase;margin-bottom:12px;">'
    +     '⚙ Backfill histórico'
    +   '</h2>'
    +   '<p style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5;">'
    +     'Va a importar todos los registros de Bitrix Timeman desde el <strong>1/1/2026</strong> '
    +     'hasta hoy a <code style="background:var(--bg);padding:1px 5px;border-radius:3px;">bitrix_time_records</code>. '
    +     'Es idempotente (registros duplicados se ignoran).'
    +   '</p>'
    +   '<p style="font-size:12px;color:var(--text3);margin-bottom:16px;">'
    +     '• Duración estimada: 2-8 min<br>'
    +     '• No modifica la tabla <code>shifts</code><br>'
    +     '• No requiere acción posterior — se puede pulsar más de una vez sin efectos'
    +   '</p>'
    +   '<div style="background:rgba(251,191,36,.08);border:1px solid var(--amber);border-radius:6px;'
    +        'padding:10px 12px;margin-bottom:16px;font-size:12px;color:var(--amber);">'
    +     '⚠ Para confirmar, escribe <strong>BACKFILL</strong> en el campo de abajo.'
    +   '</div>'
    +   '<input type="text" id="hm-backfill-confirm" placeholder="Escribe BACKFILL"'
    +      'style="width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border2);'
    +      'border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:13px;'
    +      'margin-bottom:16px;" autocomplete="off" oninput="_hmValidarConfirm()"/>'
    +   '<div id="hm-backfill-log" style="max-height:200px;overflow-y:auto;background:var(--bg);'
    +        'border:1px solid var(--border);border-radius:6px;padding:10px;font-family:var(--font-mono);'
    +        'font-size:11px;color:var(--text3);margin-bottom:14px;display:none;"></div>'
    +   '<div style="display:flex;gap:10px;justify-content:flex-end;">'
    +     '<button class="btn" onclick="_hmCerrarBackfill()">Cancelar</button>'
    +     '<button class="btn" id="hm-backfill-go" disabled onclick="_hmLanzarBackfill()"'
    +        'style="background:var(--amber);color:var(--bg);border-color:var(--amber);opacity:.4;">'
    +        '▶ Ejecutar backfill'
    +     '</button>'
    +   '</div>'
    + '</div>';
  document.body.appendChild(overlay);
  var input = document.getElementById('hm-backfill-confirm');
  if(input) input.focus();
}
window._hmAbrirBackfill = _hmAbrirBackfill;

function _hmValidarConfirm(){
  var input = document.getElementById('hm-backfill-confirm');
  var btn   = document.getElementById('hm-backfill-go');
  if(!input || !btn) return;
  var ok = input.value.trim().toUpperCase() === 'BACKFILL';
  btn.disabled = !ok || _hmBackfillEnCurso;
  btn.style.opacity = (ok && !_hmBackfillEnCurso) ? '1' : '.4';
}
window._hmValidarConfirm = _hmValidarConfirm;

function _hmCerrarBackfill(){
  if(_hmBackfillEnCurso){
    if(typeof toast === 'function') toast('Espera a que termine el backfill', 'err');
    return;
  }
  var ov = document.getElementById('hm-backfill-overlay');
  if(ov) ov.remove();
}
window._hmCerrarBackfill = _hmCerrarBackfill;

async function _hmLanzarBackfill(){
  if(_hmBackfillEnCurso) return;
  _hmBackfillEnCurso = true;
  var btn = document.getElementById('hm-backfill-go');
  var log = document.getElementById('hm-backfill-log');
  var input = document.getElementById('hm-backfill-confirm');
  if(input) input.disabled = true;
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Ejecutando…'; btn.style.opacity = '.6'; }
  if(log){ log.style.display = 'block'; log.innerHTML = ''; }

  function logLine(txt, color){
    if(!log) return;
    var d = document.createElement('div');
    if(color) d.style.color = color;
    d.textContent = txt;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  logLine('▶ Enviando petición al servidor…', 'var(--text2)');
  logLine('  (esto tarda 2-8 minutos; no cierres la ventana)', 'var(--text3)');

  var t0 = Date.now();
  try {
    // Nota: syncroSupabaseFetch añade el Bearer token de la sesión.
    // El endpoint acepta esa auth cuando el rol es admin.
    var res = await syncroSupabaseFetch('/api/bitrix-backfill-hours?desde=2026-01-01', {
      method: 'POST'
    });
    var body = await res.text();
    var data = null;
    try { data = JSON.parse(body); } catch(_) {}

    if(!res.ok){
      logLine('❌ Error HTTP ' + res.status, 'var(--red)');
      logLine(body.slice(0, 400), 'var(--red)');
      if(btn){ btn.textContent = 'Reintentar'; btn.disabled = false; btn.style.opacity = '1'; }
      if(input){ input.disabled = false; }
      _hmBackfillEnCurso = false;
      _hmValidarConfirm();
      return;
    }

    var durS = ((Date.now() - t0) / 1000).toFixed(1);
    logLine('✓ Backfill completado en ' + durS + ' s', 'var(--green)');
    if(data){
      logLine('  Empleados procesados: ' + (data.empleados_procesados || '?'));
      logLine('  Intervalos importados: ' + (data.intervalos_bitrix || '?'));
      logLine('  Errores: ' + ((data.errores && data.errores.length) || 0));
      if(data.errores && data.errores.length){
        data.errores.slice(0, 5).forEach(function(e){
          logLine('    · ' + (e.emp || '?') + ': ' + (e.error || '?'), 'var(--red)');
        });
      }
    }

    logLine('▶ Recargando panel con nuevos datos…', 'var(--text2)');
    if(btn){ btn.textContent = '✓ Hecho — Cerrar'; btn.disabled = false; btn.style.opacity = '1'; btn.onclick = _hmCerrarBackfillYRecargar; }
    if(typeof toast === 'function') toast('Backfill completado ✓', 'ok');
    _hmBackfillEnCurso = false;

  } catch (e) {
    logLine('❌ Excepción: ' + (e.message || e), 'var(--red)');
    if(btn){ btn.textContent = 'Reintentar'; btn.disabled = false; btn.style.opacity = '1'; }
    if(input){ input.disabled = false; }
    _hmBackfillEnCurso = false;
    _hmValidarConfirm();
  }
}
window._hmLanzarBackfill = _hmLanzarBackfill;

async function _hmCerrarBackfillYRecargar(){
  _hmCerrarBackfill();
  await _hmForceReload();
}
window._hmCerrarBackfillYRecargar = _hmCerrarBackfillYRecargar;

// ─── HANDLERS UI ─────────────────────────────────────────────────────
function _hmOnTab(id){ _hmActiveTab = id; _hmRender(); }
window._hmOnTab = _hmOnTab;
function _hmOnMonth(ym){ _hmSelectedYm = ym; _hmRender(); }
window._hmOnMonth = _hmOnMonth;
function _hmOnArea(area){ _hmFilterArea = area; _hmRender(); }
window._hmOnArea = _hmOnArea;
function _hmOnBaja(v){ _hmIncluirBaja = !!v; _hmRender(); }
window._hmOnBaja = _hmOnBaja;

async function _hmForceReload(){
  var el = document.getElementById('horas-mes-content');
  if(el) el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">'
    + '🔄 Recalculando…</p></div>';
  try {
    await _hmLoadData(true);
    _hmRender();
    if(typeof toast === 'function') toast('Datos actualizados', 'ok');
  } catch (e) {
    if(typeof toast === 'function') toast('Error: ' + (e.message || e), 'err');
  }
}
window._hmForceReload = _hmForceReload;

function _hmExportCsv(){
  if(!_hmData) return;
  var emps = _hmFilterEmployees();
  var months = _hmData.months;
  var lines = [];
  lines.push(['Empleado','Área','Puesto','Estado'].concat(months).concat(['Total']).join(';'));
  emps.forEach(function(e){
    var row = ['"'+e.nombre+'"', '"'+e.area+'"', '"'+e.puesto+'"', e.estado];
    months.forEach(function(ym){ row.push((e.monthly[ym] || 0).toFixed(2).replace('.', ',')); });
    row.push(e.total.toFixed(2).replace('.', ','));
    lines.push(row.join(';'));
  });
  var csv = '\ufeff' + lines.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'horas_mensuales_' + _hmData.range.desde + '_' + _hmData.range.hasta + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 500);
}
window._hmExportCsv = _hmExportCsv;

function _hmKpi(label, value, color){
  return '<div style="background:var(--bg4);padding:10px 12px;border-radius:6px;border:1px solid var(--border);">'
    + '<div style="font-size:9px;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:3px;">'
    +   label + '</div>'
    + '<div style="font-size:18px;font-weight:700;color:' + color + ';font-family:var(--font-mono);">'
    +   value + '</div>'
    + '</div>';
}

function _hmMonthLabel(ym){
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var p = ym.split('-');
  return meses[parseInt(p[1], 10) - 1] + ' ' + p[0];
}

function _hmMonthLabelCorto(ym){
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var p = ym.split('-');
  return meses[parseInt(p[1], 10) - 1] + ' ' + p[0].slice(2);
}

function _hmEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
