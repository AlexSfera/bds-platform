// ═══════════════════════════════════════════════════════════════════
// HYPOXIC.JS — Hypoxic Room incidencias (módulo SYNCROLAB)
// Tabla: hypoxic_room_incidencias
// Estados: Abierta · En proceso · Cerrada
// ═══════════════════════════════════════════════════════════════════

const HYPOXIC_STATES = {
  ABIERTA: 'Abierta',
  EN_PROCESO: 'En proceso',
  CERRADA: 'Cerrada'
};

const HYPOXIC_TIPOS = ['CO2 alto', 'Puerta abierta', 'Sin oxígeno', 'Sensor sin datos', 'Otro'];

function normalizeHypoxicState(state){
  if(state===HYPOXIC_STATES.ABIERTA || state==='abierta' || state==='Pendiente') return HYPOXIC_STATES.ABIERTA;
  if(state===HYPOXIC_STATES.EN_PROCESO || state==='en proceso') return HYPOXIC_STATES.EN_PROCESO;
  if(state===HYPOXIC_STATES.CERRADA || state==='Validada' || state==='Gestionada') return HYPOXIC_STATES.CERRADA;
  return HYPOXIC_STATES.ABIERTA;
}

function bHypoxicEstado(e){
  var s = normalizeHypoxicState(e);
  if(s===HYPOXIC_STATES.CERRADA) return '<span class="badge b-green">Cerrada</span>';
  if(s===HYPOXIC_STATES.EN_PROCESO) return '<span class="badge b-blue">En proceso</span>';
  return '<span class="badge b-red">Abierta</span>';
}

function isHypoxicOpen(h){
  return normalizeHypoxicState(h.estado) !== HYPOXIC_STATES.CERRADA;
}

function _hypoxicResolutionMinutes(h){
  if(h.resolution_time_minutes !== null && h.resolution_time_minutes !== undefined) return h.resolution_time_minutes;
  if(!h.created_at || !h.closed_at) return null;
  try {
    var ms = new Date(h.closed_at).getTime() - new Date(h.created_at).getTime();
    return Math.round(ms / 60000);
  } catch(e) { return null; }
}

function _hypoxicParseTipos(h){
  try {
    var t = h.incident_types ? JSON.parse(h.incident_types) : [];
    if(Array.isArray(t)) return t;
  } catch(e){}
  return h.incident_types ? [h.incident_types] : [];
}

// ── PANTALLA ────────────────────────────────────────────────────────
async function renderHypoxicScreen() {
  var el = document.getElementById('screen-hypoxic');
  if(!el) return;
  el.innerHTML = '<div class="page-header"><div class="page-title">🫁 Hypoxic Room</div><div class="page-sub">Registro de incidencias</div></div>'
    + '<div id="hypoxic-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px;"></div>'
    + '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">'
    + '  <select id="hypoxic-f-estado" class="input" style="max-width:160px;" onchange="_renderHypoxicList()">'
    + '    <option value="abiertas">Solo abiertas</option>'
    + '    <option value="todas">Todas</option>'
    + '    <option value="cerradas">Solo cerradas</option>'
    + '  </select>'
    + '  <select id="hypoxic-f-room" class="input" style="max-width:160px;" onchange="_renderHypoxicList()">'
    + '    <option value="">Todas habitaciones</option>'
    + '  </select>'
    + '  <button class="btn btn-primary" style="margin-left:auto;" onclick="openHypoxicForm()">+ Nueva incidencia</button>'
    + '</div>'
    + '<div id="hypoxic-list"></div>';
  await _renderHypoxicList();
}

