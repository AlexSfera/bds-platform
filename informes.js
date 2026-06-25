// ═══════════════════════════════════════════════════════════════════════
// INFORMES.JS · Manager Bar — Producción · Informe de Jefe · KPIs
// Fase 1 activa : Sala (CSV POSMEWS) + Informe de Jefe (dept_reports)
// Fase 2 pendiente: Cocina · Recepción · SYNCROLAB
// ═══════════════════════════════════════════════════════════════════════

// ── Estado del módulo ────────────────────────────────────────────────
var _infTab          = 'produccion'; // 'produccion' | 'informe-jefe'
var _infSubTab       = 'sala';       // sub-tab dentro de produccion
var _infSalaData     = null;         // resultado parseo CSV activo en memoria
var _infSalaObjSem   = 3125.00;
var _infSalaObjMes   = 10125.00;

// Estado informe de jefe
var _infJefeMode     = 'lista';      // 'lista' | 'nuevo' | 'ver'
var _infJefeEditId   = null;         // id del borrador en edición
var _infJefeViewId   = null;         // id del informe en vista detalle
var _infJefeList     = [];           // cache de dept_reports cargados

// ── Constantes de departamento para informe ─────────────────────────
var INF_DEPT_LABELS = {
  'Sala'       : '🍽 Sala',
  'Cocina'     : '🍳 Cocina',
  'Recepción'  : '🏨 Recepción',
  'SYNCROLAB'  : '🔬 SYNCROLAB',
  'FnB'        : '🏪 F&B',
  'Housekeeping': '🧹 Housekeeping'
};

// ── Permisos ─────────────────────────────────────────────────────────
function canAccessInformes(u){
  if(!u) return false;
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(u)) return true;
  if(typeof isSupervisor  === 'function' && isSupervisor(u))  return true;
  return ['fb','chef','jefe_recepcion','supervisor'].indexOf(u.rol) >= 0;
}

// Departamentos que puede gestionar este usuario en sus informes
function _infDeptosDelJefe(u){
  if(!u) return [];
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(u)){
    return Object.keys(INF_DEPT_LABELS);
  }
  var rol  = u.rol  || '';
  var area = u.area || '';
  var map  = (typeof SUPERVISOR_DEPT_MAP !== 'undefined') ? SUPERVISOR_DEPT_MAP : {};
  if(map[rol]){
    var lista = map[rol];
    if(lista[0] === '*') return Object.keys(INF_DEPT_LABELS);
    return lista.filter(function(d){ return INF_DEPT_LABELS[d]; });
  }
  // jefe genérico: solo su área
  return area && INF_DEPT_LABELS[area] ? [area] : [];
}

// Sub-tabs de producción visibles (mismo criterio que antes)
function _infTabsVisibles(u){
  if(!u) return [];
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(u))
    return ['sala','cocina','recepcion','syncrolab'];
  var area = (u.area || '').toLowerCase();
  var rol  = (u.rol  || '').toLowerCase();
  if(area === 'sala' || area === 'jefe de sala' || rol === 'fb')
    return ['sala','cocina','recepcion','syncrolab'];
  if(area === 'cocina' || rol === 'chef')          return ['cocina'];
  if(area === 'recepción' || rol === 'jefe_recepcion') return ['recepcion'];
  if(area === 'syncrolab')                         return ['syncrolab'];
  return ['sala','cocina','recepcion','syncrolab'];
}

