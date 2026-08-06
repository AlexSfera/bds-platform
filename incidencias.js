// ═══════════════════════════════════════════════════════════════════════
// INCIDENCIAS — módulo dedicado · SYNCRO HUB
// Extraído de shared.js + dashboard.js · ARCH-02
//
// Depende de (definidos en shared.js, cargado antes):
//   - getDB, dbUpdate, invalidateCache, auditLog, toast, localTs, genId
//   - currentUser, validatingShiftId
//   - INCIDENT_STATES, isAdmin, isSupervisor, canViewDepartment
//   - getRecordDepartment, normalizeDeptName
//   - fmtDate, formatDisplayValue, deptBadge, getStaffImplicado
//   - openValidarModal (definido en shared.js, se llama tras cerrar)
//
// Consumido por:
//   - dashboard.js (_renderIncidencias)
//   - shared.js → openValidarModal (valAdvanceInci, valShowCloseInciForm, valSaveCloseInci)
//   - shared.js → buildInciObj, advanceIncident
// ═══════════════════════════════════════════════════════════════════════

// ── ESTADO / NORMALIZACIÓN ────────────────────────────────────────────
function normalizeIncidentState(state){
  if(state==='Pendiente' || state==='Gestionada') return state==='Gestionada'?INCIDENT_STATES.CERRADA:INCIDENT_STATES.ABIERTA;
  if(state===INCIDENT_STATES.ABIERTA || state==='abierta') return INCIDENT_STATES.ABIERTA;
  if(state===INCIDENT_STATES.EN_PROCESO || state==='en proceso') return INCIDENT_STATES.EN_PROCESO;
  if(state===INCIDENT_STATES.CERRADA) return INCIDENT_STATES.CERRADA;
  if(state==='Validada') return INCIDENT_STATES.CERRADA;
  return INCIDENT_STATES.ABIERTA;
}

function isIncidentOpen(i){
  var s=normalizeIncidentState(i&&i.estado);
  return s===INCIDENT_STATES.ABIERTA || s===INCIDENT_STATES.EN_PROCESO;
}

// Distingue incidencia operativa de gestión pendiente (usado por dashboard)
function _isOperationalIncident(i) {
  var cat = normalizeDeptName(i && i.categoria);
  return cat !== 'gestión pendiente'
      && cat !== 'gestion pendiente'
      && cat !== 'follow-up / gestión'
      && cat !== 'follow-up / gestion';
}

// ── PERMISOS ──────────────────────────────────────────────────────────
function canCloseIncident(user,incident,empMap){
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(user)) return true;
  if(!isSupervisor(user)) return false;
  var dept = getRecordDepartment(incident);
  if(dept && dept !== '[NO DATA]' && canViewDepartment(user,dept)) return true;
  // FIX-DEPT: fallback — resolver departamento desde employee_id
  if(incident && incident.employee_id){
    var eMap = empMap || (typeof _adjEmpCache==='object' ? _adjEmpCache : null);
    if(eMap){
      var emp = eMap[incident.employee_id];
      if(emp){
        var empDept = (typeof _deptCatalogo==='function') ? _deptCatalogo(emp) : (emp.area||'');
        if(empDept && canViewDepartment(user,empDept)) return true;
      }
    }
  }
  return false;
}

function canValidateIncident(user,incident){
  var isAdm = typeof canActAsAdmin === 'function' ? canActAsAdmin(user) : isAdmin(user);
  return isAdm && normalizeIncidentState(incident&&incident.estado)===INCIDENT_STATES.CERRADA;
}

// ── BADGE ─────────────────────────────────────────────────────────────
function bIncidentEstado(e){
  var s=normalizeIncidentState(e);
  if(s===INCIDENT_STATES.CERRADA)  return '<span class="badge b-green">Cerrada</span>';
  if(s===INCIDENT_STATES.EN_PROCESO) return '<span class="badge b-blue">En proceso</span>';
  return '<span class="badge b-red">Abierta</span>';
}

// Badge clicable: abre modal unificado.
function bIncidentEstadoClick(e, iid){
  var inner = bIncidentEstado(e);
  return inner.replace('<span class="badge',
    '<span data-itemtype="incidencia" data-itemid="'+iid+'" '
    + 'style="cursor:pointer;" title="Clic para gestionar" class="badge estado-clickable');
}

