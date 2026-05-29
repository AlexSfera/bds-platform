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

// ═══════════════════════════════════════════════════════════════════════
// MODAL INFO — Instrucciones visuales POR DEPARTAMENTO
// Botón ℹ en cabecera Mi Turno. Contenido específico según currentUser.area.
// Cada dpto tiene su lógica: campos obligatorios distintos, módulos distintos.
// ═══════════════════════════════════════════════════════════════════════

function renderInfoScreen(){
  if(!currentUser){ return; }
  var area = currentUser.area || 'Empleado';
  var headerEl = document.getElementById('info-screen-header');
  var bodyEl   = document.getElementById('info-screen-body');
  if(headerEl){
    headerEl.innerHTML = '<div class="page-title">📋 Instrucciones · '+area+'</div>'
      + '<div class="page-sub">Cómo rellenar tu turno · Lo que aplica a ti</div>';
  }
  if(bodyEl){
    bodyEl.innerHTML = buildInfoContent(area);
  }
}

function _infoCard(title, body, color){
  color = color || '#3b82f6';
  return '<div style="background:var(--bg);border:1px solid var(--border);border-left:4px solid '+color+';border-radius:8px;padding:14px 16px;margin-bottom:12px;">'
    + '<div style="font-weight:700;color:var(--text);font-size:14px;margin-bottom:8px;">'+title+'</div>'
    + '<div style="font-size:13px;color:var(--text2);line-height:1.6;">'+body+'</div>'
    + '</div>';
}
function _req(t){ return '<span style="color:#ef4444;font-weight:700;">'+t+' *</span>'; }
function _tag(t,c){ return '<span style="display:inline-block;background:'+c+'22;color:'+c+';border:1px solid '+c+';padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;margin:0 2px;">'+t+'</span>'; }

