// ═══════════════════════════════════════════════════════════════════════
// ADJUNTOS + VISIBILIDAD INCIDENCIAS — SYNCRO SHIFT
// Carga ÚLTIMO en index.html (después de todos los módulos).
// No modifica archivos existentes — se engancha via wrapping.
//
// PARTE 1: Adjuntos (upload/delete/render archivos)
// PARTE 2: Visibilidad incidencias (dept creación + dept staff implicado)
//
// Depende de (shared.js): SUPABASE_URL, SUPABASE_KEY, getDB, dbUpdate,
//   invalidateCache, auditLog, toast, localTs, currentUser, genId,
//   isAdmin, isSupervisor, canViewDepartment, getSupervisorDepartments,
//   normalizeDeptName, getRecordDepartment, formatDisplayValue,
//   INCIDENT_STATES, normalizeIncidentState, isIncidentOpen,
//   TASK_STATES, normalizeTaskState, isTaskOpen, isOverdue
// ═══════════════════════════════════════════════════════════════════════

// ╔═══════════════════════════════════════════════════════════════════╗
// ║  PARTE 1 — ADJUNTOS                                             ║
// ╚═══════════════════════════════════════════════════════════════════╝

// ── CONFIG ────────────────────────────────────────────────────────────
var ADJ_BUCKET   = 'adjuntos';
var ADJ_MAX_FILES = 5;
var ADJ_MAX_SIZE  = 10 * 1024 * 1024; // 10 MB por archivo

// ── CSS (inyectado una vez) ───────────────────────────────────────────
(function _adjInjectCSS(){
  if(document.getElementById('adj-css')) return;
  var s = document.createElement('style');
  s.id = 'adj-css';
  s.textContent = [
    '.adj-zone{border:2px dashed var(--border);border-radius:8px;padding:12px;margin-top:8px;',
    '  background:var(--bg);transition:border-color .2s,background .2s;}',
    '.adj-zone.drag-over{border-color:var(--blue);background:rgba(59,130,246,.06);}',
    '.adj-zone-label{font-size:12px;color:var(--text3);text-align:center;cursor:pointer;',
    '  display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 0;}',
    '.adj-zone-label:hover{color:var(--text);}',
    '.adj-list{display:flex;flex-direction:column;gap:6px;margin-top:8px;}',
    '.adj-item{display:flex;align-items:center;gap:8px;padding:6px 10px;',
    '  background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:12px;}',
    '.adj-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
    '  color:var(--text);font-family:var(--font-mono);font-size:11px;}',
    '.adj-item-name a{color:var(--blue);text-decoration:none;}',
    '.adj-item-name a:hover{text-decoration:underline;}',
    '.adj-item-size{color:var(--text3);font-size:10px;flex-shrink:0;}',
    '.adj-item-del{background:none;border:none;color:var(--red);cursor:pointer;',
    '  font-size:14px;padding:2px 4px;border-radius:4px;flex-shrink:0;}',
    '.adj-item-del:hover{background:rgba(239,68,68,.1);}',
    '.adj-thumb{width:32px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;}',
    '.adj-count{font-size:11px;color:var(--text3);margin-top:4px;text-align:right;}',
    '.adj-pending{display:flex;flex-direction:column;gap:4px;margin-top:6px;}',
    '.adj-pending-item{display:flex;align-items:center;gap:6px;padding:4px 8px;',
    '  background:rgba(59,130,246,.06);border:1px solid var(--blue);border-radius:4px;',
    '  font-size:11px;color:var(--text2);}',
    '.adj-pending-item .adj-item-del{color:var(--text3);}',
    '.adj-uploading{opacity:.6;pointer-events:none;}',
  ].join('\n');
  document.head.appendChild(s);
})();

// ── SUPABASE STORAGE API ──────────────────────────────────────────────

async function adjuntoUpload(file, table, recordId){
  var safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
  var ts = Date.now();
  var path = table + '/' + recordId + '/' + ts + '_' + safeName;
  var res = await syncroSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + ADJ_BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: file
  });
  if(!res.ok){
    var errText = '';
    try { errText = (await res.json()).message || ''; } catch(e){}
    throw new Error('Upload failed: ' + res.status + ' ' + errText);
  }
  return {
    name: file.name, path: path, size: file.size,
    type: file.type || 'application/octet-stream',
    uploaded_by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.nombre : 'Sistema',
    uploaded_at: localTs()
  };
}

