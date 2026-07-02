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

async function renderInfoScreen(){
  if(!currentUser){ return; }
  // Defensa: cerrar cualquier modal huérfano que pudiera estar visible
  var _orphan = document.getElementById('dash-detail-overlay');
  if(_orphan){ _orphan.style.display = 'none'; }
  // Entrenadores/Fisio comparten area='SYNCROLAB'; usar dept real para título e instrucciones
  var area = (typeof _deptCatalogo === 'function') ? (_deptCatalogo(currentUser) || currentUser.area || 'Empleado') : (currentUser.area || 'Empleado');
  var headerEl = document.getElementById('info-screen-header');
  var bodyEl   = document.getElementById('info-screen-body');
  if(headerEl){
    headerEl.innerHTML = '<div class="page-title">📋 Instrucciones · '+area+'</div>'
      + '<div class="page-sub">Cómo rellenar tu turno · Lo que aplica a ti</div>';
  }
  if(bodyEl){
    bodyEl.innerHTML = buildInfoContent(area);
    // Contenedor para el bloque FIO (se rellena async)
    var fioDiv = document.createElement('div');
    fioDiv.id = 'info-fio-section';
    bodyEl.appendChild(fioDiv);
  }
  // Bloque FIO async (catálogo viene de Supabase)
  try {
    var allFios = await getDB('fio_catalog');
    var deptKey = _matchDeptToCatalog(area);
    var fios = (allFios || []).filter(function(f){
      return f.activo !== false && f.departamento === deptKey;
    }).sort(function(a,b){
      // Orden por gravedad: L0 → L1 → L2 → L3 → L4 → L5
      var ord = {L0:0,L1:1,L2:2,L3:3,L4:4,L5:5};
      var oa = ord[a.nivel_default] || 9, ob = ord[b.nivel_default] || 9;
      if(oa !== ob) return oa - ob;
      return (a.id||'').localeCompare(b.id||'');
    });
    var fioContainer = document.getElementById('info-fio-section');
    if(fioContainer){
      fioContainer.innerHTML = _infoFIOBlock(area, deptKey, fios);
    }
  } catch(e){
    console.warn('No se pudo cargar catálogo FIO en Info:', e);
  }
}

// Match entre área del empleado y departamento del catálogo FIO
function _matchDeptToCatalog(area){
  var a = String(area||'').trim().toLowerCase();
  if(a === 'sala') return 'Sala';
  if(a === 'cocina') return 'Cocina';
  if(a === 'friegue') return 'Friegue';
  if(a === 'recepción' || a === 'recepcion' || a === 'recepción sfera' || a === 'recepcion sfera') return 'Recepción';
  if(a === 'housekeeping' || a === 'limpieza' || a === 'hk') return 'Housekeeping';
  if(a === 'mantenimiento') return 'Mantenimiento';
  if(a === 'syncrolab' || a === 'recepción syncrolab' || a === 'recepcion syncrolab') return 'SYNCROLAB';
  return '';  // sin match, no se muestra bloque
}

