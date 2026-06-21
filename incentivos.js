// ═══════════════════════════════════════════════════════════════════════
// INCENTIVOS.JS · Sub-fase 2D · Piloto Sala
// Motor de cálculo + pantalla gestión admin/adjunto
// Vista empleado: sus ventas + bonus calculado
// ═══════════════════════════════════════════════════════════════════════

// ── Helpers de fecha ────────────────────────────────────────────────

function getMonthOptions(n){
  n = n || 6;
  var opts = [];
  var now = new Date();
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  for(var i=0; i<n; i++){
    var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    var val = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    opts.push({ label: meses[d.getMonth()]+' '+d.getFullYear(), value: val });
  }
  return opts;
}

function getMonthDateRange(ym){
  // ym = "2026-06"
  var parts = ym.split('-');
  var y = parseInt(parts[0]);
  var m = parseInt(parts[1]);
  var inicio = y+'-'+String(m).padStart(2,'0')+'-01';
  var lastDay = new Date(y, m, 0).getDate();
  var fin    = y+'-'+String(m).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
  return { inicio: inicio, fin: fin };
}

// Tabla de penalización FIO (puntos → porcentaje)
function getFioPenalizacion(puntos){
  if(puntos <= 0)  return 0;
  if(puntos <= 2)  return 0.05;
  if(puntos <= 4)  return 0.10;
  if(puntos <= 7)  return 0.25;
  if(puntos <= 10) return 0.50;
  if(puntos <= 14) return 0.75;
  return 1.00; // ≥ 15 o L4
}

// ── RENDER PRINCIPAL ────────────────────────────────────────────────

var _incentivosSelectedMonth = '';
var _incentivosSelectedDept  = 'Sala';

async function renderIncentivos(){
  var el = document.getElementById('incentivos-content');
  if(!el) return;

  var isGestor = canActAsAdmin(currentUser) ||
    (typeof isSupervisor === 'function' && isSupervisor(currentUser));
  var isEmpleado = !isGestor;

  if(isEmpleado){
    await renderIncentivosEmpleado(el);
  } else {
    await renderIncentivosGestor(el);
  }
}
window.renderIncentivos = renderIncentivos;

// ── VISTA EMPLEADO ───────────────────────────────────────────────────

async function renderIncentivosEmpleado(el){
  var area = currentUser.area || '';
  var esSala = area === 'Sala' || area === 'Jefe de Sala';
  var esRecepcion = area === 'Recepción';

  if(!esSala && !esRecepcion){
    el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">💰 Sistema de incentivos no disponible para tu departamento aún.</p></div>';
    return;
  }

  var monthOpts = getMonthOptions(6);
  if(!_incentivosSelectedMonth) _incentivosSelectedMonth = monthOpts[0].value;

  var selOpts = monthOpts.map(function(o){
    return '<option value="'+o.value+'"'+(o.value===_incentivosSelectedMonth?' selected':'')+'>'+o.label+'</option>';
  }).join('');

  el.innerHTML = '<div class="card">'
    +'<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:20px;flex-wrap:wrap;">'
    +'<div class="fg" style="min-width:200px;"><label>Mes</label>'
    +'<select id="inc-emp-month" onchange="onIncEmpleadoMonthChange(this.value)">'+selOpts+'</select></div>'
    +'</div>'
    +'<div id="inc-emp-content"><p style="color:var(--text3);">Cargando…</p></div>'
    +'</div>';

  if(esRecepcion) {
    await loadIncentivosEmpleadoRecepcion();
  } else {
    await loadIncentivosEmpleado();
  }
}

async function onIncEmpleadoMonthChange(val){
  _incentivosSelectedMonth = val;
  var area = currentUser && (currentUser.area||'');
  if(area === 'Recepción') {
    await loadIncentivosEmpleadoRecepcion();
  } else {
    await loadIncentivosEmpleado();
  }
}
window.onIncEmpleadoMonthChange = onIncEmpleadoMonthChange;

