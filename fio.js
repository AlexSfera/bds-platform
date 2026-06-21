// ═══════════════════════════════════════════════════════════════════════
// FIO — Fault Individual Operation · módulo dedicado · SYNCRO HUB · MVP Piloto Restaurante
// Sistema de registro de fallos individuales con afectación a incentivos
//
// Depende de (shared.js, cargado antes):
//   - getDB, dbInsert, dbUpdate, invalidateCache, auditLog, toast
//   - genId, today, localTs, formatDisplayValue, deptBadge
//   - currentUser, isAdmin, isSupervisor, closeModal
// ═══════════════════════════════════════════════════════════════════════

// ── NIVELES DE AFECTACIÓN (fijos por política, NO editar sin Dirección) ─
var FIO_LEVELS = {
  L0: { code:'L0', name:'No afecta incentivo',         points:0,   color:'#9ca3af', msg:'Registro de control interno. No suma puntos.' },
  L1: { code:'L1', name:'Afecta leve',                 points:1,   color:'#fbbf24', msg:'Suma 1 punto. Incumplimiento menor sin impacto económico.' },
  L2: { code:'L2', name:'Afecta parcialmente',         points:1,   color:'#f59e0b', msg:'1ª vez: 1 punto (advertencia). Reincidencia escala: 2ª=3p · 3ª=4.5p · 4ª=6p · 5ª=L4.' },
  L3: { code:'L3', name:'Afecta gravemente',           points:5,   color:'#ef4444', msg:'Suma 5 puntos. Afecta cliente, dinero, reputación o reincidencia.' },
  L4: { code:'L4', name:'Afecta totalmente',           points:15,  color:'#dc2626', msg:'Suma 15 puntos. Pérdida del incentivo mensual. Requiere validación Dirección/RRHH.' },
  L5: { code:'L5', name:'Bloqueo inmediato incentivo', points:999, color:'#000000', msg:'Bloqueo directo del incentivo. Fraude / robo / manipulación / agresión.' }
};

var FIO_STATUS = {
  REGISTRADO: 'Registrado',
  VALIDADO:   'Validado',
  RECHAZADO:  'Rechazado',
  DISPUTADO:  'Disputado',
  CERRADO:    'Cerrado'
};

// ── Permisos ──────────────────────────────────────────────────────────
function canCreateFIO(u){
  if(!u) return false;
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(u)) return true;
  if(typeof isSupervisor === 'function' && isSupervisor(u)) return true;
  return false;
}
function canValidateFIO(u){
  if(!u) return false;
  if(typeof canActAsAdmin === 'function' && canActAsAdmin(u)) return true;
  if(['fb','jefe_recepcion','chef','supervisor'].indexOf(u.rol) >= 0) return true;
  return false;
}
function canValidateCritical(u){
  // L4 / L5 solo admin / adjunto_directivo / fb (Dirección/RRHH)
  return !!u && (u.rol === 'admin' || u.rol === 'adjunto_directivo' || u.rol === 'fb');
}
// Departamentos visibles para el usuario actual (admin = todos)
function _fioViewableDepts(u){
  if(!u) return [];
  if(isAdmin(u) || (typeof canActAsAdmin === 'function' && canActAsAdmin(u))) return [];  // [] = sin filtro = ver todos
  // Reusa SUPERVISOR_DEPT_MAP de shared.js
  if(typeof getSupervisorDepartments === 'function'){
    var arr = getSupervisorDepartments(u);
    if(arr && arr.length && arr[0] !== '*') return arr;
  }
  return u.area ? [u.area] : [];
}
function _fioCanViewDept(u, dept){
  var viewable = _fioViewableDepts(u);
  if(viewable.length === 0) return true;  // admin
  return viewable.map(function(d){return String(d||'').trim().toLowerCase();})
    .indexOf(String(dept||'').trim().toLowerCase()) >= 0;
}

// ── BADGES ────────────────────────────────────────────────────────────
function bFIOStatus(st){
  if(st === FIO_STATUS.VALIDADO)  return '<span class="badge b-green">Validado</span>';
  if(st === FIO_STATUS.CERRADO)   return '<span class="badge b-green">Cerrado</span>';
  if(st === FIO_STATUS.RECHAZADO) return '<span class="badge b-gray">Rechazado</span>';
  if(st === FIO_STATUS.DISPUTADO) return '<span class="badge b-yellow">Disputado</span>';
  return '<span class="badge b-red">Registrado</span>';
}
function bFIOLevel(lvlCode, appliedPts){
  var L = FIO_LEVELS[lvlCode] || FIO_LEVELS.L0;
  // Si llegan puntos reales (applied_points del registro), los mostramos.
  // Si no, los puntos base del nivel.
  var pts = (appliedPts !== undefined && appliedPts !== null && !isNaN(parseFloat(appliedPts)))
            ? parseFloat(appliedPts)
            : L.points;
  return '<span class="badge" style="background:'+L.color+'22;color:'+L.color+';border:1px solid '+L.color+'66;">'
       + L.name + ' · ' + pts + 'p</span>';
}

// ── Helpers ───────────────────────────────────────────────────────────
function _fioMonth(d){
  var s = d || today();
  return s.slice(0,7); // YYYY-MM
}