// Bloque visual con catálogo de FIO del departamento del empleado
function _infoFIOBlock(area, deptKey, fios){
  if(!deptKey || !fios || !fios.length){
    return ''; // si su dept no tiene catálogo, no mostramos nada
  }
  var LEVELS = {
    L0: {name:'No afecta',           color:'#9ca3af', emoji:'🟢'},
    L1: {name:'Leve',                color:'#fbbf24', emoji:'🟡'},
    L2: {name:'Parcial',             color:'#f59e0b', emoji:'🟠'},
    L3: {name:'Grave',               color:'#ef4444', emoji:'🔴'},
    L4: {name:'Total',               color:'#dc2626', emoji:'🚨'},
    L5: {name:'Bloqueo inmediato',   color:'#000000', emoji:'⚫'}
  };
  function lvlBadge(code, pts){
    var L = LEVELS[code] || LEVELS.L0;
    var ptsTxt = (code==='L5') ? 'Directo' : (pts + 'p');
    return '<span style="display:inline-block;background:'+L.color+'22;color:'+L.color+';border:1px solid '+L.color+'66;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;">'
        + L.emoji + ' ' + L.name + ' · ' + ptsTxt + '</span>';
  }

  // Cabecera + tabla
  var rows = fios.map(function(f){
    var pts = (f.nivel_default === 'L2') ? 1 : parseFloat(f.puntos_default);
    return '<tr>'
      + '<td style="font-family:var(--font-mono);font-size:10px;color:var(--text3);white-space:nowrap;">'+f.id+'</td>'
      + '<td style="font-size:12px;color:var(--text);">'+f.nombre+'</td>'
      + '<td style="text-align:center;">'+lvlBadge(f.nivel_default, pts)+'</td>'
      + '</tr>';
  }).join('');

  var html =
      '<div style="background:var(--bg);border:1px solid var(--border);border-left:4px solid #ef4444;border-radius:8px;padding:14px 16px;margin-top:14px;">'
    +   '<div style="font-weight:700;color:var(--text);font-size:14px;margin-bottom:6px;">⚖ FIO · Fallos de tu departamento que afectan al bonus</div>'
    +   '<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:10px;">'
    +     'Cada fallo registrado y validado suma puntos negativos en tu mes. '
    +     'Cuando llegas a cierto total, pierdes parte o la totalidad del incentivo.'
    +   '</div>'

    // Tabla de penalización mensual
    +   '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:12px;">'
    +     '<div style="font-size:11px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">📉 Penalización mensual</div>'
    +     '<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;">'
    +       '<span style="background:#22c55e22;color:#22c55e;padding:2px 8px;border-radius:4px;">0 pts → 0%</span>'
    +       '<span style="background:#84cc1622;color:#84cc16;padding:2px 8px;border-radius:4px;">1-2 → 5%</span>'
    +       '<span style="background:#eab30822;color:#eab308;padding:2px 8px;border-radius:4px;">3-4 → 10%</span>'
    +       '<span style="background:#f59e0b22;color:#f59e0b;padding:2px 8px;border-radius:4px;">5-7 → 25%</span>'
    +       '<span style="background:#f9731622;color:#f97316;padding:2px 8px;border-radius:4px;">8-10 → 50%</span>'
    +       '<span style="background:#ef444422;color:#ef4444;padding:2px 8px;border-radius:4px;">11-14 → 75%</span>'
    +       '<span style="background:#dc262622;color:#dc2626;padding:2px 8px;border-radius:4px;">15+ → 100%</span>'
    +     '</div>'
    +   '</div>'

    // Tabla de fallos
    +   '<div style="overflow-x:auto;">'
    +     '<table style="width:100%;font-size:12px;border-collapse:collapse;">'
    +       '<thead><tr style="border-bottom:1px solid var(--border);">'
    +         '<th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;">Cód.</th>'
    +         '<th style="text-align:left;padding:6px 8px;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;">Fallo</th>'
    +         '<th style="text-align:center;padding:6px 8px;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;">Nivel · Puntos (1ª vez)</th>'
    +       '</tr></thead>'
    +       '<tbody>'+rows+'</tbody>'
    +     '</table>'
    +   '</div>'

    // Avisos clave
    +   '<div style="margin-top:12px;padding:10px;background:var(--bg2);border-radius:6px;font-size:11px;color:var(--text2);line-height:1.6;">'
    +     '<div style="margin-bottom:4px;"><strong style="color:var(--text);">📌 Reincidencia:</strong> repetir el mismo fallo en el mes sube los puntos. En L2 la escala es <code>1 → 3 → 4.5 → 6 → L4</code>. En L1/L3 es <code>×1 → ×1.5 → ×2 → L4</code>.</div>'
    +     '<div style="margin-bottom:4px;"><strong style="color:var(--text);">📷 Evidencia:</strong> todo FIO que afecta al bonus se registra con descripción detallada (testigo, ticket, comentario, foto…). Sin evidencia no hay sanción.</div>'
    +     '<div><strong style="color:var(--text);">⚠ Disputar:</strong> si no estás de acuerdo, tienes 5 días para disputar desde la pantalla <strong>⚖ Mis FIO</strong>.</div>'
    +   '</div>'
    + '</div>';

  return html;
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
      || r === 'supervisor' || r === 'jefe';
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
    +       '<th style="text-align:left;padding:8px;border:1px solid var(--border);width:170px;">¿Quién lo resuelve?</th>'
    +     '</tr>'
    +     '<tr><td style="padding:8px;border:1px solid var(--border);vertical-align:top;">'+_tag('TAREA','#3b82f6')+'</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);vertical-align:top;">Trabajo concreto para <b>otro departamento</b> u <b>otro turno</b>. Con deadline. Ejemplo: "Mantenimiento revisar ducha 203 antes del check-in".</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);vertical-align:top;color:#3b82f6;font-weight:600;">El dpto/turno destinatario hasta cerrarla</td></tr>'
    +     '<tr><td style="padding:8px;border:1px solid var(--border);vertical-align:top;">'+_tag('INCIDENCIA','#f59e0b')+'</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);vertical-align:top;">Algo que <b>ocurrió en tu turno</b> y necesita decisión o respuesta del <b>jefe de tu departamento</b>. Ejemplo: "Cliente exige devolución total", "fallo de equipo grave".</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);vertical-align:top;color:#f59e0b;font-weight:600;">El jefe de tu dpto — tú la abres, él la cierra</td></tr>'
    +     '<tr><td style="padding:8px;border:1px solid var(--border);vertical-align:top;">'+_tag('GESTIÓN','#a855f7')+'</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);vertical-align:top;">Pendiente <b>operativo dentro de tu dpto</b>. Lo continúa otro compañero o el siguiente turno del MISMO dpto. Ejemplo: "Cliente 304 quiere factura mañana", "Repasar mise en place tarde".</td>'
    +       '<td style="padding:8px;border:1px solid var(--border);vertical-align:top;color:#a855f7;font-weight:600;">Tu equipo + siguiente turno del mismo dpto</td></tr>'
    +   '</table>'
    +   '<div style="font-size:12px;color:var(--text3);margin-top:10px;padding:10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px;line-height:1.6;">'
    +     '<b>⚠ Cómo elegir:</b><br>'
    +     '• ¿Lo soluciona <u>OTRO dpto u OTRO turno externo</u>, con plazo? → '+_tag('TAREA','#3b82f6')+'<br>'
    +     '• ¿Requiere decisión o intervención del <u>JEFE de tu dpto</u>? → '+_tag('INCIDENCIA','#f59e0b')+'<br>'
    +     '• ¿Es tema interno de tu dpto que continúa tu equipo o el siguiente turno tuyo? → '+_tag('GESTIÓN','#a855f7')+''
    +   '</div>'
    + '</div>';

  var jefe = _esJefe() ? _bloqueJefe(area) : '';

  // ════════════════════════════════════════════════════════════════════
  // ─── RECEPCIÓN ──────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Recepción'){
    return ''
    + _infoCard('🏨 ¿Para qué rellenas tu turno?',
        'SYNCRO HUB registra todo lo que pasa en tu turno: cuántos check-ins hiciste, cómo quedó la caja, si vendiste servicios SYNCROLAB y si hubo algún problema.<br><br>'
      + '<b>Si no lo registras, para el sistema no ocurrió. Y lo que no ocurrió, no cuenta a tu favor.</b><br><br>'
      + 'Tu evaluación mensual y tu bonus dependen directamente de lo que registres aquí.',
        '#8b5cf6')

    + _infoCard('📝 Paso 1 — Rellena tu turno',
        '<b>'+_req('Fecha')+'</b><br>El día del turno.<br><br>'

      + '<b>'+_req('Turno')+'</b><br>'
      + 'Mañana · Tarde · Noche. Solo uno. Una vez que hagas la caja, el sistema lo bloquea y no se puede cambiar.<br><br>'

      + '<b>'+_req('Horas trabajadas')+'</b><br>'
      + 'Las horas reales del día, no las del contrato.<br><br>'

      + '<b>'+_req('Responsable de turno')+'</b><br>'
      + 'El nombre de quien estuvo al mando.<br><br>'

      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>'
      + 'Algo de Recepción que queda abierto para el siguiente turno.<br>'
      + '<i>Ejemplos: "Cliente 304 pide factura mañana" · "Esperar respuesta de reserva de grupo" · "Confirmar llegada tardía hab. 112"</i><br>'
      + '<i>⚠ Si necesita que actúe otro departamento → crea una TAREA, no una gestión.</i><br><br>'

      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>'
      + 'Algo grave que requiere decisión de tu jefe: queja seria, error de cobro relevante, daño en habitación, descuadre importante.<br>'
      + '<i>Tú la abres. Tu jefe la resuelve y cierra.</i>',
        '#8b5cf6')

    + _infoCard('📋 Paso 2 — Preguntas de control',
        'Antes de llegar a la caja, el sistema te hace unas preguntas rápidas. Son '+_req('obligatorias')+'.<br><br>'

      + '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:10px;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em;margin-bottom:6px;">OPERACIÓN</div>'
      + '• Check-ins, check-outs y reservas gestionadas en el turno<br>'
      + '• ¿Quedan reservas pendientes? → Si SÍ, explica cuáles y qué falta'
      + '</div>'

      + '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:10px;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em;margin-bottom:6px;">DESAYUNOS / UPSELL</div>'
      + '• ¿Ofertaste desayunos a clientes sin desayuno incluido?<br>'
      + '• Si SÍ → indica a cuántos ofreciste y cuántos compraron<br>'
      + '• Si no había esa oportunidad → marca "No aplica"<br>'
      + '<b style="color:#ef4444;">⚠ Ofrecer el desayuno es obligatorio. No ofrecerlo es un FIO.</b>'
      + '</div>'

      + '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:10px;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#06b6d4;letter-spacing:.1em;margin-bottom:6px;">VENTAS SYNCROLAB</div>'
      + '• ¿Vendiste algún servicio SYNCROLAB?<br>'
      + '• Si SÍ → añade una línea por cada venta: tipo de servicio · importe · nº reserva MEWS · comentario<br>'
      + '• Tipos disponibles: Entrenamiento personal · Fisioterapia · Recuperación · Testing deportivo · Nutrición · Consulta médica · Otro'
      + '</div>'

      + '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:10px;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em;margin-bottom:6px;">BITRIX24 / COMUNICACIÓN</div>'
      + '• ¿Revisaste WhatsApp, email y llamadas pendientes en Bitrix24? → Si NO, explica por qué<br>'
      + '• ¿Queda algún lead sin cerrar? → Si SÍ: descripción · ¿registrado en Bitrix24? · responsable · fecha de seguimiento'
      + '</div>'

      + '<div style="background:var(--bg2);border-radius:6px;padding:10px;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em;margin-bottom:6px;">CLIENTES</div>'
      + '• ¿Hubo clientes insatisfechos? → Si SÍ: cuántos · ¿informaste al responsable en el momento?'
      + '</div>',
        '#8b5cf6')

    + _infoCard('🏦 Paso 3 — Caja: ¿Traspaso o Cierre?',
        '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:12px;">'
      + '<b>Tu turno determina qué haces:</b><br><br>'
      + '• Mañana / Tarde → solo '+_tag('TRASPASO','#0891b2')+' — dejas el efectivo al siguiente turno<br>'
      + '• Noche → '+_tag('CIERRE','#8b5cf6')+' de caja del día (o traspaso si aún no toca)<br>'
      + '• Si hay dos recepcionistas en el mismo turno → <b>uno hace la caja</b>, el otro pulsa "Cerrar turno sin caja"<br><br>'
      + '<i>El sistema detecta si ya existe una operación de caja para tu turno hoy. Si tu compañero ya la hizo, solo podrás cerrar el turno.</i>'
      + '</div>'

      + '<b>TRASPASO — Mañana / Tarde</b><br>'
      + '1. <b>Fondo recibido</b> → aparece solo, viene del turno anterior. Cuéntalo para verificar.<br>'
      + '2. <b>Ventas efectivo MEWS</b> '+_req('*')+' → lo que MEWS registró en efectivo en tu turno. Pon 0 si no hubo.<br>'
      + '3. <b>Cash real contado</b> '+_req('*')+' → cuenta el cajón ahora mismo.<br>'
      + '4. <b>¿Retiro a caja fuerte?</b> '+_req('*')+' → SÍ o NO. Si SÍ, indica el importe.<br>'
      + '5. <b>Fondo esperado</b> → calculado: Fondo recibido + Ventas MEWS − Retiro.<br>'
      + '6. <b>Fondo real a traspasar</b> '+_req('*')+' → el dinero que dejas. Debe coincidir con el esperado.<br>'
      + '<i>Si no cuadra → el sistema te pide explicación y acción tomada. Obligatorio antes de guardar.</i><br><br>'

      + '<b>CIERRE — Noche</b><br>'
      + 'Cuadras todo el día. El fondo recibido aparece automáticamente.<br><br>'
      + '<u>Lo que traes de MEWS</u> (filtra por tu franja horaria, no el total del día):<br>'
      + 'Cash · Tarjeta · Stripe · Transferencias según MEWS<br><br>'
      + '<u>Cargos del hotel:</u><br>'
      + '• Room Charge → consumos cargados a habitación<br>'
      + '• SYNCROLAB Charge → servicios SYNCROLAB cargados a habitación<br>'
      + '• Cargo Alexander → consumos del propietario<br>'
      + '• Pensiones → solo informativo, no afecta el cuadre<br><br>'
      + '<u>Lo que cuentas físicamente:</u><br>'
      + 'Cash real · TPV físico · Stripe (Stripe.com) · Transferencias banco (con fecha)<br><br>'
      + 'El sistema calcula en tiempo real: Δ Cash · Δ Tarjeta · Δ Stripe · Δ Transferencia<br>'
      + '🟢 Verde = cuadrado · 🔴 Rojo = diferencia<br><br>'
      + '<b>Si hay diferencia → obligatorio:</b> '+_req('Explicación')+' · '+_req('Acción tomada')+' · '+_req('¿Informado al responsable?')+'<br><br>'
      + '<b>Caja fuerte</b> '+_req('*')+' → SÍ o NO. Si SÍ, indica el importe retirado.',
        '#8b5cf6')

    + _infoCard('🫁 Hypoxic Room — Solo si hay problema',
        '<b>No registres el uso normal de la cámara.</b> Solo cuando algo falla o el cliente avisa.<br><br>'

      + '<b>Cuándo crear una incidencia Hypoxic:</b><br>'
      + '• Hipoxia por debajo del set point · CO₂ alto · Puerta abierta repetidamente<br>'
      + '• Sensor sin datos · Cliente avisa de cualquier problema<br><br>'

      + '<b>Campos:</b><br>'
      + '• '+_req('Habitación')+' — hab. 104–109 o 202–209<br>'
      + '• '+_req('Tipo de incidencia')+' — marca los que apliquen<br>'
      + '• CO₂ (ppm) · Altitud actual (m) · Set point (m) — si los sabes, ponlos<br>'
      + '• ☐ Puerta abierta varias veces · ☐ Recepción notificada por cliente<br>'
      + '• Anotaciones — cualquier detalle útil<br><br>'

      + 'Estados: '+_tag('Abierta','#ef4444')+' → '+_tag('En proceso','#3b82f6')+' → '+_tag('Cerrada','#10b981')+'<br>'
      + 'Al cerrar: describe '+_req('Acción tomada')+' — qué hiciste exactamente.',
        '#06b6d4')

    + bloqueDiferencias

    + _infoCard('🚨 Tu registro = tu evaluación = tu bonus',
        '<b>El sistema mide automáticamente cada turno:</b><br>'
      + '• Caja cuadrada (Δ Cash · Δ Tarjeta · Δ Stripe · Δ Transferencia = 0)<br>'
      + '• Diferencias explicadas + acción tomada + responsable informado<br>'
      + '• Caja fuerte registrada (SÍ/NO + importe)<br>'
      + '• Fondo real a traspasar contado y confirmado<br>'
      + '• Upsell de desayunos registrado (ofreciste / vendiste)<br>'
      + '• Incidencias reportadas en el momento, no a posteriori<br>'
      + '• Leads de Bitrix24 gestionados dentro del turno<br><br>'

      + '<b>Lo que penaliza:</b><br>'
      + '• Caja descuadrada sin justificar<br>'
      + '• Diferencia ocultada o redondeada para que cuadre → penalización doble<br>'
      + '• No ofrecer desayuno a clientes sin pensión<br>'
      + '• Aviso Hypoxic sin incidencia creada<br>'
      + '• Queja detectada por supervisor que tú no reportaste → penalización doble<br>'
      + '• Caja fuerte no registrada · Lead no registrado en Bitrix24<br><br>'

      + '<b>Lo que premia:</b><br>'
      + '• Cierres cuadrados de forma sostenida<br>'
      + '• Comunicación proactiva al responsable en el momento<br>'
      + '• Incidencias bien documentadas con seguimiento<br><br>'

      + '<b>Registrar = transparencia = confianza = incentivo.<br>No registrar = penalización.</b>',
        '#ef4444')

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Turno, fecha y horas correctos<br>'
      + '☐ Preguntas de control completadas (check-ins, upsell, Bitrix24, clientes)<br>'
      + '☐ Ventas SYNCROLAB añadidas si hubo<br>'
      + '☐ Lead pendiente en Bitrix24 registrado si aplica<br>'
      + '☐ Caja cuadrada, o diferencia explicada con acción tomada<br>'
      + '☐ Caja fuerte: SÍ/NO respondido con importe si aplica<br>'
      + '☐ Fondo real a traspasar contado y confirmado<br>'
      + '☐ Hypoxic: incidencia creada si hubo problema<br>'
      + '☐ Gestión marcada si queda algo para el siguiente turno<br>'
      + '☐ Incidencia marcada si hubo algo grave<br>'
      + '☐ Tarea creada si HK o Mantenimiento tiene que actuar',
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
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Algo del propio dpto de Cocina que continúa otro compañero o el siguiente turno tuyo. Ej: "Repasar mise en place de cena", "Marinar lubina para mañana". <i>Si pide acción de Economato/Mantenimiento → TAREA, no gestión.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Algo del turno que requiere <b>decisión del jefe de Cocina</b>: avería grave de equipo, contaminación detectada, fallo importante de proveedor, error de servicio que escala. Tú la abres, <b>el jefe la cierra</b>.',
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

    + _infoCard('🖨 Regla operativa de Cocina — NO se toca comida sin orden por impresora',
        '<b>Norma:</b> Ningún plato, ingrediente o preparación sale de cocina sin <u>orden impresa por la impresora del POS</u>.<br><br>'

      + '<b>Esto incluye:</b><br>'
      + '• Pedidos de cliente (sala, eventos, room service)<br>'
      + '• <b>Comida del personal</b> — también requiere ticket impreso<br>'
      + '• Cortesías e invitaciones — autorizadas por F&B y registradas como ajuste en Sala<br>'
      + '• Pruebas de menú, catas, fotografías — con ticket de motivo<br><br>'

      + '<b>¿Por qué?</b><br>'
      + '• Sin ticket no hay rastro = no se puede medir merma real<br>'
      + '• Sin ticket no se sabe si fue comida, regalo o pérdida<br>'
      + '• Sin ticket el inventario nunca cuadra<br><br>'

      + '<b>Si llega petición verbal sin ticket:</b> NO se prepara. Pide ticket o autorización formal (responsable o F&B) antes de tocar producto.',
        '#dc2626')

    + bloqueDiferencias

    + _infoCard('🚨 Evaluación objetiva — Tu desempeño se mide',
        '<b>Objetivo principal de Cocina: bajar la merma del 38% actual.</b><br>'
      + 'Cada turno que cierras genera datos. Esos datos suman tu evaluación mensual y afectan tus <u>incentivos económicos</u>.<br><br>'

      + '<b>Qué mide el sistema automáticamente:</b><br>'
      + '• % merma del turno (coste merma / coste total preparado)<br>'
      + '• Líneas de merma registradas vs producto realmente tirado<br>'
      + '• Salidas de cocina con ticket vs sin ticket (incluida comida personal)<br>'
      + '• Confirmación de "Sin merma" cuando aplica<br>'
      + '• Incidencias técnicas reportadas (averías, fallos de frío)<br><br>'

      + '<b>Qué penaliza:</b><br>'
      + '• Merma superior al 38% sin causa justificada → penalización<br>'
      + '• Producto salido sin ticket (incluido staff meal sin ticket) → penalización<br>'
      + '• Merma detectada por inventario sin que tú la registraras → penalización doble<br>'
      + '• Turno cerrado sin merma ni "Sin merma" confirmado → bloqueo + penalización<br>'
      + '• Avería de equipo no reportada que genera pérdida posterior → penalización<br><br>'

      + '<b>Qué premia:</b><br>'
      + '• Merma por debajo del 38% con tendencia descendente sostenida<br>'
      + '• 100% de salidas con ticket de impresora<br>'
      + '• Mermas registradas con motivo claro (no "se cayó")<br>'
      + '• Avisos preventivos: nevera marca temperatura rara, producto al límite, etc.<br><br>'

      + '<b>La regla es simple: registrar = transparencia = confianza = incentivo. '
      + 'No registrar = opacidad = riesgo = penalización.</b>',
        '#ef4444')

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Todos los servicios cubiertos marcados<br>'
      + '☐ Merma registrada O "Sin merma" marcado<br>'
      + '☐ Toda salida de cocina del turno tuvo ticket impreso (incluido staff)<br>'
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
    + _infoCard('🍽 ¿Para qué rellenas tu turno?',
        'SYNCRO HUB registra todo lo que pasa en tu servicio: qué hiciste, cómo quedó la caja, si hubo algún problema.<br><br>'
      + '<b>Si no lo registras, para el sistema no ocurrió. Y lo que no ocurrió, no cuenta a tu favor.</b><br><br>'
      + 'Tu bonus mensual depende directamente de lo que registres aquí.',
        '#3b82f6')

    + _infoCard('📝 Paso 1 — Rellena tu turno',
        '<b>'+_req('Fecha')+'</b><br>El día del turno que estás cerrando.<br><br>'

      + '<b>'+_req('Servicios')+'</b><br>'
      + 'Marca todos los que hiciste: Desayuno · Comida · Cena · Evento · Otro. Puedes marcar varios.<br><br>'

      + '<b>'+_req('Horas trabajadas')+'</b><br>'
      + 'Las horas reales del día. No las del contrato — las que realmente estuviste.<br><br>'

      + '<b>'+_req('Responsable de turno')+'</b><br>'
      + 'El nombre de quien estuvo al mando del servicio.<br><br>'

      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>'
      + 'Algo de Sala que queda abierto para el siguiente turno de tu equipo.<br>'
      + '<i>Ejemplos: "Confirmar menú especial para la cena de mañana" · "Cliente mesa 5 quiere factura mañana"</i><br>'
      + '<i>⚠ Si necesita que actúe otro departamento (Cocina, Mantenimiento…) → crea una TAREA, no una gestión.</i><br><br>'

      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>'
      + 'Algo grave que requiere decisión de tu jefe: queja seria, conflicto con cliente, error de cobro relevante, daño material.<br>'
      + '<i>Tú la abres. Tu jefe la resuelve y cierra.</i>',
        '#3b82f6')

    + _infoCard('⚡ Paso 2 — Confirma los ajustes',
        'Al guardar el turno, el sistema te pregunta: <b>"¿Hubo ajustes en este turno?"</b><br>'
      + 'Esto es '+_req('obligatorio')+'. No puedes saltártelo.<br><br>'

      + '<b>¿Qué es un ajuste?</b><br>'
      + 'Cualquier operación que cambia una venta ya registrada en POSMEWS:<br>'
      + '• Anulaste un ticket · Devolviste dinero · Hiciste una invitación (cortesía)<br>'
      + '• Corregiste un cobro incorrecto · Hubo un error de TPV<br><br>'

      + '→ <b>Si NO hubo ajustes:</b> pulsa <b>"✓ No hubo ajustes"</b>. Listo.<br>'
      + '→ <b>Si SÍ hubo:</b> pulsa <b>"⚡ Sí hubo ajustes"</b> y añade una línea por cada tipo:<br><br>'

      + '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-top:4px;font-size:12px;">'
      + '• <b>Tipo</b> — Anulación · Devolución · Invitación · Error TPV · Error cobro · Cargo incorrecto · Otro<br>'
      + '• <b>Nº de veces</b> que ocurrió ese tipo (mínimo 1)<br>'
      + '• <b>Importe (€)</b> — cuánto suma<br>'
      + '• <b>¿Avisaste al responsable en el momento?</b> SÍ o NO<br>'
      + '• <b>Motivo</b> — breve explicación. Ej: "Cliente devolvió plato frío" · "Invitación autorizada por F&B"'
      + '</div><br>'

      + '<b>¿Por qué importa tanto?</b><br>'
      + 'Sin este registro la caja aparece descuadrada aunque no lo esté. Si el faltante se detecta después y tú no lo registraste → <b>penalización doble</b>.',
        '#3b82f6')

    + _infoCard('🏦 Paso 3 — Caja: ¿Traspaso o Cierre?',
        '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:12px;">'
      + '<b>Tu servicio determina qué haces:</b><br><br>'
      + '• Desayuno / Comida / Otro → solo '+_tag('TRASPASO','#0891b2')+' — dejas el efectivo al siguiente servicio<br>'
      + '• Cena / Evento → '+_tag('CIERRE','#3b82f6')+' de caja del día (o traspaso si aún no toca)<br>'
      + '• Varios camareros en el mismo servicio → <b>uno hace la caja</b>, el resto pulsa "Cerrar turno sin caja"'
      + '</div>'

      + '<b>TRASPASO</b> — Solo efectivo. Sin tarjeta, sin Stripe, sin retiro a caja fuerte.<br>'
      + '1. <b>Fondo recibido</b> → aparece solo. Cuéntalo para verificar.<br>'
      + '2. <b>Ventas efectivo POSMEWS</b> → lo que POSMEWS registró. Pon 0 si no hubo.<br>'
      + '3. <b>Cash real contado</b> → cuenta el cajón ahora mismo.<br>'
      + '4. <b>Fondo esperado</b> → el sistema lo calcula solo (fondo recibido + ventas POSMEWS).<br>'
      + '5. <b>Fondo real a traspasar</b> '+_req('*')+' → el dinero que dejas físicamente. Debe coincidir con el esperado.<br>'
      + '<i>Si no cuadra → el sistema te pide explicación. Es obligatorio darla.</i><br><br>'

      + '<b>CIERRE</b> — Cuadras todo el día. El fondo recibido aparece automáticamente.<br><br>'
      + '<u>Lo que traes de POSMEWS:</u> Cash · Tarjeta · Stripe<br>'
      + '<u>Lo que cuentas físicamente:</u> Billetes y monedas · Ticket del TPV · Confirmación Stripe · Propinas<br>'
      + '<u>Cargos internos:</u> Room Charge · SYNCROLAB Charge · Cargo Alexander<br>'
      + '<u>Pensiones:</u> solo informativo, no afecta al cuadre<br><br>'

      + 'El sistema calcula la diferencia en tiempo real. Si hay diferencia el sistema te pide:<br>'
      + _req('Explicación')+'  '+_req('Acción tomada')+'  '+_req('¿Informado al responsable?')+'<br><br>'

      + '<b>Retiro a caja fuerte</b> → solo en el cierre. Indica el importe que retiras.',
        '#0891b2')

    + bloqueDiferencias

    + _infoCard('🚨 Tu registro = tu evaluación = tu bonus',
        '<b>El sistema mide automáticamente cada turno:</b><br>'
      + '• ¿Confirmaste los ajustes (SÍ o NO)?<br>'
      + '• ¿Tu caja cuadró o explicaste la diferencia?<br>'
      + '• ¿Reportaste las incidencias que hubo?<br>'
      + '• ¿Comunicaste los ajustes al responsable en el momento?<br><br>'

      + '<b>Lo que penaliza:</b><br>'
      + '• Turno cerrado sin confirmar ajustes<br>'
      + '• Caja descuadrada sin justificar<br>'
      + '• Ajuste detectado después que tú no registraste → penalización doble<br>'
      + '• Incidencia que detectó el supervisor o el cliente, y tú no reportaste<br><br>'

      + '<b>Lo que premia:</b><br>'
      + '• Registro completo y caja cuadrada<br>'
      + '• Ajustes comunicados en el momento, no al cierre<br>'
      + '• Incidencias documentadas con acción tomada<br><br>'

      + '<b>Registrar = transparencia = confianza = incentivo.<br>No registrar = opacidad = penalización.</b>',
        '#ef4444')

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Servicios marcados correctamente<br>'
      + '☐ Ajustes confirmados — SÍ con todas las líneas, o NO explícito<br>'
      + '☐ Cada ajuste tiene: tipo, importe, motivo y si fue comunicado al responsable<br>'
      + '☐ Caja cuadrada, o diferencia explicada con acción tomada<br>'
      + '☐ Si hubo producto roto o falta de género → Tarea a Economato o Cocina<br>'
      + '☐ Si hubo queja sin resolver → Incidencia abierta, responsable informado<br>'
      + '☐ Gestión marcada si queda algo pendiente para el siguiente turno',
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
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Trabajo del propio dpto que continúa tu compañero o siguiente turno. Ej: "Terminar pintura sala mañana", "Comprobar boiler tras nueva pieza". <i>Si esperas pieza del proveedor → eso también es gestión interna.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Algo grave detectado que requiere <b>decisión del jefe de Mantenimiento</b>: riesgo de seguridad, daño estructural, fallo crítico de instalación, accidente. Tú la abres, <b>el jefe la cierra</b>.',
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
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Algo del propio dpto de HK que continúa tu compañera o el siguiente turno tuyo. Ej: "Habitación 204 sin terminar — falta dosaje toallas", "Repasar VIP 305 antes de check-in". <i>Si pide Mantenimiento o Economato → TAREA, no gestión.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Algo que requiere <b>decisión de la Gobernanta</b>: cliente difícil, queja seria, robo, daño relevante encontrado, conflicto con cliente, hallazgo sospechoso. Tú la abres, <b>la Gobernanta la cierra</b>.',
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
  // ─── ENTRENADORES (subrol SYNCROLAB · sin caja · con KPI) ────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Entrenadores'){
    return ''
    + _infoCard('🏋 ¿Para qué rellenas tu turno?',
        'SYNCRO HUB registra lo que pasa en tu turno: tu actividad del día (clases, entrenamientos, valoraciones), las gestiones que dejas pendientes y cualquier incidencia con un cliente.<br><br>'
      + '<b>La seguridad del cliente es lo primero.</b> Cualquier lesión, mareo o malestar se registra en el momento — no al final del turno.<br><br>'
      + '<b>Tú no gestionas caja.</b> Tu turno se cierra con el cuestionario de KPI, no con un cierre de caja.<br><br>'
      + '<b style="color:#ef4444;">Si no está en el sistema, no existe.</b> Una sesión sin registrar no genera incentivo. Una incidencia sin documentar no tiene seguimiento.',
        '#10b981')

    + _infoCard('📝 Paso 1 — Rellena tu turno',
        '<b>'+_req('Fecha')+'</b><br>El día del turno.<br><br>'
      + '<b>'+_req('Turno')+'</b><br>'
      + 'Mañana · Tarde · Sábado. Solo uno.<br><br>'
      + '<b>'+_req('Horas trabajadas')+'</b><br>'
      + 'Las horas reales del día, no las del contrato.<br><br>'
      + '<b>'+_req('Responsable de turno')+'</b><br>'
      + 'El nombre de quien estuvo al mando.<br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>'
      + 'Algo que queda para el siguiente turno o para un compañero.<br>'
      + '<i>Ejemplos: "Atender cliente — Juan Pérez vuelve mañana para 2ª valoración" · "Arreglar área — Queenax con anclaje suelto"</i><br>'
      + '<i>⚠ Si necesita Mantenimiento o Recepción → TAREA, no gestión.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>'
      + 'Lesión, mareo, mala respuesta de cliente, conflicto, fallo grave de material.<br>'
      + '<b style="color:#ef4444;">Si hay malestar físico: para la sesión + abre incidencia + avisa a la coordinadora. Ella la cierra.</b>',
        '#10b981')

    + _infoCard('📊 Paso 2 — Cuestionario de actividad (KPI)',
        'Al cerrar el turno, registras tu actividad del día. '+_req('Todos obligatorios')+'  — pon 0 si no hubo.<br><br>'
      + '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:8px;">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#10b981;letter-spacing:.1em;margin-bottom:6px;">ACTIVIDAD DEL TURNO</div>'
      + '• <b>Clases dirigidas efectivas</b> — 4 o más personas presentes<br>'
      + '• <b>Clases dirigidas NO efectivas</b> — menos de 4 personas (igual cuenta como trabajo)<br>'
      + '• <b>PT individual</b> — 1 cliente · 1 hora<br>'
      + '• <b>PT DÚO</b> — 2 clientes a la vez · 1,5 h efectivas<br>'
      + '• <b>PT 30 min</b> — sesión de media hora · 0,5 h efectivas<br>'
      + '• <b>Valoración funcional</b> — solo si hubo cliente real (crédito ≥ 1 en VirtuGym)<br>'
      + '• <b>Visbody</b> — solo si hubo cliente real<br>'
      + '• <b>Bañera de hielo</b> — solo si hubo cliente real'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text3);padding:10px;background:var(--bg2);border-left:3px solid #10b981;border-radius:0 4px 4px 0;line-height:1.6;">'
      + '<b>ℹ Autocontrol.</b> Tu incentivo se calcula con los datos oficiales de VirtuGym que sube la coordinadora. '
      + 'En <b>Mi Rendimiento</b> verás si lo que registraste aquí cuadra con VirtuGym, KPI por KPI.'
      + '</div>',
        '#10b981')

    + _infoCard('⚡ Sistema de penalización — FIO',
        'Los fallos operativos se registran con código y nivel. Se descuentan de tu incentivo mensual.<br><br>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">'
      + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border-left:3px solid #ef4444;"><div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#ef4444;margin-bottom:4px;">A · CLIENTE</div><div style="font-size:11px;color:var(--text2);">A01 Actitud · A02 Abandona sesión · A03 No respeta programa · A04 No contacta cliente ausente · A05 Checklist valoración · A06 Sin uniforme</div></div>'
      + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border-left:3px solid #f59e0b;"><div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#f59e0b;margin-bottom:4px;">B · OPERATIVO</div><div style="font-size:11px;color:var(--text2);">B01 Tardanza · B02 Abandona turno · B03 Descanso excesivo · B04 Fichaje fuera · B05-06 Checklist · B07-09 VirtuGym · B10-11 Bitrix · B12-15 Sala</div></div>'
      + '<div style="background:var(--bg2);padding:8px 10px;border-radius:6px;border-left:3px solid #8b5cf6;grid-column:1/-1;"><div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#a78bfa;margin-bottom:4px;">C · CONVIVENCIA</div><div style="font-size:11px;color:var(--text2);">C01 Falta de respeto al superior · C02 No avisa ausencia · C03 Escala a Dirección sin pasar por coordinación</div></div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text2);line-height:1.7;padding:8px 10px;background:var(--bg2);border-radius:6px;">'
      + '<b style="color:var(--text);">Penalización por puntos/mes:</b> 0p=0% · 1-2p=−5% · 3-4p=−10% · 5-7p=−25% · 8-10p=−50% · 11-14p=−75% · ≥15p=−100%<br>'
      + '<b style="color:var(--text);">Tienes derecho a disputar</b> cualquier FIO que consideres injusto. Hazlo desde Mis FIO antes del cierre del mes.'
      + '</div>',
        '#ef4444')

    + _infoCard('🫁 Hypoxic Room — Solo si hay problema',
        '<b>No registres el uso normal de las cámaras.</b> Solo cuando algo falla.<br><br>'
      + 'Habitaciones: 104–109 · 202–209<br><br>'
      + '<b>Cuándo crear una incidencia:</b><br>'
      + '• Hipoxia bajo set point · CO₂ alto · Puerta abierta repetidamente · Sensor sin datos<br>'
      + '• El cliente avisa de cualquier sensación anormal<br><br>'
      + 'Estados: '+_tag('Abierta','#ef4444')+' → '+_tag('En proceso','#3b82f6')+' → '+_tag('Cerrada','#10b981')+'<br>'
      + 'Al cerrar: describe exactamente '+_req('qué hiciste')+'.',
        '#06b6d4')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Fecha, turno y horas correctos<br>'
      + '☐ Gestión marcada si queda algo pendiente para el siguiente turno<br>'
      + '☐ Incidencia marcada si hubo algo con un cliente<br>'
      + '☐ Los 8 KPIs rellenados (0 si no hubo — incluido valoraciones/bañera sin reserva)<br>'
      + '☐ Incidencia Hypoxic creada si hubo problema técnico en cámara<br>'
      + '☐ Si falta material o hay que arreglar un área → gestión o tarea según corresponda',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── SYNCROLAB ──────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(/syncrolab/i.test(area)){
    return ''
    + _infoCard('🏋 ¿Para qué rellenas tu turno?',
        'SYNCRO HUB registra lo que pasa en tu turno: las dos cajas, los cargos a habitación y cualquier incidencia.<br><br>'
      + '<b>La seguridad del cliente es lo primero.</b> Cualquier problema médico o técnico se registra en el momento — no al final del turno.<br><br>'
      + 'Tienes dos sistemas y dos cajas físicas que gestionas a la vez:<br>'
      + '<span style="color:#6366f1;font-weight:700;">🩺 Nubimed / Clínica</span> — fisioterapia, medicina deportiva, recovery clínico<br>'
      + '<span style="color:#10b981;font-weight:700;">🏋 VirtuGym / Fitness</span> — entrenamiento personal, fitness, sesiones deportivas',
        '#a855f7')

    + _infoCard('📝 Paso 1 — Rellena tu turno',
        '<b>'+_req('Fecha')+'</b><br>El día del turno.<br><br>'

      + '<b>'+_req('Turno')+'</b><br>'
      + 'Mañana o Tarde. Solo uno. Una vez que hagas la caja queda bloqueado.<br><br>'

      + '<b>'+_req('Horas trabajadas')+'</b><br>'
      + 'Las horas reales del día, no las del contrato.<br><br>'

      + '<b>'+_req('Responsable de turno')+'</b><br>'
      + 'El nombre de quien estuvo al mando.<br><br>'

      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>'
      + 'Algo de SYNCROLAB que queda para el siguiente turno.<br>'
      + '<i>Ejemplos: "Cliente vuelve mañana para 2ª sesión" · "Cerrar informe del test de hoy" · "Revisar programa de recovery del 302"</i><br>'
      + '<i>⚠ Si necesita Economato o Mantenimiento → TAREA, no gestión.</i><br><br>'

      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>'
      + 'Cualquier problema que requiere decisión del coordinador: mareo, sobrecarga, mala respuesta al test, malestar médico, problema técnico grave.<br>'
      + '<b style="color:#ef4444;">Si hay malestar físico: para la sesión + abre incidencia + avisa al coordinador. Él la cierra.</b>',
        '#a855f7')

    + _infoCard('💰 Paso 2 — Caja: ¿Traspaso o Cierre?',
        '<div style="background:var(--bg2);border-radius:6px;padding:10px;margin-bottom:12px;">'
      + '<b>El turno y el día determinan qué haces:</b><br><br>'
      + '• Mañana (lun–sáb) → solo '+_tag('TRASPASO','#0891b2')+' — dejas el efectivo al turno de Tarde<br>'
      + '• Tarde (lun–sáb) → '+_tag('TRASPASO','#0891b2')+' o '+_tag('CIERRE','#a855f7')+' — el Tarde cierra el día<br>'
      + '• Cualquier turno en domingo → '+_tag('CIERRE','#a855f7')+' — hay un solo turno<br>'
      + '• Si hay dos personas en el mismo turno → una hace la caja, la otra pulsa "Cerrar turno sin caja"'
      + '</div>'

      + '<b>TRASPASO — Mañana</b> (solo efectivo, sin retiro)<br>'
      + 'Haces lo mismo para las dos cajas:<br>'
      + '1. <b>Fondo recibido</b> → aparece solo, viene del turno anterior. Cuéntalo.<br>'
      + '2. <b>Ventas efectivo</b> '+_req('*')+' → lo que el sistema registró. Pon 0 si no hubo.<br>'
      + '3. <b>Efectivo real a traspasar</b> '+_req('*')+' → cuenta la caja física ahora.<br>'
      + '4. <b>Esperado</b> → calculado: Fondo + Ventas. Debe coincidir con el real.<br>'
      + '<i>Si no cuadra → explicación obligatoria.</i><br><br>'

      + '<b>CIERRE — Tarde o domingo</b><br>'
      + 'Para cada sistema introduces según sistema y real contado:<br>'
      + '• Efectivo · Tarjeta/TPV · Stripe · Transferencia<br>'
      + 'El sistema calcula la diferencia solo. Si hay diferencia → explicación obligatoria.',
        '#a855f7')

    + _infoCard('🏨 Cargos a habitación MEWS',
        'Si un cliente paga un servicio SYNCROLAB <b>cargándolo a su habitación</b> (no en efectivo), añade una línea aquí.<br><br>'
      + 'Campos por línea:<br>'
      + '• <b>Sistema</b> — Nubimed o VirtuGym<br>'
      + '• <b>Habitación</b> — número del huésped<br>'
      + '• <b>Huésped</b> — nombre del cliente<br>'
      + '• <b>Concepto</b> — qué servicio fue (ej: "Fisioterapia 60min")<br>'
      + '• <b>Importe (€)</b><br><br>'
      + '<b style="color:#f59e0b;">⚠ Esto no es efectivo de tu caja.</b> Es un cobro que Recepción confirma y carga en MEWS. Si no lo registras, Recepción no sabe que tiene que cargarlo y el servicio se pierde.',
        '#f59e0b')

    + _infoCard('🫁 Hypoxic Room — Solo si hay problema',
        '<b>No registres el uso normal de las cámaras.</b> Solo cuando algo falla.<br><br>'
      + 'Habitaciones: 104–109 · 202–209<br><br>'
      + '<b>Cuándo crear una incidencia:</b><br>'
      + '• Hipoxia bajo set point · CO₂ alto · Puerta abierta repetidamente · Sensor sin datos<br>'
      + '• El cliente avisa de cualquier sensación anormal<br><br>'
      + '<b>Campos:</b> '+_req('Habitación')+' · '+_req('Tipo')+' · CO₂ · Altitud · Set point · ☐ Cliente notificó · Anotaciones<br><br>'
      + 'Estados: '+_tag('Abierta','#ef4444')+' → '+_tag('En proceso','#3b82f6')+' → '+_tag('Cerrada','#10b981')+'<br>'
      + 'Al cerrar: describe exactamente '+_req('qué hiciste')+'.<br><br>'
      + '<b style="color:#ef4444;">Si el cliente tiene malestar físico: para la sesión + incidencia + coordin. inmediatamente.</b>',
        '#06b6d4')

    + bloqueDiferencias

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Turno, fecha y horas correctos<br>'
      + '☐ Gestión marcada si queda algo pendiente<br>'
      + '☐ Incidencia marcada si hubo algo con un cliente<br>'
      + '☐ Caja Nubimed cuadrada o diferencia explicada<br>'
      + '☐ Caja VirtuGym cuadrada o diferencia explicada<br>'
      + '☐ Cargos a habitación añadidos si algún cliente pagó contra habitación<br>'
      + '☐ Incidencia Hypoxic creada si hubo problema técnico en cámara<br>'
      + '☐ Si falta material → tarea a Economato',
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
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Algo del propio dpto de Economato. Ej: "Pedido por confirmar al proveedor", "Reposición urgente para mañana", "Esperar entrega del lunes". <i>Si tienes que avisar a Cocina/Sala → TAREA, no gestión.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Algo que requiere <b>decisión del jefe</b>: producto caducado en masa, mercancía dañada, cantidad muy inferior a la pedida, proveedor que falla sistemáticamente. Tú la abres, <b>el jefe la cierra</b>.',
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
  // ─── ADMINISTRACIÓN ──────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════
  if(area === 'Administración'){
    return ''
    + _infoCard('📋 Administración / RRHH — ¿Para qué rellenas tu turno?',
        'Para que la dirección tenga trazabilidad real de la jornada administrativa: '
      + '<b>qué gestiones quedan abiertas</b> (nóminas, contratos, proveedores, fichajes), '
      + '<b>qué incidencias ocurrieron</b> (disciplinarias, laborales, de sistema) '
      + 'y <b>qué tareas se delegan</b> a otros departamentos. '
      + 'Sin registro no hay control — sin control no hay empresa.',
        '#a855f7')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b><br>Día de la jornada que estás cerrando. Por defecto hoy.<br><br>'
      + '<b>'+_req('Turno')+'</b><br>Mañana (hasta ~14:00) o Tarde (14:00+). Solo uno por registro.<br><br>'
      + '<b>'+_req('Horas trabajadas')+'</b><br>Horas reales de la jornada.<br><br>'
      + '<b>'+_req('Responsable de turno')+'</b><br>Quién cubrió la jornada. Normalmente tú mismo.<br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>'
      + '<u>SÍ</u> si queda algo abierto que debe continuar en la próxima jornada administrativa. '
      + 'Ej: "Contrato de Nombre pendiente de firma", "Factura proveedor X por confirmar", "Fichaje de Nombre por revisar". '
      + '<i>Si la acción la debe tomar otro dpto → crea TAREA, no gestión.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>'
      + '<u>SÍ</u> si ocurrió algo que requiere <b>decisión de dirección</b>. '
      + 'Ej: ausencia no justificada, conflicto interno, error de nómina, acceso no autorizado a sistema. '
      + 'Tú la abres con descripción + acción tomada. <b>La cierra el director.</b>',
        '#a855f7')

    + bloqueDiferencias

    + _infoCard('📌 Tipos de gestión más frecuentes en Administración',
        '• Documentación / contrato pendiente<br>'
      + '• Factura / pago pendiente<br>'
      + '• Nómina / variable pendiente<br>'
      + '• Gestión con proveedor pendiente<br>'
      + '• Alta / baja / gestión RRSS pendiente<br>'
      + '• Incidencia de fichaje<br>'
      + '• Seguimiento de incidencia disciplinaria',
        '#a855f7')

    + _infoCard('⚠ Tipos de incidencia más frecuentes en Administración',
        '• Ausencia no justificada / fichaje incorrecto<br>'
      + '• Incidencia disciplinaria / conflicto interno<br>'
      + '• Error de datos de empleado<br>'
      + '• Nómina / variable incorrecta<br>'
      + '• Acceso a sistema pendiente / error<br>'
      + '• Factura / pago con problema<br>'
      + '• Proveedor que incumple',
        '#f59e0b')

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Turno (Mañana/Tarde) seleccionado<br>'
      + '☐ Horas y responsable correctos<br>'
      + '☐ Gestión SÍ/NO marcada<br>'
      + '☐ Incidencia SÍ/NO marcada<br>'
      + '☐ Si la acción la hace otro dpto → tarea creada al destinatario correcto',
        '#10b981')
    + jefe;
  }

  // ════════════════════════════════════════════════════════════════════
  // ─── OTROS / FALLBACK ────────────────────────────────────────────────
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


