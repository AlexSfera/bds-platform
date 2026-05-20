// ═══════════════════════════════════════════════════════════════════════
// GESTIONES — módulo dedicado · SYNCRO HUB
// Extraído de shared.js + recepcion.js + dashboard.js · ARCH-03
//
// Depende de (definidos en shared.js, cargado antes):
//   - getDB, dbUpdate, invalidateCache, auditLog, toast, localTs
//   - currentUser, validatingShiftId
//   - TASK_STATES, INCIDENT_STATES
//   - isOverdue, isTaskOpen, normalizeTaskState
//   - fmtDate, formatDisplayValue, deptBadge
//   - openValidarModal, renderFollowupList
//
// NOTA: valAdvanceGestion/valSaveCloseGestion operan también sobre tareas
// e incidencias (modal antiguo). Se mantienen aquí porque el entry-point
// (botón "Cerrar gestión") es de gestiones y el nombre así lo indica.
// ═══════════════════════════════════════════════════════════════════════

// ── BADGE ─────────────────────────────────────────────────────────────
function bGestionEstado(st){
  if(!st || st==='Abierta')   return '<span class="badge b-red">Abierta</span>';
  if(st==='En proceso')        return '<span class="badge b-yellow">En proceso</span>';
  if(st==='Cerrada')           return '<span class="badge b-green">Cerrada</span>';
  return '<span class="badge b-gray">'+st+'</span>';
}

// ── ACCIONES GENÉRICAS (Mi Turno / Followup) ──────────────────────────
async function advanceGestion(gid, newState){
  await dbUpdate('gestiones', gid, {estado: newState});
  invalidateCache('gestiones');
  auditLog('GESTION_ADVANCE', currentUser.nombre+' → '+newState+': gestión '+gid);
  toast('Estado actualizado', 'ok');
  if(typeof renderFollowupList === 'function') renderFollowupList();
}

async function openCloseGestion(gid){
  var txt = prompt('Acción tomada para cerrar esta gestión (obligatorio):');
  if(txt === null) return;
  if(!txt.trim()){ toast('Acción obligatoria', 'err'); return; }
  var gg = await getDB('gestiones');
  var g = gg.find(function(x){ return x.id === gid; });
  if(!g){ toast('Gestión no encontrada', 'err'); return; }
  var tgMins = Math.round((Date.now() - new Date(g.created_at).getTime()) / 60000);
  var ts = localTs();
  await dbUpdate('gestiones', gid, {
    estado: 'Cerrada',
    accion_tomada: txt.trim(),
    cerrado_por: currentUser.nombre,
    cerrado_ts: ts,
    tiempo_gestion: tgMins
  });
  invalidateCache('gestiones');
  auditLog('GESTION_CERRADA', 'id: '+gid+' | tiempo: '+tgMins+' min | accion: '+txt.trim());
  toast('Gestión cerrada', 'ok');
  if(typeof renderFollowupList === 'function') renderFollowupList();
}

// ── ACCIONES DESDE openValidarModal — MODAL ANTIGUO (tareas/incidencias) ─
async function valAdvanceGestion(gid,isTask,newState){
  if(isTask){
    var tt=await getDB('tareas'); var t=tt.find(function(x){return x.id===gid;}); if(!t) return;
    await dbUpdate('tareas',gid,{estado:TASK_STATES.EN_PROCESO,updated_at:localTs()});
    invalidateCache('tareas');
    auditLog('VAL_GESTION_ADVANCE',currentUser.nombre+' → En proceso: '+t.titulo+' (shift '+validatingShiftId+')');
  } else {
    await dbUpdate('incidencias',gid,{estado:INCIDENT_STATES.EN_PROCESO});
    invalidateCache('incidencias');
    auditLog('VAL_GESTION_ADVANCE',currentUser.nombre+' → En proceso (gestión-inci '+gid+', shift '+validatingShiftId+')');
  }
  toast('En proceso','ok'); await openValidarModal(validatingShiftId);
}

function valShowCloseGestionForm(gid,isTask){
  var c=document.getElementById('g-btn-'+gid); if(!c) return;
  var sid=validatingShiftId;
  c.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;width:100%;">'
    +'<label style="font-size:11px;color:var(--text3);">Acción para cerrar <span style="color:var(--red)">*</span></label>'
    +'<textarea id="gclose-text-'+gid+'" rows="2" placeholder="Describe la acción tomada..." style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;padding:6px 8px;resize:vertical;outline:none;width:100%;box-sizing:border-box;"></textarea>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="vbtn vbtn-warn" onclick="valSaveCloseGestion(\''+gid+'\','+isTask+')">💾 Guardar cierre</button>'
    +'<button class="vbtn" onclick="openValidarModal(\''+sid+'\')">Cancelar</button>'
    +'</div></div>';
}