async function adjuntoRemove(path){
  var res = await syncroSupabaseFetch(SUPABASE_URL + '/storage/v1/object/' + ADJ_BUCKET + '/' + path, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  return res.ok;
}

function adjuntoPublicUrl(path){
  return SUPABASE_URL + '/storage/v1/object/public/' + ADJ_BUCKET + '/' + path;
}

// ── DB: leer y guardar adjuntos de un registro ────────────────────────

async function adjuntoGetFromRecord(table, recordId){
  var rows = await getDB(table);
  var rec = rows.find(function(r){ return r.id === recordId; });
  if(!rec) return [];
  var adj = rec.adjuntos;
  if(!adj) return [];
  if(typeof adj === 'string'){ try { adj = JSON.parse(adj); } catch(e){ return []; } }
  return Array.isArray(adj) ? adj : [];
}

async function adjuntoSaveToRecord(table, recordId, adjuntosArray){
  await dbUpdate(table, recordId, { adjuntos: JSON.stringify(adjuntosArray), updated_at: localTs() });
  invalidateCache(table);
}

// ── UPLOAD BATCH ──────────────────────────────────────────────────────

async function adjuntoUploadBatch(files, table, recordId){
  if(!files || !files.length) return [];
  var existing = await adjuntoGetFromRecord(table, recordId);
  if(existing.length + files.length > ADJ_MAX_FILES){
    toast('Máximo ' + ADJ_MAX_FILES + ' archivos. Ya hay ' + existing.length + '.', 'err');
    return existing;
  }
  var newAdj = [];
  for(var i = 0; i < files.length; i++){
    var f = files[i];
    if(f.size > ADJ_MAX_SIZE){ toast(f.name + ': excede 10 MB', 'err'); continue; }
    try { newAdj.push(await adjuntoUpload(f, table, recordId)); }
    catch(e){ toast('Error subiendo ' + f.name + ': ' + e.message, 'err'); }
  }
  if(!newAdj.length) return existing;
  var merged = existing.concat(newAdj);
  await adjuntoSaveToRecord(table, recordId, merged);
  auditLog('ADJUNTO_UPLOAD', table + '/' + recordId + ' — ' + newAdj.map(function(a){ return a.name; }).join(', '));
  toast(newAdj.length + ' archivo(s) adjuntado(s)', 'ok');
  return merged;
}

async function adjuntoRemoveFromRecord(table, recordId, path){
  var existing = await adjuntoGetFromRecord(table, recordId);
  var filtered = existing.filter(function(a){ return a.path !== path; });
  await adjuntoRemove(path);
  await adjuntoSaveToRecord(table, recordId, filtered);
  auditLog('ADJUNTO_DELETE', table + '/' + recordId + ' — ' + path.split('/').pop());
  toast('Archivo eliminado', 'ok');
  return filtered;
}

// ── UI: INPUT DE ARCHIVOS ─────────────────────────────────────────────

function adjuntoRenderInput(containerId, inputId){
  var container = document.getElementById(containerId);
  if(!container) return null;
  container.innerHTML =
    '<div class="adj-zone" id="' + inputId + '-zone">'
    + '<label class="adj-zone-label" for="' + inputId + '">'
    + '📎 Adjuntar archivos <span style="color:var(--text3);font-size:10px;">(máx ' + ADJ_MAX_FILES + ', 10MB/archivo)</span>'
    + '</label>'
    + '<input type="file" id="' + inputId + '" multiple'
    + ' style="display:none;" onchange="adjuntoOnSelect(this,\'' + inputId + '\')">'
    + '<div class="adj-pending" id="' + inputId + '-pending"></div>'
    + '</div>';
  var zone = document.getElementById(inputId + '-zone');
  if(zone){
    zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function(e){
      e.preventDefault(); zone.classList.remove('drag-over');
      var input = document.getElementById(inputId);
      if(input && e.dataTransfer.files.length){
        var dt = new DataTransfer();
        var prev = input.files || [];
        for(var i = 0; i < prev.length; i++) dt.items.add(prev[i]);
        for(var j = 0; j < e.dataTransfer.files.length; j++) dt.items.add(e.dataTransfer.files[j]);
        input.files = dt.files;
        adjuntoOnSelect(input, inputId);
      }
    });
  }
  return container;
}

function adjuntoOnSelect(input, inputId){
  var pendEl = document.getElementById(inputId + '-pending');
  if(!pendEl) return;
  var files = input.files;
  if(!files || !files.length){ pendEl.innerHTML = ''; return; }
  if(files.length > ADJ_MAX_FILES){ toast('Máximo ' + ADJ_MAX_FILES + ' archivos', 'err'); input.value = ''; pendEl.innerHTML = ''; return; }
  var html = '';
  for(var i = 0; i < files.length; i++){
    var f = files[i];
    var sizeStr = f.size < 1024 ? f.size + ' B' : f.size < 1048576 ? Math.round(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB';
    var icon = _adjFileIcon(f.type, f.name);
    var oversize = f.size > ADJ_MAX_SIZE ? ' style="color:var(--red);text-decoration:line-through;"' : '';
    html += '<div class="adj-pending-item">' + icon
      + '<span class="adj-item-name"' + oversize + '>' + _adjEsc(f.name) + '</span>'
      + '<span class="adj-item-size"' + (f.size > ADJ_MAX_SIZE ? ' style="color:var(--red)"' : '') + '>' + sizeStr + '</span>'
      + '<button class="adj-item-del" onclick="adjuntoRemovePending(\'' + inputId + '\',' + i + ')" title="Quitar">✕</button></div>';
  }
  pendEl.innerHTML = html;
}

function adjuntoRemovePending(inputId, index){
  var input = document.getElementById(inputId);
  if(!input) return;
  var dt = new DataTransfer();
  for(var i = 0; i < input.files.length; i++){ if(i !== index) dt.items.add(input.files[i]); }
  input.files = dt.files;
  adjuntoOnSelect(input, inputId);
}

function adjuntoCollectFiles(inputId){
  var input = document.getElementById(inputId);
  if(!input || !input.files || !input.files.length) return [];
  var arr = [];
  for(var i = 0; i < input.files.length; i++) arr.push(input.files[i]);
  return arr;
}

// ── UI: VISOR DE ADJUNTOS ─────────────────────────────────────────────

function adjuntoRenderViewer(adjuntos, table, recordId, editable){
  if(!adjuntos) adjuntos = [];
  if(typeof adjuntos === 'string'){ try { adjuntos = JSON.parse(adjuntos); } catch(e){ adjuntos = []; } }
  var html = '<div style="margin-top:10px;">';
  html += '<div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">📎 Adjuntos (' + adjuntos.length + '/' + ADJ_MAX_FILES + ')</div>';
  if(adjuntos.length){
    html += '<div class="adj-list">';
    for(var i = 0; i < adjuntos.length; i++){
      var a = adjuntos[i];
      var url = adjuntoPublicUrl(a.path);
      var sizeStr = a.size < 1024 ? a.size + ' B' : a.size < 1048576 ? Math.round(a.size / 1024) + ' KB' : (a.size / 1048576).toFixed(1) + ' MB';
      var isImg = a.type && a.type.indexOf('image/') === 0;
      html += '<div class="adj-item">';
      if(isImg) html += '<img class="adj-thumb" src="' + url + '" alt="" loading="lazy">';
      else html += _adjFileIcon(a.type, a.name);
      html += '<span class="adj-item-name"><a href="' + url + '" target="_blank" rel="noopener">' + _adjEsc(a.name) + '</a></span>';
      html += '<span class="adj-item-size">' + sizeStr + '</span>';
      if(editable) html += '<button class="adj-item-del" onclick="adjuntoDeleteFromViewer(\'' + table + '\',\'' + recordId + '\',\'' + _adjEsc(a.path) + '\')" title="Eliminar">🗑</button>';
      html += '</div>';
    }
    html += '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--text3);padding:4px 0;">Sin adjuntos</div>';
  }
  if(editable && adjuntos.length < ADJ_MAX_FILES){
    var uid = 'adj-viewer-' + table + '-' + recordId;
    html += '<div style="margin-top:8px;"><div class="adj-zone" id="' + uid + '-zone">'
      + '<label class="adj-zone-label" for="' + uid + '">＋ Añadir archivo</label>'
      + '<input type="file" id="' + uid + '" multiple style="display:none;"'
      + ' onchange="adjuntoUploadFromViewer(\'' + table + '\',\'' + recordId + '\',this)">'
      + '</div></div>';
  }
  html += '</div>';
  return html;
}

async function adjuntoUploadFromViewer(table, recordId, input){
  if(!input.files || !input.files.length) return;
  var files = [];
  for(var i = 0; i < input.files.length; i++) files.push(input.files[i]);
  var zone = input.closest('.adj-zone');
  if(zone) zone.classList.add('adj-uploading');
  try { await adjuntoUploadBatch(files, table, recordId); } catch(e){ toast('Error: ' + e.message, 'err'); }
  if(zone) zone.classList.remove('adj-uploading');
  input.value = '';
  _adjRefreshViewer(table, recordId);
}

async function adjuntoDeleteFromViewer(table, recordId, path){
  if(!confirm('¿Eliminar este archivo?')) return;
  try { await adjuntoRemoveFromRecord(table, recordId, path); _adjRefreshViewer(table, recordId); }
  catch(e){ toast('Error: ' + e.message, 'err'); }
}

async function _adjRefreshViewer(table, recordId){
  var adjuntos = await adjuntoGetFromRecord(table, recordId);
  var containers = document.querySelectorAll('[data-adj-viewer="' + table + '-' + recordId + '"]');
  containers.forEach(function(c){
    var editable = c.getAttribute('data-adj-editable') === 'true';
    c.innerHTML = adjuntoRenderViewer(adjuntos, table, recordId, editable);
    _adjSetupDragDrop(c, table, recordId);
  });
}

function _adjSetupDragDrop(container, table, recordId){
  var zones = container.querySelectorAll('.adj-zone');
  zones.forEach(function(zone){
    zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function(e){
      e.preventDefault(); zone.classList.remove('drag-over');
      if(e.dataTransfer.files.length){
        var files = [];
        for(var i = 0; i < e.dataTransfer.files.length; i++) files.push(e.dataTransfer.files[i]);
        zone.classList.add('adj-uploading');
        adjuntoUploadBatch(files, table, recordId).then(function(){
          zone.classList.remove('adj-uploading'); _adjRefreshViewer(table, recordId);
        }).catch(function(err){ zone.classList.remove('adj-uploading'); toast('Error: ' + err.message, 'err'); });
      }
    });
  });
}

