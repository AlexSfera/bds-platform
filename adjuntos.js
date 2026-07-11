// ═══════════════════════════════════════════════════════════════════════
// ADJUNTOS — módulo de archivos adjuntos · SYNCRO SHIFT
// Carga ÚLTIMO en index.html (después de todos los módulos).
// No modifica archivos existentes — se engancha via wrapping.
//
// Depende de (shared.js): SUPABASE_URL, SUPABASE_KEY, getDB, dbUpdate,
//   invalidateCache, auditLog, toast, localTs, currentUser, genId
//
// Requiere: bucket 'adjuntos' en Supabase Storage (ver SQL migration)
// Columna 'adjuntos' jsonb DEFAULT '[]' en gestiones, incidencias, tareas
// ═══════════════════════════════════════════════════════════════════════

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
    '.adj-progress{height:3px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden;}',
    '.adj-progress-bar{height:100%;background:var(--blue);transition:width .3s;}',
  ].join('\n');
  document.head.appendChild(s);
})();

// ── SUPABASE STORAGE API ──────────────────────────────────────────────

// Upload un archivo al bucket. Retorna {name, path, size, type, uploaded_by, uploaded_at}
async function adjuntoUpload(file, table, recordId){
  // Sanitizar nombre: quitar caracteres problemáticos
  var safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
  // Añadir timestamp para evitar colisiones
  var ts = Date.now();
  var path = table + '/' + recordId + '/' + ts + '_' + safeName;

  var res = await fetch(SUPABASE_URL + '/storage/v1/object/' + ADJ_BUCKET + '/' + path, {
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
    name: file.name,
    path: path,
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploaded_by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.nombre : 'Sistema',
    uploaded_at: localTs()
  };
}

// Eliminar archivo del bucket
async function adjuntoRemove(path){
  var res = await fetch(SUPABASE_URL + '/storage/v1/object/' + ADJ_BUCKET + '/' + path, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    }
  });
  return res.ok;
}

// URL pública de un archivo
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

// Sube un array de File objects, actualiza el registro en DB.
// Retorna el array actualizado de adjuntos (existentes + nuevos).
async function adjuntoUploadBatch(files, table, recordId){
  if(!files || !files.length) return [];

  // Leer adjuntos existentes
  var existing = await adjuntoGetFromRecord(table, recordId);
  var total = existing.length + files.length;
  if(total > ADJ_MAX_FILES){
    toast('Máximo ' + ADJ_MAX_FILES + ' archivos por registro. Ya hay ' + existing.length + '.', 'err');
    return existing;
  }

  var newAdj = [];
  for(var i = 0; i < files.length; i++){
    var f = files[i];
    if(f.size > ADJ_MAX_SIZE){
      toast(f.name + ': excede 10 MB', 'err');
      continue;
    }
    try {
      var meta = await adjuntoUpload(f, table, recordId);
      newAdj.push(meta);
    } catch(e){
      toast('Error subiendo ' + f.name + ': ' + e.message, 'err');
    }
  }
  if(!newAdj.length) return existing;

  var merged = existing.concat(newAdj);
  await adjuntoSaveToRecord(table, recordId, merged);
  auditLog('ADJUNTO_UPLOAD', table + '/' + recordId + ' — ' + newAdj.map(function(a){ return a.name; }).join(', '));
  toast(newAdj.length + ' archivo(s) adjuntado(s)', 'ok');
  return merged;
}

// Eliminar un adjunto de un registro
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

