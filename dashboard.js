// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Plataforma BDS SYNCROSFERA
// Reemplaza renderDashboard() del index.html
// Depende de: shared.js, checklist.js, sala.js, caja.js, recepcion.js
// ═══════════════════════════════════════════════════════════════

// ── CONFIG DEPARTAMENTOS ──────────────────────────────────────
var DASH_DEPTS = [
  { id: 'Cocina',              label: 'Cocina',              activo: true,  icono: '🍳', color: '#f59e0b' },
  { id: 'Sala',                label: 'Sala',                activo: true,  icono: '🍽️', color: '#3b82f6' },
  { id: 'FnB',                 label: 'Restaurante / F&B',   activo: true,  icono: '🏪', color: '#10b981', consolidado: true },
  { id: 'Recepción',           label: 'Recepción Hotel',     activo: true,  icono: '🏨', color: '#8b5cf6' },
  { id: 'RecepcionSyncrolab',  label: 'Recepción SYNCROLAB', activo: false, icono: '🏋️', color: '#2ec4b6' },
  { id: 'Entrenadores',        label: 'Entrenadores',        activo: false, icono: '💪', color: '#06b6d4' },
  { id: 'Fisioterapeutas',     label: 'Fisioterapeutas',     activo: false, icono: '🩺', color: '#84cc16' },
  { id: 'Housekeeping',        label: 'Housekeeping',        activo: false, icono: '🛏️', color: '#a78bfa' },
  { id: 'Mantenimiento',       label: 'Mantenimiento',       activo: false, icono: '🔧', color: '#f97316' },
  { id: 'Economato',           label: 'Economato',           activo: false, icono: '📦', color: '#94a3b8' },
  { id: 'RRHH',                label: 'Recursos Humanos',    activo: false, icono: '👥', color: '#ec4899' },
];

// ── PERMISOS POR ROL ─────────────────────────────────────────
function getDashDeptsForUser() {
  if (!currentUser) return [];
  var rol = currentUser.rol;
  var area = currentUser.area;
  if (rol === 'admin') return DASH_DEPTS;
  if (rol === 'adjunto_directivo' || rol === 'adjunto') return DASH_DEPTS;  // acceso total al dashboard
  if (rol === 'fb') return DASH_DEPTS.filter(function(d) {
    return ['Cocina','Sala','FnB'].indexOf(d.id) !== -1;
  });
  if (rol === 'jefe_recepcion') return DASH_DEPTS.filter(function(d) {
    return d.id === 'Recepción';
  });
  if (typeof isSupervisor === 'function' && isSupervisor(currentUser)) {
    return DASH_DEPTS.filter(function(d) {
      return getSupervisorDepartments(currentUser).some(function(dep) {
        return dep === '*' || normalizeDeptName(dep) === normalizeDeptName(d.id) || normalizeDeptName(dep) === normalizeDeptName(d.label);
      });
    });
  }
  // Responsable departamento — solo su área
  return DASH_DEPTS.filter(function(d) { return d.id === area; });
}

// ── HELPERS LOCALES ───────────────────────────────────────────
function _localHora(ts) {
  if (!ts) return '—';
  // Supabase stores UTC but the original value from localTs() is the local time
  // e.g. "2026-05-15 22:16:54+00" → local time was 22:16, slice gives correct value
  if (typeof ts === 'string' && ts.length >= 16) return ts.slice(11, 16);
  return '—';
}
function _isFio(s) {
  return s.fio === true || s.fio === 1 || s.fio === 'true' || s.fio === '1';
}
// _tareaActiva → tareas.js
function _resolutionMinutes(i) {
  var direct = parseInt(i && i.tiempo_solucion_minutos, 10);
  if (!isNaN(direct) && direct >= 0) return direct;
  if (!i || !i.created_at || !i.fecha_cierre) return null;
  var start = new Date(i.created_at);
  var end = new Date(i.fecha_cierre);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;
  return Math.round((end - start) / 60000);
}
function _dashCanonicalDept(dept) {
  var d = normalizeDeptName(typeof formatDisplayValue === 'function' ? formatDisplayValue(dept) : dept);
  if (!d || d === '—' || d === '[no data]') return '[NO DATA]';
  if (d === 'recepcion') return 'Recepción';
  if (d === 'recepción sfera') return 'Recepción SFERA';
  if (d === 'recepcion syncrolab' || d === 'recepción syncrolab') return 'Recepción SYNCROLAB';
  if (d === 'fnb' || d === 'f&b' || d === 'food & beverage' || d === 'restaurante / f&b') return 'FnB';
  if (d === 'syncrolab') return 'SYNCROLAB';
  if (d === 'syn crolab') return 'SYNCROLAB';
  if (d === 'limpieza') return 'Limpieza';
  if (d === 'housekeeping') return 'Housekeeping';
  return String(dept || '').trim();
}
function _dashDeptSet(deptId) {
  var map = {
    'Cocina': ['Cocina'],
    'Sala': ['Sala'],
    'FnB': ['Cocina','Sala','FnB','Food & Beverage','Friegue'],
    'Recepción': ['Recepción','Recepción SFERA'],
    'RecepcionSyncrolab': ['Recepción SYNCROLAB','SYNCROLAB','SyncroLab'],
    'Entrenadores': ['Entrenadores','SYNCROLAB','SyncroLab'],
    'Fisioterapeutas': ['Fisioterapeutas','Clínica','SYNCROLAB','SyncroLab'],
    'Housekeeping': ['Housekeeping','Limpieza'],
    'Mantenimiento': ['Mantenimiento'],
    'Economato': ['Economato'],
    'RRHH': ['RRHH','Recursos Humanos']
  };
  return (map[deptId] || [deptId]).map(_dashCanonicalDept);
}
function _dashRecordDept(record, shiftMap) {
  return _dashCanonicalDept(getRecordDepartment(record, shiftMap));
}
function _dashMatchesDept(record, deptSet, shiftMap) {
  return deptSet.indexOf(_dashRecordDept(record, shiftMap)) !== -1;
}
// _isOperationalIncident → incidencias.js
// _isGestionTask → tareas.js

// ── ESTADO ACTUAL DEL DASHBOARD ──────────────────────────────
var _dashCurrentDept = null;
var _dashCurrentTab = 'turnos';

function _activateDashTab(tabId) {
  _dashCurrentTab = tabId;
  document.querySelectorAll('.dash-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.dash-panel').forEach(function(panel) {
    panel.classList.toggle('active', panel.id === 'tab-panel-' + tabId);
  });
}

// ── SKELETON LOADER ───────────────────────────────────────────
function _showDashSkeleton() {
  var kpiEl = document.getElementById('kpi-grid');
  if (kpiEl) {
    kpiEl.innerHTML = [1,2,3,4,5].map(function() {
      return '<div class="kpi"><div class="skel skel-kpi"></div></div>';
    }).join('');
  }
  var espEl = document.getElementById('dash-kpi-especifico');
  if (espEl) espEl.innerHTML = '<div class="skel skel-card"></div>';
  var empEl = document.getElementById('dash-emp-table');
  if (empEl) empEl.innerHTML = [1,2,3].map(function() {
    return '<div class="skel skel-row"></div>';
  }).join('');
  var alertEl = document.getElementById('dash-alertas');
  if (alertEl) alertEl.innerHTML = '<div class="skel skel-row"></div>'
    + '<div class="skel skel-row" style="width:70%;margin-top:8px"></div>';
}

