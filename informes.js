// ═══════════════════════════════════════════════════════════════════════
// INFORMES.JS · Manager Bar — Entrada de datos por departamento
// Arquitectura: L1 = Departamento (chip) · L2 = Tipo de dato (sub-tab)
// Resultados/analítica → Dashboard (B7). Analítica incentivos → Mi Rendimiento.
// ═══════════════════════════════════════════════════════════════════════

// ── Estado del módulo ────────────────────────────────────────────────
var _infDept         = null;   // chip L1 activo (key del catálogo)
var _infSubTab       = null;   // sub-tab L2 activo
var _infSalaData     = null;
var _infSalaObjSem   = 3125.00;
var _infSalaObjMes   = 10125.00;

// Estado informe de jefe
var _infJefeMode     = 'lista';
var _infJefeEditId   = null;
var _infJefeViewId   = null;
var _infJefeList     = [];

// Cache de employees para match fuzzy
var _infEmployeesCache = null;

// ── CATÁLOGO ÚNICO DE DEPARTAMENTOS ─────────────────────────────────
// key       = valor canónico usado en employees.area (o lógica especial)
// label     = texto del chip
// icon      = emoji
// subtabs   = sub-tabs disponibles para ese depto (orden de aparición)
// coming    = true → chip deshabilitado (próximamente)
// special   = 'entrenadores' | 'rrhh' (lógica de acceso no estándar)
var INF_DEPT_CATALOG = [
  { key:'Sala',         label:'Sala',                  icon:'🍽', subtabs:['kpi','ventas','incentivos','informe-jefe'] },
  { key:'Cocina',       label:'Cocina',                icon:'🍳', subtabs:['kpi','ventas','incentivos','informe-jefe'] },
  { key:'Recepción',    label:'Recepción Hotel',        icon:'🏨', subtabs:['kpi','ventas','incentivos','informe-jefe'] },
  { key:'SYNCROLAB',    label:'Recepción SyncroLab',   icon:'🔬', subtabs:['kpi','ventas','incentivos','informe-jefe'] },
  { key:'Entrenadores', label:'Entrenadores',           icon:'🏋', subtabs:['kpi','incentivos','informe-jefe'], special:'entrenadores' },
  { key:'Housekeeping', label:'Housekeeping',           icon:'🧹', subtabs:['kpi','incentivos','informe-jefe'] },
  { key:'Mantenimiento',label:'Mantenimiento',          icon:'🔧', subtabs:['horas-extra','informe-jefe'] },
  { key:'RRHH',         label:'Dirección / RR.HH.',    icon:'👥', subtabs:['rrhh'], special:'rrhh' },
  { key:'Fisioterapeutas', label:'Fisioterapeutas',     icon:'🩺', subtabs:[], coming:true },
  { key:'Marketing',    label:'Marketing',              icon:'📣', subtabs:[], coming:true }
];

// Labels de sub-tabs
var INF_SUBTAB_LABELS = {
  'kpi'         : '📊 KPI',
  'ventas'      : '💶 Ventas / Datos',
  'incentivos'  : '⚙️ Incentivos',
  'informe-jefe': '📋 Informe de Jefe',
  'horas-extra' : '⏱ Horas Extra',
  'rrhh'        : '👥 RR.HH.'
};

// Tipos de turno por departamento (C5) — sin cambios
var INF_TURNOS_DEPT = {
  'Sala'     : ['M','T','C'],
  'Cocina'   : ['M','T','C'],
  'Recepción': ['M','T','N'],
  'SYNCROLAB': ['M','T'],
  'Housekeeping':['M','T']
};

// ── Permisos ─────────────────────────────────────────────────────────
function canAccessInformes(u){
  if(!u) return false;
  var rol = (u.rol || '').toLowerCase();
  if(rol === 'admin') return true;
  if(rol === 'adjunto_directivo') return true;  // Angélica: solo ve RRHH (filtrado en _infDeptsVisibles)
  if(typeof isSupervisor === 'function' && isSupervisor(u)) return true;
  return ['fb','chef','jefe_recepcion','supervisor','coord_entrenadores'].indexOf(rol) >= 0;
}

// Devuelve array de keys de INF_DEPT_CATALOG que el usuario puede ver (activos)
function _infDeptsVisibles(u){
  if(!u) return [];
  var rol  = (u.rol  || '').toLowerCase();
  var area = (u.area || '');
  var puesto = (u.puesto || '');

  // Admin puro → todo (excluye adjunto_directivo que tiene acceso restringido)
  if(rol === 'admin'){
    return INF_DEPT_CATALOG.filter(function(d){ return !d.coming; }).map(function(d){ return d.key; });
  }

  // Adjunto directivo (Angélica / RRHH) → solo su dept
  if(rol === 'adjunto_directivo'){
    return ['RRHH'];
  }

  // Entrenadores: comparten area=SYNCROLAB, se detectan por puesto
  var esEntren = typeof _esEntrenador==='function' ? _esEntrenador(u)
    : ['Entrenador(a)','Coordinador(a) de Entrenadores'].indexOf(puesto) >= 0;

  if(esEntren) return ['Entrenadores'];

  // Sala / FnB
  if(area==='Sala' || rol==='fb' || rol==='jefe_sala') return ['Sala','Cocina'];

  // SYNCROLAB (recepción syncrolab, NO entrenadores)
  if(area==='SYNCROLAB' && !esEntren) return ['SYNCROLAB'];

  // Cocina
  if(area==='Cocina' || rol==='chef') return ['Cocina'];

  // Recepción hotel
  if(area==='Recepción' || rol==='jefe_recepcion') return ['Recepción'];

  // Housekeeping
  if(area==='Housekeeping') return ['Housekeeping'];

  // Mantenimiento
  if(area==='Mantenimiento') return ['Mantenimiento'];

  // RRHH puro
  if(rol==='rrhh') return ['RRHH'];

  return [];
}

// Aliases de compatibilidad — las funciones de render antiguas siguen funcionando
var INF_DEPT_LABELS = (function(){
  var map={};
  INF_DEPT_CATALOG.forEach(function(d){ map[d.key]=d.icon+' '+d.label; });
  return map;
})();

function _infDeptosDelJefe(u){
  // Devuelve array de keys visibles para el usuario (mismo resultado que _infDeptsVisibles)
  return _infDeptsVisibles(u);
}

