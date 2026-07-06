// ════════════════════════════════════════════════════════════════════════
// KANBAN TAREAS — Tablero Kanban del departamento de Mantenimiento
// ────────────────────────────────────────────────────────────────────────
// Función: ejecutar las tareas que otros departamentos asignan a Mantenimiento.
// Reutiliza la tabla `tareas` (NO crea tabla nueva). Filtra dept_destino='Mantenimiento'.
// Columnas por PRIORIDAD MANUAL (drag-drop): Pendiente · Urgente hoy · Urgente mañana ·
// Planificado · Hecho. La columna `planificacion` es independiente de `estado`.
//   - Mover entre las 4 primeras columnas → cambia `planificacion`.
//     Si la tarea estaba Abierta y se mueve a Urgente hoy/mañana/Planificado → pasa a En proceso.
//   - Soltar en "Hecho" → cierra la tarea por completo (estado='Cerrada').
// Permisos: solo área Mantenimiento (+ admin) ve, mueve y cierra estas tareas.
//
// REQUIERE columnas nuevas en `tareas` (ver ALTER TABLE en la entrega):
//   planificacion (text)  room (text)  tipo (text)  area (text)
// ════════════════════════════════════════════════════════════════════════

var MANT_PLAN_COLS = [
  { key: 'a_planificar', label: 'Pendiente',       icon: '📥', accent: '#64748b' },
  { key: 'hoy',          label: 'Urgente hoy',     icon: '🔴', accent: '#ef4444' },
  { key: 'manana',       label: 'Urgente mañana',  icon: '🟡', accent: '#f59e0b' },
  { key: 'proxima',      label: 'Planificado',     icon: '🗓', accent: '#3b82f6' },
  { key: 'hecho',        label: 'Hecho',           icon: '✅', accent: '#22c55e' }
];

// Drag state (id de la tarea arrastrada)
var _mantDragId = null;

// ── Permiso: ¿el usuario opera el tablero de Mantenimiento? ──────────────
function _mantCanOperate(user){
  if(!user) return false;
  if(user.rol === 'admin') return true;
  if(user.rol === 'mantenimiento') return true;
  return String(user.area || '') === 'Mantenimiento';
}

