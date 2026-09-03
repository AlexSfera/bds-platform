// ════════════════════════════════════════════════════════════════════════
// KANBAN TAREAS — Tablero Kanban del departamento de Mantenimiento
// ────────────────────────────────────────────────────────────────────────
// Función: ejecutar las tareas que otros departamentos asignan a Mantenimiento.
// Reutiliza la tabla `tareas` (NO crea tabla nueva). Filtra dept_destino='Mantenimiento'.
//
// MODELO (supersede a C1 "prioridad manual"): la columna se CALCULA por fecha.
//   Pendiente        → sin fecha_ejecucion
//   Urgente hoy      → fecha_ejecucion <= hoy   (incluye vencidas)
//   Urgente mañana   → fecha_ejecucion == mañana
//   Planificado      → fecha_ejecucion > mañana
//   Hecho            → estado 'Cerrada'/'Validada'  (NO es zona de drop)
//
// La promoción Planificado → mañana → hoy ocurre SOLA al renderizar (sin cron):
// _mantPlanOf() recalcula la columna cada vez comparando fecha_ejecucion con hoy.
//
// Drag & drop (opción A):
//   - Soltar en Urgente hoy    → fecha_ejecucion = hoy
//   - Soltar en Urgente mañana → fecha_ejecucion = mañana
//   - Soltar en Planificado    → abre modal con fecha OBLIGATORIA (min = pasado mañana)
//   - Soltar en Pendiente      → borra fecha_ejecucion
//   - Hecho NO admite drop. El cierre se hace SOLO desde el modal (✓ Marcar como HECHO).
//
// Click en tarjeta → modal de detalle (ver, editar fecha, cerrar, reabrir, eliminar).
// Permisos: solo área Mantenimiento (+ admin) ve, mueve y cierra. Eliminar: solo admin.
//
// REQUIERE columna nueva en `tareas` (ejecutar en Supabase SQL Editor ANTES del deploy):
//   ALTER TABLE tareas ADD COLUMN IF NOT EXISTS fecha_ejecucion date;
// (columnas previas ya existentes: planificacion, room, tipo, area)
// ════════════════════════════════════════════════════════════════════════

var MANT_PLAN_COLS = [
  { key: 'a_planificar', label: 'Pendiente',       icon: '📥', accent: '#64748b' },
  { key: 'hoy',          label: 'Urgente hoy',     icon: '🔴', accent: '#ef4444' },
  { key: 'manana',       label: 'Urgente mañana',  icon: '🟡', accent: '#f59e0b' },
  { key: 'proxima',      label: 'Planificado',     icon: '🗓', accent: '#3b82f6' },
  { key: 'hecho',        label: 'Hecho',           icon: '✅', accent: '#22c55e' }
];

// Drag state (id de la tarea arrastrada) + estado del modal
var _mantDragId  = null;
var _mantModalId = null;

function _mantRoomOf(record){
  var raw=record && (record.room || record.habitacion);
  if(typeof normalizeIncidentRoom === 'function') return normalizeIncidentRoom(raw);
  return String(raw==null?'':raw).trim().toUpperCase();
}

function _mantRoomItemLabel(item, kind){
  if(kind === 'incidencia') return item.tipo_incidencia || item.categoria || 'Incidencia sin tipo';
  return item.tipo || item.titulo || 'Tarea sin tipo';
}