// Comprime una imagen a JPEG ~82% calidad, máx 1200px lado largo. Devuelve dataURL base64.
function _fioCompressImage(file, maxDim, quality){
  maxDim = maxDim || 1200;
  quality = quality || 0.82;
  return new Promise(function(resolve, reject){
    if(!file){ resolve(null); return; }
    if(!/^image\//.test(file.type)){ reject(new Error('Archivo no es imagen')); return; }
    var reader = new FileReader();
    reader.onerror = function(){ reject(new Error('No se pudo leer el archivo')); };
    reader.onload = function(){
      var img = new Image();
      img.onerror = function(){ reject(new Error('Imagen no válida')); };
      img.onload = function(){
        var w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          var ratio = w > h ? maxDim/w : maxDim/h;
          w = Math.round(w*ratio);
          h = Math.round(h*ratio);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function _onFIOImageChange(input){
  var file = input.files && input.files[0];
  var prev = document.getElementById('nfo-evidence-preview');
  if(!file){ window._fioPendingImage = null; if(prev) prev.innerHTML = ''; return; }
  try {
    var dataUrl = await _fioCompressImage(file, 1200, 0.82);
    window._fioPendingImage = dataUrl;
    var sizeKb = Math.round(dataUrl.length * 0.75 / 1024);
    if(prev){
      prev.innerHTML =
          '<div style="margin-top:6px;padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border);">'
        +   '<img src="'+dataUrl+'" style="max-width:100%;max-height:180px;border-radius:4px;display:block;margin:auto;"/>'
        +   '<div style="font-size:11px;color:var(--text3);text-align:center;margin-top:6px;">'+sizeKb+' KB · listo para subir</div>'
        +   '<button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%;" onclick="_clearFIOImage()">✕ Quitar foto</button>'
        + '</div>';
    }
  } catch(e){
    toast('Error con la imagen: '+e.message,'err');
    input.value='';
  }
}
window._onFIOImageChange = _onFIOImageChange;

function _clearFIOImage(){
  window._fioPendingImage = null;
  var inp = document.getElementById('nfo-evidence-img'); if(inp) inp.value='';
  var prev = document.getElementById('nfo-evidence-preview'); if(prev) prev.innerHTML='';
}
window._clearFIOImage = _clearFIOImage;

// ═══════════════════════════════════════════════════════════════════════
// RENDER PANTALLA "FAULTS"
// ═══════════════════════════════════════════════════════════════════════
async function renderFIOScreen(){
  var el = document.getElementById('screen-fio');
  if(!el) return;
  if(!canCreateFIO(currentUser) && !canValidateFIO(currentUser)){
    el.innerHTML = '<div class="page-header"><div class="page-title">🚫 FIO</div>'
      + '<div class="page-sub">Sin permisos. Contacta con tu responsable.</div></div>';
    return;
  }

  var all = [];
  try { all = await getDB('fio'); } catch(e){ all = []; }

  // Permisos por departamento (obligatorio para no-admin)
  var viewable = _fioViewableDepts(currentUser);  // [] = admin = ver todos
  if(viewable.length > 0){
    var viewableLower = viewable.map(function(d){return String(d||'').trim().toLowerCase();});
    all = all.filter(function(f){
      return viewableLower.indexOf(String(f.departamento||'').trim().toLowerCase()) >= 0;
    });
  }

  // Filtros del estado de pantalla (persistidos en memoria simple)
  var fMonth  = (document.getElementById('flt-month')  || {}).value || _fioMonth();
  var fStatus = (document.getElementById('flt-status') || {}).value || '';
  var fDept   = (document.getElementById('flt-dept')   || {}).value || '';
  var fEmp    = (document.getElementById('flt-emp')    || {}).value || '';

  // Catálogo de empleados visibles (para selector)
  var empOptions = [];
  try {
    var allEmps = (await getDB('employees')).filter(function(e){ return e.estado === 'Activo'; });
    if(viewable.length > 0){
      var vLow = viewable.map(function(d){return String(d||'').trim().toLowerCase();});
      allEmps = allEmps.filter(function(e){ return vLow.indexOf(String(e.area||'').trim().toLowerCase()) >= 0; });
    }
    empOptions = allEmps;
  } catch(e){}

  // Si hay filtro de departamento activo, restringir lista de empleados a ese dept
  if(fDept){
    var fDeptLow = fDept.toLowerCase().trim();
    empOptions = empOptions.filter(function(e){
      var a = String(e.area||'').toLowerCase().trim();
      return a === fDeptLow
          || (fDeptLow === 'recepción' && (a === 'recepción sfera' || a === 'recepcion sfera'))
          || (fDeptLow === 'cocina' && a === 'friegue')
          || (fDeptLow === 'syncrolab' && (a === 'recepción syncrolab' || a === 'recepcion syncrolab'));
    });
    // Si el empleado seleccionado ya no está en la lista, limpiar fEmp
    if(fEmp && !empOptions.some(function(e){ return e.id === fEmp; })){
      fEmp = '';
    }
  }

  var list = all.filter(function(f){
    if(fMonth  && f.incentive_month !== fMonth) return false;
    if(fStatus && f.status !== fStatus) return false;
    if(fDept   && f.departamento !== fDept) return false;
    if(fEmp    && f.employee_id !== fEmp) return false;
    return true;
  });
  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  // KPIs del mes filtrado
  var validados = list.filter(function(f){ return f.status === FIO_STATUS.VALIDADO || f.status === FIO_STATUS.CERRADO; });
  var pendientes = list.filter(function(f){ return f.status === FIO_STATUS.REGISTRADO; });
  var puntosTotales = validados.reduce(function(s,f){ return s + (parseFloat(f.applied_points)||0); }, 0);
  var disputados = list.filter(function(f){ return f.status === FIO_STATUS.DISPUTADO; });

  el.innerHTML =
    '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">'
    + '<div><div class="page-title">⚖ FIO · Fault Individual Operation</div>'
    + '<div class="page-sub">Registro de incumplimientos individuales que afectan al incentivo · MVP Piloto Restaurante</div></div>'
    + (canCreateFIO(currentUser) ? '<button class="btn btn-primary" onclick="openNewFIOModal()">+ Registrar FIO</button>' : '')
    + '</div>'

    // Filtros
    + '<div class="card" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;">'
    +   '<div class="fg" style="margin:0;min-width:160px;"><label>Mes</label>'
    +     '<input type="month" id="flt-month" value="'+fMonth+'" onchange="renderFIOScreen()" '
    +       'style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;padding:7px 10px;font-family:var(--font-mono);color-scheme:dark;"></div>'
    +   '<div class="fg" style="margin:0;"><label>Estado</label><select id="flt-status" onchange="renderFIOScreen()">'
    +     '<option value="">Todos</option>'
    +     '<option value="Registrado" '+(fStatus==='Registrado'?'selected':'')+'>Registrado</option>'
    +     '<option value="Validado"   '+(fStatus==='Validado'  ?'selected':'')+'>Validado</option>'
    +     '<option value="Disputado"  '+(fStatus==='Disputado' ?'selected':'')+'>Disputado</option>'
    +     '<option value="Rechazado"  '+(fStatus==='Rechazado' ?'selected':'')+'>Rechazado</option>'
    +     '<option value="Cerrado"    '+(fStatus==='Cerrado'   ?'selected':'')+'>Cerrado</option>'
    +   '</select></div>'
    + (function(){
        var deptOpts = isAdmin(currentUser)
          ? ['Sala','Cocina','Friegue','Recepción','Recepción SFERA','Housekeeping','Mantenimiento','SYNCROLAB']
          : _fioViewableDepts(currentUser);
        if(deptOpts.length <= 1) return ''; // sin selector si solo 1 dept
        return '<div class="fg" style="margin:0;"><label>Departamento</label><select id="flt-dept" onchange="renderFIOScreen()">'
          + '<option value="">Todos</option>'
          + deptOpts.map(function(d){
              return '<option value="'+d+'" '+(fDept===d?'selected':'')+'>'+d+'</option>';
            }).join('')
          + '</select></div>';
      })()
    + '<div class="fg" style="margin:0;min-width:200px;"><label>Empleado</label><select id="flt-emp" onchange="renderFIOScreen()">'
    +   '<option value="">Todos</option>'
    +   empOptions.map(function(e){
          return '<option value="'+e.id+'" '+(fEmp===e.id?'selected':'')+'>'+e.nombre+(e.area?' · '+e.area:'')+'</option>';
        }).join('')
    + '</select></div>'
    + '</div>'

    // KPIs
    + '<div class="kpi-grid" style="margin-bottom:14px;">'
    +   '<div class="kpi k-red"><div class="kpi-lbl">Pendientes validar</div><div class="kpi-val">'+pendientes.length+'</div></div>'
    +   '<div class="kpi k-green"><div class="kpi-lbl">Validadas</div><div class="kpi-val">'+validados.length+'</div></div>'
    +   '<div class="kpi k-amber"><div class="kpi-lbl">Puntos totales (mes)</div><div class="kpi-val">'+puntosTotales+'</div></div>'
    +   '<div class="kpi k-blue"><div class="kpi-lbl">Disputadas</div><div class="kpi-val">'+disputados.length+'</div></div>'
    + '</div>'

    // Tabla
    + _renderFIOTable(list);
}
window.renderFIOScreen = renderFIOScreen;

function _renderFIOTable(list){
  if(!list.length){
    return '<div class="empty"><div class="empty-icon">⚖</div><div class="empty-text">Sin FIO en el periodo seleccionado</div></div>';
  }
  var canVal = canValidateFIO(currentUser);
  return '<div style="overflow-x:auto"><table>'
    + '<tr><th>Fecha</th><th>Empleado</th><th>Dept</th><th>Fallo</th><th>Nivel · Puntos</th><th>Impacto</th><th>Estado</th><th>Acción</th></tr>'
    + list.map(function(f){
        var acciones = '<button class="btn btn-secondary btn-sm" onclick="openFIODetail(\''+f.id+'\')">Ver</button>';
        if(canVal && f.status === FIO_STATUS.REGISTRADO){
          acciones += ' <button class="btn btn-primary btn-sm" onclick="openFIOValidate(\''+f.id+'\')">Validar</button>';
        }
        if(isAdmin(currentUser)){
          acciones += ' <button class="btn btn-danger btn-sm" onclick="deleteFIO(\''+f.id+'\')">🗑</button>';
        }
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px">'+formatDisplayValue(f.fecha)+'</td>'
          + '<td style="font-size:12px"><strong>'+formatDisplayValue(f.employee_name)+'</strong></td>'
          + '<td>'+deptBadge(f.departamento)+'</td>'
          + '<td style="font-size:12px;max-width:240px">'+formatDisplayValue(f.fault_name)+'</td>'
          + '<td>'+bFIOLevel(f.level_code, f.applied_points)+'</td>'
          + '<td style="font-size:11px;color:var(--text3)">'+formatDisplayValue(f.impact_area)+'</td>'
          + '<td>'+bFIOStatus(f.status)+'</td>'
          + '<td style="white-space:nowrap">'+acciones+'</td>'
          + '</tr>';
      }).join('')
    + '</table></div>';
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL: REGISTRAR NUEVA FIO
//   opts opcional: {shiftId, departamento, empleadoId, empleadoNombre, fecha}
//   Permite preseleccionar campos al abrir desde modal de validación de turno
// ═══════════════════════════════════════════════════════════════════════
async function openNewFIOModal(opts){
  if(!canCreateFIO(currentUser)){ toast('Sin permisos','err'); return; }
  opts = opts || {};
  window._fioPreset = {
    shiftId: opts.shiftId || '',
    departamento: opts.departamento || '',
    empleadoId: opts.empleadoId || '',
    empleadoNombre: opts.empleadoNombre || '',
    fecha: opts.fecha || today()
  };
  window._fioPendingImage = null;

  var ov = document.getElementById('modal-new-fio');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-new-fio';
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal" style="max-width:640px;">'
      + '<div class="modal-h"><h3>⚖ Registrar FIO individual</h3>'
      + '<button class="modal-x" onclick="closeModal(\'modal-new-fio\')">✕</button></div>'
      + '<div class="modal-b" id="nfo-body">Cargando...</div>'
      + '<div class="modal-f">'
      + '<button class="btn btn-secondary" onclick="closeModal(\'modal-new-fio\')">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="saveNewFIO()" id="nfo-save">💾 Guardar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-new-fio'); });
  }
  ov.classList.add('open');

  // Cargar empleados activos + catálogo
  var emps = (await getDB('employees')).filter(function(e){ return e.estado === 'Activo'; });
  var cat  = (await getDB('fio_catalog')).filter(function(c){ return c.activo !== false; });
  window._fioAllEmps = emps;  // cache para _onFIODeptChange

  // Determinar departamentos disponibles para este usuario
  var viewable = _fioViewableDepts(currentUser);
  var allDepts = ['Sala','Cocina','Friegue','Recepción','Recepción SFERA','Housekeeping','Mantenimiento','SYNCROLAB'];
  var deptOpts = (viewable.length === 0) ? allDepts : viewable;

  // Default: preset > primer dept disponible
  var defaultDept = window._fioPreset.departamento
    || (deptOpts.indexOf('Sala') >= 0 ? 'Sala' : deptOpts[0]);
  var deptLocked = !!window._fioPreset.shiftId;  // si viene de turno, dept fijo

  var body = document.getElementById('nfo-body');
  body.innerHTML =
    (window._fioPreset.shiftId
      ? '<div style="padding:8px 10px;background:var(--amber-dim,#fef3c7);border-left:3px solid var(--amber);border-radius:4px;margin-bottom:12px;font-size:12px;color:var(--text);">🔗 Vinculado al turno <strong>'+window._fioPreset.shiftId+'</strong></div>'
      : '')

    + '<div class="fg"><label>Fecha del fallo *</label>'
    + '<input type="date" id="nfo-fecha" value="'+window._fioPreset.fecha+'" max="'+today()+'"></div>'

    + '<div class="fg"><label>Departamento *</label>'
    + '<select id="nfo-dept" onchange="_onFIODeptChange()"'+(deptLocked?' disabled':'')+'>'
    + deptOpts.map(function(d){
        return '<option value="'+d+'" '+(d===defaultDept?'selected':'')+'>'+d+'</option>';
      }).join('')
    + '</select></div>'

    + '<div class="fg"><label>Empleado *</label>'
    + '<select id="nfo-emp">'
    + '<option value="">— Seleccionar —</option>'
    + emps.map(function(e){
        var sel = (e.id === window._fioPreset.empleadoId) ? ' selected' : '';
        return '<option value="'+e.id+'" data-area="'+(e.area||'')+'" data-nombre="'+e.nombre+'"'+sel+'>'+e.nombre+' · '+(e.area||'')+'</option>';
      }).join('')
    + '</select></div>'

    + '<div class="fg"><label>Tipo de fallo *</label>'
    + '<select id="nfo-fault" onchange="_onFIOTypeChange()"><option value="">— Seleccionar —</option></select></div>'

    + '<div id="nfo-level-info" style="display:none;padding:10px;border-radius:6px;background:var(--bg2);border-left:3px solid var(--amber);margin-bottom:12px;font-size:12px;"></div>'

    + '<div class="fg"><label>Impacto principal *</label>'
    + '<select id="nfo-impact">'
    + '<option value="">— Seleccionar —</option>'
    + ['Cliente','Caja','Venta','Equipo','Operación','Reputación','Ninguno'].map(function(i){
        return '<option value="'+i+'">'+i+'</option>';
      }).join('')
    + '</select></div>'

    + '<div class="fg"><label>Descripción · evidencia · link · referencia *</label>'
    + '<textarea id="nfo-desc" rows="5" placeholder="Describe qué pasó. Incluye evidencia verificable: testigo, nº de ticket, link foto, referencia documental, comentario del cliente, etc."></textarea>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Obligatorio. Para fallos que afectan al incentivo (≠ L0) la descripción debe incluir evidencia verificable.</div></div>'

    + '<div class="fg"><label>📷 Foto evidencia (opcional)</label>'
    + '<input type="file" id="nfo-evidence-img" accept="image/*" capture="environment" onchange="_onFIOImageChange(this)" '
    + 'style="font-size:12px;color:var(--text2);">'
    + '<div id="nfo-evidence-preview"></div>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">La imagen se comprime automáticamente (máx 1200px lado largo).</div></div>'

    + '<div class="fg"><label><input type="checkbox" id="nfo-informed" style="margin-right:6px;"> Empleado ha sido informado del FIO</label></div>';

  // Guardar catálogo en window para reusar en _onFIOTypeChange
  window._fioCatalogCache = cat;
  _onFIODeptChange();
}
window.openNewFIOModal = openNewFIOModal;

function _onFIODeptChange(){
  var dept = (document.getElementById('nfo-dept')||{}).value || '';
  var sel  = document.getElementById('nfo-fault');
  if(!sel) return;
  var cat = (window._fioCatalogCache || []).filter(function(c){ return c.departamento === dept; });
  sel.innerHTML = '<option value="">— Seleccionar —</option>'
    + cat.map(function(c){
        return '<option value="'+c.id+'">'+c.nombre+'</option>';
      }).join('');
  // Filtrar empleados por dept (case-insensitive con tolerancia a variantes Recepción/Recepción SFERA)
  var empSel = document.getElementById('nfo-emp');
  if(empSel && Array.isArray(window._fioAllEmps)){
    var deptLower = dept.toLowerCase().trim();
    var emps = window._fioAllEmps.filter(function(e){
      var a = (e.area || '').toLowerCase().trim();
      return a === deptLower
          || (deptLower === 'recepción' && (a === 'recepción sfera' || a === 'recepcion sfera'))
          || (deptLower === 'cocina' && a === 'friegue')   // chef gestiona Friegue desde Cocina
          || (deptLower === 'syncrolab' && (a === 'syncrolab' || a === 'recepción syncrolab'));
    });
    var prevSel = empSel.value;
    empSel.innerHTML = '<option value="">— Seleccionar —</option>'
      + emps.map(function(e){
          var sel = (e.id === (window._fioPreset||{}).empleadoId) ? ' selected' : '';
          return '<option value="'+e.id+'" data-area="'+(e.area||'')+'" data-nombre="'+e.nombre+'"'+sel+'>'+e.nombre+' · '+(e.area||'')+'</option>';
        }).join('');
    // Restaurar selección si sigue siendo válida
    if(prevSel && emps.some(function(e){return e.id===prevSel;})) empSel.value = prevSel;
  }
  // Reset info
  var info = document.getElementById('nfo-level-info'); if(info) info.style.display='none';
}
window._onFIODeptChange = _onFIODeptChange;

function _onFIOTypeChange(){
  var fid = (document.getElementById('nfo-fault')||{}).value || '';
  var info = document.getElementById('nfo-level-info');
  if(!fid || !info){ if(info) info.style.display='none'; return; }
  var c = (window._fioCatalogCache || []).find(function(x){ return x.id === fid; });
  if(!c){ info.style.display='none'; return; }
  var L = FIO_LEVELS[c.nivel_default] || FIO_LEVELS.L0;
  info.style.display = 'block';
  info.style.borderLeftColor = L.color;
  info.innerHTML =
      '<div style="font-weight:700;color:'+L.color+';margin-bottom:4px;">'+L.name+' · '+L.points+' punto'+(L.points===1?'':'s')+'</div>'
    + '<div style="color:var(--text2);">'+L.msg+'</div>'
    + (c.requiere_ev ? '<div style="margin-top:6px;font-size:11px;color:var(--amber);">⚠ Requiere evidencia para validar</div>' : '');
}
window._onFIOTypeChange = _onFIOTypeChange;

async function saveNewFIO(){
  var btn = document.getElementById('nfo-save');
  if(btn) btn.disabled = true;

  try {
    var fecha    = (document.getElementById('nfo-fecha')||{}).value || today();
    var dept     = (document.getElementById('nfo-dept')||{}).value || '';
    var empSel   = document.getElementById('nfo-emp');
    var empId    = empSel ? empSel.value : '';
    var empName  = empSel && empSel.selectedOptions[0] ? empSel.selectedOptions[0].dataset.nombre : '';
    var faultId  = (document.getElementById('nfo-fault')||{}).value || '';
    var impact   = (document.getElementById('nfo-impact')||{}).value || '';
    var desc     = ((document.getElementById('nfo-desc')||{}).value || '').trim();
    var informed = !!(document.getElementById('nfo-informed')||{}).checked;

    // Validaciones
    if(!empId)   { toast('Empleado obligatorio','err'); return; }
    if(!dept)    { toast('Departamento obligatorio','err'); return; }
    if(!faultId) { toast('Tipo de fallo obligatorio','err'); return; }
    if(!impact)  { toast('Impacto obligatorio','err'); return; }
    if(!desc)    { toast('Descripción obligatoria','err'); return; }

    var cat = (window._fioCatalogCache || []).find(function(x){ return x.id === faultId; });
    if(!cat){ toast('Fallo no encontrado en catálogo','err'); return; }

    var L = FIO_LEVELS[cat.nivel_default] || FIO_LEVELS.L0;
    // Para fallos que afectan al incentivo (≠ L0), exigir descripción mínima razonable
    if(L.code !== 'L0' && desc.length < 15){
      toast('Para FIO que afecta al incentivo, la descripción debe incluir evidencia (mín. 15 caracteres)','err');
      return;
    }

    var rec = {
      id: genId(),
      shift_id: (window._fioPreset && window._fioPreset.shiftId) || null,
      employee_id: empId,
      employee_name: empName,
      departamento: dept,
      fault_id: cat.id,
      fault_name: cat.nombre,
      categoria: cat.categoria || '',
      fecha: fecha,
      incentive_month: _fioMonth(fecha),
      level_code: L.code,
      base_points: cat.puntos_default,
      applied_points: cat.puntos_default,   // se recalcula al validar por reincidencia
      impact_area: impact,
      evidence_text: '',                     // DEPRECATED en Fase 2A: la descripción contiene todo
      evidence_image: window._fioPendingImage || null,
      description: desc,
      created_by: currentUser.nombre,
      status: FIO_STATUS.REGISTRADO,
      empleado_informado: informed,
      created_at: localTs()
    };

    await dbInsert('fio', rec);
    invalidateCache('fio');
    auditLog('FIO_CREATE', currentUser.nombre+' → '+empName+' | '+cat.nombre+' ('+L.code+' · '+cat.puntos_default+'p) | '+desc.slice(0,80));
    toast('FIO registrado','ok');
    window._fioPendingImage = null;
    closeModal('modal-new-fio');
    renderFIOScreen();

  } catch(e){
    toast('Error: '+e.message,'err');
  } finally {
    if(btn) btn.disabled = false;
  }
}
window.saveNewFIO = saveNewFIO;

// ═══════════════════════════════════════════════════════════════════════
// MODAL: DETALLE / VALIDACIÓN / CIERRE DE FAULT
// ═══════════════════════════════════════════════════════════════════════
async function openFIODetail(fid){
  var all = await getDB('fio');
  var f = all.find(function(x){ return x.id === fid; });
  if(!f){ toast('FIO no encontrado','err'); return; }

  var L = FIO_LEVELS[f.level_code] || FIO_LEVELS.L0;
  var canVal = canValidateFIO(currentUser) && f.status === FIO_STATUS.REGISTRADO;
  var requireDir = (L.code === 'L4' || L.code === 'L5');
  var canValThis = canVal && (!requireDir || canValidateCritical(currentUser));

  var ov = document.getElementById('modal-fio-detail');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-fio-detail';
    ov.className = 'modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-fio-detail'); });
  }

  var actions = '';
  if(canValThis){
    actions = '<button class="btn btn-success" onclick="validateFIO(\''+fid+'\',\'Validado\')">✅ Validar</button>'
      + ' <button class="btn btn-danger"  onclick="validateFIO(\''+fid+'\',\'Rechazado\')">✕ Rechazar</button>'
      + ' <button class="btn btn-warn"    onclick="validateFIO(\''+fid+'\',\'Disputado\')">⚠ Marcar disputado</button>';
  } else if(canVal && requireDir){
    actions = '<div style="padding:8px;background:var(--bg2);border-radius:6px;color:var(--amber);font-size:12px;">⚠ Este nivel ('+L.name+') requiere validación de Dirección/RRHH (admin o F&B).</div>';
  }
  if(f.status === FIO_STATUS.VALIDADO && canValidateFIO(currentUser)){
    actions += '<button class="btn btn-secondary" onclick="closeFIO(\''+fid+'\')">🔒 Cerrar FIO (definitivo)</button>';
  }
  // ── Resolución de disputa: solo admin/adjunto_directivo/fb ────────────
  // Disputado penaliza por defecto. El admin tiene la última palabra:
  //   Aceptar disputa → Rechazado (0 pts, no penaliza)
  //   Rechazar disputa → Cerrado (penaliza)
  if(f.status === FIO_STATUS.DISPUTADO && canValidateCritical(currentUser)){
    actions += '<div style="width:100%;padding:8px 10px;background:#fef3c722;border-left:3px solid var(--amber);border-radius:6px;font-size:12px;color:var(--amber);margin-bottom:4px;">⚠ FIO en disputa · Este FIO <strong>sí penaliza</strong> mientras está disputado. Resolución final:</div>'
      + '<button class="btn btn-success" onclick="resolveDisputeFIO(\''+fid+'\',\'aceptar\')">✅ Aceptar disputa (anular penalización)</button>'
      + ' <button class="btn btn-danger" onclick="resolveDisputeFIO(\''+fid+'\',\'rechazar\')">✕ Rechazar disputa (mantener penalización)</button>';
  }

  ov.innerHTML = '<div class="modal" style="max-width:560px;">'
    + '<div class="modal-h"><h3>⚖ FIO · '+formatDisplayValue(f.fault_name)+'</h3>'
    + '<button class="modal-x" onclick="closeModal(\'modal-fio-detail\')">✕</button></div>'
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
    +   (f.evidence_image ? '<div style="margin-bottom:10px;"><strong>📷 Foto:</strong><br><a href="'+f.evidence_image+'" target="_blank" rel="noopener"><img src="'+f.evidence_image+'" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid var(--border);cursor:zoom-in;display:block;margin-top:6px;"/></a></div>' : '')
    +   '<div style="margin-bottom:10px;"><strong>Estado:</strong> '+bFIOStatus(f.status)+'</div>'
    +   '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;">'
    +     'Creado por '+formatDisplayValue(f.created_by)+' · '+formatDisplayValue(f.created_at)
    +     (f.validated_by ? '<br>Validado por '+formatDisplayValue(f.validated_by)+' · '+formatDisplayValue(f.validated_at) : '')
    +     '<br>Empleado informado: '+(f.empleado_informado ? '✓ Sí' : '✕ No')
    +   '</div>'
    +   (f.accion_tomada ? '<div style="margin-bottom:10px;"><strong>Acción tomada:</strong><br>'+formatDisplayValue(f.accion_tomada)+'</div>' : '')
    + '</div>'
    + '<div class="modal-f" style="flex-wrap:wrap;gap:8px;">'
    +   actions
    +   '<button class="btn btn-secondary" onclick="closeModal(\'modal-fio-detail\')">Cerrar</button>'
    + '</div></div>';

  ov.classList.add('open');
}
window.openFIODetail = openFIODetail;