// ══════════════════════════════════════════════════════════════════════
// MATCH FUZZY CSV → BD (distancia Levenshtein ≤ 4)
// ══════════════════════════════════════════════════════════════════════
function _levDist(a, b){
  a = a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  b = b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(a===b) return 0;
  var m=a.length, n=b.length;
  var dp=[];
  for(var i=0;i<=m;i++){ dp[i]=[i]; }
  for(var j=0;j<=n;j++){ dp[0][j]=j; }
  for(var i=1;i<=m;i++){
    for(var j=1;j<=n;j++){
      dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// Devuelve el nombre canónico de la BD más cercano al nombre del CSV
// Si distancia > 4 → devuelve el nombre original (no fuerza el match)
function _infMatchNombre(csvNombre, employees){
  if(!employees||!employees.length) return csvNombre;
  var norm = csvNombre.trim().replace(/\s+/g,' ');
  // Búsqueda exacta primero
  var exact = employees.find(function(e){ return e.nombre===norm; });
  if(exact) return exact.nombre;
  // Búsqueda fuzzy
  var mejor=null, mejorDist=Infinity;
  employees.forEach(function(e){
    var d=_levDist(norm, e.nombre);
    if(d<mejorDist){ mejorDist=d; mejor=e.nombre; }
  });
  return mejorDist<=4 ? mejor : norm;
}

async function _infGetEmployees(){
  if(_infEmployeesCache) return _infEmployeesCache;
  try {
    _infEmployeesCache = await getDB('employees');
  } catch(e){ _infEmployeesCache=[]; }
  return _infEmployeesCache||[];
}

// ── RENDER PRINCIPAL ─────────────────────────────────────────────────
async function renderInformes(){
  var el=document.getElementById('informes-content');
  if(!el) return;
  if(!canAccessInformes(currentUser)){
    el.innerHTML='<div class="card"><p style="color:var(--text3);padding:20px 0;">📊 Informes disponibles solo para jefes de departamento y dirección.</p></div>';
    return;
  }

  // Cargar objetivos Sala (sin cambio)
  try {
    var rulesRes=await fetch(
      SUPABASE_URL+'/rest/v1/dept_incentive_rules?departamento=in.(Sala,Jefe%20de%20Sala)&activo=eq.true&select=periodo,objetivo',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    );
    if(rulesRes.ok){
      var rules=await rulesRes.json();
      var rSem=(rules||[]).find(function(r){return r.periodo==='semanal';});
      var rMes=(rules||[]).find(function(r){return r.periodo==='mensual';});
      if(rSem) _infSalaObjSem=parseFloat(rSem.objetivo||3125);
      if(rMes) _infSalaObjMes=parseFloat(rMes.objetivo||10125);
    }
  } catch(e){}

  var visibles = _infDeptsVisibles(currentUser);

  // Si el dept activo no es visible, resetear al primero disponible
  if(!_infDept || visibles.indexOf(_infDept)<0){
    _infDept = visibles[0] || null;
    _infSubTab = null;
  }

  // Chip L1 — departamento
  function chipDepto(d){
    var coming = !!d.coming;
    var active  = _infDept === d.key;
    var visible = visibles.indexOf(d.key) >= 0;
    var disabled = coming || (!visible && !active);
    var base = 'padding:9px 18px;border-radius:8px;border:1px solid;cursor:'+(disabled?'default':'pointer')+';'
      +'font-size:12px;font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;transition:all .15s;display:flex;align-items:center;gap:6px;';
    var color = coming
      ? 'background:var(--bg2);color:var(--text3);border-color:var(--border);opacity:.45;'
      : active
        ? 'background:var(--accent);color:#fff;border-color:var(--accent);'
        : visible
          ? 'background:var(--bg2);color:var(--text2);border-color:var(--border);'
          : 'background:var(--bg2);color:var(--text3);border-color:var(--border);opacity:.3;';
    var click = (disabled||!visible) ? '' : 'onclick="window._infDept=\''+d.key+'\';window._infSubTab=null;renderInformes()"';
    var badge = coming ? ' <span style="font-size:9px;background:var(--amber);color:#0d1b2e;border-radius:3px;padding:1px 5px;font-weight:700;letter-spacing:.08em;">PRONTO</span>' : '';
    return '<button '+click+' style="'+base+color+'" '+(disabled?'disabled':'')+'>'+d.icon+' '+d.label+badge+'</button>';
  }

  var chipsHtml = INF_DEPT_CATALOG.map(chipDepto).join('');

  // Sub-tab L2 del dept activo
  var deptDef = INF_DEPT_CATALOG.find(function(d){ return d.key===_infDept; });
  var subTabsHtml = '';
  if(deptDef && deptDef.subtabs && deptDef.subtabs.length){
    if(!_infSubTab || deptDef.subtabs.indexOf(_infSubTab)<0){
      _infSubTab = deptDef.subtabs[0];
    }
    subTabsHtml = deptDef.subtabs.map(function(sid){
      var lbl = INF_SUBTAB_LABELS[sid] || sid;
      var active = _infSubTab === sid;
      return '<button onclick="window._infSubTab=\''+sid+'\';_infRenderSubTab()" style="'
        +'padding:7px 16px;border-radius:6px;border:1px solid;cursor:pointer;'
        +'font-size:12px;font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;transition:all .15s;'
        +(active
          ? 'background:var(--amber);color:#0d1b2e;border-color:var(--amber);'
          : 'background:var(--bg2);color:var(--text2);border-color:var(--border);')
        +'">'+lbl+'</button>';
    }).join('');
  }

  el.innerHTML=''
    // ── L1: chips de departamento ──
    +'<div class="card" style="margin-bottom:0;padding:14px 18px;">'
    +  '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;">Departamento</div>'
    +  '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+chipsHtml+'</div>'
    +'</div>'
    // ── L2: sub-tabs del dept ──
    +(subTabsHtml
      ? '<div class="card" style="margin-bottom:0;margin-top:8px;padding:10px 18px;">'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'+subTabsHtml+'</div>'
        +'</div>'
      : '')
    // ── Contenido ──
    +'<div id="inf-main-content" style="margin-top:14px;"></div>';

  await _infRenderSubTab();
}
window.renderInformes=renderInformes;

// Renderiza el contenido del sub-tab activo según _infDept + _infSubTab
async function _infRenderSubTab(){
  var tc=document.getElementById('inf-main-content');
  if(!tc) return;

  var dept = _infDept;
  var sub  = _infSubTab;

  if(!dept){ tc.innerHTML=''; return; }

  // ── KPI ──────────────────────────────────────────────────────────
  if(sub==='kpi'){
    if(dept==='Sala')         { await _renderInformesSala(tc); return; }
    if(dept==='Entrenadores') { await _renderInformesEntrenadores(tc); return; }
    _renderInformesProximamente(tc, dept+' · KPI');
    return;
  }

  // ── VENTAS / DATOS ───────────────────────────────────────────────
  if(sub==='ventas'){
    _renderInformesProximamente(tc, dept+' · Ventas / Datos');
    return;
  }

  // ── INCENTIVOS (solo config + congelar + liquidar) ───────────────
  if(sub==='incentivos'){
    tc.innerHTML='<div id="incentivos-content"></div>';
    if(typeof renderIncentivos==='function') await renderIncentivos();
    else tc.innerHTML='<div class="card"><p style="color:var(--text3);padding:20px 0;">💰 Módulo de incentivos no cargado.</p></div>';
    return;
  }

  // ── INFORME DE JEFE ──────────────────────────────────────────────
  if(sub==='informe-jefe'){
    await _renderInformeJefe(tc);
    return;
  }

  // ── HORAS EXTRA (Mantenimiento) ──────────────────────────────────
  if(sub==='horas-extra'){
    _renderInformesProximamente(tc, 'Mantenimiento · Horas Extra');
    return;
  }

  // ── RR.HH. ───────────────────────────────────────────────────────
  if(sub==='rrhh'){
    await _renderRRHH(tc);
    return;
  }

  tc.innerHTML='';
}

function _renderInformesProximamente(el,tab){
  var nombres={cocina:'Cocina',recepcion:'Recepción',syncrolab:'SYNCROLAB'};
  el.innerHTML='<div class="card" style="text-align:center;padding:48px 24px;">'
    +'<div style="font-size:32px;margin-bottom:12px;">🚧</div>'
    +'<div style="font-family:var(--font-mono);font-weight:700;color:var(--text);font-size:15px;margin-bottom:8px;">Informes '+(nombres[tab]||tab)+'</div>'
    +'<div style="color:var(--text3);font-size:13px;">Módulo en desarrollo — próxima fase.</div>'
    +'</div>';
}

function _infReportRow(nombre, ruta, fmt){
  var badge = (fmt==='CSV')
    ? 'background:rgba(46,204,113,.15);color:#57d38c;'
    : 'background:rgba(245,158,11,.15);color:var(--amber);';
  return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 9px;border:1px solid var(--border2);border-radius:6px;">'
    +  '<div style="min-width:0;">'
    +    '<div style="font-size:10.5px;color:var(--text2);line-height:1.3;">'+nombre+'</div>'
    +    '<div style="font-size:9px;color:var(--text3);line-height:1.3;">'+ruta+'</div>'
    +  '</div>'
    +  '<span style="font-size:9px;font-weight:700;font-family:var(--font-mono);padding:2px 6px;border-radius:4px;flex-shrink:0;'+badge+'">'+fmt+'</span>'
    +'</div>';
}

async function _renderInformesSala(el){
  var objSemFmt=_infSalaObjSem.toLocaleString('es-ES',{minimumFractionDigits:2});
  var objMesFmt=_infSalaObjMes.toLocaleString('es-ES',{minimumFractionDigits:2});
  el.innerHTML='<div class="card">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">'
    +  '<div>'
    +    '<div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--text);">📥 Importar producción POSMEWS</div>'
    +    '<div style="font-size:11px;color:var(--text3);margin-top:3px;">CSV exportado desde POSMEWS · Facturas · Rango semanal</div>'
    +  '</div>'
    +  '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">'
    +    'Obj. semana: <strong style="color:var(--amber);">'+objSemFmt+'€</strong>'
    +    ' &nbsp;·&nbsp; Obj. mes: <strong style="color:var(--amber);">'+objMesFmt+'€</strong>'
    +  '</div>'
    +'</div>'
    +'<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:stretch;margin-bottom:16px;">'
    // ── Columna izquierda: dropzone (sin cambios funcionales) ──
    +'<div style="flex:1 1 360px;min-width:280px;">'
    +'<div id="inf-dropzone" onclick="document.getElementById(\'inf-csv-input\').click()" '
    +  'ondragover="event.preventDefault();this.style.borderColor=\'var(--amber)\'" '
    +  'ondragleave="this.style.borderColor=\'var(--border2)\'" '
    +  'ondrop="window._infHandleDrop(event)" '
    +  'style="border:2px dashed var(--border2);border-radius:10px;padding:36px 24px;text-align:center;cursor:pointer;transition:border-color .2s;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;">'
    +  '<div style="font-size:28px;margin-bottom:10px;">📂</div>'
    +  '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text2);font-weight:600;">Arrastra el CSV aquí o haz clic para seleccionar</div>'
    +  '<div style="font-size:11px;color:var(--text3);margin-top:6px;">POSMEWS · Facturas · Periodo semanal o mensual</div>'
    +'</div>'
    +'</div>'
    // ── Columna derecha: guía semanal para el Jefe de Sala ──
    +'<div style="flex:1 1 320px;min-width:280px;border:1px solid var(--border2);border-radius:10px;padding:16px 18px;background:rgba(255,255,255,.02);box-sizing:border-box;">'
    +  '<div style="font-family:var(--font-mono);font-weight:700;font-size:12px;color:var(--text);margin-bottom:3px;">📋 Rutina semanal → Claude</div>'
    +  '<div style="font-size:10.5px;color:var(--text3);margin-bottom:14px;line-height:1.5;">pos.mews.com › LA SELLA ACADEMY SL · desde ordenador (no móvil) · periodo <strong style="color:var(--text2);">domingo → sábado</strong></div>'
    +  '<div style="font-size:11px;color:var(--text2);font-weight:700;margin-bottom:4px;">1 · Ajustar fechas</div>'
    +  '<div style="font-size:10.5px;color:var(--text3);margin-bottom:12px;line-height:1.5;">Menú izquierdo › Informes › Ventas → rango <strong style="color:var(--text2);">domingo a sábado</strong> de la semana a reportar.</div>'
    +  '<div style="font-size:11px;color:var(--text2);font-weight:700;margin-bottom:6px;">2 · Descargar 4 archivos</div>'
    +  '<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">'
    +    _infReportRow('Ventas por empleado','Informes › Ventas','CSV')
    +    _infReportRow('Pagos','Informes › Pagos','CSV')
    +    _infReportRow('Compensaciones y anulaciones','Informes › Compensaciones','XLSX')
    +    _infReportRow('Descuentos','Informes › Descuentos','XLSX')
    +  '</div>'
    +  '<div style="font-size:11px;color:var(--text2);font-weight:700;margin-bottom:4px;">3 · Enviar a Claude</div>'
    +  '<div style="font-size:10.5px;color:var(--text3);margin-bottom:6px;line-height:1.5;">Adjunta los 4 archivos en un mensaje con el texto:</div>'
    +  '<div style="font-family:var(--font-mono);font-size:10.5px;color:var(--amber);border:1px dashed var(--border2);border-radius:6px;padding:8px 10px;line-height:1.5;">Análisis semanal POSMEWS [domingo] al [sábado]</div>'
    +  '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border2);font-size:10px;color:var(--text3);line-height:1.5;">El CSV de <strong style="color:var(--text2);">Ventas por empleado</strong> se arrastra también al recuadro de la izquierda → alimenta KPI e incentivos dentro de SYNCRO SHIFT.</div>'
    +'</div>'
    +'</div>'
    +'<input type="file" id="inf-csv-input" accept=".csv" style="display:none" onchange="window._infLoadCSV(this.files[0])">'
    +'<div id="inf-sala-result"></div>'
    +'</div>';
  if(_infSalaData) _renderSalaTabla(_infSalaData);
}

window._infHandleDrop=function(ev){
  ev.preventDefault();
  var dz=document.getElementById('inf-dropzone');
  if(dz) dz.style.borderColor='var(--border2)';
  var file=ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files[0];
  if(file) window._infLoadCSV(file);
};

window._infLoadCSV=function(file){
  if(!file||!file.name.match(/\.csv$/i)){ toast('Selecciona un archivo .csv exportado de POSMEWS','err'); return; }
  var rdr=new FileReader();
  rdr.onload=async function(e){
    try {
      var employees=await _infGetEmployees();
      var parsed=_infParsePOSMEWS(e.target.result, employees);
      _infSalaData=parsed;
      _renderSalaTabla(parsed);
    } catch(err){ toast('Error al procesar el CSV: '+err.message,'err'); }
  };
  rdr.readAsText(file,'utf-8');
};

// Parser con match fuzzy integrado
function _infParsePOSMEWS(text, employees){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  var lines=text.split(/\r?\n/);
  if(lines.length<2) throw new Error('CSV vacío');
  var header=_csvSplitLine(lines[0]);
  var iIdx=function(name){ return header.findIndex(function(h){ return h.trim()===name; }); };
  var colFecha=iIdx('Fecha'),colUsuario=iIdx('Usuario'),colCancel=iIdx('Cancelación'),
      colTotal=iIdx('Total [€]'),colDescDesc=iIdx('Descuento - Descripción');
  if(colFecha<0||colUsuario<0||colTotal<0)
    throw new Error('Formato CSV no reconocido. Verifica que exportaste desde POSMEWS > Facturas.');

  // Cache de resolución fuzzy por nombre CSV
  var matchCache={};
  function resolveNombre(raw){
    if(!matchCache[raw]) matchCache[raw]=_infMatchNombre(raw, employees||[]);
    return matchCache[raw];
  }

  var porUsuario={}, fechasSet={}, matchLog=[];
  for(var i=1;i<lines.length;i++){
    var line=lines[i].trim();
    if(!line) continue;
    var cols=_csvSplitLine(line);
    if(cols.length<Math.max(colFecha,colUsuario,colTotal)+1) continue;
    var cancelado=(cols[colCancel]||'').trim().toLowerCase();
    if(cancelado==='sí'||cancelado==='si') continue;
    var total=parseFloat((cols[colTotal]||'0').replace(',','.'));
    if(total<=0) continue;
    var fecha=(cols[colFecha]||'').trim();
    var usuarioRaw=(cols[colUsuario]||'').trim().replace(/\s+/g,' ');
    var descDes=colDescDesc>=0?(cols[colDescDesc]||'').trim():'';
    if(!usuarioRaw||!fecha) continue;

    // Match fuzzy
    var usuario=resolveNombre(usuarioRaw);
    if(usuario!==usuarioRaw) matchLog.push(usuarioRaw+' → '+usuario);

    if(!porUsuario[usuario]) porUsuario[usuario]={fechas:{},totalBruto:0,facturas:0,descuentos:{},csvNombre:usuarioRaw};
    if(!porUsuario[usuario].fechas[fecha]) porUsuario[usuario].fechas[fecha]=0;
    porUsuario[usuario].fechas[fecha]+=total;
    porUsuario[usuario].totalBruto+=total;
    porUsuario[usuario].facturas+=1;
    if(descDes) porUsuario[usuario].descuentos[descDes]=(porUsuario[usuario].descuentos[descDes]||0)+1;
    fechasSet[fecha]=true;
  }
  var fechas=Object.keys(fechasSet).sort();
  var usuarios=Object.keys(porUsuario).sort(function(a,b){ return porUsuario[b].totalBruto-porUsuario[a].totalBruto; });
  var rangoDias=fechas.length;
  return {fechas,usuarios,porUsuario,rangoDias,tipo:rangoDias<=7?'semanal':'mensual',matchLog};
}

function _csvSplitLine(line){
  var cols=[],cur='',inQ=false;
  for(var i=0;i<line.length;i++){
    var c=line[i];
    if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; }
    else if(c===','&&!inQ){ cols.push(cur);cur=''; }
    else { cur+=c; }
  }
  cols.push(cur);
  return cols;
}

function _renderSalaTabla(data){
  var el=document.getElementById('inf-sala-result');
  if(!el) return;
  var {usuarios,fechas,porUsuario,matchLog}=data;
  if(!usuarios.length){
    el.innerHTML='<div style="color:var(--text3);text-align:center;padding:24px;">Sin datos válidos en el archivo.</div>';
    return;
  }
  var fmt=function(f){ return f?f.slice(8)+'/'+f.slice(5,7)+'/'+f.slice(0,4):''; };
  var f0=fechas[0]||'',fN=fechas[fechas.length-1]||'';
  var rangoLabel=f0===fN?fmt(f0):fmt(f0)+' — '+fmt(fN);
  var totalsDia={};
  fechas.forEach(function(f){ totalsDia[f]=0; });
  usuarios.forEach(function(u){ fechas.forEach(function(f){ totalsDia[f]+=(porUsuario[u].fechas[f]||0); }); });
  var totalGeneral=usuarios.reduce(function(s,u){ return s+porUsuario[u].totalBruto; },0);
  var thFechas=fechas.map(function(f){
    return '<th style="text-align:right;font-family:var(--font-mono);font-size:10px;white-space:nowrap;padding:8px 10px;">'+f.slice(8)+'/'+f.slice(5,7)+'</th>';
  }).join('');
  var rows=usuarios.map(function(u,idx){
    var d=porUsuario[u],total=d.totalBruto;
    var cumple=total>=_infSalaObjSem;
    var statusBadge=cumple?'✅ Cumple':'❌ Falta '+((_infSalaObjSem-total).toLocaleString('es-ES',{maximumFractionDigits:0}))+'€';
    var statusColor=cumple?'var(--green)':'var(--red)';
    var rowBg=idx%2===0?'var(--bg3)':'var(--bg4)';
    var celdas=fechas.map(function(f){
      var v=d.fechas[f]||0;
      return '<td style="text-align:right;font-family:var(--font-mono);font-size:12px;padding:8px 10px;color:'+(v>0?'var(--text)':'var(--text3)')+';">'+(v>0?v.toLocaleString('es-ES',{minimumFractionDigits:2})+'€':'—')+'</td>';
    }).join('');
    // Indicador de match fuzzy
    var matchInd=(d.csvNombre&&d.csvNombre!==u)?'<span title="CSV: '+_escHtml(d.csvNombre)+'" style="font-size:9px;color:var(--amber);margin-left:4px;cursor:help;">~</span>':'';
    return '<tr style="background:'+rowBg+';border-bottom:1px solid var(--border);">'
      +'<td style="padding:8px 12px;font-size:13px;white-space:nowrap;font-weight:600;color:var(--text);">'+_escHtml(u)+matchInd+'</td>'
      +celdas
      +'<td style="text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:700;padding:8px 12px;color:var(--amber);">'+total.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
      +'<td style="text-align:center;padding:8px 12px;"><span style="font-size:11px;font-weight:700;color:'+statusColor+';">'+statusBadge+'</span></td>'
      +'</tr>';
  }).join('');
  var celdaTotDia=fechas.map(function(f){
    var v=totalsDia[f];
    return '<td style="text-align:right;font-family:var(--font-mono);font-size:12px;padding:8px 10px;font-weight:700;color:var(--text2);">'+(v>0?v.toLocaleString('es-ES',{minimumFractionDigits:2})+'€':'—')+'</td>';
  }).join('');
  var nCumplen=usuarios.filter(function(u){ return porUsuario[u].totalBruto>=_infSalaObjSem; }).length;
  var pctCump=usuarios.length?Math.round(nCumplen/usuarios.length*100):0;
  var mediaProd=usuarios.length?totalGeneral/usuarios.length:0;
  var nCam=usuarios.length;
  var kpiBox=function(label,val,color){
    return '<div style="flex:1;min-width:130px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center;">'
      +'<div style="font-size:10px;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;">'+label+'</div>'
      +'<div style="font-size:17px;font-weight:700;font-family:var(--font-mono);color:'+color+';">'+val+'</div>'
      +'</div>';
  };
  // Banner de matches fuzzy
  var matchBanner='';
  if(matchLog&&matchLog.length){
    matchBanner='<div style="margin-bottom:12px;padding:8px 12px;background:rgba(245,158,11,.1);border:1px solid var(--amber);border-radius:6px;font-size:11px;color:var(--amber);font-family:var(--font-mono);">'
      +'⚠ '+matchLog.length+' nombre(s) ajustado(s) por coincidencia aproximada: '+matchLog.map(_escHtml).join(' · ')
      +'</div>';
  }
  el.innerHTML=matchBanner
    +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'
    +  '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text3);">📅 Periodo: <strong style="color:var(--text2);">'+rangoLabel+'</strong> &nbsp;·&nbsp; '+nCam+' camarero'+(nCam===1?'':'s')+'</div>'
    +  '<button onclick="window._infSalaData=null;_infRenderSubTab()" style="background:var(--bg4);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:11px;font-family:var(--font-mono);padding:5px 12px;cursor:pointer;">✕ Nuevo CSV</button>'
    +'</div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">'
    +  kpiBox('Producción total',totalGeneral.toLocaleString('es-ES',{minimumFractionDigits:2})+'€','var(--amber)')
    +  kpiBox('Media por camarero',mediaProd.toLocaleString('es-ES',{minimumFractionDigits:2})+'€','var(--text)')
    +  kpiBox('Cumplen objetivo',nCumplen+' / '+nCam,nCumplen===nCam?'var(--green)':'var(--red)')
    +  kpiBox('% cumplimiento',pctCump+'%',pctCump>=80?'var(--green)':pctCump>=50?'var(--amber)':'var(--red)')
    +'</div>'
    +'<div style="overflow-x:auto;">'
    +  '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px;">'
    +    '<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">Camarero</th>'
    +      thFechas
    +      '<th style="text-align:right;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--amber);">Total</th>'
    +      '<th style="text-align:center;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">Obj. '+_infSalaObjSem.toLocaleString('es-ES',{maximumFractionDigits:0})+'€</th>'
    +    '</tr></thead>'
    +    '<tbody>'+rows
    +      '<tr style="background:var(--bg2);border-top:2px solid var(--border2);">'
    +        '<td style="padding:10px 12px;font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">TOTAL</td>'
    +        celdaTotDia
    +        '<td style="text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;padding:10px 12px;color:var(--amber);">'+totalGeneral.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
    +        '<td></td>'
    +      '</tr>'
    +    '</tbody></table>'
    +'</div>'
    +'<div style="margin-top:14px;padding:10px 14px;background:var(--bg2);border-radius:6px;border-left:3px solid var(--amber);font-size:11px;color:var(--text3);line-height:1.7;">'
    +  '📌 Producción bruta (IVA incluido) · Excluye cancelaciones y total ≤ 0 € · '
    +  'Obj. semana: <strong style="color:var(--amber);">'+_infSalaObjSem.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</strong> · '
    +  'Obj. mes: <strong style="color:var(--amber);">'+_infSalaObjMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</strong> · '
    +  '~ = nombre ajustado por coincidencia aproximada con BD'
    +'</div>';
}

// ══════════════════════════════════════════════════════════════════════
// TAB: INFORME DE JEFE (dept_reports — igual que antes)
// ══════════════════════════════════════════════════════════════════════
async function _renderInformeJefe(el){
  if(_infJefeMode==='nuevo'||_infJefeEditId) return _renderInformeJefeForm(el);
  if(_infJefeMode==='ver'&&_infJefeViewId)   return _renderInformeJefeDetalle(el);
  return _renderInformeJefeLista(el);
}

async function _renderInformeJefeLista(el){
  el.innerHTML='<div class="card"><p style="color:var(--text3);">Cargando informes…</p></div>';
  var depts=_infDeptosDelJefe(currentUser);
  var isAdmin_=typeof canActAsAdmin==='function'&&canActAsAdmin(currentUser);
  try {
    var url=SUPABASE_URL+'/rest/v1/dept_reports?select=*&order=ts.desc&limit=50';
    if(!isAdmin_&&depts.length) url+='&departamento=in.('+depts.map(encodeURIComponent).join(',')+')';
    var res=await fetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) throw new Error('HTTP '+res.status);
    _infJefeList=await res.json();
  } catch(e){
    el.innerHTML='<div class="card"><p style="color:var(--red);">Error: '+_escHtml(e.message)+'</p></div>';
    return;
  }
  var rows=(_infJefeList||[]).map(function(r){
    var fmtTs=r.ts?r.ts.slice(0,10).split('-').reverse().join('/')+' '+r.ts.slice(11,16):'—';
    var estB=r.estado==='publicado'
      ?'<span style="background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">PUBLICADO</span>'
      :'<span style="background:var(--bg3);color:var(--text3);border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">BORRADOR</span>';
    return '<tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="window._infOpenVer(\''+r.id+'\')">'
      +'<td style="padding:10px 12px;font-size:12px;color:var(--text3);font-family:var(--font-mono);">'+fmtTs+'</td>'
      +'<td style="padding:10px 12px;font-size:13px;font-weight:600;color:var(--text);">'+(INF_DEPT_LABELS[r.departamento]||r.departamento||'—')+'</td>'
      +'<td style="padding:10px 12px;"><span style="background:var(--bg4);color:var(--text2);border-radius:4px;padding:2px 7px;font-size:10px;">'+(r.tipo||'—')+'</span></td>'
      +'<td style="padding:10px 12px;font-size:12px;color:var(--text2);">'+(r.periodo||'—')+'</td>'
      +'<td style="padding:10px 12px;font-size:12px;color:var(--text3);">'+_escHtml(r.autor||'—')+'</td>'
      +'<td style="padding:10px 12px;">'+estB+'</td>'
      +'<td style="padding:10px 12px;text-align:right;">'
      +(r.estado==='borrador'?'<button onclick="event.stopPropagation();window._infOpenEditar(\''+r.id+'\')" style="background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:11px;padding:4px 10px;cursor:pointer;margin-right:4px;">✏ Editar</button>':'')
      +'</td></tr>';
  }).join('');
  el.innerHTML=''
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
    +  '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);">'+(_infJefeList.length)+' informe'+(_infJefeList.length===1?'':'s')+'</div>'
    +  '<button onclick="window._infOpenNuevo()" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:700;font-family:var(--font-mono);cursor:pointer;">+ Nuevo informe</button>'
    +'</div>'
    +'<div class="card" style="padding:0;overflow:hidden;"><div style="overflow-x:auto;">'
    +  '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +    '<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Fecha</th>'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Dpto.</th>'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Tipo</th>'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Periodo</th>'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Autor</th>'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Estado</th>'
    +      '<th></th>'
    +    '</tr></thead>'
    +    '<tbody>'+(rows||'<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text3);">Sin informes todavía</td></tr>')+'</tbody>'
    +  '</table></div></div>';
}

window._infOpenNuevo  =function(){ _infJefeMode='nuevo';_infJefeEditId=null;_infJefeViewId=null;renderInformes(); };
window._infOpenEditar =function(id){ _infJefeMode='nuevo';_infJefeEditId=id;_infJefeViewId=null;renderInformes(); };
window._infOpenVer    =function(id){ _infJefeMode='ver';_infJefeViewId=id;_infJefeEditId=null;renderInformes(); };
window._infVolverLista=function(){ _infJefeMode='lista';_infJefeEditId=null;_infJefeViewId=null;renderInformes(); };

async function _renderInformeJefeForm(el){
  var depts=_infDeptosDelJefe(currentUser),existing=null;
  if(_infJefeEditId){
    existing=(_infJefeList||[]).find(function(r){ return r.id===_infJefeEditId; });
    if(!existing){
      try {
        var res=await fetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(_infJefeEditId)+'&select=*',{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
        if(res.ok){ var arr=await res.json();existing=arr[0]||null; }
      } catch(e){}
    }
  }
  var cj=(existing&&existing.contenido_json)?existing.contenido_json:{};
  var deptOpts=depts.map(function(d){
    var sel=(existing&&existing.departamento===d)?' selected':(!existing&&depts.length===1?' selected':'');
    return '<option value="'+_escHtml(d)+'"'+sel+'>'+(INF_DEPT_LABELS[d]||d)+'</option>';
  }).join('');
  var tipoOpts=['semanal','mensual','evento'].map(function(t){
    return '<option value="'+t+'"'+(existing&&existing.tipo===t?' selected':'')+'>'+t.charAt(0).toUpperCase()+t.slice(1)+'</option>';
  }).join('');

  // Plantilla RR.HH. existente
  var plantillaRrhh=cj.plantilla_rrhh||[];

  el.innerHTML=''
    +'<div class="card">'
    +  '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">'
    +    '<button onclick="window._infVolverLista()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:12px;padding:6px 12px;cursor:pointer;">← Volver</button>'
    +    '<div style="font-family:var(--font-mono);font-weight:700;font-size:14px;color:var(--text);">'+(_infJefeEditId?'Editar informe':'Nuevo informe de jefe')+'</div>'
    +  '</div>'
    +  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:16px;">'
    +    '<div class="fg"><label>Departamento</label><select id="inf-f-dept" onchange="window._infLoadRrhhRows()">'+deptOpts+'</select></div>'
    +    '<div class="fg"><label>Tipo</label><select id="inf-f-tipo">'+tipoOpts+'</select></div>'
    +    '<div class="fg"><label>Periodo</label><input id="inf-f-periodo" type="text" placeholder="Semana 24 · 2026" value="'+_escHtml(existing?existing.periodo||'':'')+'"></div>'
    +  '</div>'
    +  '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;">📊 KPIs del periodo</div>'
    +  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:18px;">'
    +    _infNumField('inf-f-ventas','Ventas €',cj.ventas)
    +    _infNumField('inf-f-covers','Covers / pax',cj.covers)
    +    _infNumField('inf-f-ticket-med','Ticket medio €',cj.ticket_medio)
    +    _infNumField('inf-f-labor-pct','Labor cost %',cj.labor_pct)
    +    _infNumField('inf-f-fios','FIO activos',cj.fios_activos)
    +    _infNumField('inf-f-ocup','Ocupación hotel % (manual)',cj.ocupacion_hotel)
    +  '</div>'
    +  '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;">📝 Resumen operativo</div>'
    +  '<textarea id="inf-f-resumen" rows="4" placeholder="Incidencias relevantes, cambios de equipo, eventos especiales…" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:10px 12px;font-size:13px;font-family:var(--font-ui);resize:vertical;">'+_escHtml(cj.resumen||'')+'</textarea>'
    +  '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;margin-top:18px;">👤 Evaluación manual de empleados <span style="font-weight:400;text-transform:none;color:var(--text3);font-size:10px;">(opcional)</span></div>'
    +  '<textarea id="inf-f-eval" rows="3" placeholder="García: buen rendimiento · Martínez: ausencia no justificada" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:10px 12px;font-size:13px;font-family:var(--font-ui);resize:vertical;">'+_escHtml(cj.evaluacion_empleados||'')+'</textarea>'

    // ── BLOQUE RR.HH. ──
    +  '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;margin-top:18px;">🏥 Estado RR.HH. del equipo</div>'
    +  '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;">Indica quién está de baja médica o vacaciones. Esta información se usará para la previsión de turnos y el cálculo de incentivos.</div>'
    +  '<div id="inf-rrhh-rows" style="margin-bottom:10px;"></div>'
    +  '<button onclick="window._infAddRrhhRow()" style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:11px;padding:6px 12px;cursor:pointer;font-family:var(--font-mono);">+ Añadir empleado</button>'

    +  '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;margin-top:18px;">📅 Previsión semana siguiente</div>'
    +  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px;">'
    +    _infNumField('inf-f-ocup-sig','Ocupación prevista % (manual → MEWS)',cj.ocupacion_semana_siguiente)
    +    '<div class="fg"><label>Eventos especiales</label><input id="inf-f-eventos" type="text" placeholder="Grupo 40 pax viernes · Boda sábado" value="'+_escHtml(cj.eventos_semana_siguiente||'')+'"></div>'
    +  '</div>'
    +  '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;">📁 Justificación para dirección</div>'
    +  '<textarea id="inf-f-just" rows="3" placeholder="Justificación de gastos extraordinarios, desviaciones…" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:10px 12px;font-size:13px;font-family:var(--font-ui);resize:vertical;">'+_escHtml(cj.justificacion||'')+'</textarea>'
    +  '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px;">'
    +    '<button onclick="window._infGuardarInforme(\'borrador\')" style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:12px;font-weight:600;padding:9px 18px;cursor:pointer;font-family:var(--font-mono);">💾 Guardar borrador</button>'
    +    '<button onclick="window._infGuardarInforme(\'publicado\')" style="background:var(--accent);border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:700;padding:9px 18px;cursor:pointer;font-family:var(--font-mono);">📤 Publicar informe</button>'
    +  '</div>'
    +'</div>';

  // Cargar filas RR.HH. con empleados del dept
  window._infRrhhRows = plantillaRrhh.length ? plantillaRrhh.slice() : [];
  await window._infLoadRrhhRows();
}

// Carga empleados del dept seleccionado y renderiza filas RR.HH.
window._infLoadRrhhRows = async function(){
  var dept=(document.getElementById('inf-f-dept')||{}).value||'';
  var employees=await _infGetEmployees();
  var empDept=(employees||[]).filter(function(e){
    return e.estado==='Activo'&&(e.area===dept||(dept==='FnB'&&(e.area==='Sala'||e.area==='Cocina')));
  });
  window._infEmpDept=empDept;
  _infRenderRrhhRows();
};

window._infAddRrhhRow=function(){
  if(!window._infRrhhRows) window._infRrhhRows=[];
  window._infRrhhRows.push({employee_id:'',nombre:'',tipo:'baja_medica',fecha_inicio:'',fecha_fin:'',notas:''});
  _infRenderRrhhRows();
};

window._infRemoveRrhhRow=function(idx){
  if(window._infRrhhRows) window._infRrhhRows.splice(idx,1);
  _infRenderRrhhRows();
};

function _infRenderRrhhRows(){
  var el=document.getElementById('inf-rrhh-rows');
  if(!el) return;
  var rows=window._infRrhhRows||[];
  var emps=window._infEmpDept||[];
  var empOpts='<option value="">— Seleccionar —</option>'
    +emps.map(function(e){ return '<option value="'+_escHtml(e.id)+'">'+_escHtml(e.nombre)+'</option>'; }).join('');

  if(!rows.length){
    el.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0;">Sin registros. Pulsa "+ Añadir empleado" si hay bajas o vacaciones.</div>';
    return;
  }
  el.innerHTML=rows.map(function(r,i){
    var selEmp=emps.length?'<select onchange="window._infRrhhRows['+i+'].employee_id=this.value;window._infRrhhRows['+i+'].nombre=this.options[this.selectedIndex].text" style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:6px 8px;font-size:12px;">'+empOpts.replace('value="'+r.employee_id+'"','value="'+r.employee_id+'" selected')+'</select>'
      :'<input type="text" placeholder="Nombre" value="'+_escHtml(r.nombre)+'" onchange="window._infRrhhRows['+i+'].nombre=this.value" style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:6px 8px;font-size:12px;">';
    return '<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 2fr auto;gap:8px;align-items:center;margin-bottom:8px;padding:8px 10px;background:var(--bg3);border-radius:6px;">'
      +selEmp
      +'<select onchange="window._infRrhhRows['+i+'].tipo=this.value" style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:6px 8px;font-size:12px;">'
      +  '<option value="baja_medica"'+(r.tipo==='baja_medica'?' selected':'')+'>🏥 Baja médica</option>'
      +  '<option value="vacaciones"'+(r.tipo==='vacaciones'?' selected':'')+'>🌴 Vacaciones</option>'
      +'</select>'
      +'<input type="date" value="'+_escHtml(r.fecha_inicio||'')+'" onchange="window._infRrhhRows['+i+'].fecha_inicio=this.value" style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:6px 8px;font-size:12px;">'
      +'<input type="date" value="'+_escHtml(r.fecha_fin||'')+'" placeholder="En curso" onchange="window._infRrhhRows['+i+'].fecha_fin=this.value" style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:6px 8px;font-size:12px;">'
      +'<input type="text" placeholder="Notas" value="'+_escHtml(r.notas||'')+'" onchange="window._infRrhhRows['+i+'].notas=this.value" style="background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:6px 8px;font-size:12px;">'
      +'<button onclick="window._infRemoveRrhhRow('+i+')" style="background:transparent;border:none;color:var(--red);font-size:16px;cursor:pointer;padding:0 4px;">✕</button>'
      +'</div>';
  }).join('');
}

function _infNumField(id,label,val){
  return '<div class="fg"><label>'+label+'</label>'
    +'<input id="'+id+'" type="number" step="0.01" min="0" placeholder="—" '
    +'value="'+(val!=null&&val!==''?val:'')+'" '
    +'style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:8px 10px;font-size:13px;width:100%;box-sizing:border-box;">'
    +'</div>';
}

window._infGuardarInforme=async function(estado){
  var dept=(document.getElementById('inf-f-dept')||{}).value||'';
  var tipo=(document.getElementById('inf-f-tipo')||{}).value||'semanal';
  var periodo=(document.getElementById('inf-f-periodo')||{}).value.trim()||'';
  if(!dept){ toast('Selecciona un departamento','err'); return; }
  if(!periodo){ toast('Indica el periodo del informe','err'); return; }
  var deptsProp=_infDeptosDelJefe(currentUser);
  var isAdmin_=typeof canActAsAdmin==='function'&&canActAsAdmin(currentUser);
  if(!isAdmin_&&deptsProp.indexOf(dept)<0){ toast('No puedes cargar informes de '+dept,'err'); return; }
  var g=function(id){ var el=document.getElementById(id); return el?el.value.trim():''; };
  var n=function(id){ var v=parseFloat(g(id)); return isNaN(v)?null:v; };

  // Guardar RR.HH. en employee_status si hay filas
  var plantillaRrhh=window._infRrhhRows||[];
  if(plantillaRrhh.length&&estado==='publicado'){
    for(var i=0;i<plantillaRrhh.length;i++){
      var row=plantillaRrhh[i];
      if(!row.fecha_inicio) continue;
      var empId=row.employee_id||null;
      if(!empId&&row.nombre){
        var emps=window._infEmpDept||[];
        var found=emps.find(function(e){ return e.nombre===row.nombre; });
        empId=found?found.id:null;
      }
      if(!empId) continue;
      try {
        var sid='es_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
        await fetch(SUPABASE_URL+'/rest/v1/employee_status',{
          method:'POST',
          headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
          body:JSON.stringify({
            id:sid,employee_id:empId,tipo:row.tipo,
            fecha_inicio:row.fecha_inicio,fecha_fin:row.fecha_fin||null,
            notas:row.notas||'',creado_por:currentUser.nombre||currentUser.id,ts:localTs()
          })
        });
      } catch(e){}
    }
    invalidateCache('employee_status');
  }

  var payload={
    ts:localTs(),autor:currentUser.nombre||currentUser.id,rol:currentUser.rol||'',
    departamento:dept,tipo:tipo,periodo:periodo,estado:estado,
    contenido_json:{
      ventas:n('inf-f-ventas'),covers:n('inf-f-covers'),ticket_medio:n('inf-f-ticket-med'),
      labor_pct:n('inf-f-labor-pct'),fios_activos:n('inf-f-fios'),ocupacion_hotel:n('inf-f-ocup'),
      resumen:g('inf-f-resumen'),evaluacion_empleados:g('inf-f-eval'),
      ocupacion_semana_siguiente:n('inf-f-ocup-sig'),eventos_semana_siguiente:g('inf-f-eventos'),
      justificacion:g('inf-f-just'),plantilla_rrhh:plantillaRrhh
    }
  };
  try {
    if(_infJefeEditId){
      var pRes=await fetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(_infJefeEditId),
        {method:'PATCH',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload)});
      if(!pRes.ok) throw new Error('HTTP '+pRes.status);
    } else {
      payload.id='inf_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
      var iRes=await fetch(SUPABASE_URL+'/rest/v1/dept_reports',
        {method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload)});
      if(!iRes.ok) throw new Error('HTTP '+iRes.status);
    }
    invalidateCache('dept_reports');
    toast(estado==='publicado'?'Informe publicado ✓':'Borrador guardado ✓','ok');
    _infJefeMode='lista';_infJefeEditId=null;_infJefeList=[];
    renderInformes();
  } catch(e){ toast('Error al guardar: '+e.message,'err'); }
};