// ── Planificación efectiva de una tarea ──────────────────────────────────
// Tareas cerradas/validadas → columna "hecho".
// Tareas abiertas sin planificación → "a_planificar".
function _mantPlanOf(t){
  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  if(st === 'Cerrada' || st === 'Validada') return 'hecho';
  var p = String(t.planificacion || '').trim();
  if(MANT_PLAN_COLS.some(function(c){ return c.key === p; }) && p !== 'hecho') return p;
  return 'a_planificar';
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────────────────
async function renderMantenimientoMod(){
  var screen = document.getElementById('screen-mant-mod');
  if(!screen) return;

  var sub = screen.querySelector('.page-sub');

  if(!_mantCanOperate(currentUser)){
    if(sub) sub.textContent = 'Acceso restringido';
    var body0 = document.getElementById('mant-kanban');
    if(body0) body0.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><div class="empty-text">Solo el departamento de Mantenimiento puede ver este tablero</div></div>';
    return;
  }

  var tareas = await getDB('tareas');
  // Solo tareas asignadas a Mantenimiento
  tareas = tareas.filter(function(t){ return String(t.dept_destino || '') === 'Mantenimiento'; });

  if(sub){
    var abiertas = tareas.filter(function(t){ return typeof isTaskOpen === 'function' ? isTaskOpen(t) : (t.estado === 'Abierta' || t.estado === 'En proceso'); }).length;
    sub.textContent = abiertas + ' tarea' + (abiertas === 1 ? '' : 's') + ' pendiente' + (abiertas === 1 ? '' : 's');
  }

  // Asegura contenedor del tablero
  var body = document.getElementById('mant-kanban');
  if(!body){
    body = document.createElement('div');
    body.id = 'mant-kanban';
    body.style.cssText = 'padding:0 16px 80px;';
    screen.appendChild(body);
  }

  // Agrupa por columna
  var groups = {};
  MANT_PLAN_COLS.forEach(function(c){ groups[c.key] = []; });
  tareas.forEach(function(t){ groups[_mantPlanOf(t)].push(t); });

  // Orden dentro de columna: prioridad desc, luego deadline asc
  var ps = { Alta: 3, Media: 2, Baja: 1 };
  Object.keys(groups).forEach(function(k){
    groups[k].sort(function(a, b){
      var d = (ps[b.prioridad] || 0) - (ps[a.prioridad] || 0);
      if(d !== 0) return d;
      return String(a.deadline || '').localeCompare(String(b.deadline || ''));
    });
  });

  var cols = MANT_PLAN_COLS.map(function(c){
    var items = groups[c.key];
    var cards = items.length
      ? items.map(function(t){ return _mantCard(t, c.key); }).join('')
      : '<div style="padding:24px 8px;text-align:center;color:var(--text3);font-family:var(--font-mono);font-size:10px;opacity:.6;">— vacío —</div>';

    return '<div class="mant-col" data-col="' + c.key + '" '
      + 'ondragover="event.preventDefault();this.classList.add(\'mant-col-over\');" '
      + 'ondragleave="this.classList.remove(\'mant-col-over\');" '
      + 'ondrop="_mantDrop(event,\'' + c.key + '\')" '
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
    + '.mant-card{cursor:grab;}'
    + '.mant-card:active{cursor:grabbing;}'
    + '@media(max-width:760px){#mant-kanban .mant-scroll{flex-direction:column;}}'
    + '</style>'
    + '<div class="mant-scroll" style="display:flex;gap:12px;align-items:flex-start;overflow-x:auto;padding-bottom:8px;">'
    + cols
    + '</div>';
}

// ── TARJETA ───────────────────────────────────────────────────────────────
function _mantCard(t, colKey){
  var prioClass = t.prioridad === 'Alta' ? 't-alta' : t.prioridad === 'Media' ? 't-media' : 't-baja';
  var prioColor = t.prioridad === 'Alta' ? '#ef4444' : t.prioridad === 'Media' ? '#f59e0b' : '#64748b';
  var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
  var overdue = (typeof isOverdue === 'function') && isOverdue(t.deadline) && st !== 'Cerrada' && st !== 'Validada';
  var isDone = (colKey === 'hecho');

  var creadaTs = t.created_at ? (typeof fmtTs === 'function' ? fmtTs(t.created_at) : String(t.created_at).slice(0, 16).replace('T', ' ')) : '—';

  var meta = [];
  if(t.tipo) meta.push('<span style="background:var(--bg2);border-radius:4px;padding:1px 6px;">' + _mantEsc(t.tipo) + '</span>');
  if(t.room) meta.push('🚪 ' + _mantEsc(t.room));
  if(t.area && t.area !== 'Mantenimiento') meta.push('📍 ' + _mantEsc(t.area));

  return '<div class="mant-card ' + prioClass + '" draggable="true" '
    + 'ondragstart="_mantDragStart(event,\'' + t.id + '\')" '
    + 'ondragend="this.style.opacity=\'1\';" '
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

  var ts = localTs();
  var upd = { updated_at: ts };

  if(targetCol === 'hecho'){
    // Cerrar la tarea por completo
    var st = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
    if(st === 'Validada'){ toast('La tarea ya está validada', 'warn'); return; }
    if(!confirm('¿Marcar como HECHO y cerrar esta tarea?\n\n' + (t.titulo || ''))) return;
    upd.estado = 'Cerrada';
    upd.completada_por = currentUser.nombre;
    upd.completada_ts = ts;
    upd.planificacion = 'hecho';
  } else {
    // Mover entre columnas de planificación (no toca cierre)
    upd.planificacion = targetCol;
    var st2 = (typeof normalizeTaskState === 'function') ? normalizeTaskState(t.estado) : t.estado;
    // Si venía de Hecho (reabrir): vuelve a En proceso
    if(st2 === 'Cerrada'){
      upd.estado = 'En proceso';
      upd.completada_por = null;
      upd.completada_ts = null;
    } else if(st2 === 'Abierta' && targetCol !== 'a_planificar'){
      // Planificarla implica que Mantenimiento la ha tomado → En proceso
      upd.estado = 'En proceso';
    }
  }

  await dbUpdate('tareas', taskId, upd);
  invalidateCache('tareas');

  var colLabel = (MANT_PLAN_COLS.find(function(c){ return c.key === targetCol; }) || {}).label || targetCol;
  if(typeof auditLog === 'function') auditLog('MANT_PLAN', currentUser.nombre + ' → ' + colLabel + ': ' + (t.titulo || taskId));
  toast(targetCol === 'hecho' ? 'Tarea cerrada' : 'Movida a ' + colLabel, 'ok');

  try { renderMantenimientoMod(); if(typeof updateDots === 'function') updateDots(); } catch(e){}
}

window.renderMantenimientoMod = renderMantenimientoMod;
window._mantDragStart = _mantDragStart;
window._mantDrop = _mantDrop;