// Atajo: si llega de la tabla con botón "Validar", abre detalle directamente
function openFIOValidate(fid){ openFIODetail(fid); }
window.openFIOValidate = openFIOValidate;

async function validateFIO(fid, newStatus){
  var all = await getDB('fio');
  var f = all.find(function(x){ return x.id === fid; });
  if(!f){ toast('FIO no encontrado','err'); return; }
  if(!canValidateFIO(currentUser)){ toast('Sin permisos','err'); return; }

  var L = FIO_LEVELS[f.level_code] || FIO_LEVELS.L0;
  if((L.code === 'L4' || L.code === 'L5') && !canValidateCritical(currentUser) && newStatus === 'Validado'){
    toast('L4/L5 solo Dirección/RRHH','err');
    return;
  }
  if(newStatus === 'Validado' && L.code !== 'L0'){
    var descLen = (f.description || '').trim().length;
    if(descLen < 15 && !f.evidence_image && !f.evidence_text){
      toast('No se puede validar sin evidencia (descripción con detalle o foto)','err');
      return;
    }
  }

  var ts = localTs();
  var updates = {
    status: newStatus,
    validated_by: currentUser.nombre,
    validated_at: ts,
    updated_at: ts
  };

  // ─── Reincidencia automática (Fase 2A) ─────────────────────────────
  // Al pasar a Validado: contar otros FIO YA validados del mismo empleado, mismo fault_id, mismo mes.
  // L2 (Parcial)        : 1ª=1p · 2ª=3p · 3ª=4.5p · 4ª=6p · 5ª+ → L4 automático (15p)
  // Otros niveles (≠L5) : 1ª=base · 2ª=base×1.5 · 3ª=base×2 · 4ª+ → L4 automático (15p)
  if(newStatus === FIO_STATUS.VALIDADO && L.code !== 'L5'){
    var prev = all.filter(function(x){
      return x.id !== fid
          && x.employee_id === f.employee_id
          && x.fault_id === f.fault_id
          && x.incentive_month === f.incentive_month
          && (x.status === FIO_STATUS.VALIDADO || x.status === FIO_STATUS.CERRADO);
    }).length;
    var base = parseFloat(f.base_points) || 0;
    var newApplied = base;
    var newLevel   = f.level_code;
    var recurLabel = '1ª vez en el mes';
    if(L.code === 'L2'){
      // Escala L2 (faltas leves de proceso)
      if(prev === 0){      newApplied = 1;  recurLabel = '1ª vez · advertencia (1p)'; }
      else if(prev === 1){ newApplied = 3;  recurLabel = '2ª vez · base completo (3p)'; }
      else if(prev === 2){ newApplied = 4.5; recurLabel = '3ª vez · ×1.5 (4.5p)'; }
      else if(prev === 3){ newApplied = 6;  recurLabel = '4ª vez · ×2 (6p)'; }
      else {               newApplied = 15; newLevel = 'L4'; recurLabel = '5ª vez o más → L4 automático (15p)'; }
    } else {
      // Escala estándar L1/L3/L4
      if(prev === 1){      newApplied = base * 1.5; recurLabel = '2ª vez · ×1.5'; }
      else if(prev === 2){ newApplied = base * 2;   recurLabel = '3ª vez · ×2'; }
      else if(prev >= 3){  newApplied = 15; newLevel = 'L4'; recurLabel = '4ª vez o más → L4 automático'; }
    }
    if(newApplied !== parseFloat(f.applied_points) || newLevel !== f.level_code){
      updates.applied_points = newApplied;
      updates.level_code     = newLevel;
      updates.accion_tomada  = (f.accion_tomada ? f.accion_tomada + ' | ' : '') + 'REINCIDENCIA: ' + recurLabel;
    }
  }

  await dbUpdate('fio', fid, updates);
  invalidateCache('fio');
  auditLog('FIO_'+newStatus.toUpperCase(), currentUser.nombre+' → '+f.employee_name+' | '+f.fault_name+' | '+(updates.level_code||L.code)+(updates.applied_points?' · '+updates.applied_points+'p':''));
  toast('Estado: '+newStatus + (updates.applied_points && updates.applied_points!==parseFloat(f.applied_points) ? ' · '+updates.applied_points+'p (reincidencia)' : ''), 'ok');
  closeModal('modal-fio-detail');
  renderFIOScreen();
}
window.validateFIO = validateFIO;