function _mantRoomReport(tareas, incidencias){
  var rooms={};
  function ensure(room){
    if(!rooms[room]) rooms[room]={room:room,tareas:[],incidencias:[],repetidas:{}};
    return rooms[room];
  }
  function register(room, item, kind){
    if(!room) return;
    var row=ensure(room);
    row[kind === 'incidencia' ? 'incidencias' : 'tareas'].push(item);
    var label=_mantRoomItemLabel(item, kind);
    var key=kind+'|'+label;
    if(!row.repetidas[key]) row.repetidas[key]={kind:kind,label:label,total:0};
    row.repetidas[key].total++;
  }

  (tareas||[]).forEach(function(t){ register(_mantRoomOf(t), t, 'tarea'); });
  (incidencias||[]).forEach(function(i){ register(_mantRoomOf(i), i, 'incidencia'); });

  var rows=Object.keys(rooms).map(function(room){
    var row=rooms[room];
    row.tareasAbiertas=row.tareas.filter(function(t){ return typeof isTaskOpen==='function' ? isTaskOpen(t) : t.estado!=='Cerrada'; }).length;
    row.incidenciasAbiertas=row.incidencias.filter(function(i){ return typeof isIncidentOpen==='function' ? isIncidentOpen(i) : i.estado!=='Cerrada'; }).length;
    row.repetidas=Object.keys(row.repetidas).map(function(key){ return row.repetidas[key]; }).filter(function(item){ return item.total >= 2; });
    row.total=row.tareas.length+row.incidencias.length;
    return row;
  });
  rows.sort(function(a,b){
    if(Boolean(b.repetidas.length)!==Boolean(a.repetidas.length)) return b.repetidas.length-a.repetidas.length;
    if(b.total!==a.total) return b.total-a.total;
    return a.room.localeCompare(b.room,undefined,{numeric:true});
  });

  var recurrentes=rows.filter(function(row){ return row.repetidas.length; }).length;
  var html='<div style="margin-top:18px;background:var(--bg3);border:1px solid var(--border);border-top:3px solid #f97316;border-radius:10px;padding:14px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px;">'
    + '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:.06em;color:#f97316;">🚪 INFORME POR HABITACIÓN</div>'
    + '<div style="font-size:11px;color:var(--text3);">'+rows.length+' habitación'+(rows.length===1?'':'es')+' con histórico · '+recurrentes+' con reincidencia</div>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;line-height:1.4;">Reincidencia: el mismo tipo de incidencia o tarea aparece dos o más veces en la misma habitación.</div>';
  if(!rows.length){
    return html+'<div class="empty" style="padding:20px 0;"><div class="empty-text">Sin incidencias ni tareas con habitación registrada</div></div></div>';
  }
  html += '<div style="overflow-x:auto;"><table><tr><th>Habitación</th><th>Incidencias</th><th>Tareas Mantenimiento</th><th>Reincidencias detectadas</th></tr>'
    + rows.map(function(row){
      var reps=row.repetidas.length ? row.repetidas.map(function(rep){
        return '<div style="margin-bottom:3px;"><span class="badge b-orange">🔁 '+rep.total+'×</span> '+_mantEsc(rep.label)+'</div>';
      }).join('') : '<span style="color:var(--text3);">—</span>';
      return '<tr>'
        + '<td style="font-family:var(--font-mono);font-weight:700;">🚪 '+_mantEsc(row.room)+'</td>'
        + '<td><b>'+row.incidencias.length+'</b><span style="color:var(--text3);font-size:11px;"> · '+row.incidenciasAbiertas+' abiertas</span></td>'
        + '<td><b>'+row.tareas.length+'</b><span style="color:var(--text3);font-size:11px;"> · '+row.tareasAbiertas+' abiertas</span></td>'
        + '<td style="font-size:11px;min-width:180px;">'+reps+'</td>'
        + '</tr>';
    }).join('') + '</table></div></div>';
  return html;
}

// ── Permiso: ¿el usuario opera el tablero de Mantenimiento? ──────────────
function _mantCanOperate(user){
  if(!user) return false;
  if(user.rol === 'admin') return true;
  if(user.rol === 'mantenimiento') return true;
  return String(user.area || '') === 'Mantenimiento';
}

// ── Helpers de fecha (locales, coherentes con localTs) ───────────────────
function _mantYMD(v){ return v ? String(v).slice(0, 10) : ''; }
function _mantTomorrow(){ var d = getDateOnly(new Date()); d.setDate(d.getDate() + 1); return toYMD(d); }
function _mantDayAfterTomorrow(){ var d = getDateOnly(new Date()); d.setDate(d.getDate() + 2); return toYMD(d); }

// Columna que corresponde a una fecha de ejecución dada.
function _mantColForFecha(fe){
  if(!fe) return 'a_planificar';
  if(fe <= today())         return 'hoy';       // hoy o vencida
  if(fe === _mantTomorrow()) return 'manana';
  return 'proxima';
}

