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

// ── Control semanal POSMEWS ─────────────────────────────────
var _infControlWeek  = null;  // {inicio:'YYYY-MM-DD', fin:'YYYY-MM-DD'}
var _infControlTicks = {};    // {acumulativo:{ok,filename,ts,error}, ...}

// _INF_FILE_TYPES → ahora vive en posmews_ventas.js como _PV_FILE_TYPES
// Fallback para código legacy que aún referencia _INF_FILE_TYPES
var _INF_FILE_TYPES = (typeof _PV_FILE_TYPES !== 'undefined') ? _PV_FILE_TYPES : [];
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
  { key:'Housekeeping', label:'Housekeeping',           icon:'🧹', subtabs:['kpi','informe-jefe'] },
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
    var rulesRes=await syncroSupabaseFetch(
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
    if(dept==='Sala' && typeof renderPosmewsVentas==='function') { await renderPosmewsVentas(tc); return; }
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

// ══════════════════════════════════════════════════════════════════════
// CONTROL SEMANAL POSMEWS — helpers
// ══════════════════════════════════════════════════════════════════════
function _infGetWeekOf(dateStr){
  var d=dateStr?new Date(dateStr+'T12:00:00'):new Date();
  var day=d.getDay();
  var sun=new Date(d); sun.setDate(sun.getDate()-day);
  var sat=new Date(sun); sat.setDate(sat.getDate()+6);
  return {inicio:sun.toISOString().slice(0,10), fin:sat.toISOString().slice(0,10)};
}
function _infFmtDateShort(iso){ if(!iso) return ''; var p=iso.split('-'); return p[2]+'/'+p[1]; }
function _infFmtDateFull(iso){ if(!iso) return ''; var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function _infExtractFileDates(filename){
  var m=filename.match(/(\d{8})-(\d{8})/);
  if(!m) return null;
  var s=m[1],e=m[2];
  return {inicio:s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8), fin:e.slice(0,4)+'-'+e.slice(4,6)+'-'+e.slice(6,8)};
}
function _infIs7Days(inicio,fin){
  var d1=new Date(inicio+'T12:00:00'),d2=new Date(fin+'T12:00:00');
  return Math.round((d2-d1)/(864e5))===6;
}
function _readFileText(file){
  return new Promise(function(ok,fail){
    var r=new FileReader();
    r.onload=function(e){ ok(e.target.result); };
    r.onerror=function(){ fail(new Error('Error leyendo archivo')); };
    r.readAsText(file,'utf-8');
  });
}
// _readFileArrayBuffer → movido a posmews_ventas.js

window._infControlPrev=function(){ _infShiftControlWeek(-1); };
window._infControlNext=function(){ _infShiftControlWeek(1); };
function _infShiftControlWeek(dir){
  var w=_infControlWeek||_infGetWeekOf();
  var d=new Date(w.inicio+'T12:00:00');
  d.setDate(d.getDate()+(dir*7));
  _infControlWeek=_infGetWeekOf(d.toISOString().slice(0,10));
  _infControlTicks={};
  _renderControlBody();
  _infLoadControlTicks();
}

async function _infLoadControlTicks(){
  if(!_infControlWeek) _infControlWeek=_infGetWeekOf();
  var periodo=_infControlWeek.inicio+'_'+_infControlWeek.fin;
  try{
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_informes_control?periodo=eq.'+encodeURIComponent(periodo)+'&select=*',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(res.ok){
      var rows=await res.json();
      _infControlTicks={};
      rows.forEach(function(r){
        _infControlTicks[r.tipo]={ok:!!(r.formato_ok&&r.periodo_ok&&r.contenido_ok),filename:r.filename,ts:r.subido_ts,
          formato_ok:r.formato_ok,periodo_ok:r.periodo_ok,contenido_ok:r.contenido_ok};
      });
    }
  }catch(e){}
  _renderControlBody();
}