async function loadIncentivosEmpleado(){
  var el = document.getElementById('inc-emp-content');
  if(!el) return;
  el.innerHTML = '<p style="color:var(--text3);">Calculando…</p>';

  var ym = _incentivosSelectedMonth;
  var range = getMonthDateRange(ym);
  var empId = currentUser.id;
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = ym.split('-');
  var mesLabel = meses[parseInt(parts[1])-1]+' '+parts[0];

  // 1. Ventas semanales del mes
  var ventasRes = await fetch(
    SUPABASE_URL+'/rest/v1/employee_sales_weekly?employee_id=eq.'+encodeURIComponent(empId)
      +'&fecha_inicio_semana=gte.'+range.inicio
      +'&fecha_inicio_semana=lte.'+range.fin
      +'&select=*&order=fecha_inicio_semana.asc',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var ventas = ventasRes.ok ? await ventasRes.json() : [];

  // 2. Reglas activas de Sala
  var allRules = await getDB('dept_incentive_rules');
  var rules = (allRules||[]).filter(function(r){
    return r.activo && (r.departamento==='Sala'||r.departamento==='Jefe de Sala');
  });
  var rSemanal = rules.find(function(r){ return r.periodo==='semanal'; });
  var rMensual  = rules.find(function(r){ return r.periodo==='mensual'; });

  // 3. FIO del mes (puntos acumulados)
  var fioRes = await fetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=eq.'+encodeURIComponent(empId)
      +'&incentive_month=eq.'+ym
      +'&status=in.(Validado,Cerrado,Disputado)&select=applied_points',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var fios = fioRes.ok ? await fioRes.json() : [];
  var totalPuntosFio = (fios||[]).reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);

  // 4. Calcular
  var totalMes = (ventas||[]).reduce(function(s,v){ return s+parseFloat(v.ventas||0); },0);
  var semanasOk = rSemanal ? (ventas||[]).filter(function(v){
    return parseFloat(v.ventas||0) >= parseFloat(rSemanal.objetivo||0);
  }).length : 0;

  var bonusSemanal = rSemanal ? semanasOk * parseFloat(rSemanal.importe_bonus||0) : 0;
  var bonusMensual = (rMensual && totalMes >= parseFloat(rMensual.objetivo||0))
    ? parseFloat(rMensual.importe_bonus||0) : 0;
  var bonusBruto   = bonusSemanal + bonusMensual;

  var penPct = getFioPenalizacion(totalPuntosFio);
  var penEur = bonusBruto * penPct;
  var bonusFinal = Math.max(0, bonusBruto - penEur);

  // 5. Render filas de semanas
  var mesesN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var semanasRows = (ventas||[]).length ? ventas.map(function(v){
    var d = new Date(v.fecha_inicio_semana+'T00:00:00');
    var semLabel = 'Lun '+d.getDate()+' '+mesesN[d.getMonth()];
    var vv = parseFloat(v.ventas||0);
    var cumple = rSemanal && vv >= parseFloat(rSemanal.objetivo||0);
    return '<tr>'
      +'<td>'+semLabel+'</td>'
      +'<td style="font-family:var(--font-mono);">'+vv.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
      +'<td>'+(cumple
        ? '<span class="badge b-green">✅ Cumple</span>'
        : '<span class="badge b-gray">— No cumple</span>')+'</td>'
      +'<td style="font-family:var(--font-mono);color:var(--green);">'
        +(cumple && rSemanal ? '+'+parseFloat(rSemanal.importe_bonus||0).toFixed(2)+'€' : '—')
      +'</td>'
      +'</tr>';
  }).join('') : '<tr><td colspan="4" style="color:var(--text3);text-align:center;">Sin ventas registradas este mes</td></tr>';

  var penBadge = penPct > 0
    ? '<span class="badge b-red">−'+Math.round(penPct*100)+'% FIO ('+totalPuntosFio.toFixed(1)+' pts)</span>'
    : '<span class="badge b-green">Sin penalización FIO</span>';

  el.innerHTML = ''
    +'<h3 style="margin:0 0 16px;font-size:15px;color:var(--text2);">'+mesLabel+' · '+currentUser.nombre+'</h3>'

    // KPIs
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">'
    +_kpiBox('Ventas mes','€',totalMes,'var(--accent)')
    +_kpiBox('Semanas OK',semanasOk+' / '+(ventas.length||0)+'','',semanasOk>0?'var(--green)':'var(--text3)')
    +_kpiBox('Bonus bruto','€',bonusBruto,'var(--green)')
    +_kpiBox('Penalización FIO','€',penEur,'var(--red)')
    +_kpiBox('Bonus final','€',bonusFinal,bonusFinal>0?'var(--green)':'var(--text3)')
    +'</div>'

    // Detalle semanas
    +'<div class="card" style="margin-bottom:16px;">'
    +'<div style="font-weight:600;margin-bottom:10px;">📅 Detalle semanas'
      +(rSemanal?' <span style="font-size:11px;color:var(--text3);">Objetivo: '+parseFloat(rSemanal.objetivo||0).toLocaleString('es-ES')+'€ → +'+parseFloat(rSemanal.importe_bonus||0)+'€</span>':'')
    +'</div>'
    +'<table><tr><th>Semana</th><th>Ventas</th><th>Estado</th><th>Bonus</th></tr>'
    +semanasRows+'</table></div>'

    // Resumen bonus
    +'<div class="card">'
    +'<div style="font-weight:600;margin-bottom:12px;">💰 Resumen bonus '+mesLabel+'</div>'
    +'<table>'
    +'<tr><td>Bonus semanal ('+semanasOk+' sem. × '+(rSemanal?parseFloat(rSemanal.importe_bonus||0)+'€':'—')+')</td>'
      +'<td style="font-family:var(--font-mono);text-align:right;">'+bonusSemanal.toFixed(2)+'€</td></tr>'
    +'<tr><td>Bonus mensual '+(rMensual?'(objetivo '+parseFloat(rMensual.objetivo||0).toLocaleString('es-ES')+'€)':'(sin regla activa)')+'</td>'
      +'<td style="font-family:var(--font-mono);text-align:right;">'+bonusMensual.toFixed(2)+'€</td></tr>'
    +'<tr><td>Penalización FIO · '+penBadge+'</td>'
      +'<td style="font-family:var(--font-mono);text-align:right;color:var(--red);">−'+penEur.toFixed(2)+'€</td></tr>'
    +'<tr style="border-top:2px solid var(--border);font-weight:700;">'
      +'<td>BONUS FINAL</td>'
      +'<td style="font-family:var(--font-mono);text-align:right;font-size:16px;color:'+(bonusFinal>0?'var(--green)':'var(--text3)')+';">'+bonusFinal.toFixed(2)+'€</td>'
    +'</tr></table>'
    +'<p style="font-size:11px;color:var(--text3);margin-top:10px;">* Pendiente de revisión y aprobación por dirección.</p>'
    +'</div>';
}
// ── VISTA EMPLEADO RECEPCIÓN ─────────────────────────────────────────
// Incentivo = 10% sobre neto (IVA 21% SYNCROLAB, 10% desayuno/comida_cena)
// Fuente: tabla recepcion_ventas (una fila por venta)