// ═══════════════════════════════════════════════════════════════════════
// KPI ENTRENADORES — cuestionario de actividad al cerrar turno (autocontrol)
// Sustituye al cierre de caja. Guarda en shifts.kpi_entrenador (JSON).
// Claves alineadas con el motor de incentivos (informes.js KPI_KEYS).
// ═══════════════════════════════════════════════════════════════════════
var _ENTR_KPI_CAMPOS = [
  {k:'dir_efectiva',    lbl:'Clases dirigidas efectivas'},
  {k:'dir_no_efectiva', lbl:'Clases dirigidas NO efectivas'},
  {k:'pt',              lbl:'Entrenamientos personales (PT)'},
  {k:'pt_duo',          lbl:'Entrenamientos personales DUO'},
  {k:'pt_30',           lbl:'Entrenamientos personales 30 min'},
  {k:'val_funcional',   lbl:'Valoraciones funcionales'},
  {k:'visbody',         lbl:'Valoraciones Visbody'},
  {k:'banera_hielo',    lbl:'Bañeras de hielo'}
];

function _ensureEntrKpiModal(){
  if(document.getElementById('modal-entr-kpi')) return;
  var ov = document.createElement('div');
  ov.id = 'modal-entr-kpi';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;';
  var campos = _ENTR_KPI_CAMPOS.map(function(c){
    return '<div class="fg"><label>'+c.lbl+'</label>'
      + '<input type="number" inputmode="numeric" min="0" step="1" id="entrkpi-'+c.k+'" placeholder="0" '
      + 'oninput="this.value=this.value.replace(/[^0-9]/g,\'\')" '
      + 'style="color:#111827;background:#ffffff;"></div>';
  }).join('');
  ov.innerHTML = '<div class="modal-box" style="max-width:560px;width:100%;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:24px;">'
    + '<div style="font-family:var(--font-mono);font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px;">🏋 Actividad del turno · KPI</div>'
    + '<div style="font-size:12px;color:var(--text3);margin-bottom:16px;">Registra tu actividad del día. Pon 0 si no hubo. Estas cifras son de autocontrol; el incentivo se calcula con VirtuGym.</div>'
    + '<div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+campos+'</div>'
    + '<div id="entrkpi-err" style="color:var(--red);font-size:12px;margin-top:12px;min-height:14px;"></div>'
    + '<div class="modal-f" style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">'
    + '<button class="btn btn-secondary" onclick="closeEntrKpiModal()">Cancelar</button>'
    + '<button class="btn btn-primary" onclick="submitEntrKpi()">💾 Guardar turno</button>'
    + '</div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) closeEntrKpiModal(); });
}

