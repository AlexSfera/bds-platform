// ═══════════════════════════════════════════════════════════════════════
// MI TURNO — Render del bloque "Gestiones activas / Tareas pendientes"
// que aparece en la pantalla screen-turno.
//
// REFACTOR ARCH-05 (2026-05-22):
//   Movido aquí desde recepcion.js para que el nombre del archivo refleje
//   el contenido. Estas funciones renderizan la pantalla Mi Turno de TODOS
//   los departamentos (Sala, Cocina, Recepción, HK, etc.), no solo Recepción.
//
// Funciones expuestas:
//   - renderFollowupList()      → pinta gestiones+tareas+incidencias en Mi Turno
//   - openNewFollowup()         → modal "+ Nueva incidencia/gestión" del turno
//   - closeFollowupModal()      → cierra modal anterior
//   - saveFollowup()            → guarda gestión/incidencia desde modal
//   - openCloseFollowup(id)     → modal cerrar incidencia
//   - submitCloseFollowup()     → guarda cierre
// ═══════════════════════════════════════════════════════════════════════

var _fuCloseId = null;

async function renderFollowupList() {
  if(!currentUser) return;
  var el        = document.getElementById('followup-incidencias-list');
  var countEl   = document.getElementById('followup-count');
  var btnNew    = document.getElementById('btn-new-followup');
  var subtitleEl= document.getElementById('followup-subtitle');
  if(!el) return;

  var isSupervisorUser = isAdmin(currentUser) || isSupervisor(currentUser);
  var isAdminUser      = isAdmin(currentUser);
  var dept             = currentUser ? (currentUser.area || '') : '';

  if(btnNew)     btnNew.style.display    = isSupervisorUser ? '' : 'none';
  if(subtitleEl) subtitleEl.textContent  = isSupervisorUser
    ? 'Gestiones pendientes, tareas e incidencias operativas del departamento.'
    : 'Gestiones pendientes y tareas visibles para tu departamento.';

  var allIncis = [], allTareas = [], allShifts = [], allGestiones = [], allAjustes = [];
  try { allIncis     = await getDB('incidencias'); } catch(e){}
  try { allTareas    = await getDB('tareas');      } catch(e){}
  try { allShifts    = await getDB('shifts');      } catch(e){}
  try { allGestiones = await getDB('gestiones');   } catch(e){}
  try { allAjustes   = await getDB('ajustes');     } catch(e){}

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
  function isGestion(t){
    var txt = normalizeDeptName([t.origen, t.titulo, t.descripcion].join(' '));
    return txt.indexOf('gestion') !== -1 || txt.indexOf('gestión') !== -1;
  }

  // ── GESTIONES: todos del mismo dpto pueden ver + gestionar + cerrar ──
  var gestiones = allGestiones.filter(function(g){
    if(isAdmin(currentUser) || isSupervisorUser) return sameDept(g);
    // Empleado: todas las gestiones de su departamento (no solo las propias)
    return normalizeDeptName(g.departamento||g.area||'') === normalizeDeptName(dept)
      && g.estado !== 'Cerrada';
  }).filter(function(g){ return g.estado !== 'Cerrada'; });

  // ── TAREAS: empleados del dpto destino + empleado que la creó + admin ──
  var tareas = allTareas.filter(function(t){
    if(!isTaskOpen(t)) return false;
    if(isAdmin(currentUser) || isSupervisorUser) return sameDept(t);
    // Empleado: dpto destino O quien la creó
    var esDeptDestino = normalizeDeptName(t.dept_destino||'') === normalizeDeptName(dept);
    var esCreador = t.creado_por === currentUser.nombre || t.employee_id === currentUser.id;
    return esDeptDestino || esCreador;
  });

  // ── INCIDENCIAS: empleado ve solo las suyas y solo hasta que se cierren ──
  var incidencias;
  if(isAdmin(currentUser) || isSupervisorUser){
    incidencias = allIncis.filter(function(i){
      return isIncidentOpen(i) && sameDept(i);
    });
  } else {
    // Empleado: solo las suyas propias, y solo si no están cerradas
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
        // Empleado origen: solo ve (no puede avanzar ni cerrar)
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
    return '<table><tr><th>Tipo</th><th>Descripción</th><th>Empleado</th><th>Fecha</th><th>Estado</th><th>Acción tomada</th></tr>'
      + list.map(function(i){
        var fechaObj = i.created_at ? new Date(i.created_at) : null;
        var fechaStr = fechaObj ? fechaObj.toLocaleDateString('es-ES')+' '+fechaObj.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
        var accion = formatDisplayValue(i.accion_inmediata) || '—';
        return '<tr>'
          + '<td style="font-size:12px;">'+formatDisplayValue(i.tipo_incidencia||i.categoria)+'</td>'
          + '<td style="font-size:12px;max-width:200px;">'+formatDisplayValue(i.descripcion).slice(0,70)+(i.descripcion&&i.descripcion.length>70?'...':'')+'</td>'
          + '<td style="font-size:12px;">'+formatDisplayValue(i.nombre)+'</td>'
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
    + buildGestionRows(gestiones)
    + '</div>';

  html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">'
    + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--purple);letter-spacing:.12em;margin-bottom:6px;">TAREAS ('+tareas.length+')</div>'
    + buildTaskRows(tareas)
    + '</div>';

  // ── AJUSTES DEL DÍA (solo Sala y Recepción) ──
  var showAjustes = (dept === 'Sala' || dept === 'Recepción' || isAdminUser);
  if(showAjustes){
    var todayStr = today();
    var ajustesHoy = (allAjustes||[]).filter(function(a){
      return a.employee_id === currentUser.id
        && (a.fecha||'').slice(0,10) === todayStr;
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
      + ajustesHtml
      + '</div>';
  }

  if(isSupervisorUser){
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--red);letter-spacing:.12em;margin-bottom:6px;">INCIDENCIAS OPERATIVAS ('+incidencias.length+') — Solo supervisores</div>'
      + buildIncidentRows(incidencias)
      + '</div>';
  }

  el.innerHTML = html;
}

// ── Gestiones en Mi Turno (BUG-39) → gestiones.js ──────────────
// advanceGestion, openCloseGestion → gestiones.js

async function openNewFollowup() {
  ['fu-tipo','fu-desc','fu-mews-id','fu-objetivo','fu-responsable'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  var errEl = document.getElementById('fu-err');
  if(errEl) errEl.textContent = '';

  var empSel = document.getElementById('fu-responsable');
  if(empSel){
    empSel.innerHTML = '<option value="">— Sin asignar —</option>';
    try {
      var emps = await getDB('employees');
      emps.filter(function(e){ return e.estado==='Activo'; }).forEach(function(e){
        var o = document.createElement('option');
        o.value = e.id; o.textContent = e.nombre+' — '+e.puesto;
        o.style.background = '#ffffff'; o.style.color = '#111827';
        empSel.appendChild(o);
      });
    } catch(e){}
  }
  var m = document.getElementById('modal-followup');
  if(m) m.style.display = 'flex';
}

function closeFollowupModal() {
  var m = document.getElementById('modal-followup');
  if(m) m.style.display = 'none';
}

async function saveFollowup() {
  var tipo  = (document.getElementById('fu-tipo')||{value:''}).value;
  var desc  = ((document.getElementById('fu-desc')||{value:''}).value).trim();
  var errEl = document.getElementById('fu-err');
  if(!tipo){ if(errEl) errEl.textContent='Selecciona un tipo'; return; }
  if(!desc){ if(errEl) errEl.textContent='La descripción es obligatoria'; return; }
  if(errEl) errEl.textContent = '';

  // BUG-27 FIX: si no hay shift_id en memoria, buscar turno del empleado de hoy
  var resolvedShiftId = window._lastSavedShiftId || null;
  if(!resolvedShiftId && currentUser){
    try {
      var allShiftsToday = await getDB('shifts');
      var todayStr = today();
      var myShift = allShiftsToday.find(function(s){
        return s.employee_id === currentUser.id && s.fecha === todayStr;
      });
      if(myShift) resolvedShiftId = myShift.id;
    } catch(e){}
  }

  var ts = localTs();
  var record = {
    id: genId(),
    shift_id: resolvedShiftId,
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    departamento: currentUser.area || '—',
    fecha: today(),
    servicio: getRecTurnoValue() || getServicioValue() || '—',
    categoria: 'Gestión pendiente',
    tipo_incidencia: tipo,
    descripcion: desc,
    accion_inmediata: '',
    requiere_formacion: 'no',
    requiere_disciplina: 'no',
    estado: INCIDENT_STATES.ABIERTA,
    severidad: 'Media',
    informado_responsable: 'no',
    staff_implicado_ids: '[]',
    staff_implicado_nombres: '[]',
    created_at: ts
  };

  try {
    var saved = await dbInsert('incidencias', record);
    if(!saved){ if(errEl) errEl.textContent='No se pudo guardar. Inténtalo de nuevo.'; return; }
    invalidateCache('incidencias');
    toast('Gestión pendiente registrada','ok');
    closeFollowupModal();
    renderFollowupList();
  } catch(e){
    if(errEl) errEl.textContent = 'Error: '+(e.message||JSON.stringify(e));
  }
}

function openCloseFollowup(id) {
  _fuCloseId = id;
  ['fu-close-accion','fu-close-resultado','fu-close-comentario'].forEach(function(id2){
    var e = document.getElementById(id2); if(e) e.value = '';
  });
  var errEl = document.getElementById('fu-close-err');
  if(errEl) errEl.textContent = '';
  var m = document.getElementById('modal-followup-close');
  if(m) m.style.display = 'flex';
}

async function submitCloseFollowup() {
  var accion    = ((document.getElementById('fu-close-accion')||{value:''}).value).trim();
  var resultado = ((document.getElementById('fu-close-resultado')||{value:''}).value).trim();
  var errEl     = document.getElementById('fu-close-err');

  if(!accion){    if(errEl) errEl.textContent='La acción realizada es obligatoria'; return; }
  if(!resultado){ if(errEl) errEl.textContent='El resultado es obligatorio'; return; }

  var ts = localTs();
  try {
    var allIncis = await getDB('incidencias');
    var inci = allIncis.find(function(i){ return i.id === _fuCloseId; });
    if(!inci){ if(errEl) errEl.textContent='No se encontró la incidencia.'; return; }

    var allShifts = await getDB('shifts');
    var shiftMap  = {};
    allShifts.forEach(function(s){ if(s.id) shiftMap[s.id] = s; });

    if(!(isAdmin(currentUser) || (isSupervisor(currentUser) && canViewDepartment(currentUser, getRecordDepartment(inci, shiftMap))))){
      if(errEl) errEl.textContent = 'No tienes permiso para cerrar incidencias de este departamento.';
      return;
    }

    var comentarioCierre = ((document.getElementById('fu-close-comentario')||{value:''}).value).trim();
    if((inci.severidad==='Alta'||inci.severidad==='Crítica') && !comentarioCierre){
      if(errEl) errEl.textContent = 'El comentario de cierre es obligatorio para incidencias de alta severidad.';
      return;
    }

    // BUG-09 FIX: calcular tiempo de gestión en minutos
    var tiempoMs  = inci.created_at ? (new Date(ts) - new Date(inci.created_at)) : 0;
    var tiempoMin = Math.round(tiempoMs / 60000);

    var cierreTxt = accion + (resultado ? ' · Resultado: '+resultado : '') + (comentarioCierre ? ' · Nota: '+comentarioCierre : '');

    var saved = await dbUpdate('incidencias', _fuCloseId, {
      estado:          INCIDENT_STATES.CERRADA,
      accion_tomada:   cierreTxt,
      accion_inmediata:[inci.accion_inmediata, cierreTxt].filter(Boolean).join(' | '),
      cerrado_ts:      ts,
      cerrado_por:     currentUser.nombre,
      tiempo_gestion:  tiempoMin
    });
    if(!saved){ if(errEl) errEl.textContent='No se pudo cerrar la incidencia. Inténtalo de nuevo.'; return; }

    invalidateCache('incidencias');
    toast('Incidencia cerrada — '+fmtTiempoGestion(tiempoMin),'ok');
    var m = document.getElementById('modal-followup-close');
    if(m) m.style.display = 'none';
    renderFollowupList();
  } catch(e){
    if(errEl) errEl.textContent = 'No se pudo cerrar la incidencia. Inténtalo de nuevo.';
  }
}