// ── RENDERIZADO PRINCIPAL ─────────────────────────────────────
async function renderDashboard() {
  // Determinar qué departamento mostrar
  var deptSel = document.getElementById('dash-dept');
  var depts = getDashDeptsForUser();

  // Si no hay selector o está vacío, usar el primero disponible
  if (!_dashCurrentDept) {
    _dashCurrentDept = depts.length ? depts[0].id : 'Cocina';
  }
  if (deptSel && deptSel.value) {
    _dashCurrentDept = deptSel.value;
  }
  // Asegurar que _dashCurrentDept es válido
  if (!_dashCurrentDept || _dashCurrentDept === '') {
    _dashCurrentDept = 'Cocina';
  }
  if (depts.length && !depts.some(function(d) { return d.id === _dashCurrentDept; })) {
    _dashCurrentDept = depts[0].id;
  }

  var deptCfg = DASH_DEPTS.find(function(d) { return d.id === _dashCurrentDept; }) || DASH_DEPTS[0];

  // Topbar dept accent
  document.documentElement.style.setProperty('--topbar-accent-color', deptCfg.color);

  // Actualizar selector si existe
  if (deptSel) {
    _buildDeptSelector(depts, deptSel);
    deptSel.value = _dashCurrentDept;
  }

  // Título del dashboard
  var sub = document.getElementById('dash-sub');
  if (sub) {
    var icon = deptCfg.icono;
    var label = deptCfg.consolidado ? label = '🏪 Restaurante / F&B — vista consolidada' : icon + ' ' + deptCfg.label;
    sub.textContent = label;
  }

  // Si el departamento no está activo — mostrar placeholder
  if (!deptCfg.activo) {
    _renderPlaceholder(deptCfg);
    return;
  }

  // Cargar datos según periodo
  var periodo = (document.getElementById('dash-periodo') || {}).value || 'semana';
  var empFilt = (document.getElementById('dash-emp') || {}).value || '';
  var sevFilt = (document.getElementById('dash-sev') || {}).value || '';

  var desde = null;
  if (periodo === 'hoy') desde = today();
  if (periodo === 'semana') desde = startOfWeek();
  if (periodo === 'mes') desde = startOfMonth();

  // Mostrar skeleton mientras cargan los datos
  _showDashSkeleton();

  // Cargar datos
  var allShifts   = await getDB('shifts');
  var allMermas   = await getDB('merma');
  var allIncis    = await getDB('incidencias');
  var allTareas   = await getDB('tareas');
  var allGestiones = await getDB('gestiones');
  var allAjustes  = []; try { allAjustes = await getDB('ajustes'); } catch(e){}
  var allEmployees = []; try { allEmployees = await getDB('employees'); } catch(e){}

  var shiftMap = {};
  allShifts.forEach(function(s) { if (s.id) shiftMap[s.id] = s; });

  function _inArea(val, depts) { return depts.indexOf(_dashCanonicalDept(val)) !== -1; }
  function mermaMatchDept(m, depts) { return _dashMatchesDept(m, depts, shiftMap); }
  function inciMatchDept(i, depts) { return _dashMatchesDept(i, depts, shiftMap); }
  function tareaMatchDept(t, depts) { return _dashMatchesDept(t, depts, shiftMap); }

  var shifts, mermas, incis, tareas;
  var validAreas = _dashDeptSet(_dashCurrentDept);
  shifts = allShifts.filter(function(s) { return _inArea(s.area, validAreas); });
  mermas = allMermas.filter(function(m) {
    // Primero intentar por shift
    var s = shiftMap[m.shift_id];
    if (s) return validAreas.indexOf(_dashCanonicalDept(s.area)) !== -1;
    // Fallback: usar area directa de la merma
    if (m.area) return validAreas.indexOf(_dashCanonicalDept(m.area)) !== -1;
    // Si es Cocina o FnB y la merma no tiene area, incluirla (mermas son de cocina por defecto)
    if (_dashCurrentDept === 'Cocina' || _dashCurrentDept === 'FnB') return true;
    return false;
  });
  incis    = allIncis.filter(function(i) { return inciMatchDept(i, validAreas); });
  tareas   = allTareas.filter(function(t) { return tareaMatchDept(t, validAreas); });
  var gestiones = allGestiones.filter(function(g) {
    if(!g || !g.id) return false;
    return _dashMatchesDept(g, validAreas, shiftMap);
  });
  var ajustes = (allAjustes||[]).filter(function(a){
    var s = shiftMap[a.shift_id];
    if(s) return validAreas.indexOf(_dashCanonicalDept(s.area)) !== -1;
    if(a.area) return validAreas.indexOf(_dashCanonicalDept(a.area)) !== -1;
    return false;
  });

  // Filtrar por periodo
  if (desde) {
    shifts = shifts.filter(function(s) { return s.fecha >= desde; });
    mermas = mermas.filter(function(m) {
      var s = shiftMap[m.shift_id];
      if (s) return s.fecha >= desde;
      return (m.fecha || '') >= desde;
    });
    incis = incis.filter(function(i) { return i.fecha >= desde; });
    tareas = tareas.filter(function(t) { return (t.created_at || t.deadline || '') >= desde; });
    gestiones = gestiones.filter(function(g) { return (g.fecha || g.created_at || '') >= desde; });
    ajustes = ajustes.filter(function(a){ return (a.fecha || '') >= desde; });
  }
  if (empFilt) shifts = shifts.filter(function(s) { return s.nombre === empFilt; });
  if (sevFilt) shifts = shifts.filter(function(s) { return s.gravedad_error === sevFilt; });

  console.log('[DASH QA] departamento seleccionado', _dashCurrentDept, validAreas);
  console.log('[DASH QA] total incidencias cargadas', allIncis.length);
  console.log('[DASH QA] total incidencias filtradas', incis.length);
  console.log('[DASH QA] total tareas cargadas', allTareas.length);
  console.log('[DASH QA] total gestiones filtradas', gestiones.length);
  console.log('[DASH QA] ejemplo departamento resuelto', allIncis[0] ? _dashRecordDept(allIncis[0], shiftMap) : '[NO DATA]');

  // Poblar selector de empleados
  _populateDashEmpDropdown(allShifts, _dashCurrentDept);

  // Renderizar secciones
  _renderKpiCards(shifts, mermas, incis, tareas, gestiones, deptCfg);
  _renderAjustesKpi(ajustes);
  await _renderActividadEmpleado(shifts, allShifts, allEmployees);
  _renderAlertas(shifts, mermas, incis, tareas);
  _renderIncidencias(incis, shiftMap);
  _renderGestiones(gestiones, shiftMap);
  _renderMerma(mermas);
  _renderTareas(tareas);
  _renderFIO(shifts);
  renderCostTable();

  // Sincronizar filtro de tipos de incidencia
  _syncInciTiposFilter();

  // Bloque específico por departamento
  if (_dashCurrentDept === 'Cocina') _renderKpiCocina(shifts, mermas);
  else if (_dashCurrentDept === 'Sala') _renderKpiSala(shifts);
  else if (_dashCurrentDept === 'FnB') _renderKpiFnB(allShifts, allMermas, allIncis, desde);
  else if (_dashCurrentDept === 'Recepción') _renderKpiRecepcion(shifts);

  // Merma has its own tab — no need to show/hide section

  // Restaurar pestaña activa tras el render
  _activateDashTab(_dashCurrentTab);
  // Ocultar tab Merma si el dept no es Cocina/Friegue/FnB (redirige a Turnos si estaba activo)
  _toggleMermaTab();
}

// ── SELECTOR DE DEPARTAMENTO ──────────────────────────────────
function _buildDeptSelector(depts, el) {
  // Mantener <select> como portador de estado — solo ocultarlo
  el.style.display = 'none';
  el._built = true;
  // Reconstruir opciones del select para que .value funcione
  el.innerHTML = '';
  depts.forEach(function(d) {
    var opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.id;
    el.appendChild(opt);
  });

  // Asegurar que el wrapper sea visible (shared.js lo oculta para roles no admin/fb,
  // pero los chips son el selector para todos los roles con >1 dept accesible)
  var wrapper = el.parentNode;
  if (wrapper) wrapper.style.display = depts.length > 1 ? 'block' : 'none';

  var chipsId = 'dash-dept-chips';
  var existing = document.getElementById(chipsId);
  if (existing) existing.parentNode.removeChild(existing);

  var chips = document.createElement('div');
  chips.id = chipsId;
  chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;';

  depts.forEach(function(d) {
    var isActive = d.id === _dashCurrentDept;
    var color = d.color || 'var(--accent)';
    var btn = document.createElement('button');
    btn.dataset.dept = d.id;
    btn.title = d.activo ? d.label : d.label + ' — Próximamente';
    btn.style.cssText = [
      'display:flex;align-items:center;gap:5px;',
      'padding:6px 13px;border-radius:20px;border:1px solid;',
      'font-size:12px;font-weight:600;cursor:pointer;',
      'white-space:nowrap;transition:all .15s;font-family:var(--font-ui);',
      isActive
        ? 'background:' + color + '1a;border-color:' + color + ';color:' + color + ';'
        : 'background:var(--bg3);border-color:var(--border);color:var(--text3);',
      d.activo ? '' : 'opacity:.45;cursor:not-allowed;'
    ].join('');
    btn.innerHTML = (d.consolidado ? '🏪' : d.icono) + ' ' + d.label;
    if (d.activo) {
      btn.onclick = function() { _onChipClick(d.id); };
    }
    chips.appendChild(btn);
  });

  // Insertar chips antes del select oculto
  wrapper.insertBefore(chips, el);
  // Quitar label genérica del wrapper si existe (la mostramos implícitamente en los chips)
  var lbl = wrapper.querySelector('label');
  if (lbl) lbl.style.display = 'none';
}

// ── KPI CARDS PRINCIPALES ─────────────────────────────────────
function _renderAjustesKpi(ajustes){
  // Inyecta o reemplaza un contenedor con resumen de ajustes
  var host = document.getElementById('dash-kpi-cards');
  if(!host) return;
  var prev = document.getElementById('dash-kpi-ajustes');
  if(prev) prev.parentNode.removeChild(prev);

  if(!ajustes || ajustes.length === 0) return;

  var total = 0;
  var byTipo = {};
  ajustes.forEach(function(a){
    var imp = parseFloat(a.importe)||0;
    total += imp;
    var t = a.tipo || 'Otro';
    if(!byTipo[t]) byTipo[t] = {count:0, sum:0};
    byTipo[t].count++;
    byTipo[t].sum += imp;
  });

  var col = total < 0 ? 'var(--red)' : 'var(--green)';
  var tipoChips = Object.keys(byTipo).map(function(t){
    return '<span class="badge b-gray" style="margin:2px;">'+formatDisplayValue(t)+': '+byTipo[t].count+' · '+byTipo[t].sum.toFixed(2)+'€</span>';
  }).join(' ');

  var box = document.createElement('div');
  box.id = 'dash-kpi-ajustes';
  box.style.cssText = 'background:var(--bg2);border:1px solid #3b82f6;border-radius:8px;padding:14px;margin-top:12px;';
  box.innerHTML = '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.15em;margin-bottom:8px;">⚙ AJUSTES (Sala)</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
    +   '<div><span style="color:var(--text3);font-size:12px;">Total ajustes en periodo: </span><strong style="font-size:18px;color:'+col+';font-family:var(--font-mono);">'+total.toFixed(2)+' €</strong></div>'
    +   '<div style="color:var(--text3);font-size:11px;">'+ajustes.length+' línea(s)</div>'
    + '</div>'
    + '<div style="margin-top:8px;font-size:11px;">'+tipoChips+'</div>';

  host.parentNode.insertBefore(box, host.nextSibling);
}

