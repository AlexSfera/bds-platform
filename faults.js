// ═══════════════════════════════════════════════════════════════════════
// FAULTS — módulo dedicado · SYNCRO HUB · MVP Piloto Restaurante
// Sistema de registro de fallos individuales con afectación a incentivos
//
// Depende de (shared.js, cargado antes):
//   - getDB, dbInsert, dbUpdate, invalidateCache, auditLog, toast
//   - genId, today, localTs, formatDisplayValue, deptBadge
//   - currentUser, isAdmin, isSupervisor, closeModal
// ═══════════════════════════════════════════════════════════════════════

// ── NIVELES DE AFECTACIÓN (fijos por política, NO editar sin Dirección) ─
var FAULT_LEVELS = {
  L0: { code:'L0', name:'No afecta incentivo',         points:0,   color:'#9ca3af', msg:'Registro de control interno. No suma puntos.' },
  L1: { code:'L1', name:'Afecta leve',                 points:1,   color:'#fbbf24', msg:'Suma 1 punto. Incumplimiento menor sin impacto económico.' },
  L2: { code:'L2', name:'Afecta parcialmente',         points:3,   color:'#f59e0b', msg:'Suma 3 puntos. Afecta operación, ventas, caja o control interno.' },
  L3: { code:'L3', name:'Afecta gravemente',           points:5,   color:'#ef4444', msg:'Suma 5 puntos. Afecta cliente, dinero, reputación o reincidencia.' },
  L4: { code:'L4', name:'Afecta totalmente',           points:15,  color:'#dc2626', msg:'Suma 15 puntos. Pérdida del incentivo mensual. Requiere validación Dirección/RRHH.' },
  L5: { code:'L5', name:'Bloqueo inmediato incentivo', points:999, color:'#000000', msg:'Bloqueo directo del incentivo. Fraude / robo / manipulación / agresión.' }
};

var FAULT_STATUS = {
  REGISTRADO: 'Registrado',
  VALIDADO:   'Validado',
  RECHAZADO:  'Rechazado',
  DISPUTADO:  'Disputado',
  CERRADO:    'Cerrado'
};

// ── Permisos ──────────────────────────────────────────────────────────
function canCreateFault(u){
  if(!u) return false;
  if(isAdmin(u)) return true;
  if(typeof isSupervisor === 'function' && isSupervisor(u)) return true;
  return false;
}
function canValidateFault(u){
  if(!u) return false;
  if(isAdmin(u)) return true;
  if(['fb','jefe_recepcion','chef','supervisor'].indexOf(u.rol) >= 0) return true;
  return false;
}
function canValidateCritical(u){
  // L4 / L5 solo admin/fb (Dirección/RRHH)
  return !!u && (u.rol === 'admin' || u.rol === 'fb');
}

// ── BADGES ────────────────────────────────────────────────────────────
function bFaultStatus(st){
  if(st === FAULT_STATUS.VALIDADO)  return '<span class="badge b-green">Validado</span>';
  if(st === FAULT_STATUS.CERRADO)   return '<span class="badge b-green">Cerrado</span>';
  if(st === FAULT_STATUS.RECHAZADO) return '<span class="badge b-gray">Rechazado</span>';
  if(st === FAULT_STATUS.DISPUTADO) return '<span class="badge b-yellow">Disputado</span>';
  return '<span class="badge b-red">Registrado</span>';
}
function bFaultLevel(lvlCode){
  var L = FAULT_LEVELS[lvlCode] || FAULT_LEVELS.L0;
  return '<span class="badge" style="background:'+L.color+'22;color:'+L.color+';border:1px solid '+L.color+'66;">'
       + L.name + ' · ' + L.points + 'p</span>';
}