async function loadIncentivosEmpleadoRecepcion(){
  var el = document.getElementById('inc-emp-content');
  if(!el) return;
  el.innerHTML = '<p style="color:var(--text3);">Calculando…</p>';

  var ym    = _incentivosSelectedMonth;
  var range = getMonthDateRange(ym);
  var empId = currentUser.id;
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = ym.split('-');
  var mesLabel = meses[parseInt(parts[1])-1]+' '+parts[0];

  // 1. Ventas del mes de este empleado
  var ventasRes = await fetch(
    SUPABASE_URL+'/rest/v1/recepcion_ventas?employee_id=eq.'+encodeURIComponent(empId)
      +'&fecha=gte.'+range.inicio+'&fecha=lte.'+range.fin
      +'&select=*&order=fecha.asc',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var ventas = ventasRes.ok ? await ventasRes.json() : [];

  // 2. FIO del mes
  var fioRes = await fetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=eq.'+encodeURIComponent(empId)
      +'&incentive_month=eq.'+ym+'&status=in.(Validado,Cerrado,Disputado)&select=applied_points',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var fios = fioRes.ok ? await fioRes.json() : [];
  var totalPuntosFio = (fios||[]).reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);

  // 3. Calcular totales por tipo
  var totales = { desayuno:0, comida_cena:0, syncrolab:0 };
  var incentivoBruto = 0;
  (ventas||[]).forEach(function(v){
    var inc = parseFloat(v.incentivo||0);
    incentivoBruto += inc;
    if(v.tipo_venta === 'desayuno')    totales.desayuno    += parseFloat(v.importe_neto||0);
    if(v.tipo_venta === 'comida_cena') totales.comida_cena += parseFloat(v.importe_neto||0);
    if(v.tipo_venta === 'syncrolab')   totales.syncrolab   += parseFloat(v.importe_neto||0);
  });

  var penPct   = getFioPenalizacion(totalPuntosFio);
  var penEur   = incentivoBruto * penPct;
  var incFinal = Math.max(0, incentivoBruto - penEur);

  // 4. Tabla detalle ventas
  var TIPO_LABEL = {desayuno:'🌅 Desayuno', comida_cena:'🍽 Comida/Cena', syncrolab:'💪 SYNCROLAB'};
  var filaVentas = (ventas||[]).length ? ventas.map(function(v){
    return '<tr>'
      +'<td>'+fmtDate(v.fecha)+'</td>'
      +'<td>'+(TIPO_LABEL[v.tipo_venta]||v.tipo_venta)+(v.tipo_servicio?' · <span style="color:var(--text3);">'+v.tipo_servicio+'</span>':'')+'</td>'
      +'<td style="font-family:var(--font-mono);">'+parseFloat(v.importe_bruto||0).toFixed(2)+'€</td>'
      +'<td style="font-family:var(--font-mono);color:var(--text2);">'+parseFloat(v.importe_neto||0).toFixed(2)+'€</td>'
      +'<td style="font-family:var(--font-mono);color:var(--green);">+'+parseFloat(v.incentivo||0).toFixed(2)+'€</td>'
      +'<td style="color:var(--text3);">'+(v.mews_ref||'—')+'</td>'
      +'</tr>';
  }).join('') : '<tr><td colspan="6" style="color:var(--text3);text-align:center;">Sin ventas registradas este mes</td></tr>';

  var penBadge = penPct > 0
    ? '<span class="badge b-red">−'+Math.round(penPct*100)+'% FIO ('+totalPuntosFio.toFixed(1)+' pts)</span>'
    : '<span class="badge b-green">Sin penalización FIO</span>';

  el.innerHTML = ''
    +'<h3 style="margin:0 0 16px;font-size:15px;color:var(--text2);">'+mesLabel+' · '+currentUser.nombre+'</h3>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px;">'
    +_kpiBox('Desayunos','€',totales.desayuno,'var(--amber)')
    +_kpiBox('Comida/Cena','€',totales.comida_cena,'var(--orange)')
    +_kpiBox('SYNCROLAB','€',totales.syncrolab,'var(--cyan)')
    +_kpiBox('Incentivo bruto','€',incentivoBruto,'var(--green)')
    +_kpiBox('Penalización FIO','€',penEur,'var(--red)')
    +_kpiBox('INCENTIVO FINAL','€',incFinal,incFinal>0?'var(--green)':'var(--text3)')
    +'</div>'
    +'<div class="card" style="margin-bottom:16px;">'
    +'<div style="font-weight:600;margin-bottom:10px;">📋 Detalle ventas '+mesLabel+'</div>'
    +'<div class="tbl-wrap"><table>'
    +'<tr><th>Fecha</th><th>Tipo</th><th>Bruto</th><th>Neto</th><th>Incentivo</th><th>MEWS ref</th></tr>'
    +filaVentas+'</table></div></div>'
    +'<div class="card">'
    +'<div style="font-weight:600;margin-bottom:12px;">💰 Resumen '+mesLabel+'</div>'
    +'<table>'
    +'<tr><td>Incentivo bruto (10% neto ventas)</td><td style="font-family:var(--font-mono);text-align:right;">'+incentivoBruto.toFixed(2)+'€</td></tr>'
    +'<tr><td>Penalización FIO · '+penBadge+'</td><td style="font-family:var(--font-mono);text-align:right;color:var(--red);">−'+penEur.toFixed(2)+'€</td></tr>'
    +'<tr style="border-top:2px solid var(--border);font-weight:700;">'
    +'<td>INCENTIVO FINAL</td>'
    +'<td style="font-family:var(--font-mono);text-align:right;font-size:16px;color:'+(incFinal>0?'var(--green)':'var(--text3)')+';">'+incFinal.toFixed(2)+'€</td>'
    +'</tr></table>'
    +'<p style="font-size:11px;color:var(--text3);margin-top:10px;">* Pendiente de revisión y aprobación por dirección. IVA: Desayuno/Comida 10%, SYNCROLAB 21%.</p>'
    +'</div>';
}
window.loadIncentivosEmpleadoRecepcion = loadIncentivosEmpleadoRecepcion;

window.loadIncentivosEmpleado = loadIncentivosEmpleado;

function _kpiBox(label, unit, val, color){
  var display = (typeof val === 'number')
    ? val.toLocaleString('es-ES',{minimumFractionDigits:2})+unit
    : String(val);
  return '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:14px;text-align:center;">'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">'+label+'</div>'
    +'<div style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:'+color+';">'+display+'</div>'
    +'</div>';
}

// ── VISTA GESTOR ─────────────────────────────────────────────────────

async function renderIncentivosGestor(el){
  var monthOpts = getMonthOptions(6);
  if(!_incentivosSelectedMonth) _incentivosSelectedMonth = monthOpts[0].value;

  // Departamentos que puede gestionar — piloto Sala
  var depts = ['Sala','Jefe de Sala'];

  if(!depts.length){
    el.innerHTML='<div class="card"><p style="color:var(--text3);padding:20px 0;">Motor de incentivos aún no disponible para tu departamento.</p></div>';
    return;
  }

  var selMonth = monthOpts.map(function(o){
    return '<option value="'+o.value+'"'+(o.value===_incentivosSelectedMonth?' selected':'')+'>'+o.label+'</option>';
  }).join('');

  el.innerHTML = '<div class="card">'
    +'<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:20px;flex-wrap:wrap;">'
    +'<div class="fg" style="min-width:180px;"><label>Mes</label>'
    +'<select id="inc-gest-month" onchange="onIncGestMonthChange(this.value)">'+selMonth+'</select></div>'
    +'<button class="btn btn-primary" onclick="calcularIncentivosGestor()">⚙ Calcular mes</button>'
    +'</div>'
    +'<div id="inc-gest-content"><p style="color:var(--text3);">Selecciona mes y pulsa Calcular.</p></div>'
    +'</div>';
}

async function onIncGestMonthChange(val){
  _incentivosSelectedMonth = val;
  var el = document.getElementById('inc-gest-content');
  if(el) el.innerHTML = '<p style="color:var(--text3);">Pulsa Calcular para actualizar.</p>';
}
window.onIncGestMonthChange = onIncGestMonthChange;