// Renderiza una zona de drop + input de archivos.
// containerId = id del div contenedor (ya existente o se crea)
// inputId     = id único para el <input type="file">
// Retorna el elemento contenedor.
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

  // Drag & drop
  var zone = document.getElementById(inputId + '-zone');
  if(zone){
    zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function(e){
      e.preventDefault();
      zone.classList.remove('drag-over');
      var input = document.getElementById(inputId);
      if(input && e.dataTransfer.files.length){
        // Merge with existing files
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

// Callback cuando el usuario selecciona archivos (muestra preview de pendientes)
function adjuntoOnSelect(input, inputId){
  var pendEl = document.getElementById(inputId + '-pending');
  if(!pendEl) return;
  var files = input.files;
  if(!files || !files.length){ pendEl.innerHTML = ''; return; }

  // Validar cantidad
  if(files.length > ADJ_MAX_FILES){
    toast('Máximo ' + ADJ_MAX_FILES + ' archivos', 'err');
    input.value = '';
    pendEl.innerHTML = '';
    return;
  }

  var html = '';
  for(var i = 0; i < files.length; i++){
    var f = files[i];
    var sizeStr = f.size < 1024 ? f.size + ' B'
               : f.size < 1048576 ? Math.round(f.size / 1024) + ' KB'
               : (f.size / 1048576).toFixed(1) + ' MB';
    var icon = _adjFileIcon(f.type, f.name);
    var oversize = f.size > ADJ_MAX_SIZE ? ' style="color:var(--red);text-decoration:line-through;"' : '';
    html += '<div class="adj-pending-item">'
      + icon
      + '<span class="adj-item-name"' + oversize + '>' + _adjEsc(f.name) + '</span>'
      + '<span class="adj-item-size"' + (f.size > ADJ_MAX_SIZE ? ' style="color:var(--red)"' : '') + '>' + sizeStr + '</span>'
      + '<button class="adj-item-del" onclick="adjuntoRemovePending(\'' + inputId + '\',' + i + ')" title="Quitar">✕</button>'
      + '</div>';
  }
  pendEl.innerHTML = html;
}

// Quitar un archivo pendiente (aún no subido)
function adjuntoRemovePending(inputId, index){
  var input = document.getElementById(inputId);
  if(!input) return;
  var dt = new DataTransfer();
  for(var i = 0; i < input.files.length; i++){
    if(i !== index) dt.items.add(input.files[i]);
  }
  input.files = dt.files;
  adjuntoOnSelect(input, inputId);
}

// Recoger los File objects del input (antes de limpiar el form)
function adjuntoCollectFiles(inputId){
  var input = document.getElementById(inputId);
  if(!input || !input.files || !input.files.length) return [];
  var arr = [];
  for(var i = 0; i < input.files.length; i++) arr.push(input.files[i]);
  return arr;
}

// ── UI: VISOR DE ADJUNTOS (registros existentes) ──────────────────────

// Renderiza lista de adjuntos existentes + zona de upload (si editable).
// Retorna HTML string.
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
      var sizeStr = a.size < 1024 ? a.size + ' B'
                 : a.size < 1048576 ? Math.round(a.size / 1024) + ' KB'
                 : (a.size / 1048576).toFixed(1) + ' MB';
      var icon = _adjFileIcon(a.type, a.name);
      var isImg = a.type && a.type.indexOf('image/') === 0;

      html += '<div class="adj-item">';
      if(isImg) html += '<img class="adj-thumb" src="' + url + '" alt="" loading="lazy">';
      else html += icon;
      html += '<span class="adj-item-name"><a href="' + url + '" target="_blank" rel="noopener">' + _adjEsc(a.name) + '</a></span>';
      html += '<span class="adj-item-size">' + sizeStr + '</span>';
      if(editable){
        html += '<button class="adj-item-del" onclick="adjuntoDeleteFromViewer(\'' + table + '\',\'' + recordId + '\',\'' + _adjEsc(a.path) + '\')" title="Eliminar">🗑</button>';
      }
      html += '</div>';
    }
    html += '</div>';
  } else {
    html += '<div style="font-size:12px;color:var(--text3);padding:4px 0;">Sin adjuntos</div>';
  }

  // Upload zone (si editable y no lleno)
  if(editable && adjuntos.length < ADJ_MAX_FILES){
    var uid = 'adj-viewer-' + table + '-' + recordId;
    html += '<div style="margin-top:8px;">'
      + '<div class="adj-zone" id="' + uid + '-zone">'
      + '<label class="adj-zone-label" for="' + uid + '">'
      + '＋ Añadir archivo'
      + '</label>'
      + '<input type="file" id="' + uid + '" multiple style="display:none;"'
      + ' onchange="adjuntoUploadFromViewer(\'' + table + '\',\'' + recordId + '\',this)">'
      + '</div></div>';
  }

  html += '</div>';
  return html;
}