function _renderKpiCards(shifts, mermas, incis, tareas, gestiones, deptCfg) {
  var el = document.getElementById('kpi-grid');
  if (!el) return;

  var totalTurnos = shifts.length;
  var valTurnos = shifts.filter(function(s) { return s.estado === 'Validado' || s.estado === 'Validado con FIO'; }).length;
  var pendTurnos = shifts.filter(function(s) { return s.estado === 'Pendiente'; }).length;
  var totalHoras = shifts.reduce(function(a, s) { return a + (parseFloat(s.horas) || 0); }, 0);
  var employees = shifts.reduce(function(acc, s) { acc[s.employee_id || s.nombre] = (parseFloat(s.horas) || 0); return acc; }, {});
  var costePersonal = 0; // calculado en renderCostTable

  var inciTotal = incis.length;
  var inciAbiertas = incis.filter(function(i) { return isIncidentOpen(i); }).length;
  var inciCerradas = incis.filter(function(i) { return normalizeIncidentState(i.estado) === INCIDENT_STATES.CERRADA; }).length;
  var inciCriticas = incis.filter(function(i) { return i.severidad === 'Crítica' && isIncidentOpen(i); }).length;
  var resRows = incis.filter(function(i) { return _resolutionMinutes(i) !== null; });
  var avgRes = resRows.length ? Math.round(resRows.reduce(function(a, i) { return a + _resolutionMinutes(i); }, 0) / resRows.length) : null;

  var fioTotal = shifts.filter(function(s) { return _isFio(s); }).length;
  var fioCrit  = shifts.filter(function(s) { return _isFio(s) && (s.gravedad_error === 'Alta' || s.gravedad_error === 'Crítica'); }).length;
  var fioPend  = shifts.filter(function(s) { return _isFio(s) && !s.validado_por; }).length;

  var tareasPend = tareas.filter(_tareaActiva).length;
  var tareasVenc = tareas.filter(function(t) { return isOverdue(t.deadline) && isTaskOpen(t); }).length;
  var gestPend = gestiones.filter(_tareaActiva).length;
  var gestVenc = gestiones.filter(function(t) { return isOverdue(t.deadline) && isTaskOpen(t); }).length;

  var costeMerma = mermas.reduce(function(a, m) { return a + (m.coste_total || 0); }, 0);

  var html = '';
  html += '<div class="kpi k-amber"><div class="kpi-lbl">Turnos</div><div class="kpi-val">' + totalTurnos + '</div><div class="kpi-sub">' + valTurnos + ' validados · ' + pendTurnos + ' pendientes</div></div>';
  html += '<div class="kpi k-green"><div class="kpi-lbl">Horas</div><div class="kpi-val">' + totalHoras.toFixed(1) + 'h</div><div class="kpi-sub">Prom. ' + (totalTurnos ? (totalHoras / totalTurnos).toFixed(1) : 0) + 'h/turno</div></div>';
  html += '<div class="kpi k-red"><div class="kpi-lbl">Incidencias abiertas</div><div class="kpi-val">' + inciAbiertas + '</div><div class="kpi-sub">' + inciCerradas + ' cerradas · ' + inciCriticas + ' críticas</div></div>';
  html += '<div class="kpi k-amber"><div class="kpi-lbl">Gestiones pendientes</div><div class="kpi-val">' + gestPend + '</div><div class="kpi-sub">' + (gestVenc > 0 ? '<span style="color:var(--red)">' + gestVenc + ' vencidas</span>' : 'Sin vencer') + '</div></div>';
  html += '<div class="kpi k-blue"><div class="kpi-lbl">T. medio resolución</div><div class="kpi-val">' + (avgRes === null ? '—' : Math.round(avgRes / 60) + 'h') + '</div><div class="kpi-sub">' + (avgRes === null ? 'Sin cierres' : avgRes + ' min') + '</div></div>';
  html += '<div class="kpi k-red"><div class="kpi-lbl">FIO total</div><div class="kpi-val">' + fioTotal + '</div><div class="kpi-sub">' + fioCrit + ' alta/crítica · ' + fioPend + ' pendientes</div></div>';
  html += '<div class="kpi k-purple"><div class="kpi-lbl">Tareas abiertas</div><div class="kpi-val">' + tareasPend + '</div><div class="kpi-sub">' + (tareasVenc > 0 ? '<span style="color:var(--red)">' + tareasVenc + ' vencidas</span>' : 'Sin vencer') + '</div></div>';

  // Card específica por departamento
  if (deptCfg.id === 'Cocina' || deptCfg.id === 'FnB') {
    html += '<div class="kpi k-orange"><div class="kpi-lbl">Coste merma</div><div class="kpi-val">' + costeMerma.toFixed(0) + '€</div><div class="kpi-sub">' + mermas.length + ' líneas</div></div>';
  }

  el.innerHTML = html;
}

// ── ACTIVIDAD POR EMPLEADO ────────────────────────────────────
// ── CONSTANTES DE EFICIENCIA ──────────────────────────────────
// Pesos: 70% labor cost + 30% productividad relativa al equipo
// Semáforo labor cost: ≤18% verde · 18-22% ámbar · >22% rojo
var _EFF_LABOR_WEIGHT = 0.70;
var _EFF_PROD_WEIGHT  = 0.30;
var _EFF_LABOR_GREEN  = 18;   // % umbral verde
var _EFF_LABOR_AMBER  = 22;   // % umbral ámbar (>22 = rojo)
var _EFF_MIN_DIAS     = 14;   // días mínimos de datos para puntuar