// ── Helpers ───────────────────────────────────────────────────────────
function _faultMonth(d){
  var s = d || today();
  return s.slice(0,7); // YYYY-MM
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER PANTALLA "FAULTS"
// ═══════════════════════════════════════════════════════════════════════
async function renderFaultsScreen(){
  var el = document.getElementById('screen-faults');
  if(!el) return;
  if(!canCreateFault(currentUser) && !canValidateFault(currentUser)){
    el.innerHTML = '<div class="page-header"><div class="page-title">🚫 Faults</div>'
      + '<div class="page-sub">Sin permisos. Contacta con tu responsable.</div></div>';
    return;
  }

  var all = [];
  try { all = await getDB('employee_faults'); } catch(e){ all = []; }

  // Filtros del estado de pantalla (persistidos en memoria simple)
  var fMonth  = (document.getElementById('flt-month')  || {}).value || _faultMonth();
  var fStatus = (document.getElementById('flt-status') || {}).value || '';
  var fDept   = (document.getElementById('flt-dept')   || {}).value || (isAdmin(currentUser) ? '' : (currentUser.area||''));

  var list = all.filter(function(f){
    if(fMonth  && f.incentive_month !== fMonth) return false;
    if(fStatus && f.status !== fStatus) return false;
    if(fDept   && f.departamento !== fDept) return false;
    return true;
  });
  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  // KPIs del mes filtrado
  var validados = list.filter(function(f){ return f.status === FAULT_STATUS.VALIDADO || f.status === FAULT_STATUS.CERRADO; });
  var pendientes = list.filter(function(f){ return f.status === FAULT_STATUS.REGISTRADO; });
  var puntosTotales = validados.reduce(function(s,f){ return s + (parseFloat(f.applied_points)||0); }, 0);
  var disputados = list.filter(function(f){ return f.status === FAULT_STATUS.DISPUTADO; });

  el.innerHTML =
    '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">'
    + '<div><div class="page-title">⚖ Faults · Incidencias de proceso</div>'
    + '<div class="page-sub">Registro de incumplimientos individuales · MVP Piloto Restaurante</div></div>'
    + (canCreateFault(currentUser) ? '<button class="btn btn-primary" onclick="openNewFaultModal()">+ Registrar fault</button>' : '')
    + '</div>'

    // Filtros
    + '<div class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;">'
    +   '<div class="fg" style="margin:0;"><label>Mes</label><input type="month" id="flt-month" value="'+fMonth+'" onchange="renderFaultsScreen()"></div>'
    +   '<div class="fg" style="margin:0;"><label>Estado</label><select id="flt-status" onchange="renderFaultsScreen()">'
    +     '<option value="">Todos</option>'
    +     '<option value="Registrado" '+(fStatus==='Registrado'?'selected':'')+'>Registrado</option>'
    +     '<option value="Validado"   '+(fStatus==='Validado'  ?'selected':'')+'>Validado</option>'
    +     '<option value="Disputado"  '+(fStatus==='Disputado' ?'selected':'')+'>Disputado</option>'
    +     '<option value="Rechazado"  '+(fStatus==='Rechazado' ?'selected':'')+'>Rechazado</option>'
    +     '<option value="Cerrado"    '+(fStatus==='Cerrado'   ?'selected':'')+'>Cerrado</option>'
    +   '</select></div>'
    + (isAdmin(currentUser)
      ? '<div class="fg" style="margin:0;"><label>Departamento</label><select id="flt-dept" onchange="renderFaultsScreen()">'
        + '<option value="">Todos</option>'
        + ['Sala','Cocina','Recepción','Housekeeping','Mantenimiento'].map(function(d){
            return '<option value="'+d+'" '+(fDept===d?'selected':'')+'>'+d+'</option>';
          }).join('')
        + '</select></div>'
      : '')
    + '</div>'

    // KPIs
    + '<div class="kpi-grid" style="margin-bottom:14px;">'
    +   '<div class="kpi k-red"><div class="kpi-lbl">Pendientes validar</div><div class="kpi-val">'+pendientes.length+'</div></div>'
    +   '<div class="kpi k-green"><div class="kpi-lbl">Validadas</div><div class="kpi-val">'+validados.length+'</div></div>'
    +   '<div class="kpi k-amber"><div class="kpi-lbl">Puntos totales (mes)</div><div class="kpi-val">'+puntosTotales+'</div></div>'
    +   '<div class="kpi k-blue"><div class="kpi-lbl">Disputadas</div><div class="kpi-val">'+disputados.length+'</div></div>'
    + '</div>'

    // Tabla
    + _renderFaultsTable(list);
}
window.renderFaultsScreen = renderFaultsScreen;

function _renderFaultsTable(list){
  if(!list.length){
    return '<div class="empty"><div class="empty-icon">⚖</div><div class="empty-text">Sin faults en el periodo seleccionado</div></div>';
  }
  var canVal = canValidateFault(currentUser);
  return '<div style="overflow-x:auto"><table>'
    + '<tr><th>Fecha</th><th>Empleado</th><th>Dept</th><th>Fallo</th><th>Nivel · Puntos</th><th>Impacto</th><th>Estado</th><th>Acción</th></tr>'
    + list.map(function(f){
        var acciones = '<button class="btn btn-secondary btn-sm" onclick="openFaultDetail(\''+f.id+'\')">Ver</button>';
        if(canVal && f.status === FAULT_STATUS.REGISTRADO){
          acciones += ' <button class="btn btn-primary btn-sm" onclick="openFaultValidate(\''+f.id+'\')">Validar</button>';
        }
        if(isAdmin(currentUser)){
          acciones += ' <button class="btn btn-danger btn-sm" onclick="deleteFault(\''+f.id+'\')">🗑</button>';
        }
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px">'+formatDisplayValue(f.fecha)+'</td>'
          + '<td style="font-size:12px"><strong>'+formatDisplayValue(f.employee_name)+'</strong></td>'
          + '<td>'+deptBadge(f.departamento)+'</td>'
          + '<td style="font-size:12px;max-width:240px">'+formatDisplayValue(f.fault_name)+'</td>'
          + '<td>'+bFaultLevel(f.level_code)+'</td>'
          + '<td style="font-size:11px;color:var(--text3)">'+formatDisplayValue(f.impact_area)+'</td>'
          + '<td>'+bFaultStatus(f.status)+'</td>'
          + '<td style="white-space:nowrap">'+acciones+'</td>'
          + '</tr>';
      }).join('')
    + '</table></div>';
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL: REGISTRAR NUEVA FAULT
// ═══════════════════════════════════════════════════════════════════════
async function openNewFaultModal(){
  if(!canCreateFault(currentUser)){ toast('Sin permisos','err'); return; }

  var ov = document.getElementById('modal-new-fault');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-new-fault';
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal" style="max-width:640px;">'
      + '<div class="modal-h"><h3>⚖ Registrar fault individual</h3>'
      + '<button class="modal-x" onclick="closeModal(\'modal-new-fault\')">✕</button></div>'
      + '<div class="modal-b" id="nf-body">Cargando...</div>'
      + '<div class="modal-f">'
      + '<button class="btn btn-secondary" onclick="closeModal(\'modal-new-fault\')">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="saveNewFault()" id="nf-save">💾 Guardar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-new-fault'); });
  }

  // Cargar empleados activos + catálogo
  var emps = (await getDB('employees')).filter(function(e){ return e.estado === 'Activo'; });
  var cat  = (await getDB('fault_catalog')).filter(function(c){ return c.activo !== false; });

  // Por defecto Sala (piloto)
  var defaultDept = 'Sala';

  var body = document.getElementById('nf-body');
  body.innerHTML =
    '<div class="fg"><label>Fecha del fallo *</label>'
    + '<input type="date" id="nf-fecha" value="'+today()+'" max="'+today()+'"></div>'

    + '<div class="fg"><label>Departamento *</label>'
    + '<select id="nf-dept" onchange="_onFaultDeptChange()">'
    + ['Sala','Cocina','Recepción','Housekeeping','Mantenimiento'].map(function(d){
        return '<option value="'+d+'" '+(d===defaultDept?'selected':'')+'>'+d+'</option>';
      }).join('')
    + '</select></div>'

    + '<div class="fg"><label>Empleado *</label>'
    + '<select id="nf-emp"><option value="">— Seleccionar —</option>'
    + emps.map(function(e){
        return '<option value="'+e.id+'" data-area="'+(e.area||'')+'" data-nombre="'+e.nombre+'">'+e.nombre+' · '+(e.area||'')+'</option>';
      }).join('')
    + '</select></div>'

    + '<div class="fg"><label>Tipo de fallo *</label>'
    + '<select id="nf-fault" onchange="_onFaultTypeChange()"><option value="">— Seleccionar —</option></select></div>'

    + '<div id="nf-level-info" style="display:none;padding:10px;border-radius:6px;background:var(--bg2);border-left:3px solid var(--amber);margin-bottom:12px;font-size:12px;"></div>'

    + '<div class="fg"><label>Impacto principal *</label>'
    + '<select id="nf-impact">'
    + '<option value="">— Seleccionar —</option>'
    + ['Cliente','Caja','Venta','Equipo','Operación','Reputación','Ninguno'].map(function(i){
        return '<option value="'+i+'">'+i+'</option>';
      }).join('')
    + '</select></div>'

    + '<div class="fg"><label>Descripción de lo ocurrido *</label>'
    + '<textarea id="nf-desc" rows="3" placeholder="¿Qué pasó? Sé concreto."></textarea></div>'

    + '<div class="fg"><label>Evidencia (link / referencia / detalle verificable)</label>'
    + '<textarea id="nf-evidence" rows="2" placeholder="Link foto / ticket / nº ticket / nombre testigo / etc."></textarea>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Obligatorio si el nivel afecta al incentivo (≠ L0)</div></div>'

    + '<div class="fg"><label><input type="checkbox" id="nf-informed" style="margin-right:6px;"> Empleado ha sido informado del fault</label></div>';

  // Guardar catálogo en window para reusar en _onFaultTypeChange
  window._faultCatalogCache = cat;
  _onFaultDeptChange();
}
window.openNewFaultModal = openNewFaultModal;

