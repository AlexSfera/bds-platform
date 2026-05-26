// ═══════════════════════════════════════════════════════════════════════
// HYPOXIC ROOM — Incidencias específicas de habitaciones con hipoxia.
// Sólo Recepción Hotel.
//
// Flujo:
//   - Botón en Mi Turno (sólo Recepción) → openHypoxicModal()
//   - Modal con N líneas: cada línea = 1 habitación + tipos + CO2 + 2 toggles
//   - Confirmar valida y mete en _hypoxicLines (memoria)
//   - Al cerrar turno (shared.js) se insertan en tabla hypoxic_room_incidencias
//
// Funciones expuestas:
//   - openHypoxicModal(), closeHypoxicModal()
//   - addHypoxicLine(), removeHypoxicLine(i)
//   - onHypoxicTypeChange(i), setHypoxicToggle(i,field,val)
//   - confirmHypoxic(), resetHypoxicLines(), refreshHypoxicBlock()
// ═══════════════════════════════════════════════════════════════════════

var _hypoxicLines = [];
var _editingHypoxicId = null;

var HYPOXIC_ROOMS = ['104','105','106','107','108','109','202','203','204','205','206','207','208','209'];
var HYPOXIC_TYPES = ['Hipoxia está por debajo','Valores de sensores raros','Hipoxia está por encima','Hipoxia no enciende','Otro'];

function isRecepcionUserHyp(){
  return currentUser && currentUser.area === 'Recepción';
}

function refreshHypoxicBlock(){
  var block = document.getElementById('hypoxic-block');
  if(!block) return;
  block.style.display = isRecepcionUserHyp() ? '' : 'none';
  var summary = document.getElementById('hypoxic-summary');
  if(!summary) return;
  if(_hypoxicLines.length === 0){
    summary.innerHTML = '<span style="color:var(--text3);">Sin incidencias Hypoxic Room registradas en este turno</span>';
  } else {
    summary.innerHTML = '<strong style="color:#3b82f6;">'+_hypoxicLines.length+' habitación(es) con incidencia:</strong>'
      + _hypoxicLines.map(function(l){
          var types = (l.incident_types||[]).join(', ');
          var horaTxt = '';
          if(l.created_at){
            try {
              var d = new Date(l.created_at);
              horaTxt = ' <span style="color:var(--text3);font-size:11px;">(anotado '+d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})+')</span>';
            } catch(e){}
          }
          return '<div style="margin-top:4px;font-size:12px;">• Habitación <strong>'+l.room_number+'</strong> — '+types+' — CO2: <strong>'+l.co2_level+'</strong>'+horaTxt+'</div>';
        }).join('');
  }
}
window.refreshHypoxicBlock = refreshHypoxicBlock;

function resetHypoxicLines(){
  _hypoxicLines = [];
  refreshHypoxicBlock();
}
window.resetHypoxicLines = resetHypoxicLines;

function openHypoxicModal(){
  var modal = document.getElementById('modal-hypoxic');
  if(!modal) return;
  // Cada apertura del modal es una sesión independiente: empezar limpio (modo creación)
  _hypoxicLines = [];
  _editingHypoxicId = null;
  var container = document.getElementById('hypoxic-lines');
  if(container) container.innerHTML = '';
  renderHypoxicLine(0, { created_at: (typeof localTs === 'function' ? localTs() : new Date().toISOString()) });
  // Restaurar UI modo creación
  setHypoxicModalMode('create');
  modal.style.display = 'flex';
}
window.openHypoxicModal = openHypoxicModal;

