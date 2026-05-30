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

function _esJefe(){
  if(!currentUser) return false;
  var r = currentUser.rol || '';
  return r === 'admin' || r === 'chef' || r === 'fb' || r === 'jefe_recepcion'
      || r === 'gobernante' || r === 'jefe_departamento'
      || r === 'coord_recepcion_syncrolab' || r === 'coord_entrenadores' || r === 'coord_fisioterapeutas'
      || r === 'supervisor';
}

function _bloqueJefe(area){
  return ''
    + _infoCard('👔 Como JEFE/SUPERVISOR de '+area+' — Validación',
        '<b>¿Qué tienes que hacer además de tu turno?</b><br>'
      + 'Validar los turnos del equipo en la pantalla <b>"Validación"</b> del menú lateral.<br><br>'

      + '<b>¿Por qué tienes que validar?</b><br>'
      + '• Sin tu validación, los datos del empleado <u>no entran en los KPIs ni en el cálculo de horas/nómina</u>.<br>'
      + '• Sin validación, las incidencias no se siguen ni se cierran.<br>'
      + '• Sin validación, el CEO no tiene fotografía real del día. Vuela ciego.<br>'
      + '• Es tu firma operativa: lo que validas, lo apruebas.<br><br>'

      + '<b>¿Qué revisas en cada turno?</b><br>'
      + '• Horas trabajadas coherentes (no 12h sin causa)<br>'
      + '• Caja cuadrada (o diferencia explicada y acción tomada)<br>'
      + '• Merma registrada (Cocina) o "sin merma" marcado<br>'
      + '• Gestiones/Incidencias del turno bien descritas (no "todo OK" vacío)<br>'
      + '• Tareas inter-dpto creadas si corresponde<br><br>'

      + '<b>3 acciones posibles al validar:</b><br>'
      + '1. '+_tag('✓ Validar','#10b981')+' — todo correcto, datos entran al sistema<br>'
      + '2. '+_tag('↩ Devolver para corrección','#f59e0b')+' — falta algo, indícale qué corregir<br>'
      + '3. '+_tag('Validar con nota','#3b82f6')+' — OK pero con observación al empleado<br><br>'

      + '<b>⏰ Plazo máximo: 24h tras cierre del turno.</b><br>'
      + 'Más tiempo = empleados no cobran horas correctas = problema RRHH.<br><br>'

      + '<b>⚠ Si NO validas:</b> el turno queda en '+_tag('PENDIENTE','#ef4444')+' bloqueando el ciclo. '
      + 'Llega un punto en que el sistema te marca alerta y te avisa al CEO.',
        '#a855f7');
}

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

  var jefe = _esJefe() ? _bloqueJefe(area) : '';

  // ════════════════════════════════════════════════════════════════════
  // ─── RECEPCIÓN ──────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Recepción'){
    return ''
    + _infoCard('🏨 Recepción — ¿Para qué rellenas tu turno?',
        'Para que el hotel tenga foto real del día: <b>cuánto dinero entró</b> (caja MEWS), '
      + '<b>qué pasó con los clientes</b> (incidencias) y <b>qué queda pendiente</b> para el siguiente turno (tareas y gestiones). '
      + 'Sin tu turno cerrado, contabilidad no cuadra y el supervisor no puede validar.',
        '#10b981')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b><br>Día del turno que estás cerrando. Por defecto hoy.<br><br>'

      + '<b>'+_req('Turno')+'</b><br>Mañana / Tarde / Noche. Marca el que cubriste. Solo uno.<br><br>'

      + '<b>'+_req('Horas trabajadas')+'</b><br>Horas reales. Si hiciste horas extra → ponlas aquí.<br><br>'

      + '<b>'+_req('Responsable de turno')+'</b><br>Quién estuvo al mando del turno. Normalmente tú mismo.<br><br>'

      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>'
      + '<u>SÍ</u> si queda algo abierto que el siguiente turno tiene que continuar (ej: "Cliente 304 pide factura mañana", "Llamar a proveedor de toallas"). '
      + 'Si SÍ → describe qué es y a quién va dirigido.<br><br>'

      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>'
      + '<u>SÍ</u> si pasó algo durante tu turno (queja de cliente, problema de habitación, error de cobro). '
      + 'Si SÍ → describe qué ocurrió + qué hiciste + si avisaste al responsable.',
        '#10b981')

    + _infoCard('🏦 Caja Recepción MEWS — Cómo rellenar',
        '<b>¿Por qué se rellena?</b><br>Para verificar que el dinero <u>real</u> coincide con lo que dice <b>MEWS</b> (el sistema del hotel). '
      + 'Si hay diferencia → o falta dinero, o sobra, y hay que saber por qué.<br><br>'

      + '<b>1 · Fondo recibido del turno anterior (€)</b><br>'
      + 'El dinero en caja que te dejó el turno anterior. Cuéntalo al empezar.<br><br>'

      + '<b>2 · Bloque "SEGÚN PMS MEWS" — '+_req('obligatorios')+'</b><br>'
      + '• <b>Cash según MEWS</b> — lo que MEWS dice que cobraste en efectivo<br>'
      + '• <b>Tarjeta según MEWS</b> — lo que MEWS dice que cobraste por TPV<br>'
      + '• <b>Stripe según MEWS</b> — lo que MEWS dice que se cobró por Stripe (reservas online)<br>'
      + '<i>Estos números los sacas del informe de cierre de MEWS.</i><br><br>'

      + '<b>3 · Transferencias</b><br>'
      + '• <b>Transferencias según MEWS</b> — si hay alguna transferencia registrada<br>'
      + '• <b>Transferencias Banco</b> — confirma si entró en el banco (con fecha)<br><br>'

      + '<b>4 · Cargos Hotel</b><br>'
      + '• <b>Room Charge</b> — consumos pasados a la habitación<br>'
      + '• <b>SYNCROLAB Charge</b> — cargos del Lab a la habitación<br>'
      + '• <b>Cargo Alexander</b> — cargos directos del propietario<br><br>'

      + '<b>5 · Pensiones</b> <i>(informativo, no bloquea)</i><br>'
      + 'nº pax desayunos · nº pax comida+cena · importes €. Para control de F&B.<br><br>'

      + '<b>6 · Bloque "REAL / FÍSICO" — '+_req('obligatorios')+'</b><br>'
      + '• <b>Cash real contado</b> — cuenta los billetes y monedas REALES en caja<br>'
      + '• <b>TPV físico</b> — total que marca el datáfono al cierre<br>'
      + '• <b>Stripe real (Stripe.com)</b> — total real del panel Stripe.com<br><br>'

      + '<b>7 · Diferencias</b><br>El sistema calcula solo: Δ Cash · Δ Tarjeta · Δ Stripe · Δ Transferencia.<br>'
      + '<b>Si todo es 0,00 € → perfecto, caja cuadra.</b><br><br>'

      + '<b>⚠ Si hay diferencia → '+_req('OBLIGATORIO')+':</b><br>'
      + '• <b>Explicación</b> — por qué hay diferencia<br>'
      + '• <b>Acción tomada</b> — qué hiciste para resolverlo<br>'
      + '• <b>¿Informado al responsable? SÍ/NO</b><br><br>'

      + '<b>8 · Caja Fuerte — '+_req('obligatorio')+'</b><br>¿Retiraste dinero a caja fuerte? SÍ/NO. Si SÍ → importe.<br><br>'

      + '<b>9 · Traspaso al siguiente turno — '+_req('obligatorio')+'</b><br>'
      + 'El sistema calcula cuánto debes dejar al siguiente turno (Fondo recibido + Cash MEWS − Retiro caja fuerte). '
      + 'Cuenta el dinero que dejas e introdúcelo en "Fondo real a traspasar". Si no coincide → diferencia.',
        '#8b5cf6')

    + _infoCard('🫁 Hypoxic Room — Solo si HAY problema',
        '<b>¿Cuándo se rellena?</b> SOLO cuando la cámara hipóxica da problemas. Uso normal NO se registra.<br><br>'

      + '<b>Avisos que disparan registro:</b><br>'
      + '• Hipoxia por debajo del set point<br>'
      + '• CO₂ alto<br>'
      + '• Puerta abierta varias veces >1 min<br>'
      + '• Sensor sin datos<br>'
      + '• Cliente avisa de cualquier problema<br><br>'

      + '<b>Campo a campo:</b><br>'
      + '• '+_req('Habitación')+' (104–109 / 202–209) — qué habitación tiene el problema<br>'
      + '• '+_req('Tipo de incidencia')+' — marca todos los que apliquen<br>'
      + '• <b>CO₂ (ppm)</b> — si sabes el valor, ponlo. Si no, déjalo<br>'
      + '• <b>Altitud actual (m)</b> — la que marca la pantalla<br>'
      + '• <b>Set point (m)</b> — la altitud configurada<br>'
      + '• ☐ <b>Puerta abierta varias veces >1min</b> — marca si aplica<br>'
      + '• ☐ <b>Recepción notificada por cliente</b> — marca si el cliente avisó<br>'
      + '• <b>Anotaciones</b> — cualquier detalle útil<br><br>'

      + '<b>Estados:</b> '+_tag('Abierta','#ef4444')+' → '+_tag('En proceso','#3b82f6')+' → '+_tag('Cerrada','#10b981')+'<br>'
      + 'Al cerrar describe '+_req('Acción tomada')+' (qué hiciste para resolverlo).',
        '#06b6d4')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Fecha, turno y horas correctas<br>'
      + '☐ Responsable de turno indicado<br>'
      + '☐ Caja MEWS cuadrada (o diferencia explicada + acción + informado)<br>'
      + '☐ Caja fuerte: SÍ/NO + importe si aplica<br>'
      + '☐ Fondo real a traspasar contado<br>'
      + '☐ Hypoxic: si hubo problema → incidencia creada<br>'
      + '☐ Gestión SÍ/NO marcado<br>'
      + '☐ Incidencia SÍ/NO marcado<br>'
      + '☐ Si hay trabajo para HK / Mantenimiento → tarea creada',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── COCINA ─────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Cocina'){
    return ''
    + _infoCard('🍳 Cocina — ¿Para qué rellenas tu turno?',
        'Para registrar qué servicios cubriste, qué se perdió (merma) y qué incidencias tuviste. '
      + 'La merma es <b>clave</b>: sin ella no se controla coste real ni se cierra el inventario.',
        '#f59e0b')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b><br>Día del turno.<br><br>'
      + '<b>'+_req('Servicio')+'</b><br>Desayuno · Comida · Cena · Evento. Puedes marcar <u>VARIOS</u> si cubriste más de uno.<br><br>'
      + '<b>'+_req('Horas trabajadas')+'</b><br>Horas reales del turno.<br><br>'
      + '<b>'+_req('Responsable de turno')+'</b><br>Quién estuvo al mando.<br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Si queda algo abierto para mañana o para Economato (ej: "Pedir lubina al proveedor").<br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Algo que ocurrió en el turno (avería de equipo, error de servicio, problema con proveedor).',
        '#f59e0b')

    + _infoCard('📦 Merma — '+_req('OBLIGATORIO')+' en Cocina',
        '<b>¿Por qué?</b> Sin merma registrada, el supervisor NO puede validar. La merma es coste real que afecta el P&L de Cocina.<br><br>'

      + '<b>¿Cuándo creas una línea?</b><br>Cualquier producto perdido: rotura · caducidad · error de cocción · devolución de cliente · sobreproducción tirada.<br><br>'

      + '<b>Campos por línea:</b><br>'
      + '• <b>Producto</b> — qué se perdió<br>'
      + '• <b>Cantidad + unidad</b> (kg, ud, litros)<br>'
      + '• <b>Coste estimado (€)</b> — lo que cuesta esa cantidad<br>'
      + '• <b>Motivo</b> — por qué se perdió<br><br>'

      + '<b>¿No hubo merma?</b> Pulsa <b>"✓ Sin merma en este turno"</b>. Es obligatorio confirmarlo.<br><br>'

      + '<b>¿Genera trabajo para otro dpto?</b><br>'
      + 'Si la merma requiere acción externa (Economato debe reponer, Mantenimiento debe revisar nevera, etc.) → '
      + 'marca <b>"¿Crear tarea operativa? SÍ"</b> y rellena: dpto destinatario · prioridad · deadline.',
        '#f59e0b')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Todos los servicios cubiertos marcados<br>'
      + '☐ Merma registrada O "Sin merma" marcado<br>'
      + '☐ Si producto requiere reposición → tarea a Economato creada<br>'
      + '☐ Si fallo de equipo → tarea a Mantenimiento creada<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── SALA ───────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Sala'){
    return ''
    + _infoCard('🍽 Sala — ¿Para qué rellenas tu turno?',
        'Para registrar qué servicios cubriste, cierre de caja (POSMEWS) y cualquier incidencia con cliente. '
      + 'Caja descuadrada o queja sin gestionar = turno no validado.',
        '#3b82f6')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b><br>Día del turno.<br><br>'
      + '<b>'+_req('Servicio')+'</b><br>Desayuno · Comida · Cena · Evento · Otro. Puedes marcar <u>VARIOS</u>.<br><br>'
      + '<b>'+_req('Horas trabajadas')+'</b><br>Horas reales.<br><br>'
      + '<b>'+_req('Responsable de turno')+'</b><br>Quién estuvo al mando.<br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Algo abierto que continúa (reserva especial, evento mañana, gestión con proveedor).<br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Queja de cliente, error de servicio, problema con producto, etc.',
        '#3b82f6')

    + _infoCard('🏦 Caja Sala (POSMEWS) — Cómo rellenar',
        '<b>¿Por qué?</b> Para que el dinero contado en caja coincida con lo que <b>POSMEWS</b> (el TPV del restaurante) registró.<br><br>'

      + '<b>Bloque "SEGÚN POSMEWS" — '+_req('obligatorios')+'</b><br>'
      + '• <b>Cash POSMEWS</b> — efectivo que dice POSMEWS<br>'
      + '• <b>Tarjeta POSMEWS</b> — tarjeta que dice POSMEWS<br>'
      + '• <b>Stripe POSMEWS</b> — Stripe que dice POSMEWS<br><br>'

      + '<b>Cargos</b><br>Room Charge · SYNCROLAB · Cargo Alexander (consumos a habitación).<br><br>'

      + '<b>Pensiones</b><br>pax desayuno · pax comida/cena + importes.<br><br>'

      + '<b>Bloque "REAL" — '+_req('obligatorios')+'</b><br>'
      + '• Cash contado · TPV físico · Stripe plataforma · Propinas TPV · Propinas efectivo<br><br>'

      + '<b>⚠ Si hay diferencia → '+_req('OBLIGATORIO')+': Explicación + Acción tomada + ¿Informado al responsable?</b>',
        '#3b82f6')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Servicios marcados<br>'
      + '☐ Caja cuadrada o diferencia explicada<br>'
      + '☐ Si producto roto/falta → tarea a Economato o Cocina<br>'
      + '☐ Queja sin resolver → incidencia + responsable informado<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── MANTENIMIENTO ──────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Mantenimiento'){
    return ''
    + _infoCard('🔧 Mantenimiento — ¿Para qué rellenas tu turno?',
        'Tu valor en el sistema = <b>tareas cerradas con acción tomada clara</b>. '
      + 'Recepción, HK, Cocina y Sala te crean tareas. Tú las recibes, las trabajas, las cierras describiendo qué hiciste.',
        '#ef4444')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b> · <b>'+_req('Horas trabajadas')+'</b> · <b>'+_req('Responsable de turno')+'</b><br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Trabajo bloqueado (falta pieza, esperar proveedor, etc.).<br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Algo que detectaste mientras trabajabas (rotura grave, riesgo de seguridad, daño no previsto).',
        '#ef4444')

    + _infoCard('🔗 Tareas que recibes — Flujo obligatorio',
        '<b>Las tareas aparecen automáticamente</b> en tu pantalla Mi Turno y en "Tareas Inter-Departamento". No hace falta que nadie te avise.<br><br>'

      + '<b>Flujo de cada tarea:</b><br>'
      + '1. '+_tag('Abierta','#ef4444')+' → pulsa <b>"Iniciar"</b> cuando empiezas<br>'
      + '2. '+_tag('En proceso','#3b82f6')+' → estás trabajando en ello<br>'
      + '3. Al terminar → pulsa <b>"Cerrar"</b><br>'
      + '4. Describe '+_req('Acción tomada')+': <u>qué pieza cambiaste, qué arreglo hiciste, si requiere seguimiento</u><br>'
      + '5. '+_tag('Cerrada','#10b981')+' → supervisor verifica<br><br>'

      + '<b>⚠ Si no puedes cerrar (falta pieza, proveedor):</b><br>'
      + '<u>No cierres la tarea</u>. Créa una <b>GESTIÓN</b> de tu dpto explicando el bloqueo. La tarea queda en "En proceso" hasta que llegue la pieza.',
        '#ef4444')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Todas las tareas trabajadas hoy → estado actualizado<br>'
      + '☐ Tareas cerradas tienen "Acción tomada" descrita<br>'
      + '☐ Bloqueos por falta de pieza → gestión creada<br>'
      + '☐ Daño grave detectado → incidencia',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── HK / HOUSEKEEPING ──────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'HK' || area === 'Housekeeping' || area === 'Limpieza'){
    return ''
    + _infoCard('🧹 Housekeeping — ¿Para qué entras al sistema?',
        '<b>Tu pantalla principal es "Mi Ruta"</b> — ahí ves las habitaciones que la <b>Gobernanta</b> te asignó hoy. '
      + 'Tu trabajo: limpiarlas, pausarlas si interrumpes, finalizarlas, y avisar de desperfectos.',
        '#f97316')

    + _infoCard('📅 Mi Ruta — Cómo funciona',
        '<b>Al abrir "Mi Ruta" verás:</b><br>'
      + '• Las habitaciones asignadas para hoy<br>'
      + '• El estado de cada una<br>'
      + '• Tiempo previsto<br><br>'

      + '<b>Estados de habitación:</b><br>'
      + '• '+_tag('Pendiente','#ef4444')+' — aún no la has tocado<br>'
      + '• '+_tag('En proceso','#3b82f6')+' — la estás limpiando<br>'
      + '• '+_tag('Pausada','#f59e0b')+' — interrumpiste (cliente entró, esperar)<br>'
      + '• '+_tag('Finalizada','#10b981')+' — terminada, lista para revisión<br>'
      + '• '+_tag('Revisada','#a855f7')+' — la Gobernanta confirmó OK<br>'
      + '• '+_tag('Requiere corrección','#ef4444')+' — la Gobernanta detectó algo, vuelve a entrar<br><br>'

      + '<b>Flujo en cada habitación:</b><br>'
      + '1. Pulsa <b>"Iniciar"</b> al entrar → empieza el cronómetro<br>'
      + '2. Si interrumpes → <b>"Pausar"</b> (cliente, descanso, etc.)<br>'
      + '3. Al terminar → <b>"Finalizar"</b><br>'
      + '4. La Gobernanta revisará y la marcará como '+_tag('Revisada','#a855f7'),
        '#f97316')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b> · <b>'+_req('Horas trabajadas')+'</b> · <b>'+_req('Responsable de turno')+'</b><br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Algo que continúa mañana (habitación sin terminar, reposición pendiente, falta material).<br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Hallazgos en habitación: objeto olvidado · desperfecto · daño · cliente difícil · queja.',
        '#f97316')

    + _infoCard('🔗 Si encuentras un problema en habitación',
        '<b>Desperfecto físico</b> (mancha persistente, avería, objeto roto, grifo gotea):<br>'
      + '→ <b>Crea TAREA a Mantenimiento</b> con habitación + qué falla.<br><br>'

      + '<b>Objeto olvidado por cliente</b>:<br>'
      + '→ <b>Crea INCIDENCIA</b> con descripción del objeto + ubicación exacta. Llévalo a Recepción.<br><br>'

      + '<b>Falta material de limpieza / amenities</b>:<br>'
      + '→ <b>Crea TAREA a Economato</b> con producto + cantidad.<br><br>'

      + '<b>No puedes terminar la habitación (cliente dentro, no se va):</b><br>'
      + '→ Marca la habitación como '+_tag('Pausada','#f59e0b')+' y avisa a Recepción.',
        '#f97316')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Todas las habitaciones de tu ruta tienen estado actualizado<br>'
      + '☐ Habitaciones no terminadas → pausadas o gestión creada<br>'
      + '☐ Desperfectos → tarea a Mantenimiento<br>'
      + '☐ Objetos olvidados → incidencia<br>'
      + '☐ Material que falta → tarea a Economato<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── SYNCROLAB ──────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(/syncrolab/i.test(area)){
    return ''
    + _infoCard('🏋 SYNCROLAB — ¿Para qué rellenas tu turno?',
        'Para registrar sesiones realizadas, testing, recovery y CUALQUIER incidencia médica o de seguridad. '
      + 'En SYNCROLAB la seguridad del cliente está por encima de todo: incidencia médica = aviso inmediato al responsable.',
        '#a855f7')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b> · <b>'+_req('Horas trabajadas')+'</b> · <b>'+_req('Responsable de turno')+'</b><br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Cliente que vuelve mañana, test pendiente, programa por cerrar.<br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br><u>Cualquier</u> tema médico, mareo, sobrecarga, mala respuesta al test, problema técnico.',
        '#a855f7')

    + _infoCard('🫁 Hypoxic Room — Si detectas problema técnico',
        'Si durante la sesión la cámara da problemas (CO₂ alto · hipoxia bajo set point · puerta abierta · sensor sin datos) → '
      + 'crea incidencia en módulo Hypoxic con: '+_req('Habitación')+' · '+_req('Tipo')+' · CO₂ · Altitud · Set point · Anotaciones.<br><br>'
      + '<b>Si el cliente sufre malestar:</b> INCIDENCIA inmediata + parar sesión + informar responsable.',
        '#a855f7')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Sesiones del día registradas<br>'
      + '☐ Problemas técnicos cámara → incidencia Hypoxic<br>'
      + '☐ Incidencia médica/seguridad → marcada + informada al responsable<br>'
      + '☐ Material que falte → tarea a Economato',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── ECONOMATO ──────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Economato'){
    return ''
    + _infoCard('📦 Economato — ¿Para qué rellenas tu turno?',
        'Para registrar entradas de proveedores, cerrar tareas de reposición que te crean otros dptos, '
      + 'y avisar de productos caducados o problemas con proveedores.',
        '#06b6d4')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b> · <b>'+_req('Horas trabajadas')+'</b> · <b>'+_req('Responsable de turno')+'</b><br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Pedido por confirmar, proveedor que no responde, reposición urgente para mañana.<br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Producto caducado · dañado · cantidad incorrecta · proveedor que falla.',
        '#06b6d4')

    + _infoCard('🔗 Tareas que recibes — Flujo',
        'Cocina, Sala y SYNCROLAB te crean tareas de reposición. Flujo: '
      + _tag('Abierta','#ef4444')+' → <b>Iniciar</b> → '+_tag('En proceso','#3b82f6')+' → <b>Cerrar</b> con '+_req('Acción tomada')+' (qué se repuso, proveedor, fecha entrega).<br><br>'
      + '<b>Si proveedor falla o producto agotado:</b> no cierres la tarea, créa <b>GESTIÓN</b> explicando el bloqueo y la alternativa.',
        '#06b6d4')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Entradas de proveedor registradas<br>'
      + '☐ Tareas de reposición cerradas o bloqueadas con gestión<br>'
      + '☐ Producto caducado / dañado → incidencia<br>'
      + '☐ Gestión / Incidencia marcadas',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── ADMINISTRACIÓN / OTROS ─────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  return ''
    + _infoCard('📋 '+area+' — ¿Para qué rellenas tu turno?',
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
        '#10b981')
    + jefe;
}


// Exponer globalmente
window.renderInfoScreen = renderInfoScreen;
window.buildInfoContent = buildInfoContent;