async function _infControlSaveTick(typeKey,filename,dates,ok,checks){
  var periodo=_infControlWeek.inicio+'_'+_infControlWeek.fin;
  var row={
    periodo:periodo, semana_inicio:_infControlWeek.inicio, semana_fin:_infControlWeek.fin,
    tipo:typeKey, filename:filename,
    formato_ok:!!(checks&&checks.fmt), periodo_ok:!!(checks&&checks.periodo), contenido_ok:!!(checks&&checks.contenido),
    subido_por:currentUser?currentUser.nombre:'?', subido_ts:localTs()
  };
  try{
    // Upsert: delete then insert
    await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_informes_control?periodo=eq.'+encodeURIComponent(periodo)+'&tipo=eq.'+encodeURIComponent(typeKey),
      {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_informes_control',{
      method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
      'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(row)});
    if(!res.ok) throw new Error('HTTP '+res.status);
    invalidateCache('sala_informes_control');
  }catch(e){ console.error('Error guardando control:',e); }
}

// ── Validación de archivo de control ──
window._infControlDrop=function(ev){
  ev.preventDefault();
  var dz=document.getElementById('inf-control-dropzone');
  if(dz) dz.style.borderColor='var(--border2)';
  var files=ev.dataTransfer&&ev.dataTransfer.files;
  if(!files||!files.length) return;
  for(var i=0;i<files.length;i++) _infControlValidateFile(files[i]);
};
window._infControlFiles=function(inp){
  if(!inp||!inp.files) return;
  for(var i=0;i<inp.files.length;i++) _infControlValidateFile(inp.files[i]);
  inp.value='';
};

async function _infControlValidateFile(file){
  if(!_infControlWeek) _infControlWeek=_infGetWeekOf();
  var ext=file.name.split('.').pop().toLowerCase();

  // ── 1. Detect type: for CSV use CONTENT (deep), for XLSX use filename ──
  var type=null;
  if(ext==='csv'){
    try{
      var text=await _readFileText(file);
      file._text=text;
      // Intentar clasificar con detect() de cada tipo CSV
      _INF_FILE_TYPES.forEach(function(t){
        if(type||t.fmt!=='csv'||!t.detect) return;
        if(t.detect(text)) type=t;
      });
    }catch(e){}
  } else if(ext==='xlsx'){
    // Collect all XLSX types matching filename
    var xlsxMatches=[];
    _INF_FILE_TYPES.forEach(function(t){
      if(t.fmt==='xlsx'&&t.fnPattern&&t.fnPattern.test(file.name)) xlsxMatches.push(t);
    });
    if(xlsxMatches.length===1){
      type=xlsxMatches[0];
    } else if(xlsxMatches.length>1){
      // Multiple matches (e.g. both acumulativo types) — SheetJS distinguishes by sheet count
      try{
        var buf=await _readFileArrayBuffer(file);
        file._xlsxBuf=buf;
        if(typeof XLSX!=='undefined'){
          var wb=XLSX.read(new Uint8Array(buf),{type:'array',bookSheets:true});
          var nSheets=wb.SheetNames.length;
          type=xlsxMatches.find(function(t){
            if(t.xlsxDetect==='sheets>=3') return nSheets>=3;
            if(t.xlsxDetect==='sheets<3') return nSheets<3;
            return false;
          })||xlsxMatches[0];
        } else { type=xlsxMatches[0]; }
      }catch(e){ type=xlsxMatches[0]; }
    }
  }
  if(!type){
    toast('Archivo no reconocido: '+file.name+'. CSV: debe ser Facturas. XLSX: nombre debe contener Acumulativo, Compensaciones o Descuentos.','err');
    return;
  }

  var checks={fmt:false,periodo:false,contenido:false};

  // ── 2. Extension ──
  if(ext!==type.fmt){
    toast(type.label+': formato incorrecto. Esperado .'+type.fmt+', recibido .'+ext,'err');
    _infControlTicks[type.key]={ok:false,filename:file.name,error:'Formato .'+ext+' ≠ .'+type.fmt};
    _renderControlBody();
    _infControlSaveTick(type.key,file.name,null,false,checks);
    return;
  }
  checks.fmt=true;

  // ── 3. Date range from filename ──
  var dates=_infExtractFileDates(file.name);
  if(!dates||!_infIs7Days(dates.inicio,dates.fin)){
    var msg=dates?'Periodo no es 7 días (dom→sáb)':'No se detectan fechas en el nombre';
    toast(type.label+': '+msg,'err');
    _infControlTicks[type.key]={ok:false,filename:file.name,error:msg};
    _renderControlBody();
    _infControlSaveTick(type.key,file.name,dates,false,checks);
    return;
  }
  // ── 4. Dates match selected week ──
  if(dates.inicio!==_infControlWeek.inicio||dates.fin!==_infControlWeek.fin){
    toast(type.label+': periodo '+_infFmtDateFull(dates.inicio)+'–'+_infFmtDateFull(dates.fin)+' no coincide con semana seleccionada','err');
    _infControlTicks[type.key]={ok:false,filename:file.name,error:'Periodo no coincide con semana'};
    _renderControlBody();
    _infControlSaveTick(type.key,file.name,dates,false,checks);
    return;
  }
  checks.periodo=true;

  // ── 5. Content validation ──
  // CSV: contenido ya verificado en detect() del paso 1
  if(ext==='csv') checks.contenido=true;
  // XLSX: check ZIP magic bytes (PK)
  if(ext==='xlsx'){
    try{
      var buf=await file.slice(0,4).arrayBuffer();
      var bytes=new Uint8Array(buf);
      if(bytes[0]===0x50&&bytes[1]===0x4B) checks.contenido=true;
      else {
        toast(type.label+': archivo no es XLSX válido','err');
        _infControlTicks[type.key]={ok:false,filename:file.name,error:'No es XLSX válido'};
        _renderControlBody();
        _infControlSaveTick(type.key,file.name,dates,false,checks);
        return;
      }
    }catch(e){ checks.contenido=true; }
  }

  // ── 6. All OK ──
  _infControlTicks[type.key]={ok:true,filename:file.name,ts:localTs()};
  _renderControlBody();
  _infControlSaveTick(type.key,file.name,dates,true,checks);
  toast('✅ '+type.label+' validado','ok');

  // ── 7. Facturas → alimentar también la tabla de producción por camarero ──
  if(type.feedsParser&&file._text){
    try{
      var employees=await _infGetEmployees();
      var parsed=_infParsePOSMEWS(file._text, employees);
      _infSalaData=parsed;
      var costData={};
      if(parsed.fechas.length){
        try{ costData=await _infSalaCostLaboral(parsed.fechas[0],parsed.fechas[parsed.fechas.length-1]); }catch(x){}
      }
      _infSalaData._costData=costData;
      _renderSalaTabla(parsed,costData);
    }catch(e){ console.error('Auto-parse Facturas:',e); }
  }
}

// ── Renderizar cuerpo del control panel ──
function _renderControlBody(){
  var el=document.getElementById('inf-control-body');
  if(!el) return;
  var w=_infControlWeek||_infGetWeekOf();
  var nOk=0;
  _INF_FILE_TYPES.forEach(function(t){ if(_infControlTicks[t.key]&&_infControlTicks[t.key].ok) nOk++; });
  var completa=nOk===_INF_FILE_TYPES.length;

  var weekLabel=_infFmtDateFull(w.inicio)+' — '+_infFmtDateFull(w.fin);
  var statusBadge=completa
    ?'<span style="background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green);border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;font-family:var(--font-mono);">✅ COMPLETA '+nOk+'/4</span>'
    :'<span style="background:rgba(239,68,68,.1);color:var(--red);border:1px solid var(--red);border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;font-family:var(--font-mono);">❌ '+nOk+'/4</span>';

  var filas=_INF_FILE_TYPES.map(function(t){
    var tick=_infControlTicks[t.key];
    var fmtBadge=t.fmt==='csv'
      ?'<span style="font-size:9px;font-weight:700;font-family:var(--font-mono);padding:2px 6px;border-radius:4px;background:rgba(46,204,113,.15);color:#57d38c;">CSV</span>'
      :'<span style="font-size:9px;font-weight:700;font-family:var(--font-mono);padding:2px 6px;border-radius:4px;background:rgba(245,158,11,.15);color:var(--amber);">XLSX</span>';
    var tickIcon,tickDetail;
    if(!tick){
      tickIcon='<span style="font-size:16px;opacity:.3;">☐</span>';
      tickDetail='<span style="font-size:10px;color:var(--text3);">Pendiente</span>';
    } else if(tick.ok){
      tickIcon='<span style="font-size:16px;">✅</span>';
      tickDetail='<span style="font-size:10px;color:var(--green);font-family:var(--font-mono);">'+_escHtml(tick.filename||'')+'</span>';
    } else {
      tickIcon='<span style="font-size:16px;">❌</span>';
      tickDetail='<span style="font-size:10px;color:var(--red);">'+_escHtml(tick.error||tick.filename||'Error')+'</span>';
    }
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg3);">'
      +tickIcon
      +'<div style="flex:1;min-width:0;">'
      +  '<div style="font-size:12px;font-weight:600;color:var(--text);">'+t.label+' '+fmtBadge+'</div>'
      +  tickDetail
      +'</div>'
      +'</div>';
  }).join('');

  el.innerHTML=''
    +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">'
    +  '<div style="display:flex;align-items:center;gap:8px;">'
    +    '<button onclick="_infControlPrev()" style="background:var(--bg4);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:14px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;">◄</button>'
    +    '<span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);">'+weekLabel+'</span>'
    +    '<button onclick="_infControlNext()" style="background:var(--bg4);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:14px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;">►</button>'
    +  '</div>'
    +  statusBadge
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">'+filas+'</div>'
    +'<div id="inf-control-dropzone" '
    +  'onclick="document.getElementById(\'inf-control-input\').click()" '
    +  'ondragover="event.preventDefault();this.style.borderColor=\'var(--amber)\'" '
    +  'ondragleave="this.style.borderColor=\'var(--border2)\'" '
    +  'ondrop="_infControlDrop(event)" '
    +  'style="border:2px dashed var(--border2);border-radius:8px;padding:18px;text-align:center;cursor:pointer;transition:border-color .2s;">'
    +  '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text3);">📂 Arrastra archivos POSMEWS aquí <span style="font-size:10px;">(1 o varios a la vez)</span></div>'
    +'</div>'
    +'<input type="file" id="inf-control-input" multiple accept=".csv,.xlsx" style="display:none" onchange="_infControlFiles(this)">';
}