function _onFaultDeptChange(){
  var dept = (document.getElementById('nf-dept')||{}).value || '';
  var sel  = document.getElementById('nf-fault');
  if(!sel) return;
  var cat = (window._faultCatalogCache || []).filter(function(c){ return c.departamento === dept; });
  sel.innerHTML = '<option value="">— Seleccionar —</option>'
    + cat.map(function(c){
        return '<option value="'+c.id+'">'+c.nombre+'</option>';
      }).join('');
  // Reset info
  var info = document.getElementById('nf-level-info'); if(info) info.style.display='none';
}
window._onFaultDeptChange = _onFaultDeptChange;

function _onFaultTypeChange(){
  var fid = (document.getElementById('nf-fault')||{}).value || '';
  var info = document.getElementById('nf-level-info');
  if(!fid || !info){ if(info) info.style.display='none'; return; }
  var c = (window._faultCatalogCache || []).find(function(x){ return x.id === fid; });
  if(!c){ info.style.display='none'; return; }
  var L = FAULT_LEVELS[c.nivel_default] || FAULT_LEVELS.L0;
  info.style.display = 'block';
  info.style.borderLeftColor = L.color;
  info.innerHTML =
      '<div style="font-weight:700;color:'+L.color+';margin-bottom:4px;">'+L.name+' · '+L.points+' punto'+(L.points===1?'':'s')+'</div>'
    + '<div style="color:var(--text2);">'+L.msg+'</div>'
    + (c.requiere_ev ? '<div style="margin-top:6px;font-size:11px;color:var(--amber);">⚠ Requiere evidencia para validar</div>' : '');
}
window._onFaultTypeChange = _onFaultTypeChange;