async function editHypoxicItem(hid){
  var isAdminU = (typeof isAdmin === 'function') && isAdmin(currentUser);
  var isJefeRec = currentUser && currentUser.rol === 'jefe_recepcion';
  if(!isAdminU && !isJefeRec){ toast('Sin permiso para rectificar','err'); return; }

  var all = [];
  try { all = await getDB('hypoxic_room_incidencias'); } catch(e){}
  var h = (all||[]).find(function(x){ return x.id===hid; });
  if(!h){ toast('Incidencia no encontrada','err'); return; }

  var types = [];
  try { types = JSON.parse(h.incident_types||'[]'); } catch(e){ types = []; }

  _editingHypoxicId = hid;
  _hypoxicLines = [];

  var modal = document.getElementById('modal-hypoxic');
  var container = document.getElementById('hypoxic-lines');
  if(container) container.innerHTML = '';
  renderHypoxicLine(0, {
    room_number: h.room_number,
    incident_types: types,
    co2_level: h.co2_level,
    current_altitude_m: h.current_altitude_m,
    set_point_altitude_m: h.set_point_altitude_m,
    door_open: h.door_open_multiple_over_1min_last_hour,
    client_notified: h.client_notified_reception,
    observaciones: h.observaciones,
    created_at: h.created_at
  });
  setHypoxicModalMode('edit');
  modal.style.display = 'flex';
}
window.editHypoxicItem = editHypoxicItem;

function setHypoxicModalMode(mode){
  var titleEl  = document.getElementById('modal-hypoxic-title');
  var addBtn   = document.getElementById('hypoxic-add-btn');
  var confBtn  = document.getElementById('hypoxic-confirm-btn');
  if(mode === 'edit'){
    if(titleEl)  titleEl.textContent  = '✏️ Rectificar incidencia Hypoxic Room';
    if(addBtn)   addBtn.style.display = 'none';
    if(confBtn)  confBtn.innerHTML    = '✓ Guardar cambios';
  } else {
    if(titleEl)  titleEl.textContent  = '🌬 Incidencias Hypoxic Room';
    if(addBtn)   addBtn.style.display = '';
    if(confBtn)  confBtn.innerHTML    = '✓ Guardar incidencias Hypoxic Room';
  }
}
window.setHypoxicModalMode = setHypoxicModalMode;

function closeHypoxicModal(){
  var modal = document.getElementById('modal-hypoxic');
  if(modal) modal.style.display = 'none';
  _editingHypoxicId = null;
  if(typeof setHypoxicModalMode === 'function') setHypoxicModalMode('create');
}
window.closeHypoxicModal = closeHypoxicModal;

function addHypoxicLine(){
  var container = document.getElementById('hypoxic-lines');
  if(!container) return;
  var i = container.children.length;
  // Asignar timestamp local en el momento de añadir la línea
  renderHypoxicLine(i, { created_at: (typeof localTs === 'function' ? localTs() : new Date().toISOString()) });
}
window.addHypoxicLine = addHypoxicLine;