// ══════════════════════════════════════════════════════════════════════
// KPI SALA — Lee producción desde BD (datos subidos en Ventas/Datos)
// ══════════════════════════════════════════════════════════════════════
async function _renderInformesSala(el){
  if(!_infControlWeek) _infControlWeek=_infGetWeekOf();
  var w=_infControlWeek;
  var objSemFmt=_infSalaObjSem.toLocaleString('es-ES',{minimumFractionDigits:2});
  var objMesFmt=_infSalaObjMes.toLocaleString('es-ES',{minimumFractionDigits:2});
  el.innerHTML=''
    +'<div class="card" style="margin-bottom:16px;">'
    +  '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">'
    +    '<div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--text);">📊 KPI Sala — Producción por camarero</div>'
    +    '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">Obj. semana: <strong style="color:var(--amber);">'+objSemFmt+'€</strong> · Obj. mes: <strong style="color:var(--amber);">'+objMesFmt+'€</strong></div>'
    +  '</div>'
    +  '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'
    +    '<button onclick="_infKpiPrev()" style="background:var(--bg4);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:14px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;">◄</button>'
    +    '<span id="inf-kpi-week-label" style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);">'+_infFmtDateFull(w.inicio)+' — '+_infFmtDateFull(w.fin)+'</span>'
    +    '<button onclick="_infKpiNext()" style="background:var(--bg4);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:14px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;">►</button>'
    +  '</div>'
    +  '<div style="font-size:10.5px;color:var(--text3);margin-bottom:6px;">Los datos se suben desde <strong style="color:var(--text2);">💶 Ventas / Datos</strong>. Aquí se muestran los datos guardados.</div>'
    +  '<div id="inf-kpi-actions"></div>'
    +'</div>'
    +'<div id="inf-sala-result"><div style="color:var(--text3);text-align:center;padding:24px;">Cargando…</div></div>';
  _infLoadSalaFromDB();
}

