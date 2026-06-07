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
  // Solo empleados de Sala ven esta pantalla por ahora
  if(currentUser.area !== 'Sala' && currentUser.area !== 'Jefe de Sala'){
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

  await loadIncentivosEmpleado();
}

async function onIncEmpleadoMonthChange(val){
  _incentivosSelectedMonth = val;
  await loadIncentivosEmpleado();
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
      +'&estado=in.(Validado,Cerrado)&select=applied_points',
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

  // Departamentos que puede gestionar
  var depts = (isAdmin(currentUser)||isAdjuntoDirectivo(currentUser))
    ? ['Sala','Jefe de Sala']
    : (canViewDepartmentList(currentUser).filter(function(d){
        return d==='Sala'||d==='Jefe de Sala';
      }));

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
      +'&estado=in.(Validado,Cerrado)'
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