function renderHypoxicLine(i, data){
  var container = document.getElementById('hypoxic-lines');
  if(!container) return;
  var d = data || {};
  var roomsOpts = HYPOXIC_ROOMS.map(function(r){
    return '<option value="'+r+'"'+(d.room_number===r?' selected':'')+'>'+r+'</option>';
  }).join('');
  // Checkboxes en grid 2 columnas, texto en case normal (sobrescribir uppercase global)
  var typesHtml = HYPOXIC_TYPES.map(function(t){
    var checked = (d.incident_types && d.incident_types.indexOf(t)>=0) ? ' checked' : '';
    var bgChecked = checked ? 'background:rgba(59,130,246,.08);border-color:#3b82f6;color:#1e3a8a;' : 'background:#fff;border:1px solid #d1d5db;color:#111827;';
    return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;cursor:pointer;padding:8px 10px;border-radius:6px;text-transform:none;letter-spacing:0;'+bgChecked+'transition:all .12s;">'
      + '<input type="checkbox" name="hyp-type-'+i+'" value="'+t+'"'+checked+' onchange="onHypoxicTypeChange('+i+')" style="width:16px;height:16px;cursor:pointer;accent-color:#3b82f6;">'
      + '<span style="text-transform:none;">'+t+'</span>'
      + '</label>';
  }).join('');
  var obsReq = (d.incident_types && d.incident_types.indexOf('Otro')>=0) ? ' <span class="req">*</span>' : '';
  var doorSiCls = d.door_open===true  ? ' t-si' : '';
  var doorNoCls = d.door_open===false ? ' t-no' : '';
  var cliSiCls  = d.client_notified===true  ? ' t-si' : '';
  var cliNoCls  = d.client_notified===false ? ' t-no' : '';
  var inpStyle = 'color:#111827;background:#ffffff;border:1px solid #d1d5db;padding:8px 10px;border-radius:6px;font-size:14px;width:100%;box-sizing:border-box;';
  // Hora de anotación
  var horaTxt = '';
  if(d.created_at){
    try {
      var dt = new Date(d.created_at);
      horaTxt = ' <span style="color:var(--text3);font-size:10px;font-weight:400;text-transform:none;letter-spacing:0;">· anotado '+dt.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})+'</span>';
    } catch(e){}
  }

  var html = ''
    + '<div class="hypoxic-line" data-idx="'+i+'" data-created="'+(d.created_at||'')+'" style="background:var(--bg);border:1px solid #3b82f6;border-radius:10px;padding:16px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.04);">'
    // Header
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);">'
    +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:.12em;">HABITACIÓN #'+(i+1)+horaTxt+'</div>'
    +   '<button onclick="removeHypoxicLine('+i+')" title="Eliminar" style="background:none;border:1px solid var(--border);cursor:pointer;color:var(--red);font-size:14px;padding:4px 10px;border-radius:6px;">🗑</button>'
    + '</div>'
    + '<input type="hidden" id="hyp-created-'+i+'" value="'+(d.created_at||'')+'">'
    // Habitación
    + '<div class="fg" style="margin-bottom:14px;"><label>Habitación <span class="req">*</span></label>'
    +   '<select id="hyp-room-'+i+'" style="'+inpStyle+'"><option value="">— Seleccionar —</option>'+roomsOpts+'</select></div>'
    // Tipos (grid 2 cols)
    + '<div class="fg" style="margin-bottom:14px;"><label>Tipo de incidencia <span class="req">*</span> <span style="color:var(--text3);font-weight:400;font-size:11px;text-transform:none;letter-spacing:0;">(selecciona uno o varios)</span></label>'
    +   '<div id="hyp-types-grp-'+i+'" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;">'+typesHtml+'</div>'
    + '</div>'
    // Mediciones (3 cols) — orden: Valor actual, Set point, CO2
    + '<div style="margin-bottom:14px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;">'
    +   '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.12em;margin-bottom:10px;">📊 MEDICIONES</div>'
    +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">'
    +     '<div class="fg" style="margin:0;"><label style="font-size:11px;">Valor actual (m) <span class="req">*</span></label>'
    +       '<input type="number" id="hyp-curralt-'+i+'" min="100" max="9999" step="1" placeholder="ej: 1850" value="'+(d.current_altitude_m||'')+'" style="'+inpStyle+'">'
    +       '<div style="font-size:10px;color:var(--text3);margin-top:4px;text-transform:none;letter-spacing:0;">3-4 cifras · altitud real</div>'
    +     '</div>'
    +     '<div class="fg" style="margin:0;"><label style="font-size:11px;">Set point (m) <span class="req">*</span></label>'
    +       '<input type="number" id="hyp-setpt-'+i+'" min="1000" max="9999" step="1" placeholder="ej: 2500" value="'+(d.set_point_altitude_m||'')+'" style="'+inpStyle+'">'
    +       '<div style="font-size:10px;color:var(--text3);margin-top:4px;text-transform:none;letter-spacing:0;">4 cifras · altitud objetivo</div>'
    +     '</div>'
    +     '<div class="fg" style="margin:0;"><label style="font-size:11px;">Nivel CO2 <span class="req">*</span></label>'
    +       '<input type="number" id="hyp-co2-'+i+'" min="100" max="9999" step="1" placeholder="ej: 1200" value="'+(d.co2_level||'')+'" style="'+inpStyle+'">'
    +       '<div style="font-size:10px;color:var(--text3);margin-top:4px;text-transform:none;letter-spacing:0;">3-4 cifras (ppm)</div>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    // Toggles SI/NO (grid 2 cols)
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:14px;">'
    +   '<div class="fg" style="margin:0;"><label style="font-size:11px;">Apertura múltiple puerta +1min (última hora) <span class="req">*</span></label>'
    +     '<div class="toggle-group" id="hyp-door-grp-'+i+'" style="display:flex;gap:6px;margin-top:4px;">'
    +       '<button type="button" class="tbtn'+doorSiCls+'" onclick="setHypoxicToggle('+i+',\'door\',true)">SÍ</button>'
    +       '<button type="button" class="tbtn'+doorNoCls+'" onclick="setHypoxicToggle('+i+',\'door\',false)">NO</button>'
    +     '</div>'
    +     '<input type="hidden" id="hyp-door-'+i+'" value="'+(d.door_open===true?'si':d.door_open===false?'no':'')+'"></div>'
    +   '<div class="fg" style="margin:0;"><label style="font-size:11px;">Cliente notificó a recepción <span class="req">*</span></label>'
    +     '<div class="toggle-group" id="hyp-client-grp-'+i+'" style="display:flex;gap:6px;margin-top:4px;">'
    +       '<button type="button" class="tbtn'+cliSiCls+'" onclick="setHypoxicToggle('+i+',\'client\',true)">SÍ</button>'
    +       '<button type="button" class="tbtn'+cliNoCls+'" onclick="setHypoxicToggle('+i+',\'client\',false)">NO</button>'
    +     '</div>'
    +     '<input type="hidden" id="hyp-client-'+i+'" value="'+(d.client_notified===true?'si':d.client_notified===false?'no':'')+'"></div>'
    + '</div>'
    // Observaciones
    + '<div class="fg" style="margin:0;"><label id="hyp-obs-lbl-'+i+'" style="font-size:11px;">Observaciones'+obsReq+'</label>'
    +   '<textarea id="hyp-obs-'+i+'" rows="2" placeholder="Detalle adicional..." style="'+inpStyle+'">'+(d.observaciones||'')+'</textarea></div>'
    + '</div>';

  if(i < container.children.length){
    container.children[i].outerHTML = html;
  } else {
    container.insertAdjacentHTML('beforeend', html);
  }
}