async function _renderActividadEmpleado(shifts, allShifts, allEmployees) {
  var el = document.getElementById('dash-emp-table');
  if (!el) return;

  // ── 1. Acumular actividad por nombre ────────────────────────
  var eMap = {};
  shifts.forEach(function(s) {
    var key = s.nombre;
    if (!eMap[key]) eMap[key] = {
      nombre: s.nombre, puesto: s.puesto || '—',
      turnos: 0, horas: 0, incis: 0, fio: 0,
      primeraFecha: s.fecha, ultimaFecha: s.fecha
    };
    eMap[key].turnos++;
    eMap[key].horas += parseFloat(s.horas) || 0;
    if (s.incidencia_declarada === 'si') eMap[key].incis++;
    if (_isFio(s)) eMap[key].fio++;
    if (s.fecha < eMap[key].primeraFecha) eMap[key].primeraFecha = s.fecha;
    if (s.fecha > eMap[key].ultimaFecha)  eMap[key].ultimaFecha  = s.fecha;
  });

  var rows = Object.values(eMap).sort(function(a, b) { return b.horas - a.horas; });

  if (!rows.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">Sin actividad en el periodo</div></div>';
    return;
  }

  // ── 2. Cruzar con employees para coste/hora ──────────────────
  var empMaster = {};
  (allEmployees || []).forEach(function(e) {
    empMaster[e.nombre] = e;
  });

  // ── 3. Ventas semanales Sala (solo si el dept activo es Sala/FnB) ─
  var ventasPorNombre = {};
  var deptNecesitaVentas = (_dashCurrentDept === 'Sala' || _dashCurrentDept === 'FnB');
  if (deptNecesitaVentas) {
    try {
      // Calculamos el periodo del selector
      var periodo = (document.getElementById('dash-periodo') || {}).value || 'semana';
      var desde = periodo === 'hoy' ? today() : periodo === 'semana' ? startOfWeek() : startOfMonth();
      var ventasRes = await fetch(
        SUPABASE_URL + '/rest/v1/employee_sales_weekly'
          + '?fecha_inicio_semana=gte.' + desde
          + '&select=employee_id,ventas,fecha_inicio_semana',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      if (ventasRes.ok) {
        var ventasArr = await ventasRes.json();
        // Acumular ventas por employee_id, luego cruzar con nombre
        var ventasPorId = {};
        (ventasArr || []).forEach(function(v) {
          ventasPorId[v.employee_id] = (ventasPorId[v.employee_id] || 0) + parseFloat(v.ventas || 0);
        });
        // Cruzar id → nombre vía employees
        (allEmployees || []).forEach(function(e) {
          if (ventasPorId[e.id] != null) ventasPorNombre[e.nombre] = ventasPorId[e.id];
        });
      }
    } catch(e) { /* ventas no disponibles — solo labor cost */ }
  }

  // ── 4. Calcular media de producción €/turno del equipo ──────
  var prodValores = rows.map(function(r) {
    var v = ventasPorNombre[r.nombre] || 0;
    return r.turnos > 0 ? v / r.turnos : 0;
  });
  var mediaEquipo = prodValores.length
    ? prodValores.reduce(function(s, v) { return s + v; }, 0) / prodValores.length
    : 0;

  // ── 5. Leer último informe publicado (eval. manual) ─────────
  var evalManual = {};
  if (typeof infGetUltimoPublicado === 'function') {
    try {
      var informe = await infGetUltimoPublicado(_dashCurrentDept);
      if (informe && informe.contenido_json && informe.contenido_json.evaluacion_empleados) {
        // El campo es texto libre — buscamos el nombre de cada empleado
        var evalTexto = informe.contenido_json.evaluacion_empleados || '';
        rows.forEach(function(r) {
          var primerApellido = r.nombre.split(' ')[0];
          if (evalTexto.toLowerCase().indexOf(primerApellido.toLowerCase()) >= 0) {
            evalManual[r.nombre] = true;
          }
        });
      }
    } catch(e) {}
  }

  // ── 6. Calcular puntuación de eficiencia por empleado ───────
  function calcEficiencia(row) {
    var emp = empMaster[row.nombre];
    var costeHora = emp ? parseFloat(emp.coste || 0) : 0;
    var ventas    = ventasPorNombre[row.nombre] || 0;

    // Requisito mínimo: 14 días de periodo cubierto
    var diasPeriodo = row.primeraFecha && row.ultimaFecha
      ? Math.round((new Date(row.ultimaFecha) - new Date(row.primeraFecha)) / 86400000) + 1
      : 0;
    if (diasPeriodo < _EFF_MIN_DIAS && !deptNecesitaVentas) {
      // Para depts sin ventas, si tenemos coste podemos puntuar igual
      if (!costeHora) return null;
    }

    // Labor cost % = (horas × coste/hora) / ventas × 100
    var costeTotal = row.horas * costeHora;
    var laborPct   = (ventas > 0 && costeHora > 0) ? (costeTotal / ventas * 100) : null;

    // Factor labor (70%): escala lineal 0-100
    var factorLabor = null;
    if (laborPct !== null) {
      if (laborPct <= _EFF_LABOR_GREEN)       factorLabor = 100;
      else if (laborPct >= 30)               factorLabor = 0;
      else factorLabor = Math.max(0, 100 - (laborPct - _EFF_LABOR_GREEN) / (30 - _EFF_LABOR_GREEN) * 100);
    }

    // Factor producción (30%): €/turno vs media equipo (cap 100)
    var prodTurno   = row.turnos > 0 ? ventas / row.turnos : 0;
    var factorProd  = mediaEquipo > 0
      ? Math.min(100, prodTurno / mediaEquipo * 100)
      : null;

    // Puntuación final
    var score = null;
    if (factorLabor !== null && factorProd !== null) {
      score = factorLabor * _EFF_LABOR_WEIGHT + factorProd * _EFF_PROD_WEIGHT;
    } else if (factorLabor !== null) {
      score = factorLabor; // solo labor cost si no hay ventas
    }

    return {
      score     : score,
      laborPct  : laborPct,
      costeTotal: costeTotal,
      ventas    : ventas,
      costeHora : costeHora,
      sinCoste  : costeHora <= 0
    };
  }

  // ── 7. Semáforo labor cost ───────────────────────────────────
  function semaforoColor(laborPct) {
    if (laborPct === null) return 'var(--text3)';
    if (laborPct <= _EFF_LABOR_GREEN) return 'var(--green)';
    if (laborPct <= _EFF_LABOR_AMBER) return 'var(--amber)';
    return 'var(--red)';
  }
  function semaforoDot(laborPct) {
    var col = semaforoColor(laborPct);
    return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+col+';margin-right:5px;vertical-align:middle;" title="Labor cost: '+(laborPct!==null?laborPct.toFixed(1)+'%':'sin datos')+'"></span>';
  }

  // ── 8. Render tabla ─────────────────────────────────────────
  var tieneVentas = Object.keys(ventasPorNombre).length > 0;
  var tieneCoste  = (allEmployees||[]).some(function(e){ return parseFloat(e.coste||0) > 0; });
  var mostrarEff  = tieneCoste; // mostramos columnas si al menos un empleado tiene coste

  var thead = '<tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
    + '<th style="text-align:left;padding:9px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Empleado</th>'
    + '<th style="text-align:center;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Turnos</th>'
    + '<th style="text-align:center;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Horas</th>'
    + (tieneVentas ? '<th style="text-align:right;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Ventas €</th>' : '')
    + (mostrarEff  ? '<th style="text-align:right;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Coste €</th>'  : '')
    + (mostrarEff && tieneVentas ? '<th style="text-align:center;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Labor %</th>' : '')
    + '<th style="text-align:center;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Incid.</th>'
    + '<th style="text-align:center;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">FIO</th>'
    + (mostrarEff ? '<th style="text-align:center;padding:9px 8px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--text3);">Score</th>' : '')
    + '</tr>';

  var tbody = rows.map(function(row) {
    var eff = mostrarEff ? calcEficiencia(row) : null;
    var laborPct    = eff ? eff.laborPct : null;
    var costeTotal  = eff ? eff.costeTotal : 0;
    var ventas      = eff ? eff.ventas : (ventasPorNombre[row.nombre] || 0);
    var score       = eff ? eff.score : null;
    var sinCoste    = eff ? eff.sinCoste : true;
    var tieneEval   = evalManual[row.nombre] || false;

    // Score badge
    var scoreBadge = '—';
    if (score !== null) {
      var scoreColor = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
      scoreBadge = '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:'+scoreColor+';">'+Math.round(score)+'</span>';
    } else if (sinCoste) {
      scoreBadge = '<span style="font-size:10px;color:var(--text3);" title="Sin coste/hora configurado">N/D</span>';
    }

    return '<tr style="border-bottom:1px solid var(--border);">'
      + '<td style="padding:9px 12px;">'
      +   '<div style="font-weight:600;font-size:13px;">'
      +     (laborPct !== null ? semaforoDot(laborPct) : '')
      +     row.nombre
      +     (tieneEval ? ' <span title="Evaluación manual del jefe en informe" style="font-size:10px;color:var(--accent);cursor:help;">📝</span>' : '')
      +   '</div>'
      +   '<div style="font-size:11px;color:var(--text3);">'+row.puesto+'</div>'
      + '</td>'
      + '<td style="font-family:var(--font-mono);text-align:center;padding:9px 8px;font-size:12px;">'+row.turnos+'</td>'
      + '<td style="font-family:var(--font-mono);text-align:center;padding:9px 8px;font-size:12px;">'+row.horas.toFixed(1)+'h</td>'
      + (tieneVentas ? '<td style="font-family:var(--font-mono);text-align:right;padding:9px 8px;font-size:12px;color:var(--text2);">'+(ventas > 0 ? ventas.toLocaleString('es-ES',{minimumFractionDigits:2})+'€' : '—')+'</td>' : '')
      + (mostrarEff  ? '<td style="font-family:var(--font-mono);text-align:right;padding:9px 8px;font-size:12px;color:var(--text3);">'+(costeTotal > 0 ? costeTotal.toLocaleString('es-ES',{minimumFractionDigits:2})+'€' : sinCoste ? '<span style="font-size:10px;">sin coste</span>' : '—')+'</td>' : '')
      + (mostrarEff && tieneVentas ? '<td style="text-align:center;padding:9px 8px;">'
          +(laborPct !== null
            ? '<span style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:'+semaforoColor(laborPct)+';">'+laborPct.toFixed(1)+'%</span>'
            : '<span style="font-size:10px;color:var(--text3);">—</span>')
          +'</td>' : '')
      + '<td style="text-align:center;padding:9px 8px;">'+(row.incis > 0 ? '<span class="badge b-red">'+row.incis+'</span>' : '—')+'</td>'
      + '<td style="text-align:center;padding:9px 8px;">'+(row.fio > 0 ? '<span class="badge b-red">'+row.fio+'</span>' : '—')+'</td>'
      + (mostrarEff ? '<td style="text-align:center;padding:9px 8px;">'+scoreBadge+'</td>' : '')
      + '</tr>';
  }).join('');

  // Nota metodológica
  var nota = mostrarEff
    ? '<div style="margin-top:10px;padding:8px 12px;background:var(--bg2);border-radius:5px;border-left:2px solid var(--border2);font-size:10px;color:var(--text3);line-height:1.6;">'
      + '📐 Score = labor cost 70% + productividad vs. equipo 30% · '
      + 'Semáforo: <span style="color:var(--green);">●</span> ≤'+_EFF_LABOR_GREEN+'% '
      + '<span style="color:var(--amber);">●</span> '+_EFF_LABOR_GREEN+'–'+_EFF_LABOR_AMBER+'% '
      + '<span style="color:var(--red);">●</span> >'+_EFF_LABOR_AMBER+'% labor cost · '
      + '📝 = evaluación manual del jefe en informe'
      + '</div>'
    : '';

  el.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;margin-bottom:10px;">Eficiencia de empleados</div>'
    + '<div style="overflow-x:auto;">'
    + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    + '<thead>' + thead + '</thead>'
    + '<tbody>' + tbody + '</tbody>'
    + '</table>'
    + '</div>'
    + nota;
}

// ── ALERTAS ACTIVAS ───────────────────────────────────────────
function _renderAlertas(shifts, mermas, incis, tareas) {
  var el = document.getElementById('dash-alertas');
  if (!el) return;

  var msgs = [];

  // Alerta unificada de turnos pendientes
  var pendShifts = shifts.filter(function(s) { return s.estado === 'Pendiente'; });
  var corrShifts = shifts.filter(function(s) { return s.estado === 'En corrección'; });
  if (pendShifts.length > 0 || corrShifts.length > 0) {
    var byDept = {};
    pendShifts.forEach(function(s) { var a = s.area || '?'; byDept[a] = (byDept[a] || 0) + 1; });
    var deptBreak = Object.keys(byDept).map(function(k) { return k + ': ' + byDept[k]; }).join(' · ');
    var conInfo = pendShifts.filter(function(s) {
      return s.merma_declarada === 'si' || s.incidencia_declarada === 'si' || (s.observacion && s.observacion.trim());
    }).length;
    var html = '<strong>' + pendShifts.length + ' turno(s) pendiente(s) de validación</strong>';
    if (deptBreak) html += '<div style="font-size:11px;color:var(--text3);margin-top:3px">' + deptBreak + '</div>';
    if (conInfo > 0) {
      html += '<div style="font-size:11px;margin-top:3px">' + conInfo + ' de ellos con información operativa declarada <span title="Turno con merma, incidencia u observación registrada al cierre del turno" style="cursor:help;border-bottom:1px dotted currentColor">ⓘ</span></div>';
    }
    if (corrShifts.length > 0) {
      html += '<div style="font-size:11px;margin-top:3px;opacity:.8">' + corrShifts.length + ' turno(s) devuelto(s) a corrección — pendiente de reenvío</div>';
    }
    msgs.push({ t: 'warn', m: html });
  }

  var inciCrit = incis.filter(function(i) { return i.severidad === 'Crítica' && isIncidentOpen(i); });
  if (inciCrit.length) msgs.push({ t: 'err', m: '⛔ ' + inciCrit.length + ' incidencia(s) CRÍTICA(s) sin cerrar' });

  var fioPend = shifts.filter(function(s) { return _isFio(s) && !s.validado_por; }).length;
  if (fioPend > 0) msgs.push({ t: 'err', m: fioPend + ' FIO pendiente(s) de validación' });

  var tareasVenc = tareas.filter(function(t) { return isOverdue(t.deadline) && isTaskOpen(t); }).length;
  if (tareasVenc > 0) msgs.push({ t: 'err', m: tareasVenc + ' tarea(s) vencida(s) sin cerrar' });

  var sinCoste = mermas.filter(function(m) { return !m.coste_unitario || m.coste_unitario === 0; }).length;
  if (sinCoste > 0) msgs.push({ t: 'warn', m: sinCoste + ' línea(s) de merma sin coste asignado' });

  var ahora = new Date();
  var turnos24h = pendShifts.filter(function(s) {
    var n = (s.created_at || '').replace(' ', 'T');
    var ts = new Date(n || s.fecha);
    return !isNaN(ts.getTime()) && (ahora - ts) > 86400000;
  }).length;
  if (turnos24h > 0) msgs.push({ t: 'warn', m: turnos24h + ' turno(s) sin validar desde hace más de 24h' });

  if (!msgs.length) msgs.push({ t: 'ok', m: '✓ Sin alertas activas en el periodo' });

  el.innerHTML = msgs.map(function(x) {
    return '<div class="alert a-' + (x.t === 'ok' ? 'ok' : x.t === 'err' ? 'err' : 'warn') + '">' + x.m + '</div>';
  }).join('');
}

// ── INCIDENCIAS DETALLE → incidencias.js ──────────────────────

// ── GESTIONES → gestiones.js ─────────────────────────────────

// ── TAREAS POR DEPARTAMENTO → tareas.js ───────────────────────

// ── FIO DEL PERIODO ───────────────────────────────────────────
function _renderFIO(shifts) {
  var el = document.getElementById('dash-fio-table');
  if (!el) return;

  var fioShifts = shifts.filter(_isFio);

  var countEl = document.getElementById('dash-fio-count');
  if (countEl) countEl.textContent = '(' + fioShifts.length + ' registros)';

  if (!fioShifts.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin FIO en el periodo</div></div>';
    return;
  }

  fioShifts.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); });

  el.innerHTML = '<table>'
    + '<tr><th>Fecha</th><th>Responsable FIO</th><th>Tipo error</th><th>Severidad</th><th>Estado</th><th>Comentario</th></tr>'
    + fioShifts.map(function(s) {
      var sevColor = s.gravedad_error === 'Crítica' ? 'b-red' : s.gravedad_error === 'Alta' ? 'b-orange' : s.gravedad_error === 'Media' ? 'b-yellow' : 'b-gray';
      var estColor = s.validado_por ? 'b-green' : 'b-red';
      var fioResp = s.error_employee_nombre;
      if (!fioResp || fioResp.charAt(0) === '—' || fioResp.indexOf('Sin') !== -1) fioResp = s.nombre || '—';
      return '<tr>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(s.fecha) + '</td>'
        + '<td style="font-weight:600">' + fioResp + '</td>'
        + '<td style="font-size:12px">' + (s.tipo_error || '—') + '</td>'
        + '<td><span class="badge ' + sevColor + '">' + (s.gravedad_error || '—') + '</span></td>'
        + '<td><span class="badge ' + estColor + '">' + (s.validado_por ? '✓ Validado' : 'Pendiente') + '</span></td>'
        + '<td style="font-size:11px;color:var(--text3);max-width:180px">' + (s.comentario_validador || '—') + '</td>'
        + '</tr>';
    }).join('')
    + '</table>';
}