async function _renderInformeJefeDetalle(el){
  var r=(_infJefeList||[]).find(function(x){ return x.id===_infJefeViewId; });
  if(!r){
    try {
      var res=await fetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(_infJefeViewId)+'&select=*',{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
      if(res.ok){ var arr=await res.json();r=arr[0]||null; }
    } catch(e){}
  }
  if(!r){ el.innerHTML='<div class="card"><p style="color:var(--red);">Informe no encontrado.</p></div>'; return; }
  var cj=r.contenido_json||{};
  var fmtTs=r.ts?r.ts.slice(0,10).split('-').reverse().join('/')+' '+r.ts.slice(11,16):'—';
  var kpi=function(label,val,unit){
    if(val==null||val==='') return '';
    return '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px 14px;min-width:130px;">'
      +'<div style="font-size:10px;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px;">'+label+'</div>'
      +'<div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--text);">'+val+(unit?' <span style="font-size:11px;color:var(--text3);">'+unit+'</span>':'')+'</div>'
      +'</div>';
  };
  var sec=function(t){ return '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin:20px 0 10px;">'+t+'</div>'; };
  var txt=function(v){ return v?'<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:12px 14px;font-size:13px;color:var(--text);line-height:1.6;white-space:pre-wrap;">'+_escHtml(v)+'</div>':'<p style="color:var(--text3);font-size:13px;">—</p>'; };

  // RR.HH. tabla
  var rrhhBlock='';
  if(cj.plantilla_rrhh&&cj.plantilla_rrhh.length){
    var rrhhRows=cj.plantilla_rrhh.map(function(r){
      var dias='';
      if(r.fecha_inicio){
        var fin=r.fecha_fin?new Date(r.fecha_fin):new Date();
        var ini=new Date(r.fecha_inicio);
        dias=Math.round((fin-ini)/86400000)+' días';
      }
      return '<tr style="border-bottom:1px solid var(--border);">'
        +'<td style="padding:8px 12px;font-size:13px;font-weight:600;">'+_escHtml(r.nombre||r.employee_id||'—')+'</td>'
        +'<td style="padding:8px 12px;">'+(r.tipo==='baja_medica'?'🏥 Baja médica':'🌴 Vacaciones')+'</td>'
        +'<td style="padding:8px 12px;font-family:var(--font-mono);font-size:12px;">'+(r.fecha_inicio||'—')+'</td>'
        +'<td style="padding:8px 12px;font-family:var(--font-mono);font-size:12px;">'+(r.fecha_fin||'En curso')+'</td>'
        +'<td style="padding:8px 12px;font-family:var(--font-mono);font-size:12px;color:var(--accent);">'+dias+'</td>'
        +'<td style="padding:8px 12px;font-size:11px;color:var(--text3);">'+_escHtml(r.notas||'')+'</td>'
        +'</tr>';
    }).join('');
    rrhhBlock=sec('🏥 Estado RR.HH. del equipo')
      +'<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
      +'<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Empleado</th>'
      +'<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Tipo</th>'
      +'<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Desde</th>'
      +'<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Hasta</th>'
      +'<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Días</th>'
      +'<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Notas</th>'
      +'</tr></thead><tbody>'+rrhhRows+'</tbody></table></div>';
  }

  el.innerHTML=''
    +'<div class="card">'
    +  '<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap;">'
    +    '<button onclick="window._infVolverLista()" style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:12px;padding:6px 12px;cursor:pointer;">← Volver</button>'
    +    '<div><div style="font-family:var(--font-mono);font-weight:700;font-size:15px;color:var(--text);">'+(INF_DEPT_LABELS[r.departamento]||r.departamento)+'</div>'
    +       '<div style="font-size:11px;color:var(--text3);">'+fmtTs+' · '+_escHtml(r.autor||'')+'  · '+_escHtml(r.tipo||'')+'</div></div>'
    +    '<span style="margin-left:auto;'+(r.estado==='publicado'?'background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green);':'background:var(--bg3);color:var(--text3);border:1px solid var(--border);')+'border-radius:5px;padding:3px 10px;font-size:10px;font-weight:700;font-family:var(--font-mono);">'+(r.estado||'borrador').toUpperCase()+'</span>'
    +  '</div>'
    +  sec('📊 KPIs del periodo — '+_escHtml(r.periodo||''))
    +  '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
    +    kpi('Ventas',cj.ventas!=null?cj.ventas.toLocaleString('es-ES',{minimumFractionDigits:2}):'','€')
    +    kpi('Covers',cj.covers,'pax')
    +    kpi('Ticket medio',cj.ticket_medio!=null?cj.ticket_medio.toLocaleString('es-ES',{minimumFractionDigits:2}):'','€')
    +    kpi('Labor cost',cj.labor_pct,'%')
    +    kpi('FIO activos',cj.fios_activos,'')
    +    kpi('Ocupación hotel',cj.ocupacion_hotel,'%')
    +  '</div>'
    +  sec('📝 Resumen operativo')+txt(cj.resumen)
    +  (cj.evaluacion_empleados?sec('👤 Evaluación empleados')+txt(cj.evaluacion_empleados):'')
    +  rrhhBlock
    +  (cj.ocupacion_semana_siguiente!=null||cj.eventos_semana_siguiente
      ?sec('📅 Previsión semana siguiente')+'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">'+kpi('Ocupación prevista',cj.ocupacion_semana_siguiente,'%')+'</div>'+(cj.eventos_semana_siguiente?txt(cj.eventos_semana_siguiente):'')
      :'')
    +  (cj.justificacion?sec('📁 Justificación para dirección')+txt(cj.justificacion):'')
    +  (r.estado==='borrador'
      ?'<div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px;">'
      +  '<button onclick="window._infOpenEditar(\''+r.id+'\')" style="background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text2);font-size:12px;padding:8px 16px;cursor:pointer;font-family:var(--font-mono);">✏ Editar borrador</button>'
      +  '<button onclick="window._infPublicarDesdeVer(\''+r.id+'\')" style="background:var(--accent);border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:700;padding:8px 16px;cursor:pointer;font-family:var(--font-mono);">📤 Publicar</button>'
      +'</div>'
      :'')
    +'</div>';
}

window._infPublicarDesdeVer=async function(id){
  try {
    var res=await fetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(id),
      {method:'PATCH',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
       body:JSON.stringify({estado:'publicado',ts:localTs()})});
    if(!res.ok) throw new Error('HTTP '+res.status);
    invalidateCache('dept_reports');
    toast('Informe publicado ✓','ok');
    _infJefeMode='lista';_infJefeList=[];
    renderInformes();
  } catch(e){ toast('Error al publicar: '+e.message,'err'); }
};