function onHypoxicTypeChange(i){
  var otros = document.querySelectorAll('input[name="hyp-type-'+i+'"][value="Otro"]:checked');
  var lbl = document.getElementById('hyp-obs-lbl-'+i);
  if(!lbl) return;
  lbl.innerHTML = otros.length > 0 ? 'Observaciones <span class="req">*</span>' : 'Observaciones';
}
window.onHypoxicTypeChange = onHypoxicTypeChange;

function setHypoxicToggle(i, field, val){
  var hid = document.getElementById('hyp-'+field+'-'+i);
  if(hid) hid.value = val ? 'si' : 'no';
  var grp = document.getElementById('hyp-'+field+'-grp-'+i);
  if(!grp) return;
  var btns = grp.querySelectorAll('button');
  btns.forEach(function(b){
    b.classList.remove('t-si');
    b.classList.remove('t-no');
    var btnIsSi = b.textContent.trim().indexOf('SÍ') >= 0;
    if(btnIsSi === val){
      b.classList.add(val ? 't-si' : 't-no');
    }
  });
}
window.setHypoxicToggle = setHypoxicToggle;

function removeHypoxicLine(i){
  var container = document.getElementById('hypoxic-lines');
  if(!container) return;
  if(container.children.length <= 1){
    toast('Debe haber al menos una habitación','warn');
    return;
  }
  var lines = collectHypoxicFromUI();
  lines.splice(i, 1);
  container.innerHTML = '';
  lines.forEach(function(line, idx){ renderHypoxicLine(idx, line); });
}
window.removeHypoxicLine = removeHypoxicLine;