// ── BUILD ─────────────────────────────────────────────────────────────
function buildInciObj(shiftId,fecha,servicio,ts){
  var descEl=document.getElementById('i-desc');
  var accionEl=document.getElementById('i-accion');
  var staff=getStaffImplicado();
  return {
    id:genId(), shift_id:shiftId, employee_id:currentUser.id, nombre:currentUser.nombre,
    area: currentUser.area||'',
    departamento: (typeof _deptCatalogo==='function' ? _deptCatalogo(currentUser) : '') || currentUser.area || '',
    fecha, servicio,
    categoria:'Reportada por empleado',
    severidad:'Pendiente revision',
    descripcion: descEl ? descEl.value.trim() : '',
    accion_inmediata: accionEl ? accionEl.value.trim() : '',
    staff_implicado_ids: JSON.stringify(staff.ids),
    staff_implicado_nombres: JSON.stringify(staff.nombres),
    tipo_incidencia: (document.getElementById('i-tipo-incidencia')||{}).value || '',
    requiere_formacion: 'No',
    requiere_disciplina: 'No',
    estado: INCIDENT_STATES.ABIERTA,
    created_at: ts
  };
}

// ── TRANSICIÓN GENÉRICA ───────────────────────────────────────────────
async function advanceIncident(incidentId,newEstado){
  var rows=await getDB('incidencias');
  var inci=rows.find(function(i){ return i.id===incidentId; });
  if(!inci){ toast('No se encontró la incidencia.','err'); return; }
  var target=normalizeIncidentState(newEstado);
  if(target===INCIDENT_STATES.EN_PROCESO && !canCloseIncident(currentUser,inci)){
    toast('No tienes permiso para gestionar incidencias de este departamento.','err'); return;
  }
  const saved=await dbUpdate('incidencias',incidentId,{estado: target});
  if(!saved){ toast('No se pudo actualizar la incidencia. Inténtalo de nuevo.','err'); return; }
  invalidateCache('incidencias');
  toast('Incidencia: '+target,'ok');
  if(typeof renderFollowupList==='function') renderFollowupList();
  if(typeof renderDashboard==='function' && document.getElementById('screen-dashboard')?.classList.contains('active')) renderDashboard();
}

// ── ACCIONES DESDE openValidarModal ───────────────────────────────────
async function valAdvanceInci(iid){
  await dbUpdate('incidencias', iid, {estado: INCIDENT_STATES.EN_PROCESO});
  invalidateCache('incidencias');
  auditLog('VAL_INCI_ADVANCE', currentUser.nombre+' → En proceso: incidencia '+iid+' (shift '+validatingShiftId+')');
  toast('En proceso','ok');
  await openValidarModal(validatingShiftId);
}

function valShowCloseInciForm(iid){
  var c=document.getElementById('i-btn-'+iid);
  if(!c) return;
  var sid=validatingShiftId;
  c.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;width:100%;">'
    +'<label style="font-size:11px;color:var(--text3);">Acción para cerrar <span style="color:var(--red)">*</span></label>'
    +'<textarea id="iclose-text-'+iid+'" rows="2" placeholder="Describe la acción tomada..." style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;padding:6px 8px;resize:vertical;outline:none;width:100%;box-sizing:border-box;"></textarea>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="vbtn vbtn-warn" onclick="valSaveCloseInci(\''+iid+'\')">💾 Guardar cierre</button>'
    +'<button class="vbtn" onclick="openValidarModal(\''+sid+'\')">Cancelar</button>'
    +'</div></div>';
}

