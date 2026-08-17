// ═══════════════════════════════════════════════════════════════════════
// HORAS_MENSUALES.JS · Panel de horas mensuales trabajadas
// v4 (Ago 2026) — Rango de meses + toggle Suma/Media + análisis avanzado
//
// CAMBIOS v4:
//   · Selector "Desde/Hasta" en vez de un mes suelto
//   · Toggle "Ver como: Suma | Media/mes" en la vista Por Trabajador
//   · Modo detalle de empleado con 4 bloques colapsables:
//       1. Resumen
//       2. Distribución mensual
//       3. Patrones horarios
//       4. Comparación con grupo
//   · Notas metodológicas plegables (aviso: qué se puede/no se puede evaluar)
//   · Chip amarillo "↓ atención" en KPIs con desviación >20 %
// ═══════════════════════════════════════════════════════════════════════

var _hmData        = null;
var _hmActiveTab   = 'porMes';
var _hmRangoDesde  = '';    // 'YYYY-MM'
var _hmRangoHasta  = '';    // 'YYYY-MM'
var _hmFilterArea  = '';
var _hmSelectedEmp = '';
var _hmIncluirBaja = false;
var _hmSortMode    = 'desc';
var _hmSumaOMedia  = 'suma';
var _hmIsolatedEmp = '';
var _hmBackfillEnCurso = false;
var _hmBloquesAbiertos = { resumen: true, distribucion: true, patrones: true, comparacion: true };

var HM_PALETTE = ['#60a5fa','#c084fc','#22d3ee','#fbbf24','#34d399','#f87171','#fb923c','#a78bfa','#f472b6','#67e8f9','#facc15','#4ade80'];

async function renderHorasMensuales(){
  var el = document.getElementById('horas-mes-content');
  if(!el) return;
  el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">⏱ Cargando datos de Bitrix Timeman…</p></div>';
  try {
    await _hmLoadData(false);
    _hmRender();
  } catch (e) {
    el.innerHTML = '<div class="card"><p style="color:var(--red);padding:20px 0;">❌ Error cargando datos: ' + _hmEsc(String(e.message || e)) + '</p><button class="btn" onclick="renderHorasMensuales()">Reintentar</button></div>';
  }
}
window.renderHorasMensuales = renderHorasMensuales;

async function _hmLoadData(forceFresh){
  var url = '/api/monthly-hours?desde=2026-01-01' + (forceFresh ? '&fresh=1' : '');
  var res = await syncroSupabaseFetch(url, { method: 'GET' });
  if(!res.ok){ var body = await res.text(); throw new Error('HTTP ' + res.status + ' — ' + body.slice(0, 200)); }
  _hmData = await res.json();
  if((!_hmRangoDesde || !_hmRangoHasta) && _hmData.months && _hmData.months.length){
    var ms = _hmData.months.slice().reverse();
    var ultimo = _hmData.months[_hmData.months.length - 1];
    for(var i = 0; i < ms.length; i++){
      var ym = ms[i];
      var hay = _hmData.employees.some(function(e){ return (e.monthly[ym] || 0) > 0; });
      if(hay){ ultimo = ym; break; }
    }
    _hmRangoDesde = ultimo;
    _hmRangoHasta = ultimo;
  }
}

function _hmRender(){
  var el = document.getElementById('horas-mes-content');
  if(!el || !_hmData) return;

  var areas = _hmUniqueAreas();
  var areaOpts = '<option value="">Todas las áreas</option>' + areas.map(function(a){
    return '<option value="' + _hmEsc(a) + '"' + (a === _hmFilterArea ? ' selected' : '') + '>' + _hmEsc(a) + '</option>';
  }).join('');

  var monthOpts = function(sel){
    return _hmData.months.map(function(ym){
      return '<option value="' + ym + '"' + (ym === sel ? ' selected' : '') + '>' + _hmMonthLabel(ym) + '</option>';
    }).join('');
  };

  var empsDisponibles = _hmFilterEmployees();
  var empOpts = '<option value="">Todos los empleados</option>'
    + empsDisponibles.slice().sort(function(a,b){ return a.nombre.localeCompare(b.nombre, 'es'); }).map(function(e){
        return '<option value="' + _hmEsc(e.id) + '"' + (e.id === _hmSelectedEmp ? ' selected' : '') + '>'
             + _hmEsc(e.nombre) + (e.estado !== 'Activo' ? ' · ' + e.estado : '') + '</option>';
      }).join('');

  var meta = _hmData.cache === 'hit' ? '📦 caché servidor' : '🔄 recalculado';
  var nRecords = (_hmData.n_records != null) ? _hmData.n_records : '?';

  var hayHistoria = _hmData.employees.some(function(e){
    return (e.monthly['2026-01'] || 0) > 0 || (e.monthly['2026-02'] || 0) > 0;
  });
  var avisoBackfill = hayHistoria ? '' : '<div style="background:rgba(251,191,36,.1);border:1px solid var(--amber);border-radius:6px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--amber);">⚠ <strong>Faltan datos históricos.</strong> Sólo se ven registros del cron nocturno. Para ver enero-junio, ejecuta el backfill una vez con el botón <strong>⚙ Backfill histórico</strong>.</div>';

  var extraControles = '';
  if(_hmActiveTab === 'porMes' && !_hmSelectedEmp){
    var esRango = _hmRangoDesde !== _hmRangoHasta;
    if(esRango){
      var sumaMediaOpts = '<option value="suma"' + (_hmSumaOMedia==='suma' ? ' selected' : '') + '>Suma acumulada</option>'
                       + '<option value="media"' + (_hmSumaOMedia==='media' ? ' selected' : '') + '>Media mensual</option>';
      extraControles += '<div class="fg" style="min-width:170px;"><label>Ver como</label><select onchange="_hmOnSumaMedia(this.value)">' + sumaMediaOpts + '</select></div>';
    }
    var sortOpts = '<option value="desc"' + (_hmSortMode==='desc' ? ' selected' : '') + '>Más horas ↓</option>'
                 + '<option value="asc"' + (_hmSortMode==='asc' ? ' selected' : '') + '>Menos horas ↓</option>'
                 + '<option value="dist"' + (_hmSortMode==='dist' ? ' selected' : '') + '>Distancia a la media</option>';
    extraControles += '<div class="fg" style="min-width:180px;"><label>Ordenar por</label><select onchange="_hmOnSort(this.value)">' + sortOpts + '</select></div>';
  }

  el.innerHTML = avisoBackfill
    + '<div class="card" style="margin-bottom:14px;"><div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">'
    +   '<div class="fg" style="min-width:170px;flex:1;"><label>Área</label><select id="hm-area" onchange="_hmOnArea(this.value)">' + areaOpts + '</select></div>'
    +   '<div class="fg" style="min-width:220px;flex:1.5;"><label>Empleado</label><select id="hm-emp" onchange="_hmOnEmp(this.value)">' + empOpts + '</select></div>'
    +   '<div class="fg" style="min-width:150px;"><label>Desde</label><select onchange="_hmOnRangoDesde(this.value)">' + monthOpts(_hmRangoDesde) + '</select></div>'
    +   '<div class="fg" style="min-width:150px;"><label>Hasta</label><select onchange="_hmOnRangoHasta(this.value)">' + monthOpts(_hmRangoHasta) + '</select></div>'
    +   extraControles
    +   '<div class="fg" style="min-width:170px;"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="hm-baja"' + (_hmIncluirBaja ? ' checked' : '') + ' onchange="_hmOnBaja(this.checked)"/><span>Incluir bajas / inactivos</span></label></div>'
    +   '<div style="margin-left:auto;display:flex;gap:8px;align-items:center;">'
    +     '<span style="font-size:10px;color:var(--text3);font-family:var(--font-mono);">' + meta + ' · ' + nRecords + ' regs</span>'
    +     '<button class="btn" onclick="_hmForceReload()" style="font-size:11px;padding:6px 12px;">🔄 Recargar</button>'
    +     '<button class="btn" onclick="_hmExportCsv()" style="font-size:11px;padding:6px 12px;">⬇ CSV</button>'
    +     '<button class="btn" onclick="_hmAbrirBackfill()" style="font-size:11px;padding:6px 12px;background:var(--bg4);border:1px solid var(--amber);color:var(--amber);">⚙ Backfill histórico</button>'
    +   '</div>'
    + '</div></div>'
    + '<div class="card" style="margin-bottom:0;padding:0;overflow:hidden;">'
    +   '<div style="display:flex;border-bottom:1px solid var(--border);">' + _hmTabBtn('porMes','📊 Por trabajador — rango') + _hmTabBtn('evolucion','📈 Evolución mensual') + '</div>'
    +   '<div id="hm-tab-body" style="padding:16px;">' + (_hmActiveTab === 'porMes' ? _hmRenderPorMes() : _hmRenderEvolucion()) + '</div>'
    + '</div>'
    + '<div id="hm-tooltip" style="position:fixed;pointer-events:none;background:var(--bg2);border:1px solid var(--amber);border-radius:6px;padding:8px 12px;font-family:var(--font-mono);font-size:12px;color:var(--text);box-shadow:var(--shadow);z-index:9998;display:none;white-space:nowrap;"></div>';
}

