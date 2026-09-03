// ═══════════════════════════════════════════════════════════════════════
// HOUSEKEEPING · Premio semestral por continuidad y compromiso
// Entrada de bajas y liquidación desde Liquidaciones por departamento.
// ═══════════════════════════════════════════════════════════════════════

var _hkSemesterState = { period: null, data: null, view: 'department-liquidation', department: 'Housekeeping' };

function _hkEscHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _hkDefaultPeriod() {
  var now = new Date();
  var year = now.getFullYear();
  return now.getMonth() >= 6 ? year+'-S1' : (year-1)+'-S2';
}

function _hkPeriodInfo(period) {
  var match = /^(\d{4})-S([12])$/.exec(period || '');
  if (!match) return null;
  var year = parseInt(match[1], 10), semester = parseInt(match[2], 10);
  return {
    id: period,
    year: year,
    semester: semester,
    label: semester+'.º semestre '+year,
    start: year+'-'+(semester===1?'01-01':'07-01')
  };
}

function _hkPeriodOptions(selected) {
  var currentYear = new Date().getFullYear();
  var options = [];
  for(var year=currentYear; year>=2025; year--){
    ['S2','S1'].forEach(function(semester){
      var period = year+'-'+semester;
      var info = _hkPeriodInfo(period);
      options.push('<option value="'+period+'"'+(period===selected?' selected':'')+'>'+info.label+'</option>');
    });
  }
  return options.join('');
}

function _hkClientTenure(fechaAlta, period) {
  var info = _hkPeriodInfo(period);
  if(!info || !/^\d{4}-\d{2}-\d{2}$/.test(fechaAlta||'')) return false;
  var threshold = new Date(Date.UTC(info.year, info.semester===1?-6:0, 1));
  var start = new Date(fechaAlta+'T00:00:00Z');
  return !isNaN(start.getTime()) && start.getTime() < threshold.getTime();
}

function _hkFormatMoney(value) {
  return (parseFloat(value||0)).toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2})+' €';
}

function _hkBadge(text, color) {
  return '<span style="display:inline-block;padding:3px 7px;border-radius:4px;font-family:var(--font-mono);font-size:10px;font-weight:700;'+color+'">'+_hkEscHtml(text)+'</span>';
}

function _hkRecordByEmployee(data) {
  var map = {};
  (data.records||[]).forEach(function(record){ map[record.employee_id] = record; });
  return map;
}

async function _hkApi(method, payload, period) {
  if(!window.SyncroAuth || !window.SyncroAuth.enabled){
    throw new Error('La sesión segura no está disponible.');
  }
  var token = await window.SyncroAuth.getAccessToken(false);
  var url = '/api/housekeeping-semester-incentives';
  if(method==='GET') url += '?periodo='+encodeURIComponent(period);
  var response = await fetch(url, {
    method: method,
    credentials: 'include',
    headers: Object.assign(
      { Authorization:'Bearer '+token },
      method==='POST' ? {'Content-Type':'application/json'} : {}
    ),
    body: method==='POST' ? JSON.stringify(payload||{}) : undefined
  });
  var data = null;
  try { data = await response.json(); } catch(_e) {}
  if(!response.ok) throw new Error((data&&data.error)||'No se pudo completar la operación.');
  return data||{};
}

async function _hkLoad(period) {
  _hkSemesterState.data = await _hkApi('GET', null, period);
  _hkSemesterState.period = period;
  return _hkSemesterState.data;
}

function _hkStatus(record, employee, period) {
  if(record && record.estado==='liquidado') return _hkBadge('LIQUIDADO', 'background:var(--green-dim);color:var(--green);');
  if(record && record.estado==='historico') return _hkBadge('HISTÓRICO', 'background:var(--bg3);color:var(--text3);');
  if(!record) return _hkBadge('PENDIENTE DE DATO', 'background:var(--amber-dim);color:var(--amber);');
  if(!record.elegible_antiguedad) return _hkBadge('NO CUMPLE ANTIGÜEDAD', 'background:var(--red-dim);color:var(--red);');
  if(!record.elegible_baja) return _hkBadge('NO CUMPLE BAJAS', 'background:var(--red-dim);color:var(--red);');
  return _hkBadge('PENDIENTE DE LIQUIDAR', 'background:var(--amber-dim);color:var(--amber);');
}