async function _renderHypoxicList(){
  var listEl = document.getElementById('hypoxic-list');
  var kpiEl  = document.getElementById('hypoxic-kpis');
  if(!listEl) return;

  var all = [];
  try { all = await getDB('hypoxic_room_incidencias'); } catch(e){}

  // Poblar select de habitaciones (1ª vez)
  var roomSel = document.getElementById('hypoxic-f-room');
  if(roomSel && roomSel.options.length <= 1){
    var rooms = Array.from(new Set(all.map(function(h){return h.room_number;}).filter(Boolean))).sort();
    rooms.forEach(function(r){
      var o = document.createElement('option'); o.value = r; o.textContent = 'Hab. '+r;
      roomSel.appendChild(o);
    });
  }

  var fEstado = (document.getElementById('hypoxic-f-estado')||{value:'abiertas'}).value;
  var fRoom   = (document.getElementById('hypoxic-f-room')||{value:''}).value;

  var filtered = all.slice();
  if(fEstado==='abiertas')  filtered = filtered.filter(isHypoxicOpen);
  else if(fEstado==='cerradas') filtered = filtered.filter(function(h){return !isHypoxicOpen(h);});
  if(fRoom) filtered = filtered.filter(function(h){return h.room_number===fRoom;});

  // KPIs
  if(kpiEl){
    var hAb = filtered.filter(isHypoxicOpen).length;
    var hCerr = filtered.filter(function(h){return !isHypoxicOpen(h);}).length;
    var roomsCnt = Array.from(new Set(filtered.map(function(h){return h.room_number;}).filter(Boolean))).length;
    var resRows = filtered.filter(function(h){return _hypoxicResolutionMinutes(h)!==null;});
    var avgRes = resRows.length ? Math.round(resRows.reduce(function(a,h){return a+_hypoxicResolutionMinutes(h);},0)/resRows.length) : null;
    kpiEl.innerHTML = '<div class="kpi k-blue"><div class="kpi-lbl">Total</div><div class="kpi-val">'+filtered.length+'</div></div>'
      + '<div class="kpi k-red"><div class="kpi-lbl">Abiertas</div><div class="kpi-val">'+hAb+'</div></div>'
      + '<div class="kpi k-green"><div class="kpi-lbl">Cerradas</div><div class="kpi-val">'+hCerr+'</div></div>'
      + '<div class="kpi k-yellow"><div class="kpi-lbl">Habitaciones</div><div class="kpi-val">'+roomsCnt+'</div></div>'
      + '<div class="kpi k-blue"><div class="kpi-lbl">T. medio</div><div class="kpi-val">'+(avgRes===null?'—':avgRes+'m')+'</div></div>';
  }

  if(!filtered.length){
    listEl.innerHTML = '<div class="empty"><div class="empty-icon">🫁</div><div class="empty-text">Sin incidencias Hypoxic</div></div>';
    return;
  }

  filtered.sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});

  var rows = filtered.map(function(h){
    var s = normalizeHypoxicState(h.estado);
    var fecha = h.created_at ? new Date(h.created_at) : null;
    var fechaStr = fecha ? fecha.toLocaleDateString('es-ES')+' '+fecha.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
    var tipos = _hypoxicParseTipos(h).map(function(x){return '<span class="badge b-red" style="margin-right:4px;">'+formatDisplayValue(x)+'</span>';}).join('');

    var actionBtn = '';
    if(s===HYPOXIC_STATES.ABIERTA){
      actionBtn = '<button class="btn btn-secondary" style="font-size:12px;padding:6px 10px;" onclick="advanceHypoxic(\''+h.id+'\')">▶ En proceso</button>';
    } else if(s===HYPOXIC_STATES.EN_PROCESO){
      actionBtn = '<button class="btn btn-success" style="font-size:12px;padding:6px 10px;" onclick="openCloseHypoxic(\''+h.id+'\')">✓ Cerrar</button>';
    }

    var resol = _hypoxicResolutionMinutes(h);
    var resolTxt = resol!==null ? resol+'m' : '—';

    return '<div class="card" style="margin-bottom:8px;padding:12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap;">'
      + '  <div style="flex:1;min-width:240px;">'
      + '    <div style="font-size:12px;color:var(--text3);margin-bottom:6px;">'+fechaStr+' · Hab. <strong>'+formatDisplayValue(h.room_number||'—')+'</strong> · '+bHypoxicEstado(h.estado)+'</div>'
      + (tipos ? '    <div style="margin-bottom:6px;">'+tipos+'</div>' : '')
      + '    <div style="font-size:12px;color:var(--text2);display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px;">'
      + (h.co2_level!=null?'<div>CO₂: <strong>'+h.co2_level+'</strong> ppm</div>':'')
      + (h.current_altitude_m!=null?'<div>Altitud: <strong>'+h.current_altitude_m+'</strong> m</div>':'')
      + (h.set_point_altitude_m!=null?'<div>Set point: <strong>'+h.set_point_altitude_m+'</strong> m</div>':'')
      + (h.door_open_multiple_over_1min_last_hour?'<div>⚠ Puerta abierta &gt;1min</div>':'')
      + (h.client_notified_reception?'<div>✓ Recepción avisada</div>':'')
      + '    </div>'
      + (h.observaciones?'<div style="margin-top:6px;font-size:12px;color:var(--text2);white-space:pre-wrap;">'+formatDisplayValue(h.observaciones)+'</div>':'')
      + (s===HYPOXIC_STATES.CERRADA?'<div style="margin-top:6px;font-size:11px;color:var(--text3);">Cerrado por <strong>'+formatDisplayValue(h.closed_by||'?')+'</strong> · '+resolTxt+'</div>':'')
      + '  </div>'
      + (actionBtn?'  <div>'+actionBtn+'</div>':'')
      + '</div>'
      + '</div>';
  }).join('');
  listEl.innerHTML = rows;
}

