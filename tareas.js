// ═══════════════════════════════════════════════════════════════════════
// TAREAS — módulo dedicado · SYNCRO HUB
// Extraído de shared.js + dashboard.js · ARCH-04
//
// Depende de (definidos en shared.js, cargado antes):
//   - getDB, dbInsert, dbUpdate, invalidateCache, auditLog, toast, localTs, genId
//   - SUPABASE_URL, SUPABASE_KEY (para DELETE directo)
//   - currentUser, validatingShiftId
//   - TASK_STATES (constante)
//   - isAdmin, isSupervisor, canViewDepartment
//   - fmtDate, fmtTs, isOverdue, formatDisplayValue, deptBadge, deptIcon, bPrio
//   - openValidarModal, closeModal, updateDots, setDeadlineLimits
//
// Consumido por:
//   - shared.js, incidencias.js, gestiones.js, recepcion.js,
//     validacion.js, dashboard.js
// ═══════════════════════════════════════════════════════════════════════

// ── DEADLINE / NORMALIZACIÓN / ESTADO ─────────────────────────────────
function getMinTaskDeadline(){ var d=getDateOnly(new Date()); d.setDate(d.getDate()+1); return toYMD(d); }
function getMaxTaskDeadline(){ var d=getDateOnly(new Date()); d.setDate(d.getDate()+7); return toYMD(d); }

function validateTaskDeadline(deadline){
  if(!deadline) return {ok:false, msg:'El deadline es obligatorio.'};
  if(deadline<getMinTaskDeadline() || deadline>getMaxTaskDeadline()){
    return {ok:false, msg:'El deadline debe estar entre mañana y los próximos 7 días.'};
  }
  return {ok:true};
}

function normalizeTaskState(state){
  if(state==='Pendiente')  return TASK_STATES.ABIERTA;
  if(state==='Completada') return TASK_STATES.CERRADA;
  if(state==='Verificada') return TASK_STATES.VALIDADA;
  if(state===TASK_STATES.EN_PROCESO) return TASK_STATES.EN_PROCESO;
  if(state===TASK_STATES.CERRADA)    return TASK_STATES.CERRADA;
  if(state===TASK_STATES.VALIDADA)   return TASK_STATES.VALIDADA;
  return TASK_STATES.ABIERTA;
}

function isTaskOpen(t){
  var s=normalizeTaskState(t&&t.estado);
  return s===TASK_STATES.ABIERTA || s===TASK_STATES.EN_PROCESO;
}

// Identifica tarea que actúa como gestión (texto contiene 'gestion'/'gestión'
// o destinada a un dept y abierta). Usado por dashboard.
function _isGestionTask(t) {
  if (!t) return false;
  var text = normalizeDeptName([t.origen, t.titulo, t.descripcion].join(' '));
  if (text.indexOf('gestion') !== -1 || text.indexOf('gestión') !== -1) return true;
  return !!t.dept_destino && (normalizeTaskState(t.estado) === TASK_STATES.ABIERTA || normalizeTaskState(t.estado) === TASK_STATES.EN_PROCESO);
}

// Alias usado por KPIs
function _tareaActiva(t) {
  return typeof isTaskOpen === 'function' ? isTaskOpen(t) : (t.estado === 'Abierta' || t.estado === 'En proceso');
}

// ── PERMISOS ──────────────────────────────────────────────────────────
function canValidateTask(user,task){
  return isAdmin(user) && normalizeTaskState(task&&task.estado)===TASK_STATES.CERRADA;
}

function canCloseTask(user,task){
  if(isAdmin(user)) return true;
  if(isSupervisor(user)) return canViewDepartment(user,task&&task.dept_destino);
  return false;
}

function canProgressTask(t){
  var state=normalizeTaskState(t&&t.estado);
  if(state===TASK_STATES.VALIDADA || state===TASK_STATES.CERRADA) return false;
  if(isAdmin(currentUser)) return true;
  if(isSupervisor(currentUser)) return canViewDepartment(currentUser,t&&t.dept_destino);
  return currentUser.area===t.dept_destino; // Empleado puede avanzar tarea de su dpto
}