function _hkTenureCell(record, employee, period) {
  if(record && record.elegible_antiguedad) return '<span style="color:var(--green);font-weight:600;">✅ Más de 6 meses</span>';
  if(record && !record.elegible_antiguedad) return '<span style="color:var(--red);">No cumple</span>';
  if(!employee.fecha_alta) return '<span style="color:var(--text3);">[NO DATA]</span>';
  return _hkClientTenure(employee.fecha_alta, period)
    ? '<span style="color:var(--green);font-weight:600;">✅ Más de 6 meses</span>'
    : '<span style="color:var(--red);">No cumple</span>';
}

function _hkReportHtml(data, options) {
  options = options || {};
  var recordMap = _hkRecordByEmployee(data);
  var canRecord = !!(data.permissions||{}).can_record;
  var period = _hkSemesterState.period;
  var rows = (data.employees||[]).map(function(employee){
    var record = recordMap[employee.id];
    var inputId = 'hk-absence-'+employee.id;
    var locked = !canRecord || (record && record.estado==='liquidado') || (record && record.estado==='historico');
    var days = record && record.dias_baja != null ? record.dias_baja : '';
    var action = locked
      ? '<span style="color:var(--text3);font-size:11px;">'+(record&&record.estado==='historico'?'Dato importado':'Sin permisos')+'</span>'
      : '<button class="btn btn-xs" style="background:var(--accent);color:#fff;" onclick=\'hkSaveAbsence('+JSON.stringify(employee.id)+')\'>Guardar</button>';
    var level = record && record.nivel_premio>0 ? record.nivel_premio+'º' : '—';
    var amount = record && parseFloat(record.importe_premio||0)>0
      ? '<strong style="color:var(--green);">'+_hkFormatMoney(record.importe_premio)+'</strong>' : '—';
    return '<tr>'
      +'<td><strong>'+_hkEscHtml(employee.nombre)+'</strong><div style="font-size:10px;color:var(--text3);">'+_hkEscHtml(employee.puesto||'Housekeeping')+'</div></td>'
      +'<td>'+_hkTenureCell(record, employee, period)+'</td>'
      +'<td style="text-align:center;"><input id="'+_hkEscHtml(inputId)+'" type="number" min="0" max="184" step="1" value="'+_hkEscHtml(days)+'" '+(locked?'disabled':'')+' style="width:82px;text-align:center;" aria-label="Días de baja de '+_hkEscHtml(employee.nombre)+'"></td>'
      +'<td style="text-align:center;font-family:var(--font-mono);font-weight:700;">'+level+'</td>'
      +'<td style="font-family:var(--font-mono);">'+amount+'</td>'
      +'<td>'+_hkStatus(record, employee, period)+'</td>'
      +'<td style="text-align:right;">'+action+'</td>'
      +'</tr>';
  }).join('');
  var periodControl = options.showPeriod === false ? ''
    : '<div class="fg" style="min-width:205px;margin:0;"><label>Período</label><select onchange="hkChangeSemesterPeriod(this.value)">'+_hkPeriodOptions(period)+'</select></div>';
  return '<div class="card">'
    +'<div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;">'
      +'<div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;">Housekeeping · Datos de bajas para liquidación</div>'
      +'<div style="font-size:13px;color:var(--text2);margin-top:5px;">La jefa registra solo los días de baja laboral; el sistema calcula el nivel y el importe.</div></div>'
      +periodControl
    +'</div>'
    +'<div style="padding:11px 13px;border:1px solid var(--border);border-radius:7px;background:var(--bg3);font-size:11px;color:var(--text2);margin-bottom:14px;line-height:1.5;">'
      +'<strong style="color:var(--text);">Regla:</strong> antigüedad estrictamente superior a 6 meses al inicio del semestre y máximo 10 días de baja. Nivel 1: 250 € · nivel 2: 320 € · nivel 3 y siguientes: 400 €. Más de 10 días reinicia el siguiente período válido en nivel 1.'
      +'</div>'
    +'<div class="tbl-wrap"><table><tr><th>Empleada</th><th>Antigüedad al inicio</th><th>Días de baja</th><th>Nivel</th><th>Importe</th><th>Estado</th><th></th></tr>'
      +(rows||'<tr><td colspan="7" style="text-align:center;color:var(--text3);">Sin empleadas de Housekeeping.</td></tr>')
      +'</table></div>'
    +'<p style="font-size:11px;color:var(--text3);margin:12px 0 0;">No se registran diagnósticos ni documentación médica: solo el total de días de baja por período.</p>'
    +'</div>';
}