async function valSaveCloseGestion(gid,isTask){
  var txt=((document.getElementById('gclose-text-'+gid)||{}).value||'').trim();
  if(!txt){toast('El campo "Acción para cerrar" es obligatorio','err');return;}
  var ts=localTs();
  if(isTask){
    var tt=await getDB('tareas'); var t=tt.find(function(x){return x.id===gid;}); if(!t) return;
    var tgMins=Math.round((Date.now()-new Date(t.created_at).getTime())/60000);
    await dbUpdate('tareas',gid,{estado:TASK_STATES.CERRADA,notas_cierre:txt,completado_por:currentUser.nombre,completado_ts:ts,tiempo_gestion:tgMins,updated_at:ts});
    invalidateCache('tareas');
    auditLog('GESTION_CERRADA','id: '+gid+' | tiempo: '+tgMins+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  } else {
    var ii=await getDB('incidencias'); var inc=ii.find(function(x){return x.id===gid;}); if(!inc) return;
    var tgMinsI=Math.round((Date.now()-new Date(inc.created_at).getTime())/60000);
    await dbUpdate('incidencias',gid,{estado:INCIDENT_STATES.CERRADA,accion_inmediata:txt,cerrado_ts:ts,tiempo_gestion:tgMinsI});
    invalidateCache('incidencias');
    auditLog('GESTION_CERRADA','id: '+gid+' | tiempo: '+tgMinsI+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  }
  toast('Gestión cerrada','ok'); await openValidarModal(validatingShiftId);
}

// ── ACCIONES DESDE openValidarModal — MODAL NUEVO (tabla gestiones) ───
async function valAdvanceGestionNew(gid, newState){
  var gg=await getDB('gestiones'); var g=gg.find(function(x){return x.id===gid;}); if(!g) return;
  await dbUpdate('gestiones',gid,{estado:newState});
  invalidateCache('gestiones');
  auditLog('VAL_GESTION_ADVANCE',currentUser.nombre+' → '+newState+': gestión '+gid+' (shift '+validatingShiftId+')');
  toast('Estado actualizado','ok'); await openValidarModal(validatingShiftId);
}

function valShowCloseGestionNewForm(gid, shiftId){
  var c=document.getElementById('g-btn-'+gid); if(!c) return;
  c.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;width:100%;">'
    +'<label style="font-size:11px;color:var(--text3);">Acción tomada para cerrar <span style="color:var(--red)">*</span></label>'
    +'<textarea id="gnew-close-'+gid+'" rows="2" placeholder="Describe la acción tomada..." style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;padding:6px 8px;resize:vertical;width:100%;box-sizing:border-box;"></textarea>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="vbtn vbtn-warn" onclick="valSaveCloseGestionNew(\''+gid+'\')">💾 Guardar cierre</button>'
    +'<button class="vbtn" onclick="openValidarModal(\''+shiftId+'\')">Cancelar</button>'
    +'</div></div>';
}

async function valSaveCloseGestionNew(gid){
  var txt=((document.getElementById('gnew-close-'+gid)||{}).value||'').trim();
  if(!txt){toast('Acción tomada obligatoria','err');return;}
  var gg=await getDB('gestiones'); var g=gg.find(function(x){return x.id===gid;}); if(!g) return;
  var tgMins=Math.round((Date.now()-new Date(g.created_at).getTime())/60000);
  var ts=localTs();
  await dbUpdate('gestiones',gid,{estado:'Cerrada',accion_tomada:txt,cerrado_por:currentUser.nombre,cerrado_ts:ts,tiempo_gestion:tgMins});
  invalidateCache('gestiones');
  auditLog('GESTION_CERRADA','id: '+gid+' | tiempo: '+tgMins+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  toast('Gestión cerrada','ok'); await openValidarModal(validatingShiftId);
}

// ── RENDER DASHBOARD ──────────────────────────────────────────────────
function _renderGestiones(gestiones, shiftMap) {
  var gridEl = document.getElementById('dash-gestiones-kpi');
  var tableEl = document.getElementById('dash-gestiones-table');
  if (!gridEl && !tableEl) return;

  var abiertas = gestiones.filter(function(t) { return normalizeTaskState(t.estado) === TASK_STATES.ABIERTA; });
  var enProc = gestiones.filter(function(t) { return normalizeTaskState(t.estado) === TASK_STATES.EN_PROCESO; });
  var cerradas = gestiones.filter(function(t) { return normalizeTaskState(t.estado) === TASK_STATES.CERRADA; });
  var vencidas = gestiones.filter(function(t) { return isOverdue(t.deadline) && isTaskOpen(t); });

  if (gridEl) {
    gridEl.innerHTML = '<div class="kpi k-amber"><div class="kpi-lbl">Abiertas</div><div class="kpi-val">' + abiertas.length + '</div></div>'
      + '<div class="kpi k-blue"><div class="kpi-lbl">En proceso</div><div class="kpi-val">' + enProc.length + '</div></div>'
      + '<div class="kpi k-green"><div class="kpi-lbl">Cerradas</div><div class="kpi-val">' + cerradas.length + '</div></div>'
      + '<div class="kpi k-red"><div class="kpi-lbl">Vencidas</div><div class="kpi-val">' + vencidas.length + '</div></div>';
  }

  if (!tableEl) return;

  // Filtros del panel de gestiones
  var dgDept   = (document.getElementById('dg-dept')   || {}).value || '';
  var dgEstado = (document.getElementById('dg-estado') || {}).value || '';

  var filtered = gestiones.slice();
  if (dgDept)   filtered = filtered.filter(function(t) { return (t.departamento || t.area || '') === dgDept; });
  if (dgEstado) filtered = filtered.filter(function(t) { return normalizeTaskState(t.estado) === dgEstado; });

  if (!filtered.length) {
    tableEl.innerHTML = '<div class="empty"><div class="empty-text">Sin gestiones en el periodo</div></div>';
    return;
  }

  filtered.sort(function(a, b) {
    if (isOverdue(a.deadline) && !isOverdue(b.deadline)) return -1;
    if (!isOverdue(a.deadline) && isOverdue(b.deadline)) return 1;
    var ta = (a.created_at || '').replace(' ', 'T');
    var tb = (b.created_at || '').replace(' ', 'T');
    return tb.localeCompare(ta);
  });

  var isAdminUser = currentUser && currentUser.rol === 'admin';

  tableEl.innerHTML = '<div style="overflow-x:auto"><table>'
    + '<tr><th>Fecha</th><th>Hora</th><th>Departamento</th><th>Tipo</th><th>Descripción</th><th>Estado</th><th>Acción tomada</th><th>Acción</th></tr>'
    + filtered.map(function(t) {
      var normSt = normalizeTaskState(t.estado);
      var stColor = normSt === TASK_STATES.ABIERTA ? 'b-red' : normSt === TASK_STATES.EN_PROCESO ? 'b-blue' : 'b-green';
      var vencida = isOverdue(t.deadline);
      var hora = _localHora(t.created_at);
      var fechaVal = t.fecha || (t.created_at ? t.created_at.replace(' ','T').slice(0,10) : '');
      var tipo = formatDisplayValue(t.tipo_gestion || t.titulo || t.origen) || '—';
      var accionTomada = formatDisplayValue(t.accion_tomada) || '—';
      var acciones = '<button class="btn btn-secondary btn-sm" onclick="_dashShowDetail(\'' + t.id + '\',\'gestiones\')">Ver</button>';
      if (isAdminUser) acciones += ' <button class="btn btn-danger btn-sm" onclick="_dashDeleteRecord(\'' + t.id + '\',\'gestiones\')">Eliminar</button>';
      return '<tr style="' + (vencida ? 'background:rgba(239,68,68,.05)' : '') + '">'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(fechaVal) + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + hora + '</td>'
        + '<td>' + deptBadge(t.departamento || t.area || '—') + '</td>'
        + '<td style="font-size:12px">' + tipo + '</td>'
        + '<td style="font-size:12px;max-width:200px">' + formatDisplayValue(t.descripcion) + '</td>'
        + '<td><span class="badge ' + stColor + '">' + normSt + '</span></td>'
        + '<td style="max-width:160px;font-size:12px;color:var(--text3)">' + accionTomada + '</td>'
        + '<td style="white-space:nowrap">' + acciones + '</td>'
        + '</tr>';
    }).join('')
    + '</table></div>';
}