async function calcularIncentivosGestor(){
  var el = document.getElementById('inc-gest-content');
  if(!el) return;
  el.innerHTML = '<p style="color:var(--text3);">Calculando…</p>';

  var ym    = _incentivosSelectedMonth;
  var range = getMonthDateRange(ym);
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = ym.split('-');
  var mesLabel = meses[parseInt(parts[1])-1]+' '+parts[0];

  // Empleados activos Sala
  var allEmps = await getDB('employees');
  var emps = allEmps.filter(function(e){
    return e.estado==='Activo' && e.id!=='E13'
      && (e.area==='Sala'||e.area==='Jefe de Sala');
  });

  if(!emps.length){
    el.innerHTML = '<p style="color:var(--text3);">Sin empleados activos en Sala.</p>';
    return;
  }

  // Reglas activas Sala
  var allRules = await getDB('dept_incentive_rules');
  var rules    = (allRules||[]).filter(function(r){
    return r.activo && (r.departamento==='Sala'||r.departamento==='Jefe de Sala');
  });
  var rSemanal = rules.find(function(r){ return r.periodo==='semanal'; });
  var rMensual  = rules.find(function(r){ return r.periodo==='mensual'; });

  // Ventas del mes (todos los empleados Sala de una sola llamada)
  var ventasRes = await fetch(
    SUPABASE_URL+'/rest/v1/employee_sales_weekly'
      +'?departamento=in.(Sala,Jefe%20de%20Sala)'
      +'&fecha_inicio_semana=gte.'+range.inicio
      +'&fecha_inicio_semana=lte.'+range.fin
      +'&select=employee_id,ventas,fecha_inicio_semana',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var ventasData = ventasRes.ok ? await ventasRes.json() : [];

  // FIOs del mes (todos Sala)
  var empIds = emps.map(function(e){ return e.id; }).join(',');
  var fioRes = await fetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=in.('+empIds+')'
      +'&incentive_month=eq.'+ym
      +'&status=in.(Validado,Cerrado,Disputado)'
      +'&select=employee_id,applied_points',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var fioData = fioRes.ok ? await fioRes.json() : [];

  // Calcular por empleado
  var resultados = emps.map(function(e){
    var misVentas = (ventasData||[]).filter(function(v){ return v.employee_id===e.id; });
    var totalMes  = misVentas.reduce(function(s,v){ return s+parseFloat(v.ventas||0); },0);
    var semanasOk = rSemanal ? misVentas.filter(function(v){
      return parseFloat(v.ventas||0) >= parseFloat(rSemanal.objetivo||0);
    }).length : 0;

    var bonusSemanal = rSemanal ? semanasOk * parseFloat(rSemanal.importe_bonus||0) : 0;
    var bonusMensual = (rMensual && totalMes >= parseFloat(rMensual.objetivo||0))
      ? parseFloat(rMensual.importe_bonus||0) : 0;
    var bonusBruto   = bonusSemanal + bonusMensual;

    var misFio   = (fioData||[]).filter(function(f){ return f.employee_id===e.id; });
    var ptosFio  = misFio.reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);
    var penPct   = getFioPenalizacion(ptosFio);
    var penEur   = bonusBruto * penPct;
    var bonusFinal = Math.max(0, bonusBruto - penEur);

    return {
      emp: e,
      totalMes: totalMes,
      semanasOk: semanasOk,
      semanasTotales: misVentas.length,
      bonusSemanal: bonusSemanal,
      bonusMensual: bonusMensual,
      bonusBruto: bonusBruto,
      ptosFio: ptosFio,
      penPct: penPct,
      penEur: penEur,
      bonusFinal: bonusFinal
    };
  });

  var totalBonuses = resultados.reduce(function(s,r){ return s+r.bonusFinal; },0);

  var rows = resultados.map(function(r){
    var penBadge = r.penPct > 0
      ? '<span class="badge b-red">−'+Math.round(r.penPct*100)+'%</span>'
      : '—';
    return '<tr>'
      +'<td><strong>'+r.emp.nombre+'</strong></td>'
      +'<td style="font-family:var(--font-mono);">'+r.totalMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
      +'<td style="text-align:center;">'+r.semanasOk+'/'+r.semanasTotales+'</td>'
      +'<td style="font-family:var(--font-mono);">'+r.bonusBruto.toFixed(2)+'€</td>'
      +'<td style="text-align:center;">'+r.ptosFio.toFixed(1)+'pts '+penBadge+'</td>'
      +'<td style="font-family:var(--font-mono);font-weight:700;color:'+(r.bonusFinal>0?'var(--green)':'var(--text3)')+';">'+r.bonusFinal.toFixed(2)+'€</td>'
      +'</tr>';
  }).join('');

  el.innerHTML = '<h3 style="margin:0 0 14px;font-size:15px;">Sala · '+mesLabel+'</h3>'
    +'<table>'
    +'<tr><th>Empleado</th><th>Ventas mes</th><th>Sem. OK</th><th>Bonus bruto</th><th>FIO</th><th>Bonus final</th></tr>'
    +rows
    +'<tr style="border-top:2px solid var(--border);font-weight:700;">'
    +'<td colspan="5">TOTAL A PAGAR</td>'
    +'<td style="font-family:var(--font-mono);font-size:15px;color:var(--accent);">'+totalBonuses.toFixed(2)+'€</td>'
    +'</tr></table>'
    +'<p style="font-size:11px;color:var(--text3);margin-top:12px;">'
    +'Calculado el '+new Date().toLocaleDateString('es-ES')+' · Pendiente de aprobación. '
    +(rSemanal?'Regla semanal: ≥'+parseFloat(rSemanal.objetivo||0).toLocaleString('es-ES')+'€ → +'+parseFloat(rSemanal.importe_bonus||0)+'€. ':'')
    +(rMensual?'Regla mensual: ≥'+parseFloat(rMensual.objetivo||0).toLocaleString('es-ES')+'€ → +'+parseFloat(rMensual.importe_bonus||0)+'€.':'')
    +'</p>';
}
window.calcularIncentivosGestor = calcularIncentivosGestor;

// ═══════════════════════════════════════════════════════════════════════
// IMPORTADOR EXCEL POSMEWS → employee_sales_weekly
// Formato: 1 hoja, col[0]=datetime fecha, col[11]=ventas netas sin IVA
// Cabecera usuario: "Usuario: NOMBRE" (col2 vacía)
// ═══════════════════════════════════════════════════════════════════════

var _incImportTab = 'calcular'; // 'calcular' | 'importar' | 'reglas'

async function renderIncentivosGestor(el){
  var monthOpts = getMonthOptions(6);
  if(!_incentivosSelectedMonth) _incentivosSelectedMonth = monthOpts[0].value;

  var selMonth = monthOpts.map(function(o){
    return '<option value="'+o.value+'"'+(o.value===_incentivosSelectedMonth?' selected':'')+'>'+o.label+'</option>';
  }).join('');

  function tabBtn(id, label) {
    var active = _incImportTab === id;
    return '<button onclick="_incImportTab=\''+id+'\';renderIncentivos()" style="'
      +'padding:7px 16px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:13px;font-weight:600;'
      +(active ? 'background:var(--amber);color:#fff;border-color:var(--amber);' : 'background:var(--bg2);color:var(--text2);')
      +'">'+label+'</button>';
  }

  el.innerHTML = '<div class="card">'
    +'<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">'
    +tabBtn('calcular','📊 Calcular mes')
    +tabBtn('importar','📥 Importar Excel')
    +(canActAsAdmin(currentUser) ? tabBtn('reglas','⚙ Reglas') : '')
    +'</div>'
    +'<div id="inc-gest-content"><p style="color:var(--text3);">Cargando…</p></div>'
    +'</div>';

  if(_incImportTab === 'calcular') {
    var c = document.getElementById('inc-gest-content');
    if(c) c.innerHTML = '<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:20px;flex-wrap:wrap;">'
      +'<div class="fg" style="min-width:180px;"><label>Mes</label>'
      +'<select id="inc-gest-month" onchange="onIncGestMonthChange(this.value)">'+selMonth+'</select></div>'
      +'<button class="btn btn-primary" onclick="calcularIncentivosGestor()">⚙ Calcular mes</button>'
      +'</div>'
      +'<div id="inc-calc-result"><p style="color:var(--text3);">Selecciona mes y pulsa Calcular.</p></div>';
  } else if(_incImportTab === 'importar') {
    renderIncImportadorExcel();
  } else if(_incImportTab === 'reglas') {
    await renderIncReglas();
  }
}
// Sobrescribe la anterior — última definición gana (arquitectura del proyecto)
window.renderIncentivosGestor = renderIncentivosGestor;