function collectHypoxicFromUI(){
  var lines = [];
  var container = document.getElementById('hypoxic-lines');
  if(!container) return lines;
  var count = container.children.length;
  for(var i=0;i<count;i++){
    var room = (document.getElementById('hyp-room-'+i)||{}).value || '';
    var types = [];
    document.querySelectorAll('input[name="hyp-type-'+i+'"]:checked').forEach(function(cb){ types.push(cb.value); });
    var co2Raw = (document.getElementById('hyp-co2-'+i)||{}).value || '';
    var co2 = co2Raw === '' ? null : parseInt(co2Raw, 10);
    var currAltRaw = (document.getElementById('hyp-curralt-'+i)||{}).value || '';
    var currAlt = currAltRaw === '' ? null : parseInt(currAltRaw, 10);
    var setPtRaw = (document.getElementById('hyp-setpt-'+i)||{}).value || '';
    var setPt = setPtRaw === '' ? null : parseInt(setPtRaw, 10);
    var doorRaw = (document.getElementById('hyp-door-'+i)||{}).value || '';
    var clientRaw = (document.getElementById('hyp-client-'+i)||{}).value || '';
    var obs = (document.getElementById('hyp-obs-'+i)||{}).value || '';
    var createdAt = (document.getElementById('hyp-created-'+i)||{}).value || '';
    if(!createdAt){
      createdAt = (typeof localTs === 'function' ? localTs() : new Date().toISOString());
    }
    lines.push({
      room_number: room,
      incident_types: types,
      co2_level: co2,
      co2_raw: co2Raw,
      current_altitude_m: currAlt,
      current_altitude_raw: currAltRaw,
      set_point_altitude_m: setPt,
      set_point_raw: setPtRaw,
      door_open: doorRaw === 'si' ? true : (doorRaw === 'no' ? false : null),
      client_notified: clientRaw === 'si' ? true : (clientRaw === 'no' ? false : null),
      observaciones: obs.trim(),
      created_at: createdAt
    });
  }
  return lines;
}

function validateHypoxicLine(line, idx){
  var prefix = 'Habitación #'+(idx+1)+': ';
  if(!line.room_number) return prefix+'Selecciona una habitación';
  if(HYPOXIC_ROOMS.indexOf(line.room_number) < 0) return prefix+'Habitación no autorizada';
  if(!line.incident_types || line.incident_types.length === 0) return prefix+'Selecciona al menos un tipo de incidencia';
  // CO2: solo enteros, 3 o 4 cifras
  if(line.co2_raw === '' || line.co2_raw === null || line.co2_raw === undefined) return prefix+'Introduce nivel CO2';
  if(!/^\d+$/.test(String(line.co2_raw).trim())) return prefix+'Nivel CO2 sólo acepta enteros (sin texto, símbolos ni decimales)';
  var co2Str = String(line.co2_level);
  if(co2Str.length < 3 || co2Str.length > 4) return prefix+'Nivel CO2 debe tener 3 o 4 cifras (ej: 450 o 1200)';
  if(line.co2_level < 100 || line.co2_level > 9999) return prefix+'Nivel CO2 fuera de rango (100-9999)';
  // Valor actual (m): 3-4 cifras
  if(line.current_altitude_raw === '' || line.current_altitude_raw === null || line.current_altitude_raw === undefined) return prefix+'Introduce Valor actual (m)';
  if(!/^\d+$/.test(String(line.current_altitude_raw).trim())) return prefix+'Valor actual (m) sólo acepta enteros';
  var currStr = String(line.current_altitude_m);
  if(currStr.length < 3 || currStr.length > 4) return prefix+'Valor actual (m) debe tener 3 o 4 cifras (ej: 850 o 1850)';
  // Set point (m): exactamente 4 cifras
  if(line.set_point_raw === '' || line.set_point_raw === null || line.set_point_raw === undefined) return prefix+'Introduce Set point (m)';
  if(!/^\d+$/.test(String(line.set_point_raw).trim())) return prefix+'Set point (m) sólo acepta enteros';
  var setStr = String(line.set_point_altitude_m);
  if(setStr.length !== 4) return prefix+'Set point (m) debe tener exactamente 4 cifras (ej: 2500)';
  if(line.set_point_altitude_m < 1000 || line.set_point_altitude_m > 9999) return prefix+'Set point (m) fuera de rango (1000-9999)';
  // Toggles obligatorios
  if(line.door_open !== true && line.door_open !== false) return prefix+'Indica si hubo apertura múltiple de puerta';
  if(line.client_notified !== true && line.client_notified !== false) return prefix+'Indica si el cliente notificó el problema';
  // Observaciones obligatorias si "Otro"
  if(line.incident_types.indexOf('Otro') >= 0 && !line.observaciones) return prefix+'Observaciones obligatorias cuando seleccionas "Otro"';
  return null;
}