// ══════════════════════════════════════════════════════════════════════
// TAB: RR.HH. — employee_status + sugerencias vacaciones
// ══════════════════════════════════════════════════════════════════════
async function _renderRRHH(el){
  el.innerHTML='<div class="card"><p style="color:var(--text3);">Cargando datos RR.HH.…</p></div>';

  var depts=_infDeptosDelJefe(currentUser);
  var isAdmin_=typeof canActAsAdmin==='function'&&canActAsAdmin(currentUser);
  var employees=await _infGetEmployees();
  var empFiltro=isAdmin_?employees:employees.filter(function(e){ return depts.indexOf(e.area)>=0; });
  empFiltro=empFiltro.filter(function(e){ return e.estado==='Activo'; });

  // Cargar employee_status activos (sin fecha_fin o fecha_fin >= hoy)
  var hoy=today();
  var statusAll=[];
  try {
    var sRes=await fetch(
      SUPABASE_URL+'/rest/v1/employee_status?select=*&order=fecha_inicio.desc',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    );
    if(sRes.ok) statusAll=await sRes.json();
  } catch(e){}

  // Estado actual por empleado (último registro activo)
  var estadoActual={};
  (statusAll||[]).forEach(function(s){
    if(!estadoActual[s.employee_id]&&(!s.fecha_fin||s.fecha_fin>=hoy)){
      estadoActual[s.employee_id]=s;
    }
  });

  // Cargar shifts últimos 90 días para sugerencias vacaciones
  var desde90=new Date(); desde90.setDate(desde90.getDate()-90);
  var desde90str=desde90.getFullYear()+'-'+String(desde90.getMonth()+1).padStart(2,'0')+'-'+String(desde90.getDate()).padStart(2,'0');
  var allShifts=[];
  try { allShifts=await getDB('shifts'); } catch(e){}
  var shifts90=allShifts.filter(function(s){ return s.fecha>=desde90str&&s.estado!=='En corrección'; });

  // Días trabajados por empleado (nombre → array fechas únicas)
  var diasPorEmp={};
  shifts90.forEach(function(s){
    if(!s.nombre) return;
    if(!diasPorEmp[s.nombre]) diasPorEmp[s.nombre]=[];
    if(diasPorEmp[s.nombre].indexOf(s.fecha)<0) diasPorEmp[s.nombre].push(s.fecha);
  });

  // Sugerencia de vacaciones: detectar racha larga sin descanso ≥2 días consecutivos
  function calcRacha(fechas){
    if(!fechas||!fechas.length) return 0;
    var sorted=fechas.slice().sort();
    var maxRacha=1,racha=1;
    for(var i=1;i<sorted.length;i++){
      var prev=new Date(sorted[i-1]),curr=new Date(sorted[i]);
      var diff=Math.round((curr-prev)/86400000);
      if(diff===1){ racha++; maxRacha=Math.max(maxRacha,racha); }
      else if(diff>=2){ racha=1; } // descanso ≥2 días → reset racha
      else { racha++; } // mismo día o 0 diff (datos duplicados) — ignorar
    }
    return maxRacha;
  }

  // Días de baja acumulados por empleado (historial completo)
  var diasBajaPorEmp={};
  (statusAll||[]).filter(function(s){ return s.tipo==='baja_medica'; }).forEach(function(s){
    var ini=new Date(s.fecha_inicio);
    var fin=s.fecha_fin?new Date(s.fecha_fin):new Date();
    var dias=Math.max(0,Math.round((fin-ini)/86400000));
    diasBajaPorEmp[s.employee_id]=(diasBajaPorEmp[s.employee_id]||0)+dias;
  });

  // Construir tabla
  var badgeTipo=function(tipo){
    if(tipo==='baja_medica') return '<span style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid var(--red);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">🏥 BAJA MÉDICA</span>';
    if(tipo==='vacaciones')  return '<span style="background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">🌴 VACACIONES</span>';
    return '<span style="background:var(--bg3);color:var(--text3);border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;">✅ ACTIVO</span>';
  };

  var sugerencias=[];
  var rows=empFiltro.map(function(e){
    var st=estadoActual[e.id];
    var tipo=st?st.tipo:'activo';
    var desde=st?st.fecha_inicio:'—';
    var hasta=st?(st.fecha_fin||'En curso'):'—';
    var diasBaja=diasBajaPorEmp[e.id]||0;
    var fechasTrab=diasPorEmp[e.nombre]||[];
    var racha=calcRacha(fechasTrab);
    // Sugerencia: 5+2 → racha ≥35 días sin descanso de 2; 6+1 → racha ≥42
    var sugVac='';
    if(tipo==='activo'&&racha>=35){
      sugVac='⚠ '+racha+' días consecutivos sin descanso ≥2 días';
      sugerencias.push({nombre:e.nombre,area:e.area,racha:racha,msg:sugVac});
    } else if(tipo==='activo'&&racha>=28){
      sugVac='ℹ '+racha+' días — vigilar descanso';
    }
    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:9px 12px;font-size:13px;font-weight:600;">'+_escHtml(e.nombre)+'</td>'
      +'<td style="padding:9px 12px;font-size:12px;color:var(--text3);">'+_escHtml(e.area||'—')+'</td>'
      +'<td style="padding:9px 12px;">'+badgeTipo(tipo)+'</td>'
      +'<td style="padding:9px 12px;font-family:var(--font-mono);font-size:12px;">'+_escHtml(String(desde))+'</td>'
      +'<td style="padding:9px 12px;font-family:var(--font-mono);font-size:12px;">'+_escHtml(String(hasta))+'</td>'
      +'<td style="padding:9px 12px;font-family:var(--font-mono);font-size:12px;color:'+(diasBaja>30?'var(--red)':diasBaja>14?'var(--amber)':'var(--text3)')+';">'+(diasBaja>0?diasBaja+' días':'—')+'</td>'
      +'<td style="padding:9px 12px;font-size:11px;color:'+(racha>=35?'var(--red)':racha>=28?'var(--amber)':'var(--text3)')+';">'+sugVac+'</td>'
      +'</tr>';
  }).join('');

  // Banner sugerencias
  var sugBanner='';
  if(sugerencias.length){
    sugBanner='<div style="margin-bottom:16px;padding:12px 16px;background:rgba(245,158,11,.1);border:1px solid var(--amber);border-radius:8px;">'
      +'<div style="font-family:var(--font-mono);font-weight:700;font-size:12px;color:var(--amber);margin-bottom:8px;">⚠ SUGERENCIAS DE VACACIONES</div>'
      +sugerencias.map(function(s){
        return '<div style="font-size:12px;color:var(--text2);margin-bottom:4px;">· <strong>'+_escHtml(s.nombre)+'</strong> ('+_escHtml(s.area||'—')+') — '+_escHtml(s.msg)+'</div>';
      }).join('')
      +'<div style="font-size:10px;color:var(--text3);margin-top:6px;">Patrón 5+2: alerta ≥35 días consecutivos sin descanso de ≥2 días · Patrón 6+1: alerta ≥42 días</div>'
      +'</div>';
  }

  // KPIs RR.HH.
  var nBajas=Object.values(estadoActual).filter(function(s){ return s.tipo==='baja_medica'; }).length;
  var nVac=Object.values(estadoActual).filter(function(s){ return s.tipo==='vacaciones'; }).length;
  var nActivos=empFiltro.length-nBajas-nVac;

  function kpiRrhh(label,val,color){
    return '<div style="flex:1;min-width:120px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center;">'
      +'<div style="font-size:10px;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px;">'+label+'</div>'
      +'<div style="font-size:22px;font-weight:700;font-family:var(--font-mono);color:'+color+';">'+val+'</div>'
      +'</div>';
  }

  el.innerHTML=''
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">'
    +  kpiRrhh('Activos',nActivos,'var(--green)')
    +  kpiRrhh('Baja médica',nBajas,'var(--red)')
    +  kpiRrhh('Vacaciones',nVac,'var(--amber)')
    +  kpiRrhh('Total equipo',empFiltro.length,'var(--text)')
    +'</div>'
    +sugBanner
    +'<div class="card" style="padding:0;overflow:hidden;"><div style="overflow-x:auto;">'
    +  '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +  '<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    +    '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Empleado</th>'
    +    '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Dpto.</th>'
    +    '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Estado</th>'
    +    '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Desde</th>'
    +    '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Hasta</th>'
    +    '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Días baja</th>'
    +    '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Sugerencia</th>'
    +  '</tr></thead>'
    +  '<tbody>'+(rows||'<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text3);">Sin empleados en este departamento</td></tr>')+'</tbody>'
    +  '</table></div></div>'
    +'<div style="margin-top:12px;padding:8px 12px;background:var(--bg2);border-radius:5px;font-size:10px;color:var(--text3);font-family:var(--font-mono);">'
    +  '📌 Días baja = total histórico acumulado en employee_status · Sugerencias calculadas desde shifts últimos 90 días'
    +'</div>';
}