async function renderHousekeepingPremioSemestral(el) {
  if(!el) return;
  _hkSemesterState.view = 'report';
  var period = _hkSemesterState.period || _hkDefaultPeriod();
  el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:16px 0;">Cargando premio semestral…</p></div>';
  try {
    var data = await _hkLoad(period);
    el.innerHTML = _hkReportHtml(data);
  } catch(error) {
    el.innerHTML = '<div class="card"><p style="color:var(--red);padding:16px 0;">'+_hkEscHtml(error.message||'No se pudo cargar el premio semestral.')+'</p></div>';
  }
}
window.renderHousekeepingPremioSemestral = renderHousekeepingPremioSemestral;

async function hkChangeSemesterPeriod(period) {
  _hkSemesterState.period = period;
  if(_hkSemesterState.view==='department-liquidation') {
    await renderLiquidacionesPorDepartamento(document.getElementById('liquidaciones-departamento-content'));
    return;
  }
  var target = document.getElementById('inf-main-content');
  if(_hkSemesterState.view==='liquidation') await renderHousekeepingLiquidacion(target);
  else await renderHousekeepingPremioSemestral(target);
}
window.hkChangeSemesterPeriod = hkChangeSemesterPeriod;

async function hkSaveAbsence(employeeId) {
  var input = document.getElementById('hk-absence-'+employeeId);
  var raw = input ? input.value.trim() : '';
  if(raw===''){ toast('Introduce los días de baja para calcular el premio.','warn'); return; }
  var days = Number(raw);
  if(!Number.isInteger(days) || days<0 || days>184){ toast('Los días de baja deben estar entre 0 y 184.','warn'); return; }
  try {
    await _hkApi('POST', {action:'save', employee_id:employeeId, periodo:_hkSemesterState.period, dias_baja:days});
    toast('Días de baja guardados y premio recalculado.','ok');
    if(_hkSemesterState.view==='department-liquidation') await renderLiquidacionesPorDepartamento(document.getElementById('liquidaciones-departamento-content'));
    else await renderHousekeepingPremioSemestral(document.getElementById('inf-main-content'));
  } catch(error) { toast(error.message||'No se pudo guardar.','err'); }
}
window.hkSaveAbsence = hkSaveAbsence;