async function valSaveCloseInci(iid){
  var txt=((document.getElementById('iclose-text-'+iid)||{}).value||'').trim();
  if(!txt){ toast('El campo "Acción para cerrar" es obligatorio','err'); return; }
  var ii=await getDB('incidencias');
  var inc=ii.find(function(x){ return x.id===iid; });
  if(!inc) return;
  var ts=localTs();
  var tgMins=Math.round((Date.now()-new Date(inc.created_at).getTime())/60000);
  await dbUpdate('incidencias', iid, {
    estado: INCIDENT_STATES.CERRADA,
    accion_inmediata: txt,
    cerrado_ts: ts,
    tiempo_gestion: tgMins
  });
  invalidateCache('incidencias');
  auditLog('INCIDENCIA_CERRADA','id: '+iid+' | tiempo: '+tgMins+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  toast('Incidencia cerrada','ok');
  await openValidarModal(validatingShiftId);
}

// ── RENDER DASHBOARD ──────────────────────────────────────────────────
function _renderIncidencias(incis, shiftMap) {
  var el = document.getElementById('dash-inci-table');
  if (!el) return;

  var diDept   = (document.getElementById('di-dept')   || {}).value || '';
  var diCat    = (document.getElementById('di-cat')    || {}).value || '';
  var diSev    = (document.getElementById('di-sev')    || {}).value || '';
  var diEstado = (document.getElementById('di-estado') || {}).value || '';

  var filtered = incis.slice();
  if (diDept) filtered = filtered.filter(function(i) {
    var s = shiftMap && shiftMap[i.shift_id];
    return ((s && s.area) || i.area || '') === diDept;
  });
  if (diCat)    filtered = filtered.filter(function(i) { return i.categoria === diCat; });
  if (diSev)    filtered = filtered.filter(function(i) { return i.severidad === diSev; });
  if (diEstado) filtered = filtered.filter(function(i) { return normalizeIncidentState(i.estado) === diEstado; });

  // KPI incidencias
  var kpiEl = document.getElementById('kpi-incis');
  if (kpiEl) {
    var iAb = filtered.filter(function(i) { return isIncidentOpen(i); }).length;
    var iCerr = filtered.filter(function(i) { return normalizeIncidentState(i.estado) === INCIDENT_STATES.CERRADA; }).length;
    var iCrit = filtered.filter(function(i) { return i.severidad === 'Crítica' || i.severidad === 'Alta'; }).length;
    var resRows = filtered.filter(function(i) { return _resolutionMinutes(i) !== null; });
    var avgRes = resRows.length ? Math.round(resRows.reduce(function(a, i) { return a + _resolutionMinutes(i); }, 0) / resRows.length) : null;
    kpiEl.innerHTML = '<div class="kpi k-red"><div class="kpi-lbl">Total</div><div class="kpi-val">' + filtered.length + '</div></div>'
      + '<div class="kpi k-red"><div class="kpi-lbl">Abiertas</div><div class="kpi-val">' + iAb + '</div></div>'
      + '<div class="kpi k-green"><div class="kpi-lbl">Cerradas</div><div class="kpi-val">' + iCerr + '</div></div>'
      + '<div class="kpi k-red"><div class="kpi-lbl">Alta / crítica</div><div class="kpi-val">' + iCrit + '</div></div>'
      + '<div class="kpi k-blue"><div class="kpi-lbl">T. medio</div><div class="kpi-val">' + (avgRes === null ? '—' : avgRes + 'm') + '</div></div>';
  }

  if (!filtered.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin incidencias en el periodo</div></div>';
    return;
  }

  filtered.sort(function(a, b) { var ta=b.created_at||b.fecha||''; var tb=a.created_at||a.fecha||''; return ta.localeCompare(tb); });

  var isAdminUser = currentUser && currentUser.rol === 'admin';

  el.innerHTML = '<div style="overflow-x:auto"><table>'
    + '<tr><th>Fecha</th><th>Hora</th><th>Departamento</th><th>Tipo</th><th>Severidad</th><th>Descripción</th><th>Acción tomada</th><th>Estado</th><th>Acción</th></tr>'
    + filtered.map(function(i) {
      var sevColor = i.severidad === 'Crítica' ? 'b-red' : i.severidad === 'Alta' ? 'b-orange' : i.severidad === 'Media' ? 'b-yellow' : 'b-gray';
      var iShift = shiftMap && shiftMap[i.shift_id];
      var iDept = (iShift && iShift.area) || i.area || '—';
      var hora = _localHora(i.created_at);
      var accionTomada = formatDisplayValue(i.accion_inmediata) || '—';
      var acciones = '<button class="btn btn-secondary btn-sm" onclick="_dashShowDetail(\'' + i.id + '\',\'incidencias\')">Ver</button>';
      if (isAdminUser) acciones += ' <button class="btn btn-danger btn-sm" onclick="_dashDeleteRecord(\'' + i.id + '\',\'incidencias\')">Eliminar</button>';
      return '<tr>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(i.fecha) + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + hora + '</td>'
        + '<td>' + deptBadge(iDept) + '</td>'
        + '<td style="font-size:12px">' + formatDisplayValue(i.categoria) + '</td>'
        + '<td><span class="badge ' + sevColor + '">' + formatDisplayValue(i.severidad) + '</span></td>'
        + '<td style="max-width:180px;font-size:12px">' + formatDisplayValue(i.descripcion) + '</td>'
        + '<td style="max-width:160px;font-size:12px;color:var(--text3)">' + accionTomada + '</td>'
        + '<td>' + (canCloseIncident(currentUser, i) ? bIncidentEstadoClick(i.estado, i.id) : bIncidentEstado(i.estado)) + '</td>'
        + '<td style="white-space:nowrap">' + acciones + '</td>'
        + '</tr>';
    }).join('')
    + '</table></div>';
}