function buildInfoContent(area){

  // ════════════════════════════════════════════════════════════════════
  // BLOQUE COMÚN — Diferencia entre Tarea / Incidencia / Gestión
  // ════════════════════════════════════════════════════════════════════
  var bloqueDiferencias = ''
    + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:12px;">'
    +   '<div style="font-weight:700;color:var(--text);font-size:14px;margin-bottom:12px;">📌 Tarea · Incidencia · Gestión</div>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
    +     '<tr style="background:var(--bg2);">'
    +       '<th style="text-align:left;padding:8px;border:1px solid var(--border);">Tipo</th>'
    +       '<th style="text-align:left;padding:8px;border:1px solid var(--border);">¿Para qué?</th>'
    +       '<th style="text-align:left;padding:8px;border:1px solid var(--border);width:140px;">¿Se traspasa?</th>'
    +     '</tr>'
    +     '<tr><td style="padding:8px;border:1px solid var(--border);">'+_tag('TAREA','#3b82f6')+'</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);">Trabajo que <b>otro dpto</b> u <b>otro turno</b> debe hacer.</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);color:#10b981;font-weight:600;">SÍ — hasta cerrarse</td></tr>'
    +     '<tr><td style="padding:8px;border:1px solid var(--border);">'+_tag('INCIDENCIA','#f59e0b')+'</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);">Algo que <b>ocurrió en tu turno</b>. Ya resuelto o informado.</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);color:#ef4444;font-weight:600;">NO — muere en tu turno</td></tr>'
    +     '<tr><td style="padding:8px;border:1px solid var(--border);">'+_tag('GESTIÓN','#a855f7')+'</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);">Pendiente <b>operativo de tu dpto</b>. Visible al equipo hasta cierre.</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);color:#10b981;font-weight:600;">SÍ — visible al dpto</td></tr>'
    +   '</table>'
    +   '<div style="font-size:12px;color:var(--text3);margin-top:10px;padding:8px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px;">'
    +     '<b>⚠ Regla clave:</b> Si necesita acción del <u>siguiente turno o de otro dpto</u> → <b>TAREA</b>. '
    +     'Si ya cerraste tú → <b>INCIDENCIA</b>.'
    +   '</div>'
    + '</div>';

  // ─── RECEPCIÓN ──────────────────────────────────────────────────────
  if(area === 'Recepción'){
    return ''
    + _infoCard('🏨 Recepción — Tu objetivo en Mi Turno',
        'Registrar el cierre de tu turno: caja, incidencias de cliente y de la cámara hipóxica. '
      + 'Tu turno se valida cuando supervisor confirma que <b>caja cuadra</b> y todas las incidencias quedaron informadas o derivadas a otro dpto.',
        '#10b981')
    + _infoCard('📝 Mi Turno — Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Turno')+' — Mañana / Tarde / Noche (selección única)<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+' — si SÍ → describir<br>'
      + '• '+_req('¿Incidencia? SÍ/NO')+' — si SÍ → describir + informar responsable',
        '#10b981')
    + _infoCard('🏦 Caja Recepción — Obligatorio al cierre',
        'Bloque <b>POSMEWS</b> (lo que dice el sistema): Cash · Tarjeta · Stripe.<br>'
      + 'Bloque <b>Cargos directos</b>: Room Charge · SYNCROLAB Charge · Cargo Alexander.<br>'
      + 'Bloque <b>Pensiones</b>: nº pax desayunos + nº pax comida/cena + importes €.<br>'
      + 'Bloque <b>Conteo real</b>: Cash contado · TPV físico · Stripe plataforma · Propinas TPV · Propinas efectivo.<br><br>'
      + '<b>⚠ Si hay diferencia</b> entre POSMEWS y real → obligatorio: '+_req('Explicación')+' · '+_req('Acción tomada')+' · ¿Informado al responsable?',
        '#06b6d4')
    + _infoCard('🫁 Hypoxic Room — Solo registrar si HAY INCIDENCIA',
        'NO es un registro de uso normal. Solo se rellena cuando la cámara da problemas.<br><br>'
      + '<b>Cuándo crear incidencia:</b> hipoxia por debajo del set point · CO₂ alto · puerta abierta varias veces >1min · sensor sin datos · cliente avisa.<br><br>'
      + '<b>Campos:</b><br>'
      + '• '+_req('Habitación')+' (104–109 / 202–209)<br>'
      + '• '+_req('Tipo de incidencia')+' (puedes marcar varios)<br>'
      + '• CO₂ (ppm) · Altitud actual (m) · Set point (m) — rellenar los que apliquen<br>'
      + '• ☐ Puerta abierta varias veces >1min<br>'
      + '• ☐ Recepción notificada por cliente<br>'
      + '• Anotaciones (opcional)<br><br>'
      + 'Estados: '+_tag('Abierta','#ef4444')+' → '+_tag('En proceso','#3b82f6')+' → '+_tag('Cerrada','#10b981')+'. Al cerrar describe '+_req('Acción tomada')+'.',
        '#06b6d4')
    + bloqueDiferencias
    + _infoCard('✅ Checklist antes de guardar',
        '☐ Caja cuadrada (o diferencia explicada)<br>'
      + '☐ Hypoxic: si hubo aviso del cliente, ¿está creada la incidencia?<br>'
      + '☐ Gestión pendiente marcada (SÍ/NO)<br>'
      + '☐ Incidencia de turno marcada (SÍ/NO)<br>'
      + '☐ Si hay tarea para HK / Mantenimiento → ¿está creada?',
        '#10b981');
  }

  // ─── COCINA ─────────────────────────────────────────────────────────
  if(area === 'Cocina'){
    return ''
    + _infoCard('🍳 Cocina — Tu objetivo en Mi Turno',
        'Registrar servicios cubiertos, merma del día y cualquier incidencia operativa (proveedor, producto, equipo). '
      + 'Sin merma registrada el supervisor <b>no puede validar</b>.',
        '#f59e0b')
    + _infoCard('📝 Mi Turno — Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Servicio')+' — Desayuno / Comida / Cena / Evento (puedes marcar VARIOS)<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+'<br>'
      + '• '+_req('¿Incidencia? SÍ/NO')+'<br>'
      + '• '+_req('Merma')+' — o pulsar "✓ Sin merma en este turno"',
        '#f59e0b')
    + _infoCard('📦 Merma — Obligatorio en Cocina',
        'Una línea por cada producto perdido (rotura, caducidad, error de cocción, devolución).<br><br>'
      + '<b>Cada línea:</b> producto · cantidad · unidad · coste estimado · motivo.<br><br>'
      + 'Si la merma necesita acción de otro dpto (ej. Economato debe reponer, Mantenimiento debe revisar nevera) → marca '
      + '<b>"¿Crear tarea operativa? SÍ"</b> y rellena dpto destinatario + prioridad + deadline.',
        '#f59e0b')
    + bloqueDiferencias
    + _infoCard('✅ Checklist antes de guardar',
        '☐ Todos los servicios del día marcados<br>'
      + '☐ Merma registrada o "Sin merma" marcado<br>'
      + '☐ Si producto requiere reposición → tarea a Economato creada<br>'
      + '☐ Si fallo de equipo → tarea a Mantenimiento creada<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981');
  }

  // ─── SALA ───────────────────────────────────────────────────────────
  if(area === 'Sala'){
    return ''
    + _infoCard('🍽 Sala — Tu objetivo en Mi Turno',
        'Registrar servicios cubiertos, cierre de caja y cualquier incidencia con cliente o servicio. '
      + 'Tu turno se valida cuando caja cuadra y las incidencias están informadas.',
        '#3b82f6')
    + _infoCard('📝 Mi Turno — Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Servicio')+' — Desayuno / Comida / Cena / Evento / Otro (puedes marcar VARIOS)<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+'<br>'
      + '• '+_req('¿Incidencia? SÍ/NO'),
        '#3b82f6')
    + _infoCard('🏦 Caja Sala — Obligatorio al cierre',
        'Bloque <b>POSMEWS</b>: Cash · Tarjeta · Stripe que registra el sistema.<br>'
      + 'Bloque <b>Cargos</b>: Room Charge · SYNCROLAB · Cargo Alexander.<br>'
      + 'Bloque <b>Pensiones</b>: pax desayuno + pax comida/cena + importes.<br>'
      + 'Bloque <b>Real</b>: Cash contado · TPV físico · Stripe plataforma · Propinas TPV · Propinas efectivo.<br><br>'
      + '<b>⚠ Si hay diferencia</b> → obligatorio: '+_req('Explicación')+' · '+_req('Acción tomada')+' · ¿Informado al responsable?',
        '#3b82f6')
    + bloqueDiferencias
    + _infoCard('✅ Checklist antes de guardar',
        '☐ Todos los servicios del día marcados<br>'
      + '☐ Caja cuadrada (o diferencia explicada)<br>'
      + '☐ Si producto roto / falta → tarea a Economato o Cocina<br>'
      + '☐ Si queja de cliente sin resolver → incidencia + informar responsable<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981');
  }

  // ─── MANTENIMIENTO ──────────────────────────────────────────────────
  if(area === 'Mantenimiento'){
    return ''
    + _infoCard('🔧 Mantenimiento — Tu objetivo en Mi Turno',
        'Registrar trabajos realizados y cerrar tareas recibidas de otros dptos (Recepción, HK, Cocina, Sala). '
      + 'Tu valor = tareas cerradas con '+_req('Acción tomada')+' clara.',
        '#ef4444')
    + _infoCard('📝 Mi Turno — Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+'<br>'
      + '• '+_req('¿Incidencia? SÍ/NO'),
        '#ef4444')
    + _infoCard('🔗 Tareas que recibes',
        'Aparecen automáticamente en tu pantalla Mi Turno y en "Tareas Inter-Departamento".<br><br>'
      + '<b>Flujo obligatorio:</b><br>'
      + '1. '+_tag('Abierta','#ef4444')+' → pulsa <b>Iniciar</b><br>'
      + '2. '+_tag('En proceso','#3b82f6')+' → trabajas en ello<br>'
      + '3. Al terminar → <b>Cerrar</b> describiendo '+_req('Acción tomada')+' (qué pieza, qué arreglo, si necesita seguimiento)<br>'
      + '4. '+_tag('Cerrada','#10b981')+' → supervisor verifica<br><br>'
      + 'Si la tarea requiere compra / pieza no disponible → no la cierres, créa GESTIÓN de tu dpto explicando el bloqueo.',
        '#ef4444')
    + bloqueDiferencias
    + _infoCard('✅ Checklist antes de guardar',
        '☐ Todas las tareas trabajadas hoy → estado actualizado<br>'
      + '☐ Tareas cerradas tienen "Acción tomada" descrita<br>'
      + '☐ Bloqueos por falta de pieza → gestión creada<br>'
      + '☐ Si rompiste algo o detectaste problema mayor → incidencia',
        '#10b981');
  }

  // ─── HK / HOUSEKEEPING ──────────────────────────────────────────────
  if(area === 'HK' || area === 'Housekeeping'){
    return ''
    + _infoCard('🧹 Housekeeping — Tu objetivo en Mi Turno',
        'Registrar habitaciones limpiadas, supervisadas y cerrar tareas de Recepción (cambio de toallas, reposición, limpieza extra).',
        '#f97316')
    + _infoCard('📝 Mi Turno — Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+'<br>'
      + '• '+_req('¿Incidencia? SÍ/NO'),
        '#f97316')
    + _infoCard('🔗 Tareas que recibes de Recepción',
        '<b>Flujo:</b> '+_tag('Abierta','#ef4444')+' → <b>Iniciar</b> → '+_tag('En proceso','#3b82f6')+' → <b>Cerrar</b> con '+_req('Acción tomada')+'.<br><br>'
      + 'Si encuentras desperfecto en habitación (mancha persistente, avería, objeto roto) → crea TAREA a Mantenimiento. '
      + 'Si objeto olvidado por cliente → crea INCIDENCIA con descripción + ubicación.',
        '#f97316')
    + bloqueDiferencias
    + _infoCard('✅ Checklist antes de guardar',
        '☐ Tareas recibidas trabajadas o reasignadas<br>'
      + '☐ Desperfectos detectados → tarea a Mantenimiento<br>'
      + '☐ Objetos olvidados → incidencia<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981');
  }

  // ─── SYNCROLAB ──────────────────────────────────────────────────────
  if(/syncrolab/i.test(area)){
    return ''
    + _infoCard('🏋 SYNCROLAB — Tu objetivo en Mi Turno',
        'Registrar sesiones, testing y recovery con cliente identificado. '
      + 'Toda incidencia de seguridad o médica → '+_tag('INCIDENCIA','#f59e0b')+' obligatoria + aviso inmediato al responsable.',
        '#a855f7')
    + _infoCard('📝 Mi Turno — Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+'<br>'
      + '• '+_req('¿Incidencia? SÍ/NO'),
        '#a855f7')
    + _infoCard('🫁 Hypoxic Room — Si detectas problema técnico',
        'Si durante la sesión la cámara da problemas (CO₂ alto, hipoxia por debajo del set point, puerta abierta, sensor sin datos) → '
      + 'crear incidencia en módulo Hypoxic con: '+_req('Habitación')+' · '+_req('Tipo')+' · CO₂ · Altitud · Set point · Anotaciones.<br><br>'
      + 'Si el cliente sufre malestar → INCIDENCIA + parar sesión + informar responsable.',
        '#a855f7')
    + bloqueDiferencias
    + _infoCard('✅ Checklist antes de guardar',
        '☐ Sesiones del día registradas<br>'
      + '☐ Problemas técnicos cámara → incidencia Hypoxic<br>'
      + '☐ Incidencia médica/seguridad → marcada + informada<br>'
      + '☐ Material que falte → tarea a Economato',
        '#10b981');
  }

  // ─── ECONOMATO ──────────────────────────────────────────────────────
  if(area === 'Economato'){
    return ''
    + _infoCard('📦 Economato — Tu objetivo en Mi Turno',
        'Registrar entradas de proveedores, atender peticiones de Cocina/Sala/SYNCROLAB y cerrar tareas de reposición.',
        '#06b6d4')
    + _infoCard('📝 Mi Turno — Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+'<br>'
      + '• '+_req('¿Incidencia? SÍ/NO'),
        '#06b6d4')
    + _infoCard('🔗 Tareas que recibes',
        'Cocina, Sala y SYNCROLAB te crean tareas de reposición. Flujo: '
      + _tag('Abierta','#ef4444')+' → <b>Iniciar</b> → '+_tag('En proceso','#3b82f6')+' → <b>Cerrar</b> con '+_req('Acción tomada')+' (qué se repuso, proveedor, fecha entrega).<br><br>'
      + 'Si proveedor falla o producto agotado → no cierres, créa GESTIÓN explicando el bloqueo y la alternativa.',
        '#06b6d4')
    + bloqueDiferencias
    + _infoCard('✅ Checklist antes de guardar',
        '☐ Entradas de proveedor registradas<br>'
      + '☐ Tareas de reposición cerradas o bloqueadas con gestión<br>'
      + '☐ Producto caducado / dañado → incidencia<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981');
  }

  // ─── ADMINISTRACIÓN / LIMPIEZA / OTROS ──────────────────────────────
  return ''
    + _infoCard('📋 '+area+' — Tu objetivo en Mi Turno',
        'Registrar tu jornada, gestiones pendientes y cualquier incidencia operativa.',
        '#a855f7')
    + _infoCard('📝 Campos obligatorios',
        '• '+_req('Fecha')+'<br>'
      + '• '+_req('Horas trabajadas')+'<br>'
      + '• '+_req('Responsable de turno')+'<br>'
      + '• '+_req('¿Gestión pendiente? SÍ/NO')+'<br>'
      + '• '+_req('¿Incidencia? SÍ/NO'),
        '#a855f7')
    + bloqueDiferencias
    + _infoCard('✅ Antes de guardar',
        '☐ Todos los campos obligatorios rellenados<br>'
      + '☐ Si necesita acción de otro dpto → tarea creada<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981');
}

// Exponer globalmente
window.renderInfoScreen = renderInfoScreen;
window.buildInfoContent = buildInfoContent;