// ── BADGE ─────────────────────────────────────────────────────────────
function bTaskEstado(e){
  var s=normalizeTaskState(e);
  if(s===TASK_STATES.VALIDADA)  return '<span class="badge b-green">✓ Validada</span>';
  if(s===TASK_STATES.CERRADA)   return '<span class="badge b-orange">Cerrada</span>';
  if(s===TASK_STATES.EN_PROCESO)return '<span class="badge b-blue">En proceso</span>';
  return '<span class="badge b-red">Abierta</span>';
}

// ── UI HELPERS — generación rápida de tareas desde Mi Turno ───────────
function showTaskGen(type){ var el=document.getElementById('task-gen-'+type); if(!el) return; el.classList.add('visible'); setDeadlineLimits(); }
function hideTaskGen(type){ var el=document.getElementById('task-gen-'+type); if(!el) return; el.classList.remove('visible'); }

// ── CREATE / SAVE ─────────────────────────────────────────────────────
async function createTask(data){
  const ts=localTs();
  if(data.origen && data.origen!=='manual' && !data.shift_id){
    toast('No se pudo crear la tarea asociada al turno. Inténtalo de nuevo.','err');
    return null;
  }
  var dlCheck=validateTaskDeadline(data.deadline);
  if(!dlCheck.ok){ toast(dlCheck.msg,'err'); return null; }
  const task={
    id:genId(),
    titulo:data.titulo,
    dept_destino:data.dept_destino,
    dept_origen:data.dept_origen||currentUser.area||'Cocina',
    prioridad:data.prioridad,
    deadline:data.deadline,
    descripcion:data.descripcion||'',
    origen:data.origen||'manual',
    shift_id:data.shift_id||null,
    creado_por:data.creado_por||currentUser.nombre,
    estado:TASK_STATES.ABIERTA,
    completada_por:null,completada_ts:null,
    verificada_por:null,verificada_ts:null,
    notas_cierre:'',
    created_at:ts,updated_at:ts
  };
  const saved=await dbInsert('tareas', task);
  if(!saved){ console.error('Tarea insert failed',task); toast('No se pudo guardar la tarea. Inténtalo de nuevo.','err'); return null; }
  invalidateCache('tareas');
  auditLog('CREATE_TASK',`→ ${task.dept_destino}: ${task.titulo}`);
  toast(`Tarea creada → ${task.dept_destino}`,'ok');
  return task;
}