// Redirigir calcularIncentivosGestor al nuevo contenedor
async function calcularIncentivosGestor(){
  var el = document.getElementById('inc-calc-result') || document.getElementById('inc-gest-content');
  if(!el) return;
  el.innerHTML = '<p style="color:var(--text3);">Calculando…</p>';

  var ym    = _incentivosSelectedMonth;
  var range = getMonthDateRange(ym);
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = ym.split('-');
  var mesLabel = meses[parseInt(parts[1])-1]+' '+parts[0];

  // ── SALA ──────────────────────────────────────────────────────────
  var allEmps = await getDB('employees');
  var empsSala = allEmps.filter(function(e){
    return e.estado==='Activo' && e.id!=='E13'
      && (e.area==='Sala'||e.area==='Jefe de Sala');
  });

  var allRules = await getDB('dept_incentive_rules');
  var rules    = (allRules||[]).filter(function(r){ return r.activo && (r.departamento==='Sala'||r.departamento==='Jefe de Sala'); });
  var rSemanal = rules.find(function(r){ return r.periodo==='semanal'; });
  var rMensual  = rules.find(function(r){ return r.periodo==='mensual'; });

  var ventasRes = await fetch(
    SUPABASE_URL+'/rest/v1/employee_sales_weekly'
      +'?departamento=in.(Sala,Jefe%20de%20Sala)'
      +'&fecha_inicio_semana=gte.'+range.inicio
      +'&fecha_inicio_semana=lte.'+range.fin
      +'&select=employee_id,ventas,fecha_inicio_semana',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var ventasData = ventasRes.ok ? await ventasRes.json() : [];

  var empIdsSala = empsSala.map(function(e){ return e.id; }).join(',');
  var fioResSala = empIdsSala ? await fetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=in.('+empIdsSala+')'
      +'&incentive_month=eq.'+ym+'&status=in.(Validado,Cerrado,Disputado)&select=employee_id,applied_points',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  ) : null;
  var fioDataSala = (fioResSala && fioResSala.ok) ? await fioResSala.json() : [];

  var resultadosSala = empsSala.map(function(e){
    var misVentas = (ventasData||[]).filter(function(v){ return v.employee_id===e.id; });
    var totalMes  = misVentas.reduce(function(s,v){ return s+parseFloat(v.ventas||0); },0);
    var semanasOk = rSemanal ? misVentas.filter(function(v){ return parseFloat(v.ventas||0)>=parseFloat(rSemanal.objetivo||0); }).length : 0;
    var bonusSemanal = rSemanal ? semanasOk*parseFloat(rSemanal.importe_bonus||0) : 0;
    var bonusMensual = (rMensual&&totalMes>=parseFloat(rMensual.objetivo||0)) ? parseFloat(rMensual.importe_bonus||0) : 0;
    var bonusBruto   = bonusSemanal+bonusMensual;
    var misFio   = (fioDataSala||[]).filter(function(f){ return f.employee_id===e.id; });
    var ptosFio  = misFio.reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);
    var penPct   = getFioPenalizacion(ptosFio);
    var bonusFinal = Math.max(0, bonusBruto*(1-penPct));
    return { emp:e, dept:'Sala', ventasMes:totalMes, semanasOk:semanasOk, semanasTotales:misVentas.length,
             bonusBruto:bonusBruto, ptosFio:ptosFio, penPct:penPct, bonusFinal:bonusFinal };
  });

  // ── RECEPCIÓN ────────────────────────────────────────────────────
  var empsRec = allEmps.filter(function(e){
    return e.estado==='Activo' && e.area==='Recepción';
  });

  var recVentasRes = empsRec.length ? await fetch(
    SUPABASE_URL+'/rest/v1/recepcion_ventas'
      +'?fecha=gte.'+range.inicio+'&fecha=lte.'+range.fin
      +'&select=employee_id,incentivo,tipo_venta',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  ) : null;
  var recVentasData = (recVentasRes && recVentasRes.ok) ? await recVentasRes.json() : [];

  var empIdsRec = empsRec.map(function(e){ return e.id; }).join(',');
  var fioResRec = empIdsRec ? await fetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=in.('+empIdsRec+')'
      +'&incentive_month=eq.'+ym+'&status=in.(Validado,Cerrado,Disputado)&select=employee_id,applied_points',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  ) : null;
  var fioDataRec = (fioResRec && fioResRec.ok) ? await fioResRec.json() : [];

  var resultadosRec = empsRec.map(function(e){
    var misVentas  = (recVentasData||[]).filter(function(v){ return v.employee_id===e.id; });
    var incBruto   = misVentas.reduce(function(s,v){ return s+parseFloat(v.incentivo||0); },0);
    var misFio     = (fioDataRec||[]).filter(function(f){ return f.employee_id===e.id; });
    var ptosFio    = misFio.reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);
    var penPct     = getFioPenalizacion(ptosFio);
    var incFinal   = Math.max(0, incBruto*(1-penPct));
    return { emp:e, dept:'Recepción', ventasMes:incBruto/0.10||0, semanasOk:'—', semanasTotales:'—',
             bonusBruto:incBruto, ptosFio:ptosFio, penPct:penPct, bonusFinal:incFinal };
  });

  // ── RENDER UNIFICADO ─────────────────────────────────────────────
  var todos = resultadosSala.concat(resultadosRec);
  var totalBonuses = todos.reduce(function(s,r){ return s+r.bonusFinal; },0);

  var rows = todos.map(function(r){
    var penBadge = r.penPct>0 ? '<span class="badge b-red">−'+Math.round(r.penPct*100)+'%</span>' : '—';
    var deptColor = r.dept==='Recepción' ? 'var(--purple)' : 'var(--amber)';
    return '<tr>'
      +'<td><strong>'+r.emp.nombre+'</strong> <span style="font-size:10px;color:'+deptColor+';">'+r.dept+'</span></td>'
      +'<td style="font-family:var(--font-mono);">'+(typeof r.ventasMes==='number'?r.ventasMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€':'—')+'</td>'
      +'<td style="text-align:center;">'+(typeof r.semanasOk==='number'?r.semanasOk+'/'+r.semanasTotales:r.semanasOk)+'</td>'
      +'<td style="font-family:var(--font-mono);">'+r.bonusBruto.toFixed(2)+'€</td>'
      +'<td style="text-align:center;">'+r.ptosFio.toFixed(1)+'pts '+penBadge+'</td>'
      +'<td style="font-family:var(--font-mono);font-weight:700;color:'+(r.bonusFinal>0?'var(--green)':'var(--text3)')+';">'+r.bonusFinal.toFixed(2)+'€</td>'
      +'</tr>';
  }).join('');

  el.innerHTML = '<h3 style="margin:0 0 14px;font-size:15px;">Sala + Recepción · '+mesLabel+'</h3>'
    +'<div class="tbl-wrap"><table>'
    +'<tr><th>Empleado</th><th>Ventas mes</th><th>Sem. OK</th><th>Incentivo bruto</th><th>FIO</th><th>Incentivo final</th></tr>'
    +(rows||'<tr><td colspan="6" style="color:var(--text3);text-align:center;">Sin empleados activos</td></tr>')
    +'<tr style="border-top:2px solid var(--border);font-weight:700;">'
    +'<td colspan="5">TOTAL A PAGAR</td>'
    +'<td style="font-family:var(--font-mono);font-size:15px;color:var(--amber);">'+totalBonuses.toFixed(2)+'€</td>'
    +'</tr></table></div>'
    +'<p style="font-size:11px;color:var(--text3);margin-top:12px;">'
    +'Sala: '+(rSemanal?'objetivo sem. '+parseFloat(rSemanal.objetivo||0).toLocaleString('es-ES')+'€ → +'+parseFloat(rSemanal.importe_bonus||0)+'€. ':'sin regla. ')
    +'Recepción: 10% neto sobre ventas cross-sell declaradas en turno.'
    +'</p>';
}
window.calcularIncentivosGestor = calcularIncentivosGestor;

