// ═══════════════════════════════════════════════════════════════════════
// HOUSEKEEPING · Premio semestral por continuidad y compromiso
// Liquidación unificada por departamento. Las bajas se introducen en Informes.
// ═══════════════════════════════════════════════════════════════════════

var _hkSemesterState = { period: null, data: null, view: 'department-liquidation', department: 'Entrenadores' };

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

function _hkFormatMoney(value) {
  return (parseFloat(value||0)).toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2})+' €';
}

function _hkBadge(text, color) {
  return '<span style="display:inline-block;padding:3px 7px;border-radius:4px;font-family:var(--font-mono);font-size:10px;font-weight:700;'+color+'">'+_hkEscHtml(text)+'</span>';
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

function _hkLiquidationHtml(data) {
  var canLiquidate = !!(data.permissions||{}).can_liquidate;
  var payable = data.records||[];
  var pending = payable.filter(function(record){ return record.estado==='pendiente'; });
  var totalPending = pending.reduce(function(total, record){ return total+parseFloat(record.importe_premio||0); },0);
  var totalLiquidated = payable.filter(function(record){ return record.estado==='liquidado'; }).reduce(function(total, record){ return total+parseFloat(record.importe_premio||0); },0);
  var rows = payable.map(function(record){
    var status = record.estado==='liquidado'
      ? _hkBadge('LIQUIDADO', 'background:var(--green-dim);color:var(--green);')
      : parseFloat(record.importe_premio||0)>0
        ? _hkBadge('PENDIENTE', 'background:var(--amber-dim);color:var(--amber);')
        : _hkBadge('NO LIQUIDABLE', 'background:var(--bg3);color:var(--text3);');
    var liquidationDate = record.liquidado_at
      ? new Date(record.liquidado_at).toLocaleDateString('es-ES')
      : '—';
    var action = record.estado==='liquidado'
      ? '<span style="font-size:11px;color:var(--text3);">Registrado</span>'
      : canLiquidate && parseFloat(record.importe_premio||0)>0
        ? '<button class="btn btn-xs" style="background:var(--green);color:#fff;" onclick=\'hkOpenLiquidation('+JSON.stringify(record.employee_id)+')\'>✓ Marcar liquidado</button>'
        : '<span style="font-size:11px;color:var(--text3);">Revisión Dirección</span>';
    return '<tr><td><strong>'+_hkEscHtml(record.employee_nombre)+'</strong></td>'
      +'<td style="text-align:center;font-family:var(--font-mono);">'+(record.nivel_premio>0?record.nivel_premio+'º':'—')+'</td>'
      +'<td style="text-align:center;font-family:var(--font-mono);">'+record.dias_baja+'</td>'
      +'<td style="font-family:var(--font-mono);font-weight:700;color:'+(parseFloat(record.importe_premio||0)>0?'var(--green)':'var(--text3)')+';">'+_hkFormatMoney(record.importe_premio)+'</td>'
      +'<td>'+status+'</td>'
      +'<td style="text-align:center;font-family:var(--font-mono);font-size:11px;">'+liquidationDate+'</td>'
      +'<td style="text-align:right;">'+action+'</td></tr>';
  }).join('');
  return '<div class="card">'
    +'<div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;">'
      +'<div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;">Housekeeping · Liquidación semestral</div>'
      +'<div style="font-size:13px;color:var(--text2);margin-top:5px;">Los días se calculan desde las fechas de baja publicadas por la jefa en Informes.</div></div>'
    +'</div>'
    +'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">'
      +'<div style="padding:12px 16px;border-radius:8px;border:1px solid var(--amber);background:var(--amber-dim);min-width:180px;"><div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);font-weight:700;">PENDIENTE DE LIQUIDAR</div><div style="font-size:22px;font-family:var(--font-mono);font-weight:700;color:var(--amber);margin-top:3px;">'+_hkFormatMoney(totalPending)+'</div></div>'
      +'<div style="padding:12px 16px;border-radius:8px;border:1px solid var(--green);background:var(--green-dim);min-width:180px;"><div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);font-weight:700;">YA LIQUIDADO</div><div style="font-size:22px;font-family:var(--font-mono);font-weight:700;color:var(--green);margin-top:3px;">'+_hkFormatMoney(totalLiquidated)+'</div></div>'
    +'</div>'
    +'<div class="tbl-wrap"><table><tr><th>Empleada</th><th>Nivel</th><th>Días baja</th><th>Importe</th><th>Estado</th><th>Fecha liquidación</th><th></th></tr>'
      +(rows||'<tr><td colspan="7" style="text-align:center;color:var(--text3);">No hay datos de Housekeeping para este período.</td></tr>')
      +'</table></div>'
    +'</div>';
}

function _hkTrainerPeriodOptions(selected) {
  var options = typeof getMonthOptions==='function' ? getMonthOptions(18) : [];
  if(selected && !options.some(function(option){ return option.value===selected; })) {
    var parts = selected.split('-');
    var months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    options.push({value:selected,label:(months[parseInt(parts[1],10)-1]||parts[1])+' '+parts[0]});
  }
  return options.map(function(option){
    return '<option value="'+_hkEscHtml(option.value)+'"'+(option.value===selected?' selected':'')+'>'+_hkEscHtml(option.label)+'</option>';
  }).join('');
}

function _hkLiquidationsDepartmentHtml() {
  var department = _hkSemesterState.department || 'Entrenadores';
  var isTrainers = department==='Entrenadores';
  var period = isTrainers
    ? ((typeof _liqEntrMonth!=='undefined'&&_liqEntrMonth)||'')
    : (_hkSemesterState.period || _hkDefaultPeriod());
  var periodOptions = isTrainers ? _hkTrainerPeriodOptions(period) : _hkPeriodOptions(period);
  return '<div class="card" style="margin-bottom:16px;">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">'
      +'<div><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;">Liquidación por departamento</div>'
      +'<div style="font-size:13px;color:var(--text2);margin-top:5px;">Entrenadores se liquida por mes; Housekeeping, por semestre.</div></div>'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">'
        +'<div class="fg" style="min-width:230px;margin:0;"><label>Departamento</label><select onchange="hkSelectLiquidationDepartment(this.value)">'
          +'<option value="Housekeeping"'+(department==='Housekeeping'?' selected':'')+'>🧹 Housekeeping</option>'
          +'<option value="Entrenadores"'+(department==='Entrenadores'?' selected':'')+'>🏋 Entrenadores</option>'
        +'</select></div>'
        +'<div class="fg" style="min-width:220px;margin:0;"><label>Período '+(isTrainers?'mensual':'semestral')+'</label><select onchange="hkChangeLiquidationPeriod(this.value)">'+periodOptions+'</select></div>'
      +'</div>'
    +'</div>'
    +'</div>'
    +'<div id="liquidaciones-departamento-details"></div>';
}

async function renderLiquidacionesPorDepartamento(el) {
  if(!el) return;
  _hkSemesterState.view = 'department-liquidation';
  var department = _hkSemesterState.department || 'Entrenadores';
  if(department==='Entrenadores' && typeof _liqEntrMonth!=='undefined' && !_liqEntrMonth) {
    var monthOptions = typeof getMonthOptions==='function' ? getMonthOptions(18) : [];
    try {
      var trainerRows = await getDB('entrenadores_incentivos_mes');
      var pendingMonths = (trainerRows||[]).filter(function(row){ return !row.liquidado; }).map(function(row){ return row.ym; }).sort().reverse();
      _liqEntrMonth = pendingMonths[0] || (monthOptions[0]&&monthOptions[0].value) || '';
    } catch(_error) {
      _liqEntrMonth = (monthOptions[0]&&monthOptions[0].value)||'';
    }
  }
  el.innerHTML = _hkLiquidationsDepartmentHtml();
  var details = document.getElementById('liquidaciones-departamento-details');
  if(!details) return;
  details.innerHTML = '<div class="card"><p style="color:var(--text3);padding:16px 0;">Cargando datos de liquidación…</p></div>';
  if(department==='Entrenadores') {
    if(!(typeof canActAsAdmin==='function' && canActAsAdmin(currentUser))) {
      details.innerHTML = '<div class="card"><p style="color:var(--text3);padding:16px 0;">Solo BOSS puede liquidar Entrenadores.</p></div>';
      return;
    }
    if(typeof _mrEntrMonth!=='undefined') _mrEntrMonth = _liqEntrMonth;
    details.innerHTML = '<div class="card"><div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">Entrenadores · Liquidación mensual</div><div id="liq-entr-tabla"><p style="color:var(--text3);">Cargando…</p></div></div>';
    if(typeof _liqEntrLoadTabla==='function') await _liqEntrLoadTabla();
    return;
  }
  var period = _hkSemesterState.period || _hkDefaultPeriod();
  try {
    var data = await _hkLoad(period);
    details.innerHTML = _hkLiquidationHtml(data);
  } catch(error) {
    details.innerHTML = '<div class="card"><p style="color:var(--red);padding:16px 0;">'+_hkEscHtml(error.message||'No se pudieron cargar los datos de liquidación.')+'</p></div>';
  }
}
window.renderLiquidacionesPorDepartamento = renderLiquidacionesPorDepartamento;

function hkSelectLiquidationDepartment(department) {
  if(department!=='Housekeeping'&&department!=='Entrenadores') return;
  _hkSemesterState.department = department;
  renderLiquidacionesPorDepartamento(document.getElementById('liquidaciones-departamento-content'));
}
window.hkSelectLiquidationDepartment = hkSelectLiquidationDepartment;

function hkChangeLiquidationPeriod(period) {
  if(_hkSemesterState.department==='Entrenadores') {
    if(typeof _liqEntrMonth!=='undefined') _liqEntrMonth = period;
    if(typeof _mrEntrMonth!=='undefined') _mrEntrMonth = period;
  } else {
    _hkSemesterState.period = period;
  }
  renderLiquidacionesPorDepartamento(document.getElementById('liquidaciones-departamento-content'));
}
window.hkChangeLiquidationPeriod = hkChangeLiquidationPeriod;

async function hkSyncReportAbsences(reportId, absences) {
  return _hkApi('POST', {action:'sync_absences', report_id:reportId, absences:absences||[]});
}
window.hkSyncReportAbsences = hkSyncReportAbsences;

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
    +'<div style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:10px;margin-bottom:16px;font-size:12px;color:var(--amber);">Esta acción registra la fecha de liquidación y bloquea cambios de bajas que afecten a este período.</div>'
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
    await renderLiquidacionesPorDepartamento(document.getElementById('liquidaciones-departamento-content'));
  } catch(error) { toast(error.message||'No se pudo registrar la liquidación.','err'); }
}
window.hkConfirmLiquidation = hkConfirmLiquidation;