// ── Planificación efectiva de una tarea (CALCULADA por fecha) ────────────
function _mantPlanOf(t){
  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  if(st === 'Cerrada' || st === 'Validada') return 'hecho';
  var fe = _mantYMD(t.fecha_ejecucion);
  if(fe) return _mantColForFecha(fe);
  // Fallback tareas C1 antiguas (sin fecha_ejecucion): respeta planificacion manual previa
  var p = String(t.planificacion || '').trim();
  if(p === 'hoy' || p === 'manana' || p === 'proxima' || p === 'a_planificar') return p;
  return 'a_planificar';
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────────────────
async function renderMantenimientoMod(){
  var screen = document.getElementById('screen-mant-mod');
  if(!screen) return;

  _mantEnsureModal();

  var sub = screen.querySelector('.page-sub');

  if(!_mantCanOperate(currentUser)){
    if(sub) sub.textContent = 'Acceso restringido';
    var body0 = document.getElementById('mant-kanban');
    if(body0) body0.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-text">Solo el departamento de Mantenimiento puede ver este tablero</div></div>';
    return;
  }

  var tareas = await getDB('tareas');
  tareas = tareas.filter(function(t){ return String(t.dept_destino || '') === 'Mantenimiento'; });
  var incidenciasHabitacion=[];
  try {
    var todasIncidencias=await getDB('incidencias');
    incidenciasHabitacion=(todasIncidencias||[]).filter(function(i){ return !!_mantRoomOf(i); });
  } catch(e){}

  if(sub){
    var abiertas = tareas.filter(function(t){ return typeof isTaskOpen === 'function' ? isTaskOpen(t) : (t.estado === 'Abierta' || t.estado === 'En proceso'); }).length;
    sub.textContent = abiertas + ' tarea' + (abiertas === 1 ? '' : 's') + ' pendiente' + (abiertas === 1 ? '' : 's');
  }

  var body = document.getElementById('mant-kanban');
  if(!body){
    body = document.createElement('div');
    body.id = 'mant-kanban';
    body.style.cssText = 'padding:0 16px 80px;';
    screen.appendChild(body);
  }

  // Agrupa por columna (calculada)
  var groups = {};
  MANT_PLAN_COLS.forEach(function(c){ groups[c.key] = []; });
  tareas.forEach(function(t){ groups[_mantPlanOf(t)].push(t); });

  // Orden dentro de columna: prioridad desc, luego fecha_ejecucion/deadline asc
  var ps = { Alta: 3, Media: 2, Baja: 1 };
  Object.keys(groups).forEach(function(k){
    groups[k].sort(function(a, b){
      var d = (ps[b.prioridad] || 0) - (ps[a.prioridad] || 0);
      if(d !== 0) return d;
      var fa = _mantYMD(a.fecha_ejecucion) || String(a.deadline || '');
      var fb = _mantYMD(b.fecha_ejecucion) || String(b.deadline || '');
      return fa.localeCompare(fb);
    });
  });

  var cols = MANT_PLAN_COLS.map(function(c){
    var isHecho = (c.key === 'hecho');
    var items = groups[c.key];
    var cards = items.length
      ? items.map(function(t){ return _mantCard(t, c.key); }).join('')
      : '<div style="padding:24px 8px;text-align:center;color:var(--text3);font-family:var(--font-mono);font-size:10px;opacity:.6;">— vacío —</div>';

    // Hecho NO es zona de drop → sin ondragover/ondrop
    var dnd = isHecho ? '' :
        'ondragover="event.preventDefault();this.classList.add(\'mant-col-over\');" '
      + 'ondragleave="this.classList.remove(\'mant-col-over\');" '
      + 'ondrop="_mantDrop(event,\'' + c.key + '\')" ';

    return '<div class="mant-col" data-col="' + c.key + '" ' + dnd
      + 'style="flex:1 1 0;min-width:240px;background:var(--bg3);border:1px solid var(--border);border-top:3px solid ' + c.accent + ';border-radius:10px;padding:10px;display:flex;flex-direction:column;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 2px;">'
      +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.06em;color:' + c.accent + ';">' + c.icon + ' ' + c.label.toUpperCase() + '</div>'
      +   '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);background:var(--bg2);border-radius:10px;padding:1px 8px;">' + items.length + '</div>'
      + '</div>'
      + '<div class="mant-col-body" style="display:flex;flex-direction:column;gap:8px;min-height:40px;">' + cards + '</div>'
      + '</div>';
  }).join('');

  body.innerHTML =
      '<style>'
    + '.mant-col-over{outline:2px dashed var(--blue);outline-offset:-2px;}'
    + '.mant-card{cursor:pointer;}'
    + '.mant-card[draggable="true"]:active{cursor:grabbing;}'
    + '@media(max-width:760px){#mant-kanban .mant-scroll{flex-direction:column;}}'
    + '</style>'
    + '<div class="mant-scroll" style="display:flex;gap:12px;align-items:flex-start;overflow-x:auto;padding-bottom:8px;">'
    + cols
    + '</div>'
    + _mantRoomReport(tareas, incidenciasHabitacion);
}

// ── TARJETA ───────────────────────────────────────────────────────────────
function _mantCard(t, colKey){
  var prioClass = t.prioridad === 'Alta' ? 't-alta' : t.prioridad === 'Media' ? 't-media' : 't-baja';
  var prioColor = t.prioridad === 'Alta' ? '#ef4444' : t.prioridad === 'Media' ? '#f59e0b' : '#64748b';
  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  var overdue = (typeof isOverdue === 'function') && isOverdue(t.deadline) && st !== 'Cerrada' && st !== 'Validada';
  var isDone = (colKey === 'hecho');
  var canDrag = !isDone && _mantCanOperate(currentUser); // Hecho no se arrastra

  var creadaTs = t.created_at ? (typeof fmtTs === 'function' ? fmtTs(t.created_at) : String(t.created_at).slice(0, 16).replace('T', ' ')) : '—';

  var meta = [];
  if(t.tipo) meta.push('<span style="background:var(--bg2);border-radius:4px;padding:1px 6px;">' + _mantEsc(t.tipo) + '</span>');
  if(t.room) meta.push('🚪 ' + _mantEsc(t.room));
  if(t.area && t.area !== 'Mantenimiento') meta.push('📍 ' + _mantEsc(t.area));

  var fe = _mantYMD(t.fecha_ejecucion);
  var feLine = fe ? ' · 🗓 ejec. ' + (typeof fmtDate === 'function' ? fmtDate(fe) : fe) : '';

  return '<div class="mant-card ' + prioClass + '" ' + (canDrag ? 'draggable="true" ' : '')
    + 'onclick="_mantOpenModal(\'' + t.id + '\')" '
    + (canDrag ? 'ondragstart="_mantDragStart(event,\'' + t.id + '\')" ondragend="this.style.opacity=\'1\';" ' : '')
    + 'style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ' + prioColor + ';border-radius:8px;padding:10px;' + (isDone ? 'opacity:.72;' : '') + '">'
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;font-family:var(--font-mono);font-size:9px;color:var(--text3);">'
    +   '<span style="color:' + prioColor + ';font-weight:700;">' + (t.prioridad || '—').toUpperCase() + '</span>'
    +   (overdue ? '<span style="color:#ef4444;font-weight:700;">⚠ VENCIDA</span>' : '')
    +   (isDone && t.completada_por ? '<span style="color:#22c55e;font-weight:700;">✓ ' + _mantEsc(t.completada_por) + '</span>' : '')
    + '</div>'
    + '<div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.3;margin-bottom:6px;">' + _mantEsc(t.titulo || '—') + '</div>'
    + (t.descripcion ? '<div style="font-size:11px;color:var(--text2);line-height:1.35;margin-bottom:6px;">' + _mantEsc(t.descripcion) + '</div>' : '')
    + (meta.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;font-family:var(--font-mono);font-size:10px;color:var(--text2);margin-bottom:6px;">' + meta.join('') + '</div>' : '')
    + '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);border-top:1px solid var(--border);padding-top:6px;line-height:1.5;">'
    +   '🛈 de ' + _mantEsc(t.dept_origen || '—') + ' · ' + _mantEsc(t.creado_por || '—') + '<br>'
    +   '🕐 ' + creadaTs
    +   (t.deadline ? ' · 📅 ' + (typeof fmtDate === 'function' ? fmtDate(t.deadline) : t.deadline) : '')
    +   feLine
    + '</div>'
    + '</div>';
}

// ── ESCAPE seguro para texto en HTML ──────────────────────────────────────
function _mantEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── DRAG & DROP ─────────────────────────────────────────────────────────────
function _mantDragStart(ev, taskId){
  if(!_mantCanOperate(currentUser)){ ev.preventDefault(); return; }
  _mantDragId = taskId;
  try { ev.dataTransfer.setData('text/plain', taskId); ev.dataTransfer.effectAllowed = 'move'; } catch(e){}
  if(ev.target && ev.target.style) ev.target.style.opacity = '0.5';
}

async function _mantDrop(ev, targetCol){
  ev.preventDefault();
  var col = ev.currentTarget; if(col) col.classList.remove('mant-col-over');

  var taskId = _mantDragId;
  if(!taskId){ try { taskId = ev.dataTransfer.getData('text/plain'); } catch(e){} }
  _mantDragId = null;
  if(!taskId) return;

  if(!_mantCanOperate(currentUser)){ toast('Sin permiso para mover tareas de Mantenimiento', 'err'); return; }

  var tareas = await getDB('tareas');
  var t = tareas.find(function(x){ return x.id === taskId; });
  if(!t || String(t.dept_destino || '') !== 'Mantenimiento') return;

  var current = _mantPlanOf(t);
  if(current === targetCol) return;

  if(targetCol === 'hecho'){
    toast('Para cerrar, abre la tarea y pulsa "Marcar como HECHO"', 'warn');
    return;
  }
  if(targetCol === 'proxima'){
    // Planificado exige día de ejecución → modal con fecha obligatoria
    _mantOpenModal(taskId, { planMode: true });
    return;
  }
  if(targetCol === 'a_planificar'){ await _mantSetFecha(taskId, null); return; }
  if(targetCol === 'hoy')         { await _mantSetFecha(taskId, today()); return; }
  if(targetCol === 'manana')      { await _mantSetFecha(taskId, _mantTomorrow()); return; }
}

// ── ESCRITURA: fijar/quitar fecha de ejecución ───────────────────────────
// ymd = 'YYYY-MM-DD' o null (Pendiente).
async function _mantSetFecha(taskId, ymd){
  if(!_mantCanOperate(currentUser)){ toast('Sin permiso', 'err'); return; }
  var tareas = await getDB('tareas');
  var t = tareas.find(function(x){ return x.id === taskId; });
  if(!t || String(t.dept_destino || '') !== 'Mantenimiento') return;

  var ts = localTs();
  var upd = {
    fecha_ejecucion: ymd || null,
    planificacion: _mantColForFecha(ymd),   // espejo para compatibilidad (n8n / lecturas externas)
    updated_at: ts
  };
  // Planificar/mover una tarea implica que Mantenimiento la ha tomado
  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  if(st === 'Abierta' && ymd){ upd.estado = 'En proceso'; }

  await dbUpdate('tareas', taskId, upd);
  invalidateCache('tareas');
  var colLabel = (MANT_PLAN_COLS.find(function(c){ return c.key === _mantColForFecha(ymd); }) || {}).label || 'Pendiente';
  if(typeof auditLog === 'function') auditLog('MANT_PLAN', currentUser.nombre + ' → ' + colLabel + (ymd ? ' (' + ymd + ')' : '') + ': ' + (t.titulo || taskId));
  toast('Movida a ' + colLabel, 'ok');
  _mantAfterWrite();
}

// ── CERRAR (único cierre: desde el modal) ────────────────────────────────
async function _mantCloseTask(taskId){
  if(!_mantCanOperate(currentUser)){ toast('Sin permiso', 'err'); return; }
  var tareas = await getDB('tareas');
  var t = tareas.find(function(x){ return x.id === taskId; });
  if(!t || String(t.dept_destino || '') !== 'Mantenimiento') return;
  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  if(st === 'Validada'){ toast('La tarea ya está validada', 'warn'); return; }
  if(st === 'Cerrada'){ toast('La tarea ya está cerrada', 'warn'); return; }
  if(!confirm('¿Marcar como HECHO y cerrar esta tarea?\n\n' + (t.titulo || ''))) return;
  var ts = localTs();
  await dbUpdate('tareas', taskId, { estado: 'Cerrada', completada_por: currentUser.nombre, completada_ts: ts, updated_at: ts });
  invalidateCache('tareas');
  if(typeof auditLog === 'function') auditLog('MANT_CLOSE', currentUser.nombre + ' cerró: ' + (t.titulo || taskId));
  toast('Tarea cerrada', 'ok');
  _mantAfterWrite();
}

// ── REABRIR (desde Hecho, vía modal) ─────────────────────────────────────
async function _mantReopenTask(taskId){
  if(!_mantCanOperate(currentUser)){ toast('Sin permiso', 'err'); return; }
  var tareas = await getDB('tareas');
  var t = tareas.find(function(x){ return x.id === taskId; });
  if(!t || String(t.dept_destino || '') !== 'Mantenimiento') return;
  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  if(st === 'Validada'){ toast('No se puede reabrir una tarea validada', 'warn'); return; }
  var ts = localTs();
  await dbUpdate('tareas', taskId, { estado: 'En proceso', completada_por: null, completada_ts: null, updated_at: ts });
  invalidateCache('tareas');
  if(typeof auditLog === 'function') auditLog('MANT_REOPEN', currentUser.nombre + ' reabrió: ' + (t.titulo || taskId));
  toast('Tarea reabierta', 'ok');
  _mantAfterWrite();
}

// ── ELIMINAR (solo admin, audit ANTES) ───────────────────────────────────
async function _mantDeleteTask(taskId){
  if(!currentUser || currentUser.rol !== 'admin'){ toast('Solo el Administrador puede eliminar tareas', 'err'); return; }
  if(!confirm('¿Eliminar esta tarea permanentemente?\nEsta acción no se puede deshacer.')) return;
  try {
    await auditLog('DELETE_TASK', 'Tarea ' + taskId + ' eliminada por ' + currentUser.nombre);
    var delRes = await syncroSupabaseFetch(
      SUPABASE_URL + '/rest/v1/tareas?id=eq.' + encodeURIComponent(taskId),
      { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'return=minimal' } }
    );
    if(delRes.ok){
      invalidateCache('tareas');
      toast('Tarea eliminada', 'ok');
      _mantAfterWrite();
    } else {
      toast('Error al eliminar: ' + delRes.status, 'err');
    }
  } catch(e){ toast('Error: ' + e.message, 'err'); }
}

// Cierra modal (si aplica), re-renderiza tablero y dots.
function _mantAfterWrite(){
  _mantModalId = null;
  try { if(typeof closeModal === 'function') closeModal('modal-mant-task'); } catch(e){}
  try { renderMantenimientoMod(); if(typeof updateDots === 'function') updateDots(); } catch(e){}
}

// ── MODAL DE TAREA ────────────────────────────────────────────────────────
// Inyecta el overlay una sola vez (no toca index.html).
function _mantEnsureModal(){
  if(document.getElementById('modal-mant-task')) return;
  var ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'modal-mant-task';
  ov.innerHTML =
      '<div class="modal" style="max-width:560px;">'
    +   '<div class="modal-title" id="mmt-title">Tarea</div>'
    +   '<div id="mmt-body"></div>'
    +   '<div class="modal-footer" id="mmt-foot"></div>'
    + '</div>';
  document.body.appendChild(ov);
}

async function _mantOpenModal(taskId, opts){
  if(!_mantCanOperate(currentUser)) return;
  _mantEnsureModal();
  var planMode = !!(opts && opts.planMode);

  var tareas = await getDB('tareas');
  var t = tareas.find(function(x){ return x.id === taskId; });
  if(!t || String(t.dept_destino || '') !== 'Mantenimiento') return;
  _mantModalId = taskId;

  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  var isDone = (st === 'Cerrada' || st === 'Validada');
  var overdue = (typeof isOverdue === 'function') && isOverdue(t.deadline) && !isDone;
  var badge = (typeof bTaskEstado === 'function') ? bTaskEstado(t.estado) : ('<span class="badge">' + _mantEsc(st) + '</span>');
  var fe = _mantYMD(t.fecha_ejecucion);
  var colLabel = (MANT_PLAN_COLS.find(function(c){ return c.key === _mantPlanOf(t); }) || {}).label || '—';

  var titleEl = document.getElementById('mmt-title');
  if(titleEl) titleEl.textContent = t.titulo || 'Tarea';

  var meta = [];
  if(t.tipo) meta.push('<span style="background:var(--bg2);border-radius:4px;padding:1px 6px;">' + _mantEsc(t.tipo) + '</span>');
  if(t.room) meta.push('🚪 ' + _mantEsc(t.room));
  if(t.area && t.area !== 'Mantenimiento') meta.push('📍 ' + _mantEsc(t.area));

  var minDate = planMode ? _mantDayAfterTomorrow() : today();

  var body = document.getElementById('mmt-body');
  if(body){
    body.innerHTML =
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">'
      +   badge
      +   '<span class="badge ' + (t.prioridad === 'Alta' ? 'b-red' : t.prioridad === 'Media' ? 'b-yellow' : 'b-gray') + '">' + _mantEsc(t.prioridad || '—') + '</span>'
      +   '<span class="badge b-blue">' + _mantEsc(colLabel) + '</span>'
      +   (overdue ? '<span class="badge b-red">⚠ VENCIDA</span>' : '')
      + '</div>'
      + (t.descripcion ? '<div style="font-size:13px;color:var(--text2);line-height:1.4;margin-bottom:12px;">' + _mantEsc(t.descripcion) + '</div>' : '')
      + (meta.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;font-family:var(--font-mono);font-size:11px;color:var(--text2);margin-bottom:12px;">' + meta.join('') + '</div>' : '')
      + '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);line-height:1.6;margin-bottom:14px;">'
      +   '🛈 de ' + _mantEsc(t.dept_origen || '—') + ' · ' + _mantEsc(t.creado_por || '—') + '<br>'
      +   '🕐 creada ' + (t.created_at ? (typeof fmtTs === 'function' ? fmtTs(t.created_at) : String(t.created_at).slice(0, 16)) : '—')
      +   (t.deadline ? ' · 📅 deadline ' + (typeof fmtDate === 'function' ? fmtDate(t.deadline) : t.deadline) : '')
      +   (t.completada_por ? '<br>✓ cerrada por ' + _mantEsc(t.completada_por) + ' · ' + (typeof fmtTs === 'function' ? fmtTs(t.completada_ts) : '') : '')
      + '</div>'
      + (isDone ? '' :
          '<div class="fg" style="margin-bottom:0;">'
        +   '<label>Fecha de ejecución' + (planMode ? ' <span class="req">*</span>' : '') + '</label>'
        +   '<input type="date" id="mmt-fecha" min="' + minDate + '" value="' + (planMode ? '' : fe) + '">'
        +   '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Hoy → Urgente hoy · mañana → Urgente mañana · más adelante → Planificado.</div>'
        + '</div>');
  }

  var foot = document.getElementById('mmt-foot');
  if(foot){
    var btns = ['<button class="btn btn-secondary btn-sm" onclick="closeModal(\'modal-mant-task\')">Cerrar</button>'];
    if(!isDone){
      if(fe && !planMode) btns.push('<button class="btn btn-secondary btn-sm" onclick="_mantClearFecha()">Quitar fecha</button>');
      btns.push('<button class="btn btn-primary btn-sm" onclick="_mantSaveFechaFromInput()">🗓 ' + (planMode ? 'Planificar' : 'Guardar fecha') + '</button>');
      btns.push('<button class="btn btn-success btn-sm" onclick="_mantCloseTask(\'' + t.id + '\')">✓ Marcar como HECHO</button>');
    } else if(st === 'Cerrada'){
      btns.push('<button class="btn btn-warn btn-sm" onclick="_mantReopenTask(\'' + t.id + '\')">↩ Reabrir</button>');
    }
    if(currentUser && currentUser.rol === 'admin'){
      btns.push('<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="_mantDeleteTask(\'' + t.id + '\')" title="Solo Admin">🗑 Eliminar</button>');
    }
    foot.innerHTML = btns.join('');
  }

  document.getElementById('modal-mant-task').classList.add('open');
  if(planMode){ var inp = document.getElementById('mmt-fecha'); if(inp) try { inp.focus(); } catch(e){} }
}

function _mantSaveFechaFromInput(){
  if(!_mantModalId) return;
  var inp = document.getElementById('mmt-fecha');
  var v = inp ? String(inp.value || '').slice(0, 10) : '';
  if(!v){ toast('Indica una fecha de ejecución', 'err'); return; }
  if(v < today()){ toast('La fecha no puede ser anterior a hoy', 'err'); return; }
  _mantSetFecha(_mantModalId, v);
}

function _mantClearFecha(){
  if(!_mantModalId) return;
  _mantSetFecha(_mantModalId, null);
}

// ── EXPORTS (todo en window) ──────────────────────────────────────────────
window.renderMantenimientoMod = renderMantenimientoMod;
window._mantDragStart        = _mantDragStart;
window._mantDrop             = _mantDrop;
window._mantOpenModal        = _mantOpenModal;
window._mantSetFecha         = _mantSetFecha;
window._mantSaveFechaFromInput = _mantSaveFechaFromInput;
window._mantClearFecha       = _mantClearFecha;
window._mantCloseTask        = _mantCloseTask;
window._mantReopenTask       = _mantReopenTask;
window._mantDeleteTask       = _mantDeleteTask;