async function saveNewFault(){
  var btn = document.getElementById('nf-save');
  if(btn) btn.disabled = true;

  try {
    var fecha    = (document.getElementById('nf-fecha')||{}).value || today();
    var dept     = (document.getElementById('nf-dept')||{}).value || '';
    var empSel   = document.getElementById('nf-emp');
    var empId    = empSel ? empSel.value : '';
    var empName  = empSel && empSel.selectedOptions[0] ? empSel.selectedOptions[0].dataset.nombre : '';
    var faultId  = (document.getElementById('nf-fault')||{}).value || '';
    var impact   = (document.getElementById('nf-impact')||{}).value || '';
    var desc     = ((document.getElementById('nf-desc')||{}).value || '').trim();
    var evidence = ((document.getElementById('nf-evidence')||{}).value || '').trim();
    var informed = !!(document.getElementById('nf-informed')||{}).checked;

    // Validaciones
    if(!empId)   { toast('Empleado obligatorio','err'); return; }
    if(!dept)    { toast('Departamento obligatorio','err'); return; }
    if(!faultId) { toast('Tipo de fallo obligatorio','err'); return; }
    if(!impact)  { toast('Impacto obligatorio','err'); return; }
    if(!desc)    { toast('Descripción obligatoria','err'); return; }

    var cat = (window._faultCatalogCache || []).find(function(x){ return x.id === faultId; });
    if(!cat){ toast('Fallo no encontrado en catálogo','err'); return; }

    var L = FAULT_LEVELS[cat.nivel_default] || FAULT_LEVELS.L0;
    var requiereEv = cat.requiere_ev && L.code !== 'L0';
    if(requiereEv && !evidence){
      toast('Para afectar incentivo debe adjuntar evidencia o descripción verificable','err');
      return;
    }

    var rec = {
      id: genId(),
      employee_id: empId,
      employee_name: empName,
      departamento: dept,
      fault_id: cat.id,
      fault_name: cat.nombre,
      categoria: cat.categoria || '',
      fecha: fecha,
      incentive_month: _faultMonth(fecha),
      level_code: L.code,
      base_points: cat.puntos_default,
      applied_points: cat.puntos_default,   // MVP: sin reincidencia auto. Fase 2 lo recalcula.
      impact_area: impact,
      evidence_text: evidence,
      description: desc,
      created_by: currentUser.nombre,
      status: FAULT_STATUS.REGISTRADO,
      empleado_informado: informed,
      created_at: localTs()
    };

    await dbInsert('employee_faults', rec);
    invalidateCache('employee_faults');
    auditLog('FAULT_CREATE', currentUser.nombre+' → '+empName+' | '+cat.nombre+' ('+L.code+' · '+cat.puntos_default+'p) | '+desc.slice(0,80));
    toast('Fault registrado','ok');
    closeModal('modal-new-fault');
    renderFaultsScreen();

  } catch(e){
    toast('Error: '+e.message,'err');
  } finally {
    if(btn) btn.disabled = false;
  }
}
window.saveNewFault = saveNewFault;