// ── KPI ESPECÍFICO COCINA ─────────────────────────────────────
function _renderKpiCocina(shifts, mermas) {
  var el = document.getElementById('dash-kpi-especifico');
  if (!el) return;

  // BUG-D01: calcular coste_total desde coste_unitario * cantidad si coste_total es 0
  mermas.forEach(function(m){
    if(!m.coste_total && m.coste_unitario && m.cantidad){
      m.coste_total = parseFloat(m.coste_unitario) * parseFloat(m.cantidad);
    }
  });
  var costeMerma = mermas.reduce(function(a, m) { return a + (parseFloat(m.coste_total)||0); }, 0);
  var mermaByProducto = {};
  mermas.forEach(function(m) {
    mermaByProducto[m.producto] = (mermaByProducto[m.producto] || 0) + (m.coste_total || 0);
  });
  var topMerma = Object.entries(mermaByProducto).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);

  // BUG-D02: APPCC % real — puntos completados / total puntos
  var chkTotalPuntos = 0, chkCompletados = 0;
  shifts.forEach(function(s){
    if(!s.checklist_items) return;
    try {
      var items = JSON.parse(s.checklist_items);
      chkTotalPuntos += items.length;
      chkCompletados += items.filter(Boolean).length;
    } catch(e) {}
  });
  var chkPct = chkTotalPuntos > 0 ? Math.round(chkCompletados / chkTotalPuntos * 100) : 0;

  el.innerHTML = '<div class="card-title" style="color:#f59e0b;">🍳 KPIs COCINA</div>'
    + '<div class="kpi-grid" style="margin-bottom:14px;">'
    + '<div class="kpi k-orange"><div class="kpi-lbl">Coste merma</div><div class="kpi-val">' + costeMerma.toFixed(2) + '€</div><div class="kpi-sub">' + mermas.length + ' líneas</div></div>'
    + '<div class="kpi k-amber"><div class="kpi-lbl">APPCC completado</div><div class="kpi-val">' + chkPct + '%</div><div class="kpi-sub">Checklists enviados</div></div>'
    + '</div>'
    + (topMerma.length ? '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#f59e0b;letter-spacing:.1em;margin-bottom:8px;">TOP MERMA POR PRODUCTO</div>'
      + '<table><tr><th>Producto</th><th>Coste total</th></tr>'
      + topMerma.map(function(kv) {
        return '<tr><td>' + kv[0] + '</td><td style="font-family:var(--font-mono);color:var(--orange)">' + kv[1].toFixed(2) + '€</td></tr>';
      }).join('') + '</table>' : '');
}

// ── KPI ESPECÍFICO SALA ───────────────────────────────────────
async function _renderKpiSala(shifts) {
  var el = document.getElementById('dash-kpi-especifico');
  if (!el) return;

  var periodo = (document.getElementById('dash-periodo') || {}).value || 'semana';
  var desde = null;
  if (periodo === 'hoy') desde = today();
  if (periodo === 'semana') desde = startOfWeek();
  if (periodo === 'mes') desde = startOfMonth();

  var cierres = [];
  try {
    cierres = await dbGetAll('sala_cash_closures');
    if (desde) cierres = cierres.filter(function(c) { return c.fecha >= desde; });
  } catch(e) {}

  var difTotal = cierres.reduce(function(a, c) { return a + (c.diferencia_caja || 0); }, 0);
  var difEf = cierres.reduce(function(a, c) { return a + (c.diferencia_efectivo || 0); }, 0);
  var difTar = cierres.reduce(function(a, c) { return a + (c.diferencia_tarjeta || 0); }, 0);
  var cierresPend = cierres.filter(function(c) { return c.estado === 'Pendiente validación' || c.estado === 'Pendiente Sala'; }).length;

  el.innerHTML = '<div class="card-title" style="color:#3b82f6;">🍽️ KPIs SALA</div>'
    + '<div class="kpi-grid" style="margin-bottom:14px;">'
    + '<div class="kpi k-blue"><div class="kpi-lbl">Cierres caja</div><div class="kpi-val">' + cierres.length + '</div><div class="kpi-sub">' + cierresPend + ' pendientes validación</div></div>'
    + '<div class="kpi ' + (Math.abs(difTotal) > 1 ? 'k-red' : 'k-green') + '"><div class="kpi-lbl">Diferencia total</div><div class="kpi-val">' + (difTotal >= 0 ? '+' : '') + difTotal.toFixed(2) + '€</div><div class="kpi-sub">Ef: ' + difEf.toFixed(2) + '€ · Tar: ' + difTar.toFixed(2) + '€</div></div>'
    + '</div>'
    + (cierres.length ? '<table><tr><th>Fecha</th><th>Responsable</th><th>Diferencia</th><th>Estado</th></tr>'
      + cierres.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); }).slice(0, 10).map(function(c) {
        var difColor = Math.abs(c.diferencia_caja || 0) > 0.01 ? 'var(--red)' : 'var(--green)';
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(c.fecha) + '</td>'
          + '<td>' + (c.responsable_nombre || '—') + '</td>'
          + '<td style="font-family:var(--font-mono);color:' + difColor + '">' + ((c.diferencia_caja || 0) >= 0 ? '+' : '') + (c.diferencia_caja || 0).toFixed(2) + '€</td>'
          + '<td>' + bCajaEstado(c.estado || 'Pendiente Sala') + '</td>'
          + '</tr>';
      }).join('') + '</table>' : '<div class="empty"><div class="empty-text">Sin cierres en el periodo</div></div>');
}

// ── KPI ESPECÍFICO F&B CONSOLIDADO ────────────────────────────
async function _renderKpiFnB(allShifts, allMermas, allIncis, desde) {
  var el = document.getElementById('dash-kpi-especifico');
  if (!el) return;

  var shiftsCocina = allShifts.filter(function(s) { return s.area === 'Cocina' || s.area === 'Friegue'; });
  var shiftsSala = allShifts.filter(function(s) { return s.area === 'Sala'; });
  if (desde) {
    shiftsCocina = shiftsCocina.filter(function(s) { return s.fecha >= desde; });
    shiftsSala = shiftsSala.filter(function(s) { return s.fecha >= desde; });
  }

  var horasCocina = shiftsCocina.reduce(function(a, s) { return a + (parseFloat(s.horas) || 0); }, 0);
  var horasSala = shiftsSala.reduce(function(a, s) { return a + (parseFloat(s.horas) || 0); }, 0);

  var mermasCocina = allMermas.filter(function(m) { return !desde || m.fecha >= desde; });
  var costeMerma = mermasCocina.reduce(function(a, m) { return a + (m.coste_total || 0); }, 0);

  var cierres = [];
  try {
    cierres = await dbGetAll('sala_cash_closures');
    if (desde) cierres = cierres.filter(function(c) { return c.fecha >= desde; });
  } catch(e) {}
  var ventasBruto = cierres.reduce(function(a, c) { return a + (c.total_bruto || 0); }, 0);
  var ventasNeto = cierres.reduce(function(a, c) { return a + (c.subtotal_neto || 0); }, 0);

  el.innerHTML = '<div class="card-title" style="color:#10b981;">🏪 RESTAURANTE / F&B — CONSOLIDADO</div>'
    + '<div class="kpi-grid" style="margin-bottom:14px;">'
    + '<div class="kpi k-blue"><div class="kpi-lbl">Horas Cocina</div><div class="kpi-val">' + horasCocina.toFixed(1) + 'h</div><div class="kpi-sub">' + shiftsCocina.length + ' turnos</div></div>'
    + '<div class="kpi k-blue"><div class="kpi-lbl">Horas Sala</div><div class="kpi-val">' + horasSala.toFixed(1) + 'h</div><div class="kpi-sub">' + shiftsSala.length + ' turnos</div></div>'
    + '<div class="kpi k-green"><div class="kpi-lbl">Ventas neto</div><div class="kpi-val">' + ventasNeto.toFixed(0) + '€</div><div class="kpi-sub">Bruto: ' + ventasBruto.toFixed(0) + '€</div></div>'
    + '<div class="kpi k-orange"><div class="kpi-lbl">Coste merma</div><div class="kpi-val">' + costeMerma.toFixed(0) + '€</div><div class="kpi-sub">' + mermasCocina.length + ' líneas cocina</div></div>'
    + '</div>';
}

// ── KPI ESPECÍFICO RECEPCIÓN HOTEL ────────────────────────────
async function _renderKpiRecepcion(shifts) {
  var el = document.getElementById('dash-kpi-especifico');
  if (!el) return;

  var checkins = shifts.reduce(function(a, s) { return a + (parseInt(s.checkins) || 0); }, 0);
  var checkouts = shifts.reduce(function(a, s) { return a + (parseInt(s.checkouts) || 0); }, 0);
  var reservas = shifts.reduce(function(a, s) { return a + (parseInt(s.reservas) || 0); }, 0);
  var ventasSyncrolab = shifts.reduce(function(a, s) {
    if (s.syncrolab_ventas_data) {
      try {
        var ventas = JSON.parse(s.syncrolab_ventas_data);
        ventas.forEach(function(v) { a += parseFloat(v.importe) || 0; });
      } catch(e) {}
    }
    return a;
  }, 0);
  var leadsPend = shifts.reduce(function(a, s) { return a + (s.lead_pendiente === 'si' ? 1 : 0); }, 0);
  var clientesNoSat = shifts.reduce(function(a, s) { return a + (parseInt(s.clientes_num) || 0); }, 0);

  // Cierres caja recepción
  var cierresRec = [];
  try {
    var allRec = await dbGetAll('recepcion_cash');
    if (!allRec.length) allRec = await dbGetAll('recepcion_cash_closures');
    if (!allRec.length) allRec = await getDB('rec_shift_data');
    if (!allRec.length) allRec = await getDB('cash_closings');
    var periodo = (document.getElementById('dash-periodo') || {}).value || 'semana';
    var desde = null;
    if (periodo === 'hoy') desde = today();
    if (periodo === 'semana') desde = startOfWeek();
    if (periodo === 'mes') desde = startOfMonth();
    cierresRec = desde ? allRec.filter(function(r) { return r.fecha >= desde; }) : allRec;
  } catch(e) {}

  el.innerHTML = '<div class="card-title" style="color:#8b5cf6;">🏨 KPIs RECEPCIÓN HOTEL</div>'
    + '<div class="kpi-grid" style="margin-bottom:14px;">'
    + '<div class="kpi k-purple"><div class="kpi-lbl">Check-ins</div><div class="kpi-val">' + checkins + '</div></div>'
    + '<div class="kpi k-purple"><div class="kpi-lbl">Check-outs</div><div class="kpi-val">' + checkouts + '</div></div>'
    + '<div class="kpi k-purple"><div class="kpi-lbl">Reservas</div><div class="kpi-val">' + reservas + '</div></div>'
    + '<div class="kpi k-green"><div class="kpi-lbl">Ventas SYNCROLAB</div><div class="kpi-val">' + ventasSyncrolab.toFixed(0) + '€</div></div>'
    + '<div class="kpi k-amber"><div class="kpi-lbl">Leads pendientes</div><div class="kpi-val">' + leadsPend + '</div></div>'
    + '<div class="kpi k-red"><div class="kpi-lbl">Clientes no sat.</div><div class="kpi-val">' + clientesNoSat + '</div></div>'
    + '</div>'
    + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.1em;margin-bottom:8px;">CUADRES DE CAJA RECEPCIÓN</div>'
    + (cierresRec.length ? '<table><tr><th>Fecha</th><th>Turno</th><th>Responsable</th><th>Estado</th></tr>'
      + cierresRec.sort(function(a, b) { return b.fecha.localeCompare(a.fecha); }).slice(0, 10).map(function(r) {
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(r.fecha) + '</td>'
          + '<td>' + formatDisplayValue(r.turno) + '</td>'
          + '<td>' + formatDisplayValue(r.responsable_nombre || r.usuario_nombre) + '</td>'
          + '<td><span class="badge ' + (r.validado_ts ? 'b-green' : 'b-gray') + '">' + (r.validado_ts ? '✓ Validado' : 'Pendiente') + '</span></td>'
          + '</tr>';
      }).join('') + '</table>'
      : '<div class="empty"><div class="empty-text">Sin cuadres en el periodo</div></div>');
}