// ── Helpers públicos ──────────────────────────────────────────────────
window.infGetUltimoPublicado=async function(departamento){
  try {
    var url=SUPABASE_URL+'/rest/v1/dept_reports?departamento=eq.'+encodeURIComponent(departamento)+'&estado=eq.publicado&order=ts.desc&limit=1&select=*';
    var res=await fetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) return null;
    var arr=await res.json();
    return arr[0]||null;
  } catch(e){ return null; }
};
window.infGetPublicados=async function(departamento,limite){
  limite=limite||10;
  try {
    var url=SUPABASE_URL+'/rest/v1/dept_reports?departamento=eq.'+encodeURIComponent(departamento)+'&estado=eq.publicado&order=ts.desc&limit='+limite+'&select=*';
    var res=await fetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) return [];
    return await res.json();
  } catch(e){ return []; }
};
// Devuelve empleados disponibles (excluye bajas/vacaciones activas) para un dept
window.infGetDisponibles=async function(departamento){
  try {
    var employees=await _infGetEmployees();
    var hoy=today();
    var sRes=await fetch(SUPABASE_URL+'/rest/v1/employee_status?select=employee_id,tipo,fecha_fin',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    var statusAll=sRes.ok?await sRes.json():[];
    var noDisp=new Set();
    (statusAll||[]).forEach(function(s){
      if(s.tipo!=='activo'&&(!s.fecha_fin||s.fecha_fin>=hoy)) noDisp.add(s.employee_id);
    });
    var valAreas=(typeof _dashDeptSet==='function')?_dashDeptSet(departamento):[departamento];
    return employees.filter(function(e){
      return e.estado==='Activo'&&!noDisp.has(e.id)&&(valAreas.indexOf(e.area)>=0||e.area===departamento);
    });
  } catch(e){ return []; }
};

// ══════════════════════════════════════════════════════════════════════
// TAB ENTRENADORES · Producción + Incentivos desde export VirtuGym (CSV)
// Fuente DEFINITIVA del incentivo (la sube el jefe). El autorreporte del
// entrenador (entrenadores_kpi) NO se usa aquí — vive solo en su perfil.
//
// FLUJO JEFE: VirtuGym exporta .xls → abrir en Excel → Guardar como CSV →
// arrastrar aquí. El parser detecta separador (, o ;) y fecha DD-MM-YYYY.
//
// FACTORES (memorándum sep-2024 + reglas CEO):
//   PT individual (J=1) ...................... x1
//   PT DUO (Entren. personal con J=2) ........ x1.5   (regla CEO, no en memo)
//   PT 30 min ................................ x0.5
//   Clase Piscina PT 50min ................... x1   (PT normal)
//   Valoración funcional (Welcome Fit) ....... x0.5
//   Visbody Test ............................. x0.5
//   Bañera de hielo .......................... x0.5  (regla CEO, no en memo)
//   Clase dirigida efectiva (J>=4) ........... x1
//   Clase dirigida no efectiva (J<=3) ........ x0
//   Carril Piscina / instructor vacío ........ descartar (reserva sin instr.)
//   PT con J=0 ............................... descartar (no-show)
// UMBRAL: 85 sesiones efectivas/mes (desde jul-2025). Extra x10 €.
// PLANES ONLINE: entrada manual del jefe. x6 € cada uno.
// ══════════════════════════════════════════════════════════════════════

var _infEntrData = null;        // resultado del último parseo
var _infEntrPlanes = {};        // { nombreCanonico: nºplanes } entrada manual
var INF_ENTR_UMBRAL = 85;
var INF_ENTR_EUR_SESION = 10;
var INF_ENTR_EUR_PLAN = 6;

// Config de incentivos por entrenador (método). Default: umbral.
// Métodos: 'umbral' | 'precio_hora'
var INF_ENTR_METODO_DEFAULT = 'umbral';
// Horas efectivas por tipo de actividad (solo método precio/hora):
var _INF_HORAS_PH = {
  pt: 1, pt_duo: 1.5, pt_30: 0.5,
  dir_efectiva: 1, dir_no_efectiva: 1,
  val_funcional: 0.5, visbody: 0.5, banera_hielo: 0.5
};
// Config manual por entrenador editada en la pantalla (clave = nombre canónico):
// { metodo, umbral, precio_hora, base_neto }
var _infEntrConfig = {};

// Clasifica una actividad (col F) + créditos (col J) → tipo KPI + factor.
// Devuelve null si la fila debe descartarse.
function _infEntrClasificar(actividad, credits){
  var a = String(actividad||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  var j = parseInt(credits, 10); if(isNaN(j)) j = 0;

  // Descartes: carril piscina (reserva de calle) y nutrición/areas externas sin instructor
  if(/carril+\s*piscina|carrill\s*piscina/.test(a)) return null;

  // Bañera de hielo (solo si hubo reserva real: crédito >= 1)
  if(/banera\s*de\s*hielo/.test(a)){ if(j <= 0) return null; return {kpi:'banera_hielo', factor:0.5, efectiva:true}; }

  // Visbody (solo si hubo reserva real)
  if(/visbody/.test(a)){ if(j <= 0) return null; return {kpi:'visbody', factor:0.5, efectiva:true}; }

  // Valoración funcional / Welcome Fit (solo si hubo reserva real)
  if(/valoracion\s*funcional|welcome\s*fit/.test(a)){ if(j <= 0) return null; return {kpi:'val_funcional', factor:0.5, efectiva:true}; }

  // PT 30 min en piscina (solo si hubo reserva real)
  if(/piscina\s*pt.*30|pt\s*30/.test(a)){ if(j <= 0) return null; return {kpi:'pt_30', factor:0.5, efectiva:true}; }

  // PT 50 min en piscina → PT normal x1
  if(/piscina\s*pt.*50|pt\s*50/.test(a)) {
    if(j <= 0) return null;            // no-show
    return {kpi:'pt', factor:1, efectiva:true};
  }

  // Entrenamiento personal → J decide individual / DUO / no-show
  if(/entrenamiento\s*personal/.test(a)) {
    if(j <= 0) return null;            // no-show, no cuenta
    if(j === 2) return {kpi:'pt_duo', factor:1.5, efectiva:true};
    return {kpi:'pt', factor:1, efectiva:true};   // j=1 (y cualquier otro >0)
  }

  // Resto = clase dirigida (adultos/agua/etc.) → efectiva si J>=4
  if(j >= 4) return {kpi:'dir_efectiva', factor:1, efectiva:true};
  return {kpi:'dir_no_efectiva', factor:0, efectiva:false};
}

// Detecta separador (coma o ;) leyendo la cabecera
function _infDetectSep(headerLine){
  var nComa = (headerLine.match(/,/g)||[]).length;
  var nPyc  = (headerLine.match(/;/g)||[]).length;
  return nPyc > nComa ? ';' : ',';
}

function _csvSplitLineSep(line, sep){
  var cols=[],cur='',inQ=false;
  for(var i=0;i<line.length;i++){
    var c=line[i];
    if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;} else inQ=!inQ; }
    else if(c===sep&&!inQ){ cols.push(cur);cur=''; }
    else { cur+=c; }
  }
  cols.push(cur);
  return cols;
}