// ── ALTA ─────────────────────────────────────────────────────────────
async function openHypoxicForm() {
  var modal = document.getElementById('modal-hypoxic-form');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'modal-hypoxic-form';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:700;padding:16px;';
    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '  <div style="font-size:16px;font-weight:700;color:var(--text);">🫁 Nueva incidencia Hypoxic</div>'
      + '  <button onclick="closeHypoxicForm()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer;">×</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text2);">Habitación *</label>'
      + '  <input id="hyp-room" class="input" placeholder="Ej. 201" style="margin-top:4px;" /></div>'
      + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text2);">Tipo de incidencia *</label>'
      + '  <div id="hyp-tipos" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">'
      +    HYPOXIC_TIPOS.map(function(t){return '<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;"><input type="checkbox" value="'+t+'"> '+t+'</label>';}).join('')
      + '  </div></div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">'
      + '  <div><label style="font-size:12px;color:var(--text2);">CO₂ (ppm)</label><input id="hyp-co2" class="input" type="number" style="margin-top:4px;" /></div>'
      + '  <div><label style="font-size:12px;color:var(--text2);">Altitud (m)</label><input id="hyp-alt-cur" class="input" type="number" style="margin-top:4px;" /></div>'
      + '  <div><label style="font-size:12px;color:var(--text2);">Set point (m)</label><input id="hyp-alt-set" class="input" type="number" style="margin-top:4px;" /></div>'
      + '</div>'
      + '<div style="margin-bottom:10px;display:flex;flex-direction:column;gap:6px;">'
      + '  <label style="font-size:13px;color:var(--text2);"><input type="checkbox" id="hyp-door"> Puerta abierta varias veces &gt;1min en la última hora</label>'
      + '  <label style="font-size:13px;color:var(--text2);"><input type="checkbox" id="hyp-notif"> Recepción avisada al cliente</label>'
      + '</div>'
      + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text2);">Notas iniciales</label>'
      + '  <textarea id="hyp-obs" class="input" rows="2" placeholder="Descripción opcional" style="margin-top:4px;"></textarea></div>'
      + '<div id="hyp-err" style="color:var(--red);font-size:12px;margin-bottom:10px;"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '  <button class="btn btn-secondary" onclick="closeHypoxicForm()">Cancelar</button>'
      + '  <button class="btn btn-primary" onclick="saveHypoxicNew()">Guardar</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(modal);
  }
  // Reset
  ['hyp-room','hyp-co2','hyp-alt-cur','hyp-alt-set','hyp-obs'].forEach(function(id){var e=document.getElementById(id); if(e) e.value='';});
  ['hyp-door','hyp-notif'].forEach(function(id){var e=document.getElementById(id); if(e) e.checked=false;});
  document.querySelectorAll('#hyp-tipos input[type=checkbox]').forEach(function(c){c.checked=false;});
  var er = document.getElementById('hyp-err'); if(er) er.textContent='';
  modal.style.display='flex';
}