async function closeFIO(fid){
  var txt = prompt('Acción tomada al cerrar este FIO (obligatorio):');
  if(txt === null) return;
  if(!txt.trim()){ toast('Acción obligatoria','err'); return; }
  var ts = localTs();
  await dbUpdate('fio', fid, {
    status: FIO_STATUS.CERRADO,
    accion_tomada: txt.trim(),
    updated_at: ts
  });
  invalidateCache('fio');
  auditLog('FIO_CLOSE', fid+' | '+txt.trim().slice(0,80));
  toast('FIO cerrado','ok');
  closeModal('modal-fio-detail');
  renderFIOScreen();
}
window.closeFIO = closeFIO;

// ── Resolución de disputa (última palabra de Dirección) ───────────────
// aceptar → anula penalización (Rechazado, applied_points=0)
// rechazar → confirma penalización (Cerrado, applied_points se mantiene)
async function resolveDisputeFIO(fid, decision){
  if(!canValidateCritical(currentUser)){ toast('Solo Dirección/RRHH puede resolver disputas','err'); return; }
  var all = await getDB('fio');
  var f = all.find(function(x){ return x.id === fid; });
  if(!f){ toast('FIO no encontrado','err'); return; }
  if(f.status !== FIO_STATUS.DISPUTADO){ toast('Solo se pueden resolver FIOs en disputa','err'); return; }

  var comentario = prompt(
    decision === 'aceptar'
      ? 'Motivo para ACEPTAR la disputa (se anulará la penalización):'
      : 'Motivo para RECHAZAR la disputa (la penalización se mantiene):'
  );
  if(comentario === null) return;
  if(!comentario.trim()){ toast('Motivo obligatorio','err'); return; }

  var ts = localTs();
  var updates;
  if(decision === 'aceptar'){
    // Disputa aceptada → Rechazado, puntos a 0 (no penaliza)
    updates = {
      status:         FIO_STATUS.RECHAZADO,
      applied_points: 0,
      accion_tomada:  (f.accion_tomada ? f.accion_tomada + ' | ' : '')
                      + 'DISPUTA ACEPTADA por '+currentUser.nombre+': '+comentario.trim(),
      validated_by:   currentUser.nombre,
      validated_at:   ts,
      updated_at:     ts
    };
    toast('Disputa aceptada — penalización anulada', 'ok');
  } else {
    // Disputa rechazada → Cerrado, puntos se mantienen (penaliza)
    updates = {
      status:        FIO_STATUS.CERRADO,
      accion_tomada: (f.accion_tomada ? f.accion_tomada + ' | ' : '')
                     + 'DISPUTA RECHAZADA por '+currentUser.nombre+': '+comentario.trim(),
      validated_by:  currentUser.nombre,
      validated_at:  ts,
      updated_at:    ts
    };
    toast('Disputa rechazada — penalización confirmada', 'ok');
  }

  await dbUpdate('fio', fid, updates);
  invalidateCache('fio');
  auditLog(
    'FIO_DISPUTA_'+(decision === 'aceptar' ? 'ACEPTADA' : 'RECHAZADA'),
    currentUser.nombre+' → '+f.employee_name+' | '+f.fault_name+' | '+comentario.trim().slice(0,80)
  );
  closeModal('modal-fio-detail');
  renderFIOScreen();
}
window.resolveDisputeFIO = resolveDisputeFIO;

