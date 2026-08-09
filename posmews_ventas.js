// ═══════════════════════════════════════════════════════════════════════
// POSMEWS_VENTAS.JS · Módulo Ventas/Datos POSMEWS
// Upload unificado 5 archivos, parsers, batch management
// Tablas: posmews_upload_batches, posmews_upload_files,
//         posmews_sales_data, posmews_payments_data, posmews_adjustments
// Dependencia: SheetJS (XLSX global) para parsear XLSX
// ═══════════════════════════════════════════════════════════════════════

// ── Estado del módulo ────────────────────────────────────────────────
var _pvWeek        = null;   // {inicio:'YYYY-MM-DD', fin:'YYYY-MM-DD'}
var _pvBatchId     = null;   // batch activo para la semana seleccionada
var _pvFileTicks   = {};     // {facturas:{ok,filename,ts}, acumulativo_ventas:{...}, ...}
var _pvParsedData  = null;   // datos parseados del Facturas CSV (preview producción)

// ── Definición de los 5 archivos POSMEWS ─────────────────────────────
var _PV_FILE_TYPES = [
  {key:'facturas',            label:'Facturas (producción)',        fmt:'csv',
   detect:function(t){ var h=(t.replace(/^﻿/,'').split(/\r?\n/)[0]||''); return h.indexOf('Fecha')>=0&&h.indexOf('Usuario')>=0&&h.indexOf('Total')>=0; },
   feedsParser:true,
   desc:'POSMEWS › Ventas → Facturas · CSV'},
  {key:'acumulativo_ventas',  label:'Acumulativo Ventas',           fmt:'xlsx',
   fnPattern:/acumulativo/i, xlsxDetect:'sheets>=3',
   desc:'POSMEWS › Informes → Ventas → Acumulativo · XLSX'},
  {key:'acumulativo_pagos',   label:'Acumulativo Pagos',            fmt:'xlsx',
   fnPattern:/acumulativo/i, xlsxDetect:'sheets<3',
   desc:'POSMEWS › Informes → Pagos → Acumulativo · XLSX'},
  {key:'compensaciones',      label:'Compensaciones y Anulaciones', fmt:'xlsx',
   fnPattern:/compensacion|anulacion/i,
   desc:'POSMEWS › Informes → Comps & Voids · XLSX'},
  {key:'descuentos',          label:'Descuentos',                   fmt:'xlsx',
   fnPattern:/descuento/i,
   desc:'POSMEWS › Informes → Descuentos · XLSX'}
];

// ── Helpers internos ─────────────────────────────────────────────────
function _pvReadText(file){
  return new Promise(function(ok,fail){
    var r=new FileReader();
    r.onload=function(e){ ok(e.target.result); };
    r.onerror=function(){ fail(new Error('Error leyendo archivo')); };
    r.readAsText(file,'utf-8');
  });
}
function _pvReadArrayBuffer(file){
  return new Promise(function(ok,fail){
    var r=new FileReader();
    r.onload=function(e){ ok(e.target.result); };
    r.onerror=function(){ fail(new Error('Error leyendo archivo')); };
    r.readAsArrayBuffer(file);
  });
}

function _pvGetWeekOf(dateStr){
  var d=dateStr?new Date(dateStr+'T12:00:00'):new Date();
  var day=d.getDay();
  var sun=new Date(d); sun.setDate(sun.getDate()-day);
  var sat=new Date(sun); sat.setDate(sat.getDate()+6);
  return {inicio:sun.toISOString().slice(0,10), fin:sat.toISOString().slice(0,10)};
}
function _pvFmtDate(iso){ if(!iso) return ''; var p=iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function _pvExtractDates(filename){
  var m=filename.match(/(\d{8})-(\d{8})/);
  if(!m) return null;
  var s=m[1],e=m[2];
  return {inicio:s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8), fin:e.slice(0,4)+'-'+e.slice(4,6)+'-'+e.slice(6,8)};
}
function _pvIs7Days(inicio,fin){
  var d1=new Date(inicio+'T12:00:00'),d2=new Date(fin+'T12:00:00');
  return Math.round((d2-d1)/(864e5))===6;
}