function closeHypoxicForm(){
  var m = document.getElementById('modal-hypoxic-form');
  if(m) m.style.display='none';
}

async function saveHypoxicNew(){
  var room = (document.getElementById('hyp-room')||{value:''}).value.trim();
  var tipos = Array.from(document.querySelectorAll('#hyp-tipos input[type=checkbox]:checked')).map(function(c){return c.value;});
  var co2    = (document.getElementById('hyp-co2')||{value:''}).value;
  var altCur = (document.getElementById('hyp-alt-cur')||{value:''}).value;
  var altSet = (document.getElementById('hyp-alt-set')||{value:''}).value;
  var door   = (document.getElementById('hyp-door')||{checked:false}).checked;
  var notif  = (document.getElementById('hyp-notif')||{checked:false}).checked;
  var obs    = (document.getElementById('hyp-obs')||{value:''}).value.trim();
  var errEl  = document.getElementById('hyp-err');

  if(!room){ if(errEl) errEl.textContent='Habitación obligatoria'; return; }
  if(!tipos.length){ if(errEl) errEl.textContent='Selecciona al menos un tipo'; return; }
  if(errEl) errEl.textContent='';

  // Resolver shift_id
  var shiftId = window._lastSavedShiftId || null;
  if(!shiftId && currentUser){
    try {
      var allShifts = await getDB('shifts');
      var todayStr = today();
      var myShift = allShifts.find(function(s){return s.employee_id===currentUser.id && s.fecha===todayStr;});
      if(myShift) shiftId = myShift.id;
    } catch(e){}
  }

  var rec = {
    id: genId(),
    shift_id: shiftId,
    employee_id: currentUser ? currentUser.id : null,
    employee_nombre: currentUser ? currentUser.nombre : null,
    department_code: currentUser ? (currentUser.area||null) : null,
    fecha: today(),
    turno: null,
    room_number: room,
    incident_types: JSON.stringify(tipos),
    co2_level: co2 ? parseInt(co2,10) : null,
    door_open_multiple_over_1min_last_hour: !!door,
    client_notified_reception: !!notif,
    observaciones: obs || null,
    estado: HYPOXIC_STATES.ABIERTA,
    created_at: localTs(),
    updated_at: localTs(),
    current_altitude_m: altCur ? parseInt(altCur,10) : null,
    set_point_altitude_m: altSet ? parseInt(altSet,10) : null,
    updated_by: currentUser ? currentUser.nombre : null
  };

  var saved = await dbInsert('hypoxic_room_incidencias', rec);
  if(!saved){ if(errEl) errEl.textContent='Error al guardar'; return; }
  invalidateCache('hypoxic_room_incidencias');
  auditLog('HYPOXIC_CREATE', rec.id+' | hab '+room+' | '+tipos.join(','));
  toast('Incidencia Hypoxic creada','ok');
  closeHypoxicForm();
  if(document.getElementById('screen-hypoxic')?.classList.contains('active')) _renderHypoxicList();
}

// ── AVANZAR ESTADO ───────────────────────────────────────────────────
async function advanceHypoxic(id){
  var saved = await dbUpdate('hypoxic_room_incidencias', id, {
    estado: HYPOXIC_STATES.EN_PROCESO,
    updated_at: localTs(),
    updated_by: currentUser ? currentUser.nombre : null
  });
  if(!saved){ toast('No se pudo actualizar','err'); return; }
  invalidateCache('hypoxic_room_incidencias');
  auditLog('HYPOXIC_ADVANCE', id+' → En proceso');
  toast('Hypoxic: En proceso','ok');
  _renderHypoxicList();
}