async function deleteFIO(fid){
  if(!isAdmin(currentUser)){ toast('Solo admin','err'); return; }
  if(!confirm('¿Eliminar este FIO? La acción se registra en audit_log.')) return;
  var all = await getDB('fio');
  var f = all.find(function(x){ return x.id === fid; });
  auditLog('FIO_DELETE', currentUser.nombre+' eliminó FIO '+fid+' | '+(f? f.employee_name+' · '+f.fault_name : '?'));
  try {
    await dbDelete('fio', fid);
    invalidateCache('fio');
    toast('Eliminado','ok');
    renderFIOScreen();
  } catch(e){
    toast('Error al eliminar: '+e.message,'err');
  }
}
window.deleteFIO = deleteFIO;

// ═══════════════════════════════════════════════════════════════════════
// VISTA EMPLEADO: MIS FIO (solo lectura + botón Disputar)
// ═══════════════════════════════════════════════════════════════════════
async function renderMisFIOScreen(){
  var el = document.getElementById('screen-mis-fio');
  if(!el) return;
  if(!currentUser){
    el.innerHTML = '<div class="page-header"><div class="page-title">🚫 Mis FIO</div><div class="page-sub">Inicia sesión</div></div>';
    return;
  }

  var all = [];
  try { all = await getDB('fio'); } catch(e){ all = []; }
  // Filtrar a SOLO los FIO del empleado actual
  var mine = all.filter(function(f){ return f.employee_id === currentUser.id; });
  mine.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  // KPIs personales
  var pendientes = mine.filter(function(f){ return f.status === FIO_STATUS.REGISTRADO; });
  var validados  = mine.filter(function(f){ return f.status === FIO_STATUS.VALIDADO || f.status === FIO_STATUS.CERRADO; });
  var disputados = mine.filter(function(f){ return f.status === FIO_STATUS.DISPUTADO; });
  var puntosVal  = validados.reduce(function(s,f){ return s + (parseFloat(f.applied_points)||0); }, 0);
  var thisMonth  = _fioMonth();
  var puntosMes  = validados.filter(function(f){ return f.incentive_month === thisMonth; })
                            .reduce(function(s,f){ return s + (parseFloat(f.applied_points)||0); }, 0);

  el.innerHTML =
      '<div class="page-header">'
    +   '<div class="page-title">⚖ Mis FIO</div>'
    +   '<div class="page-sub">Tus incidencias de proceso registradas — solo lectura</div>'
    + '</div>'

    + '<div class="kpi-grid" style="margin-bottom:14px;">'
    +   '<div class="kpi k-red"><div class="kpi-lbl">Pendientes</div><div class="kpi-val">'+pendientes.length+'</div><div class="kpi-sub">Por validar</div></div>'
    +   '<div class="kpi k-green"><div class="kpi-lbl">Validados</div><div class="kpi-val">'+validados.length+'</div><div class="kpi-sub">'+puntosVal+' pts totales</div></div>'
    +   '<div class="kpi k-amber"><div class="kpi-lbl">Puntos del mes</div><div class="kpi-val">'+puntosMes+'</div><div class="kpi-sub">'+thisMonth+'</div></div>'
    +   '<div class="kpi k-blue"><div class="kpi-lbl">Disputados</div><div class="kpi-val">'+disputados.length+'</div><div class="kpi-sub">En revisión</div></div>'
    + '</div>'

    + (mine.length
        ? _renderMisFIOTable(mine)
        : '<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">No tienes FIO registrados</div></div>');
}
window.renderMisFIOScreen = renderMisFIOScreen;

