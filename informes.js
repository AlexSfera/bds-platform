// ═══════════════════════════════════════════════════════════════════════
// INFORMES.JS · Manager Bar — Informes de Producción e Incentivos
// Fase 1: Sala (CSV POSMEWS)
// Fase 2: Cocina · Recepción · SYNCROLAB (pendiente)
// ═══════════════════════════════════════════════════════════════════════

// ── Estado del módulo ────────────────────────────────────────────────
var _infTab          = 'sala';   // 'sala' | 'cocina' | 'recepcion' | 'syncrolab'
var _infSalaData     = null;     // resultado del parseo CSV actual
var _infSalaObjSem   = 3125.00; // objetivo semanal individual (sincroniza con dept_incentive_rules)
var _infSalaObjMes   = 10125.00; // objetivo mensual individual

// ── Permisos ─────────────────────────────────────────────────────────
function canAccessInformes(u){
  if(!u) return false;
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(u)) return true;
  if(typeof isSupervisor === 'function'  && isSupervisor(u)) return true;
  // fb, chef, jefe_recepcion, jefe de área pueden ver su departamento
  var jefeRoles = ['fb','chef','jefe_recepcion','supervisor'];
  return jefeRoles.indexOf(u.rol) >= 0;
}

// Qué tabs puede ver este usuario (admin = todos)
function _infTabsVisibles(u){
  if(!u) return [];
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(u)) return ['sala','cocina','recepcion','syncrolab'];
  var area = (u.area || '').toLowerCase();
  var rol  = (u.rol  || '').toLowerCase();
  if(area === 'sala' || area === 'jefe de sala' || rol === 'fb') return ['sala','cocina','recepcion','syncrolab'];
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
    el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">📊 Informes disponibles solo para jefes de departamento y dirección.</p></div>';
    return;
  }

  // Cargar objetivo real desde dept_incentive_rules (sin asumir columnas opcionales)
  try {
    var rulesRes = await fetch(
      SUPABASE_URL + '/rest/v1/dept_incentive_rules?departamento=in.(Sala,Jefe%20de%20Sala)&activo=eq.true&select=periodo,objetivo',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    if(rulesRes.ok){
      var rules = await rulesRes.json();
      var rSem = (rules || []).find(function(r){ return r.periodo === 'semanal'; });
      var rMes = (rules || []).find(function(r){ return r.periodo === 'mensual'; });
      if(rSem) _infSalaObjSem = parseFloat(rSem.objetivo || 3125);
      if(rMes) _infSalaObjMes = parseFloat(rMes.objetivo || 10125);
    }
  } catch(e){ /* usa valores por defecto */ }

  var tabs = _infTabsVisibles(currentUser);

  // Si el tab activo no está disponible, ir al primero
  if(tabs.indexOf(_infTab) < 0) _infTab = tabs[0];

  var tabDefs = [
    { id:'sala',       label:'🍽 Sala',       active: true  },
    { id:'cocina',     label:'🍳 Cocina',     active: false },
    { id:'recepcion',  label:'🏨 Recepción',  active: false },
    { id:'syncrolab',  label:'🔬 SYNCROLAB',  active: false }
  ];

  var tabBtns = tabDefs
    .filter(function(t){ return tabs.indexOf(t.id) >= 0; })
    .map(function(t){
      var isActive = t.id === _infTab;
      return '<button onclick="window._infTab=\''+t.id+'\';renderInformes()" style="'
        + 'padding:8px 18px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:12px;font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;'
        + (isActive
          ? 'background:var(--amber);color:#0d1b2e;border-color:var(--amber);'
          : 'background:var(--bg2);color:var(--text2);')
        + '">'+t.label+'</button>';
    }).join('');

  el.innerHTML = '<div class="card" style="margin-bottom:0;">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:0;">'
    + tabBtns
    + '</div>'
    + '</div>'
    + '<div id="inf-tab-content" style="margin-top:16px;"></div>';

  var tc = document.getElementById('inf-tab-content');
  if(_infTab === 'sala')      await _renderInformesSala(tc);
  else                        _renderInformesProximamente(tc, _infTab);
}