// ── CIERRE CON ACCIÓN TOMADA ─────────────────────────────────────────
function openCloseHypoxic(id){
  window._closingHypoxicId = id;
  var modal = document.getElementById('modal-hypoxic-close');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'modal-hypoxic-close';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:700;padding:16px;';
    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:20px;width:100%;max-width:480px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '  <div style="font-size:16px;font-weight:700;color:var(--text);">✓ Cerrar incidencia Hypoxic</div>'
      + '  <button onclick="closeHypoxicCloseModal()" style="background:none;border:none;color:var(--text3);font-size:22px;cursor:pointer;">×</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text2);">Acción tomada *</label>'
      + '  <textarea id="hyp-close-action" class="input" rows="3" placeholder="¿Qué se hizo para resolverlo?" style="margin-top:4px;"></textarea></div>'
      + '<div id="hyp-close-err" style="color:var(--red);font-size:12px;margin-bottom:10px;"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '  <button class="btn btn-secondary" onclick="closeHypoxicCloseModal()">Cancelar</button>'
      + '  <button class="btn btn-success" onclick="saveCloseHypoxic()">Cerrar incidencia</button>'
      + '</div></div>';
    document.body.appendChild(modal);
  }
  var ta = document.getElementById('hyp-close-action'); if(ta) ta.value='';
  var er = document.getElementById('hyp-close-err'); if(er) er.textContent='';
  modal.style.display='flex';
}

function closeHypoxicCloseModal(){
  var m = document.getElementById('modal-hypoxic-close'); if(m) m.style.display='none';
  window._closingHypoxicId = null;
}

async function saveCloseHypoxic(){
  var id = window._closingHypoxicId;
  if(!id) return;
  var action = (document.getElementById('hyp-close-action')||{value:''}).value.trim();
  var errEl = document.getElementById('hyp-close-err');
  if(!action){ if(errEl) errEl.textContent='Acción tomada obligatoria'; return; }
  if(errEl) errEl.textContent='';

  var all = [];
  try { all = await getDB('hypoxic_room_incidencias'); } catch(e){}
  var rec = all.find(function(h){return h.id===id;});
  if(!rec){ toast('Registro no encontrado','err'); return; }

  var closedTs = localTs();
  var resolMin = null;
  try {
    var ms = new Date(closedTs).getTime() - new Date(rec.created_at).getTime();
    resolMin = Math.round(ms / 60000);
  } catch(e){}

  var newObs = (rec.observaciones ? rec.observaciones + '\n\n' : '') + '[ACCIÓN]: ' + action;

  var saved = await dbUpdate('hypoxic_room_incidencias', id, {
    estado: HYPOXIC_STATES.CERRADA,
    observaciones: newObs,
    closed_at: closedTs,
    closed_by: currentUser ? currentUser.nombre : null,
    resolution_time_minutes: resolMin,
    updated_at: closedTs,
    updated_by: currentUser ? currentUser.nombre : null
  });
  if(!saved){ if(errEl) errEl.textContent='Error al cerrar'; return; }
  invalidateCache('hypoxic_room_incidencias');
  auditLog('HYPOXIC_CERRADA', id+' | '+(resolMin||'?')+'min | '+action.slice(0,80));
  toast('Incidencia Hypoxic cerrada','ok');
  closeHypoxicCloseModal();
  _renderHypoxicList();
}

// Expose
window.renderHypoxicScreen   = renderHypoxicScreen;
window._renderHypoxicList    = _renderHypoxicList;
window.openHypoxicForm       = openHypoxicForm;
window.closeHypoxicForm      = closeHypoxicForm;
window.saveHypoxicNew        = saveHypoxicNew;
window.advanceHypoxic        = advanceHypoxic;
window.openCloseHypoxic      = openCloseHypoxic;
window.closeHypoxicCloseModal= closeHypoxicCloseModal;
window.saveCloseHypoxic      = saveCloseHypoxic;
window.normalizeHypoxicState = normalizeHypoxicState;
window.bHypoxicEstado        = bHypoxicEstado;
window.HYPOXIC_STATES        = HYPOXIC_STATES;