async function confirmHypoxic(){
  var lines = collectHypoxicFromUI();
  if(lines.length === 0){
    toast('No hay habitaciones para guardar','err');
    return;
  }
  for(var i=0;i<lines.length;i++){
    var err = validateHypoxicLine(lines[i], i);
    if(err){ toast(err,'err'); return; }
  }

  // Modo edición: actualizar una sola incidencia
  if(_editingHypoxicId){
    var l = lines[0];
    var nowTs = (typeof localTs === 'function' ? localTs() : new Date().toISOString());
    var payload = {
      room_number: l.room_number,
      incident_types: JSON.stringify(l.incident_types || []),
      co2_level: l.co2_level,
      current_altitude_m: l.current_altitude_m,
      set_point_altitude_m: l.set_point_altitude_m,
      door_open_multiple_over_1min_last_hour: l.door_open,
      client_notified_reception: l.client_notified,
      observaciones: l.observaciones || '',
      updated_at: nowTs,
      updated_by: currentUser.nombre || currentUser.id
    };
    try {
      var upd = await dbUpdate('hypoxic_room_incidencias', _editingHypoxicId, payload);
      if(!upd){ toast('Error al rectificar (ver consola)','err'); return; }
      invalidateCache('hypoxic_room_incidencias');
      if(typeof auditLog === 'function'){
        await auditLog('HYPOXIC_EDIT', _editingHypoxicId+' rectificada por '+currentUser.nombre);
      }
      _editingHypoxicId = null;
      closeHypoxicModal();
      toast('✓ Incidencia rectificada','ok');
      if(typeof renderHypoxicMod === 'function') renderHypoxicMod();
    } catch(eEdit){
      console.error('Error rectificando Hypoxic:', eEdit);
      toast('Error al rectificar (ver consola)','err');
    }
    return;
  }

  // Modo creación: insertar líneas nuevas
  var saved = 0;
  try {
    for(var j=0;j<lines.length;j++){
      var ln = lines[j];
      var rec = {
        id: genId(),
        shift_id: null,  // se asocia cuando se cierre el turno (patrón ajustes)
        employee_id: currentUser.id,
        employee_nombre: currentUser.nombre,
        department_code: currentUser.area || 'Recepción',
        fecha: (typeof today === 'function' ? today() : new Date().toISOString().slice(0,10)),
        turno: '',
        room_number: ln.room_number,
        incident_types: JSON.stringify(ln.incident_types || []),
        co2_level: ln.co2_level,
        current_altitude_m: ln.current_altitude_m,
        set_point_altitude_m: ln.set_point_altitude_m,
        door_open_multiple_over_1min_last_hour: ln.door_open,
        client_notified_reception: ln.client_notified,
        observaciones: ln.observaciones || '',
        estado: 'Pendiente',
        created_at: ln.created_at || (typeof localTs === 'function' ? localTs() : new Date().toISOString())
      };
      var result = await dbInsert('hypoxic_room_incidencias', rec);
      if(result === null){
        toast('Error guardando habitación '+ln.room_number+' (ver consola)','err');
        return;
      }
      saved++;
    }
    invalidateCache('hypoxic_room_incidencias');
    if(typeof auditLog === 'function'){
      await auditLog('HYPOXIC_NEW', saved+' incidencia(s) Hypoxic Room registradas');
    }
    _hypoxicLines = [];
    closeHypoxicModal();
    toast('✓ '+saved+' incidencia(s) Hypoxic Room guardada(s) correctamente','ok');
    if(typeof renderHypoxicMod === 'function') renderHypoxicMod();
  } catch(eHyp){
    console.error('Error guardando Hypoxic Room:', eHyp);
    toast('Error guardando incidencias (ver consola)','err');
  }
}
window.confirmHypoxic = confirmHypoxic;