// ── IMPORTADOR EXCEL ────────────────────────────────────────────────────

function renderIncImportadorExcel() {
  var c = document.getElementById('inc-gest-content');
  if(!c) return;
  c.innerHTML = `
    <p style="font-size:12px;color:var(--text2);margin-bottom:16px;">
      Selecciona el archivo Excel de análisis de ventas exportado desde POSMEWS.
      El sistema detectará automáticamente los empleados y distribuirá las ventas por semanas.
    </p>
    <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:16px;flex-wrap:wrap;">
      <div class="fg" style="min-width:180px;">
        <label>Mes del informe <span class="req">*</span></label>
        <select id="inc-import-month">
          ${getMonthOptions(6).map(function(o){
            return '<option value="'+o.value+'"'+(o.value===_incentivosSelectedMonth?' selected':'')+'>'+o.label+'</option>';
          }).join('')}
        </select>
      </div>
      <div class="fg">
        <label>Archivo Excel POSMEWS <span class="req">*</span></label>
        <input type="file" id="inc-excel-file" accept=".xlsx,.xls"
          style="background:var(--bg2);color:var(--text);border:1px solid var(--border);padding:7px;border-radius:6px;width:100%;"
          onchange="incPreviewExcel(this)">
      </div>
    </div>
    <div id="inc-import-preview"></div>
  `;
}
window.renderIncImportadorExcel = renderIncImportadorExcel;

async function incPreviewExcel(input) {
  var file = input.files[0];
  if(!file) return;
  var prev = document.getElementById('inc-import-preview');
  if(!prev) return;
  prev.innerHTML = '<p style="color:var(--text3);">Leyendo archivo…</p>';

  try {
    var arrayBuf = await file.arrayBuffer();
    var result   = await incParseExcelBuffer(arrayBuf);

    if(!result || !result.length) {
      prev.innerHTML = '<p style="color:var(--red);">No se detectaron datos de empleados en el archivo.</p>';
      return;
    }

    var ym = document.getElementById('inc-import-month').value || _incentivosSelectedMonth;
    var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var mesLabel = meses[parseInt(ym.split('-')[1])-1]+' '+ym.split('-')[0];

    // Distribuir por semanas del mes
    var porSemana = incDistribuirPorSemana(result, ym);

    var rows = result.map(function(r){
      return '<tr>'
        +'<td><strong>'+r.nombre+'</strong></td>'
        +'<td style="font-family:var(--font-mono);">'+r.total.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
        +'<td style="text-align:center;">'+r.dias+' días</td>'
        +'<td style="font-size:11px;color:var(--text3);">'+
          (porSemana[r.nombre]||[]).map(function(s){ return s.semana+': '+s.ventas.toLocaleString('es-ES',{minimumFractionDigits:2})+'€'; }).join(' · ')
        +'</td>'
        +'</tr>';
    }).join('');

    var totalGeneral = result.reduce(function(s,r){ return s+r.total; },0);

    prev.innerHTML = `
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--radius2);padding:14px;margin-bottom:14px;">
        <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--amber);margin-bottom:10px;letter-spacing:.12em;">
          PREVISUALIZACIÓN — ${mesLabel} · ${result.length} empleados detectados
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Empleado</th><th>Total mes</th><th>Días</th><th>Por semana</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);">
              <td>TOTAL RESTAURANTE</td>
              <td style="font-family:var(--font-mono);">${totalGeneral.toLocaleString('es-ES',{minimumFractionDigits:2})}€</td>
              <td colspan="2"></td>
            </tr></tfoot>
          </table>
        </div>
        <p style="font-size:11px;color:var(--text3);margin-top:8px;">
          ⚠ Las ventas se asignarán al empleado por nombre. Verifica que los nombres coincidan con los empleados en el sistema.
        </p>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="incImportarExcel()">💾 Importar a ${mesLabel}</button>
      </div>
    `;

    // Guardar resultado en variable global para el import
    window._incExcelResult = { data: result, semanas: porSemana, ym: ym };

  } catch(e) {
    prev.innerHTML = '<p style="color:var(--red);">Error al leer el archivo: '+e.message+'</p>';
    console.error('incPreviewExcel error', e);
  }
}
window.incPreviewExcel = incPreviewExcel;

// ── PARSER EXCEL (usa SheetJS si disponible, si no fallback manual) ──
async function incParseExcelBuffer(arrayBuf) {
  // Intentar con SheetJS (XLSX global si está cargado)
  if(typeof XLSX !== 'undefined') {
    return incParseWithSheetJS(arrayBuf);
  }
  // SheetJS no disponible — cargar dinámicamente
  await new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return incParseWithSheetJS(arrayBuf);
}