// Callback: subir archivo directamente desde el visor
async function adjuntoUploadFromViewer(table, recordId, input){
  if(!input.files || !input.files.length) return;
  var files = [];
  for(var i = 0; i < input.files.length; i++) files.push(input.files[i]);

  // Deshabilitar zona mientras sube
  var zone = input.closest('.adj-zone');
  if(zone) zone.classList.add('adj-uploading');

  try {
    await adjuntoUploadBatch(files, table, recordId);
  } catch(e){
    toast('Error: ' + e.message, 'err');
  }

  if(zone) zone.classList.remove('adj-uploading');
  input.value = '';

  // Re-render el visor (buscar el contenedor padre)
  _adjRefreshViewer(table, recordId);
}

// Callback: eliminar adjunto desde el visor
async function adjuntoDeleteFromViewer(table, recordId, path){
  if(!confirm('¿Eliminar este archivo?')) return;
  try {
    await adjuntoRemoveFromRecord(table, recordId, path);
    _adjRefreshViewer(table, recordId);
  } catch(e){
    toast('Error: ' + e.message, 'err');
  }
}

// Re-renderizar el visor tras upload/delete
async function _adjRefreshViewer(table, recordId){
  var adjuntos = await adjuntoGetFromRecord(table, recordId);
  // Buscar contenedor del visor por data attribute
  var containers = document.querySelectorAll('[data-adj-viewer="' + table + '-' + recordId + '"]');
  containers.forEach(function(c){
    var editable = c.getAttribute('data-adj-editable') === 'true';
    c.innerHTML = adjuntoRenderViewer(adjuntos, table, recordId, editable);
    _adjSetupDragDrop(c, table, recordId);
  });

  // Si estamos en el modal detail del dashboard, re-renderizar
  var detBody = document.querySelector('.dash-detail-body [data-adj-viewer="' + table + '-' + recordId + '"]');
  if(detBody){
    detBody.innerHTML = adjuntoRenderViewer(adjuntos, table, recordId, true);
    _adjSetupDragDrop(detBody, table, recordId);
  }
}