function openTaskModal(){
  setDeadlineLimits();
  document.getElementById('mt-title').textContent='Nueva Tarea Manual';
  ['task-desc','task-deadline'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var deptEl=document.getElementById('task-dept');  if(deptEl) deptEl.value='';
  var prioEl=document.getElementById('task-prio');  if(prioEl) prioEl.value='';
  var origenEl=document.getElementById('task-dept-origen'); if(origenEl) origenEl.value=currentUser.area||'Cocina';
  document.getElementById('modal-tarea').classList.add('open');
}

async function saveTask(){
  const dept=document.getElementById('task-dept').value;
  const prio=document.getElementById('task-prio').value;
  const dead=document.getElementById('task-deadline').value;
  const desc=(document.getElementById('task-desc')||{}).value||'';
  if(!dept || !prio){ toast('Departamento y prioridad son obligatorios','err'); return; }
  var dlCheck=validateTaskDeadline(dead);
  if(!dlCheck.ok){ toast(dlCheck.msg,'err'); return; }
  const titulo='Tarea Manual — '+new Date().toLocaleDateString('es-ES')+' — '+dept;
  var created=await createTask({
    titulo,
    dept_destino:dept,
    dept_origen:(document.getElementById('task-dept-origen')||{}).value||currentUser.area||'Cocina',
    prioridad:prio,
    deadline:dead,
    descripcion:desc,
    origen:'manual',
    creado_por:currentUser.nombre
  });
  if(!created) return;
  await renderTareas();
  closeModal('modal-tarea');
  renderTareas();
  updateDots();
}

// ── RENDER PANTALLA TAREAS ────────────────────────────────────────────
async function renderTareas(){
  let tareas=await getDB('tareas');
  const estado=document.getElementById('tk-estado').value;
  const dept=document.getElementById('tk-dept').value;
  const prio=document.getElementById('tk-prio').value;
  const origen=document.getElementById('tk-origen').value;
  const desde=document.getElementById('tk-desde').value;
  const hasta=document.getElementById('tk-hasta').value;
  if(estado) tareas=tareas.filter(t=>normalizeTaskState(t.estado)===estado);
  if(dept)   tareas=tareas.filter(t=>t.dept_destino===dept);
  if(prio)   tareas=tareas.filter(t=>t.prioridad===prio);
  if(origen) tareas=tareas.filter(t=>t.origen===origen);
  if(desde)  tareas=tareas.filter(t=>t.created_at.slice(0,10)>=desde);
  if(hasta)  tareas=tareas.filter(t=>t.created_at.slice(0,10)<=hasta);
  tareas.sort((a,b)=>{
    const ps={Alta:3,Media:2,Baja:1};
    if(isTaskOpen(a)&&!isTaskOpen(b)) return -1;
    if(isTaskOpen(b)&&!isTaskOpen(a)) return 1;
    return (ps[b.prioridad]||0)-(ps[a.prioridad]||0);
  });

  // KPIs tareas
  const all=await getDB('tareas');
  const kpiEl=document.getElementById('tareas-kpi');
  const pend  =all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.ABIERTA).length;
  const enProc=all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.EN_PROCESO).length;
  const comp  =all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.CERRADA).length;
  const verif =all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.VALIDADA).length;
  const overdue=all.filter(t=>isOverdue(t.deadline)&&normalizeTaskState(t.estado)!==TASK_STATES.VALIDADA).length;
  kpiEl.innerHTML=`<div class="kpi-grid">
    <div class="kpi k-red"><div class="kpi-lbl">Abiertas</div><div class="kpi-val">${pend}</div></div>
    <div class="kpi k-blue"><div class="kpi-lbl">En proceso</div><div class="kpi-val">${enProc}</div></div>
    <div class="kpi k-orange"><div class="kpi-lbl">Cerradas</div><div class="kpi-val">${comp}</div><div class="kpi-sub">Pendientes de validar</div></div>
    <div class="kpi k-green"><div class="kpi-lbl">Validadas</div><div class="kpi-val">${verif}</div></div>
    <div class="kpi k-red"><div class="kpi-lbl">Vencidas</div><div class="kpi-val">${overdue}</div><div class="kpi-sub">Sin cerrar y deadline pasado</div></div>
  </div>`;

  const listEl=document.getElementById('tareas-list');
  if(!tareas.length){
    listEl.innerHTML='<div class="empty"><div class="empty-icon">🔗</div><div class="empty-text">Sin tareas con este filtro</div></div>';
    return;
  }
  listEl.innerHTML=tareas.map(t=>{
    const normState=normalizeTaskState(t.estado);
    const overdue=isOverdue(t.deadline)&&normState!==TASK_STATES.VALIDADA;
    const prioClass=t.prioridad==='Alta'?'t-alta':t.prioridad==='Media'?'t-media':'t-baja';
    const stateClass=normState===TASK_STATES.VALIDADA?'t-verificada':normState===TASK_STATES.CERRADA?'t-completada':'';
    const canProgress=canProgressTask(t);
    const canVerify=canValidateTask(currentUser,t);
    const canClose=canCloseTask(currentUser,t);
    return `<div class="task-card ${prioClass} ${stateClass}">
      <div class="task-meta">
        ${bPrio(t.prioridad)} ${deptBadge(t.dept_destino)}
        <span class="task-origin">origen: ${t.origen}</span>
        ${t.dept_origen?`<span class="task-origin">de: ${deptIcon(t.dept_origen)} ${t.dept_origen}</span>`:''}
        ${overdue?'<span class="badge b-red">⚠ VENCIDA</span>':''}
        ${bTaskEstado(t.estado)}
      </div>
      <div class="task-title">${t.titulo}</div>
      ${t.descripcion?`<div class="task-desc">${t.descripcion}</div>`:''}
      <div class="task-footer">
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">
          📅 ${fmtDate(t.deadline)} &nbsp;·&nbsp; creada por ${t.creado_por} &nbsp;·&nbsp; ${fmtDate(t.created_at.slice(0,10))}
          ${t.completada_por?`<br>✓ Cerrada por ${t.completada_por} · ${fmtTs(t.completada_ts)}`:''}
          ${t.verificada_por?`<br>✅ Validada por ${t.verificada_por} · ${fmtTs(t.verificada_ts)}`:''}
        </div>
        <div class="task-actions">
          ${canProgress&&normState===TASK_STATES.ABIERTA?`<button class="btn btn-blue-outline btn-sm" style="background:var(--blue-dim);border:1px solid var(--blue);color:var(--blue);" onclick="advanceTask('${t.id}','En proceso')">▶ Iniciar</button>`:''}
          ${canClose&&normState===TASK_STATES.EN_PROCESO?`<button class="btn btn-success btn-sm" onclick="advanceTask('${t.id}','Cerrada')">✓ Cerrar</button>`:''}
          ${canVerify?`<button class="btn btn-primary btn-sm" onclick="advanceTask('${t.id}','Validada')">✅ Validar</button>`:''}
          ${currentUser.rol==='admin'?`<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="deleteTask('${t.id}')" title="Solo Admin">🗑 Eliminar</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── DELETE (solo admin) ───────────────────────────────────────────────
async function deleteTask(taskId){
  if(!currentUser || currentUser.rol !== 'admin'){
    toast('Solo el Administrador puede eliminar tareas','err');
    return;
  }
  if(!confirm('¿Eliminar esta tarea permanentemente?\nEsta acción no se puede deshacer.')) return;
  try {
    var delRes = await fetch(
      SUPABASE_URL + '/rest/v1/tareas?id=eq.' + encodeURIComponent(taskId),
      { method:'DELETE', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Prefer':'return=minimal'} }
    );
    if(delRes.ok){
      await auditLog('DELETE_TASK', 'Tarea '+taskId+' eliminada por '+currentUser.nombre);
      invalidateCache('tareas');
      toast('Tarea eliminada','ok');
      await renderTareas();
    } else {
      toast('Error al eliminar: '+delRes.status,'err');
    }
  } catch(e){ toast('Error: '+e.message,'err'); }
}

// ── TRANSICIÓN ESTADO ─────────────────────────────────────────────────
async function advanceTask(taskId,newEstado){
  const tareas=await getDB('tareas');
  const idx=tareas.findIndex(t=>t.id===taskId); if(idx===-1) return;
  var targetState=normalizeTaskState(newEstado);
  if(targetState===TASK_STATES.VALIDADA  && !canValidateTask(currentUser,tareas[idx])){ toast('Solo Admin puede validar esta tarea.','err'); return; }
  if(targetState===TASK_STATES.CERRADA   && !canCloseTask(currentUser,tareas[idx])){    toast('No tienes permiso para cerrar esta tarea.','err'); return; }
  if(targetState===TASK_STATES.EN_PROCESO && !canProgressTask(tareas[idx])){            toast('Solo el departamento destinatario puede avanzar esta tarea','err'); return; }
  const ts=localTs();
  const tUpdate = {estado:targetState, updated_at:ts};
  if(targetState===TASK_STATES.CERRADA){  tUpdate.completada_por=currentUser.nombre; tUpdate.completada_ts=ts; }
  if(targetState===TASK_STATES.VALIDADA){ tUpdate.verificada_por=currentUser.nombre; tUpdate.verificada_ts=ts; }
  await dbUpdate('tareas', taskId, tUpdate);
  invalidateCache('tareas');
  auditLog('TASK_ADVANCE',`${currentUser.nombre} → ${newEstado}: ${tareas[idx].titulo}`);
  toast(`Tarea: ${newEstado}`,'ok');
  // BUG-51: refresh context — modal validación o Mi Turno
  if(typeof validatingShiftId !== 'undefined' && validatingShiftId){
    openValidarModal(validatingShiftId);
  } else {
    try{ renderTareas(); updateDots(); } catch(e){}
  }
}

// ── RENDER DASHBOARD ──────────────────────────────────────────────────
function _renderTareas(tareas) {
  var el = document.getElementById('dash-tasks-table');
  if (!el) return;

  var pend   = tareas.filter(function(t) { return normalizeTaskState(t.estado) === TASK_STATES.ABIERTA; });
  var enProc = tareas.filter(function(t) { return normalizeTaskState(t.estado) === TASK_STATES.EN_PROCESO; });
  var comp   = tareas.filter(function(t) { return normalizeTaskState(t.estado) === TASK_STATES.CERRADA; });
  var val    = tareas.filter(function(t) { return normalizeTaskState(t.estado) === TASK_STATES.VALIDADA; });
  var venc   = tareas.filter(function(t) { return isOverdue(t.deadline) && isTaskOpen(t); });

  // Grid resumen
  var gridEl = document.getElementById('dept-task-grid');
  if (gridEl) {
    gridEl.innerHTML = '<div class="kpi k-amber"><div class="kpi-lbl">Abiertas</div><div class="kpi-val">' + pend.length + '</div></div>'
      + '<div class="kpi k-blue"><div class="kpi-lbl">En proceso</div><div class="kpi-val">' + enProc.length + '</div></div>'
      + '<div class="kpi k-green"><div class="kpi-lbl">Cerradas</div><div class="kpi-val">' + comp.length + '</div></div>'
      + '<div class="kpi k-green"><div class="kpi-lbl">Validadas</div><div class="kpi-val">' + val.length + '</div></div>'
      + '<div class="kpi k-red"><div class="kpi-lbl">Vencidas</div><div class="kpi-val">' + venc.length + '</div></div>';
  }

  var abiertas = tareas.filter(function(t) { return isTaskOpen(t); });
  abiertas.sort(function(a, b) {
    if (isOverdue(a.deadline) && !isOverdue(b.deadline)) return -1;
    if (!isOverdue(a.deadline) && isOverdue(b.deadline)) return 1;
    return (a.deadline || '').localeCompare(b.deadline || '');
  });

  if (!abiertas.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin tareas abiertas</div></div>';
    return;
  }

  el.innerHTML = '<table>'
    + '<tr><th>Creada</th><th>Prioridad</th><th>Descripción</th><th>Destino</th><th>Responsable</th><th>Deadline</th><th>Estado</th></tr>'
    + abiertas.map(function(t) {
      var vencida = isOverdue(t.deadline);
      var prioColor = t.prioridad === 'Alta' ? 'b-red' : t.prioridad === 'Media' ? 'b-yellow' : 'b-gray';
      var fechaCreada = t.created_at ? t.created_at.replace(' ','T').slice(0,10) : (t.deadline || '');
      var horaCreada = _localHora(t.created_at);
      return '<tr style="' + (vencida ? 'background:rgba(239,68,68,.05)' : '') + '">'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(fechaCreada) + (horaCreada !== '—' ? '<br><span style="color:var(--text3)">' + horaCreada + '</span>' : '') + '</td>'
        + '<td><span class="badge ' + prioColor + '">' + (t.prioridad || '—') + '</span></td>'
        + '<td style="font-size:12px;max-width:200px">' + formatDisplayValue(t.descripcion) + '</td>'
        + '<td>' + deptBadge(t.dept_destino) + '</td>'
        + '<td style="font-size:12px">' + formatDisplayValue(t.responsable_nombre) + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:11px;color:' + (vencida ? 'var(--red)' : 'var(--text)') + '">' + fmtDate(t.deadline) + (vencida ? ' ⚠' : '') + '</td>'
        + '<td>' + bTaskEstado(t.estado) + '</td>'
        + '</tr>';
    }).join('')
    + '</table>';
}