// ── RENDER PRINCIPAL ─────────────────────────────────────────────────
async function renderInformes(){
  var el = document.getElementById('informes-content');
  if(!el) return;

  if(!canAccessInformes(currentUser)){
    el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">'
      + '📊 Informes disponibles solo para jefes de departamento y dirección.</p></div>';
    return;
  }

  // Cargar objetivos desde dept_incentive_rules (igual que antes)
  try {
    var rulesRes = await fetch(
      SUPABASE_URL + '/rest/v1/dept_incentive_rules'
        + '?departamento=in.(Sala,Jefe%20de%20Sala)&activo=eq.true&select=periodo,objetivo',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    if(rulesRes.ok){
      var rules = await rulesRes.json();
      var rSem = (rules||[]).find(function(r){ return r.periodo==='semanal'; });
      var rMes = (rules||[]).find(function(r){ return r.periodo==='mensual'; });
      if(rSem) _infSalaObjSem = parseFloat(rSem.objetivo || 3125);
      if(rMes) _infSalaObjMes = parseFloat(rMes.objetivo || 10125);
    }
  } catch(e){}

  // ── Tabs principales ─────────────────────────────────────────────
  function mainTabBtn(id, label){
    var active = _infTab === id;
    return '<button onclick="window._infTab=\''+id+'\';renderInformes()" style="'
      + 'padding:9px 20px;border-radius:6px;border:1px solid;cursor:pointer;'
      + 'font-size:12px;font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;transition:all .15s;'
      + (active
        ? 'background:var(--accent);color:#fff;border-color:var(--accent);'
        : 'background:var(--bg2);color:var(--text2);border-color:var(--border);')
      + '">'+label+'</button>';
  }

  el.innerHTML = ''
    + '<div class="card" style="margin-bottom:0;padding:14px 18px;">'
    +   '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +     mainTabBtn('produccion',   '📈 Producción')
    +     mainTabBtn('informe-jefe', '📋 Informe de Jefe')
    +   '</div>'
    + '</div>'
    + '<div id="inf-main-content" style="margin-top:16px;"></div>';

  var tc = document.getElementById('inf-main-content');
  if(_infTab === 'produccion')   await _renderProduccion(tc);
  else                           await _renderInformeJefe(tc);
}
window.renderInformes = renderInformes;

// ══════════════════════════════════════════════════════════════════════
// TAB: PRODUCCIÓN (CSV POSMEWS — lógica original preservada íntegra)
// ══════════════════════════════════════════════════════════════════════

async function _renderProduccion(el){
  var tabs = _infTabsVisibles(currentUser);
  if(tabs.indexOf(_infSubTab) < 0) _infSubTab = tabs[0];

  var subDefs = [
    { id:'sala',      label:'🍽 Sala'      },
    { id:'cocina',    label:'🍳 Cocina'    },
    { id:'recepcion', label:'🏨 Recepción' },
    { id:'syncrolab', label:'🔬 SYNCROLAB' }
  ];

  var subBtns = subDefs
    .filter(function(t){ return tabs.indexOf(t.id) >= 0; })
    .map(function(t){
      var active = t.id === _infSubTab;
      return '<button onclick="window._infSubTab=\''+t.id+'\';_renderProduccion(document.getElementById(\'inf-main-content\'))" style="'
        + 'padding:8px 18px;border-radius:6px;border:1px solid var(--border);cursor:pointer;'
        + 'font-size:12px;font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;'
        + (active
          ? 'background:var(--amber);color:#0d1b2e;border-color:var(--amber);'
          : 'background:var(--bg2);color:var(--text2);')
        + '">'+t.label+'</button>';
    }).join('');

  el.innerHTML = ''
    + '<div class="card" style="margin-bottom:0;">'
    +   '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + subBtns + '</div>'
    + '</div>'
    + '<div id="inf-tab-content" style="margin-top:16px;"></div>';

  var tc = document.getElementById('inf-tab-content');
  if(_infSubTab === 'sala') await _renderInformesSala(tc);
  else                      _renderInformesProximamente(tc, _infSubTab);
}

// ── Tab próximamente ─────────────────────────────────────────────────
function _renderInformesProximamente(el, tab){
  var nombres = { cocina:'Cocina', recepcion:'Recepción', syncrolab:'SYNCROLAB' };
  el.innerHTML = '<div class="card" style="text-align:center;padding:48px 24px;">'
    + '<div style="font-size:32px;margin-bottom:12px;">🚧</div>'
    + '<div style="font-family:var(--font-mono);font-weight:700;color:var(--text);font-size:15px;margin-bottom:8px;">'
    +   'Informes ' + (nombres[tab]||tab)
    + '</div>'
    + '<div style="color:var(--text3);font-size:13px;">Módulo en desarrollo — próxima fase.</div>'
    + '</div>';
}

// ── TAB SALA: carga CSV POSMEWS ──────────────────────────────────────
async function _renderInformesSala(el){
  var objSemFmt = _infSalaObjSem.toLocaleString('es-ES', { minimumFractionDigits:2 });
  var objMesFmt = _infSalaObjMes.toLocaleString('es-ES', { minimumFractionDigits:2 });

  el.innerHTML = '<div class="card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--text);">📥 Importar producción POSMEWS</div>'
    +     '<div style="font-size:11px;color:var(--text3);margin-top:3px;">CSV exportado desde POSMEWS · Facturas · Rango semanal</div>'
    +   '</div>'
    +   '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">'
    +     'Obj. semana: <strong style="color:var(--amber);">'+objSemFmt+'€</strong>'
    +     ' &nbsp;·&nbsp; Obj. mes: <strong style="color:var(--amber);">'+objMesFmt+'€</strong>'
    +   '</div>'
    + '</div>'
    + '<div id="inf-dropzone" onclick="document.getElementById(\'inf-csv-input\').click()" '
    +   'ondragover="event.preventDefault();this.style.borderColor=\'var(--amber)\'" '
    +   'ondragleave="this.style.borderColor=\'var(--border2)\'" '
    +   'ondrop="window._infHandleDrop(event)" '
    +   'style="border:2px dashed var(--border2);border-radius:10px;padding:36px 24px;text-align:center;cursor:pointer;transition:border-color .2s;margin-bottom:16px;">'
    +   '<div style="font-size:28px;margin-bottom:10px;">📂</div>'
    +   '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text2);font-weight:600;">Arrastra el CSV aquí o haz clic para seleccionar</div>'
    +   '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Exportado desde POSMEWS · Facturas · Selecciona el periodo semanal o el rango que necesites</div>'
    + '</div>'
    + '<input type="file" id="inf-csv-input" accept=".csv" style="display:none" onchange="window._infLoadCSV(this.files[0])">'
    + '<div id="inf-sala-result"></div>'
    + '</div>';

  if(_infSalaData) _renderSalaTabla(_infSalaData);
}

window._infHandleDrop = function(ev){
  ev.preventDefault();
  var dz = document.getElementById('inf-dropzone');
  if(dz) dz.style.borderColor = 'var(--border2)';
  var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(file) window._infLoadCSV(file);
};

window._infLoadCSV = function(file){
  if(!file || !file.name.match(/\.csv$/i)){
    toast('Selecciona un archivo .csv exportado de POSMEWS', 'err');
    return;
  }
  var rdr = new FileReader();
  rdr.onload = function(e){
    try {
      var parsed = _infParsePOSMEWS(e.target.result);
      _infSalaData = parsed;
      _renderSalaTabla(parsed);
    } catch(err){
      toast('Error al procesar el CSV: ' + err.message, 'err');
    }
  };
  rdr.readAsText(file, 'utf-8');
};

function _infParsePOSMEWS(text){
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  var lines = text.split(/\r?\n/);
  if(lines.length < 2) throw new Error('CSV vacío');

  var header  = _csvSplitLine(lines[0]);
  var iIdx    = function(name){ return header.findIndex(function(h){ return h.trim() === name; }); };
  var colFecha    = iIdx('Fecha');
  var colUsuario  = iIdx('Usuario');
  var colCancel   = iIdx('Cancelación');
  var colTotal    = iIdx('Total [€]');
  var colDescDesc = iIdx('Descuento - Descripción');

  if(colFecha < 0 || colUsuario < 0 || colTotal < 0){
    throw new Error('Formato CSV no reconocido. Verifica que exportaste desde POSMEWS > Facturas.');
  }

  var porUsuario = {};
  var fechasSet  = {};

  for(var i = 1; i < lines.length; i++){
    var line = lines[i].trim();
    if(!line) continue;
    var cols = _csvSplitLine(line);
    if(cols.length < Math.max(colFecha, colUsuario, colTotal) + 1) continue;

    var cancelado = (cols[colCancel] || '').trim().toLowerCase();
    if(cancelado === 'sí' || cancelado === 'si') continue;

    var total = parseFloat((cols[colTotal] || '0').replace(',','.'));
    if(total <= 0) continue;

    var fecha   = (cols[colFecha]   || '').trim();
    var usuario = (cols[colUsuario] || '').trim();
    var descDes = colDescDesc >= 0 ? (cols[colDescDesc] || '').trim() : '';
    if(!usuario || !fecha) continue;

    usuario = usuario.replace(/\s+/g, ' ');
    if(!porUsuario[usuario]) porUsuario[usuario] = { fechas:{}, totalBruto:0, facturas:0, descuentos:{} };
    if(!porUsuario[usuario].fechas[fecha]) porUsuario[usuario].fechas[fecha] = 0;

    porUsuario[usuario].fechas[fecha]  += total;
    porUsuario[usuario].totalBruto     += total;
    porUsuario[usuario].facturas       += 1;
    if(descDes) porUsuario[usuario].descuentos[descDes] = (porUsuario[usuario].descuentos[descDes]||0)+1;
    fechasSet[fecha] = true;
  }

  var fechas   = Object.keys(fechasSet).sort();
  var usuarios = Object.keys(porUsuario).sort(function(a,b){
    return porUsuario[b].totalBruto - porUsuario[a].totalBruto;
  });
  var rangoDias = fechas.length;
  var tipo      = rangoDias <= 7 ? 'semanal' : 'mensual';
  return { fechas:fechas, usuarios:usuarios, porUsuario:porUsuario, tipo:tipo, rangoDias:rangoDias };
}

function _csvSplitLine(line){
  var cols = [], cur = '', inQ = false;
  for(var i = 0; i < line.length; i++){
    var c = line[i];
    if(c === '"'){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if(c === ',' && !inQ){
      cols.push(cur); cur = '';
    } else { cur += c; }
  }
  cols.push(cur);
  return cols;
}

function _renderSalaTabla(data){
  var el = document.getElementById('inf-sala-result');
  if(!el) return;

  var usuarios   = data.usuarios;
  var fechas     = data.fechas;
  var porUsuario = data.porUsuario;

  if(!usuarios.length){
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px;">Sin datos válidos en el archivo.</div>';
    return;
  }

  var fmt     = function(f){ return f ? f.slice(8)+'/'+f.slice(5,7)+'/'+f.slice(0,4) : ''; };
  var f0      = fechas[0] || '', fN = fechas[fechas.length-1] || '';
  var rangoLabel = f0 === fN ? fmt(f0) : fmt(f0) + ' — ' + fmt(fN);

  var totalsDia    = {};
  fechas.forEach(function(f){ totalsDia[f] = 0; });
  usuarios.forEach(function(u){ fechas.forEach(function(f){ totalsDia[f] += (porUsuario[u].fechas[f]||0); }); });
  var totalGeneral = usuarios.reduce(function(s,u){ return s + porUsuario[u].totalBruto; }, 0);

  var thFechas = fechas.map(function(f){
    return '<th style="text-align:right;font-family:var(--font-mono);font-size:10px;white-space:nowrap;padding:8px 10px;">'
      + f.slice(8)+'/'+f.slice(5,7)+'</th>';
  }).join('');

  var rows = usuarios.map(function(u, idx){
    var d     = porUsuario[u];
    var total = d.totalBruto;
    var cumple = total >= _infSalaObjSem;
    var statusBadge = cumple
      ? '✅ Cumple'
      : '❌ Falta '+((_infSalaObjSem - total).toLocaleString('es-ES',{maximumFractionDigits:0}))+'€';
    var statusColor = cumple ? 'var(--green)' : 'var(--red)';
    var rowBg = idx % 2 === 0 ? 'var(--bg3)' : 'var(--bg4)';

    var celdas = fechas.map(function(f){
      var v = d.fechas[f] || 0;
      return '<td style="text-align:right;font-family:var(--font-mono);font-size:12px;padding:8px 10px;color:'
        + (v > 0 ? 'var(--text)' : 'var(--text3)') + ';">'
        + (v > 0 ? v.toLocaleString('es-ES',{minimumFractionDigits:2})+'€' : '—')
        + '</td>';
    }).join('');

    return '<tr style="background:'+rowBg+';border-bottom:1px solid var(--border);">'
      + '<td style="padding:8px 12px;font-size:13px;white-space:nowrap;font-weight:600;color:var(--text);">'+_escHtml(u)+'</td>'
      + celdas
      + '<td style="text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:700;padding:8px 12px;color:var(--amber);">'
      +   total.toLocaleString('es-ES',{minimumFractionDigits:2})+'€'
      + '</td>'
      + '<td style="text-align:center;padding:8px 12px;">'
      +   '<span style="font-size:11px;font-weight:700;color:'+statusColor+';">'+statusBadge+'</span>'
      + '</td>'
      + '</tr>';
  }).join('');

  var celdaTotDia = fechas.map(function(f){
    var v = totalsDia[f];
    return '<td style="text-align:right;font-family:var(--font-mono);font-size:12px;padding:8px 10px;font-weight:700;color:var(--text2);">'
      + (v > 0 ? v.toLocaleString('es-ES',{minimumFractionDigits:2})+'€' : '—')
      + '</td>';
  }).join('');

  var nCumplen   = usuarios.filter(function(u){ return porUsuario[u].totalBruto >= _infSalaObjSem; }).length;
  var pctCump    = usuarios.length ? Math.round(nCumplen / usuarios.length * 100) : 0;
  var mediaProd  = usuarios.length ? totalGeneral / usuarios.length : 0;
  var nCamareros = usuarios.length;

  var kpiBox = function(label, val, color){
    return '<div style="flex:1;min-width:130px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center;">'
      + '<div style="font-size:10px;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">'+label+'</div>'
      + '<div style="font-size:17px;font-weight:700;font-family:var(--font-mono);color:'+color+';">'+val+'</div>'
      + '</div>';
  };

  el.innerHTML = ''
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'
    +   '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text3);">'
    +     '📅 Periodo: <strong style="color:var(--text2);">'+rangoLabel+'</strong>'
    +     ' &nbsp;·&nbsp; '+nCamareros+' camarero'+(nCamareros===1?'':'s')
    +   '</div>'
    +   '<button onclick="window._infSalaData=null;_renderInformesSala(document.getElementById(\'inf-tab-content\'))" '
    +     'style="background:var(--bg4);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:11px;font-family:var(--font-mono);padding:5px 12px;cursor:pointer;">✕ Nuevo CSV</button>'
    + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">'
    +   kpiBox('Producción total', totalGeneral.toLocaleString('es-ES',{minimumFractionDigits:2})+'€', 'var(--amber)')
    +   kpiBox('Media por camarero', mediaProd.toLocaleString('es-ES',{minimumFractionDigits:2})+'€', 'var(--text)')
    +   kpiBox('Cumplen objetivo', nCumplen+' / '+nCamareros, nCumplen===nCamareros?'var(--green)':'var(--red)')
    +   kpiBox('% cumplimiento', pctCump+'%', pctCump>=80?'var(--green)':pctCump>=50?'var(--amber)':'var(--red)')
    + '</div>'
    + '<div style="overflow-x:auto;">'
    +   '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px;">'
    +     '<thead>'
    +       '<tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    +         '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">Camarero</th>'
    +         thFechas
    +         '<th style="text-align:right;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--amber);">Total</th>'
    +         '<th style="text-align:center;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">'
    +           'Obj. '+_infSalaObjSem.toLocaleString('es-ES',{maximumFractionDigits:0})+'€'
    +         '</th>'
    +       '</tr>'
    +     '</thead>'
    +     '<tbody>'
    +       rows
    +       '<tr style="background:var(--bg2);border-top:2px solid var(--border2);">'
    +         '<td style="padding:10px 12px;font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">TOTAL</td>'
    +         celdaTotDia
    +         '<td style="text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;padding:10px 12px;color:var(--amber);">'
    +           totalGeneral.toLocaleString('es-ES',{minimumFractionDigits:2})+'€'
    +         '</td>'
    +         '<td></td>'
    +       '</tr>'
    +     '</tbody>'
    +   '</table>'
    + '</div>'
    + '<div style="margin-top:14px;padding:10px 14px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--amber);font-size:11px;color:var(--text3);line-height:1.7;">'
    +   '📌 <strong style="color:var(--text2);">Nota:</strong> Producción bruta (IVA incluido) · Se excluyen cancelaciones y líneas con total ≤ 0 € · '
    +   'Objetivo semanal: <strong style="color:var(--amber);">'+_infSalaObjSem.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</strong> · '
    +   'Objetivo mensual: <strong style="color:var(--amber);">'+_infSalaObjMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</strong>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════════
// TAB: INFORME DE JEFE — tabla dept_reports (C1)
// ══════════════════════════════════════════════════════════════════════

async function _renderInformeJefe(el){
  if(_infJefeMode === 'nuevo' || _infJefeEditId) return _renderInformeJefeForm(el);
  if(_infJefeMode === 'ver' && _infJefeViewId)   return _renderInformeJefeDetalle(el);
  return _renderInformeJefeLista(el);
}

// ── Lista de informes ────────────────────────────────────────────────
async function _renderInformeJefeLista(el){
  el.innerHTML = '<div class="card"><p style="color:var(--text3);">Cargando informes…</p></div>';

  var depts = _infDeptosDelJefe(currentUser);
  var isAdmin_ = typeof canActAsAdmin === 'function' && canActAsAdmin(currentUser);

  try {
    var url = SUPABASE_URL + '/rest/v1/dept_reports?select=*&order=ts.desc&limit=50';
    if(!isAdmin_ && depts.length){
      url += '&departamento=in.(' + depts.map(encodeURIComponent).join(',') + ')';
    }
    var res = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    _infJefeList = await res.json();
  } catch(e){
    el.innerHTML = '<div class="card"><p style="color:var(--red);">Error al cargar informes: ' + _escHtml(e.message) + '</p></div>';
    return;
  }

  var rows = (_infJefeList||[]).map(function(r){
    var fmtTs = r.ts ? r.ts.slice(0,10).split('-').reverse().join('/') + ' ' + r.ts.slice(11,16) : '—';
    var estadoBadge = r.estado === 'publicado'
      ? '<span style="background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">PUBLICADO</span>'
      : '<span style="background:var(--bg3);color:var(--text3);border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">BORRADOR</span>';
    var tipoBadge = '<span style="background:var(--bg4);color:var(--text2);border-radius:4px;padding:2px 7px;font-size:10px;">'+(r.tipo||'—')+'</span>';
    return '<tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="window._infOpenVer(\''+r.id+'\')">'
      + '<td style="padding:10px 12px;font-size:12px;color:var(--text3);font-family:var(--font-mono);">'+fmtTs+'</td>'
      + '<td style="padding:10px 12px;font-size:13px;font-weight:600;color:var(--text);">'+(INF_DEPT_LABELS[r.departamento]||r.departamento||'—')+'</td>'
      + '<td style="padding:10px 12px;">'+tipoBadge+'</td>'
      + '<td style="padding:10px 12px;font-size:12px;color:var(--text2);">'+(r.periodo||'—')+'</td>'
      + '<td style="padding:10px 12px;font-size:12px;color:var(--text3);">'+_escHtml(r.autor||'—')+'</td>'
      + '<td style="padding:10px 12px;">'+estadoBadge+'</td>'
      + '<td style="padding:10px 12px;text-align:right;">'
      +   (r.estado==='borrador'
          ? '<button onclick="event.stopPropagation();window._infOpenEditar(\''+r.id+'\')" style="background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:11px;padding:4px 10px;cursor:pointer;margin-right:4px;">✏ Editar</button>'
          : '')
      + '</td>'
      + '</tr>';
  }).join('');

  el.innerHTML = ''
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
    +   '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);">'
    +     (_infJefeList.length) + ' informe' + (_infJefeList.length===1?'':'s')
    +   '</div>'
    +   '<button onclick="window._infOpenNuevo()" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:700;font-family:var(--font-mono);cursor:pointer;">+ Nuevo informe</button>'
    + '</div>'
    + '<div class="card" style="padding:0;overflow:hidden;">'
    +   '<div style="overflow-x:auto;">'
    +     '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +       '<thead>'
    +         '<tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    +           '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Fecha</th>'
    +           '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Dpto.</th>'
    +           '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Tipo</th>'
    +           '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Periodo</th>'
    +           '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Autor</th>'
    +           '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Estado</th>'
    +           '<th></th>'
    +         '</tr>'
    +       '</thead>'
    +       '<tbody>'
    +         (rows || '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text3);">Sin informes todavía</td></tr>')
    +       '</tbody>'
    +     '</table>'
    +   '</div>'
    + '</div>';
}

// ── Abrir modos ──────────────────────────────────────────────────────
window._infOpenNuevo   = function(){ _infJefeMode='nuevo'; _infJefeEditId=null; _infJefeViewId=null; renderInformes(); };
window._infOpenEditar  = function(id){ _infJefeMode='nuevo'; _infJefeEditId=id; _infJefeViewId=null; renderInformes(); };
window._infOpenVer     = function(id){ _infJefeMode='ver';   _infJefeViewId=id; _infJefeEditId=null; renderInformes(); };
window._infVolverLista = function(){ _infJefeMode='lista'; _infJefeEditId=null; _infJefeViewId=null; renderInformes(); };

// ── FORMULARIO nuevo / editar ────────────────────────────────────────
async function _renderInformeJefeForm(el){
  var depts    = _infDeptosDelJefe(currentUser);
  var existing = null;

  if(_infJefeEditId){
    existing = (_infJefeList||[]).find(function(r){ return r.id === _infJefeEditId; });
    if(!existing){
      // Intentar cargar desde Supabase si no está en caché
      try {
        var res = await fetch(
          SUPABASE_URL + '/rest/v1/dept_reports?id=eq.' + encodeURIComponent(_infJefeEditId) + '&select=*',
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
        );
        if(res.ok){ var arr = await res.json(); existing = arr[0] || null; }
      } catch(e){}
    }
  }

  var cj = (existing && existing.contenido_json) ? existing.contenido_json : {};

  // Opciones de departamento
  var deptOpts = depts.map(function(d){
    var sel = (existing && existing.departamento === d) ? ' selected' : (!existing && depts.length===1 ? ' selected' : '');
    return '<option value="'+_escHtml(d)+'"'+sel+'>'+(INF_DEPT_LABELS[d]||d)+'</option>';
  }).join('');

  var tipoOpts = ['semanal','mensual','evento'].map(function(t){
    var sel = (existing && existing.tipo===t) ? ' selected' : '';
    return '<option value="'+t+'"'+sel+'>'+t.charAt(0).toUpperCase()+t.slice(1)+'</option>';
  }).join('');

  el.innerHTML = ''
    + '<div class="card">'
    +   '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">'
    +     '<button onclick="window._infVolverLista()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:12px;padding:6px 12px;cursor:pointer;">← Volver</button>'
    +     '<div style="font-family:var(--font-mono);font-weight:700;font-size:14px;color:var(--text);">'
    +       (_infJefeEditId ? 'Editar informe' : 'Nuevo informe de jefe')
    +     '</div>'
    +   '</div>'

    // Fila 1: dept / tipo / periodo
    +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:16px;">'
    +     '<div class="fg"><label>Departamento</label>'
    +       '<select id="inf-f-dept">'+deptOpts+'</select>'
    +     '</div>'
    +     '<div class="fg"><label>Tipo</label>'
    +       '<select id="inf-f-tipo">'+tipoOpts+'</select>'
    +     '</div>'
    +     '<div class="fg"><label>Periodo <span style="color:var(--text3);font-size:11px;">(ej. S24 2026 / Junio 2026)</span></label>'
    +       '<input id="inf-f-periodo" type="text" placeholder="Semana 24 · 2026" value="'+_escHtml(existing?existing.periodo||'':'')+'"></div>'
    +   '</div>'

    // Sección KPIs
    +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;margin-top:4px;">📊 KPIs del periodo</div>'
    +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px;">'
    +     _infNumField('inf-f-ventas',     'Ventas €',                  cj.ventas)
    +     _infNumField('inf-f-covers',     'Covers / pax',              cj.covers)
    +     _infNumField('inf-f-ticket-med', 'Ticket medio €',            cj.ticket_medio)
    +     _infNumField('inf-f-labor-pct',  'Labor cost %',              cj.labor_pct)
    +     _infNumField('inf-f-fios',       'FIO activos',               cj.fios_activos)
    +     _infNumField('inf-f-ocup',       'Ocupación hotel % (manual)', cj.ocupacion_hotel)
    +   '</div>'

    // Sección eventos / notas operativas
    +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;">📝 Resumen operativo</div>'
    +   '<textarea id="inf-f-resumen" rows="4" placeholder="Incidencias relevantes, cambios de equipo, eventos especiales, observaciones de turno…" '
    +     'style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:10px 12px;font-size:13px;font-family:var(--font-ui);resize:vertical;">'
    +     _escHtml(cj.resumen||'')
    +   '</textarea>'

    // Sección evaluación manual de empleados
    +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;margin-top:18px;">👤 Evaluación manual de empleados <span style="font-weight:400;text-transform:none;color:var(--text3);font-size:10px;">(opcional)</span></div>'
    +   '<textarea id="inf-f-eval" rows="3" placeholder="ej. García: buen rendimiento · Martínez: ausencia no justificada · López: formación pendiente" '
    +     'style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:10px 12px;font-size:13px;font-family:var(--font-ui);resize:vertical;">'
    +     _escHtml(cj.evaluacion_empleados||'')
    +   '</textarea>'

    // Sección previsión semana siguiente (input para C5)
    +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;margin-top:18px;">📅 Previsión semana siguiente</div>'
    +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">'
    +     _infNumField('inf-f-ocup-sig', 'Ocupación prevista % (manual → MEWS)', cj.ocupacion_semana_siguiente)
    +     '<div class="fg"><label>Eventos especiales</label>'
    +       '<input id="inf-f-eventos" type="text" placeholder="Grupo 40 pax viernes · Boda sábado" value="'+_escHtml(cj.eventos_semana_siguiente||'')+'">'
    +     '</div>'
    +   '</div>'

    // Justificación para dirección
    +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;margin-top:4px;">📁 Justificación para dirección <span style="font-weight:400;text-transform:none;font-size:10px;">(queda archivado)</span></div>'
    +   '<textarea id="inf-f-just" rows="3" placeholder="Justificación de gastos extraordinarios, desviaciones de presupuesto, solicitudes de recursos…" '
    +     'style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:10px 12px;font-size:13px;font-family:var(--font-ui);resize:vertical;">'
    +     _escHtml(cj.justificacion||'')
    +   '</textarea>'

    // Botones
    +   '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px;">'
    +     '<button onclick="window._infGuardarInforme(\'borrador\')" '
    +       'style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:12px;font-weight:600;padding:9px 18px;cursor:pointer;font-family:var(--font-mono);">'
    +       '💾 Guardar borrador'
    +     '</button>'
    +     '<button onclick="window._infGuardarInforme(\'publicado\')" '
    +       'style="background:var(--accent);border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:700;padding:9px 18px;cursor:pointer;font-family:var(--font-mono);">'
    +       '📤 Publicar informe'
    +     '</button>'
    +   '</div>'
    + '</div>';
}

function _infNumField(id, label, val){
  return '<div class="fg"><label>'+label+'</label>'
    + '<input id="'+id+'" type="number" step="0.01" min="0" placeholder="—" '
    +   'value="'+(val!=null&&val!==''?val:'')+'" '
    +   'style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:8px 10px;font-size:13px;width:100%;box-sizing:border-box;">'
    + '</div>';
}

// ── Guardar informe ──────────────────────────────────────────────────
window._infGuardarInforme = async function(estado){
  var dept    = (document.getElementById('inf-f-dept')||{}).value   || '';
  var tipo    = (document.getElementById('inf-f-tipo')||{}).value   || 'semanal';
  var periodo = (document.getElementById('inf-f-periodo')||{}).value.trim() || '';

  if(!dept)   { toast('Selecciona un departamento', 'err'); return; }
  if(!periodo){ toast('Indica el periodo del informe', 'err'); return; }

  // Validación de pertenencia: jefe solo puede guardar su propio departamento
  var deptsProp = _infDeptosDelJefe(currentUser);
  var isAdmin_  = typeof canActAsAdmin==='function' && canActAsAdmin(currentUser);
  if(!isAdmin_ && deptsProp.indexOf(dept) < 0){
    toast('No puedes cargar informes de ' + dept, 'err');
    return;
  }

  var g = function(id){ var el=document.getElementById(id); return el ? el.value.trim() : ''; };
  var n = function(id){ var v=parseFloat(g(id)); return isNaN(v)?null:v; };

  var contenido_json = {
    ventas                    : n('inf-f-ventas'),
    covers                    : n('inf-f-covers'),
    ticket_medio              : n('inf-f-ticket-med'),
    labor_pct                 : n('inf-f-labor-pct'),
    fios_activos              : n('inf-f-fios'),
    ocupacion_hotel           : n('inf-f-ocup'),
    resumen                   : g('inf-f-resumen'),
    evaluacion_empleados      : g('inf-f-eval'),
    ocupacion_semana_siguiente: n('inf-f-ocup-sig'),
    eventos_semana_siguiente  : g('inf-f-eventos'),
    justificacion             : g('inf-f-just')
  };

  var payload = {
    ts           : localTs(),
    autor        : currentUser.nombre || currentUser.id,
    rol          : currentUser.rol    || '',
    departamento : dept,
    tipo         : tipo,
    periodo      : periodo,
    contenido_json: contenido_json,
    estado       : estado
  };

  try {
    if(_infJefeEditId){
      // PATCH sobre borrador existente
      var pRes = await fetch(
        SUPABASE_URL + '/rest/v1/dept_reports?id=eq.' + encodeURIComponent(_infJefeEditId),
        {
          method : 'PATCH',
          headers: {
            'apikey'       : SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type' : 'application/json',
            'Prefer'       : 'return=minimal'
          },
          body: JSON.stringify(payload)
        }
      );
      if(!pRes.ok) throw new Error('HTTP ' + pRes.status);
    } else {
      // INSERT nuevo
      payload.id = 'inf_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      var iRes = await fetch(
        SUPABASE_URL + '/rest/v1/dept_reports',
        {
          method : 'POST',
          headers: {
            'apikey'       : SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type' : 'application/json',
            'Prefer'       : 'return=minimal'
          },
          body: JSON.stringify(payload)
        }
      );
      if(!iRes.ok) throw new Error('HTTP ' + iRes.status);
    }

    invalidateCache('dept_reports');
    toast(estado==='publicado' ? 'Informe publicado ✓' : 'Borrador guardado ✓', 'ok');
    _infJefeMode='lista'; _infJefeEditId=null; _infJefeList=[];
    renderInformes();

  } catch(e){
    toast('Error al guardar: ' + e.message, 'err');
  }
};

// ── Vista detalle de un informe ──────────────────────────────────────
async function _renderInformeJefeDetalle(el){
  var r = (_infJefeList||[]).find(function(x){ return x.id===_infJefeViewId; });
  if(!r){
    try {
      var res = await fetch(
        SUPABASE_URL + '/rest/v1/dept_reports?id=eq.'+encodeURIComponent(_infJefeViewId)+'&select=*',
        { headers: {'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY} }
      );
      if(res.ok){ var arr=await res.json(); r=arr[0]||null; }
    } catch(e){}
  }
  if(!r){ el.innerHTML='<div class="card"><p style="color:var(--red);">Informe no encontrado.</p></div>'; return; }

  var cj  = r.contenido_json || {};
  var fmtTs = r.ts ? r.ts.slice(0,10).split('-').reverse().join('/')+' '+r.ts.slice(11,16) : '—';

  var kpi = function(label, val, unit){
    if(val==null||val==='') return '';
    return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 14px;min-width:130px;">'
      + '<div style="font-size:10px;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px;">'+label+'</div>'
      + '<div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--text);">'+val+(unit?' <span style="font-size:11px;color:var(--text3);">'+unit+'</span>':'')+'</div>'
      + '</div>';
  };

  var sectionTitle = function(t){
    return '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin:20px 0 10px;">'+t+'</div>';
  };

  var textBlock = function(val){
    if(!val) return '<p style="color:var(--text3);font-size:13px;">—</p>';
    return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:12px 14px;font-size:13px;color:var(--text);line-height:1.6;white-space:pre-wrap;">'+_escHtml(val)+'</div>';
  };

  el.innerHTML = ''
    + '<div class="card">'
    +   '<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap;">'
    +     '<button onclick="window._infVolverLista()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:12px;padding:6px 12px;cursor:pointer;">← Volver</button>'
    +     '<div>'
    +       '<div style="font-family:var(--font-mono);font-weight:700;font-size:15px;color:var(--text);">'+(INF_DEPT_LABELS[r.departamento]||r.departamento)+'</div>'
    +       '<div style="font-size:11px;color:var(--text3);">'+fmtTs+' · '+_escHtml(r.autor||'')+'  · '+_escHtml(r.tipo||'')+'</div>'
    +     '</div>'
    +     '<span style="margin-left:auto;'+(r.estado==='publicado'
          ? 'background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green);'
          : 'background:var(--bg3);color:var(--text3);border:1px solid var(--border);')
        + 'border-radius:5px;padding:3px 10px;font-size:10px;font-weight:700;font-family:var(--font-mono);">'
    +       (r.estado||'borrador').toUpperCase()
    +     '</span>'
    +   '</div>'

    +   sectionTitle('📊 KPIs del periodo — '+_escHtml(r.periodo||''))
    +   '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
    +     kpi('Ventas',     cj.ventas!=null?cj.ventas.toLocaleString('es-ES',{minimumFractionDigits:2}):'', '€')
    +     kpi('Covers',     cj.covers,     'pax')
    +     kpi('Ticket medio', cj.ticket_medio!=null?cj.ticket_medio.toLocaleString('es-ES',{minimumFractionDigits:2}):'', '€')
    +     kpi('Labor cost', cj.labor_pct,  '%')
    +     kpi('FIO activos', cj.fios_activos, '')
    +     kpi('Ocupación hotel', cj.ocupacion_hotel, '%')
    +   '</div>'

    +   sectionTitle('📝 Resumen operativo')
    +   textBlock(cj.resumen)

    +   (cj.evaluacion_empleados ? sectionTitle('👤 Evaluación empleados') + textBlock(cj.evaluacion_empleados) : '')

    +   (cj.ocupacion_semana_siguiente!=null || cj.eventos_semana_siguiente
        ? sectionTitle('📅 Previsión semana siguiente')
          + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">'
          +   kpi('Ocupación prevista', cj.ocupacion_semana_siguiente, '%')
          + '</div>'
          + (cj.eventos_semana_siguiente ? textBlock(cj.eventos_semana_siguiente) : '')
        : '')

    +   (cj.justificacion ? sectionTitle('📁 Justificación para dirección') + textBlock(cj.justificacion) : '')

    +   (r.estado==='borrador'
        ? '<div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px;">'
        +   '<button onclick="window._infOpenEditar(\''+r.id+'\')" style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:12px;padding:8px 16px;cursor:pointer;font-family:var(--font-mono);">✏ Editar borrador</button>'
        +   '<button onclick="window._infPublicarDesdeVer(\''+r.id+'\')" style="background:var(--accent);border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:700;padding:8px 16px;cursor:pointer;font-family:var(--font-mono);">📤 Publicar</button>'
        + '</div>'
        : '')
    + '</div>';
}

// Publicar directamente desde la vista detalle
window._infPublicarDesdeVer = async function(id){
  try {
    var res = await fetch(
      SUPABASE_URL + '/rest/v1/dept_reports?id=eq.' + encodeURIComponent(id),
      {
        method : 'PATCH',
        headers: {
          'apikey'       : SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type' : 'application/json',
          'Prefer'       : 'return=minimal'
        },
        body: JSON.stringify({ estado:'publicado', ts: localTs() })
      }
    );
    if(!res.ok) throw new Error('HTTP ' + res.status);
    invalidateCache('dept_reports');
    toast('Informe publicado ✓', 'ok');
    _infJefeMode='lista'; _infJefeList=[];
    renderInformes();
  } catch(e){
    toast('Error al publicar: ' + e.message, 'err');
  }
};

// ── Helper escape HTML (local si shared no lo expone como global) ────
function _escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Exposición pública de helpers de lectura para C4/C5 ─────────────
// Dashboard / Mi Rendimiento pueden llamar estas funciones para
// obtener el último informe publicado de un departamento.
window.infGetUltimoPublicado = async function(departamento){
  try {
    var url = SUPABASE_URL
      + '/rest/v1/dept_reports?departamento=eq.' + encodeURIComponent(departamento)
      + '&estado=eq.publicado&order=ts.desc&limit=1&select=*';
    var res = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if(!res.ok) return null;
    var arr = await res.json();
    return arr[0] || null;
  } catch(e){ return null; }
};

// Devuelve lista de publicados para un dpto en las últimas N semanas
window.infGetPublicados = async function(departamento, limite){
  limite = limite || 10;
  try {
    var url = SUPABASE_URL
      + '/rest/v1/dept_reports?departamento=eq.' + encodeURIComponent(departamento)
      + '&estado=eq.publicado&order=ts.desc&limit=' + limite + '&select=*';
    var res = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if(!res.ok) return [];
    return await res.json();
  } catch(e){ return []; }
};