// Normaliza fecha DD-MM-YYYY (o DD/MM/YYYY) → YYYY-MM
function _infEntrYM(fechaRaw){
  var s=String(fechaRaw||'').trim();
  var m=s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})/);
  if(m) return m[3]+'-'+m[2];
  var m2=s.match(/^(\d{4})[-\/](\d{2})/);   // por si viene ya YYYY-MM-DD
  if(m2) return m2[1]+'-'+m2[2];
  return '';
}

// Parser principal del CSV de VirtuGym
function _infParseEntrenadores(text, employees){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  var lines=text.split(/\r?\n/);
  if(lines.length<2) throw new Error('CSV vacío');
  var sep=_infDetectSep(lines[0]);
  var header=_csvSplitLineSep(lines[0],sep).map(function(h){return h.trim();});
  var iIdx=function(name){ return header.findIndex(function(h){ return h===name; }); };
  var cFecha=iIdx('Fecha'),cAct=iIdx('Actividad'),cInstr=iIdx('Instructor #1'),
      cCred=iIdx('Credits Deducted');
  if(cFecha<0||cAct<0||cInstr<0||cCred<0)
    throw new Error('Columnas no reconocidas. Necesarias: Fecha, Actividad, Instructor #1, Credits Deducted. ¿Exportaste de VirtuGym y guardaste como CSV?');

  var matchCache={};
  function resolveNombre(raw){
    if(matchCache[raw]===undefined) matchCache[raw]=_infMatchNombre(raw, employees||[]);
    return matchCache[raw];
  }
  function empId(nombre){
    var e=(employees||[]).find(function(x){return x.nombre===nombre;});
    return e?e.id:null;
  }

  var porInstr={}, mesesSet={}, descartadas=0, sinInstr=0, matchLog=[];
  var KPI_KEYS=['dir_efectiva','dir_no_efectiva','pt','pt_duo','pt_30','val_funcional','visbody','banera_hielo'];

  for(var i=1;i<lines.length;i++){
    var line=lines[i];
    if(!line || !line.trim()) continue;
    var cols=_csvSplitLineSep(line,sep);
    if(cols.length<=Math.max(cFecha,cAct,cInstr,cCred)) continue;
    var instrRaw=(cols[cInstr]||'').trim().replace(/\s+/g,' ');
    if(!instrRaw){ sinInstr++; continue; }            // reserva sin instructor
    var cls=_infEntrClasificar(cols[cAct], cols[cCred]);
    if(!cls){ descartadas++; continue; }
    var ym=_infEntrYM(cols[cFecha]);
    if(!ym){ descartadas++; continue; }
    mesesSet[ym]=true;

    var instr=resolveNombre(instrRaw);
    if(instr!==instrRaw && matchLog.indexOf(instrRaw+' → '+instr)<0) matchLog.push(instrRaw+' → '+instr);

    if(!porInstr[instr]){
      porInstr[instr]={nombre:instr, employee_id:empId(instr), csvNombre:instrRaw, kpi:{}, efectivasPond:0, horasPH:0, meses:{}};
      KPI_KEYS.forEach(function(k){ porInstr[instr].kpi[k]=0; });
    }
    var rec=porInstr[instr];
    rec.kpi[cls.kpi]+=1;
    rec.efectivasPond += cls.factor;
    // Horas efectivas para método PRECIO/HORA (tabla por tipo, no por créditos):
    // PT 1h · PT dúo 1.5h · PT30 0.5h · clase (efect/no efect) 1h · val/visbody/bañera 0.5h
    rec.horasPH += (_INF_HORAS_PH[cls.kpi] || 0);
    rec.meses[ym]=(rec.meses[ym]||0)+1;
  }

  var meses=Object.keys(mesesSet).sort();
  var instructores=Object.keys(porInstr).sort(function(a,b){
    return porInstr[b].efectivasPond-porInstr[a].efectivasPond;
  });
  return {instructores, porInstr, meses, descartadas, sinInstr, matchLog,
          ymPrincipal: meses.length?meses[meses.length-1]:''};
}