// ── TAB PRÓXIMAMENTE ─────────────────────────────────────────────────
function _renderInformesProximamente(el, tab){
  var nombres = { cocina:'Cocina', recepcion:'Recepción', syncrolab:'SYNCROLAB' };
  el.innerHTML = '<div class="card" style="text-align:center;padding:48px 24px;">'
    + '<div style="font-size:32px;margin-bottom:12px;">🚧</div>'
    + '<div style="font-family:var(--font-mono);font-weight:700;color:var(--text);font-size:15px;margin-bottom:8px;">Informes ' + (nombres[tab]||tab) + '</div>'
    + '<div style="color:var(--text3);font-size:13px;">Módulo en desarrollo — próxima fase.</div>'
    + '</div>';
}

// ═══════════════════════════════════════════════════════════════════════
// TAB SALA — carga CSV POSMEWS, parsea, muestra tabla + incentivo
// ═══════════════════════════════════════════════════════════════════════

async function _renderInformesSala(el){
  var objSemFmt = _infSalaObjSem.toLocaleString('es-ES', { minimumFractionDigits: 2 });
  var objMesFmt = _infSalaObjMes.toLocaleString('es-ES', { minimumFractionDigits: 2 });

  el.innerHTML = '<div class="card">'
    // Cabecera zona carga
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--text);">📥 Importar producción POSMEWS</div>'
    +     '<div style="font-size:11px;color:var(--text3);margin-top:3px;">CSV exportado desde POSMEWS · Facturas · Rango semanal</div>'
    +   '</div>'
    +   '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
    +     '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">'
    +       'Obj. semana: <strong style="color:var(--amber);">'+objSemFmt+'€</strong>'
    +       ' &nbsp;·&nbsp; Obj. mes: <strong style="color:var(--amber);">'+objMesFmt+'€</strong>'
    +     '</div>'
    +   '</div>'
    + '</div>'

    // Drop zone
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

    // Zona de resultado (se rellena tras parseo)
    + '<div id="inf-sala-result"></div>'

    + '</div>';

  // Si ya hay datos cargados en memoria, pintarlos
  if(_infSalaData) _renderSalaTabla(_infSalaData);
}

// ── Drag & drop handler ──────────────────────────────────────────────
window._infHandleDrop = function(ev){
  ev.preventDefault();
  var dz = document.getElementById('inf-dropzone');
  if(dz) dz.style.borderColor = 'var(--border2)';
  var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(file) window._infLoadCSV(file);
};

// ── Cargador y parser del CSV ────────────────────────────────────────
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

// ── Parser POSMEWS → estructura normalizada ──────────────────────────
// Columnas clave: Fecha[0], Usuario[6], Cancelación[7], Total[10], Descuento-Desc[12]
function _infParsePOSMEWS(text){
  // Eliminar BOM UTF-8
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  var lines = text.split(/\r?\n/);
  if(lines.length < 2) throw new Error('CSV vacío');

  // Parsear cabecera flexible
  var header = _csvSplitLine(lines[0]);
  var iIdx   = function(name){ return header.findIndex(function(h){ return h.trim() === name; }); };

  var colFecha    = iIdx('Fecha');
  var colUsuario  = iIdx('Usuario');
  var colCancel   = iIdx('Cancelación');
  var colTotal    = iIdx('Total [€]');
  var colDescDesc = iIdx('Descuento - Descripción');

  if(colFecha < 0 || colUsuario < 0 || colTotal < 0){
    throw new Error('Formato CSV no reconocido. Verifica que exportaste desde POSMEWS > Facturas.');
  }

  // Acumuladores
  var porUsuario = {};    // { nombre: { fechas: {}, totalBruto, facturas } }
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

    // Normalizar nombre (quitar espacios extra)
    usuario = usuario.replace(/\s+/g, ' ');

    if(!porUsuario[usuario]){
      porUsuario[usuario] = { fechas: {}, totalBruto: 0, facturas: 0, descuentos: {} };
    }
    if(!porUsuario[usuario].fechas[fecha]){
      porUsuario[usuario].fechas[fecha] = 0;
    }

    porUsuario[usuario].fechas[fecha]   += total;
    porUsuario[usuario].totalBruto      += total;
    porUsuario[usuario].facturas        += 1;

    if(descDes){
      porUsuario[usuario].descuentos[descDes] = (porUsuario[usuario].descuentos[descDes] || 0) + 1;
    }

    fechasSet[fecha] = true;
  }

  var fechas   = Object.keys(fechasSet).sort();
  var usuarios = Object.keys(porUsuario).sort(function(a, b){
    return porUsuario[b].totalBruto - porUsuario[a].totalBruto;
  });

  // Calcular semana que cubre el CSV (si es ≥ 7 días usa la primera semana)
  var rangoDias = fechas.length;

  // Detectar si es semana (≤ 7 días) o mes (> 7 días)
  var esMes = rangoDias > 7;

  return { usuarios: usuarios, fechas: fechas, porUsuario: porUsuario, esMes: esMes, rangoDias: rangoDias };
}