function _hmTabBtn(id, label){
  var active = id === _hmActiveTab;
  return '<button onclick="_hmOnTab(\'' + id + '\')" style="flex:1;padding:12px 16px;background:' + (active ? 'var(--bg4)' : 'transparent') + ';border:none;border-bottom:2px solid ' + (active ? 'var(--amber)' : 'transparent') + ';color:' + (active ? 'var(--amber)' : 'var(--text3)') + ';font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;">' + label + '</button>';
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

function _hmMesesEnRango(){
  if(!_hmData) return [];
  var out = [], found = false, done = false;
  _hmData.months.forEach(function(ym){
    if(done) return;
    if(ym === _hmRangoDesde) found = true;
    if(found) out.push(ym);
    if(ym === _hmRangoHasta) done = true;
  });
  return out;
}

function _hmTotalRango(emp){
  var mm = _hmMesesEnRango();
  return mm.reduce(function(a, ym){ return a + (emp.monthly[ym] || 0); }, 0);
}
function _hmMediaMensualRango(emp){
  var mm = _hmMesesEnRango();
  var conDatos = mm.filter(function(ym){ return (emp.monthly[ym] || 0) > 0; });
  if(!conDatos.length) return 0;
  return _hmTotalRango(emp) / conDatos.length;
}

function _hmRenderPorMes(){
  var meses = _hmMesesEnRango();
  if(!meses.length) return '<p style="color:var(--red);text-align:center;padding:30px 0;">Rango inválido — «Desde» debe ser anterior o igual a «Hasta».</p>';
  if(_hmSelectedEmp) return _hmRenderEmpleadoIndividual();

  var esRango = _hmRangoDesde !== _hmRangoHasta;
  var esMedia = esRango && _hmSumaOMedia === 'media';

  var emps = _hmFilterEmployees().map(function(e){
    var horas = esMedia ? _hmMediaMensualRango(e) : _hmTotalRango(e);
    return { id: e.id, nombre: e.nombre, area: e.area, horas: horas };
  }).filter(function(e){ return e.horas > 0; });

  if(!emps.length) return '<p style="color:var(--text3);text-align:center;padding:30px 0;">No hay datos para ' + _hmRangoLabel() + ' con los filtros actuales.</p>';

  var suma = emps.reduce(function(a, e){ return a + e.horas; }, 0);
  var media = suma / emps.length;
  var maxH = Math.max.apply(null, emps.map(function(e){ return e.horas; }));
  var minH = Math.min.apply(null, emps.map(function(e){ return e.horas; }));

  if(_hmSortMode === 'desc') emps.sort(function(a,b){ return b.horas - a.horas; });
  else if(_hmSortMode === 'asc') emps.sort(function(a,b){ return a.horas - b.horas; });
  else if(_hmSortMode === 'dist') emps.sort(function(a,b){ return Math.abs(b.horas - media) - Math.abs(a.horas - media); });

  var etiqTotal = esMedia ? 'Media/mes total' : 'Horas totales';
  var etiqMedia = esMedia ? 'Media entre empleados' : 'Media / empleado';

  var kpis = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">'
    + _hmKpi('Empleados', emps.length + '', 'var(--text)')
    + _hmKpi(etiqTotal, suma.toFixed(1) + ' h', 'var(--cyan)')
    + _hmKpi(etiqMedia, media.toFixed(1) + ' h', 'var(--amber)')
    + _hmKpi('Máx.', maxH.toFixed(1) + ' h', 'var(--green)')
    + _hmKpi('Mín.', minH.toFixed(1) + ' h', 'var(--orange)')
    + '</div>';

  var W = 720, rowH = 22, gap = 6;
  var PAD_L = 180, PAD_R = 70, PAD_T = 20, PAD_B = 30;
  var chartW = W - PAD_L - PAD_R;
  var chartH = emps.length * (rowH + gap);
  var H = PAD_T + chartH + PAD_B;
  var scaleMax = Math.max(maxH * 1.1, media * 1.2, 1);
  var xPos = function(v){ return PAD_L + (v / scaleMax) * chartW; };

  var bars = emps.map(function(e, i){
    var y = PAD_T + i * (rowH + gap);
    var w = xPos(e.horas) - PAD_L;
    var col = e.horas >= media ? 'var(--green)' : 'var(--orange)';
    var nc = e.nombre.length > 24 ? e.nombre.slice(0, 22) + '…' : e.nombre;
    var pct = ((e.horas - media) / media * 100);
    var pctS = (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
    var tt = _hmEsc(e.nombre + '|' + e.area + '|' + e.horas.toFixed(1) + 'h|' + pctS + ' vs media');
    return '<g style="cursor:pointer;" onmouseenter="_hmShowTip(event,\'' + tt + '\')" onmousemove="_hmMoveTip(event)" onmouseleave="_hmHideTip()" onclick="_hmOnEmp(\'' + _hmEsc(e.id) + '\')">'
      + '<text x="' + (PAD_L - 8) + '" y="' + (y + rowH/2 + 4) + '" text-anchor="end" font-size="10" font-family="var(--font-ui)" fill="var(--text2)">' + _hmEsc(nc) + '</text>'
      + '<rect x="' + PAD_L + '" y="' + y + '" width="' + w + '" height="' + rowH + '" rx="3" fill="' + col + '" opacity=".85"/>'
      + '<text x="' + (PAD_L + w + 6) + '" y="' + (y + rowH/2 + 4) + '" font-size="10" font-family="var(--font-mono)" fill="var(--text)" font-weight="700">' + e.horas.toFixed(1) + 'h</text>'
      + '</g>';
  }).join('');

  var mX = xPos(media);
  var lm = '<line x1="' + mX + '" y1="' + PAD_T + '" x2="' + mX + '" y2="' + (PAD_T + chartH) + '" stroke="var(--amber)" stroke-width="2" stroke-dasharray="4,3" pointer-events="none"/>'
    + '<text x="' + mX + '" y="' + (PAD_T - 6) + '" text-anchor="middle" font-size="10" fill="var(--amber)" font-family="var(--font-mono)" font-weight="700" pointer-events="none">↓ media ' + media.toFixed(1) + 'h</text>';

  var ticks = [0, 0.25, 0.5, 0.75, 1].map(function(f){
    var v = scaleMax * f, x = xPos(v);
    return '<line x1="' + x + '" y1="' + (PAD_T + chartH) + '" x2="' + x + '" y2="' + (PAD_T + chartH + 4) + '" stroke="var(--border)"/>'
         + '<text x="' + x + '" y="' + (PAD_T + chartH + 16) + '" text-anchor="middle" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">' + Math.round(v) + 'h</text>';
  }).join('');

  var svg = '<div style="overflow-x:auto;"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;min-width:' + Math.min(W, 500) + 'px;display:block;" xmlns="http://www.w3.org/2000/svg">'
    + '<line x1="' + PAD_L + '" y1="' + (PAD_T + chartH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + chartH) + '" stroke="var(--border)"/>'
    + ticks + bars + lm + '</svg></div>';

  var subMod = esMedia ? 'Media mensual por empleado' : (esRango ? 'Suma acumulada por empleado' : 'Horas trabajadas');
  var subtitulo = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase;">'
    + subMod + ' · ' + _hmRangoLabel() + (_hmFilterArea ? ' · ' + _hmEsc(_hmFilterArea) : '')
    + ' · <span style="color:var(--text2);text-transform:none;">clic en una barra → detalle empleado</span></div>';

  return kpis + subtitulo + svg;
}

function _hmRenderEmpleadoIndividual(){
  var e = _hmData.employees.find(function(x){ return x.id === _hmSelectedEmp; });
  if(!e) return '<p style="color:var(--red);text-align:center;padding:30px 0;">Empleado no encontrado.</p>';

  var titulo = '<div style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">'
    + '<div><div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:4px;">' + _hmEsc(e.nombre) + '</div>'
    + '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">' + _hmEsc(e.area) + (e.puesto ? ' · ' + _hmEsc(e.puesto) : '')
    + ' · <span style="color:' + (e.estado==='Activo' ? 'var(--green)' : 'var(--orange)') + ';">' + _hmEsc(e.estado) + '</span>'
    + ' · rango: ' + _hmRangoLabel() + '</div></div>'
    + '<button class="btn" onclick="_hmOnEmp(\'\')" style="font-size:11px;padding:6px 12px;">← Volver a todos</button></div>';

  var notas = '<details style="margin-bottom:14px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;padding:8px 12px;">'
    + '<summary style="cursor:pointer;font-size:11px;color:var(--text3);font-family:var(--font-mono);letter-spacing:.05em;">📖 Notas metodológicas (qué se puede y qué no se puede evaluar aquí)</summary>'
    + '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-top:10px;">'
    + '<strong style="color:var(--green);">Datos objetivos:</strong> horas fichadas en Bitrix Timeman, horas de entrada/salida reales, días con fichaje, distribución por franjas.<br><br>'
    + '<strong style="color:var(--orange);">Datos NO disponibles</strong> — no evaluar con este panel:<br>'
    + '• <strong>Puntualidad</strong>: no conocemos el horario contractual. Que la entrada media sea 09:12 es un hecho, pero saber si "llega tarde" requiere conocer que su turno empieza a las 09:00.<br>'
    + '• <strong>Horas extra / cumplimiento contractual</strong>: no hay columna de horas contratadas. Sólo comparamos contra la media del grupo.<br>'
    + '• <strong>Absentismo</strong>: no sabemos qué días debía trabajar. Un mes con menos horas puede ser vacaciones, baja, o menos servicio asignado.<br>'
    + '• <strong>Productividad</strong>: sin datos de output por hora, solo tiempo.<br><br>'
    + '<span style="color:var(--text3);font-style:italic;">Este panel muestra el ritmo real de trabajo; interpretación cualitativa (¿por qué?) requiere hablar con la persona.</span>'
    + '</div></details>';

  return titulo + notas + _hmRenderBloqueResumen(e) + _hmRenderBloqueDistribucion(e) + _hmRenderBloquePatrones(e) + _hmRenderBloqueComparacion(e);
}

function _hmRenderBloqueResumen(e){
  var meses = _hmMesesEnRango();
  var mesesConDatos = meses.filter(function(m){ return (e.monthly[m] || 0) > 0; });
  var totalRango = _hmTotalRango(e);
  var mediaMensual = mesesConDatos.length ? totalRango / mesesConDatos.length : 0;
  var todos = _hmFilterEmployees().filter(function(x){ return x.id !== e.id; });
  var totalGrupoRango = todos.map(_hmTotalRango).filter(function(v){ return v > 0; });
  var mediaGrupo = totalGrupoRango.length ? totalGrupoRango.reduce(function(a,b){return a+b;}, 0) / totalGrupoRango.length : 0;
  var pctVsGrupo = mediaGrupo > 0 ? ((totalRango - mediaGrupo) / mediaGrupo * 100) : 0;
  var chipAlerta = Math.abs(pctVsGrupo) > 20 ? ' <span style="background:rgba(251,191,36,.2);color:var(--amber);font-size:9px;padding:2px 6px;border-radius:3px;margin-left:4px;">↓ atención</span>' : '';

  var kpis = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">'
    + _hmKpi('Total del rango', totalRango.toFixed(1) + ' h', 'var(--cyan)')
    + _hmKpi('Media/mes', mediaMensual.toFixed(1) + ' h', 'var(--amber)')
    + _hmKpi('Meses con datos', mesesConDatos.length + ' de ' + meses.length, 'var(--text2)')
    + _hmKpiConChip('vs media grupo', (pctVsGrupo>=0?'+':'') + pctVsGrupo.toFixed(0) + '%', pctVsGrupo >= 0 ? 'var(--green)' : 'var(--orange)', chipAlerta)
    + _hmKpi('Días trabajados', (e.patterns.diasTrabajados || 0) + '', 'var(--text)')
    + _hmKpi('H./día trabajado', (e.patterns.mediaHorasPorDia || 0).toFixed(1) + ' h', 'var(--text2)')
    + '</div>';
  return _hmBloque('resumen', '📋 Resumen', kpis);
}

function _hmRenderBloqueDistribucion(e){
  var meses = _hmMesesEnRango();
  var valores = meses.map(function(m){ return e.monthly[m] || 0; });
  if(!valores.some(function(v){ return v > 0; })){
    return _hmBloque('distribucion', '📊 Distribución mensual', '<p style="color:var(--text3);padding:10px 0;">Sin datos en el rango.</p>');
  }
  var mediaPersonal = _hmMediaMensualRango(e);
  var maxV = Math.max.apply(null, valores.concat([mediaPersonal])) * 1.15;
  var W = 720, H = 240, PAD_L = 40, PAD_R = 30, PAD_T = 30, PAD_B = 40;
  var chartW = W - PAD_L - PAD_R, chartH = H - PAD_T - PAD_B;
  var barW = chartW / meses.length * 0.75;
  var xStep = chartW / meses.length;
  var xPos = function(i){ return PAD_L + i * xStep + xStep/2; };
  var yPos = function(v){ return PAD_T + chartH - (v / maxV) * chartH; };

  var bars = meses.map(function(ym, i){
    var v = valores[i];
    if(v <= 0){
      return '<text x="' + xPos(i) + '" y="' + (PAD_T + chartH - 8) + '" text-anchor="middle" font-size="10" fill="var(--text3)" font-family="var(--font-mono)">—</text>';
    }
    var y = yPos(v), h = (PAD_T + chartH) - y;
    var col = v >= mediaPersonal ? 'var(--green)' : 'var(--orange)';
    var tt = _hmEsc(_hmMonthLabel(ym) + '|' + v.toFixed(1) + 'h|' + (v >= mediaPersonal ? 'sobre' : 'bajo') + ' su media personal');
    return '<g><rect x="' + (xPos(i) - barW/2) + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="3" fill="' + col + '" opacity=".85" style="cursor:pointer;" onmouseenter="_hmShowTip(event,\'' + tt + '\')" onmousemove="_hmMoveTip(event)" onmouseleave="_hmHideTip()"/>'
      + '<text x="' + xPos(i) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="9" fill="var(--text2)" font-family="var(--font-mono)">' + v.toFixed(0) + 'h</text></g>';
  }).join('');

  var xLabels = meses.map(function(ym, i){
    return '<text x="' + xPos(i) + '" y="' + (H - PAD_B + 14) + '" text-anchor="middle" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">' + _hmMonthLabelCorto(ym) + '</text>';
  }).join('');

  var yMedia = yPos(mediaPersonal);
  var lm = '<line x1="' + PAD_L + '" y1="' + yMedia + '" x2="' + (W - PAD_R) + '" y2="' + yMedia + '" stroke="var(--purple)" stroke-width="2" stroke-dasharray="4,3" pointer-events="none"/>'
    + '<text x="' + (W - PAD_R + 4) + '" y="' + (yMedia + 3) + '" font-size="10" fill="var(--purple)" font-family="var(--font-mono)" font-weight="700">' + mediaPersonal.toFixed(1) + 'h</text>';

  var svg = '<div style="overflow-x:auto;"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;min-width:500px;display:block;" xmlns="http://www.w3.org/2000/svg">'
    + '<line x1="' + PAD_L + '" y1="' + (PAD_T + chartH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + chartH) + '" stroke="var(--border)"/>'
    + bars + lm + xLabels + '</svg></div>';

  var conDatos = meses.filter(function(m){ return (e.monthly[m] || 0) > 0; });
  var mejorMes = null, peorMes = null;
  conDatos.forEach(function(m){
    var v = e.monthly[m];
    if(!mejorMes || v > mejorMes.v) mejorMes = { m: m, v: v };
    if(!peorMes || v < peorMes.v) peorMes = { m: m, v: v };
  });

  var extras = (mejorMes && peorMes) ? '<div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;font-family:var(--font-mono);">'
    + '<div style="background:var(--bg4);padding:8px 12px;border-radius:6px;border:1px solid var(--green);"><span style="color:var(--green);font-weight:700;">🏆 Mejor mes:</span> ' + _hmMonthLabel(mejorMes.m) + ' — <strong style="color:var(--text);">' + mejorMes.v.toFixed(1) + ' h</strong></div>'
    + '<div style="background:var(--bg4);padding:8px 12px;border-radius:6px;border:1px solid var(--orange);"><span style="color:var(--orange);font-weight:700;">📉 Peor mes:</span> ' + _hmMonthLabel(peorMes.m) + ' — <strong style="color:var(--text);">' + peorMes.v.toFixed(1) + ' h</strong></div>'
    + '</div>' : '';

  var leyenda = '<div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);margin-top:8px;"><span style="color:var(--purple);">━━</span> línea = media personal del rango · verde = por encima, naranja = por debajo</div>';

  return _hmBloque('distribucion', '📊 Distribución mensual', svg + leyenda + extras);
}

function _hmRenderBloquePatrones(e){
  var p = e.patterns || {};
  var horaEntrada = p.horaEntradaMediaMin != null ? _hmFmtHora(p.horaEntradaMediaMin) : '—';
  var horaSalida = p.horaSalidaMediaMin != null ? _hmFmtHora(p.horaSalidaMediaMin) : '—';
  var franjas = p.franjas || { Mañana: 0, Tarde: 0, Noche: 0 };
  var totalFr = franjas.Mañana + franjas.Tarde + franjas.Noche;

  var franjaBar = totalFr > 0 ? '<div style="display:flex;height:24px;border-radius:4px;overflow:hidden;background:var(--bg);margin-top:8px;">'
    + (franjas.Mañana > 0 ? '<div style="width:' + franjas.Mañana + '%;background:#fbbf24;color:#000;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700;">' + (franjas.Mañana >= 8 ? '☀ ' + franjas.Mañana.toFixed(0) + '%' : '') + '</div>' : '')
    + (franjas.Tarde > 0 ? '<div style="width:' + franjas.Tarde + '%;background:#fb923c;color:#000;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700;">' + (franjas.Tarde >= 8 ? '🌇 ' + franjas.Tarde.toFixed(0) + '%' : '') + '</div>' : '')
    + (franjas.Noche > 0 ? '<div style="width:' + franjas.Noche + '%;background:#6366f1;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700;">' + (franjas.Noche >= 8 ? '🌙 ' + franjas.Noche.toFixed(0) + '%' : '') + '</div>' : '')
    + '</div>' : '';

  var kpisPatrones = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px;">'
    + _hmKpi('Entrada media', horaEntrada, 'var(--cyan)')
    + _hmKpi('Salida media', horaSalida, 'var(--cyan)')
    + _hmKpi('Jornadas partidas', (p.pctPartidas || 0).toFixed(1) + '%', 'var(--text2)')
    + _hmKpi('Regularidad ritmo', p.coefVar != null ? _hmCoefVarLabel(p.coefVar) : '—', _hmCoefVarColor(p.coefVar))
    + '</div>';

  var seccionFranjas = totalFr > 0 ? '<div style="margin-bottom:14px;">'
    + '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);margin-bottom:4px;letter-spacing:.05em;">Distribución por franja</div>'
    + franjaBar
    + '<div style="display:flex;gap:14px;margin-top:6px;font-size:11px;color:var(--text3);font-family:var(--font-mono);">'
    + '<span>☀ Mañana <strong style="color:var(--text);">' + franjas.Mañana.toFixed(1) + '%</strong></span>'
    + '<span>🌇 Tarde <strong style="color:var(--text);">' + franjas.Tarde.toFixed(1) + '%</strong></span>'
    + '<span>🌙 Noche <strong style="color:var(--text);">' + franjas.Noche.toFixed(1) + '%</strong></span>'
    + '</div></div>' : '';

  var diasSem = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var diaHoras = p.diaSemanaHoras || [0,0,0,0,0,0,0];
  var maxDiaHoras = Math.max.apply(null, diaHoras) || 1;
  var diaFavName = p.diaSemanaFav != null ? diasSem[p.diaSemanaFav] : '—';

  var diasBars = diaHoras.map(function(v, i){
    var pct = (v / maxDiaHoras) * 100;
    var esFav = i === p.diaSemanaFav && v > 0;
    return '<div style="flex:1;text-align:center;">'
      + '<div style="height:60px;display:flex;align-items:flex-end;justify-content:center;">'
      + '<div style="width:60%;height:' + pct + '%;background:' + (esFav ? 'var(--amber)' : 'var(--blue)') + ';opacity:.7;border-radius:3px 3px 0 0;"></div>'
      + '</div>'
      + '<div style="font-size:9px;color:var(--text3);font-family:var(--font-mono);margin-top:3px;">' + diasSem[i] + '</div>'
      + '<div style="font-size:10px;color:' + (esFav ? 'var(--amber)' : 'var(--text2)') + ';font-family:var(--font-mono);font-weight:' + (esFav ? '700' : '400') + ';">' + v.toFixed(0) + 'h</div>'
      + '</div>';
  }).join('');

  var seccionDias = '<div>'
    + '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);margin-bottom:6px;letter-spacing:.05em;">Horas por día de la semana · día favorito: <strong style="color:var(--amber);">' + diaFavName + '</strong></div>'
    + '<div style="display:flex;gap:4px;background:var(--bg4);padding:10px;border-radius:6px;border:1px solid var(--border);">' + diasBars + '</div>'
    + '</div>';

  return _hmBloque('patrones', '⏰ Patrones horarios', kpisPatrones + seccionFranjas + seccionDias);
}

function _hmRenderBloqueComparacion(e){
  var rGlobal = e.rankGlobal ? (e.rankGlobal + ' de ' + (e.rankGlobalOf || '?')) : '—';
  var rArea = e.rankArea ? (e.rankArea + ' de ' + (e.rankAreaOf || '?')) : '—';
  var percGlobal = (e.rankGlobal && e.rankGlobalOf) ? Math.round((1 - (e.rankGlobal - 1) / e.rankGlobalOf) * 100) : null;
  var percArea = (e.rankArea && e.rankAreaOf) ? Math.round((1 - (e.rankArea - 1) / e.rankAreaOf) * 100) : null;

  var kpis = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px;">'
    + _hmKpi('Ranking en área', rArea, 'var(--cyan)')
    + _hmKpi('Ranking global', rGlobal, 'var(--cyan)')
    + _hmKpi('Percentil área', percArea != null ? percArea + '%' : '—', 'var(--amber)')
    + _hmKpi('Percentil global', percGlobal != null ? percGlobal + '%' : '—', 'var(--amber)')
    + '</div>';

  var comparable = _hmData.employees.filter(function(x){
    return x.area === e.area && x.estado === 'Activo' && x.total > 0 && x.id !== e.id;
  });
  var sinComp = '', svgComp = '';
  if(comparable.length >= 1){
    var totalesArea = comparable.map(_hmTotalRango).filter(function(v){return v>0;}).sort(function(a,b){return a-b;});
    var mediana = totalesArea.length
      ? (totalesArea.length % 2 === 1 ? totalesArea[Math.floor(totalesArea.length/2)] : (totalesArea[totalesArea.length/2 - 1] + totalesArea[totalesArea.length/2]) / 2)
      : 0;
    var totalEmp = _hmTotalRango(e);
    var maxV = Math.max(totalEmp, mediana) * 1.2 || 1;

    var W = 720, H = 100, PAD_L = 120, PAD_R = 60;
    var chartW = W - PAD_L - PAD_R;
    var xPos = function(v){ return PAD_L + (v / maxV) * chartW; };
    var wEmp = xPos(totalEmp) - PAD_L;
    var xMediana = xPos(mediana);
    svgComp = '<div style="margin-top:6px;">'
      + '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);margin-bottom:6px;">'
      + _hmEsc(e.nombre) + ' vs mediana del área <strong style="color:var(--text);">' + _hmEsc(e.area) + '</strong> (' + comparable.length + ' compañeros)</div>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:' + W + 'px;display:block;" xmlns="http://www.w3.org/2000/svg">'
      + '<text x="' + (PAD_L - 8) + '" y="30" text-anchor="end" font-size="11" fill="var(--text2)" font-family="var(--font-ui)">' + _hmEsc(e.nombre.length > 18 ? e.nombre.slice(0, 16) + '…' : e.nombre) + '</text>'
      + '<rect x="' + PAD_L + '" y="16" width="' + wEmp + '" height="28" rx="4" fill="var(--cyan)" opacity=".85"/>'
      + '<text x="' + (PAD_L + wEmp + 8) + '" y="34" font-size="12" fill="var(--text)" font-family="var(--font-mono)" font-weight="700">' + totalEmp.toFixed(1) + 'h</text>'
      + '<line x1="' + xMediana + '" y1="8" x2="' + xMediana + '" y2="82" stroke="var(--amber)" stroke-width="2" stroke-dasharray="4,3"/>'
      + '<text x="' + xMediana + '" y="94" text-anchor="middle" font-size="10" fill="var(--amber)" font-family="var(--font-mono)" font-weight="700">mediana ' + mediana.toFixed(1) + 'h</text>'
      + '</svg></div>';
  } else {
    sinComp = '<p style="color:var(--text3);font-size:11px;padding:6px 0;">No hay compañeros suficientes en el área para comparar.</p>';
  }

  return _hmBloque('comparacion', '🏅 Comparación con grupo', kpis + svgComp + sinComp);
}

function _hmRenderEvolucion(){
  var months = _hmMesesEnRango();
  var empsBase = _hmFilterEmployees().filter(function(e){
    return months.some(function(ym){ return (e.monthly[ym] || 0) > 0; });
  });
  if(!empsBase.length || !months.length) return '<p style="color:var(--text3);text-align:center;padding:30px 0;">No hay datos suficientes con los filtros actuales.</p>';

  var soloUno = !!_hmSelectedEmp;
  var empsRender = soloUno ? empsBase.filter(function(e){ return e.id === _hmSelectedEmp; }) : empsBase;
  if(soloUno && !empsRender.length) return '<p style="color:var(--red);text-align:center;padding:30px 0;">El empleado seleccionado no tiene datos en el rango.</p>';

  var mediaPorMes = months.map(function(ym){
    var vals = empsBase.map(function(e){ return e.monthly[ym] || 0; }).filter(function(v){ return v > 0; });
    if(!vals.length) return { ym: ym, v: 0, n: 0 };
    var sum = vals.reduce(function(a, b){ return a + b; }, 0);
    return { ym: ym, v: sum / vals.length, n: vals.length };
  });
  var conDatos = mediaPorMes.filter(function(m){return m.v>0;});
  var mediaGlobal = conDatos.length ? conDatos.reduce(function(a, m){ return a + m.v; }, 0) / conDatos.length : 0;
  var totalGlobal = empsRender.reduce(function(a, e){ return a + _hmTotalRango(e); }, 0);

  var kpis = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">'
    + _hmKpi(soloUno ? 'Empleado' : 'Empleados', soloUno ? '1' : (empsRender.length + ''), 'var(--text)')
    + _hmKpi('Meses', months.length + '', 'var(--text2)')
    + _hmKpi('Horas totales', totalGlobal.toFixed(0) + ' h', 'var(--cyan)')
    + _hmKpi('Media grupo/mes', mediaGlobal.toFixed(1) + ' h', 'var(--amber)')
    + '</div>';

  var W = 720, H = 380, PAD_L = 50, PAD_R = 20, PAD_T = 30, PAD_B = 40;
  var chartW = W - PAD_L - PAD_R, chartH = H - PAD_T - PAD_B;

  var maxV = 0;
  empsRender.forEach(function(e){
    months.forEach(function(ym){ var v = e.monthly[ym] || 0; if(v > maxV) maxV = v; });
  });
  mediaPorMes.forEach(function(m){ if(m.v > maxV) maxV = m.v; });
  maxV = Math.max(maxV * 1.1, 10);

  var xStep = chartW / Math.max(1, months.length - 1);
  var xPos = function(i){ return PAD_L + i * xStep; };
  var yPos = function(v){ return PAD_T + chartH - (v / maxV) * chartH; };

  var yticks = [0, 0.25, 0.5, 0.75, 1].map(function(f){
    var v = maxV * f, y = yPos(v);
    return '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" stroke="var(--border)" stroke-dasharray="2,3" opacity=".4"/>'
      + '<text x="' + (PAD_L - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">' + Math.round(v) + 'h</text>';
  }).join('');

  var xticks = months.map(function(ym, i){
    return '<text x="' + xPos(i) + '" y="' + (H - PAD_B + 14) + '" text-anchor="middle" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">' + _hmMonthLabelCorto(ym) + '</text>';
  }).join('');

  var idxByEmpId = {};
  empsBase.forEach(function(e, idx){ idxByEmpId[e.id] = idx; });

  var lineas = empsRender.map(function(e){
    var idx = idxByEmpId[e.id] || 0;
    var col = HM_PALETTE[idx % HM_PALETTE.length];
    var esActivo = !_hmIsolatedEmp || _hmIsolatedEmp === e.id;
    var opacity = soloUno ? .95 : (esActivo ? .85 : .08);
    var strokeW = soloUno ? 3 : (esActivo ? 2 : 1);
    var puntos = months.map(function(ym, i){ var v = e.monthly[ym] || 0; return xPos(i) + ',' + yPos(v); }).join(' ');
    var circulos = months.map(function(ym, i){
      var v = e.monthly[ym] || 0;
      if(v <= 0) return '';
      var tt = _hmEsc(e.nombre + '|' + _hmMonthLabel(ym) + '|' + v.toFixed(1) + 'h|' + e.area);
      return '<circle cx="' + xPos(i) + '" cy="' + yPos(v) + '" r="4" fill="' + col + '" opacity="' + opacity + '" style="cursor:pointer;" onmouseenter="_hmShowTip(event,\'' + tt + '\')" onmousemove="_hmMoveTip(event)" onmouseleave="_hmHideTip()"/>';
    }).join('');
    return '<polyline points="' + puntos + '" fill="none" stroke="' + col + '" stroke-width="' + strokeW + '" opacity="' + opacity + '" style="pointer-events:none;"/>' + circulos;
  }).join('');

  var puntosMedia = mediaPorMes.map(function(m, i){ return xPos(i) + ',' + yPos(m.v); }).join(' ');
  var lineaMedia = '<polyline points="' + puntosMedia + '" fill="none" stroke="var(--amber)" stroke-width="3" pointer-events="none"/>'
    + mediaPorMes.map(function(m, i){
        if(m.v <= 0) return '';
        var tt = _hmEsc('Media grupo|' + _hmMonthLabel(m.ym) + '|' + m.v.toFixed(1) + 'h|' + m.n + ' emps');
        return '<circle cx="' + xPos(i) + '" cy="' + yPos(m.v) + '" r="4.5" fill="var(--amber)" stroke="var(--bg3)" stroke-width="1.5" style="cursor:pointer;" onmouseenter="_hmShowTip(event,\'' + tt + '\')" onmousemove="_hmMoveTip(event)" onmouseleave="_hmHideTip()"/>';
      }).join('');

  var svg = '<div style="overflow-x:auto;"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;min-width:500px;display:block;" xmlns="http://www.w3.org/2000/svg">'
    + yticks + xticks + lineas + lineaMedia
    + '<line x1="' + PAD_L + '" y1="' + PAD_T + '" x2="' + PAD_L + '" y2="' + (PAD_T + chartH) + '" stroke="var(--border)"/>'
    + '<line x1="' + PAD_L + '" y1="' + (PAD_T + chartH) + '" x2="' + (W - PAD_R) + '" y2="' + (PAD_T + chartH) + '" stroke="var(--border)"/>'
    + '</svg></div>';

  var leyenda = '';
  if(!soloUno){
    var chips = empsBase.map(function(e){
      var idx = idxByEmpId[e.id] || 0;
      var col = HM_PALETTE[idx % HM_PALETTE.length];
      var esActivo = !_hmIsolatedEmp || _hmIsolatedEmp === e.id;
      var totalRango = _hmTotalRango(e);
      return '<div onclick="_hmToggleIsolate(\'' + _hmEsc(e.id) + '\')" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:' + (esActivo ? 'var(--bg4)' : 'transparent') + ';border:1px solid ' + (esActivo ? col : 'var(--border)') + ';border-radius:14px;cursor:pointer;font-size:11px;color:' + (esActivo ? 'var(--text)' : 'var(--text3)') + ';font-family:var(--font-mono);opacity:' + (esActivo ? '1' : '.5') + ';">'
        + '<span style="width:10px;height:10px;background:' + col + ';border-radius:50%;display:inline-block;"></span>'
        + _hmEsc(e.nombre) + ' <span style="color:var(--text3);">' + totalRango.toFixed(0) + 'h</span></div>';
    }).join(' ');
    leyenda = '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">'
      + '<div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);margin-bottom:8px;letter-spacing:.1em;text-transform:uppercase;">Empleados · clic para aislar / des-aislar' + (_hmIsolatedEmp ? ' · <span style="color:var(--amber);">Aislado activo — clic de nuevo para volver</span>' : '') + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:200px;overflow-y:auto;">' + chips + '</div></div>';
  }

  var leyendaTop = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:10px;font-family:var(--font-mono);color:var(--text3);">'
    + '<span><span style="display:inline-block;width:24px;height:3px;background:var(--amber);vertical-align:middle;margin-right:5px;"></span>Media grupo</span>'
    + (soloUno ? '' : '<span><span style="display:inline-block;width:20px;height:1.5px;background:var(--blue);vertical-align:middle;margin-right:5px;opacity:.55;"></span>Cada línea = un empleado (pasa el ratón para ver)</span>')
    + '</div>';

  var subtitulo = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase;">'
    + 'Evolución mensual · ' + _hmRangoLabel() + ' · ' + (soloUno ? _hmEsc(empsRender[0].nombre) : empsRender.length + ' empleados') + (_hmFilterArea ? ' · ' + _hmEsc(_hmFilterArea) : '') + '</div>';

  return kpis + subtitulo + svg + leyendaTop + leyenda;
}

function _hmShowTip(ev, dataStr){
  var tip = document.getElementById('hm-tooltip'); if(!tip) return;
  var parts = dataStr.split('|');
  var html = '<strong style="color:var(--amber);">' + parts[0] + '</strong>';
  for(var i = 1; i < parts.length; i++){ html += '<br><span style="color:var(--text3);font-size:11px;">' + parts[i] + '</span>'; }
  tip.innerHTML = html; tip.style.display = 'block'; _hmMoveTip(ev);
}
window._hmShowTip = _hmShowTip;
function _hmMoveTip(ev){
  var tip = document.getElementById('hm-tooltip'); if(!tip) return;
  var x = (ev.clientX || 0) + 14, y = (ev.clientY || 0) + 14;
  var maxX = window.innerWidth - tip.offsetWidth - 10;
  if(x > maxX) x = maxX;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
window._hmMoveTip = _hmMoveTip;
function _hmHideTip(){ var tip = document.getElementById('hm-tooltip'); if(tip) tip.style.display = 'none'; }
window._hmHideTip = _hmHideTip;

function _hmAbrirBackfill(){
  var overlay = document.createElement('div');
  overlay.id = 'hm-backfill-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
  overlay.innerHTML = '<div style="background:var(--bg3);border:1px solid var(--border2);border-radius:12px;padding:24px;max-width:520px;width:100%;box-shadow:var(--shadow);">'
    + '<h2 style="font-family:var(--font-mono);font-size:14px;color:var(--amber);letter-spacing:.15em;text-transform:uppercase;margin-bottom:12px;">⚙ Backfill histórico</h2>'
    + '<p style="font-size:13px;color:var(--text2);margin-bottom:14px;line-height:1.5;">Va a importar todos los registros de Bitrix Timeman desde el <strong>1/1/2026</strong> hasta hoy a <code style="background:var(--bg);padding:1px 5px;border-radius:3px;">bitrix_time_records</code>. Es idempotente (registros duplicados se ignoran).</p>'
    + '<p style="font-size:12px;color:var(--text3);margin-bottom:16px;">• Duración estimada: 2-8 min<br>• No modifica la tabla <code>shifts</code><br>• Se puede pulsar más de una vez sin efectos</p>'
    + '<div style="background:rgba(251,191,36,.08);border:1px solid var(--amber);border-radius:6px;padding:10px 12px;margin-bottom:16px;font-size:12px;color:var(--amber);">⚠ Para confirmar, escribe <strong>BACKFILL</strong> en el campo de abajo.</div>'
    + '<input type="text" id="hm-backfill-confirm" placeholder="Escribe BACKFILL" style="width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:var(--font-mono);font-size:13px;margin-bottom:16px;" autocomplete="off" oninput="_hmValidarConfirm()"/>'
    + '<div id="hm-backfill-log" style="max-height:200px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;font-family:var(--font-mono);font-size:11px;color:var(--text3);margin-bottom:14px;display:none;"></div>'
    + '<div style="display:flex;gap:10px;justify-content:flex-end;"><button class="btn" onclick="_hmCerrarBackfill()">Cancelar</button><button class="btn" id="hm-backfill-go" disabled onclick="_hmLanzarBackfill()" style="background:var(--amber);color:var(--bg);border-color:var(--amber);opacity:.4;">▶ Ejecutar backfill</button></div>'
    + '</div>';
  document.body.appendChild(overlay);
  var input = document.getElementById('hm-backfill-confirm'); if(input) input.focus();
}
window._hmAbrirBackfill = _hmAbrirBackfill;

function _hmValidarConfirm(){
  var input = document.getElementById('hm-backfill-confirm');
  var btn = document.getElementById('hm-backfill-go');
  if(!input || !btn) return;
  var ok = input.value.trim().toUpperCase() === 'BACKFILL';
  btn.disabled = !ok || _hmBackfillEnCurso;
  btn.style.opacity = (ok && !_hmBackfillEnCurso) ? '1' : '.4';
}
window._hmValidarConfirm = _hmValidarConfirm;

function _hmCerrarBackfill(){
  if(_hmBackfillEnCurso){ if(typeof toast === 'function') toast('Espera a que termine el backfill', 'err'); return; }
  var ov = document.getElementById('hm-backfill-overlay'); if(ov) ov.remove();
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
    d.textContent = txt; log.appendChild(d); log.scrollTop = log.scrollHeight;
  }
  logLine('▶ Enviando petición al servidor…', 'var(--text2)');
  logLine('  (esto tarda 2-8 minutos; no cierres la ventana)', 'var(--text3)');
  var t0 = Date.now();
  try {
    var res = await syncroSupabaseFetch('/api/bitrix-backfill-hours?desde=2026-01-01', { method: 'POST' });
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

async function _hmCerrarBackfillYRecargar(){ _hmCerrarBackfill(); await _hmForceReload(); }
window._hmCerrarBackfillYRecargar = _hmCerrarBackfillYRecargar;

function _hmOnTab(id){ _hmActiveTab = id; _hmRender(); }
window._hmOnTab = _hmOnTab;
function _hmOnRangoDesde(ym){
  _hmRangoDesde = ym;
  if(_hmIndexMonth(_hmRangoDesde) > _hmIndexMonth(_hmRangoHasta)) _hmRangoHasta = ym;
  _hmRender();
}
window._hmOnRangoDesde = _hmOnRangoDesde;
function _hmOnRangoHasta(ym){
  _hmRangoHasta = ym;
  if(_hmIndexMonth(_hmRangoDesde) > _hmIndexMonth(_hmRangoHasta)) _hmRangoDesde = ym;
  _hmRender();
}
window._hmOnRangoHasta = _hmOnRangoHasta;
function _hmOnArea(area){
  _hmFilterArea = area;
  if(_hmSelectedEmp){
    var e = _hmData.employees.find(function(x){ return x.id === _hmSelectedEmp; });
    if(e && area && e.area !== area) _hmSelectedEmp = '';
  }
  _hmIsolatedEmp = '';
  _hmRender();
}
window._hmOnArea = _hmOnArea;
function _hmOnEmp(empId){ _hmSelectedEmp = empId || ''; _hmIsolatedEmp = ''; _hmRender(); }
window._hmOnEmp = _hmOnEmp;
function _hmOnBaja(v){ _hmIncluirBaja = !!v; _hmRender(); }
window._hmOnBaja = _hmOnBaja;
function _hmOnSort(mode){ _hmSortMode = mode; _hmRender(); }
window._hmOnSort = _hmOnSort;
function _hmOnSumaMedia(mode){ _hmSumaOMedia = mode; _hmRender(); }
window._hmOnSumaMedia = _hmOnSumaMedia;
function _hmToggleIsolate(empId){ _hmIsolatedEmp = (_hmIsolatedEmp === empId) ? '' : empId; _hmRender(); }
window._hmToggleIsolate = _hmToggleIsolate;
function _hmToggleBloque(id){ _hmBloquesAbiertos[id] = !_hmBloquesAbiertos[id]; _hmRender(); }
window._hmToggleBloque = _hmToggleBloque;

async function _hmForceReload(){
  var el = document.getElementById('horas-mes-content');
  if(el) el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">🔄 Recalculando…</p></div>';
  try { await _hmLoadData(true); _hmRender(); if(typeof toast === 'function') toast('Datos actualizados', 'ok'); }
  catch (e) { if(typeof toast === 'function') toast('Error: ' + (e.message || e), 'err'); }
}
window._hmForceReload = _hmForceReload;

function _hmExportCsv(){
  if(!_hmData) return;
  var emps = _hmFilterEmployees();
  if(_hmSelectedEmp) emps = emps.filter(function(e){ return e.id === _hmSelectedEmp; });
  var months = _hmMesesEnRango();
  var lines = [];
  var header = ['Empleado','Área','Puesto','Estado'].concat(months);
  header.push('Total rango','Media/mes rango','Entrada media','Salida media','% Mañana','% Tarde','% Noche','% Jornadas partidas','Días trabajados','Regularidad CoV %','Ranking área','Ranking global');
  lines.push(header.join(';'));
  emps.forEach(function(e){
    var row = ['"'+e.nombre+'"', '"'+e.area+'"', '"'+e.puesto+'"', e.estado];
    months.forEach(function(ym){ row.push((e.monthly[ym] || 0).toFixed(2).replace('.', ',')); });
    row.push(_hmTotalRango(e).toFixed(2).replace('.', ','));
    row.push(_hmMediaMensualRango(e).toFixed(2).replace('.', ','));
    var p = e.patterns || {};
    row.push(p.horaEntradaMediaMin != null ? _hmFmtHora(p.horaEntradaMediaMin) : '');
    row.push(p.horaSalidaMediaMin != null ? _hmFmtHora(p.horaSalidaMediaMin) : '');
    var fr = p.franjas || {};
    row.push((fr['Mañana'] || 0).toFixed(1).replace('.', ','));
    row.push((fr['Tarde'] || 0).toFixed(1).replace('.', ','));
    row.push((fr['Noche'] || 0).toFixed(1).replace('.', ','));
    row.push((p.pctPartidas || 0).toFixed(1).replace('.', ','));
    row.push(p.diasTrabajados || 0);
    row.push(p.coefVar != null ? p.coefVar.toFixed(1).replace('.', ',') : '');
    row.push(e.rankArea ? (e.rankArea + '/' + e.rankAreaOf) : '');
    row.push(e.rankGlobal ? (e.rankGlobal + '/' + e.rankGlobalOf) : '');
    lines.push(row.join(';'));
  });
  var csv = '\ufeff' + lines.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'horas_mensuales_' + (_hmRangoDesde||'') + '_a_' + (_hmRangoHasta||'') + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 500);
}
window._hmExportCsv = _hmExportCsv;

function _hmBloque(id, titulo, contenido){
  var abierto = _hmBloquesAbiertos[id];
  return '<div style="margin-bottom:14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;overflow:hidden;">'
    + '<div onclick="_hmToggleBloque(\'' + id + '\')" style="padding:12px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:var(--bg4);border-bottom:' + (abierto ? '1px solid var(--border)' : 'none') + ';">'
    + '<div style="font-family:var(--font-mono);font-size:12px;color:var(--amber);font-weight:700;letter-spacing:.05em;">' + titulo + '</div>'
    + '<div style="font-size:14px;color:var(--text3);">' + (abierto ? '▾' : '▸') + '</div></div>'
    + (abierto ? '<div style="padding:16px;">' + contenido + '</div>' : '') + '</div>';
}

function _hmKpi(label, value, color){
  return '<div style="background:var(--bg4);padding:10px 12px;border-radius:6px;border:1px solid var(--border);">'
    + '<div style="font-size:9px;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:3px;">' + label + '</div>'
    + '<div style="font-size:18px;font-weight:700;color:' + color + ';font-family:var(--font-mono);">' + value + '</div></div>';
}
function _hmKpiConChip(label, value, color, chip){
  return '<div style="background:var(--bg4);padding:10px 12px;border-radius:6px;border:1px solid var(--border);">'
    + '<div style="font-size:9px;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;font-family:var(--font-mono);margin-bottom:3px;">' + label + chip + '</div>'
    + '<div style="font-size:18px;font-weight:700;color:' + color + ';font-family:var(--font-mono);">' + value + '</div></div>';
}

function _hmRangoLabel(){
  if(!_hmRangoDesde || !_hmRangoHasta) return '';
  if(_hmRangoDesde === _hmRangoHasta) return _hmMonthLabel(_hmRangoDesde);
  return _hmMonthLabel(_hmRangoDesde) + ' → ' + _hmMonthLabel(_hmRangoHasta);
}
function _hmIndexMonth(ym){ if(!_hmData) return -1; return _hmData.months.indexOf(ym); }
function _hmFmtHora(mins){
  if(mins == null || mins < 0) return '—';
  var h = Math.floor(mins / 60), m = mins % 60;
  return (h<10?'0':'') + h + ':' + (m<10?'0':'') + m;
}
function _hmCoefVarLabel(cv){
  if(cv == null) return '—';
  if(cv < 15) return 'Muy constante';
  if(cv < 30) return 'Regular';
  if(cv < 50) return 'Irregular';
  return 'Muy irregular';
}
function _hmCoefVarColor(cv){
  if(cv == null) return 'var(--text3)';
  if(cv < 15) return 'var(--green)';
  if(cv < 30) return 'var(--cyan)';
  if(cv < 50) return 'var(--orange)';
  return 'var(--red)';
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
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