async function _renderInformesEntrenadores(el){
  el.innerHTML='<div class="card">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">'
    +  '<div>'
    +    '<div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--text);">🏋 Importar producción Entrenadores</div>'
    +    '<div style="font-size:11px;color:var(--text3);margin-top:3px;">Export VirtuGym → guardar como <strong>CSV</strong> → arrastrar aquí</div>'
    +  '</div>'
    +  '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">'
    +    'Umbral: <strong style="color:var(--amber);">'+INF_ENTR_UMBRAL+'</strong> ses./mes'
    +    ' &nbsp;·&nbsp; Sesión extra: <strong style="color:var(--amber);">'+INF_ENTR_EUR_SESION+'€</strong>'
    +    ' &nbsp;·&nbsp; Plan online: <strong style="color:var(--amber);">'+INF_ENTR_EUR_PLAN+'€</strong>'
    +  '</div>'
    +'</div>'
    +'<div id="inf-entr-dropzone" onclick="document.getElementById(\'inf-entr-input\').click()" '
    +  'ondragover="event.preventDefault();this.style.borderColor=\'var(--amber)\'" '
    +  'ondragleave="this.style.borderColor=\'var(--border2)\'" '
    +  'ondrop="window._infEntrHandleDrop(event)" '
    +  'style="border:2px dashed var(--border2);border-radius:10px;padding:36px 24px;text-align:center;cursor:pointer;transition:border-color .2s;margin-bottom:16px;">'
    +  '<div style="font-size:28px;margin-bottom:10px;">📂</div>'
    +  '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text2);font-weight:600;">Arrastra el CSV aquí o haz clic para seleccionar</div>'
    +  '<div style="font-size:11px;color:var(--text3);margin-top:6px;">VirtuGym · Informe de actividades · Rango mensual</div>'
    +'</div>'
    +'<input type="file" id="inf-entr-input" accept=".csv" style="display:none" onchange="window._infEntrLoadCSV(this.files[0])">'
    +'<div id="inf-entr-result"></div>'
    +'</div>';
  if(_infEntrData) _renderEntrTabla(_infEntrData);
}

window._infEntrHandleDrop=function(ev){
  ev.preventDefault();
  var dz=document.getElementById('inf-entr-dropzone');
  if(dz) dz.style.borderColor='var(--border2)';
  var file=ev.dataTransfer&&ev.dataTransfer.files&&ev.dataTransfer.files[0];
  if(file) window._infEntrLoadCSV(file);
};

window._infEntrLoadCSV=function(file){
  if(!file||!file.name.match(/\.csv$/i)){
    toast('Selecciona un .csv. Si tienes .xls, ábrelo en Excel y Guardar como CSV.','err'); return;
  }
  var rdr=new FileReader();
  rdr.onload=async function(e){
    try {
      var employees=await _infGetEmployees();
      var parsed=_infParseEntrenadores(e.target.result, employees);
      parsed.fuente=file.name;
      _infEntrData=parsed;
      // Recuperar planes: 1) desde BD si el mes ya está guardado, 2) desde localStorage
      _infEntrPlanes = {};
      var _ym = parsed.ymPrincipal;
      try {
        var _lsKey = 'infEntrPlanes_'+_ym;
        var _lsVal = localStorage.getItem(_lsKey);
        if(_lsVal) _infEntrPlanes = JSON.parse(_lsVal);
      } catch(e2){}
      // Si el mes ya está en BD, precargar planes desde BD (tiene prioridad sobre localStorage)
      try {
        var _bdRows = await getDB('entrenadores_incentivos_mes');
        var _bdMes = (_bdRows||[]).filter(function(r){ return r.ym === _ym; });
        if(_bdMes.length){
          _bdMes.forEach(function(r){
            if(r.planes_online && parseInt(r.planes_online,10) > 0){
              _infEntrPlanes[r.employee_nombre] = parseInt(r.planes_online,10);
            }
          });
        }
      } catch(e3){}
      _renderEntrTabla(parsed);
    } catch(err){ toast('Error al procesar el CSV: '+err.message,'err'); }
  };
  rdr.readAsText(file,'utf-8');
};

function _eNum(n){ return (Math.round(n*100)/100).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:2}); }

// Devuelve la config del entrenador (método/umbral/precio/base) priorizando
// lo editado en pantalla; si no, lo guardado en su ficha (employees); si no, default.
function _infEntrGetConfig(rec){
  var manual = _infEntrConfig[rec.nombre] || {};
  var emp = (typeof _infEntrEmpById === 'function') ? _infEntrEmpById(rec.employee_id) : null;
  emp = emp || {};
  var metodo = manual.metodo || emp.inc_metodo || INF_ENTR_METODO_DEFAULT;
  return {
    metodo: metodo,
    umbral:      _numOr(manual.umbral,      _numOr(emp.inc_umbral, INF_ENTR_UMBRAL)),
    precio_hora: _numOr(manual.precio_hora, _numOr(emp.inc_precio_hora, 0)),
    base_neto:   _numOr(manual.base_neto,   _numOr(emp.inc_base_neto, 0))
  };
}
function _numOr(v, def){ var n=parseFloat(v); return isNaN(n)?def:n; }
function _infEntrEmpById(id){
  if(!id || typeof _infEmployeesCache==='undefined' || !_infEmployeesCache) return null;
  return _infEmployeesCache.find(function(e){ return e.id === id; }) || null;
}

// Recalcula incentivo de un instructor según su método configurado.
function _infEntrCalc(rec){
  var cfg = _infEntrGetConfig(rec);
  var planes=parseInt(_infEntrPlanes[rec.nombre]||0,10)||0;
  var incPlan=planes*INF_ENTR_EUR_PLAN;

  if(cfg.metodo === 'precio_hora'){
    var horas = Math.round((rec.horasPH||0)*100)/100;
    var incHoras = Math.round(horas*cfg.precio_hora*100)/100;
    var bruto = Math.round((incHoras - cfg.base_neto + incPlan)*100)/100; // puede ser negativo
    return {
      metodo:'precio_hora', horas:horas, precio_hora:cfg.precio_hora, base_neto:cfg.base_neto,
      incHoras:incHoras, planes:planes, incPlan:incPlan, bruto:bruto,
      // campos de umbral en 0 para compatibilidad de columnas
      efect:0, umbral:0, extra:0, incSes:0
    };
  }
  // Método UMBRAL (por defecto)
  var efect=Math.round(rec.efectivasPond*100)/100;
  var extra=Math.max(0, efect-cfg.umbral);
  var incSes=Math.round(extra*INF_ENTR_EUR_SESION*100)/100;
  return {
    metodo:'umbral', efect:efect, umbral:cfg.umbral, extra:extra, incSes:incSes,
    planes:planes, incPlan:incPlan, bruto:Math.round((incSes+incPlan)*100)/100,
    // campos precio/hora en 0
    horas:0, precio_hora:0, base_neto:0, incHoras:0
  };
}

window._infEntrSetPlanes=function(nombreB64, val){
  var nombre=decodeURIComponent(atob(nombreB64));
  _infEntrPlanes[nombre]=parseInt(val,10)||0;
  // Persistir en localStorage por mes para sobrevivir recargas
  if(_infEntrData && _infEntrData.ymPrincipal){
    try {
      localStorage.setItem('infEntrPlanes_'+_infEntrData.ymPrincipal, JSON.stringify(_infEntrPlanes));
    } catch(e){}
  }
  // recalcular solo las celdas de esa fila + total
  if(_infEntrData) _renderEntrTabla(_infEntrData);
};

function _renderEntrTabla(data){
  var el=document.getElementById('inf-entr-result');
  if(!el) return;
  var instructores=data.instructores, porInstr=data.porInstr;
  if(!instructores.length){
    el.innerHTML='<div style="color:var(--text3);text-align:center;padding:24px;">Sin sesiones válidas en el archivo (solo carril piscina / reservas sin instructor).</div>';
    return;
  }
  var ym=data.ymPrincipal;
  var mesLabel=ym?(function(){var p=ym.split('-');var ms=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];return ms[parseInt(p[1])-1]+' '+p[0];})():'—';

  var rows=instructores.map(function(n){
    var rec=porInstr[n];
    var c=_infEntrCalc(rec);
    var nb64=btoa(encodeURIComponent(rec.nombre));
    var noMatch=!rec.employee_id;
    var k=rec.kpi;
    var esPH=(c.metodo==='precio_hora');
    var metBadge = esPH
      ? '<span class="badge b-blue" title="Precio por hora">€/h</span>'
      : '<span class="badge b-gray" title="Por umbral">Umbral</span>';
    // Columna "Base de cálculo": en umbral muestra efectivas/umbral; en €/h muestra horas×precio−base
    var baseCalc = esPH
      ? _eNum(c.horas)+'h × '+_eNum(c.precio_hora)+'€ − '+_eNum(c.base_neto)+'€'
      : _eNum(c.efect)+' / '+_eNum(c.umbral)+' · extra '+_eNum(c.extra);
    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:8px 6px;font-weight:600;color:var(--text);">'+_escHtml(rec.nombre)
        +(noMatch?' <span title="No casó con BD" style="color:var(--amber);font-size:10px;">⚠ sin match</span>':'')+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+k.dir_efectiva+'</td>'
      +'<td style="text-align:center;padding:8px 4px;color:var(--text3);">'+k.dir_no_efectiva+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+k.pt+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+k.pt_duo+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+k.pt_30+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+k.val_funcional+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+k.visbody+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+k.banera_hielo+'</td>'
      +'<td style="text-align:center;padding:8px 4px;">'+metBadge+'</td>'
      +'<td style="text-align:center;padding:8px 4px;font-size:11px;color:var(--text2);font-family:var(--font-mono);">'+baseCalc+'</td>'
      +'<td style="text-align:center;padding:6px 4px;">'
        +'<input type="number" min="0" step="1" value="'+c.planes+'" '
        +'oninput="window._infEntrSetPlanes(\''+nb64+'\',this.value)" '
        +'style="width:54px;text-align:center;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text);font-family:var(--font-mono);"></td>'
      +'<td style="text-align:right;padding:8px 6px;font-weight:700;color:'+(c.bruto<0?'var(--red)':'var(--amber)')+';font-family:var(--font-mono);">'+_eNum(c.bruto)+'€</td>'
      +'</tr>';
  }).join('');

  // Totales
  var totBruto=instructores.reduce(function(s,n){ return s+_infEntrCalc(porInstr[n]).bruto; },0);

  el.innerHTML=''
    +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin:4px 0 12px;">'
    +  '<div style="font-family:var(--font-mono);font-size:13px;color:var(--text2);font-weight:600;">📅 '+mesLabel+'</div>'
    +  '<div style="font-size:11px;color:var(--text3);">'
    +     instructores.length+' entrenadores · '+data.sinInstr+' filas sin instructor · '+data.descartadas+' descartadas'
    +  '</div>'
    +'</div>'
    +(data.matchLog&&data.matchLog.length?'<div style="font-size:11px;color:var(--text3);background:var(--bg2);border-radius:6px;padding:8px 10px;margin-bottom:12px;">🔗 Nombres corregidos por aproximación: '+data.matchLog.map(_escHtml).join(' · ')+'</div>':'')
    +'<div style="overflow-x:auto;">'
    +'<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:880px;">'
    +'<thead><tr style="border-bottom:2px solid var(--border2);color:var(--text3);font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.04em;">'
    +  '<th style="text-align:left;padding:8px 6px;">Entrenador</th>'
    +  '<th style="padding:8px 4px;" title="Clases dirigidas efectivas (≥4 pers)">Dir.✓</th>'
    +  '<th style="padding:8px 4px;" title="Clases dirigidas no efectivas (≤3 pers)">Dir.✗</th>'
    +  '<th style="padding:8px 4px;" title="Entrenamiento personal">PT</th>'
    +  '<th style="padding:8px 4px;" title="PT DUO (×1,5)">DUO</th>'
    +  '<th style="padding:8px 4px;" title="PT 30 min (×0,5)">PT30</th>'
    +  '<th style="padding:8px 4px;" title="Valoración funcional / Welcome Fit (×0,5)">Val.</th>'
    +  '<th style="padding:8px 4px;" title="Visbody (×0,5)">Visb.</th>'
    +  '<th style="padding:8px 4px;" title="Bañera de hielo (×0,5)">Hielo</th>'
    +  '<th style="padding:8px 4px;" title="Método de cálculo del incentivo">Método</th>'
    +  '<th style="padding:8px 4px;" title="Base del cálculo según método">Cálculo</th>'
    +  '<th style="padding:8px 4px;" title="Planes online vendidos (manual)">Planes</th>'
    +  '<th style="text-align:right;padding:8px 6px;">Bruto</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'</tbody>'
    +'<tfoot><tr style="border-top:2px solid var(--border2);font-weight:700;">'
    +  '<td colspan="12" style="text-align:right;padding:10px 6px;color:var(--text2);">TOTAL INCENTIVO BRUTO</td>'
    +  '<td style="text-align:right;padding:10px 6px;color:var(--amber);font-family:var(--font-mono);">'+_eNum(totBruto)+'€</td>'
    +'</tr></tfoot>'
    +'</table></div>'
    +'<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">'
    +  '<button onclick="window._infEntrGuardar()" style="padding:10px 20px;border-radius:6px;border:none;cursor:pointer;background:var(--accent);color:#fff;font-weight:700;font-family:var(--font-mono);font-size:12px;">💾 Guardar mes como base de incentivos</button>'
    +  '<button onclick="window._infEntrConfigOpen()" style="padding:10px 20px;border-radius:6px;border:1px solid var(--border2);cursor:pointer;background:transparent;color:var(--text2);font-weight:700;font-family:var(--font-mono);font-size:12px;">⚙ Configurar métodos</button>'
    +  '<span style="font-size:11px;color:var(--text3);">La liquidación de cada entrenador se hace desde Mi Rendimiento → Mi equipo.</span>'
    +'</div>';
}