// ── CSV line splitter que respeta comillas ────────────────────────────
function _csvSplitLine(line){
  var cols = [];
  var cur  = '';
  var inQ  = false;
  for(var i = 0; i < line.length; i++){
    var c = line[i];
    if(c === '"'){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if(c === ',' && !inQ){
      cols.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  cols.push(cur);
  return cols;
}

// ── Render tabla resultado ────────────────────────────────────────────
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

  // Detectar rango de fechas para el label
  var f0  = fechas[0]  || '';
  var fN  = fechas[fechas.length - 1] || '';
  var fmt = function(f){ return f ? f.slice(8)+'/'+f.slice(5,7)+'/'+f.slice(0,4) : ''; };
  var rangoLabel = f0 === fN ? fmt(f0) : fmt(f0) + ' — ' + fmt(fN);

  // ── Totales diarios ──
  var totalsDia = {};
  fechas.forEach(function(f){ totalsDia[f] = 0; });
  usuarios.forEach(function(u){
    fechas.forEach(function(f){
      totalsDia[f] += (porUsuario[u].fechas[f] || 0);
    });
  });
  var totalGeneral = usuarios.reduce(function(s, u){ return s + porUsuario[u].totalBruto; }, 0);

  // ── Cabecera de fechas (sólo día-mes) ──
  var thFechas = fechas.map(function(f){
    return '<th style="text-align:right;font-family:var(--font-mono);font-size:10px;white-space:nowrap;padding:8px 10px;">'
      + f.slice(8)+'/'+f.slice(5,7)+'</th>';
  }).join('');

  // ── Filas por usuario ──
  var rows = usuarios.map(function(u, idx){
    var d = porUsuario[u];
    var total = d.totalBruto;

    // Cálculo incentivo bruto: bonus semanal si cumple objetivo semana
    // Si el CSV cubre varios periodos (mes), evaluamos semana por semana
    var cumplesObjSem = total >= _infSalaObjSem;
    var statusBadge, statusColor;

    if(cumplesObjSem){
      statusBadge  = '✅ Cumple';
      statusColor  = 'var(--green)';
    } else {
      var falta    = _infSalaObjSem - total;
      statusBadge  = '❌ Falta ' + falta.toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€';
      statusColor  = 'var(--red)';
    }

    var rowBg = idx % 2 === 0 ? 'var(--bg3)' : 'var(--bg4)';

    var celdas = fechas.map(function(f){
      var v = d.fechas[f] || 0;
      return '<td style="text-align:right;font-family:var(--font-mono);font-size:12px;padding:8px 10px;color:'
        + (v > 0 ? 'var(--text)' : 'var(--text3)') + ';">'
        + (v > 0 ? v.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '€' : '—')
        + '</td>';
    }).join('');

    return '<tr style="background:'+rowBg+';border-bottom:1px solid var(--border);">'
      + '<td style="padding:8px 12px;font-size:13px;white-space:nowrap;font-weight:600;color:var(--text);">' + _escHtml(u) + '</td>'
      + celdas
      + '<td style="text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:700;padding:8px 12px;color:var(--amber);">'
      +   total.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '€'
      + '</td>'
      + '<td style="text-align:center;padding:8px 12px;">'
      +   '<span style="font-size:11px;font-weight:700;color:'+statusColor+';">'+statusBadge+'</span>'
      + '</td>'
      + '</tr>';
  }).join('');

  // ── Fila totales ──
  var celdaTotDia = fechas.map(function(f){
    var v = totalsDia[f];
    return '<td style="text-align:right;font-family:var(--font-mono);font-size:12px;padding:8px 10px;font-weight:700;color:var(--text2);">'
      + (v > 0 ? v.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '€' : '—')
      + '</td>';
  }).join('');

  // ── KPI summary ──
  var nCumplen = usuarios.filter(function(u){ return porUsuario[u].totalBruto >= _infSalaObjSem; }).length;
  var pctCump  = usuarios.length ? Math.round(nCumplen / usuarios.length * 100) : 0;
  var mediaProd = usuarios.length ? totalGeneral / usuarios.length : 0;

  var kpiBox = function(label, val, color){
    return '<div style="flex:1;min-width:130px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center;">'
      + '<div style="font-size:10px;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">'+label+'</div>'
      + '<div style="font-size:17px;font-weight:700;font-family:var(--font-mono);color:'+color+';">'+val+'</div>'
      + '</div>';
  };

  var nCamareros = usuarios.length;

  el.innerHTML = ''
    // Periodo + KPIs
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'
    +   '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text3);">'
    +     '📅 Periodo: <strong style="color:var(--text2);">'+rangoLabel+'</strong>'
    +     ' &nbsp;·&nbsp; '+nCamareros+' camarero'+(nCamareros===1?'':'s')
    +   '</div>'
    +   '<button onclick="window._infSalaData=null;_renderInformesSala(document.getElementById(\'inf-tab-content\'))" '
    +     'style="background:var(--bg4);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:11px;font-family:var(--font-mono);padding:5px 12px;cursor:pointer;">✕ Nuevo CSV</button>'
    + '</div>'

    // KPIs
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">'
    +   kpiBox('Producción total', totalGeneral.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '€', 'var(--amber)')
    +   kpiBox('Media por camarero', mediaProd.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '€', 'var(--text)')
    +   kpiBox('Cumplen objetivo', nCumplen + ' / ' + nCamareros, nCumplen === nCamareros ? 'var(--green)' : 'var(--red)')
    +   kpiBox('% cumplimiento', pctCump + '%', pctCump >= 80 ? 'var(--green)' : pctCump >= 50 ? 'var(--amber)' : 'var(--red)')
    + '</div>'

    // Tabla
    + '<div style="overflow-x:auto;">'
    +   '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px;">'
    +     '<thead>'
    +       '<tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    +         '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">Camarero</th>'
    +         thFechas
    +         '<th style="text-align:right;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--amber);">Total</th>'
    +         '<th style="text-align:center;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">Obj. '+_infSalaObjSem.toLocaleString('es-ES',{maximumFractionDigits:0})+'€</th>'
    +       '</tr>'
    +     '</thead>'
    +     '<tbody>'
    +       rows
    +       '<tr style="background:var(--bg2);border-top:2px solid var(--border2);">'
    +         '<td style="padding:10px 12px;font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">TOTAL</td>'
    +         celdaTotDia
    +         '<td style="text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;padding:10px 12px;color:var(--amber);">'
    +           totalGeneral.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '€'
    +         '</td>'
    +         '<td></td>'
    +       '</tr>'
    +     '</tbody>'
    +   '</table>'
    + '</div>'

    // Nota metodológica
    + '<div style="margin-top:14px;padding:10px 14px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--amber);font-size:11px;color:var(--text3);line-height:1.7;">'
    +   '📌 <strong style="color:var(--text2);">Nota:</strong> Producción bruta (IVA incluido) · Se excluyen cancelaciones y líneas con total ≤ 0 € · '
    +   'Objetivo semanal individual: <strong style="color:var(--amber);">'+_infSalaObjSem.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</strong> · '
    +   'Objetivo mensual individual: <strong style="color:var(--amber);">'+_infSalaObjMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</strong>'
    + '</div>';
}

// ── Escape HTML ───────────────────────────────────────────────────────
function _escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.renderInformes = renderInformes;