function _hkLiquidationHtml(data, options) {
  options = options || {};
  var period = _hkSemesterState.period;
  var canLiquidate = !!(data.permissions||{}).can_liquidate;
  var payable = (data.records||[]).filter(function(record){ return parseFloat(record.importe_premio||0)>0; });
  var pending = payable.filter(function(record){ return record.estado==='pendiente'; });
  var totalPending = pending.reduce(function(total, record){ return total+parseFloat(record.importe_premio||0); },0);
  var totalLiquidated = payable.filter(function(record){ return record.estado==='liquidado'; }).reduce(function(total, record){ return total+parseFloat(record.importe_premio||0); },0);
  var rows = payable.map(function(record){
    var status = record.estado==='liquidado'
      ? _hkBadge('LIQUIDADO', 'background:var(--green-dim);color:var(--green);')
      : _hkBadge('PENDIENTE', 'background:var(--amber-dim);color:var(--amber);');
    var action = record.estado==='liquidado'
      ? '<span style="font-size:11px;color:var(--text3);">'+_hkEscHtml(record.liquidado_at ? new Date(record.liquidado_at).toLocaleDateString('es-ES') : 'Registrado')+'</span>'
      : canLiquidate
        ? '<button class="btn btn-xs" style="background:var(--green);color:#fff;" onclick=\'hkOpenLiquidation('+JSON.stringify(record.employee_id)+')\'>Liquidar</button>'
        : '<span style="font-size:11px;color:var(--text3);">Revisión Dirección</span>';
    return '<tr><td><strong>'+_hkEscHtml(record.employee_nombre)+'</strong></td>'
      +'<td style="text-align:center;font-family:var(--font-mono);">'+record.nivel_premio+'º</td>'
      +'<td style="text-align:center;font-family:var(--font-mono);">'+record.dias_baja+'</td>'
      +'<td style="font-family:var(--font-mono);font-weight:700;color:var(--green);">'+_hkFormatMoney(record.importe_premio)+'</td>'
      +'<td>'+status+'</td><td style="text-align:right;">'+action+'</td></tr>';
  }).join('');
  var periodControl = options.showPeriod === false ? ''
    : '<div class="fg" style="min-width:205px;margin:0;"><label>Período</label><select onchange="hkChangeSemesterPeriod(this.value)">'+_hkPeriodOptions(period)+'</select></div>';
  return '<div class="card">'
    +'<div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;">'
      +'<div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;">Housekeeping · Liquidación semestral</div>'
      +'<div style="font-size:13px;color:var(--text2);margin-top:5px;">Importes calculados desde los datos registrados por la jefa de Housekeeping.</div></div>'
      +periodControl
    +'</div>'
    +'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">'
      +'<div style="padding:12px 16px;border-radius:8px;border:1px solid var(--amber);background:var(--amber-dim);min-width:180px;"><div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);font-weight:700;">PENDIENTE DE LIQUIDAR</div><div style="font-size:22px;font-family:var(--font-mono);font-weight:700;color:var(--amber);margin-top:3px;">'+_hkFormatMoney(totalPending)+'</div></div>'
      +'<div style="padding:12px 16px;border-radius:8px;border:1px solid var(--green);background:var(--green-dim);min-width:180px;"><div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);font-weight:700;">YA LIQUIDADO</div><div style="font-size:22px;font-family:var(--font-mono);font-weight:700;color:var(--green);margin-top:3px;">'+_hkFormatMoney(totalLiquidated)+'</div></div>'
    +'</div>'
    +'<div class="tbl-wrap"><table><tr><th>Empleada</th><th>Nivel</th><th>Días baja</th><th>Importe</th><th>Estado</th><th></th></tr>'
      +(rows||'<tr><td colspan="6" style="text-align:center;color:var(--text3);">No hay premios con importe para este período.</td></tr>')
      +'</table></div>'
    +'</div>';
}

async function renderHousekeepingLiquidacion(el) {
  if(!el) return;
  _hkSemesterState.view = 'liquidation';
  var period = _hkSemesterState.period || _hkDefaultPeriod();
  el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:16px 0;">Cargando liquidación semestral…</p></div>';
  try {
    var data = await _hkLoad(period);
    el.innerHTML = _hkLiquidationHtml(data);
  } catch(error) {
    el.innerHTML = '<div class="card"><p style="color:var(--red);padding:16px 0;">'+_hkEscHtml(error.message||'No se pudo cargar la liquidación.')+'</p></div>';
  }
}
window.renderHousekeepingLiquidacion = renderHousekeepingLiquidacion;

function _hkLiquidationsDepartmentHtml() {
  var period = _hkSemesterState.period || _hkDefaultPeriod();
  return '<div class="card" style="margin-bottom:16px;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">'
      +'<div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;">Liquidaciones por departamento</div>'
      +'<div style="font-size:13px;color:var(--text2);margin-top:5px;">Selecciona el departamento y consulta sus datos y liquidaciones del período.</div></div>'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">'
        +'<div class="fg" style="min-width:205px;margin:0;"><label>Departamento</label><button class="btn" type="button" style="width:100%;background:var(--accent);color:#fff;text-align:left;" onclick="hkSelectLiquidationDepartment(\'Housekeeping\')">🧹 Housekeeping</button></div>'
        +'<div class="fg" style="min-width:205px;margin:0;"><label>Período</label><select onchange="hkChangeSemesterPeriod(this.value)">'+_hkPeriodOptions(period)+'</select></div>'
      +'</div>'
    +'</div>'
    +'</div>'
    +'<div id="liquidaciones-departamento-details"></div>';
}