// Guarda el mes en entrenadores_incentivos_mes (upsert por nombre+ym)
window._infEntrGuardar=async function(){
  if(!_infEntrData||!_infEntrData.instructores.length){ toast('Nada que guardar','err'); return; }
  var ym=_infEntrData.ymPrincipal;
  if(!ym){ toast('No se pudo determinar el mes del archivo','err'); return; }
  if(!confirm('¿Guardar '+_infEntrData.instructores.length+' entrenadores como base de incentivos de '+ym+'?\nSe sobrescribe cualquier cálculo previo de ese mes.')) return;

  try {
    // Preservar estado de liquidación si el mes ya estaba liquidado (re-subida)
    var _prevLiq = {};
    try {
      var _prev = await getDB('entrenadores_incentivos_mes');
      (_prev||[]).forEach(function(r){
        if(r.ym === ym && r.liquidado === true){
          var key = r.employee_id || r.employee_nombre;
          _prevLiq[key] = {liquidado:true, liquidado_ts:r.liquidado_ts||null, liquidado_por:r.liquidado_por||null};
        }
      });
    } catch(ePrev){ /* tabla sin columna liquidado aún → ignorar */ }
    // Borrar registros previos del mes (reescritura limpia)
    await sbRequest('DELETE','entrenadores_incentivos_mes',null,'ym=eq.'+encodeURIComponent(ym));

    var rows=_infEntrData.instructores.map(function(n){
      var rec=_infEntrData.porInstr[n];
      var c=_infEntrCalc(rec);
      var k=rec.kpi;
      var _liq = _prevLiq[rec.employee_id] || _prevLiq[rec.nombre] || null;
      return {
        id: genId(),
        employee_id: rec.employee_id,
        employee_nombre: rec.nombre,
        ym: ym,
        n_dir_efectivas: k.dir_efectiva,
        n_dir_no_efect:  k.dir_no_efectiva,
        n_pt:            k.pt,
        n_pt_duo:        k.pt_duo,
        n_pt_30:         k.pt_30,
        n_val_funcional: k.val_funcional,
        n_visbody:       k.visbody,
        n_banera_hielo:  k.banera_hielo,
        sesiones_efectivas: c.efect,
        umbral: c.metodo==='umbral' ? c.umbral : 0,
        sesiones_extra: c.extra,
        incentivo_sesiones: c.incSes,
        planes_online: c.planes,
        incentivo_planes: c.incPlan,
        incentivo_bruto: c.bruto,
        metodo_calculo: c.metodo,
        horas_efectivas: c.horas,
        precio_hora: c.precio_hora,
        base_neto: c.base_neto,
        incentivo_horas: c.incHoras,
        liquidado:     _liq ? true : false,
        liquidado_ts:  _liq ? _liq.liquidado_ts : null,
        liquidado_por: _liq ? _liq.liquidado_por : null,
        subido_por: (currentUser&&currentUser.nombre)||'',
        fuente_archivo: _infEntrData.fuente||'',
        created_at: localTs()
      };
    });

    var res=await dbInsert('entrenadores_incentivos_mes', rows);
    if(res===null){ toast('Error al guardar (revisa consola). ¿Existe la tabla?','err'); return; }
    invalidateCache('entrenadores_incentivos_mes');
    await auditLog('ENTR_INCENTIVOS_SAVE', (currentUser&&currentUser.nombre)+' guardó incentivos Entrenadores '+ym+' ('+rows.length+' entrenadores) desde '+(_infEntrData.fuente||'CSV'));
    toast('Base de incentivos guardada para '+ym,'ok');
    // Limpiar localStorage del mes (ya está en BD)
    try { localStorage.removeItem('infEntrPlanes_'+ym); } catch(e){}
  } catch(e){ toast('Error: '+e.message,'err'); }
};

function _escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE MÉTODOS DE INCENTIVO POR ENTRENADOR
// Botón "⚙ Configurar métodos" en la tab Entrenadores. Una fila por entrenador
// del CSV cargado. Guarda en su ficha (employees) y recalcula al instante.
// ═══════════════════════════════════════════════════════════════════════
window._infEntrConfigOpen = function(){
  if(!_infEntrData || !_infEntrData.instructores.length){
    toast('Carga primero un archivo para ver los entrenadores','err'); return;
  }
  _ensureInfEntrConfigModal();
  _renderInfEntrConfigRows();
  document.getElementById('modal-inf-entr-cfg').style.display='flex';
};

function _ensureInfEntrConfigModal(){
  if(document.getElementById('modal-inf-entr-cfg')) return;
  var ov=document.createElement('div');
  ov.id='modal-inf-entr-cfg';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;';
  ov.innerHTML='<div class="modal-box" style="max-width:760px;width:100%;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:24px;">'
    + '<div style="font-family:var(--font-mono);font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px;">⚙ Cómo se calcula el incentivo de cada entrenador</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-bottom:16px;line-height:1.6;">'
    +   '<b>Por umbral:</b> cobra por cada sesión por encima de su objetivo mensual.<br>'
    +   '<b>Por precio por hora:</b> cobra sus horas efectivas × tarifa, menos una base neto mensual. '
    +   'Lo que pongas aquí se guarda en la ficha del entrenador y se usa en cada cálculo a partir de ahora.</div>'
    + '<div id="inf-entr-cfg-rows"></div>'
    + '<div id="inf-entr-cfg-err" style="color:var(--red);font-size:12px;min-height:16px;margin-top:8px;"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">'
    +   '<button class="btn btn-secondary" onclick="document.getElementById(\'modal-inf-entr-cfg\').style.display=\'none\'">Cerrar</button>'
    +   '<button class="btn btn-primary" onclick="window._infEntrConfigGuardar()">💾 Guardar configuración</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){ if(e.target===ov) ov.style.display='none'; });
}

function _renderInfEntrConfigRows(){
  var cont=document.getElementById('inf-entr-cfg-rows');
  if(!cont) return;
  var html='<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px;">'
    + '<thead><tr style="border-bottom:2px solid var(--border2);color:var(--text3);font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.04em;">'
    +   '<th style="text-align:left;padding:8px 6px;">Entrenador</th>'
    +   '<th style="text-align:left;padding:8px 6px;">Método</th>'
    +   '<th style="text-align:center;padding:8px 6px;">Objetivo (umbral)</th>'
    +   '<th style="text-align:center;padding:8px 6px;">€/hora</th>'
    +   '<th style="text-align:center;padding:8px 6px;">Base neto €/mes</th>'
    + '</tr></thead><tbody>';
  _infEntrData.instructores.forEach(function(n){
    var rec=_infEntrData.porInstr[n];
    var cfg=_infEntrGetConfig(rec);
    var b64=btoa(encodeURIComponent(n));
    var esPH=(cfg.metodo==='precio_hora');
    html+='<tr style="border-bottom:1px solid var(--border);">'
      + '<td style="padding:8px 6px;font-weight:600;color:var(--text);">'+_escHtml(rec.nombre)
        + (rec.employee_id?'':' <span style="color:var(--amber);font-size:10px;" title="Sin match en BD: la config no se podrá guardar en su ficha">⚠ sin ficha</span>')+'</td>'
      + '<td style="padding:8px 6px;">'
      +   '<select id="cfg-met-'+b64+'" onchange="_infEntrCfgToggle(\''+b64+'\')" style="font-size:12px;">'
      +     '<option value="umbral"'+(esPH?'':' selected')+'>Por umbral</option>'
      +     '<option value="precio_hora"'+(esPH?' selected':'')+'>Por precio/hora</option>'
      +   '</select></td>'
      + '<td style="text-align:center;padding:8px 6px;"><input type="number" min="0" step="1" id="cfg-umb-'+b64+'" value="'+(cfg.umbral||'')+'" '
      +     (esPH?'disabled':'')+' style="width:70px;text-align:center;color:#111827;background:'+(esPH?'#e5e7eb':'#fff')+';"></td>'
      + '<td style="text-align:center;padding:8px 6px;"><input type="number" min="0" step="0.5" id="cfg-ph-'+b64+'" value="'+(cfg.precio_hora||'')+'" '
      +     (esPH?'':'disabled')+' style="width:70px;text-align:center;color:#111827;background:'+(esPH?'#fff':'#e5e7eb')+';"></td>'
      + '<td style="text-align:center;padding:8px 6px;"><input type="number" min="0" step="1" id="cfg-bn-'+b64+'" value="'+(cfg.base_neto||'')+'" '
      +     (esPH?'':'disabled')+' style="width:80px;text-align:center;color:#111827;background:'+(esPH?'#fff':'#e5e7eb')+';"></td>'
      + '</tr>';
  });
  html+='</tbody></table></div>';
  cont.innerHTML=html;
}

window._infEntrCfgToggle=function(b64){
  var met=document.getElementById('cfg-met-'+b64).value;
  var esPH=(met==='precio_hora');
  var umb=document.getElementById('cfg-umb-'+b64);
  var ph=document.getElementById('cfg-ph-'+b64);
  var bn=document.getElementById('cfg-bn-'+b64);
  umb.disabled=esPH; umb.style.background=esPH?'#e5e7eb':'#fff';
  ph.disabled=!esPH; ph.style.background=esPH?'#fff':'#e5e7eb';
  bn.disabled=!esPH; bn.style.background=esPH?'#fff':'#e5e7eb';
};

window._infEntrConfigGuardar=async function(){
  var errEl=document.getElementById('inf-entr-cfg-err');
  errEl.textContent='';
  var aGuardar=[];
  for(var i=0;i<_infEntrData.instructores.length;i++){
    var n=_infEntrData.instructores[i];
    var rec=_infEntrData.porInstr[n];
    var b64=btoa(encodeURIComponent(n));
    var met=document.getElementById('cfg-met-'+b64).value;
    var umb=parseFloat(document.getElementById('cfg-umb-'+b64).value);
    var ph=parseFloat(document.getElementById('cfg-ph-'+b64).value);
    var bn=parseFloat(document.getElementById('cfg-bn-'+b64).value);
    // Validaciones por método
    if(met==='precio_hora'){
      if(isNaN(ph)||ph<=0){ errEl.textContent='«'+rec.nombre+'»: el precio por hora es obligatorio en método precio/hora.'; return; }
      if(isNaN(bn)){ errEl.textContent='«'+rec.nombre+'»: la base neto es obligatoria en método precio/hora.'; return; }
    } else {
      if(isNaN(umb)||umb<=0){ errEl.textContent='«'+rec.nombre+'»: el objetivo (umbral) es obligatorio en método umbral.'; return; }
    }
    // Config en memoria (recálculo inmediato)
    _infEntrConfig[n]={metodo:met, umbral:isNaN(umb)?null:umb, precio_hora:isNaN(ph)?null:ph, base_neto:isNaN(bn)?null:bn};
    // Para persistir en ficha employees (solo si hay match)
    if(rec.employee_id){
      aGuardar.push({id:rec.employee_id, inc_metodo:met,
        inc_umbral:isNaN(umb)?null:umb, inc_precio_hora:isNaN(ph)?null:ph, inc_base_neto:isNaN(bn)?null:bn});
    }
  }
  // PATCH ficha de cada entrenador con match
  try {
    for(var j=0;j<aGuardar.length;j++){
      var g=aGuardar[j];
      await sbRequest('PATCH','employees',
        {inc_metodo:g.inc_metodo, inc_umbral:g.inc_umbral, inc_precio_hora:g.inc_precio_hora, inc_base_neto:g.inc_base_neto},
        'id=eq.'+encodeURIComponent(g.id));
    }
    invalidateCache('employees');
    _infEmployeesCache=await getDB('employees'); // refrescar para recálculo
    await auditLog('ENTR_INC_CONFIG', (currentUser&&currentUser.nombre)+' configuró métodos de incentivo de '+aGuardar.length+' entrenadores');
    document.getElementById('modal-inf-entr-cfg').style.display='none';
    if(_infEntrData) _renderEntrTabla(_infEntrData); // recalcular tabla con nuevos métodos
    toast('Configuración guardada','ok');
  } catch(e){ errEl.textContent='Error al guardar: '+e.message; }
};