// ── HELPERS INTERNOS ──────────────────────────────────────────────────

function _adjEsc(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _adjFileIcon(mimeType, name){
  mimeType = mimeType || ''; name = (name || '').toLowerCase();
  if(mimeType.indexOf('image/') === 0) return '🖼️ ';
  if(mimeType.indexOf('video/') === 0) return '🎬 ';
  if(mimeType === 'application/pdf' || name.endsWith('.pdf')) return '📄 ';
  if(mimeType.indexOf('spreadsheet') >= 0 || name.endsWith('.xlsx') || name.endsWith('.csv')) return '📊 ';
  if(mimeType.indexOf('word') >= 0 || name.endsWith('.docx')) return '📝 ';
  return '📎 ';
}

// ═══════════════════════════════════════════════════════════════════════
// HOOKS — ADJUNTOS (wrapping de funciones existentes)
// ═══════════════════════════════════════════════════════════════════════

// ── Interceptor de dbInsert ───────────────────────────────────────────
(function(){
  window._adjLastInserted = null;
  var _origDbInsert = window.dbInsert;
  window.dbInsert = async function(table, row){
    var result = await _origDbInsert.apply(this, arguments);
    if(table === 'gestiones' || table === 'incidencias' || table === 'tareas'){
      window._adjLastInserted = { table: table, id: row.id, ts: Date.now() };
    }
    return result;
  };
})();

// ── Inyección de file inputs en formularios ───────────────────────────

// Helper: inyectar drop zone en un contenedor padre
function _adjInjectInto(parentEl, containerId, inputId, spanClass){
  if(!parentEl || document.getElementById(containerId)) return;
  var div = document.createElement('div');
  div.id = containerId;
  div.className = 'fg' + (spanClass ? ' ' + spanClass : '');
  parentEl.appendChild(div);
  adjuntoRenderInput(containerId, inputId);
  console.log('ADJ: inyectado', containerId);
}

function _adjInjectInputs(){
  // block-gestion (turno form) — .grid1 dentro del dyn-block estático
  var gBlock = document.getElementById('block-gestion');
  if(gBlock){
    var gGrid = gBlock.querySelector('.grid1');
    _adjInjectInto(gGrid, 'adj-gestion-container', 'adj-gestion-input', '');
  }
  // block-incidencia (turno form) — .grid1 dentro del dyn-block estático
  var iBlock = document.getElementById('block-incidencia');
  if(iBlock){
    var iGrid = iBlock.querySelector('.grid1');
    _adjInjectInto(iGrid, 'adj-incidencia-container', 'adj-incidencia-input', '');
  }
  // modal-tarea (estático en HTML) — .grid2 dentro del modal
  var tModal = document.getElementById('modal-tarea');
  if(tModal){
    var tGrid = tModal.querySelector('.grid2');
    _adjInjectInto(tGrid, 'adj-tarea-container', 'adj-tarea-input', 'sp2');
  }
  // modal-new-gestion (dinámico, creado por openNewGestionStandalone)
  // Estructura: .modal-b > .fg (NO hay .grid1/.grid2)
  var ngModal = document.getElementById('modal-new-gestion');
  if(ngModal){
    var ngBody = ngModal.querySelector('.modal-b');
    _adjInjectInto(ngBody, 'adj-new-gestion-container', 'adj-new-gestion-input', '');
  }
  // modal-new-inci (dinámico, creado por openNewIncidenciaStandalone)
  // Estructura: .modal-b > .fg (NO hay .grid1/.grid2)
  var niModal = document.getElementById('modal-new-inci');
  if(niModal){
    var niBody = niModal.querySelector('.modal-b');
    _adjInjectInto(niBody, 'adj-new-inci-container', 'adj-new-inci-input', '');
  }
}

// ── Wrappers de open* para inyectar DESPUÉS de crear modales dinámicos ──
(function(){
  if(typeof window.openNewGestionStandalone !== 'function') return;
  var _origOpen = window.openNewGestionStandalone;
  window.openNewGestionStandalone = function(){
    _origOpen.apply(this, arguments);
    setTimeout(function(){
      var m = document.getElementById('modal-new-gestion');
      if(m){ _adjInjectInto(m.querySelector('.modal-b'), 'adj-new-gestion-container', 'adj-new-gestion-input', ''); }
    }, 50);
  };
})();
(function(){
  if(typeof window.openNewIncidenciaStandalone !== 'function') return;
  var _origOpen = window.openNewIncidenciaStandalone;
  window.openNewIncidenciaStandalone = function(){
    _origOpen.apply(this, arguments);
    setTimeout(function(){
      var m = document.getElementById('modal-new-inci');
      if(m){ _adjInjectInto(m.querySelector('.modal-b'), 'adj-new-inci-container', 'adj-new-inci-input', ''); }
    }, 50);
  };
})();
(function(){
  if(typeof window.openTaskModal !== 'function') return;
  var _origOpen = window.openTaskModal;
  window.openTaskModal = function(){
    _origOpen.apply(this, arguments);
    setTimeout(function(){
      var m = document.getElementById('modal-tarea');
      if(m){ _adjInjectInto(m.querySelector('.grid2'), 'adj-tarea-container', 'adj-tarea-input', 'sp2'); }
    }, 50);
  };
})();

document.addEventListener('DOMContentLoaded', function(){
  _adjInjectInputs();
  var obs = new MutationObserver(function(muts){
    for(var i = 0; i < muts.length; i++){ if(muts[i].addedNodes.length){ _adjInjectInputs(); break; } }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
// Fallback: si DOMContentLoaded ya disparó (scripts al final de body)
if(document.readyState === 'complete' || document.readyState === 'interactive'){
  setTimeout(_adjInjectInputs, 100);
  setTimeout(_adjInjectInputs, 500);
  setTimeout(_adjInjectInputs, 2000);
}

// ── Wrapper _doSaveTurno ──────────────────────────────────────────────
(function(){
  if(typeof window._doSaveTurno !== 'function') return;
  var _origDoSaveTurno = window._doSaveTurno;
  window._doSaveTurno = async function(){
    var gFiles = adjuntoCollectFiles('adj-gestion-input');
    var iFiles = adjuntoCollectFiles('adj-incidencia-input');
    var prevShiftId = window._lastSavedShiftId;
    await _origDoSaveTurno.apply(this, arguments);
    var newShiftId = window._lastSavedShiftId;
    if(!newShiftId || newShiftId === prevShiftId) return;
    if(gFiles.length){
      try {
        invalidateCache('gestiones');
        var gg = await getDB('gestiones');
        var gRec = null;
        for(var g = 0; g < gg.length; g++){ if(gg[g].shift_id === newShiftId){ gRec = gg[g]; break; } }
        if(gRec) await adjuntoUploadBatch(gFiles, 'gestiones', gRec.id);
      } catch(e){ console.error('Adjuntos gestión error:', e); }
    }
    if(iFiles.length){
      try {
        invalidateCache('incidencias');
        var ii = await getDB('incidencias');
        var iRec = null;
        for(var k = ii.length - 1; k >= 0; k--){ if(ii[k].shift_id === newShiftId){ iRec = ii[k]; break; } }
        if(iRec) await adjuntoUploadBatch(iFiles, 'incidencias', iRec.id);
      } catch(e){ console.error('Adjuntos incidencia error:', e); }
    }
  };
})();

// ── Wrapper saveTask ──────────────────────────────────────────────────
(function(){
  if(typeof window.saveTask !== 'function') return;
  var _origSaveTask = window.saveTask;
  window.saveTask = async function(){
    var tFiles = adjuntoCollectFiles('adj-tarea-input');
    window._adjLastInserted = null;
    await _origSaveTask.apply(this, arguments);
    var last = window._adjLastInserted;
    if(tFiles.length && last && last.table === 'tareas'){
      try { await adjuntoUploadBatch(tFiles, 'tareas', last.id); } catch(e){ console.error('Adjuntos tarea error:', e); }
    }
  };
})();

// ── Wrapper saveNewGestionStandalone ───────────────────────────────────
(function(){
  if(typeof window.saveNewGestionStandalone !== 'function') return;
  var _orig = window.saveNewGestionStandalone;
  window.saveNewGestionStandalone = async function(){
    var files = adjuntoCollectFiles('adj-new-gestion-input');
    window._adjLastInserted = null;
    await _orig.apply(this, arguments);
    var last = window._adjLastInserted;
    if(files.length && last && last.table === 'gestiones'){
      try { await adjuntoUploadBatch(files, 'gestiones', last.id); } catch(e){ console.error(e); }
    }
  };
})();

// ── Wrapper saveNewIncidenciaStandalone ────────────────────────────────
(function(){
  if(typeof window.saveNewIncidenciaStandalone !== 'function') return;
  var _orig = window.saveNewIncidenciaStandalone;
  window.saveNewIncidenciaStandalone = async function(){
    var files = adjuntoCollectFiles('adj-new-inci-input');
    window._adjLastInserted = null;
    await _orig.apply(this, arguments);
    var last = window._adjLastInserted;
    if(files.length && last && last.table === 'incidencias'){
      try { await adjuntoUploadBatch(files, 'incidencias', last.id); } catch(e){ console.error(e); }
    }
  };
})();

// ── Wrapper _dashShowDetail — añade visor de adjuntos ─────────────────
(function(){
  if(typeof window._dashShowDetail !== 'function') return;
  var _orig = window._dashShowDetail;
  window._dashShowDetail = async function(id, table){
    await _orig.apply(this, arguments);
    if(table !== 'gestiones' && table !== 'incidencias' && table !== 'tareas') return;
    var overlay = document.getElementById('dash-detail-overlay');
    if(!overlay) return;
    var body = overlay.querySelector('.dash-detail-body');
    if(!body) return;
    var adjuntos = await adjuntoGetFromRecord(table, id);
    var editable = false;
    if(typeof canActAsAdmin === 'function') editable = canActAsAdmin(currentUser);
    if(!editable && typeof isSupervisor === 'function') editable = isSupervisor(currentUser);
    var adjContainer = document.createElement('div');
    adjContainer.setAttribute('data-adj-viewer', table + '-' + id);
    adjContainer.setAttribute('data-adj-editable', editable ? 'true' : 'false');
    adjContainer.innerHTML = adjuntoRenderViewer(adjuntos, table, id, editable);
    body.appendChild(adjContainer);
    _adjSetupDragDrop(adjContainer, table, id);
  };
})();

// ── Wrapper renderTareas — indicador de adjuntos en tarjetas ──────────
(function(){
  if(typeof window.renderTareas !== 'function') return;
  var _orig = window.renderTareas;
  window.renderTareas = async function(){
    await _orig.apply(this, arguments);
    var listEl = document.getElementById('tareas-list');
    if(!listEl) return;
    var cards = listEl.querySelectorAll('.task-card');
    if(!cards.length) return;
    var tareas = await getDB('tareas');
    cards.forEach(function(card){
      var btns = card.querySelectorAll('button[onclick]');
      var taskId = null;
      btns.forEach(function(btn){
        var m = btn.getAttribute('onclick').match(/(?:advanceTask|deleteTask)\('([^']+)'/);
        if(m) taskId = m[1];
      });
      if(!taskId) return;
      var tarea = tareas.find(function(t){ return t.id === taskId; });
      if(!tarea) return;
      var adj = tarea.adjuntos;
      if(typeof adj === 'string'){ try { adj = JSON.parse(adj); } catch(e){ adj = []; } }
      if(!adj || !adj.length) adj = [];
      var meta = card.querySelector('.task-meta');
      if(meta && !meta.querySelector('.adj-badge') && adj.length > 0){
        var badge = document.createElement('span');
        badge.className = 'badge b-gray adj-badge';
        badge.style.cssText = 'cursor:pointer;font-size:10px;';
        badge.textContent = '📎 ' + adj.length;
        badge.title = 'Ver adjuntos';
        badge.onclick = function(){ _adjToggleTaskFiles(taskId, card); };
        meta.appendChild(badge);
      }
      var footer = card.querySelector('.task-actions');
      if(footer && !footer.querySelector('.adj-task-btn')){
        var adjBtn = document.createElement('button');
        adjBtn.className = 'btn btn-secondary btn-sm adj-task-btn';
        adjBtn.textContent = '📎';
        adjBtn.title = 'Adjuntos';
        adjBtn.style.cssText = 'font-size:11px;';
        adjBtn.onclick = function(){ _adjToggleTaskFiles(taskId, card); };
        footer.insertBefore(adjBtn, footer.firstChild);
      }
    });
  };
})();

async function _adjToggleTaskFiles(taskId, card){
  var existing = card.querySelector('.adj-task-panel');
  if(existing){ existing.remove(); return; }
  var adjuntos = await adjuntoGetFromRecord('tareas', taskId);
  var editable = false;
  if(typeof canActAsAdmin === 'function') editable = canActAsAdmin(currentUser);
  if(!editable && typeof canProgressTask === 'function'){
    var tareas = await getDB('tareas');
    var t = tareas.find(function(x){ return x.id === taskId; });
    if(t) editable = canProgressTask(t);
  }
  var panel = document.createElement('div');
  panel.className = 'adj-task-panel';
  panel.setAttribute('data-adj-viewer', 'tareas-' + taskId);
  panel.setAttribute('data-adj-editable', editable ? 'true' : 'false');
  panel.style.cssText = 'padding:8px 0;border-top:1px solid var(--border);margin-top:8px;';
  panel.innerHTML = adjuntoRenderViewer(adjuntos, 'tareas', taskId, editable);
  card.appendChild(panel);
  _adjSetupDragDrop(panel, 'tareas', taskId);
}

// ── Wrapper renderGestionesScreen — re-inyectar inputs ────────────────
(function(){
  if(typeof window.renderGestionesScreen !== 'function') return;
  var _orig = window.renderGestionesScreen;
  window.renderGestionesScreen = async function(){
    await _orig.apply(this, arguments);
    setTimeout(_adjInjectInputs, 100);
  };
})();

// ── Wrapper renderIncidenciasScreen — re-inyectar inputs ──────────────
// NOTA: esta función se REEMPLAZA completamente más abajo (PARTE 2)
// para fix de visibilidad. La re-inyección se hace allí.


// ╔═══════════════════════════════════════════════════════════════════╗
// ║  PARTE 2 — VISIBILIDAD INCIDENCIAS                              ║
// ║  Jefe ve incidencias de su dept + donde staff_implicado es de    ║
// ║  su dept. Corrige 2 bugs:                                       ║
// ║  1) renderIncidenciasScreen usaba === en vez de canViewDepartment║
// ║  2) Nadie revisaba staff_implicado_ids para visibilidad          ║
// ╚═══════════════════════════════════════════════════════════════════╝

// ── CACHE DE EMPLEADOS (por ID → {area, nombre, ...}) ─────────────────
var _adjEmpCache = null;
var _adjEmpCacheTs = 0;

async function _adjGetEmployeeMap(){
  var now = Date.now();
  if(_adjEmpCache && (now - _adjEmpCacheTs) < 30000) return _adjEmpCache;
  var emps = [];
  try { emps = await getDB('employees'); } catch(e){}
  var map = {};
  emps.forEach(function(e){ if(e.id) map[e.id] = e; });
  _adjEmpCache = map;
  _adjEmpCacheTs = now;
  return map;
}

// ── HELPER: ¿el supervisor puede ver esta incidencia? ─────────────────
// true si:
//   1) dept de la incidencia está en los departamentos del supervisor, O
//   2) algún employee_id en staff_implicado_ids pertenece a un dept del supervisor
function canViewIncidencia(user, inci, empMap){
  if(isAdmin(user)) return true;
  // Check 1: departamento directo (puede ser resuelto o legacy 'SYNCROLAB')
  var iDept = inci.departamento || inci.area || '';
  // Si dept es raw 'SYNCROLAB', resolver via el creador de la incidencia
  if(/^syncrolab$/i.test(iDept.trim()) && empMap && inci.employee_id){
    var creator = empMap[inci.employee_id];
    if(creator && typeof _deptCatalogo === 'function'){
      var resolved = _deptCatalogo(creator);
      if(resolved) iDept = resolved;
    }
  }
  if(canViewDepartment(user, iDept)) return true;
  // Check 2: departamentos del staff implicado (usar _deptCatalogo)
  if(!empMap) return false;
  var staffIds = [];
  try { staffIds = JSON.parse(inci.staff_implicado_ids || '[]'); } catch(e){}
  for(var i = 0; i < staffIds.length; i++){
    var emp = empMap[staffIds[i]];
    if(!emp) continue;
    var empDept = (typeof _deptCatalogo === 'function') ? _deptCatalogo(emp) : (emp.area||'');
    if(empDept && canViewDepartment(user, empDept)) return true;
  }
  return false;
}

// ── REEMPLAZO: renderIncidenciasScreen ────────────────────────────────
// Fix: usa canViewDepartment + canViewIncidencia en vez de === directo
(function(){
  window.renderIncidenciasScreen = async function(){
    var el = document.getElementById('screen-incidencias');
    if(!el) return;
    var dept = currentUser ? (currentUser.area||'—') : '—';
    var isAdminU = isAdmin(currentUser);
    var isSup    = typeof isSupervisor === 'function' && isSupervisor(currentUser);
    var canSeeList = isAdminU || isSup;

    // Empleado: solo crear, sin lista
    if(!canSeeList){
      el.innerHTML = '<div class="page-header"><div class="page-title">⚠ Incidencias</div>'
        + '<div class="page-sub">Reporta una incidencia del turno. Tu jefe la revisará.</div></div>'
        + '<div class="card" style="text-align:center;padding:32px;">'
        + '<p style="color:var(--text2);font-size:13px;margin-bottom:18px;">'
        + 'Las incidencias que reportes serán visibles solo por tu jefe de departamento.</p>'
        + '<button class="btn btn-primary" style="font-size:14px;padding:12px 24px;" onclick="openNewIncidenciaStandalone()">+ Nueva incidencia</button>'
        + '</div>';
      return;
    }

    // Jefe / Admin: lista con visibilidad expandida
    var verTodos = isAdminU;
    var all = [];
    try { all = await getDB('incidencias'); } catch(e){}
    var empMap = await _adjGetEmployeeMap();

    // FIX: usar canViewIncidencia (dept + staff_implicado) en vez de === directo
    var list = verTodos ? all : all.filter(function(i){
      return canViewIncidencia(currentUser, i, empMap);
    });

    list = list.filter(function(i){
      var s = normalizeIncidentState(i.estado);
      return s !== INCIDENT_STATES.CERRADA;
    });
    list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

    var cards;
    if(!list.length){
      cards = '<div class="empty"><div class="empty-icon">⚠</div><div class="empty-text">Sin incidencias pendientes</div></div>';
    } else {
      cards = list.map(function(i){
        var fecha = i.created_at ? new Date(i.created_at) : null;
        var fechaStr = fecha ? fecha.toLocaleDateString('es-ES')+' · '+fecha.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
        // Mostrar dept del staff implicado si la incidencia no es del dept del jefe
        var deptLabel = formatDisplayValue(i.departamento||i.area);
        var staffDepts = _adjGetStaffDeptsSync(i, empMap);
        if(staffDepts.length) deptLabel += ' <span style="font-size:10px;color:var(--text3);">(implicados: '+staffDepts.join(', ')+')</span>';
        return '<div class="task-card">'
          + '<div class="task-meta">'
          +   '<span class="dept-badge">'+deptLabel+'</span>'
          +   '<span class="task-origin">tipo: '+formatDisplayValue(i.tipo_incidencia||i.categoria)+'</span>'
          +   bIncidentEstadoClick(i.estado, i.id)
          + '</div>'
          + '<div class="task-title">'+formatDisplayValue(i.descripcion)+'</div>'
          + '<div class="task-footer">'
          +   '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">'
          +     '📅 '+fechaStr+' &nbsp;·&nbsp; reportada por '+formatDisplayValue(i.nombre)
          +   '</div>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    // Mostrar depts supervisados en el subtítulo
    var deptLabel = verTodos ? 'Todos los departamentos' : 'Departamentos: ' + (getSupervisorDepartments(currentUser)||[dept]).join(', ');

    el.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">'
      + '<div><div class="page-title">⚠ Incidencias pendientes</div>'
      + '<div class="page-sub">' + deptLabel + ' · ' + list.length + ' activas</div></div>'
      + '<button class="btn btn-primary" onclick="openNewIncidenciaStandalone()">+ Nueva incidencia</button>'
      + '</div>'
      + '<div>'+cards+'</div>';

    // Re-inyectar inputs de adjuntos
    setTimeout(_adjInjectInputs, 100);
  };
})();

// Helper sync para extraer departamentos del staff implicado (usa cache)
function _adjGetStaffDeptsSync(inci, empMap){
  if(!empMap) return [];
  var staffIds = [];
  try { staffIds = JSON.parse(inci.staff_implicado_ids || '[]'); } catch(e){}
  var depts = {};
  for(var i = 0; i < staffIds.length; i++){
    var emp = empMap[staffIds[i]];
    if(emp && emp.area) depts[emp.area] = true;
  }
  return Object.keys(depts);
}

// ── REEMPLAZO: renderFollowupList ─────────────────────────────────────
// Fix: incidencias visibles por dept + staff_implicado para supervisores
(function(){
  window.renderFollowupList = async function(){
    if(!currentUser) return;
    var el        = document.getElementById('followup-incidencias-list');
    var countEl   = document.getElementById('followup-count');
    var btnNew    = document.getElementById('btn-new-followup');
    var subtitleEl= document.getElementById('followup-subtitle');
    if(!el) return;

    var isSupervisorUser = isAdmin(currentUser) || isSupervisor(currentUser);
    var isAdminUser      = isAdmin(currentUser);
    var dept             = currentUser ? (currentUser.area || '') : '';

    if(btnNew)     btnNew.style.display   = isSupervisorUser ? '' : 'none';
    if(subtitleEl) subtitleEl.textContent  = isSupervisorUser
      ? 'Gestiones pendientes, tareas e incidencias operativas del departamento.'
      : 'Gestiones pendientes y tareas visibles para tu departamento.';

    var allIncis = [], allTareas = [], allShifts = [], allGestiones = [], allAjustes = [];
    try { allIncis     = await getDB('incidencias'); } catch(e){}
    try { allTareas    = await getDB('tareas');      } catch(e){}
    try { allShifts    = await getDB('shifts');      } catch(e){}
    try { allGestiones = await getDB('gestiones');   } catch(e){}
    try { allAjustes   = await getDB('ajustes');     } catch(e){}

    // Cache de empleados para check de staff implicado
    var empMap = await _adjGetEmployeeMap();

    var shiftMap = {};
    allShifts.forEach(function(s){ if(s.id) shiftMap[s.id] = s; });

    function sameDept(record){
      if(isAdminUser) return true;
      var rDept = getRecordDepartment(record, shiftMap);
      if(isSupervisorUser) return canViewDepartment(currentUser, rDept);
      return normalizeDeptName(rDept) === normalizeDeptName(dept)
        || record.employee_id === currentUser.id
        || record.creado_por  === currentUser.nombre;
    }

    // FIX: sameDept expandido para incidencias — incluye staff_implicado
    function sameDeptInci(record){
      if(sameDept(record)) return true;
      if(!isSupervisorUser) return false;
      // Check staff_implicado_ids
      return canViewIncidencia(currentUser, record, empMap);
    }

    // GESTIONES
    var gestiones = allGestiones.filter(function(g){
      if(isAdmin(currentUser) || isSupervisorUser) return sameDept(g);
      return normalizeDeptName(g.departamento||g.area||'') === normalizeDeptName(dept) && g.estado !== 'Cerrada';
    }).filter(function(g){ return g.estado !== 'Cerrada'; });

    // TAREAS
    var tareas = allTareas.filter(function(t){
      if(!isTaskOpen(t)) return false;
      if(isAdmin(currentUser) || isSupervisorUser) return sameDept(t);
      var esDeptDestino = normalizeDeptName(t.dept_destino||'') === normalizeDeptName(dept);
      var esCreador = t.creado_por === currentUser.nombre || t.employee_id === currentUser.id;
      return esDeptDestino || esCreador;
    });

    // INCIDENCIAS — FIX: usa sameDeptInci que incluye staff_implicado
    var incidencias;
    if(isAdmin(currentUser) || isSupervisorUser){
      incidencias = allIncis.filter(function(i){
        return isIncidentOpen(i) && sameDeptInci(i);
      });
    } else {
      incidencias = allIncis.filter(function(i){
        var esSuya = i.employee_id === currentUser.id || i.nombre === currentUser.nombre;
        var abierta = normalizeIncidentState(i.estado) === INCIDENT_STATES.ABIERTA
                   || normalizeIncidentState(i.estado) === INCIDENT_STATES.EN_PROCESO;
        return esSuya && abierta;
      });
    }

    var total = gestiones.length + tareas.length + incidencias.length;
    if(countEl) countEl.textContent = total ? '('+total+' activas)' : '(sin activas)';

    if(!total){
      el.innerHTML = '<div class="empty"><div class="empty-text">Sin gestiones, tareas ni incidencias activas</div></div>';
      return;
    }

    function buildTaskRows(list){
      if(!list.length) return '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguna</div>';
      return '<table><tr><th>Deadline</th><th>Estado</th><th>Descripción</th><th>Destino</th><th>Creado por</th><th>Acciones</th></tr>'
        + list.map(function(row){
          var acciones = '';
          var st = normalizeTaskState(row.estado);
          var esDeptDestino = normalizeDeptName(row.dept_destino||'') === normalizeDeptName(dept);
          var puedeAvanzar = isAdmin(currentUser) || isSupervisorUser || esDeptDestino;
          if(puedeAvanzar && st === TASK_STATES.ABIERTA)
            acciones += '<button class="btn btn-secondary btn-sm" onclick="advanceTask(\''+row.id+'\',\'En proceso\')">▶ En proceso</button> ';
          if((isAdmin(currentUser) || isSupervisorUser || (esDeptDestino && st === TASK_STATES.EN_PROCESO)) && st === TASK_STATES.EN_PROCESO)
            acciones += '<button class="btn btn-secondary btn-sm" onclick="advanceTask(\''+row.id+'\',\'Cerrada\')">✓ Cerrar</button>';
          return '<tr>'
            + '<td style="font-family:var(--font-mono);font-size:11px;'+(isOverdue(row.deadline)?'color:var(--red);font-weight:700':'')+'">'
            + fmtDate(row.deadline) + (isOverdue(row.deadline)?' ⚠':'') + '</td>'
            + '<td>'+bTaskEstado(row.estado)+'</td>'
            + '<td style="font-size:12px;max-width:220px;">'+formatDisplayValue(row.descripcion||row.titulo)+'</td>'
            + '<td>'+deptBadge(row.dept_destino)+'</td>'
            + '<td style="font-size:12px;">'+formatDisplayValue(row.creado_por)+'</td>'
            + '<td>'+(acciones||'—')+'</td>'
            + '</tr>';
        }).join('') + '</table>';
    }

    function buildIncidentRows(list){
      if(!list.length) return '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguna</div>';
      return '<table><tr><th>Tipo</th><th>Descripción</th><th>Empleado</th><th>Dept</th><th>Fecha</th><th>Estado</th><th>Acción tomada</th></tr>'
        + list.map(function(i){
          var fechaObj = i.created_at ? new Date(i.created_at) : null;
          var fechaStr = fechaObj ? fechaObj.toLocaleDateString('es-ES')+' '+fechaObj.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
          var accion = formatDisplayValue(i.accion_inmediata) || '—';
          var staffDepts = _adjGetStaffDeptsSync(i, empMap);
          var deptInfo = deptBadge(i.departamento||i.area||'—');
          if(staffDepts.length) deptInfo += '<span style="font-size:9px;color:var(--text3);display:block;">impl: '+staffDepts.join(', ')+'</span>';
          return '<tr>'
            + '<td style="font-size:12px;">'+formatDisplayValue(i.tipo_incidencia||i.categoria)+'</td>'
            + '<td style="font-size:12px;max-width:200px;">'+formatDisplayValue(i.descripcion).slice(0,70)+(i.descripcion&&i.descripcion.length>70?'...':'')+'</td>'
            + '<td style="font-size:12px;">'+formatDisplayValue(i.nombre)+'</td>'
            + '<td>'+deptInfo+'</td>'
            + '<td style="font-size:11px;color:var(--text3);">'+fechaStr+'</td>'
            + '<td>'+(typeof bIncidentEstadoClick==='function'?bIncidentEstadoClick(i.estado,i.id):bIncidentEstado(i.estado))+'</td>'
            + '<td style="font-size:12px;max-width:160px;color:var(--text3);">'+accion+'</td>'
            + '</tr>';
        }).join('') + '</table>';
    }

    function buildGestionRows(list){
      if(!list.length) return '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguna</div>';
      return '<table><tr><th>Tipo</th><th>Descripción</th><th>Estado</th><th>Acción tomada</th></tr>'
        + list.map(function(g){
          var gState = g.estado || 'Abierta';
          var accion = formatDisplayValue(g.accion_tomada) || '—';
          return '<tr>'
            + '<td style="font-size:12px;">'+formatDisplayValue(g.tipo_gestion)+'</td>'
            + '<td style="font-size:12px;max-width:220px;">'+formatDisplayValue(g.descripcion)+'</td>'
            + '<td>'+(typeof bGestionEstadoClick==='function'?bGestionEstadoClick(gState,g.id):bGestionEstado(gState))+'</td>'
            + '<td style="font-size:12px;max-width:160px;color:var(--text3);">'+accion+'</td>'
            + '</tr>';
        }).join('') + '</table>';
    }

    var html = '<div style="margin-bottom:10px;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.12em;margin-bottom:6px;">GESTIONES PENDIENTES ('+gestiones.length+')</div>'
      + buildGestionRows(gestiones) + '</div>';

    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--purple);letter-spacing:.12em;margin-bottom:6px;">TAREAS ('+tareas.length+')</div>'
      + buildTaskRows(tareas) + '</div>';

    // AJUSTES DEL DÍA
    var showAjustes = (dept === 'Sala' || dept === 'Recepción' || isAdminUser);
    if(showAjustes){
      var todayStr = today();
      var ajustesHoy = (allAjustes||[]).filter(function(a){
        return a.employee_id === currentUser.id && (a.fecha||'').slice(0,10) === todayStr;
      });
      ajustesHoy.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
      var totalAj = 0;
      ajustesHoy.forEach(function(a){ totalAj += parseFloat(a.importe)||0; });
      var ajustesHtml;
      if(ajustesHoy.length === 0){
        ajustesHtml = '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguno hoy. Usa el botón <b>⚙ Ajustes</b> del menú para añadir.</div>';
      } else {
        ajustesHtml = '<table><tr><th>Hora</th><th>Tipo</th><th>Importe</th><th>Motivo</th></tr>'
          + ajustesHoy.map(function(a){
            var hora = a.created_at ? new Date(a.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
            var imp = parseFloat(a.importe)||0;
            var col = imp < 0 ? 'var(--red)' : 'var(--green)';
            return '<tr>'
              + '<td style="font-size:11px;color:var(--text3);">'+hora+'</td>'
              + '<td style="font-size:12px;">'+formatDisplayValue(a.tipo)+'</td>'
              + '<td style="font-size:12px;color:'+col+';font-weight:600;font-family:var(--font-mono);">'+imp.toFixed(2)+' €</td>'
              + '<td style="font-size:12px;color:var(--text3);">'+formatDisplayValue(a.motivo||a.obs||'—')+'</td>'
              + '</tr>';
          }).join('') + '</table>';
      }
      html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">'
        + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.12em;margin-bottom:6px;">AJUSTES DEL DÍA ('+ajustesHoy.length+') · TOTAL '+totalAj.toFixed(2)+' €</div>'
        + ajustesHtml + '</div>';
    }

    if(isSupervisorUser){
      html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">'
        + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--red);letter-spacing:.12em;margin-bottom:6px;">INCIDENCIAS OPERATIVAS ('+incidencias.length+') — Solo supervisores</div>'
        + buildIncidentRows(incidencias) + '</div>';
    }

    el.innerHTML = html;
  };
})();

// ── REEMPLAZO: canCloseIncident — añade check staff_implicado ─────────
(function(){
  window.canCloseIncident = function(user, incident){
    if(typeof canActAsAdmin === 'function' && canActAsAdmin(user)) return true;
    if(!isSupervisor(user)) return false;
    // Check 1: dept directo
    if(canViewDepartment(user, getRecordDepartment(incident))) return true;
    // Check 2: staff implicado (usa cache sync — puede ser null al primer render)
    if(_adjEmpCache){
      var staffIds = [];
      try { staffIds = JSON.parse(incident.staff_implicado_ids || '[]'); } catch(e){}
      for(var i = 0; i < staffIds.length; i++){
        var emp = _adjEmpCache[staffIds[i]];
        if(emp && emp.area && canViewDepartment(user, emp.area)) return true;
      }
    }
    return false;
  };
})();

// ═══════════════════════════════════════════════════════════════════════
console.log('SYNCRO SHIFT — adjuntos.js + visibilidad incidencias cargado');