function incParseWithSheetJS(arrayBuf) {
  // raw:true + cellDates:false → col0 fecha = número serial Excel (ej: 46143)
  // Más robusto que raw:false que depende del locale del OS
  var wb = XLSX.read(arrayBuf, {type:'array', cellDates:false, raw:true});
  var ws = wb.Sheets[wb.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});

  var currentUser = null;
  var userTotals = {};
  var userDayVentas = {};
  var COL_VENTAS_NETAS = 11;

  // Convertir número serial Excel → "yyyy-mm-dd"
  // Excel serial 1 = 1900-01-01, pero tiene el bug del año 1900 (serial 60 = 28-Feb-1900 inválido)
  function excelSerialToISO(serial) {
    var s = Math.floor(serial);
    if(s < 1) return null;
    if(s > 60) s--; // corregir bug 1900 de Excel
    var d = new Date(1900, 0, 1); // 1 Jan 1900
    d.setDate(d.getDate() + s - 1);
    var y = d.getFullYear();
    var mo = String(d.getMonth()+1).padStart(2,'0');
    var da = String(d.getDate()).padStart(2,'0');
    return y+'-'+mo+'-'+da;
  }

  // Detectar si un valor es un serial de fecha Excel razonable (2020-2030 → 43831-49352)
  function isExcelDateSerial(v) {
    return typeof v === 'number' && v > 43000 && v < 55000;
  }

  rows.forEach(function(row) {
    if(!row || row[0] === null || row[0] === undefined) return;
    var c0 = row[0];
    var c0str = String(c0).trim();

    // Cabecera de usuario: string que empieza por "Usuario:"
    if(typeof c0 === 'string' && c0str.startsWith('Usuario:')) {
      // Si col1 tiene valor numérico = línea de total del usuario → ignorar
      var col1 = row[1];
      var isTotal = col1 !== null && col1 !== undefined && !isNaN(parseFloat(String(col1)));
      if(!isTotal) {
        currentUser = c0str.replace('Usuario:','').trim();
      }
      return;
    }

    // Fila de dato: col0 es serial de fecha Excel
    if(currentUser && isExcelDateSerial(c0)) {
      var ventasRaw = row[COL_VENTAS_NETAS];
      if(ventasRaw === null || ventasRaw === undefined) return;
      var ventasNetas = parseFloat(String(ventasRaw).replace(',','.'));
      if(isNaN(ventasNetas)) return;

      var fechaISO = excelSerialToISO(c0);
      if(!fechaISO) return;

      if(!userTotals[currentUser]) {
        userTotals[currentUser] = { total: 0, dias: new Set() };
        userDayVentas[currentUser] = [];
      }
      userTotals[currentUser].total += ventasNetas;
      userTotals[currentUser].dias.add(fechaISO);
      userDayVentas[currentUser].push({ fecha: fechaISO, ventas: ventasNetas });
    }
  });

  return Object.keys(userTotals).map(function(nombre) {
    return {
      nombre: nombre,
      total: userTotals[nombre].total,
      dias: userTotals[nombre].dias.size,
      dayVentas: userDayVentas[nombre]
    };
  }).sort(function(a,b){ return b.total - a.total; });
}

// Distribuir ventas diarias en semanas ISO del mes
function incDistribuirPorSemana(empleados, ym) {
  var parts = ym.split('-');
  var y = parseInt(parts[0]), m = parseInt(parts[1]);

  // Obtener lunes de cada semana del mes
  var semanas = [];
  var d = new Date(y, m-1, 1);
  // Ir al lunes de la primera semana que toca este mes
  var dow = d.getDay(); // 0=dom
  var lunes = new Date(d);
  if(dow !== 1) {
    var diff = (dow === 0) ? -6 : 1 - dow;
    lunes.setDate(lunes.getDate() + diff);
  }
  while(lunes.getMonth() <= m-1 || (lunes.getFullYear() < y)) {
    var ini = new Date(lunes);
    var fin = new Date(lunes); fin.setDate(fin.getDate()+6);
    semanas.push({ ini: ini, fin: fin });
    lunes = new Date(lunes); lunes.setDate(lunes.getDate()+7);
    if(ini.getFullYear() > y || (ini.getFullYear() === y && ini.getMonth() > m-1)) break;
  }

  var result = {};
  empleados.forEach(function(emp) {
    result[emp.nombre] = semanas.map(function(sem) {
      var ventasSem = (emp.dayVentas||[]).filter(function(dv){
        var fd = new Date(dv.fecha+'T00:00:00');
        return fd >= sem.ini && fd <= sem.fin;
      }).reduce(function(s,dv){ return s+dv.ventas; },0);

      var p2 = function(n){ return String(n).padStart(2,'0'); };
      var semLabel = p2(sem.ini.getDate())+'/'+p2(sem.ini.getMonth()+1);
      var iniISO = sem.ini.getFullYear()+'-'+p2(sem.ini.getMonth()+1)+'-'+p2(sem.ini.getDate());
      return { semana: semLabel, ventas: ventasSem, fecha_inicio: iniISO };
    }).filter(function(s){ return s.ventas > 0; });
  });
  return result;
}

async function incImportarExcel() {
  var res = window._incExcelResult;
  if(!res || !res.data || !res.data.length) { toast('Sin datos para importar','warn'); return; }

  var ym = res.ym;
  if(!confirm('Importar ventas de '+res.data.length+' empleados para '+ym+'?\n\nEsto sobrescribirá los datos existentes de ese mes.')) return;

  // Buscar employee_id por nombre en employees
  var allEmps = await getDB('employees');
  var empMap = {};
  allEmps.forEach(function(e){ empMap[e.nombre.toLowerCase().trim()] = e; });

  var insertados = 0, noEncontrados = [];
  var range = getMonthDateRange(ym);

  for(var i=0; i<res.data.length; i++) {
    var emp = res.data[i];
    var empKey = emp.nombre.toLowerCase().trim();
    var found = empMap[empKey];

    // Fuzzy: buscar por primer nombre + primer apellido
    if(!found) {
      var parts = empKey.split(/\s+/);
      found = allEmps.find(function(e){
        var en = e.nombre.toLowerCase().trim().split(/\s+/);
        return en[0] === parts[0] && (parts.length < 2 || en.some(function(w){ return w === parts[1]; }));
      });
    }

    if(!found) { noEncontrados.push(emp.nombre); continue; }

    var semanasEmp = res.semanas[emp.nombre] || [];

    // Borrar registros existentes del mes para este empleado
    await sbRequest('DELETE', 'employee_sales_weekly',
      null, 'employee_id=eq.'+found.id
        +'&fecha_inicio_semana=gte.'+range.inicio
        +'&fecha_inicio_semana=lte.'+range.fin);

    // Insertar semana a semana
    for(var j=0; j<semanasEmp.length; j++) {
      var sem = semanasEmp[j];
      if(sem.ventas <= 0) continue;
      var row = {
        id:                  genId(),
        employee_id:         found.id,
        employee_name:       found.nombre,
        departamento:        found.area || 'Sala',
        year_week:           ym+'-S'+(j+1),
        fecha_inicio_semana: sem.fecha_inicio,
        ventas:              Math.round(sem.ventas * 100) / 100,
        comensales:          0,
        created_by:          currentUser.nombre,
        created_at:          localTs()
      };
      var ok = await sbRequest('POST','employee_sales_weekly', row);
      if(ok) insertados++;
    }
  }

  invalidateCache('employee_sales_weekly');
  var msg = '✅ Importados: '+insertados+' registros';
  if(noEncontrados.length) msg += ' · No encontrados: '+noEncontrados.join(', ');
  toast(msg, insertados > 0 ? 'ok' : 'warn');
  await auditLog('inc_excel_import', ym+' · '+insertados+' registros · '+res.data.length+' empleados');
  window._incExcelResult = null;
}
window.incImportarExcel = incImportarExcel;