function _renderMisFIOTable(list){
  return '<div style="overflow-x:auto"><table>'
    + '<tr><th>Fecha</th><th>Fallo</th><th>Nivel · Puntos</th><th>Impacto</th><th>Descripción</th><th>Estado</th><th>Acción</th></tr>'
    + list.map(function(f){
        var canDispute = (f.status === FIO_STATUS.REGISTRADO || f.status === FIO_STATUS.VALIDADO);
        var acciones = '<button class="btn btn-secondary btn-sm" onclick="openMisFIODetail(\''+f.id+'\')">Ver</button>'
          + (canDispute ? ' <button class="btn btn-warn btn-sm" onclick="disputeMisFIO(\''+f.id+'\')">⚠ Disputar</button>' : '');
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px">'+formatDisplayValue(f.fecha)+'</td>'
          + '<td style="font-size:12px;max-width:240px">'+formatDisplayValue(f.fault_name)+'</td>'
          + '<td>'+bFIOLevel(f.level_code, f.applied_points)+'</td>'
          + '<td style="font-size:11px;color:var(--text3)">'+formatDisplayValue(f.impact_area)+'</td>'
          + '<td style="font-size:11px;color:var(--text2);max-width:240px">'+formatDisplayValue(f.description)+'</td>'
          + '<td>'+bFIOStatus(f.status)+'</td>'
          + '<td style="white-space:nowrap">'+acciones+'</td>'
          + '</tr>';
      }).join('')
    + '</table></div>';
}