// ═══════════════════════════════════════════════════════════════════════
// MODAL: DETALLE / VALIDACIÓN / CIERRE DE FAULT
// ═══════════════════════════════════════════════════════════════════════
async function openFaultDetail(fid){
  var all = await getDB('employee_faults');
  var f = all.find(function(x){ return x.id === fid; });
  if(!f){ toast('Fault no encontrado','err'); return; }

  var L = FAULT_LEVELS[f.level_code] || FAULT_LEVELS.L0;
  var canVal = canValidateFault(currentUser) && f.status === FAULT_STATUS.REGISTRADO;
  var requireDir = (L.code === 'L4' || L.code === 'L5');
  var canValThis = canVal && (!requireDir || canValidateCritical(currentUser));

  var ov = document.getElementById('modal-fault-detail');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-fault-detail';
    ov.className = 'modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-fault-detail'); });
  }

  var actions = '';
  if(canValThis){
    actions = '<button class="btn btn-success" onclick="validateFault(\''+fid+'\',\'Validado\')">✅ Validar</button>'
      + ' <button class="btn btn-danger"  onclick="validateFault(\''+fid+'\',\'Rechazado\')">✕ Rechazar</button>'
      + ' <button class="btn btn-warn"    onclick="validateFault(\''+fid+'\',\'Disputado\')">⚠ Marcar disputado</button>';
  } else if(canVal && requireDir){
    actions = '<div style="padding:8px;background:var(--bg2);border-radius:6px;color:var(--amber);font-size:12px;">⚠ Este nivel ('+L.name+') requiere validación de Dirección/RRHH (admin o F&B).</div>';
  }
  if(f.status === FAULT_STATUS.VALIDADO && canValidateFault(currentUser)){
    actions += '<button class="btn btn-secondary" onclick="closeFault(\''+fid+'\')">🔒 Cerrar fault (definitivo)</button>';
  }

  ov.innerHTML = '<div class="modal" style="max-width:560px;">'
    + '<div class="modal-h"><h3>⚖ Fault · '+formatDisplayValue(f.fault_name)+'</h3>'
    + '<button class="modal-x" onclick="closeModal(\'modal-fault-detail\')">✕</button></div>'
    + '<div class="modal-b">'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;font-size:12px;">'
    +     '<div><strong>Empleado:</strong><br>'+formatDisplayValue(f.employee_name)+'</div>'
    +     '<div><strong>Dept:</strong><br>'+deptBadge(f.departamento)+'</div>'
    +     '<div><strong>Fecha:</strong><br>'+formatDisplayValue(f.fecha)+'</div>'
    +     '<div><strong>Mes incentivo:</strong><br>'+formatDisplayValue(f.incentive_month)+'</div>'
    +   '</div>'
    +   '<div style="padding:10px;background:var(--bg2);border-radius:6px;border-left:3px solid '+L.color+';margin-bottom:12px;">'
    +     '<div style="font-weight:700;color:'+L.color+';">'+L.name+' · '+f.applied_points+' puntos</div>'
    +     '<div style="font-size:12px;color:var(--text2);margin-top:4px;">'+L.msg+'</div>'
    +   '</div>'
    +   '<div style="margin-bottom:10px;"><strong>Impacto:</strong> '+formatDisplayValue(f.impact_area)+'</div>'
    +   '<div style="margin-bottom:10px;"><strong>Descripción:</strong><br><div style="color:var(--text2);font-size:13px;">'+formatDisplayValue(f.description)+'</div></div>'
    +   '<div style="margin-bottom:10px;"><strong>Evidencia:</strong><br><div style="color:var(--text2);font-size:13px;font-family:var(--font-mono);">'+formatDisplayValue(f.evidence_text || '—')+'</div></div>'
    +   '<div style="margin-bottom:10px;"><strong>Estado:</strong> '+bFaultStatus(f.status)+'</div>'
    +   '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;">'
    +     'Creado por '+formatDisplayValue(f.created_by)+' · '+formatDisplayValue(f.created_at)
    +     (f.validated_by ? '<br>Validado por '+formatDisplayValue(f.validated_by)+' · '+formatDisplayValue(f.validated_at) : '')
    +     '<br>Empleado informado: '+(f.empleado_informado ? '✓ Sí' : '✕ No')
    +   '</div>'
    +   (f.accion_tomada ? '<div style="margin-bottom:10px;"><strong>Acción tomada:</strong><br>'+formatDisplayValue(f.accion_tomada)+'</div>' : '')
    + '</div>'
    + '<div class="modal-f" style="flex-wrap:wrap;gap:8px;">'
    +   actions
    +   '<button class="btn btn-secondary" onclick="closeModal(\'modal-fault-detail\')">Cerrar</button>'
    + '</div></div>';

  ov.classList.add('open');
}
window.openFaultDetail = openFaultDetail;