// ── CONFIGURACIÓN DE REGLAS (solo admin) ────────────────────────────────

async function renderIncReglas() {
  var c = document.getElementById('inc-gest-content');
  if(!c) return;
  if(!canActAsAdmin(currentUser)) {
    c.innerHTML = '<p style="color:var(--text3);">Solo administradores pueden editar reglas.</p>';
    return;
  }

  var allRules = await getDB('dept_incentive_rules');
  var rules = (allRules||[]).filter(function(r){ return r.departamento==='Sala'||r.departamento==='Jefe de Sala'; });

  var rows = rules.map(function(r){
    return `<tr>
      <td>${r.departamento}</td>
      <td>${r.periodo}</td>
      <td style="font-family:var(--font-mono);">${parseFloat(r.objetivo||0).toLocaleString('es-ES',{minimumFractionDigits:2})}€</td>
      <td style="font-family:var(--font-mono);">${parseFloat(r.importe_bonus||0).toFixed(2)}€</td>
      <td><span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${r.activo?'var(--green-dim)':'var(--bg4)'};color:${r.activo?'var(--green)':'var(--text3)'};">${r.activo?'Activa':'Inactiva'}</span></td>
      <td>
        <button class="btn btn-secondary btn-xs" onclick="incEditRegla('${r.id}')">✏ Editar</button>
        <button class="btn btn-xs" style="background:var(--${r.activo?'orange':'green'}-dim);color:var(--${r.activo?'orange':'green'});border:1px solid var(--${r.activo?'orange':'green'});" 
          onclick="incToggleRegla('${r.id}',${r.activo})">${r.activo?'⏸ Pausar':'▶ Activar'}</button>
      </td>
    </tr>`;
  }).join('');

  c.innerHTML = `
    <div class="tbl-wrap" style="margin-bottom:16px;">
      <table>
        <thead><tr><th>Dept.</th><th>Periodo</th><th>Objetivo</th><th>Bonus</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="color:var(--text3);text-align:center;">Sin reglas configuradas</td></tr>'}</tbody>
      </table>
    </div>
    <button class="btn btn-primary" onclick="incNuevaRegla()">+ Nueva regla</button>
    <div id="inc-regla-form" style="margin-top:16px;"></div>
  `;
}
window.renderIncReglas = renderIncReglas;

function incNuevaRegla() {
  incMostrarFormRegla(null);
}
window.incNuevaRegla = incNuevaRegla;

async function incEditRegla(id) {
  var allRules = await getDB('dept_incentive_rules');
  var rule = (allRules||[]).find(function(r){ return r.id===id; });
  if(rule) incMostrarFormRegla(rule);
}
window.incEditRegla = incEditRegla;

function incMostrarFormRegla(rule) {
  var el = document.getElementById('inc-regla-form');
  if(!el) return;
  var isNew = !rule;
  el.innerHTML = `
    <div class="card" style="border-color:var(--amber);">
      <div class="card-title">${isNew?'NUEVA REGLA':'EDITAR REGLA'}</div>
      <div class="grid2" style="gap:12px;">
        <div class="fg"><label>Departamento</label>
          <select id="rf-dept">
            <option ${(!rule||rule.departamento==='Sala')?'selected':''}>Sala</option>
            <option ${(rule&&rule.departamento==='Jefe de Sala')?'selected':''}>Jefe de Sala</option>
          </select></div>
        <div class="fg"><label>Periodo</label>
          <select id="rf-periodo">
            <option value="semanal" ${(!rule||rule.periodo==='semanal')?'selected':''}>Semanal</option>
            <option value="mensual" ${(rule&&rule.periodo==='mensual')?'selected':''}>Mensual</option>
          </select></div>
        <div class="fg"><label>Objetivo ventas (€)</label>
          <input type="number" id="rf-objetivo" step="0.01" min="0" value="${rule?rule.objetivo:''}"></div>
        <div class="fg"><label>Importe bonus (€)</label>
          <input type="number" id="rf-bonus" step="0.01" min="0" value="${rule?rule.importe_bonus:''}"></div>
        <div class="fg sp2"><label>Notas</label>
          <input type="text" id="rf-notas" value="${rule&&rule.notas?rule.notas:''}"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="incGuardarRegla('${rule?rule.id:''}')">💾 Guardar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('inc-regla-form').innerHTML=''">Cancelar</button>
      </div>
    </div>`;
}
window.incMostrarFormRegla = incMostrarFormRegla;

async function incGuardarRegla(id) {
  var dept     = document.getElementById('rf-dept').value;
  var periodo  = document.getElementById('rf-periodo').value;
  var objetivo = parseFloat(document.getElementById('rf-objetivo').value||'0');
  var bonus    = parseFloat(document.getElementById('rf-bonus').value||'0');
  var notas    = document.getElementById('rf-notas').value||'';

  if(!objetivo||!bonus){ toast('Objetivo y bonus son obligatorios','warn'); return; }

  if(id) {
    // PATCH
    var ok = await fetch(SUPABASE_URL+'/rest/v1/dept_incentive_rules?id=eq.'+id, {
      method:'PATCH',
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({ departamento:dept, periodo:periodo, objetivo:objetivo, importe_bonus:bonus, notas:notas, updated_by:currentUser.nombre })
    });
    if(ok.ok){ toast('Regla actualizada','ok'); }
    else { toast('Error al guardar','error'); return; }
  } else {
    // INSERT
    var row = { id:genId(), departamento:dept, periodo:periodo, objetivo:objetivo, importe_bonus:bonus, activo:true, notas:notas, updated_by:currentUser.nombre, created_at:localTs() };
    var res = await sbRequest('POST','dept_incentive_rules',row);
    if(res){ toast('Regla creada','ok'); }
    else { toast('Error al crear','error'); return; }
  }
  invalidateCache('dept_incentive_rules');
  document.getElementById('inc-regla-form').innerHTML='';
  await renderIncReglas();
}
window.incGuardarRegla = incGuardarRegla;

async function incToggleRegla(id, activo) {
  var ok = await fetch(SUPABASE_URL+'/rest/v1/dept_incentive_rules?id=eq.'+id, {
    method:'PATCH',
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
    body: JSON.stringify({ activo: !activo, updated_by: currentUser.nombre })
  });
  if(ok.ok){ invalidateCache('dept_incentive_rules'); await renderIncReglas(); }
  else toast('Error','error');
}
window.incToggleRegla = incToggleRegla;