// Detalle (solo lectura)
async function openMisFIODetail(fid){
  var all = await getDB('fio');
  var f = all.find(function(x){ return x.id === fid; });
  if(!f){ toast('FIO no encontrado','err'); return; }
  if(f.employee_id !== currentUser.id){ toast('No autorizado','err'); return; }

  var L = FIO_LEVELS[f.level_code] || FIO_LEVELS.L0;
  var canDispute = (f.status === FIO_STATUS.REGISTRADO || f.status === FIO_STATUS.VALIDADO);

  var ov = document.getElementById('modal-mis-fio-detail');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-mis-fio-detail';
    ov.className = 'modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-mis-fio-detail'); });
  }

  ov.innerHTML = '<div class="modal" style="max-width:560px;">'
    + '<div class="modal-h"><h3>⚖ Detalle FIO</h3>'
    + '<button class="modal-x" onclick="closeModal(\'modal-mis-fio-detail\')">✕</button></div>'
    + '<div class="modal-b">'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;font-size:12px;">'
    +     '<div><strong>Fecha:</strong><br>'+formatDisplayValue(f.fecha)+'</div>'
    +     '<div><strong>Departamento:</strong><br>'+deptBadge(f.departamento)+'</div>'
    +     '<div><strong>Mes incentivo:</strong><br>'+formatDisplayValue(f.incentive_month)+'</div>'
    +     '<div><strong>Estado:</strong><br>'+bFIOStatus(f.status)+'</div>'
    +   '</div>'
    +   '<div style="padding:10px;background:var(--bg2);border-radius:6px;border-left:3px solid '+L.color+';margin-bottom:12px;">'
    +     '<div style="font-weight:700;color:'+L.color+';">'+L.name+' · '+f.applied_points+' puntos</div>'
    +     '<div style="font-size:12px;color:var(--text2);margin-top:4px;">'+L.msg+'</div>'
    +   '</div>'
    +   '<div style="margin-bottom:10px;"><strong>Fallo:</strong><br>'+formatDisplayValue(f.fault_name)+'</div>'
    +   '<div style="margin-bottom:10px;"><strong>Impacto:</strong> '+formatDisplayValue(f.impact_area)+'</div>'
    +   '<div style="margin-bottom:10px;"><strong>Descripción:</strong><br><div style="color:var(--text2);font-size:13px;">'+formatDisplayValue(f.description)+'</div></div>'
    +   (f.evidence_text ? '<div style="margin-bottom:10px;"><strong>Evidencia:</strong><br><div style="color:var(--text2);font-size:13px;font-family:var(--font-mono);">'+formatDisplayValue(f.evidence_text)+'</div></div>' : '')
    +   (f.evidence_image ? '<div style="margin-bottom:10px;"><strong>📷 Foto:</strong><br><a href="'+f.evidence_image+'" target="_blank" rel="noopener"><img src="'+f.evidence_image+'" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid var(--border);cursor:zoom-in;display:block;margin-top:6px;"/></a></div>' : '')
    +   '<div style="font-size:11px;color:var(--text3);margin-bottom:10px;">'
    +     'Registrado por '+formatDisplayValue(f.created_by)+' · '+formatDisplayValue(f.created_at)
    +     (f.validated_by ? '<br>Validado por '+formatDisplayValue(f.validated_by)+' · '+formatDisplayValue(f.validated_at) : '')
    +   '</div>'
    +   (f.accion_tomada ? '<div style="margin-bottom:10px;"><strong>Acción tomada:</strong><br>'+formatDisplayValue(f.accion_tomada)+'</div>' : '')
    +   (f.status === FIO_STATUS.DISPUTADO ? '<div style="padding:8px;background:#fef3c722;border-left:3px solid var(--amber);border-radius:4px;font-size:12px;color:var(--amber);">⚠ Has disputado este FIO. Está en revisión por Dirección/RRHH. <strong>Mientras se resuelve, el FIO sí cuenta en tu penalización.</strong> Si la disputa es aceptada, se anulará la penalización.</div>' : '')
    + '</div>'
    + '<div class="modal-f">'
    +   (canDispute ? '<button class="btn btn-warn" onclick="disputeMisFIO(\''+fid+'\')">⚠ Disputar</button>' : '')
    +   '<button class="btn btn-secondary" onclick="closeModal(\'modal-mis-fio-detail\')">Cerrar</button>'
    + '</div></div>';

  ov.classList.add('open');
}
window.openMisFIODetail = openMisFIODetail;