// Atajo: si llega de la tabla con botón "Validar", abre detalle directamente
function openFaultValidate(fid){ openFaultDetail(fid); }
window.openFaultValidate = openFaultValidate;

async function validateFault(fid, newStatus){
  var all = await getDB('employee_faults');
  var f = all.find(function(x){ return x.id === fid; });
  if(!f){ toast('Fault no encontrado','err'); return; }
  if(!canValidateFault(currentUser)){ toast('Sin permisos','err'); return; }

  var L = FAULT_LEVELS[f.level_code] || FAULT_LEVELS.L0;
  if((L.code === 'L4' || L.code === 'L5') && !canValidateCritical(currentUser) && newStatus === 'Validado'){
    toast('L4/L5 solo Dirección/RRHH','err');
    return;
  }
  if(newStatus === 'Validado' && L.code !== 'L0' && !f.evidence_text){
    toast('No se puede validar sin evidencia','err');
    return;
  }

  var ts = localTs();
  await dbUpdate('employee_faults', fid, {
    status: newStatus,
    validated_by: currentUser.nombre,
    validated_at: ts,
    updated_at: ts
  });
  invalidateCache('employee_faults');
  auditLog('FAULT_'+newStatus.toUpperCase(), currentUser.nombre+' → '+f.employee_name+' | '+f.fault_name+' | '+L.code);
  toast('Estado: '+newStatus,'ok');
  closeModal('modal-fault-detail');
  renderFaultsScreen();
}
window.validateFault = validateFault;

async function closeFault(fid){
  var txt = prompt('Acción tomada al cerrar este fault (obligatorio):');
  if(txt === null) return;
  if(!txt.trim()){ toast('Acción obligatoria','err'); return; }
  var ts = localTs();
  await dbUpdate('employee_faults', fid, {
    status: FAULT_STATUS.CERRADO,
    accion_tomada: txt.trim(),
    updated_at: ts
  });
  invalidateCache('employee_faults');
  auditLog('FAULT_CLOSE', fid+' | '+txt.trim().slice(0,80));
  toast('Fault cerrado','ok');
  closeModal('modal-fault-detail');
  renderFaultsScreen();
}
window.closeFault = closeFault;

async function deleteFault(fid){
  if(!isAdmin(currentUser)){ toast('Solo admin','err'); return; }
  if(!confirm('¿Eliminar este fault? La acción se registra en audit_log.')) return;
  var all = await getDB('employee_faults');
  var f = all.find(function(x){ return x.id === fid; });
  auditLog('FAULT_DELETE', currentUser.nombre+' eliminó fault '+fid+' | '+(f? f.employee_name+' · '+f.fault_name : '?'));
  await dbUpdate('employee_faults', fid, {}); // noop para forzar timestamp, opcional
  // DELETE real
  try {
    await syncroSupabaseFetch((window.SUPABASE_URL||'')+'/rest/v1/employee_faults?id=eq.'+encodeURIComponent(fid), {
      method:'DELETE',
      headers:{ apikey: window.SUPABASE_KEY, Authorization:'Bearer '+window.SUPABASE_KEY }
    });
  } catch(e){}
  invalidateCache('employee_faults');
  toast('Eliminado','ok');
  renderFaultsScreen();
}
window.deleteFault = deleteFault;