// ── Módulo sidebar: pantalla con lista del día + botón añadir ──
async function renderHypoxicMod(){
  var el = document.getElementById('screen-hypoxic-mod');
  if(!el) return;
  var isAdminU = (typeof isAdmin === 'function') && isAdmin(currentUser);
  var isSup    = (typeof isSupervisor === 'function') && isSupervisor(currentUser);
  var todayStr = (typeof today === 'function') ? today() : new Date().toISOString().slice(0,10);
  invalidateCache('hypoxic_room_incidencias');
  var all = [];
  try { all = await getDB('hypoxic_room_incidencias'); } catch(e){}

  // Filtro por rol:
  //  - empleado: SOLO los suyos del día
  //  - jefe_recepcion / admin: todos del día
  var list = (all||[]).filter(function(h){ return (h.fecha||'').slice(0,10) === todayStr; });
  if(!isAdminU && !(currentUser && currentUser.rol === 'jefe_recepcion')){
    list = list.filter(function(h){ return h.employee_id === currentUser.id; });
  }
  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  var pendAssoc = list.filter(function(h){ return !h.shift_id; }).length;

  var cards;
  if(!list.length){
    cards = '<div class="empty"><div class="empty-icon">🌬</div><div class="empty-text">Sin incidencias Hypoxic Room hoy</div></div>';
  } else {
    cards = list.map(function(h){
      var hora = h.created_at ? new Date(h.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
      var types = '';
      try { var arr = JSON.parse(h.incident_types||'[]'); types = Array.isArray(arr) ? arr.join(', ') : (h.incident_types||''); }
      catch(e){ types = h.incident_types||''; }
      var co2 = h.co2_level;
      var co2Class = (co2>=1000) ? 'b-red' : (co2>=700 ? 'b-amber' : 'b-green');
      var puerta = h.door_open_multiple_over_1min_last_hour ? '<span class="badge b-red">Puerta SÍ</span>' : '<span class="badge b-gray">Puerta NO</span>';
      var cliente = h.client_notified_reception ? '<span class="badge b-yellow">Cliente avisó</span>' : '';
      var assocTag = h.shift_id
        ? '<span style="font-size:10px;background:var(--green-dim);color:var(--green);padding:2px 6px;border-radius:6px;margin-left:6px;">en turno</span>'
        : '<span style="font-size:10px;background:var(--amber-dim);color:var(--amber);padding:2px 6px;border-radius:6px;margin-left:6px;">pendiente turno</span>';
      var obs = h.observaciones ? '<div style="font-size:11px;color:var(--text3);margin-top:4px;">📝 '+formatDisplayValue(h.observaciones)+'</div>' : '';
      var altInfo = '';
      if(h.current_altitude_m != null || h.set_point_altitude_m != null){
        altInfo = '<span class="badge b-blue" style="margin-left:6px;">Actual: '+(h.current_altitude_m!=null?h.current_altitude_m+'m':'—')+' / Set: '+(h.set_point_altitude_m!=null?h.set_point_altitude_m+'m':'—')+'</span>';
      }
      // Permisos: admin = editar + borrar; jefe_recepcion = editar; resto = nada
      var isJefeRec = currentUser && currentUser.rol === 'jefe_recepcion';
      var canEdit = isAdminU || isJefeRec;
      var editBtn = canEdit ? ' <button class="btn btn-secondary btn-sm" onclick="editHypoxicItem(\''+h.id+'\')">✏️ Rectificar</button>' : '';
      var delBtn  = isAdminU ? ' <button class="btn btn-danger btn-sm" onclick="deleteHypoxicItem(\''+h.id+'\')">🗑</button>' : '';
      var updTag = h.updated_at ? '<div style="font-size:10px;color:var(--text3);margin-top:2px;text-transform:none;">Rectificado: '+(typeof fmtTs==='function' ? fmtTs(h.updated_at) : h.updated_at)+(h.updated_by?' · '+h.updated_by:'')+'</div>' : '';
      return '<div class="task-card">'
        + '<div class="task-meta" style="align-items:center;flex-wrap:wrap;gap:6px;">'
        +   '<span class="dept-badge" style="background:#3b82f6;color:#fff;">Hab '+formatDisplayValue(h.room_number)+'</span>'
        +   '<span class="task-origin">'+hora+'</span>'
        +   '<span class="badge '+co2Class+'">CO2: '+formatDisplayValue(co2)+'</span>'
        +   altInfo
        +   puerta + (cliente?' '+cliente:'')
        +   assocTag
        +   '<div style="margin-left:auto;display:flex;gap:6px;">'+editBtn+delBtn+'</div>'
        + '</div>'
        + '<div style="font-size:13px;margin-top:6px;"><strong>'+formatDisplayValue(types)+'</strong></div>'
        + obs
        + '<div class="task-footer">'
        +   '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">👤 '+formatDisplayValue(h.employee_nombre||'')+'</div>'
        +   updTag
        + '</div>'
        + '</div>';
    }).join('');
  }

  var subText = list.length+' incidencia(s) hoy';
  if(pendAssoc > 0) subText += ' · <b style="color:var(--amber);">'+pendAssoc+' pendiente(s) de asociar a turno</b>';

  el.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<div><div class="page-title">🌬 Hypoxic Room — hoy</div>'
    + '<div class="page-sub">'+subText+'</div></div>'
    + '<button class="btn btn-primary" onclick="openHypoxicModal()">+ Nueva incidencia</button>'
    + '</div>'
    + '<div>'+cards+'</div>';
}
window.renderHypoxicMod = renderHypoxicMod;

async function deleteHypoxicItem(hid){
  if(typeof isAdmin === 'function' && !isAdmin(currentUser)){ toast('Solo admin','err'); return; }
  if(!confirm('¿Eliminar esta incidencia Hypoxic Room?\n\nNo se puede deshacer.')) return;
  var all = [];
  try { all = await getDB('hypoxic_room_incidencias'); } catch(e){}
  var h = (all||[]).find(function(x){ return x.id===hid; });
  if(typeof auditLog === 'function') await auditLog('HYPOXIC_DELETE', hid+' | '+JSON.stringify(h||{}).slice(0,200));
  await dbDelete('hypoxic_room_incidencias', hid);
  invalidateCache('hypoxic_room_incidencias');
  toast('Incidencia eliminada','ok');
  renderHypoxicMod();
}
window.deleteHypoxicItem = deleteHypoxicItem;