function openEntrKpiModal(){
  _ensureEntrKpiModal();
  _ENTR_KPI_CAMPOS.forEach(function(c){
    var el = document.getElementById('entrkpi-'+c.k); if(el) el.value='';
  });
  var err = document.getElementById('entrkpi-err'); if(err) err.textContent='';
  var m = document.getElementById('modal-entr-kpi'); if(m) m.style.display='flex';
}
function closeEntrKpiModal(){
  var m = document.getElementById('modal-entr-kpi'); if(m) m.style.display='none';
}

function submitEntrKpi(){
  var errEl = document.getElementById('entrkpi-err');
  // Horas obligatorias (mismo guard que _doSaveTurno, mensaje claro aquí)
  var horas = parseFloat((document.getElementById('t-horas')||{value:''}).value);
  if(!horas || horas <= 0){
    if(errEl) errEl.textContent = 'Horas trabajadas obligatorias — decláralas en el formulario de turno.';
    return;
  }
  var kpi = {};
  for(var i=0;i<_ENTR_KPI_CAMPOS.length;i++){
    var c = _ENTR_KPI_CAMPOS[i];
    var raw = (document.getElementById('entrkpi-'+c.k)||{}).value;
    var n = parseInt(raw, 10);
    if(isNaN(n) || n < 0) n = 0;
    kpi[c.k] = n;
  }
  window._entrKpiState = kpi;
  if(errEl) errEl.textContent='';
  closeEntrKpiModal();
  _doSaveTurno().then(function(){
    window._entrKpiState = null; // limpiar tras guardar
  }).catch(function(e){
    // si falla el guardado, conservar el estado para reintento
    if(errEl) errEl.textContent = 'No se pudo guardar el turno. Reintenta.';
  });
}

window.openEntrKpiModal  = openEntrKpiModal;
window.closeEntrKpiModal = closeEntrKpiModal;
window.submitEntrKpi     = submitEntrKpi;

// Exponer globalmente
window.renderInfoScreen = renderInfoScreen;
window.buildInfoContent = buildInfoContent;

// Defensa: si la página carga con el modal huérfano abierto, cerrarlo
if(typeof document !== 'undefined'){
  document.addEventListener('DOMContentLoaded', function(){
    var ov = document.getElementById('dash-detail-overlay');
    if(ov){ ov.style.display = 'none'; }
  });
}