// ── MERMA DETALLE ─────────────────────────────────────────────
// Merma solo aplica a Cocina / Friegue / FnB (regla de dominio).
// Oculta el botón del tab Merma en el resto de departamentos.
function _toggleMermaTab() {
  var DEPTS_CON_MERMA = ['Cocina', 'Friegue', 'FnB'];
  var aplica = DEPTS_CON_MERMA.indexOf(_dashCurrentDept) !== -1;
  var btn = document.querySelector('.dash-tab[data-tab="merma"]');
  if (btn) btn.style.display = aplica ? '' : 'none';
  // Si el tab Merma estaba activo y ya no aplica, volver a Turnos
  if (!aplica && _dashCurrentTab === 'merma') {
    _activateDashTab('turnos');
  }
}

function _renderMerma(mermas) {
  var kpiEl = document.getElementById('kpi-merma');
  var el = document.getElementById('dash-merma-table');

  var causa = (document.getElementById('dm-causa') || {}).value || '';
  var empFilt = (document.getElementById('dm-emp') || {}).value || '';

  // Populate employee filter
  var dmEmpEl = document.getElementById('dm-emp');
  if (dmEmpEl) {
    var currentV = dmEmpEl.value;
    var names = {};
    mermas.forEach(function(m) { if (m.nombre) names[m.nombre] = true; });
    dmEmpEl.innerHTML = '<option value="">Todos</option>'
      + Object.keys(names).sort().map(function(n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
    if (currentV) dmEmpEl.value = currentV;
  }

  var filtered = mermas.slice();
  if (causa) filtered = filtered.filter(function(m) { return m.causa === causa; });
  if (empFilt) filtered = filtered.filter(function(m) { return m.nombre === empFilt; });

  if (kpiEl) {
    var totalCoste = filtered.reduce(function(a, m) { return a + (m.coste_total || 0); }, 0);
    var sinCoste = filtered.filter(function(m) { return !m.coste_unitario || m.coste_unitario === 0; }).length;
    kpiEl.innerHTML = '<div class="kpi k-orange"><div class="kpi-lbl">Líneas</div><div class="kpi-val">' + filtered.length + '</div></div>'
      + '<div class="kpi k-orange"><div class="kpi-lbl">Coste total</div><div class="kpi-val">' + totalCoste.toFixed(0) + '€</div></div>'
      + '<div class="kpi k-red"><div class="kpi-lbl">Sin coste</div><div class="kpi-val">' + sinCoste + '</div><div class="kpi-sub">Pendiente valorar</div></div>';
  }

  if (!el) return;
  if (!filtered.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin merma en el periodo</div></div>';
    return;
  }

  filtered.sort(function(a, b) { var ta=b.created_at||b.fecha||''; var tb=a.created_at||a.fecha||''; return ta.localeCompare(tb); });

  el.innerHTML = '<table>'
    + '<tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Causa</th><th>Coste total</th><th>Declarante</th></tr>'
    + filtered.map(function(m) {
      var sinC = !m.coste_unitario || m.coste_unitario === 0;
      return '<tr>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(m.fecha) + '</td>'
        + '<td style="font-weight:600">' + (m.producto || '—') + '</td>'
        + '<td style="font-family:var(--font-mono)">' + (m.cantidad || '—') + ' ' + (m.unidad || '') + '</td>'
        + '<td style="font-size:12px">' + (m.causa || '—') + '</td>'
        + '<td style="font-family:var(--font-mono);' + (sinC ? 'color:var(--amber)' : 'color:var(--orange)') + '">'
        + (sinC ? '⚠ Pendiente' : (m.coste_total || 0).toFixed(2) + '€') + '</td>'
        + '<td style="font-size:12px">' + (m.nombre || '—') + '</td>'
        + '</tr>';
    }).join('')
    + '</table>';
}

// ── PLACEHOLDER DEPARTAMENTOS FUTUROS ─────────────────────────
function _renderPlaceholder(deptCfg) {
  var el = document.getElementById('kpi-grid');
  if (el) el.innerHTML = '';
  var empEl = document.getElementById('dash-emp-table');
  if (empEl) empEl.innerHTML = '';
  var alertEl = document.getElementById('dash-alertas');
  if (alertEl) alertEl.innerHTML = '';
  var inciEl = document.getElementById('dash-inci-table');
  if (inciEl) inciEl.innerHTML = '';
  var kpiInciEl = document.getElementById('kpi-incis');
  if (kpiInciEl) kpiInciEl.innerHTML = '';
  var tasksEl = document.getElementById('dash-tasks-table');
  if (tasksEl) tasksEl.innerHTML = '';
  var gridEl = document.getElementById('dept-task-grid');
  if (gridEl) gridEl.innerHTML = '';
  var gestKpiEl = document.getElementById('dash-gestiones-kpi');
  if (gestKpiEl) gestKpiEl.innerHTML = '';
  var gestTableEl = document.getElementById('dash-gestiones-table');
  if (gestTableEl) gestTableEl.innerHTML = '';
  var fioEl = document.getElementById('dash-fio-table');
  if (fioEl) fioEl.innerHTML = '';
  var costEl = document.getElementById('dash-cost-table');
  if (costEl) costEl.innerHTML = '';
  var espEl = document.getElementById('dash-kpi-especifico');
  if (espEl) espEl.innerHTML = '';

  var main = document.getElementById('kpi-grid');
  if (main) {
    main.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;">'
      + '<div style="font-size:48px;margin-bottom:16px;">' + deptCfg.icono + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:.15em;color:' + deptCfg.color + ';text-transform:uppercase;margin-bottom:8px;">PRÓXIMAMENTE</div>'
      + '<div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:8px;">' + deptCfg.label + '</div>'
      + '<div style="font-size:13px;color:var(--text3);max-width:400px;margin:0 auto;">Este módulo está en desarrollo. La estructura base está preparada — incidencias, tareas, FIO y costes de personal estarán disponibles al activar el departamento.</div>'
      + '</div>';
  }
}

// ── HELPER: POBLAR SELECTOR EMPLEADOS ─────────────────────────
function _populateDashEmpDropdown(allShifts, deptId) {
  var el = document.getElementById('dash-emp');
  if (!el) return;
  var current = el.value;
  var depts = deptId === 'FnB' ? ['Cocina', 'Sala', 'Friegue'] : [deptId];
  var names = {};
  allShifts.filter(function(s) { return depts.indexOf(s.area) !== -1; }).forEach(function(s) { names[s.nombre] = true; });
  el.innerHTML = '<option value="">Todos</option>';
  Object.keys(names).sort().forEach(function(n) {
    var opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    el.appendChild(opt);
  });
  if (current) el.value = current;
}

// ── HELPER: CAMBIO DE DEPT DESDE SELECTOR ────────────────────
function _onChipClick(deptId) {
  // Actualizar select oculto (portador de estado que lee renderDashboard)
  var el = document.getElementById('dash-dept');
  if (el) {
    el.value = deptId;
    el._built = false; // forzar rebuild de chips en el siguiente render
  }
  _dashCurrentDept = deptId;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderDashboard();
}

function onDashDeptChange() {
  var el = document.getElementById('dash-dept');
  if (el) {
    _dashCurrentDept = el.value;
    el._built = false;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderDashboard();
}

// ── OVERRIDE renderCostTable PARA DASHBOARD ──────────────────
// Reemplaza la version de caja.js — respeta _dashCurrentDept
async function renderCostTable() {
  var el = document.getElementById('dash-cost-table');
  if (!el) return;

  var periodo = (document.getElementById('cost-period-filter') || {}).value || 'semana';
  var t = today();
  var fromD = periodo === 'mes' ? startOfMonth() : periodo === 'hoy' ? t : periodo === 'todo' ? '2020-01-01' : startOfWeek();

  var employees = await getDB('employees');
  var shifts = await getDB('shifts');

  // Filtrar shifts por periodo
  var filtShifts = shifts.filter(function(s) { return s.fecha >= fromD && s.fecha <= t; });

  // Filtrar por departamento activo en dashboard
  var areaMapCost = {
    'Cocina': ['Cocina'],
    'Sala': ['Sala'],
    'Recepcion': ['Recepción'],
    'Recepción': ['Recepción'],
    'FnB': ['Cocina', 'Sala', 'Friegue'],
    'RecepcionSyncrolab': ['Recepción SYNCROLAB', 'SYNCROLAB'],
    'Entrenadores': ['Entrenadores'],
    'Fisioterapeutas': ['Fisioterapeutas'],
    'Housekeeping': ['Housekeeping'],
    'Mantenimiento': ['Mantenimiento'],
    'Economato': ['Economato'],
    'RRHH': ['RRHH', 'Recursos Humanos']
  };
  if (_dashCurrentDept) {
    var validAreasCost = areaMapCost[_dashCurrentDept] || [_dashCurrentDept];
    filtShifts = filtShifts.filter(function(s) { return validAreasCost.indexOf(s.area) !== -1; });
  }

  // También respetar el filtro manual del selector de coste si existe
  var manualDeptF = (document.getElementById('cost-dept-filter') || {}).value || '';
  if (manualDeptF) {
    filtShifts = filtShifts.filter(function(s) { return s.area === manualDeptF; });
  }

  var costDeptAreas = _dashCurrentDept ? (areaMapCost[_dashCurrentDept] || [_dashCurrentDept]) : [];
  var costMap = {};
  employees.filter(function(e) {
    var inDept = !costDeptAreas.length || costDeptAreas.indexOf(e.area) !== -1;
    var inManual = !manualDeptF || e.area === manualDeptF;
    return e.estado === 'Activo' && inDept && inManual;
  }).forEach(function(e) {
    costMap[e.id] = { nombre: e.nombre, puesto: e.puesto, area: e.area, ch: parseFloat(e.coste) || 0, h: 0, n: 0 };
  });

  filtShifts.forEach(function(s) {
    if (!costMap[s.employee_id]) {
      // Añadir empleado aunque no esté en Maestro
      costMap[s.employee_id || s.nombre] = { nombre: s.nombre, puesto: s.puesto || '—', area: s.area || '—', ch: 0, h: 0, n: 0 };
    }
    var key = s.employee_id || s.nombre;
    if (costMap[key]) {
      costMap[key].h += parseFloat(s.horas) || 0;
      costMap[key].n++;
    }
  });

  var rows = Object.values(costMap).sort(function(a, b) { return (b.ch * b.h) - (a.ch * a.h) || b.n - a.n; });

  if (!rows.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin datos en el periodo</div></div>';
    return;
  }

  var totH = rows.reduce(function(s, e) { return s + e.h; }, 0);
  var totC = rows.reduce(function(s, e) { return s + e.ch * e.h; }, 0);

  // Subtotales por departamento
  var depts = {};
  rows.forEach(function(e) {
    if (!depts[e.area]) depts[e.area] = { h: 0, c: 0 };
    depts[e.area].h += e.h;
    depts[e.area].c += e.ch * e.h;
  });

  var trs = rows.map(function(e) {
    var ct = e.ch * e.h;
    var noC = e.ch === 0;
    var areaColor = e.area === 'Sala' ? 'b-blue' : e.area === 'Cocina' ? 'b-orange' : 'b-gray';
    return '<tr>'
      + '<td><div style="font-weight:600">' + e.nombre + '</div><div style="font-size:11px;color:var(--text3)">' + e.puesto + '</div></td>'
      + '<td><span class="badge ' + areaColor + '">' + e.area + '</span></td>'
      + '<td style="text-align:center;font-family:var(--font-mono)">' + e.n + '</td>'
      + '<td style="text-align:center;font-family:var(--font-mono)">' + e.h.toFixed(1) + 'h</td>'
      + '<td style="text-align:right;font-family:var(--font-mono)">' + (noC ? '<span style="color:var(--amber)">⚠ Sin coste</span>' : e.ch.toFixed(2) + '€/h') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:#3b82f6">' + (noC ? '—' : ct.toFixed(2) + '€') + '</td>'
      + '</tr>';
  }).join('');

  var subs = Object.entries(depts).map(function(kv) {
    return '<tr style="background:var(--bg3)">'
      + '<td colspan="3" style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.1em">SUBTOTAL ' + kv[0].toUpperCase() + '</td>'
      + '<td style="text-align:center;font-family:var(--font-mono);font-weight:700">' + kv[1].h.toFixed(1) + 'h</td>'
      + '<td></td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:#3b82f6">' + kv[1].c.toFixed(2) + '€</td>'
      + '</tr>';
  }).join('');

  el.innerHTML = '<div style="overflow-x:auto"><table>'
    + '<tr><th>Empleado</th><th>Dept.</th><th style="text-align:center">Turnos</th><th style="text-align:center">Horas</th><th style="text-align:right">€/hora</th><th style="text-align:right">Coste</th></tr>'
    + trs + subs
    + '<tr style="background:var(--bg2);border-top:2px solid var(--border)">'
    + '<td colspan="3" style="font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:.1em">TOTAL GENERAL</td>'
    + '<td style="text-align:center;font-family:var(--font-mono);font-weight:700">' + totH.toFixed(1) + 'h</td>'
    + '<td></td>'
    + '<td style="text-align:right;font-family:var(--font-mono);font-size:16px;font-weight:700;color:#3b82f6">' + totC.toFixed(2) + '€</td>'
    + '</tr></table>'
    + (rows.some(function(e) { return e.ch === 0; }) ? '<div style="font-size:11px;color:var(--amber);margin-top:8px;font-family:var(--font-mono)">⚠ Empleados sin coste/hora — edítalos en Maestro.</div>' : '')
    + '</div>';
}

// ── INTEGRACIÓN CON INCIDENCIA_TIPOS ─────────────────────────
// Se llama al final de renderDashboard para actualizar filtros
function _syncInciTiposFilter() {
  if (typeof populateDashInciFilter === 'function') {
    populateDashInciFilter(_dashCurrentDept);
  }
}

// ── DETALLE DE REGISTRO (overlay) ────────────────────────────
async function _dashShowDetail(id, table) {
  var overlay = document.getElementById('dash-detail-overlay');
  if (!overlay) return;
  var body = overlay.querySelector('.dash-detail-body');
  if (!body) {
    // Estructura perdida (modal huérfano): reconstruir el cuerpo antes de mostrar.
    var inner = overlay.firstElementChild;
    if (inner) { body = document.createElement('div'); body.className = 'dash-detail-body'; inner.appendChild(body); }
  }
  if (!body) return; // Sin cuerpo no se muestra: imposible un modal vacío.
  body.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">Cargando…</div>';
  overlay.style.display = 'flex';
  try {
    var records = await getDB(table);
    var rec = records.find(function(r) { return String(r.id) === String(id); });
    if (!rec) { if (body) body.innerHTML = '<div style="color:var(--text3);font-size:13px">Registro no encontrado.</div>'; return; }
    function row(label, val) {
      if (!val || val === '—' || val === '[NO DATA]') return '';
      return '<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">'
        + '<div style="flex:0 0 140px;color:var(--text3);font-size:11px;font-family:var(--font-mono);letter-spacing:.05em;text-transform:uppercase;padding-top:2px">' + label + '</div>'
        + '<div style="flex:1;word-break:break-word">' + val + '</div>'
        + '</div>';
    }
    var html = '';
    if (table === 'incidencias') {
      var hora = _localHora(rec.created_at);
      html += row('Fecha', fmtDate(rec.fecha) + (hora !== '—' ? ' · ' + hora : ''));
      html += row('Departamento', rec.area || '—');
      html += row('Tipo / Categoría', rec.categoria || '—');
      html += row('Severidad', rec.severidad || '—');
      html += row('Descripción', formatDisplayValue(rec.descripcion));
      html += row('Acción tomada', formatDisplayValue(rec.accion_inmediata));
      html += row('Estado', rec.estado || '—');
      html += row('Declarado por', rec.nombre || rec.empleado || '—');
      var staff = '';
      if (rec.staff_implicado_nombres) {
        try { staff = JSON.parse(rec.staff_implicado_nombres).join(', '); } catch(e) { staff = rec.staff_implicado_nombres; }
      }
      html += row('Personal implicado', staff || '—');
      html += row('Observaciones', formatDisplayValue(rec.observacion || rec.notas));
    } else {
      var horaT = _localHora(rec.created_at);
      var fechaT = rec.fecha || (rec.created_at ? rec.created_at.replace(' ', 'T').slice(0, 10) : '');
      html += row('Fecha', fmtDate(fechaT) + (horaT !== '—' ? ' · ' + horaT : ''));
      html += row('Departamento', rec.area || rec.dept_destino || '—');
      html += row('Tipo', rec.titulo || rec.origen || '—');
      html += row('Descripción', formatDisplayValue(rec.descripcion));
      html += row('Estado', rec.estado || '—');
      html += row('Creado por', rec.creado_por || '—');
      html += row('Acción tomada / Notas cierre', formatDisplayValue(rec.notas_cierre));
      html += row('Deadline', fmtDate(rec.deadline));
      html += row('Prioridad', rec.prioridad || '—');
      html += row('Responsable', rec.responsable_nombre || '—');
    }
    if (body) body.innerHTML = html || '<div style="color:var(--text3);font-size:13px">Sin datos adicionales.</div>';
  } catch(e) {
    if (body) body.innerHTML = '<div style="color:var(--red);font-size:13px">Error al cargar: ' + e.message + '</div>';
  }
}

function _dashCloseDetail() {
  var overlay = document.getElementById('dash-detail-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function _dashDeleteRecord(id, table) {
  if (!currentUser || currentUser.rol !== 'admin') return;
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  try {
    await sbRequest('DELETE', table, null, 'id=eq.' + id);
    invalidateCache(table);
    toast('Registro eliminado', 'ok');
    renderDashboard();
  } catch(e) {
    toast('Error al eliminar: ' + e.message, 'err');
  }
}

// ══════════════════════════════════════════════════════════════════════
// C5 — PREVISIÓN DE TURNOS + RR.HH. OPERATIVO
// Motor JS cliente · Lee: employee_status, dept_reports, shifts (histórico)
// ══════════════════════════════════════════════════════════════════════

// Tipos de turno por dept (coherente con informes.js)
var _PREV_TURNOS = {
  'Sala'     : ['M','T','C'],
  'Cocina'   : ['M','T','C'],
  'FnB'      : ['M','T','C'],
  'Recepción': ['M','T','N'],
  'SYNCROLAB': ['M','T'],
  'Housekeeping':['M','T']
};

// Mínimo de empleados por turno (configurable — ajustable por dept)
var _PREV_MIN_EMP = {
  M: 2, T: 2, C: 1, N: 1
};

async function renderDashPrevision() {
  var el = document.getElementById('dash-prevision-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--text3);">Calculando previsión…</p>';

  var dept = _dashCurrentDept;
  var turnosDept = _PREV_TURNOS[dept] || ['M','T'];
  var hoy = today();

  // ── 1. Empleados disponibles (excluye bajas y vacaciones activas) ──
  var allEmployees = [];
  try { allEmployees = await getDB('employees'); } catch(e){}
  var validAreas = _dashDeptSet(dept);

  var statusAll = [];
  try {
    var sRes = await fetch(
      SUPABASE_URL + '/rest/v1/employee_status?select=employee_id,tipo,fecha_inicio,fecha_fin',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    if (sRes.ok) statusAll = await sRes.json();
  } catch(e){}

  var noDisp = {};
  (statusAll || []).forEach(function(s) {
    if (s.tipo !== 'activo' && (!s.fecha_fin || s.fecha_fin >= hoy)) {
      noDisp[s.employee_id] = s.tipo;
    }
  });

  var empActivos = allEmployees.filter(function(e) {
    return e.estado === 'Activo'
      && validAreas.indexOf(_dashCanonicalDept(e.area)) >= 0
      && !noDisp[e.id];
  });
  var empNoDisp = allEmployees.filter(function(e) {
    return e.estado === 'Activo'
      && validAreas.indexOf(_dashCanonicalDept(e.area)) >= 0
      && noDisp[e.id];
  });

  // ── 2. Ocupación y eventos desde último informe publicado ──────────
  var ocupacion = null, eventos = '';
  if (typeof infGetUltimoPublicado === 'function') {
    try {
      var informe = await infGetUltimoPublicado(dept);
      if (informe && informe.contenido_json) {
        ocupacion = informe.contenido_json.ocupacion_semana_siguiente;
        eventos   = informe.contenido_json.eventos_semana_siguiente || '';
      }
    } catch(e){}
  }

  // ── 3. Semana próxima: lunes → domingo ────────────────────────────
  var lunesProx = _nextMonday(hoy);
  var diasSemana = [];
  for (var d = 0; d < 7; d++) {
    var fd = new Date(lunesProx);
    fd.setDate(fd.getDate() + d);
    diasSemana.push(fd.getFullYear() + '-' + String(fd.getMonth()+1).padStart(2,'0') + '-' + String(fd.getDate()).padStart(2,'0'));
  }
  var DIAS_LABEL = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  // ── 4. Histórico: cuántos turnos suelen hacer en cada día/turno ───
  var allShifts = [];
  try { allShifts = await getDB('shifts'); } catch(e){}
  // Últimas 3 semanas del mismo día de semana
  var hist = {}; // { 'Lun-M': count }
  var hace21 = new Date(lunesProx); hace21.setDate(hace21.getDate() - 21);
  var hace21str = hace21.getFullYear()+'-'+String(hace21.getMonth()+1).padStart(2,'0')+'-'+String(hace21.getDate()).padStart(2,'0');
  allShifts.filter(function(s){
    return s.fecha >= hace21str && s.fecha < lunesProx
      && validAreas.indexOf(_dashCanonicalDept(s.area)) >= 0;
  }).forEach(function(s){
    var dow = new Date(s.fecha + 'T00:00:00').getDay(); // 0=dom
    var dowIdx = dow === 0 ? 6 : dow - 1; // 0=lun
    var turno = _infTurnoFromServicio(s.servicio || '');
    var key = DIAS_LABEL[dowIdx] + '-' + turno;
    hist[key] = (hist[key] || 0) + 1;
  });

  // ── 5. Propuesta: asignar empleados a turnos ───────────────────────
  // Lógica simple: turnos rotativos por empleado activo, respetando descanso 2 días
  // Se asigna de forma equitativa — no personalizado (eso requiere restricciones por empleado)
  var nEmp = empActivos.length;
  var propuesta = {}; // { fecha: { turno: [nombres] } }

  if (nEmp > 0) {
    diasSemana.forEach(function(fecha, di) {
      propuesta[fecha] = {};
      var dowIdx = di;
      turnosDept.forEach(function(turno) {
        var key = DIAS_LABEL[dowIdx] + '-' + turno;
        var histCount = hist[key] || 0;
        // Nº sugerido: media histórica redondeada, mínimo _PREV_MIN_EMP
        var nSug = Math.max(_PREV_MIN_EMP[turno] || 1, Math.round(histCount / 3));
        // Ajustar por ocupación si disponible (>80% → +1 si hay margen)
        if (ocupacion != null && ocupacion >= 80 && nEmp > nSug) nSug = Math.min(nSug + 1, nEmp);
        // Asignar: rotar empActivos según índice día+turno
        var offset = (di * turnosDept.length + turnosDept.indexOf(turno)) % nEmp;
        var asignados = [];
        for (var k = 0; k < nSug && k < nEmp; k++) {
          asignados.push(empActivos[(offset + k) % nEmp].nombre);
        }
        propuesta[fecha][turno] = asignados;
      });
    });
  }

  // ── 6. Guardar cuadrante ──────────────────────────────────────────
  var semanaISO = _isoWeek(lunesProx);

  window._dashGuardarCuadrante = async function() {
    try {
      var sid = 'cua_' + Date.now();
      var res = await fetch(SUPABASE_URL + '/rest/v1/cuadrantes', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
                   'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          id: sid, ts: localTs(),
          autor: currentUser.nombre || currentUser.id,
          departamento: dept, semana: semanaISO,
          propuesta_json: propuesta, estado: 'aprobado'
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      invalidateCache('cuadrantes');
      toast('Cuadrante guardado ✓', 'ok');
    } catch(e) { toast('Error al guardar cuadrante: ' + e.message, 'err'); }
  };

  // ── 7. Render ─────────────────────────────────────────────────────
  // Badges no disponibles
  var noDispBadges = empNoDisp.map(function(e) {
    var tipo = noDisp[e.id];
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:'
      + (tipo==='baja_medica'?'rgba(239,68,68,.1)':'rgba(16,185,129,.1)')
      + ';border:1px solid '+(tipo==='baja_medica'?'var(--red)':'var(--green)')
      + ';border-radius:5px;padding:4px 10px;font-size:11px;font-family:var(--font-mono);margin:3px;">'
      + (tipo==='baja_medica'?'🏥':'🌴')+' '+_escHtml(e.nombre)
      + '</span>';
  }).join('');

  // Cabeceras días
  var thDias = diasSemana.map(function(f, i) {
    var dow = new Date(f+'T00:00:00').getDay();
    var esFinde = dow === 0 || dow === 6;
    return '<th style="text-align:center;padding:8px 6px;font-family:var(--font-mono);font-size:10px;'
      + 'text-transform:uppercase;letter-spacing:.08em;color:'+(esFinde?'var(--amber)':'var(--text3)')+';">'
      + DIAS_LABEL[i]+'<br><span style="font-weight:400;font-size:9px;">'+f.slice(8)+'/'+f.slice(5,7)+'</span>'
      + '</th>';
  }).join('');

  // Filas por turno
  var filasTurno = turnosDept.map(function(turno) {
    var celdas = diasSemana.map(function(fecha) {
      var asig = propuesta[fecha] ? (propuesta[fecha][turno] || []) : [];
      return '<td style="padding:6px 4px;text-align:center;vertical-align:top;border-right:1px solid var(--border);">'
        + asig.map(function(n) {
            return '<div style="font-size:10px;background:var(--bg3);border-radius:4px;padding:2px 6px;margin:2px auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;" title="'+_escHtml(n)+'">'+_escHtml(n.split(' ')[0])+'</div>';
          }).join('')
        + (asig.length === 0 ? '<div style="font-size:10px;color:var(--text3);">—</div>' : '')
        + '</td>';
    }).join('');
    var turnoLabel = {M:'🌅 Mañana',T:'🌆 Tarde',C:'🌙 Cierre',N:'🌃 Noche'}[turno]||turno;
    return '<tr style="border-bottom:1px solid var(--border);">'
      +'<td style="padding:8px 12px;font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text2);white-space:nowrap;border-right:2px solid var(--border2);">'+turnoLabel+'</td>'
      +celdas+'</tr>';
  }).join('');

  var ocupBadge = ocupacion != null
    ? '<span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);">Ocupación prevista: <strong>'+ocupacion+'%</strong></span>'
    : '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text3);">Ocupación: no informada</span>';

  el.innerHTML = ''
    // Cabecera y inputs
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);">Semana '+semanaISO+' · '+lunesProx.slice(8)+'/'+lunesProx.slice(5,7)+'</div>'
    +     '<div style="margin-top:4px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">'
    +       ocupBadge
    +       (eventos?'<span style="font-size:11px;color:var(--text3);">📌 '+_escHtml(eventos)+'</span>':'')
    +     '</div>'
    +   '</div>'
    +   (nEmp>0?'<button onclick="window._dashGuardarCuadrante()" style="background:var(--accent);border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:700;padding:8px 16px;cursor:pointer;font-family:var(--font-mono);">💾 Guardar cuadrante</button>':'')
    + '</div>'

    // Disponibilidad
    + '<div style="margin-bottom:12px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:7px;">'
    +   '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px;">Equipo disponible ('+nEmp+' / '+(nEmp+empNoDisp.length)+')</div>'
    +   (empNoDisp.length?'<div style="margin-bottom:6px;font-size:11px;color:var(--text3);">No disponibles:</div>'+noDispBadges:'')
    +   '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">'
    +     empActivos.map(function(e){
            return '<span style="background:var(--bg2);border:1px solid var(--border);border-radius:5px;padding:3px 9px;font-size:11px;font-family:var(--font-mono);">'+_escHtml(e.nombre.split(' ')[0])+'</span>';
          }).join('')
    +   '</div>'
    + '</div>'

    // Cuadrante
    + (nEmp > 0
      ? '<div style="overflow-x:auto;">'
        + '<table style="width:100%;border-collapse:collapse;min-width:500px;">'
        + '<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
        + '<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);border-right:2px solid var(--border2);">Turno</th>'
        + thDias
        + '</tr></thead>'
        + '<tbody>'+filasTurno+'</tbody>'
        + '</table></div>'
        + '<div style="margin-top:10px;padding:8px 12px;background:var(--bg2);border-radius:5px;font-size:10px;color:var(--text3);font-family:var(--font-mono);">'
        + '📐 Propuesta generada desde histórico 3 semanas + ocupación declarada en informe de jefe · Solo visible para el jefe · Los nombres son el primer nombre del empleado'
        + '</div>'
      : '<div class="card" style="text-align:center;padding:32px;">'
        + '<div style="font-size:28px;margin-bottom:8px;">⚠</div>'
        + '<div style="color:var(--red);font-weight:700;">Sin empleados disponibles para programar</div>'
        + '<div style="color:var(--text3);font-size:12px;margin-top:6px;">Todos los empleados del departamento están de baja o vacaciones.</div>'
        + '</div>'
      );
}
window.renderDashPrevision = renderDashPrevision;

// ── Helpers fecha C5 ─────────────────────────────────────────────────
function _nextMonday(fechaStr) {
  var d = new Date(fechaStr + 'T00:00:00');
  var dow = d.getDay(); // 0=dom, 1=lun
  var diff = dow === 0 ? 1 : (8 - dow);
  d.setDate(d.getDate() + diff);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _isoWeek(fechaStr) {
  var d = new Date(fechaStr + 'T00:00:00');
  var jan4 = new Date(d.getFullYear(), 0, 4);
  var w = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + String(w).padStart(2,'0');
}
// Mapea servicio/turno de shifts al tipo M/T/C/N
function _infTurnoFromServicio(servicio) {
  var s = (servicio || '').toLowerCase();
  if (s.indexOf('mañana') >= 0 || s.indexOf('manana') >= 0 || s === 'm') return 'M';
  if (s.indexOf('noche') >= 0 || s === 'n') return 'N';
  if (s.indexOf('cierre') >= 0 || s === 'c') return 'C';
  if (s.indexOf('tarde') >= 0 || s === 't') return 'T';
  return 'T'; // default
}
function _escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
