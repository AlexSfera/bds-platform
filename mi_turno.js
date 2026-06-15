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
  var area = currentUser.area || 'Empleado';
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
      + '<u>SÍ</u> si queda algo abierto que <b>el siguiente turno de Recepción</b> debe continuar. Ej: "Cliente 304 pide factura mañana", "Esperar respuesta de reserva de grupo". '
      + '<i>Si el trabajo lo debe hacer OTRO dpto → crea TAREA, no gestión.</i><br><br>'

      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>'
      + '<u>SÍ</u> si pasó algo que necesita <b>decisión del jefe de Recepción</b>. Ej: queja seria de cliente, error grave de cobro, daño en habitación, descuadre importante, robo. '
      + 'Tú la abres con qué ocurrió + acción tomada + si avisaste al responsable. <b>El jefe la cierra.</b>',
        '#10b981')

    + _infoCard('🏦 Caja Recepción — Traspaso vs Cierre: ¿cuál hago?',
        '<b>Tu turno marca qué puedes hacer:</b><br>'
      + '• <b>Mañana y Tarde →</b> solo '+_tag('TRASPASO','#0891b2')+' (dejas la caja al siguiente turno).<br>'
      + '• <b>Noche →</b> '+_tag('CIERRE','#8b5cf6')+' de caja del día (o traspaso si aún no toca cerrar).<br><br>'
      + '<b>Regla de oro:</b> una sola operación de caja por turno y día. Si sois dos en el turno, <u>la hace uno</u> y el otro pulsa "Cerrar turno sin caja".<br><br>'
      + '<b>El turno se elige una sola vez en Mi Turno.</b> La caja hereda ese turno automáticamente — no se elige dos veces.',
        '#8b5cf6')

    + _infoCard('🔁 Recepción · TRASPASO de caja (Mañana / Tarde) — Campo a campo',
        '<b>Cuándo:</b> al terminar tu turno de Mañana o Tarde, para dejar el efectivo al siguiente compañero.<br><br>'
      + '<b>1 · Fondo recibido del turno anterior (€)</b> — '+_tag('AUTOMÁTICO','#6b7280')+'<br>'
      + 'Viene del último cierre o traspaso. <u>No se puede editar.</u> Cuéntalo al empezar para verificar que es correcto.<br><br>'
      + '<b>2 · Ventas en efectivo según MEWS (€)</b> — '+_req('obligatorio')+'<br>'
      + 'Lo que MEWS dice que cobraste en efectivo durante tu turno. (Si no hubo, pon 0.)<br><br>'
      + '<b>3 · Cash real contado (€)</b> — '+_req('obligatorio')+'<br>'
      + 'Cuenta físicamente los billetes y monedas que hay en el cajón ahora.<br><br>'
      + '<b>4 · ¿Hay retiro para caja fuerte? SÍ / NO</b> — '+_req('obligatorio')+'<br>'
      + 'Si sacaste dinero a la caja fuerte, marca SÍ e indica el importe.<br><br>'
      + '<b>5 · Fondo esperado a traspasar (€)</b> — '+_tag('AUTOMÁTICO','#6b7280')+'<br>'
      + 'El sistema calcula: <b>Fondo recibido + Ventas efectivo MEWS − Retiro caja fuerte</b>.<br><br>'
      + '<b>6 · Fondo real a traspasar (€)</b> — '+_req('obligatorio')+'<br>'
      + 'Cuenta el dinero que vas a dejar al siguiente turno e introdúcelo. '
      + 'Si coincide con el esperado → <b style="color:#10b981;">✓ Fondo cuadrado</b>. '
      + 'Si no → explica la diferencia (obligatorio).',
        '#0891b2')

    + _infoCard('💰 Recepción · CIERRE de caja (Noche) — Campo a campo',
        '<b>Cuándo:</b> al cerrar el día, en el turno de Noche. Verifica que TODO el dinero real coincide con MEWS.<br><br>'
      + '<b>El fondo recibido</b> viene del último cierre o traspaso del día (automático, no editable).<br><br>'
      + '<b>Importante:</b> los importes MEWS (cash, tarjeta, Stripe) son <u>los de tu turno de Noche</u>, no el total del día. Filtra el informe MEWS por tu franja horaria.<br><br>'
      + '<b>Bloque SEGÚN MEWS</b> — '+_req('obligatorios')+': Cash · Tarjeta · Stripe (del informe de cierre MEWS).<br>'
      + '<b>Transferencias:</b> según MEWS + confirmación banco (con fecha).<br>'
      + '<b>Cargos Hotel:</b> Room Charge · SYNCROLAB Charge · Cargo Alexander.<br>'
      + '<b>Pensiones</b> <i>(informativo)</i>: pax desayuno · pax comida+cena + importes.<br>'
      + '<b>Bloque REAL / FÍSICO</b> — '+_req('obligatorios')+': Cash contado · TPV físico · Stripe real (panel Stripe.com).<br><br>'
      + '<b>Diferencias:</b> el sistema calcula Δ Cash · Δ Tarjeta · Δ Stripe · Δ Transferencia. '
      + 'Si todo 0,00 € → caja cuadra. Si no → '+_req('OBLIGATORIO')+' Explicación + Acción tomada + ¿Informado al responsable?<br><br>'
      + '<b>Caja Fuerte:</b> ¿retiraste dinero? SÍ/NO + importe.<br>'
      + '<b>Fondo a traspasar:</b> lo que dejas para el día siguiente (Fondo recibido + Cash MEWS − Retiro). Cuéntalo y confírmalo.',
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

    + _infoCard('🚨 Evaluación objetiva — Tu desempeño se mide',
        '<b>El registro completo en Mi Turno es la base de tu evaluación mensual</b>, '
      + 'y esa evaluación afecta directamente tus <u>incentivos económicos</u>.<br><br>'

      + '<b>Qué mide el sistema automáticamente:</b><br>'
      + '• Cuadre de Caja MEWS (Δ Cash · Δ Tarjeta · Δ Stripe · Δ Transferencia)<br>'
      + '• Diferencias explicadas + acción tomada + ¿informado al responsable?<br>'
      + '• Conteo de fondo real a traspasar (cuadrado o no)<br>'
      + '• Caja fuerte: registro SÍ/NO + importe<br>'
      + '• Incidencias reportadas vs detectadas a posteriori (queja de cliente, supervisor)<br>'
      + '• Hypoxic: incidencia abierta cuando cliente avisó o cámara dio problema<br>'
      + '• Tareas creadas a HK / Mantenimiento cuando correspondía<br><br>'

      + '<b>Qué penaliza:</b><br>'
      + '• Caja MEWS descuadrada sin explicación + acción + responsable informado → penalización<br>'
      + '• Diferencia ocultada o redondeada para que cuadre → penalización doble<br>'
      + '• Aviso de cliente sobre Hypoxic sin incidencia creada → penalización<br>'
      + '• Queja de cliente detectada por supervisor o redes sociales que tú no reportaste → penalización doble<br>'
      + '• Cierre de turno sin contar el fondo a traspasar → penalización<br>'
      + '• Caja fuerte: retiro no registrado o sin importe → penalización<br>'
      + '• Habitación con desperfecto detectado por HK que tú no avisaste a Mantenimiento → penalización<br><br>'

      + '<b>Qué premia:</b><br>'
      + '• Cierres de caja cuadrados de forma sostenida (Δ = 0,00 €)<br>'
      + '• Diferencias mínimas con explicación clara y rápida<br>'
      + '• Comunicación proactiva al responsable EN EL MOMENTO, no al cierre<br>'
      + '• Incidencias documentadas con acción tomada y seguimiento<br>'
      + '• Hypoxic reportado al primer aviso, no cuando ya está cerrada<br>'
      + '• Tareas inter-dpto bien escaladas (HK, Mantenimiento) con prioridad correcta<br><br>'

      + '<b>La regla es simple: registrar = transparencia = confianza = incentivo. '
      + 'No registrar = opacidad = riesgo = penalización.</b>',
        '#ef4444')

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
    + _infoCard('🍽 Sala — ¿Para qué rellenas tu turno?',
        'Para registrar qué servicios cubriste, ajustes en POSMEWS, cierre de caja y cualquier incidencia con cliente. '
      + 'Caja descuadrada, ajuste sin registrar o queja sin gestionar = turno no validado.',
        '#3b82f6')

    + _infoCard('📝 Mi Turno — Campo a campo',
        '<b>'+_req('Fecha')+'</b><br>Día del turno.<br><br>'
      + '<b>'+_req('Servicio')+'</b><br>Desayuno · Comida · Cena · Evento · Otro. Puedes marcar <u>VARIOS</u>.<br><br>'
      + '<b>'+_req('Horas trabajadas')+'</b><br>Horas reales.<br><br>'
      + '<b>'+_req('Responsable de turno')+'</b><br>Quién estuvo al mando.<br><br>'
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Algo del propio dpto de Sala que continúa el siguiente turno tuyo o tu equipo. Ej: "Reserva especial 21h con menú celíaco", "Repasar montaje para evento mañana". <i>Si pide acción de Cocina/Economato → TAREA, no gestión.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br>Algo que requiere <b>decisión del jefe de F&B</b>: queja seria de cliente, conflicto cliente-personal, error grave en cobro, daño material relevante. Tú la abres, <b>el jefe la cierra</b>.',
        '#3b82f6')

    + _infoCard('⚡ Ajustes — Obligatorio en Sala',
        '<b>¿Qué es un ajuste?</b><br>'
      + 'Cualquier operación en POSMEWS que modifica una venta original: anulación, devolución, invitación, error de TPV o de cobro, cargo incorrecto. '
      + 'Es decir, dinero que <u>no entró</u> aunque se generó ticket, o cargos que se rectificaron.<br><br>'

      + '<b>¿Por qué se rellena?</b><br>'
      + '• Sin registro de ajustes, la caja parece descuadrada cuando no lo está realmente.<br>'
      + '• Es la <u>única forma</u> de demostrar que un faltante tiene explicación legítima.<br>'
      + '• Sin ajuste registrado, contabilidad asume pérdida = penalización al turno.<br><br>'

      + '<b>Flujo:</b><br>'
      + 'Al cerrar turno, el sistema pregunta <b>"¿Hubo ajustes en este turno?"</b><br>'
      + '• Si NO hubo → pulsa <b>"✓ No hubo ajustes"</b> (es '+_req('obligatorio')+' confirmarlo)<br>'
      + '• Si SÍ hubo → pulsa <b>"⚡ Sí hubo ajustes"</b> y añade una línea por cada ajuste<br><br>'

      + '<b>Campo a campo de cada línea:</b><br>'
      + '• <b>Tipo</b> — Anulación · Devolución · Invitación · Error TPV · Error cobro · Cargo incorrecto · Otro<br>'
      + '• <b>Nº operaciones</b> — cuántas veces ocurrió ese ajuste (mínimo 1)<br>'
      + '• <b>Importe estimado (€)</b> — cuánto suma ese ajuste<br>'
      + '• <b>¿Comunicado al responsable? SÍ/NO</b> — si avisaste al jefe en el momento<br>'
      + '• <b>Motivo</b> — explicación breve (ej: "Cliente devolvió plato frío", "Invitación VIP autorizada por F&B")',
        '#3b82f6')

    + _infoCard('🏦 Caja Sala — Traspaso vs Cierre: ¿cuál hago?',
        '<b>Tu servicio marca qué puedes hacer:</b><br>'
      + '• <b>Cena y Evento →</b> '+_tag('CIERRE','#3b82f6')+' de caja (o traspaso si aún no toca cerrar).<br>'
      + '• <b>Desayuno, Comida, Otro →</b> solo '+_tag('TRASPASO','#0891b2')+' (dejas la caja al siguiente servicio).<br><br>'
      + '<b>Regla de oro:</b> una sola operación de caja por servicio y día. Si sois varios camareros en el mismo servicio, <u>la hace uno</u> y el resto pulsa "Cerrar turno sin caja".<br><br>'
      + '<b>El servicio se elige una sola vez en Mi Turno</b> (un único servicio por turno). La caja lo hereda automáticamente.<br><br>'
      + '<b>Los camareros NO hacen retiro a caja fuerte en el traspaso</b> — eso es solo del cierre.',
        '#3b82f6')

    + _infoCard('🔁 Sala · TRASPASO de caja (Desayuno / Comida / Otro) — Campo a campo',
        '<b>Cuándo:</b> al terminar tu servicio, para dejar el efectivo al siguiente. Es un traspaso <u>simple, solo de efectivo</u>.<br><br>'
      + '<b>1 · Fondo recibido (€)</b> — '+_tag('AUTOMÁTICO','#6b7280')+'<br>'
      + 'Viene del último cierre o traspaso. <u>No editable.</u> Cuéntalo al empezar para verificar.<br><br>'
      + '<b>2 · Ventas en efectivo POSMEWS (€)</b> — '+_req('obligatorio')+'<br>'
      + 'El efectivo que POSMEWS registró en tu servicio. (Si no hubo, pon 0.)<br><br>'
      + '<b>3 · Cash real contado (€)</b> — '+_req('obligatorio')+'<br>'
      + 'Cuenta físicamente los billetes y monedas del cajón ahora.<br><br>'
      + '<b>4 · Fondo esperado a traspasar (€)</b> — '+_tag('AUTOMÁTICO','#6b7280')+'<br>'
      + 'El sistema calcula: <b>Fondo recibido + Ventas efectivo POSMEWS</b>. (Sin retiro — los camareros no retiran.)<br><br>'
      + '<b>5 · Fondo real a traspasar (€)</b> — '+_req('obligatorio')+'<br>'
      + 'Cuenta el dinero que dejas al siguiente servicio. '
      + 'Si coincide → <b style="color:#10b981;">✓ Fondo cuadrado</b>. Si no → explica la diferencia (obligatorio).<br><br>'
      + '<b>El traspaso NO lleva tarjeta, Stripe ni cargos</b> — todo eso va solo en el cierre de Cena/Evento.',
        '#0891b2')

    + _infoCard('💰 Sala · CIERRE de caja (Cena / Evento) — Campo a campo',
        '<b>Cuándo:</b> al cerrar el servicio de Cena o Evento. Cuadra TODO lo cobrado en el día contra POSMEWS.<br><br>'
      + '<b>El fondo recibido</b> viene del último traspaso/cierre (automático, no editable).<br><br>'
      + '<b>Bloque SEGÚN POSMEWS</b> — '+_req('obligatorios')+': Cash · Tarjeta · Stripe que registró el TPV del restaurante.<br>'
      + '<b>Cargos:</b> Room Charge · SYNCROLAB Charge · Cargo Alexander (consumos a habitación).<br>'
      + '<b>Pensiones</b> <i>(informativo)</i>: pax desayuno · pax comida/cena + importes.<br>'
      + '<b>Bloque REAL</b> — '+_req('obligatorios')+': Cash contado · TPV físico · Stripe plataforma · Propinas TPV.<br>'
      + '<b>Caja Fuerte:</b> ¿retiro? SÍ/NO + importe (esto sí, solo en el cierre).<br><br>'
      + '<b>⚠ Si hay diferencia → '+_req('OBLIGATORIO')+': Explicación + Acción tomada + ¿Informado al responsable?</b><br><br>'
      + '<b>Fondo a traspasar:</b> lo que dejas para el día siguiente. Cuéntalo y confírmalo.',
        '#3b82f6')

    + bloqueDiferencias

    + _infoCard('🚨 Evaluación objetiva — Por qué importa que registres TODO',
        '<b>Lo que NO se registra, NO existe en el sistema. Y lo que no existe en el sistema, NO cuenta a tu favor.</b><br><br>'

      + 'El sistema mide automáticamente cada turno:<br>'
      + '• ¿Cerraste turno con ajustes confirmados (SÍ o NO)?<br>'
      + '• ¿Reportaste incidencias o marcaste "sin incidencias"?<br>'
      + '• ¿Tu caja cuadró o explicaste la diferencia?<br>'
      + '• ¿Comunicaste los ajustes al responsable en su momento?<br><br>'

      + '<b>Estos datos generan tu evaluación objetiva mensual.</b><br>'
      + 'Esa evaluación impacta directamente en <u>tus incentivos económicos</u>.<br><br>'

      + '<b>Qué penaliza:</b><br>'
      + '• Turnos cerrados sin confirmar ajustes → penalización<br>'
      + '• Caja descuadrada sin justificar → penalización<br>'
      + '• Ajustes detectados a posteriori (no registrados por ti) → penalización doble<br>'
      + '• Incidencias detectadas por cliente o supervisor que tú no reportaste → penalización<br><br>'

      + '<b>Qué premia:</b><br>'
      + '• Turnos con registro completo y caja cuadrada<br>'
      + '• Ajustes comunicados al responsable en el momento (no al cierre)<br>'
      + '• Incidencias documentadas con acción tomada clara<br><br>'

      + '<b>La regla es simple: registrar = transparencia = confianza = incentivo. '
      + 'No registrar = opacidad = riesgo = penalización.</b>',
        '#ef4444')

    + _infoCard('✅ Checklist antes de guardar',
        '☐ Servicios marcados<br>'
      + '☐ Ajustes confirmados (SÍ con líneas, o NO explícito)<br>'
      + '☐ Cada ajuste con tipo, importe, motivo y "comunicado al responsable"<br>'
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
      + '<b>'+_req('¿Gestión pendiente? SÍ/NO')+'</b><br>Algo del propio dpto que continúa tu compañero. Ej: "Cliente vuelve mañana para 2ª sesión", "Cerrar informe del test de hoy", "Revisar programa de recovery". <i>Si pide acción a Economato/Mantenimiento → TAREA, no gestión.</i><br><br>'
      + '<b>'+_req('¿Incidencia? SÍ/NO')+'</b><br><u>Cualquier</u> tema que requiere <b>decisión del coordinador</b>: mareo, sobrecarga, mala respuesta al test, malestar médico, problema técnico grave de cámara. La seguridad del cliente está sobre todo. Tú la abres + paras la sesión si aplica + avisas. <b>El coordinador la cierra.</b>',
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