// Setup drag&drop en un visor ya renderizado
function _adjSetupDragDrop(container, table, recordId){
  var zones = container.querySelectorAll('.adj-zone');
  zones.forEach(function(zone){
    zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function(e){
      e.preventDefault();
      zone.classList.remove('drag-over');
      if(e.dataTransfer.files.length){
        var files = [];
        for(var i = 0; i < e.dataTransfer.files.length; i++) files.push(e.dataTransfer.files[i]);
        zone.classList.add('adj-uploading');
        adjuntoUploadBatch(files, table, recordId).then(function(){
          zone.classList.remove('adj-uploading');
          _adjRefreshViewer(table, recordId);
        }).catch(function(err){
          zone.classList.remove('adj-uploading');
          toast('Error: ' + err.message, 'err');
        });
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
  mimeType = mimeType || '';
  name = (name || '').toLowerCase();
  if(mimeType.indexOf('image/') === 0) return '🖼️ ';
  if(mimeType.indexOf('video/') === 0) return '🎬 ';
  if(mimeType === 'application/pdf' || name.endsWith('.pdf')) return '📄 ';
  if(mimeType.indexOf('spreadsheet') >= 0 || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return '📊 ';
  if(mimeType.indexOf('word') >= 0 || name.endsWith('.docx') || name.endsWith('.doc')) return '📝 ';
  if(mimeType.indexOf('text/') === 0) return '📃 ';
  return '📎 ';
}

// ═══════════════════════════════════════════════════════════════════════
// HOOKS — se engancha a las funciones existentes sin modificar archivos
// ═══════════════════════════════════════════════════════════════════════

// ── 1. INTERCEPTOR de dbInsert ────────────────────────────────────────
// Captura el ID del último registro insertado en gestiones/incidencias/tareas
// para que los wrappers de save puedan subir adjuntos al registro correcto.
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

// ── 2. INYECCIÓN DE FILE INPUTS EN FORMULARIOS ────────────────────────
// Se ejecuta cuando el DOM está listo y también vía MutationObserver
// para modales generados dinámicamente.

function _adjInjectInputs(){
  // -- block-gestion (turno form)
  var gBlock = document.getElementById('block-gestion');
  if(gBlock && !document.getElementById('adj-gestion-container')){
    var gDiv = document.createElement('div');
    gDiv.id = 'adj-gestion-container';
    gDiv.className = 'fg';
    gDiv.innerHTML = '<label>Adjuntos</label>';
    gBlock.querySelector('.grid1').appendChild(gDiv);
    adjuntoRenderInput('adj-gestion-container', 'adj-gestion-input');
  }

  // -- block-incidencia (turno form)
  var iBlock = document.getElementById('block-incidencia');
  if(iBlock && !document.getElementById('adj-incidencia-container')){
    var iGrid = iBlock.querySelector('.grid1');
    if(iGrid){
      var iDiv = document.createElement('div');
      iDiv.id = 'adj-incidencia-container';
      iDiv.className = 'fg';
      iDiv.innerHTML = '<label>Adjuntos</label>';
      iGrid.appendChild(iDiv);
      adjuntoRenderInput('adj-incidencia-container', 'adj-incidencia-input');
    }
  }

  // -- modal-tarea
  var tModal = document.getElementById('modal-tarea');
  if(tModal && !document.getElementById('adj-tarea-container')){
    var tGrid = tModal.querySelector('.grid2');
    if(tGrid){
      var tDiv = document.createElement('div');
      tDiv.id = 'adj-tarea-container';
      tDiv.className = 'fg sp2';
      tDiv.innerHTML = '<label>Adjuntos</label>';
      tGrid.appendChild(tDiv);
      adjuntoRenderInput('adj-tarea-container', 'adj-tarea-input');
    }
  }

  // -- modal-new-gestion (standalone, generado dinámicamente por shared.js)
  var ngModal = document.getElementById('modal-new-gestion');
  if(ngModal && !document.getElementById('adj-new-gestion-container')){
    var ngGrid = ngModal.querySelector('.grid1, .grid2');
    if(ngGrid){
      var ngDiv = document.createElement('div');
      ngDiv.id = 'adj-new-gestion-container';
      ngDiv.className = 'fg sp2';
      ngDiv.innerHTML = '<label>Adjuntos</label>';
      ngGrid.appendChild(ngDiv);
      adjuntoRenderInput('adj-new-gestion-container', 'adj-new-gestion-input');
    }
  }

  // -- modal-new-inci (standalone, generado dinámicamente por shared.js)
  var niModal = document.getElementById('modal-new-inci');
  if(niModal && !document.getElementById('adj-new-inci-container')){
    var niGrid = niModal.querySelector('.grid1, .grid2');
    if(niGrid){
      var niDiv = document.createElement('div');
      niDiv.id = 'adj-new-inci-container';
      niDiv.className = 'fg sp2';
      niDiv.innerHTML = '<label>Adjuntos</label>';
      niGrid.appendChild(niDiv);
      adjuntoRenderInput('adj-new-inci-container', 'adj-new-inci-input');
    }
  }
}

// Inyectar al cargar y observar modales dinámicos
document.addEventListener('DOMContentLoaded', function(){
  _adjInjectInputs();
  // MutationObserver para modales generados dinámicamente
  var obs = new MutationObserver(function(mutations){
    for(var i = 0; i < mutations.length; i++){
      if(mutations[i].addedNodes.length) { _adjInjectInputs(); break; }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
// Fallback: también inyectar cuando se abre la app (login carga pantallas)
if(document.readyState === 'complete' || document.readyState === 'interactive'){
  setTimeout(_adjInjectInputs, 500);
  setTimeout(_adjInjectInputs, 2000);
}

// ── 3. WRAPPER de _doSaveTurno ────────────────────────────────────────
// Captura archivos ANTES del save, sube DESPUÉS al registro correcto.
(function(){
  if(typeof window._doSaveTurno !== 'function') return;
  var _origDoSaveTurno = window._doSaveTurno;

  window._doSaveTurno = async function(){
    // Stash archivos antes de que el form se limpie
    var gFiles = adjuntoCollectFiles('adj-gestion-input');
    var iFiles = adjuntoCollectFiles('adj-incidencia-input');
    var prevShiftId = window._lastSavedShiftId;

    // Ejecutar el save original
    await _origDoSaveTurno.apply(this, arguments);

    var newShiftId = window._lastSavedShiftId;
    // Si no cambió el shiftId, el save falló o fue cancelado
    if(!newShiftId || newShiftId === prevShiftId) return;

    // Subir adjuntos de gestión
    if(gFiles.length){
      try {
        invalidateCache('gestiones');
        var gg = await getDB('gestiones');
        var gRec = null;
        for(var g = 0; g < gg.length; g++){
          if(gg[g].shift_id === newShiftId){ gRec = gg[g]; break; }
        }
        if(gRec) await adjuntoUploadBatch(gFiles, 'gestiones', gRec.id);
      } catch(e){ console.error('Adjuntos gestión error:', e); }
    }

    // Subir adjuntos de incidencia
    if(iFiles.length){
      try {
        invalidateCache('incidencias');
        var ii = await getDB('incidencias');
        var iRec = null;
        for(var k = ii.length - 1; k >= 0; k--){
          if(ii[k].shift_id === newShiftId){ iRec = ii[k]; break; }
        }
        if(iRec) await adjuntoUploadBatch(iFiles, 'incidencias', iRec.id);
      } catch(e){ console.error('Adjuntos incidencia error:', e); }
    }
  };
})();

// ── 4. WRAPPER de saveTask ────────────────────────────────────────────
(function(){
  if(typeof window.saveTask !== 'function') return;
  var _origSaveTask = window.saveTask;

  window.saveTask = async function(){
    var tFiles = adjuntoCollectFiles('adj-tarea-input');
    window._adjLastInserted = null;

    await _origSaveTask.apply(this, arguments);

    // Si se insertó una tarea, subir adjuntos
    var last = window._adjLastInserted;
    if(tFiles.length && last && last.table === 'tareas'){
      try {
        await adjuntoUploadBatch(tFiles, 'tareas', last.id);
      } catch(e){ console.error('Adjuntos tarea error:', e); }
    }
  };
})();

// ── 5. WRAPPER de saveNewGestionStandalone ─────────────────────────────
(function(){
  if(typeof window.saveNewGestionStandalone !== 'function') return;
  var _origSaveNewGestion = window.saveNewGestionStandalone;

  window.saveNewGestionStandalone = async function(){
    var files = adjuntoCollectFiles('adj-new-gestion-input');
    window._adjLastInserted = null;

    await _origSaveNewGestion.apply(this, arguments);

    var last = window._adjLastInserted;
    if(files.length && last && last.table === 'gestiones'){
      try {
        await adjuntoUploadBatch(files, 'gestiones', last.id);
      } catch(e){ console.error('Adjuntos gestión standalone error:', e); }
    }
  };
})();

// ── 6. WRAPPER de saveNewIncidenciaStandalone ──────────────────────────
(function(){
  if(typeof window.saveNewIncidenciaStandalone !== 'function') return;
  var _origSaveNewInci = window.saveNewIncidenciaStandalone;

  window.saveNewIncidenciaStandalone = async function(){
    var files = adjuntoCollectFiles('adj-new-inci-input');
    window._adjLastInserted = null;

    await _origSaveNewInci.apply(this, arguments);

    var last = window._adjLastInserted;
    if(files.length && last && last.table === 'incidencias'){
      try {
        await adjuntoUploadBatch(files, 'incidencias', last.id);
      } catch(e){ console.error('Adjuntos incidencia standalone error:', e); }
    }
  };
})();

// ── 7. WRAPPER de _dashShowDetail — añade visor de adjuntos ───────────
(function(){
  if(typeof window._dashShowDetail !== 'function') return;
  var _origDashShowDetail = window._dashShowDetail;

  window._dashShowDetail = async function(id, table){
    // Ejecutar el original
    await _origDashShowDetail.apply(this, arguments);

    // Solo para tablas con adjuntos
    if(table !== 'gestiones' && table !== 'incidencias' && table !== 'tareas') return;

    // Buscar el body del modal detail
    var overlay = document.getElementById('dash-detail-overlay');
    if(!overlay) return;
    var body = overlay.querySelector('.dash-detail-body');
    if(!body) return;

    // Leer adjuntos del registro
    var adjuntos = await adjuntoGetFromRecord(table, id);

    // Determinar si el usuario puede editar (admin/supervisor/adjunto)
    var editable = false;
    if(typeof canActAsAdmin === 'function') editable = canActAsAdmin(currentUser);
    if(!editable && typeof isSupervisor === 'function') editable = isSupervisor(currentUser);

    // Crear contenedor para adjuntos
    var adjContainer = document.createElement('div');
    adjContainer.setAttribute('data-adj-viewer', table + '-' + id);
    adjContainer.setAttribute('data-adj-editable', editable ? 'true' : 'false');
    adjContainer.innerHTML = adjuntoRenderViewer(adjuntos, table, id, editable);
    body.appendChild(adjContainer);

    // Setup drag&drop
    _adjSetupDragDrop(adjContainer, table, id);
  };
})();

// ── 8. ENHANCER de renderTareas — muestra adjuntos en tarjetas ────────
(function(){
  if(typeof window.renderTareas !== 'function') return;
  var _origRenderTareas = window.renderTareas;

  window.renderTareas = async function(){
    // Ejecutar el original
    await _origRenderTareas.apply(this, arguments);

    // Buscar todas las task-card y añadir indicador de adjuntos
    var listEl = document.getElementById('tareas-list');
    if(!listEl) return;

    var cards = listEl.querySelectorAll('.task-card');
    if(!cards.length) return;

    // Obtener todas las tareas para mapear IDs
    var tareas = await getDB('tareas');

    cards.forEach(function(card){
      // Extraer taskId del onclick del botón de acción
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

      // Añadir indicador de adjuntos en el meta
      var meta = card.querySelector('.task-meta');
      if(meta && !meta.querySelector('.adj-badge')){
        if(adj.length > 0){
          var badge = document.createElement('span');
          badge.className = 'badge b-gray adj-badge';
          badge.style.cssText = 'cursor:pointer;font-size:10px;';
          badge.textContent = '📎 ' + adj.length;
          badge.title = 'Ver adjuntos';
          badge.onclick = function(){ _adjToggleTaskFiles(taskId, card); };
          meta.appendChild(badge);
        }
      }

      // Añadir botón para gestionar adjuntos en el footer
      var footer = card.querySelector('.task-actions');
      if(footer && !footer.querySelector('.adj-task-btn')){
        var adjBtn = document.createElement('button');
        adjBtn.className = 'btn btn-secondary btn-sm adj-task-btn';
        adjBtn.textContent = '📎 Adjuntos';
        adjBtn.style.cssText = 'font-size:11px;';
        adjBtn.onclick = function(){ _adjToggleTaskFiles(taskId, card); };
        footer.insertBefore(adjBtn, footer.firstChild);
      }
    });
  };
})();

// Toggle panel de adjuntos en una tarjeta de tarea
async function _adjToggleTaskFiles(taskId, card){
  var existing = card.querySelector('.adj-task-panel');
  if(existing){
    existing.remove();
    return;
  }

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

// ── 9. ENHANCER de renderGestionesScreen — adjuntos en pantalla standalone
(function(){
  if(typeof window.renderGestionesScreen !== 'function') return;
  var _origRenderGestionesScreen = window.renderGestionesScreen;

  window.renderGestionesScreen = async function(){
    await _origRenderGestionesScreen.apply(this, arguments);
    // Re-inyectar inputs en modal si se regeneró
    setTimeout(_adjInjectInputs, 100);
  };
})();

// ── 10. ENHANCER de renderIncidenciasScreen ────────────────────────────
(function(){
  if(typeof window.renderIncidenciasScreen !== 'function') return;
  var _origRenderIncidenciasScreen = window.renderIncidenciasScreen;

  window.renderIncidenciasScreen = async function(){
    await _origRenderIncidenciasScreen.apply(this, arguments);
    setTimeout(_adjInjectInputs, 100);
  };
})();

// ═══════════════════════════════════════════════════════════════════════
// FIN — adjuntos.js cargado
// ═══════════════════════════════════════════════════════════════════════
console.log('SYNCRO SHIFT — adjuntos.js cargado');