// Disputar (cambia status a Disputado)
async function disputeMisFIO(fid){
  var all = await getDB('fio');
  var f = all.find(function(x){ return x.id === fid; });
  if(!f){ toast('FIO no encontrado','err'); return; }
  if(f.employee_id !== currentUser.id){ toast('No autorizado','err'); return; }
  if(f.status !== FIO_STATUS.REGISTRADO && f.status !== FIO_STATUS.VALIDADO){
    toast('Solo se pueden disputar FIO Registrados o Validados','err');
    return;
  }

  var motivo = prompt('Motivo de la disputa (obligatorio — Dirección/RRHH lo revisará):');
  if(motivo === null) return;
  if(!motivo.trim()){ toast('Motivo obligatorio','err'); return; }

  var ts = localTs();
  // Concatenamos motivo a accion_tomada para que el supervisor lo vea
  var nuevaAccion = (f.accion_tomada ? f.accion_tomada + ' | ' : '') + 'DISPUTA EMPLEADO: ' + motivo.trim();
  await dbUpdate('fio', fid, {
    status: FIO_STATUS.DISPUTADO,
    accion_tomada: nuevaAccion,
    updated_at: ts
  });
  invalidateCache('fio');
  auditLog('FIO_DISPUTADO_EMPLEADO', currentUser.nombre+' disputó FIO '+fid+' | '+motivo.trim().slice(0,80));
  toast('FIO disputado. Dirección lo revisará.','warn');
  closeModal('modal-mis-fio-detail');
  renderMisFIOScreen();
}
window.disputeMisFIO = disputeMisFIO;