async function renderLiquidacionesPorDepartamento(el) {
  if(!el) return;
  _hkSemesterState.view = 'department-liquidation';
  _hkSemesterState.department = 'Housekeeping';
  var period = _hkSemesterState.period || _hkDefaultPeriod();
  el.innerHTML = _hkLiquidationsDepartmentHtml();
  var details = document.getElementById('liquidaciones-departamento-details');
  if(!details) return;
  details.innerHTML = '<div class="card"><p style="color:var(--text3);padding:16px 0;">Cargando datos de liquidación…</p></div>';
  try {
    var data = await _hkLoad(period);
    details.innerHTML = _hkReportHtml(data, { showPeriod:false }) + _hkLiquidationHtml(data, { showPeriod:false });
  } catch(error) {
    details.innerHTML = '<div class="card"><p style="color:var(--red);padding:16px 0;">'+_hkEscHtml(error.message||'No se pudieron cargar los datos de liquidación.')+'</p></div>';
  }
}
window.renderLiquidacionesPorDepartamento = renderLiquidacionesPorDepartamento;

function hkSelectLiquidationDepartment(department) {
  if(department!=='Housekeeping') return;
  _hkSemesterState.department = department;
  renderLiquidacionesPorDepartamento(document.getElementById('liquidaciones-departamento-content'));
}
window.hkSelectLiquidationDepartment = hkSelectLiquidationDepartment;

function hkOpenLiquidation(employeeId) {
  var record = (_hkSemesterState.data&&_hkSemesterState.data.records||[]).find(function(row){ return row.employee_id===employeeId; });
  if(!record) return;
  var existing = document.getElementById('hk-liquidation-overlay');
  if(existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'hk-liquidation-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5);">'
    +'<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--green);letter-spacing:.15em;margin-bottom:12px;">LIQUIDAR PREMIO SEMESTRAL</div>'
    +'<div style="font-size:15px;font-weight:700;margin-bottom:14px;">'+_hkEscHtml(record.employee_nombre)+' · '+_hkEscHtml((_hkPeriodInfo(record.periodo)||{}).label||record.periodo)+'</div>'
    +'<div style="padding:14px;border-radius:8px;background:var(--green-dim);border:1px solid var(--green);margin-bottom:16px;"><div style="font-size:11px;color:var(--text3);">Importe a liquidar</div><div style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:var(--green);margin-top:3px;">'+_hkFormatMoney(record.importe_premio)+'</div></div>'
    +'<div class="fg" style="margin-bottom:16px;"><label>Notas (opcional)</label><input id="hk-liquidation-notes" type="text" maxlength="1000" placeholder="Ej.: Incluido en nómina de agosto"></div>'
    +'<div style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:10px;margin-bottom:16px;font-size:12px;color:var(--amber);">Esta acción registra la liquidación y bloquea la edición de los días del período.</div>'
    +'<div style="display:flex;justify-content:flex-end;gap:10px;"><button class="btn btn-secondary" onclick="document.getElementById(\'hk-liquidation-overlay\').remove()">Cancelar</button><button class="btn" style="background:var(--green);color:#fff;" onclick=\'hkConfirmLiquidation('+JSON.stringify(employeeId)+')\'>Confirmar liquidación</button></div>'
    +'</div>';
  document.body.appendChild(overlay);
}
window.hkOpenLiquidation = hkOpenLiquidation;

async function hkConfirmLiquidation(employeeId) {
  var notes = (document.getElementById('hk-liquidation-notes')||{}).value || '';
  try {
    await _hkApi('POST', {action:'liquidate', employee_id:employeeId, periodo:_hkSemesterState.period, notas:notes});
    var overlay = document.getElementById('hk-liquidation-overlay');
    if(overlay) overlay.remove();
    toast('Liquidación semestral registrada.','ok');
    if(_hkSemesterState.view==='department-liquidation') await renderLiquidacionesPorDepartamento(document.getElementById('liquidaciones-departamento-content'));
    else await renderHousekeepingLiquidacion(document.getElementById('inf-main-content'));
  } catch(error) { toast(error.message||'No se pudo registrar la liquidación.','err'); }
}
window.hkConfirmLiquidation = hkConfirmLiquidation;