// ══════════════════════════════════════════════════════════════════════
// RENDER PRINCIPAL — llamado desde informes.js _infRenderSubTab
// ══════════════════════════════════════════════════════════════════════
async function renderPosmewsVentas(el){
  if(!_pvWeek) _pvWeek=_pvGetWeekOf();
  el.innerHTML=''
    +'<div class="card" style="margin-bottom:16px;">'
    +  '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px;">'
    +    '<div style="font-family:var(--font-mono);font-weight:700;font-size:13px;color:var(--text);">📋 Control semanal POSMEWS</div>'
    +    '<span id="pv-batch-status"></span>'
    +  '</div>'
    +  '<div style="font-size:10.5px;color:var(--text3);margin-bottom:14px;">Sube los 5 archivos obligatorios de cada semana (dom→sáb). Todos deben estar ✅ para marcar la semana como completa.</div>'
    +  '<div id="pv-control-body"></div>'
    // ── Instrucciones colapsables ──
    +  '<details style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">'
    +    '<summary style="font-family:var(--font-mono);font-weight:700;font-size:11px;color:var(--text2);cursor:pointer;user-select:none;">📋 Instrucciones: cómo descargar los 5 archivos de POSMEWS</summary>'
    +    '<div style="margin-top:10px;padding:12px;border:1px solid var(--border2);border-radius:8px;background:rgba(255,255,255,.02);">'
    +      '<div style="font-size:10px;color:var(--amber);border:1px solid var(--amber);border-radius:4px;padding:6px 8px;margin-bottom:10px;line-height:1.4;">pos.mews.com › <strong>LA SELLA ACADEMY SL</strong> · desde ordenador · periodo <strong>domingo → sábado</strong></div>'
    +      '<div style="font-size:10.5px;color:var(--text2);font-weight:700;margin-bottom:3px;">1 · Facturas (CSV)</div>'
    +      '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.4;">Menú › <strong style="color:var(--text2);">Ventas → Facturas</strong> → ajustar fechas dom→sáb → clic ⋮ → <strong style="color:var(--text2);">Exportar CSV</strong></div>'
    +      '<div style="font-size:10.5px;color:var(--text2);font-weight:700;margin-bottom:3px;">2 · Acumulativo Ventas (XLSX)</div>'
    +      '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.4;">Menú › <strong style="color:var(--text2);">Informes → Ventas</strong> → mismas fechas → clic ⋮ → <strong style="color:var(--text2);">Acumulativo</strong></div>'
    +      '<div style="font-size:10.5px;color:var(--text2);font-weight:700;margin-bottom:3px;">3 · Acumulativo Pagos (XLSX)</div>'
    +      '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.4;">Menú › <strong style="color:var(--text2);">Informes → Pagos</strong> → mismas fechas → clic ⋮ → <strong style="color:var(--text2);">Acumulativo</strong></div>'
    +      '<div style="font-size:10.5px;color:var(--text2);font-weight:700;margin-bottom:3px;">4 · Compensaciones y Anulaciones (XLSX)</div>'
    +      '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.4;">Menú › <strong style="color:var(--text2);">Informes → Compensaciones y Anulaciones</strong> → mismas fechas → descargar <strong style="color:var(--text2);">XLSX</strong></div>'
    +      '<div style="font-size:10.5px;color:var(--text2);font-weight:700;margin-bottom:3px;">5 · Descuentos (XLSX)</div>'
    +      '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;line-height:1.4;">Menú › <strong style="color:var(--text2);">Informes → Descuentos</strong> → mismas fechas → descargar <strong style="color:var(--text2);">XLSX</strong></div>'
    +    '</div>'
    +  '</details>'
    +'</div>'
    // ── Resultado de producción (preview al subir Facturas) ──
    +'<div id="pv-result"><div id="inf-sala-result"></div></div>';
  // Si hay datos parseados en memoria, mostrar preview
  if(_pvParsedData && typeof _renderSalaTabla==='function'){
    _renderSalaTabla(_pvParsedData,_pvParsedData._costData||{});
  }
  _pvRenderControlBody();
  _pvLoadBatch();
}
window.renderPosmewsVentas=renderPosmewsVentas;