// Navegación semanal KPI
window._infKpiPrev=function(){ _infShiftKpiWeek(-1); };
window._infKpiNext=function(){ _infShiftKpiWeek(1); };
function _infShiftKpiWeek(dir){
  var w=_infControlWeek||_infGetWeekOf();
  var d=new Date(w.inicio+'T12:00:00');
  d.setDate(d.getDate()+(dir*7));
  _infControlWeek=_infGetWeekOf(d.toISOString().slice(0,10));
  var lbl=document.getElementById('inf-kpi-week-label');
  if(lbl) lbl.textContent=_infFmtDateFull(_infControlWeek.inicio)+' — '+_infFmtDateFull(_infControlWeek.fin);
  _infLoadSalaFromDB();
}

// Cargar producción semanal desde sala_produccion_semanal
async function _infLoadSalaFromDB(){
  var w=_infControlWeek||_infGetWeekOf();
  var periodo=w.inicio+'_'+w.fin;
  var el=document.getElementById('inf-sala-result');
  if(!el) return;
  try{
    var rows=await getDB('sala_produccion_semanal');
    rows=rows.filter(function(r){ return r.periodo===periodo; });
    if(!rows.length){
      el.innerHTML='<div class="card" style="text-align:center;padding:32px 24px;">'
        +'<div style="font-size:28px;margin-bottom:10px;">📭</div>'
        +'<div style="font-size:13px;color:var(--text3);font-family:var(--font-mono);">Sin datos de producción para esta semana.</div>'
        +'<div style="font-size:11px;color:var(--text3);margin-top:6px;">Sube el CSV de Facturas en <strong style="color:var(--text2);">💶 Ventas / Datos</strong> y pulsa Guardar.</div>'
        +'</div>';
      return;
    }
    // Reconstruir estructura compatible con _renderSalaTabla
    var fechasSet={}, porUsuario={};
    rows.forEach(function(r){
      var detalle=r.detalle_diario||{};
      porUsuario[r.nombre]={
        fechas:detalle,
        totalBruto:parseFloat(r.produccion_bruta)||0,
        facturas:parseInt(r.facturas)||0,
        csvNombre:r.csv_nombre||r.nombre,
        employee_id:r.employee_id
      };
      Object.keys(detalle).forEach(function(f){ fechasSet[f]=true; });
    });
    var fechas=Object.keys(fechasSet).sort();
    var usuarios=Object.keys(porUsuario).sort(function(a,b){ return porUsuario[b].totalBruto-porUsuario[a].totalBruto; });
    var data={fechas:fechas,usuarios:usuarios,porUsuario:porUsuario,rangoDias:fechas.length,tipo:'semanal',matchLog:[]};
    var costData={};
    // La semana seleccionada es la fuente fiable del rango. Algunas cargas
    // antiguas guardaron las claves de detalle_diario en formato dd/mm/yyyy.
    try{ costData=await _infSalaCostLaboral(w.inicio,w.fin); }catch(x){}
    _renderSalaTabla(data,costData,{readOnly:true});
    // Botón eliminar solo para admin
    var actEl=document.getElementById('inf-kpi-actions');
    if(actEl&&typeof isAdmin==='function'&&isAdmin(currentUser)){
      actEl.innerHTML='<button onclick="window._infDeleteSemana()" style="background:var(--bg4);border:1px solid var(--red);border-radius:6px;color:var(--red);font-size:11px;font-family:var(--font-mono);padding:5px 12px;cursor:pointer;margin-top:8px;">🗑 Eliminar datos de esta semana</button>';
    } else if(actEl){ actEl.innerHTML=''; }
  }catch(e){
    el.innerHTML='<div class="card"><p style="color:var(--red);">Error cargando datos: '+_escHtml(e.message)+'</p></div>';
  }
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
      var costData={};
      if(parsed.fechas.length){
        try{ costData=await _infSalaCostLaboral(parsed.fechas[0],parsed.fechas[parsed.fechas.length-1]); }catch(x){}
      }
      _infSalaData._costData=costData;
      _renderSalaTabla(parsed,costData);
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

    if(!porUsuario[usuario]){
      var _emp=(employees||[]).find(function(e){return e.nombre===usuario;});
      porUsuario[usuario]={fechas:{},totalBruto:0,facturas:0,descuentos:{},csvNombre:usuarioRaw,employee_id:_emp?_emp.id:null};
    }
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

function _infNormNombre(nombre){
  return String(nombre||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

function _infNombreCompatible(a,b){
  var aa=_infNormNombre(a).split(' ').filter(Boolean);
  var bb=_infNormNombre(b).split(' ').filter(Boolean);
  if(aa.join(' ')===bb.join(' ')) return true;
  if(aa.length<2||bb.length<2) return false;
  var comunes=aa.filter(function(t){ return bb.indexOf(t)>=0; });
  return comunes.length>=2 && comunes.length===Math.min(aa.length,bb.length);
}

// ── Coste laboral: coste actual × fichajes Bitrix del periodo ──
async function _infSalaCostLaboral(fechaMin,fechaMax){
  var url='/api/kpi-sala-labor?desde='+encodeURIComponent(fechaMin)
    +'&hasta='+encodeURIComponent(fechaMax);
  var res=await syncroSupabaseFetch(url,{method:'GET'});
  if(!res.ok) throw new Error('No se pudieron cargar las horas del periodo (HTTP '+res.status+')');
  var payload=await res.json();
  var result={byId:{},byNombre:{},rows:[]};
  (payload.rows||[]).forEach(function(row){
    if(row.employee_id) result.byId[row.employee_id]=row;
    var key=_infNormNombre(row.nombre);
    if(Object.prototype.hasOwnProperty.call(result.byNombre,key)) result.byNombre[key]=null;
    else result.byNombre[key]=row;
    result.rows.push(row);
  });
  return result;
}

function _infSalaCosteUsuario(costData,detalle,nombre){
  if(!costData) return null;
  if(detalle&&detalle.employee_id&&costData.byId&&costData.byId[detalle.employee_id]){
    return costData.byId[detalle.employee_id];
  }
  if(costData.byNombre){
    var exacto=costData.byNombre[_infNormNombre(nombre)]
      ||costData.byNombre[_infNormNombre(detalle&&detalle.csvNombre)];
    if(exacto) return exacto;
  }
  if(costData.rows&&costData.rows.length){
    var candidatos=[nombre,detalle&&detalle.csvNombre].filter(Boolean);
    for(var i=0;i<candidatos.length;i++){
      var compatibles=costData.rows.filter(function(row){
        return _infNombreCompatible(candidatos[i],row.nombre);
      });
      if(compatibles.length===1) return compatibles[0];
    }
  }
  return costData[nombre]||null;
}

// ── Persistencia de producción semanal de Sala ────────────────────────
// El periodo POSMEWS procede del nombre validado del archivo (dom→sáb),
// no de la presentación de fechas del CSV. Así KPI y Ventas/Datos consultan
// exactamente la misma semana.
window._infPersistSalaSemana=async function(data,week,opts){
  opts=opts||{};
  if(!data||!data.fechas||!data.fechas.length||!data.usuarios||!data.usuarios.length){
    return {ok:false,message:'No hay facturación por empleado para guardar'};
  }
  var fechaMin=(week&&week.inicio)||data.fechas[0];
  var fechaMax=(week&&week.fin)||data.fechas[data.fechas.length-1];
  var periodo=fechaMin+'_'+fechaMax;
  try{
    var chk=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_produccion_semanal?periodo=eq.'+encodeURIComponent(periodo)+'&select=id,nombre',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!chk.ok) throw new Error('No se pudo comprobar la producción existente (HTTP '+chk.status+')');
    var prev=await chk.json();
    if(prev.length&&!opts.replaceExisting){
      // La carga automática no puede destruir un cálculo ya consolidado.
      return {ok:true,alreadySaved:true,rowCount:prev.length,periodo:periodo};
    }
    if(prev.length){
      var del=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_produccion_semanal?periodo=eq.'+encodeURIComponent(periodo),
        {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
      if(!del.ok) throw new Error('No se pudo reemplazar la producción existente (HTTP '+del.status+')');
    }
    var rows=data.usuarios.map(function(u){
      var d=data.porUsuario[u];
      return {
        employee_id:d.employee_id||null, nombre:u, csv_nombre:d.csvNombre||u,
        semana_inicio:fechaMin, semana_fin:fechaMax, periodo:periodo,
        produccion_bruta:+d.totalBruto.toFixed(2), facturas:d.facturas,
        detalle_diario:d.fechas,
        subido_por:currentUser?currentUser.nombre:'?', subido_ts:localTs()
      };
    });
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_produccion_semanal',{
      method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
      'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(rows)});
    if(!res.ok){ var txt=await res.text(); throw new Error('HTTP '+res.status+' '+txt); }
    invalidateCache('sala_produccion_semanal');
    return {ok:true,rowCount:rows.length,periodo:periodo,replaced:prev.length>0};
  }catch(e){ return {ok:false,message:e.message||'Error al guardar la producción'}; }
};

// ── Guardar o reemplazar desde el preview manual ─────────────────────
window._infSalaGuardar=async function(){
  if(!_infSalaData||!_infSalaData.fechas.length){ toast('No hay datos para guardar','err'); return; }
  var data=_infSalaData;
  var week=data._posmewsWeek||null;
  var saved=await window._infPersistSalaSemana(data,week);
  if(saved.ok&&saved.alreadySaved){
    if(!confirm('⚠ Ya existen '+saved.rowCount+' registros para '+saved.periodo+'. ¿Sobreescribir?')) return;
    saved=await window._infPersistSalaSemana(data,week,{replaceExisting:true});
  }
  if(!saved.ok){ toast('Error al guardar: '+saved.message,'err'); return; }
  invalidateCache('sala_produccion_semanal');
  toast(saved.replaced?'✅ Producción reemplazada: '+saved.rowCount+' camareros · '+saved.periodo:'✅ Guardado: '+saved.rowCount+' camareros · '+saved.periodo,'ok');
  var btn=document.getElementById('inf-sala-guardar');
  if(btn){ btn.disabled=true; btn.textContent='✅ Guardado'; }
};

// ── Eliminar producción semanal (solo admin) ──────────────────────────
window._infDeleteSemana=async function(periodoOverride){
  if(typeof isAdmin==='function'&&!isAdmin(currentUser)){ toast('Solo admin puede eliminar','err'); return false; }
  var periodo=periodoOverride;
  if(!periodo){
    var w=_infControlWeek||_infGetWeekOf();
    periodo=w.inicio+'_'+w.fin;
  }
  if(!confirm('⚠ ¿Eliminar TODOS los datos de producción de la semana '+periodo+'?\n\nEsta acción no se puede deshacer.')) return false;
  try{
    await auditLog('delete_produccion_semanal','Eliminado periodo '+periodo+' (sala_produccion_semanal + sala_informes_control)');
    // 1. Eliminar producción
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_produccion_semanal?periodo=eq.'+encodeURIComponent(periodo),
      {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) throw new Error('HTTP '+res.status);
    // 2. Eliminar ticks legacy
    await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_informes_control?periodo=eq.'+encodeURIComponent(periodo),
      {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    // 3. Eliminar batch tracking (si existe)
    var batchRes=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_batches?periodo=eq.'+encodeURIComponent(periodo)+'&select=id',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(batchRes.ok){
      var batches=await batchRes.json();
      for(var i=0;i<batches.length;i++){
        await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_files?batch_id=eq.'+encodeURIComponent(batches[i].id),
          {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
      }
      if(batches.length){
        await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_batches?periodo=eq.'+encodeURIComponent(periodo),
          {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
      }
    }
    invalidateCache('sala_produccion_semanal');
    invalidateCache('sala_informes_control');
    invalidateCache('posmews_upload_batches');
    invalidateCache('posmews_upload_files');
    toast('🗑 Datos eliminados: '+periodo,'ok');
    // Refrescar KPI si está visible
    if(document.getElementById('inf-sala-result')) _infLoadSalaFromDB();
    return true;
  }catch(e){ toast('Error al eliminar: '+e.message,'err'); return false; }
};

function _renderSalaTabla(data,costData,opts){
  costData=costData||{};
  opts=opts||{};
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
    // Coste laboral
    var c=_infSalaCosteUsuario(costData,d,u);
    var hCell=c?c.horas.toFixed(1)+'h':'—';
    var rCell=c?c.coste_hora.toFixed(2)+'€':'—';
    var cCell=c?c.coste_total.toFixed(2)+'€':'—';
    var pVal=c&&total>0?(c.coste_total/total*100):0;
    var pCell=c&&total>0?pVal.toFixed(1)+'%':'—';
    var pColor=c&&total>0?(pVal>40?'var(--red)':pVal>25?'var(--amber)':'var(--green)'):'var(--text3)';
    var _cs='text-align:right;font-family:var(--font-mono);font-size:11px;padding:8px 8px;color:';
    return '<tr style="background:'+rowBg+';border-bottom:1px solid var(--border);">'
      +'<td style="padding:8px 12px;font-size:13px;white-space:nowrap;font-weight:600;color:var(--text);">'+_escHtml(u)+matchInd+'</td>'
      +celdas
      +'<td style="text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:700;padding:8px 12px;color:var(--amber);">'+total.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
      +'<td style="'+_cs+'var(--text3);">'+hCell+'</td>'
      +'<td style="'+_cs+'var(--text3);">'+rCell+'</td>'
      +'<td style="'+_cs+'var(--text2);font-weight:600;">'+cCell+'</td>'
      +'<td style="'+_cs+pColor+';font-weight:700;">'+pCell+'</td>'
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
  // Totales coste laboral
  var _totHoras=0,_totCoste=0,_nConCoste=0;
  usuarios.forEach(function(u){ var c=_infSalaCosteUsuario(costData,porUsuario[u],u); if(c){_totHoras+=c.horas;_totCoste+=c.coste_total;_nConCoste++;} });
  var _pctCosteProd=totalGeneral>0?(_totCoste/totalGeneral*100):0;
  var _mediaCoste=_nConCoste?(_totCoste/_nConCoste):0;
  var _tarifaMedia=_totHoras>0?(_totCoste/_totHoras):0;
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
    +'</div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">'
    +  kpiBox('Producción total',totalGeneral.toLocaleString('es-ES',{minimumFractionDigits:2})+'€','var(--amber)')
    +  kpiBox('Media por camarero',mediaProd.toLocaleString('es-ES',{minimumFractionDigits:2})+'€','var(--text)')
    +  kpiBox('Cumplen objetivo',nCumplen+' / '+nCam,nCumplen===nCam?'var(--green)':'var(--red)')
    +  kpiBox('% cumplimiento',pctCump+'%',pctCump>=80?'var(--green)':pctCump>=50?'var(--amber)':'var(--red)')
    +'</div>'
    +(_nConCoste?'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">'
    +  kpiBox('Horas totales',_totHoras.toFixed(1)+'h','var(--text)')
    +  kpiBox('Coste laboral',_totCoste.toFixed(2)+'€',_pctCosteProd>40?'var(--red)':'var(--text2)')
    +  kpiBox('% coste / producción',_pctCosteProd.toFixed(1)+'%',_pctCosteProd>40?'var(--red)':_pctCosteProd>25?'var(--amber)':'var(--green)')
    +  kpiBox('Coste medio/cam',_mediaCoste.toFixed(2)+'€','var(--text3)')
    +'</div>':'')
    +(opts.readOnly?'':'<div style="display:flex;gap:8px;margin-bottom:14px;">'
    +  '<button id="inf-sala-guardar" onclick="window._infSalaGuardar()" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:700;font-family:var(--font-mono);cursor:pointer;">💾 Guardar semana</button>'
    +  '<button onclick="window._infSalaData=null;_infRenderSubTab()" style="background:var(--bg4);border:1px solid var(--border);border-radius:6px;color:var(--text2);font-size:11px;font-family:var(--font-mono);padding:5px 12px;cursor:pointer;">✕ Nuevo CSV</button>'
    +'</div>')
    +'<div style="overflow-x:auto;">'
    +  '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px;">'
    +    '<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    +      '<th style="text-align:left;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">Camarero</th>'
    +      thFechas
    +      '<th style="text-align:right;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--amber);">Total</th>'
    +      '<th style="text-align:right;padding:10px 8px;font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Horas</th>'
    +      '<th style="text-align:right;padding:10px 8px;font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">€/h</th>'
    +      '<th style="text-align:right;padding:10px 8px;font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Coste</th>'
    +      '<th style="text-align:right;padding:10px 8px;font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">% coste/prod.</th>'
    +      '<th style="text-align:center;padding:10px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--text3);">Obj. '+_infSalaObjSem.toLocaleString('es-ES',{maximumFractionDigits:0})+'€</th>'
    +    '</tr></thead>'
    +    '<tbody>'+rows
    +      '<tr style="background:var(--bg2);border-top:2px solid var(--border2);">'
    +        '<td style="padding:10px 12px;font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;">TOTAL</td>'
    +        celdaTotDia
    +        '<td style="text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;padding:10px 12px;color:var(--amber);">'+totalGeneral.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
    +        (function(){ return '<td style="text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:700;padding:10px 8px;color:var(--text3);">'+_totHoras.toFixed(1)+'h</td><td style="text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:700;padding:10px 8px;color:var(--text3);">'+_tarifaMedia.toFixed(2)+'€</td><td style="text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:700;padding:10px 8px;color:var(--text2);">'+_totCoste.toFixed(2)+'€</td><td style="text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:700;padding:10px 8px;color:'+(_pctCosteProd>40?'var(--red)':_pctCosteProd>25?'var(--amber)':'var(--green)')+';">'+_pctCosteProd.toFixed(1)+'%</td>'; })()
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
    var res=await syncroSupabaseFetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
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
        var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(_infJefeEditId)+'&select=*',{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
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
        await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/employee_status',{
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
      var pRes=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(_infJefeEditId),
        {method:'PATCH',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload)});
      if(!pRes.ok) throw new Error('HTTP '+pRes.status);
    } else {
      payload.id='inf_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
      var iRes=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/dept_reports',
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
      var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(_infJefeViewId)+'&select=*',{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
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
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/dept_reports?id=eq.'+encodeURIComponent(id),
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
    var sRes=await syncroSupabaseFetch(
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
    var res=await syncroSupabaseFetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) return null;
    var arr=await res.json();
    return arr[0]||null;
  } catch(e){ return null; }
};
window.infGetPublicados=async function(departamento,limite){
  limite=limite||10;
  try {
    var url=SUPABASE_URL+'/rest/v1/dept_reports?departamento=eq.'+encodeURIComponent(departamento)+'&estado=eq.publicado&order=ts.desc&limit='+limite+'&select=*';
    var res=await syncroSupabaseFetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) return [];
    return await res.json();
  } catch(e){ return []; }
};
// Devuelve empleados disponibles (excluye bajas/vacaciones activas) para un dept
window.infGetDisponibles=async function(departamento){
  try {
    var employees=await _infGetEmployees();
    var hoy=today();
    var sRes=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/employee_status?select=employee_id,tipo,fecha_fin',
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
function _infEntrClasificar(actividad, credits, instructor){
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

  // PT 50 min en piscina → credits>=2 DUO (1.5), credits=1 PT (1.0)
  if(/piscina\s*pt.*50|pt\s*50/.test(a)) {
    if(j <= 0) return null;
    if(j >= 2) return {kpi:'pt_duo', factor:1.5, efectiva:true};
    return {kpi:'pt', factor:1, efectiva:true};
  }

  // Entrenamiento personal → J decide individual / DUO / no-show
  if(/entrenamiento\s*personal/.test(a)) {
    if(j <= 0) return null;            // no-show, no cuenta
    if(j >= 2) return {kpi:'pt_duo', factor:1.5, efectiva:true};
    return {kpi:'pt', factor:1, efectiva:true};   // j=1 (y cualquier otro >0)
  }

  // Oleksandra Melnykova: Clase Natación + Swim Ladies siempre efectivas
  if(instructor){
    var instrN = String(instructor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    if(/oleksandra\s*melnykova/.test(instrN) && /clase\s*natacion|swim\s*ladies/.test(a)){
      if(j <= 0) return null;
      return {kpi:'dir_efectiva', factor:1, efectiva:true};
    }
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
    var cls=_infEntrClasificar(cols[cAct], cols[cCred], instrRaw);
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