// ── Navegación semanal ───────────────────────────────────────────────
window._pvPrev=function(){ _pvShiftWeek(-1); };
window._pvNext=function(){ _pvShiftWeek(1); };
function _pvShiftWeek(dir){
  var w=_pvWeek||_pvGetWeekOf();
  var d=new Date(w.inicio+'T12:00:00');
  d.setDate(d.getDate()+(dir*7));
  _pvWeek=_pvGetWeekOf(d.toISOString().slice(0,10));
  _pvFileTicks={};
  _pvBatchId=null;
  _pvParsedData=null;
  _pvRenderControlBody();
  _pvLoadBatch();
}

// ── Cargar batch existente para la semana ─────────────────────────────
async function _pvLoadBatch(){
  var w=_pvWeek||_pvGetWeekOf();
  var periodo=w.inicio+'_'+w.fin;
  try{
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_batches?periodo=eq.'+encodeURIComponent(periodo)+'&order=version.desc&limit=1',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) return;
    var batches=await res.json();
    if(batches.length){
      _pvBatchId=batches[0].id;
      var statusEl=document.getElementById('pv-batch-status');
      if(statusEl){
        var st=batches[0].status;
        var color=st==='complete'?'var(--green)':st==='error'?'var(--red)':'var(--amber)';
        statusEl.innerHTML='<span style="font-size:10px;font-family:var(--font-mono);color:'+color+';border:1px solid '+color+';border-radius:4px;padding:2px 8px;">Batch v'+batches[0].version+' · '+st.toUpperCase()+'</span>';
      }
      // Cargar archivos del batch
      var fRes=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_files?batch_id=eq.'+encodeURIComponent(_pvBatchId)+'&select=*',
        {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
      if(fRes.ok){
        var files=await fRes.json();
        _pvFileTicks={};
        files.forEach(function(f){
          _pvFileTicks[f.report_type]={ok:f.status==='ok',filename:f.original_name,ts:f.parsed_at,error:f.error_message};
        });
        _pvRenderControlBody();
      }
    } else {
      // No batch → verificar datos existentes en BD (legacy)
      await _pvCheckLegacyData(periodo);
    }
  }catch(e){ console.error('Error cargando batch:',e); }
}

// ── Verificar datos existentes en sala_produccion_semanal + sala_informes_control ──
async function _pvCheckLegacyData(periodo){
  try{
    // 1. Datos de producción en sala_produccion_semanal
    var prodRes=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_produccion_semanal?periodo=eq.'+encodeURIComponent(periodo)+'&select=id,nombre',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    var prodRows=prodRes.ok?await prodRes.json():[];
    // 2. Ticks legacy en sala_informes_control
    var legRes=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_informes_control?periodo=eq.'+encodeURIComponent(periodo)+'&select=tipo,filename,subido_ts',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    var legRows=legRes.ok?await legRes.json():[];
    // Marcar Facturas si existe producción guardada
    if(prodRows.length>0){
      _pvFileTicks['facturas']={ok:true,filename:'Guardado en BD ('+prodRows.length+' camareros)',ts:null,fromDB:true};
    }
    // Marcar otros archivos desde legacy ticks
    legRows.forEach(function(r){
      if(r.tipo&&!_pvFileTicks[r.tipo]){
        _pvFileTicks[r.tipo]={ok:true,filename:r.filename||'(registro legacy)',ts:r.subido_ts,fromDB:true};
      }
    });
    var nOk=0;
    _PV_FILE_TYPES.forEach(function(t){ if(_pvFileTicks[t.key]&&_pvFileTicks[t.key].ok) nOk++; });
    var statusEl=document.getElementById('pv-batch-status');
    if(statusEl&&nOk>0){
      var deleteBtn='';
      if(typeof isAdmin==='function'&&isAdmin(currentUser)){
        deleteBtn=' <button onclick="window._pvDeleteWeekData(\''+periodo+'\')" style="background:none;border:1px solid var(--red);border-radius:4px;color:var(--red);font-size:10px;font-family:var(--font-mono);padding:2px 8px;cursor:pointer;margin-left:6px;">🗑 Eliminar</button>';
      }
      statusEl.innerHTML='<span style="font-size:10px;font-family:var(--font-mono);color:var(--amber);border:1px solid var(--amber);border-radius:4px;padding:2px 8px;">📂 DATOS EXISTENTES · '+nOk+'/5</span>'+deleteBtn;
    }
    _pvRenderControlBody();
  }catch(e){ console.error('Error verificando datos legacy:',e); }
}

// ── Eliminar datos de la semana desde Ventas/Datos y refrescar ──
window._pvDeleteWeekData=function(periodo){
  if(typeof _infDeleteSemana!=='function'){ toast('Función de eliminación no disponible','err'); return; }
  _infDeleteSemana(periodo).then(function(deleted){
    if(deleted){_pvFileTicks={};_pvBatchId=null;_pvParsedData=null;_pvRenderControlBody();_pvLoadBatch();}
  });
};

// ── Crear o reutilizar batch ─────────────────────────────────────────
async function _pvEnsureBatch(){
  if(_pvBatchId) return _pvBatchId;
  var w=_pvWeek||_pvGetWeekOf();
  var periodo=w.inicio+'_'+w.fin;
  try{
    var row={
      week_start:w.inicio, week_end:w.fin, periodo:periodo,
      status:'pending', uploaded_by:currentUser?currentUser.nombre:'?',
      uploaded_at:localTs(), version:1
    };
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_batches?select=id',{
      method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
      'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(row)});
    if(!res.ok){
      // Puede existir — buscar último
      var existing=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_batches?periodo=eq.'+encodeURIComponent(periodo)+'&order=version.desc&limit=1',
        {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
      if(existing.ok){var arr=await existing.json(); if(arr.length){_pvBatchId=arr[0].id;return _pvBatchId;}}
      throw new Error('No se pudo crear batch');
    }
    var created=await res.json();
    _pvBatchId=created[0]?created[0].id:created.id;
    invalidateCache('posmews_upload_batches');
    return _pvBatchId;
  }catch(e){ console.error('Error creando batch:',e); throw e; }
}

// ── Guardar archivo en batch ─────────────────────────────────────────
async function _pvSaveFile(typeKey,filename,status,errorMsg,rowCount){
  var batchId=await _pvEnsureBatch();
  var fmt=_PV_FILE_TYPES.find(function(t){return t.key===typeKey;});
  var row={
    batch_id:batchId, report_type:typeKey, original_name:filename,
    format:fmt?fmt.fmt:'unknown', status:status||'ok',
    error_message:errorMsg||null, row_count:rowCount||null,
    parsed_at:localTs()
  };
  try{
    // Upsert: delete existing for this batch+type, then insert
    await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_files?batch_id=eq.'+encodeURIComponent(batchId)+'&report_type=eq.'+encodeURIComponent(typeKey),
      {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_files',{
      method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
      'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(row)});
    invalidateCache('posmews_upload_files');
  }catch(e){ console.error('Error guardando archivo:',e); }
  // Comprobar si todos los archivos están OK → marcar batch complete
  _pvCheckBatchComplete(batchId);
}

async function _pvCheckBatchComplete(batchId){
  try{
    var res=await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_files?batch_id=eq.'+encodeURIComponent(batchId)+'&status=eq.ok&select=report_type',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    if(!res.ok) return;
    var files=await res.json();
    var okTypes=files.map(function(f){return f.report_type;});
    var allOk=_PV_FILE_TYPES.every(function(t){return okTypes.indexOf(t.key)>=0;});
    if(allOk){
      await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/posmews_upload_batches?id=eq.'+encodeURIComponent(batchId),{
        method:'PATCH',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
        'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify({status:'complete',processed_at:localTs()})});
      invalidateCache('posmews_upload_batches');
      var statusEl=document.getElementById('pv-batch-status');
      if(statusEl) statusEl.innerHTML='<span style="font-size:10px;font-family:var(--font-mono);color:var(--green);border:1px solid var(--green);border-radius:4px;padding:2px 8px;">✅ BATCH COMPLETO</span>';
    }
  }catch(e){}
}

// ══════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE ARCHIVOS — drop/click → detectar tipo → validar → guardar
// ══════════════════════════════════════════════════════════════════════
window._pvDrop=function(ev){
  ev.preventDefault();
  var dz=document.getElementById('pv-dropzone');
  if(dz) dz.style.borderColor='var(--border2)';
  var files=ev.dataTransfer&&ev.dataTransfer.files;
  if(!files||!files.length) return;
  for(var i=0;i<files.length;i++) _pvValidateFile(files[i]);
};
window._pvFiles=function(inp){
  if(!inp||!inp.files) return;
  for(var i=0;i<inp.files.length;i++) _pvValidateFile(inp.files[i]);
  inp.value='';
};

async function _pvValidateFile(file){
  if(!_pvWeek) _pvWeek=_pvGetWeekOf();
  var ext=file.name.split('.').pop().toLowerCase();

  // ── 1. Detectar tipo ──
  var type=null;
  if(ext==='csv'){
    try{
      var text=await _pvReadText(file);
      file._text=text;
      _PV_FILE_TYPES.forEach(function(t){
        if(type||t.fmt!=='csv'||!t.detect) return;
        if(t.detect(text)) type=t;
      });
    }catch(e){}
  } else if(ext==='xlsx'){
    var xlsxMatches=[];
    _PV_FILE_TYPES.forEach(function(t){
      if(t.fmt==='xlsx'&&t.fnPattern&&t.fnPattern.test(file.name)) xlsxMatches.push(t);
    });
    if(xlsxMatches.length===1){
      type=xlsxMatches[0];
    } else if(xlsxMatches.length>1){
      try{
        var buf=await _pvReadArrayBuffer(file);
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

  // ── 2. Extensión ──
  if(ext!==type.fmt){
    toast(type.label+': formato incorrecto. Esperado .'+type.fmt+', recibido .'+ext,'err');
    _pvFileTicks[type.key]={ok:false,filename:file.name,error:'Formato .'+ext+' ≠ .'+type.fmt};
    _pvRenderControlBody();
    _pvSaveFile(type.key,file.name,'error','Formato incorrecto');
    return;
  }

  // ── 3. Fechas en nombre ──
  var dates=_pvExtractDates(file.name);
  if(!dates||!_pvIs7Days(dates.inicio,dates.fin)){
    var msg=dates?'Periodo no es 7 días (dom→sáb)':'No se detectan fechas en el nombre';
    toast(type.label+': '+msg,'err');
    _pvFileTicks[type.key]={ok:false,filename:file.name,error:msg};
    _pvRenderControlBody();
    _pvSaveFile(type.key,file.name,'error',msg);
    return;
  }

  // ── 4. Fechas coinciden con semana seleccionada ──
  if(dates.inicio!==_pvWeek.inicio||dates.fin!==_pvWeek.fin){
    toast(type.label+': periodo no coincide con semana seleccionada','err');
    _pvFileTicks[type.key]={ok:false,filename:file.name,error:'Periodo no coincide'};
    _pvRenderControlBody();
    _pvSaveFile(type.key,file.name,'error','Periodo no coincide');
    return;
  }

  // ── 5. Contenido ──
  if(ext==='csv'){/* detect() ya validó */}
  if(ext==='xlsx'){
    try{
      var chkBuf=await file.slice(0,4).arrayBuffer();
      var bytes=new Uint8Array(chkBuf);
      if(bytes[0]!==0x50||bytes[1]!==0x4B){
        toast(type.label+': archivo no es XLSX válido','err');
        _pvFileTicks[type.key]={ok:false,filename:file.name,error:'No es XLSX válido'};
        _pvRenderControlBody();
        _pvSaveFile(type.key,file.name,'error','No es XLSX válido');
        return;
      }
    }catch(e){}
  }

  // ── 6. OK ──
  _pvFileTicks[type.key]={ok:true,filename:file.name,ts:localTs()};
  _pvRenderControlBody();
  _pvSaveFile(type.key,file.name,'ok',null);
  toast('✅ '+type.label+' validado','ok');

  // ── 7. Alimentar tabla legacy sala_informes_control (compatibilidad) ──
  _pvSaveLegacyTick(type.key,file.name,dates);

  // ── 8. Facturas → auto-parse producción por camarero ──
  if(type.feedsParser&&file._text){
    try{
      var employees=typeof _infGetEmployees==='function'?await _infGetEmployees():[];
      var parsed=typeof _infParsePOSMEWS==='function'?_infParsePOSMEWS(file._text,employees):null;
      if(parsed){
        _pvParsedData=parsed;
        var costData={};
        if(parsed.fechas.length){
          try{ costData=typeof _infSalaCostLaboral==='function'?await _infSalaCostLaboral(parsed.fechas[0],parsed.fechas[parsed.fechas.length-1]):{};  }catch(x){}
        }
        _pvParsedData._costData=costData;
        // Reutilizar _infSalaData para que el botón Guardar funcione
        if(typeof _infSalaData!=='undefined') window._infSalaData=parsed;
        window._infSalaData=parsed;
        window._infSalaData._costData=costData;
        // Asegurar que #inf-sala-result existe (fallback a #pv-result)
        if(!document.getElementById('inf-sala-result')){
          var pvr=document.getElementById('pv-result');
          if(pvr && !pvr.querySelector('#inf-sala-result')){
            var d=document.createElement('div'); d.id='inf-sala-result'; pvr.appendChild(d);
          }
        }
        if(typeof _renderSalaTabla==='function') _renderSalaTabla(parsed,costData);
      }
    }catch(e){ console.error('Auto-parse Facturas:',e); }
  }
}

// ── Compatibilidad: guardar tick en sala_informes_control ──
async function _pvSaveLegacyTick(typeKey,filename,dates){
  var periodo=_pvWeek.inicio+'_'+_pvWeek.fin;
  var row={
    periodo:periodo, semana_inicio:_pvWeek.inicio, semana_fin:_pvWeek.fin,
    tipo:typeKey, filename:filename,
    formato_ok:true, periodo_ok:true, contenido_ok:true,
    subido_por:currentUser?currentUser.nombre:'?', subido_ts:localTs()
  };
  try{
    await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_informes_control?periodo=eq.'+encodeURIComponent(periodo)+'&tipo=eq.'+encodeURIComponent(typeKey),
      {method:'DELETE',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}});
    await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/sala_informes_control',{
      method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
      'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(row)});
    invalidateCache('sala_informes_control');
  }catch(e){}
}

// ══════════════════════════════════════════════════════════════════════
// RENDER CONTROL BODY — tarjetas de archivos + dropzone
// ══════════════════════════════════════════════════════════════════════
function _pvRenderControlBody(){
  var el=document.getElementById('pv-control-body');
  if(!el) return;
  var w=_pvWeek||_pvGetWeekOf();
  var nOk=0;
  _PV_FILE_TYPES.forEach(function(t){ if(_pvFileTicks[t.key]&&_pvFileTicks[t.key].ok) nOk++; });
  var completa=nOk===_PV_FILE_TYPES.length;
  var weekLabel=_pvFmtDate(w.inicio)+' — '+_pvFmtDate(w.fin);
  var statusBadge=completa
    ?'<span style="background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green);border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;font-family:var(--font-mono);">✅ COMPLETA '+nOk+'/5</span>'
    :'<span style="background:rgba(239,68,68,.1);color:var(--red);border:1px solid var(--red);border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;font-family:var(--font-mono);">❌ '+nOk+'/5</span>';

  var filas=_PV_FILE_TYPES.map(function(t){
    var tick=_pvFileTicks[t.key];
    var fmtBadge=t.fmt==='csv'
      ?'<span style="font-size:9px;font-weight:700;font-family:var(--font-mono);padding:2px 6px;border-radius:4px;background:rgba(46,204,113,.15);color:#57d38c;">CSV</span>'
      :'<span style="font-size:9px;font-weight:700;font-family:var(--font-mono);padding:2px 6px;border-radius:4px;background:rgba(245,158,11,.15);color:var(--amber);">XLSX</span>';
    var tickIcon,tickDetail;
    if(!tick){
      tickIcon='<span style="font-size:16px;opacity:.3;">☐</span>';
      tickDetail='<span style="font-size:10px;color:var(--text3);">Pendiente</span>';
    } else if(tick.ok){
      tickIcon=tick.fromDB?'<span style="font-size:16px;">📂</span>':'<span style="font-size:16px;">✅</span>';
      var _fnTxt=(typeof _escHtml==='function'?_escHtml(tick.filename||''):tick.filename||'');
      tickDetail='<span style="font-size:10px;color:'+(tick.fromDB?'var(--amber)':'var(--green)')+';font-family:var(--font-mono);">'+_fnTxt+'</span>';
    } else {
      tickIcon='<span style="font-size:16px;">❌</span>';
      tickDetail='<span style="font-size:10px;color:var(--red);">'+(typeof _escHtml==='function'?_escHtml(tick.error||tick.filename||'Error'):tick.error||'Error')+'</span>';
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
    +    '<button onclick="_pvPrev()" style="background:var(--bg4);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:14px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;">◄</button>'
    +    '<span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);">'+weekLabel+'</span>'
    +    '<button onclick="_pvNext()" style="background:var(--bg4);border:1px solid var(--border);border-radius:5px;color:var(--text2);font-size:14px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;">►</button>'
    +  '</div>'
    +  statusBadge
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">'+filas+'</div>'
    +'<div id="pv-dropzone" '
    +  'onclick="document.getElementById(\'pv-file-input\').click()" '
    +  'ondragover="event.preventDefault();this.style.borderColor=\'var(--amber)\'" '
    +  'ondragleave="this.style.borderColor=\'var(--border2)\'" '
    +  'ondrop="_pvDrop(event)" '
    +  'style="border:2px dashed var(--border2);border-radius:8px;padding:18px;text-align:center;cursor:pointer;transition:border-color .2s;">'
    +  '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text3);">📂 Arrastra archivos POSMEWS aquí <span style="font-size:10px;">(1 o varios a la vez)</span></div>'
    +'</div>'
    +'<input type="file" id="pv-file-input" multiple accept=".csv,.xlsx" style="display:none" onchange="_pvFiles(this)">';
}

// ══════════════════════════════════════════════════════════════════════
// FIX: Sub-tabs Informes no actualizan estilo visual al clic
// Wrapper sobre _infRenderSubTab para re-aplicar active/inactive
// ══════════════════════════════════════════════════════════════════════
(function(){
  if(typeof window._infRenderSubTab !== 'function') return;
  var _origSubTab = window._infRenderSubTab;
  window._infRenderSubTab = async function(){
    await _origSubTab.apply(this, arguments);
    // Buscar contenedor de sub-tabs y actualizar estilos
    var cards = document.querySelectorAll('.card');
    var subTabRow = null;
    for(var i=0;i<cards.length;i++){
      var btns = cards[i].querySelectorAll('button[onclick*="_infSubTab"]');
      if(btns.length > 1){ subTabRow = cards[i]; break; }
    }
    if(!subTabRow) return;
    var btns = subTabRow.querySelectorAll('button[onclick*="_infSubTab"]');
    var labels = typeof INF_SUBTAB_LABELS !== 'undefined' ? INF_SUBTAB_LABELS : {};
    var activeLabel = labels[window._infSubTab] || window._infSubTab || '';
    btns.forEach(function(btn){
      var isActive = btn.textContent.trim() === activeLabel.trim();
      if(isActive){
        btn.style.background = 'var(--amber)';
        btn.style.color = '#0d1b2e';
        btn.style.borderColor = 'var(--amber)';
      } else {
        btn.style.background = 'var(--bg2)';
        btn.style.color = 'var(--text2)';
        btn.style.borderColor = 'var(--border)';
      }
    });
  };
})();
