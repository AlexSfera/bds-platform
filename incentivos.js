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

// Devuelve el departamento activo en Informes (chip L1).
// Fallback: deduce por área del usuario para cuando se llama fuera de Informes.
function _incDeptActivo(){
  if(typeof _infDept !== 'undefined' && _infDept) return _infDept;
  var area = (currentUser && currentUser.area) || '';
  var puesto = (currentUser && currentUser.puesto) || '';
  var esEntren = typeof _esEntrenador==='function' ? _esEntrenador(currentUser)
    : ['Entrenador(a)','Coordinador(a) de Entrenadores'].indexOf(puesto) >= 0;
  if(esEntren) return 'Entrenadores';
  return area || 'Sala';
}

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
  var ventasRes = await syncroSupabaseFetch(
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
  var fioRes = await syncroSupabaseFetch(
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
  // ESQUEMA REAL: empleado_id, importe (bruto con IVA), reserva_mews, servicio_detalle
  var ventasRes = await syncroSupabaseFetch(
    SUPABASE_URL+'/rest/v1/recepcion_ventas?empleado_id=eq.'+encodeURIComponent(empId)
      +'&fecha=gte.'+range.inicio+'&fecha=lte.'+range.fin
      +'&select=*&order=fecha.asc',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var ventas = ventasRes.ok ? await ventasRes.json() : [];

  // 2. FIO del mes — excluir saldados (liquidados en periodos anteriores)
  var fioRes = await syncroSupabaseFetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=eq.'+encodeURIComponent(empId)
      +'&incentive_month=eq.'+ym+'&status=in.(Validado,Cerrado,Disputado)&saldado=is.false&select=applied_points',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var fios = fioRes.ok ? await fioRes.json() : [];
  var totalPuntosFio = (fios||[]).reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);

  // 3. Calcular neto e incentivo on-the-fly desde importe bruto con IVA
  // IVA: desayuno/comida_cena = 10%, syncrolab = 21% — incentivo = 10% sobre neto
  function _ivaFactor(tipo){ return tipo === 'syncrolab' ? 1.21 : 1.10; }
  var totales = { desayuno:0, comida_cena:0, syncrolab:0 };
  var incentivoBruto = 0;
  (ventas||[]).forEach(function(v){
    var bruto = parseFloat(v.importe||0);
    var neto  = bruto / _ivaFactor(v.tipo_venta);
    var inc   = neto * 0.10;
    v._neto   = neto;
    v._inc    = inc;
    incentivoBruto += inc;
    if(v.tipo_venta === 'desayuno')    totales.desayuno    += neto;
    if(v.tipo_venta === 'comida_cena') totales.comida_cena += neto;
    if(v.tipo_venta === 'syncrolab')   totales.syncrolab   += neto;
  });

  var penPct   = getFioPenalizacion(totalPuntosFio);
  var penEur   = incentivoBruto * penPct;
  var incFinal = Math.max(0, incentivoBruto - penEur);

  // 4. Tabla detalle ventas
  var TIPO_LABEL = {desayuno:'🌅 Desayuno', comida_cena:'🍽 Comida/Cena', syncrolab:'💪 SYNCROLAB'};
  var filaVentas = (ventas||[]).length ? ventas.map(function(v){
    return '<tr>'
      +'<td>'+fmtDate(v.fecha)+'</td>'
      +'<td>'+(TIPO_LABEL[v.tipo_venta]||v.tipo_venta)+(v.servicio_detalle?' · <span style="color:var(--text3);">'+v.servicio_detalle+'</span>':'')+'</td>'
      +'<td style="font-family:var(--font-mono);">'+parseFloat(v.importe||0).toFixed(2)+'€</td>'
      +'<td style="font-family:var(--font-mono);color:var(--text2);">'+(v._neto||0).toFixed(2)+'€</td>'
      +'<td style="font-family:var(--font-mono);color:var(--green);">+'+(v._inc||0).toFixed(2)+'€</td>'
      +'<td style="color:var(--text3);">'+(v.reserva_mews||'—')+'</td>'
      +'</tr>';
  }).join('') : '<tr><td colspan="6" style="color:var(--text3);text-align:center;">Sin ventas registradas este mes</td></tr>';

  var penBadge = penPct > 0
    ? '<span class="badge b-red">−'+Math.round(penPct*100)+'% FIO ('+totalPuntosFio.toFixed(1)+' pts)</span>'
    : '<span class="badge b-green">Sin penalización FIO</span>';

  // 4b. Comprobar si hay liquidación para este mes
  var liqRes = await syncroSupabaseFetch(
    SUPABASE_URL+'/rest/v1/incentivos_liquidaciones?empleado_id=eq.'+encodeURIComponent(empId)+'&mes=eq.'+ym+'&select=*&limit=1',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var liqData = liqRes.ok ? await liqRes.json() : [];
  var liquidacion = liqData.length > 0 ? liqData[0] : null;

  // Sello de liquidación (si existe)
  var selloBanner = '';
  if(liquidacion){
    var liqDate = liquidacion.liquidado_at ? new Date(liquidacion.liquidado_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
    selloBanner = '<div style="background:var(--green-dim);border:2px solid var(--green);border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">'
      +'<span style="font-size:22px;">✅</span>'
      +'<div><div style="font-weight:700;color:var(--green);font-size:13px;">LIQUIDADO</div>'
      +'<div style="font-size:11px;color:var(--text2);">'+liqDate+' · por '+( liquidacion.liquidado_por||'—')+'</div>'
      +(liquidacion.notas?'<div style="font-size:11px;color:var(--text3);margin-top:2px;">'+liquidacion.notas+'</div>':'')
      +'</div></div>';
  }

  el.innerHTML = ''
    +selloBanner
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
    +'<p style="font-size:11px;color:var(--text3);margin-top:10px;">* IVA: Desayuno/Comida 10%, SYNCROLAB 21%. Incentivo = 10% sobre neto.</p>'
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

async function onIncGestMonthChange(val){
  _incentivosSelectedMonth = val;
  var el = document.getElementById('inc-gest-content');
  if(el) el.innerHTML = '<p style="color:var(--text3);">Pulsa Calcular para actualizar.</p>';
}
window.onIncGestMonthChange = onIncGestMonthChange;

// ═══════════════════════════════════════════════════════════════════════
// IMPORTADOR EXCEL POSMEWS → employee_sales_weekly
// Formato: 1 hoja, col[0]=datetime fecha, col[11]=ventas netas sin IVA
// Cabecera usuario: "Usuario: NOMBRE" (col2 vacía)
// ═══════════════════════════════════════════════════════════════════════

var _incImportTab = 'calcular'; // 'calcular' | 'importar' | 'reglas'

async function renderIncentivosGestor(el){
  var dept = _incDeptActivo();
  var monthOpts = getMonthOptions(6);
  if(!_incentivosSelectedMonth) _incentivosSelectedMonth = monthOpts[0].value;

  // Depts sin incentivos activos aún
  var PRONTO = ['SYNCROLAB','Housekeeping','Mantenimiento','RRHH','Fisioterapeutas','Marketing'];
  if(PRONTO.indexOf(dept) >= 0){
    el.innerHTML = '<div class="card" style="text-align:center;padding:48px 24px;">'
      +'<div style="font-size:32px;margin-bottom:12px;">🚧</div>'
      +'<div style="font-family:var(--font-mono);font-weight:700;color:var(--text);font-size:15px;margin-bottom:8px;">Incentivos '+dept+'</div>'
      +'<div style="color:var(--text3);font-size:13px;">Módulo en desarrollo — próxima fase.</div>'
      +'</div>';
    return;
  }

  // Cocina — tabla existe pero cálculo pendiente de datos de Economato
  if(dept === 'Cocina'){
    await _incGestorCocina(el);
    return;
  }

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

  // Sala: Calcular + Importar Excel + Reglas
  // Recepción: Calcular + Reglas
  // Entrenadores: solo config/congelar/liquidar (lógica en mi_rendimiento.js)
  var tabs = '';
  if(dept === 'Sala'){
    tabs = tabBtn('calcular','📊 Calcular mes')
      + tabBtn('importar','📥 Importar Excel')
      + (canActAsAdmin(currentUser) ? tabBtn('reglas','⚙ Reglas') : '');
  } else if(dept === 'Recepción'){
    tabs = tabBtn('calcular','📊 Calcular mes')
      + (canActAsAdmin(currentUser) ? tabBtn('reglas','⚙ Reglas') : '');
  } else if(dept === 'Entrenadores'){
    // Config de métodos vive en mi_rendimiento.js — aquí solo aviso
    el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:12px 0;">⚙️ La configuración de métodos de incentivos de Entrenadores se gestiona desde <strong>Mi Rendimiento → Mi equipo</strong>.</p></div>';
    return;
  }

  el.innerHTML = '<div class="card">'
    +'<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">'
    + tabs
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
      +'<div id="inc-calc-result"><p style="color:var(--text3);">Pulsa Calcular para actualizar.</p></div>';
  } else if(_incImportTab === 'importar') {
    renderIncImportadorExcel();
  } else if(_incImportTab === 'reglas') {
    await renderIncReglas();
  }
}
window.renderIncentivosGestor = renderIncentivosGestor;

// ── COCINA — entrada de coste MP + vista incentivo ───────────────────
async function _incGestorCocina(el){
  var monthOpts = getMonthOptions(6);
  if(!_incentivosSelectedMonth) _incentivosSelectedMonth = monthOpts[0].value;
  var selMonth = monthOpts.map(function(o){
    return '<option value="'+o.value+'"'+(o.value===_incentivosSelectedMonth?' selected':'')+'>'+o.label+'</option>';
  }).join('');

  // Cargar dato existente del mes
  var ym = _incentivosSelectedMonth;
  var costeData = null;
  try {
    var r = await syncroSupabaseFetch(
      SUPABASE_URL+'/rest/v1/cocina_costes_mes?mes=eq.'+ym+'&select=*&limit=1',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    );
    var rows = r.ok ? await r.json() : [];
    costeData = rows[0] || null;
  } catch(e){}

  var pct = costeData ? parseFloat(costeData.porcentaje||0) : null;
  var cumpleEquipo = pct !== null && pct < 37;
  var cumpleJefe   = pct !== null && pct < 40;

  var resultadoHtml = '';
  if(costeData){
    resultadoHtml = '<div class="card" style="margin-top:14px;">'
      +'<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Resultado incentivo</div>'
      +'<div style="display:flex;gap:24px;flex-wrap:wrap;">'
      +'<div><div style="font-size:11px;color:var(--text3);">Coste MP / Ventas</div>'
      +'<div style="font-size:22px;font-weight:700;color:'+(cumpleJefe?'var(--green)':'var(--red)')+';">'+pct.toFixed(1)+'%</div></div>'
      +'<div><div style="font-size:11px;color:var(--text3);">Ventas comida</div>'
      +'<div style="font-size:18px;font-weight:700;color:var(--text);">'+parseFloat(costeData.ventas_comida||0).toLocaleString('es-ES',{minimumFractionDigits:2})+'€</div></div>'
      +'<div><div style="font-size:11px;color:var(--text3);">Coste MP</div>'
      +'<div style="font-size:18px;font-weight:700;color:var(--text);">'+parseFloat(costeData.coste_mp||0).toLocaleString('es-ES',{minimumFractionDigits:2})+'€</div></div>'
      +'</div>'
      +'<div style="margin-top:16px;display:flex;gap:16px;flex-wrap:wrap;">'
      +'<div style="padding:12px 18px;border-radius:8px;background:'+(cumpleEquipo?'var(--green-dim)':'var(--bg3)')+';border:1px solid '+(cumpleEquipo?'var(--green)':'var(--border)')+';">'
      +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Equipo Cocina (< 37%)</div>'
      +'<div style="font-weight:700;color:'+(cumpleEquipo?'var(--green)':'var(--text3)')+';">'+(cumpleEquipo?'✅ 100€/persona':'❌ No aplica')+'</div>'
      +'</div>'
      +'<div style="padding:12px 18px;border-radius:8px;background:'+(cumpleJefe?'var(--green-dim)':'var(--bg3)')+';border:1px solid '+(cumpleJefe?'var(--green)':'var(--border)')+';">'
      +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Andrés — Jefe Cocina (< 40%)</div>'
      +'<div style="font-weight:700;color:'+(cumpleJefe?'var(--green)':'var(--text3)')+';">'+(cumpleJefe?'✅ 200€':'❌ No aplica')+'</div>'
      +'</div>'
      +'</div>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:10px;">Subido por: '+(costeData.subido_por||'—')+' · '+new Date(costeData.created_at).toLocaleDateString('es-ES')+'</div>'
      +'</div>';
  } else {
    resultadoHtml = '<div class="card" style="margin-top:14px;text-align:center;padding:32px;"><p style="color:var(--text3);">Sin datos para este mes. Sube el informe de Economato.</p></div>';
  }

  el.innerHTML = '<div class="card">'
    +'<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Cocina · Coste materia prima</div>'
    +'<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;">'
    +'<div class="fg" style="min-width:180px;"><label>Mes</label>'
    +'<select id="inc-cocina-month" onchange="window._incentivosSelectedMonth=this.value;renderIncentivos()">'+selMonth+'</select></div>'
    +'</div>'
    +(canActAsAdmin(currentUser) ? '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">'
      +'<div class="fg"><label>Ventas comida (€)</label><input type="number" id="inc-coc-ventas" step="0.01" min="0" placeholder="0.00" value="'+(costeData?costeData.ventas_comida:'')+'"></div>'
      +'<div class="fg"><label>Coste materia prima (€)</label><input type="number" id="inc-coc-coste" step="0.01" min="0" placeholder="0.00" value="'+(costeData?costeData.coste_mp:'')+'"></div>'
      +'<div style="display:flex;align-items:flex-end;">'
      +'<button class="btn btn-primary" onclick="_incGuardarCocina()">💾 Guardar</button>'
      +'</div></div>' : '')
    +'</div>'
    + resultadoHtml;
}
window._incGestorCocina = _incGestorCocina;

async function _incGuardarCocina(){
  var ym      = _incentivosSelectedMonth;
  var ventas  = parseFloat(document.getElementById('inc-coc-ventas').value||'0');
  var coste   = parseFloat(document.getElementById('inc-coc-coste').value||'0');
  if(!ventas || !coste){ toast('Introduce ventas y coste','warn'); return; }
  var pct = (coste/ventas)*100;

  // Buscar registro existente
  try {
    var check = await syncroSupabaseFetch(
      SUPABASE_URL+'/rest/v1/cocina_costes_mes?mes=eq.'+ym+'&select=id&limit=1',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    );
    var existing = check.ok ? await check.json() : [];
    if(existing.length){
      // PATCH
      await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/cocina_costes_mes?id=eq.'+existing[0].id,{
        method:'PATCH',
        headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
        body:JSON.stringify({ventas_comida:ventas,coste_mp:coste,porcentaje:pct,subido_por:currentUser.nombre})
      });
    } else {
      // INSERT
      await sbRequest('POST','cocina_costes_mes',{
        id:genId(),mes:ym,ventas_comida:ventas,coste_mp:coste,porcentaje:pct,
        subido_por:currentUser.nombre,created_at:localTs()
      });
    }
    invalidateCache('cocina_costes_mes');
    toast('Datos guardados','ok');
    await renderIncentivos();
  } catch(e){ toast('Error al guardar','error'); }
}
window._incGuardarCocina = _incGuardarCocina;

// Redirigir calcularIncentivosGestor al nuevo contenedor
async function calcularIncentivosGestor(){
  var el = document.getElementById('inc-calc-result') || document.getElementById('inc-gest-content');
  if(!el) return;
  el.innerHTML = '<p style="color:var(--text3);">Calculando…</p>';

  var dept  = _incDeptActivo();
  var ym    = _incentivosSelectedMonth;
  var range = getMonthDateRange(ym);
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = ym.split('-');
  var mesLabel = meses[parseInt(parts[1])-1]+' '+parts[0];

  var allEmps = await getDB('employees');
  var todos = [];

  // ── SALA ──────────────────────────────────────────────────────────
  if(dept === 'Sala'){
    var empsSala = allEmps.filter(function(e){
      return e.estado==='Activo' && (e.area==='Sala'||e.area==='Jefe de Sala');
    });

    var allRules = await getDB('dept_incentive_rules');
    var rules    = (allRules||[]).filter(function(r){ return r.activo && (r.departamento==='Sala'||r.departamento==='Jefe de Sala'); });
    var rSemanal = rules.find(function(r){ return r.periodo==='semanal'; });
    var rMensual  = rules.find(function(r){ return r.periodo==='mensual'; });

    var ventasRes = await syncroSupabaseFetch(
      SUPABASE_URL+'/rest/v1/employee_sales_weekly'
        +'?departamento=in.(Sala,Jefe%20de%20Sala)'
        +'&fecha_inicio_semana=gte.'+range.inicio
        +'&fecha_inicio_semana=lte.'+range.fin
        +'&select=employee_id,ventas,fecha_inicio_semana',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    );
    var ventasData = ventasRes.ok ? await ventasRes.json() : [];

    var empIdsSala = empsSala.map(function(e){ return e.id; }).join(',');
    var fioResSala = empIdsSala ? await syncroSupabaseFetch(
      SUPABASE_URL+'/rest/v1/fio?employee_id=in.('+empIdsSala+')'
        +'&incentive_month=eq.'+ym+'&status=in.(Validado,Cerrado,Disputado)&select=employee_id,applied_points',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    ) : null;
    var fioDataSala = (fioResSala && fioResSala.ok) ? await fioResSala.json() : [];

    todos = empsSala.map(function(e){
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
               bonusBruto:bonusBruto, ptosFio:ptosFio, penPct:penPct, bonusFinal:bonusFinal, liquidado:false };
    });

    var totalBonuses = todos.reduce(function(s,r){ return s+r.bonusFinal; },0);
    var rows = _incRenderRows(todos, ym, false);
    el.innerHTML = '<h3 style="margin:0 0 14px;font-size:15px;">Sala · '+mesLabel+'</h3>'
      +'<div class="tbl-wrap"><table>'
      +'<tr><th>Empleado</th><th>Ventas mes</th><th>Sem. OK</th><th>Incentivo bruto</th><th>FIO</th><th>Incentivo final</th></tr>'
      +(rows||'<tr><td colspan="6" style="color:var(--text3);text-align:center;">Sin empleados activos</td></tr>')
      +'<tr style="border-top:2px solid var(--border);font-weight:700;">'
      +'<td colspan="5">TOTAL A PAGAR</td>'
      +'<td style="font-family:var(--font-mono);font-size:15px;color:var(--amber);">'+totalBonuses.toFixed(2)+'€</td>'
      +'</tr></table></div>'
      +'<p style="font-size:11px;color:var(--text3);margin-top:12px;">'
      +'Objetivo sem. '+(rSemanal?parseFloat(rSemanal.objetivo||0).toLocaleString('es-ES')+'€ → +'+parseFloat(rSemanal.importe_bonus||0)+'€':'sin regla')+'.'
      +'</p>';
    return;
  }

  // ── RECEPCIÓN ────────────────────────────────────────────────────
  if(dept === 'Recepción'){
    var empsRec = allEmps.filter(function(e){
      return e.estado==='Activo' && e.area==='Recepción';
    });

    function _ivaFactor(tipo){ return tipo === 'syncrolab' ? 1.21 : 1.10; }
    var recVentasRes = empsRec.length ? await syncroSupabaseFetch(
      SUPABASE_URL+'/rest/v1/recepcion_ventas'
        +'?fecha=gte.'+range.inicio+'&fecha=lte.'+range.fin
        +'&select=empleado_id,importe,tipo_venta',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    ) : null;
    var recVentasData = (recVentasRes && recVentasRes.ok) ? await recVentasRes.json() : [];

    var empIdsRec = empsRec.map(function(e){ return e.id; }).join(',');
    var fioResRec = empIdsRec ? await syncroSupabaseFetch(
      SUPABASE_URL+'/rest/v1/fio?employee_id=in.('+empIdsRec+')'
        +'&incentive_month=eq.'+ym+'&status=in.(Validado,Cerrado,Disputado)&saldado=is.false&select=employee_id,applied_points',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    ) : null;
    var fioDataRec = (fioResRec && fioResRec.ok) ? await fioResRec.json() : [];

    var liqRecRes = empIdsRec ? await syncroSupabaseFetch(
      SUPABASE_URL+'/rest/v1/incentivos_liquidaciones?empleado_id=in.('+empIdsRec+')&mes=eq.'+ym+'&select=empleado_id,incentivo_final,liquidado_at',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    ) : null;
    var liqRecData = (liqRecRes && liqRecRes.ok) ? await liqRecRes.json() : [];

    todos = empsRec.map(function(e){
      var misVentas  = (recVentasData||[]).filter(function(v){ return v.empleado_id===e.id; });
      var incBruto   = misVentas.reduce(function(s,v){
        return s + (parseFloat(v.importe||0) / _ivaFactor(v.tipo_venta)) * 0.10;
      },0);
      var misFio     = (fioDataRec||[]).filter(function(f){ return f.employee_id===e.id; });
      var ptosFio    = misFio.reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);
      var penPct     = getFioPenalizacion(ptosFio);
      var incFinal   = Math.max(0, incBruto*(1-penPct));
      var liq        = (liqRecData||[]).find(function(l){ return l.empleado_id===e.id; });
      return { emp:e, dept:'Recepción', ventasMes:incBruto/0.10||0, semanasOk:'—', semanasTotales:'—',
               bonusBruto:incBruto, ptosFio:ptosFio, penPct:penPct, bonusFinal:incFinal,
               liquidado:!!liq, liquidado_at:liq?liq.liquidado_at:null };
    });

    var totalBonuses = todos.reduce(function(s,r){ return s+r.bonusFinal; },0);
    var isAdminG = canActAsAdmin(currentUser);
    var rows = todos.map(function(r){
      var penBadge = r.penPct>0 ? '<span class="badge b-red">−'+Math.round(r.penPct*100)+'%</span>' : '—';
      var liqCell = r.liquidado
        ? '<span style="color:var(--green);font-size:11px;font-weight:600;">✅ '+new Date(r.liquidado_at).toLocaleDateString('es-ES')+'</span>'
        : (isAdminG && r.bonusFinal>0
          ? '<button class="btn btn-xs" style="background:var(--green-dim);color:var(--green);border:1px solid var(--green);" '
            +'onclick="incLiquidarMes(\''+r.emp.id+'\',\''+r.emp.nombre+'\',\''+ym+'\','+r.bonusBruto+','+(r.penPct*r.bonusBruto)+','+r.bonusFinal+')">💰 Liquidar</button>'
          : '<span style="color:var(--text3);font-size:11px;">Pendiente</span>');
      return '<tr>'
        +'<td><strong>'+r.emp.nombre+'</strong></td>'
        +'<td style="font-family:var(--font-mono);">'+r.ventasMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
        +'<td style="font-family:var(--font-mono);">'+r.bonusBruto.toFixed(2)+'€</td>'
        +'<td style="text-align:center;">'+r.ptosFio.toFixed(1)+'pts '+penBadge+'</td>'
        +'<td style="font-family:var(--font-mono);font-weight:700;color:'+(r.bonusFinal>0?'var(--green)':'var(--text3)')+';">'+r.bonusFinal.toFixed(2)+'€</td>'
        +'<td>'+liqCell+'</td>'
        +'</tr>';
    }).join('');

    el.innerHTML = '<h3 style="margin:0 0 14px;font-size:15px;">Recepción Hotel · '+mesLabel+'</h3>'
      +'<div class="tbl-wrap"><table>'
      +'<tr><th>Empleado</th><th>Ventas cross-sell</th><th>Incentivo bruto (10%)</th><th>FIO</th><th>Incentivo final</th><th>Liquidación</th></tr>'
      +(rows||'<tr><td colspan="6" style="color:var(--text3);text-align:center;">Sin empleados activos</td></tr>')
      +'<tr style="border-top:2px solid var(--border);font-weight:700;">'
      +'<td colspan="4">TOTAL A PAGAR</td>'
      +'<td colspan="2" style="font-family:var(--font-mono);font-size:15px;color:var(--amber);">'+totalBonuses.toFixed(2)+'€</td>'
      +'</tr></table></div>'
      +'<p style="font-size:11px;color:var(--text3);margin-top:12px;">Comisión: 10% sobre importe neto (sin IVA) de ventas cross-sell declaradas en turno.</p>';
    return;
  }

  el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">Sin cálculo disponible para este departamento.</p></div>';
}
window.calcularIncentivosGestor = calcularIncentivosGestor;

// Helper render filas Sala (sin liquidación — la liquidación es por Mi Rendimiento)
function _incRenderRows(todos, ym, conLiq){
  return todos.map(function(r){
    var penBadge = r.penPct>0 ? '<span class="badge b-red">−'+Math.round(r.penPct*100)+'%</span>' : '—';
    return '<tr>'
      +'<td><strong>'+r.emp.nombre+'</strong></td>'
      +'<td style="font-family:var(--font-mono);">'+(typeof r.ventasMes==='number'?r.ventasMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€':'—')+'</td>'
      +'<td style="text-align:center;">'+(typeof r.semanasOk==='number'?r.semanasOk+'/'+r.semanasTotales:r.semanasOk)+'</td>'
      +'<td style="font-family:var(--font-mono);">'+r.bonusBruto.toFixed(2)+'€</td>'
      +'<td style="text-align:center;">'+r.ptosFio.toFixed(1)+'pts '+penBadge+'</td>'
      +'<td style="font-family:var(--font-mono);font-weight:700;color:'+(r.bonusFinal>0?'var(--green)':'var(--text3)')+';">'+r.bonusFinal.toFixed(2)+'€</td>'
      +'</tr>';
  }).join('');
}
window._incRenderRows = _incRenderRows;

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

// Distribuir ventas diarias en semanas dom→sáb del mes
// Regla: una semana pertenece al mes de su DOMINGO (fecha inicio)
function incDistribuirPorSemana(empleados, ym) {
  var parts = ym.split('-');
  var y = parseInt(parts[0]), m = parseInt(parts[1]);

  // Encontrar todos los domingos que caen dentro de este mes
  var semanas = [];
  var d = new Date(y, m-1, 1); // Día 1 del mes
  var dow = d.getDay(); // 0=dom, 1=lun, ...
  var domingo = new Date(d);
  if(dow !== 0) {
    // Avanzar al primer domingo del mes
    domingo.setDate(domingo.getDate() + (7 - dow));
  }
  // Generar semanas: domingo→sábado, mientras el domingo esté en este mes
  while(domingo.getMonth() === m-1 && domingo.getFullYear() === y) {
    var ini = new Date(domingo);
    var fin = new Date(domingo); fin.setDate(fin.getDate()+6); // sábado
    semanas.push({ ini: ini, fin: fin });
    domingo = new Date(domingo); domingo.setDate(domingo.getDate()+7);
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

  var dept = _incDeptActivo();
  // Reglas aplican solo a Sala por ahora
  var deptsFiltro = dept === 'Sala' ? ['Sala','Jefe de Sala'] : [dept];

  var allRules = await getDB('dept_incentive_rules');
  var rules = (allRules||[]).filter(function(r){
    return deptsFiltro.indexOf(r.departamento) >= 0;
  });

  var rows = rules.map(function(r){
    return '<tr>'
      +'<td>'+r.departamento+'</td>'
      +'<td>'+r.periodo+'</td>'
      +'<td style="font-family:var(--font-mono);">'+parseFloat(r.objetivo||0).toLocaleString('es-ES',{minimumFractionDigits:2})+'€</td>'
      +'<td style="font-family:var(--font-mono);">'+parseFloat(r.importe_bonus||0).toFixed(2)+'€</td>'
      +'<td><span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:'+(r.activo?'var(--green-dim)':'var(--bg4)')+';color:'+(r.activo?'var(--green)':'var(--text3)')+';">'+(r.activo?'Activa':'Inactiva')+'</span></td>'
      +'<td>'
      +'<button class="btn btn-secondary btn-xs" onclick="incEditRegla(\''+r.id+'\')">✏ Editar</button> '
      +'<button class="btn btn-xs" style="background:var(--'+(r.activo?'orange':'green')+'-dim);color:var(--'+(r.activo?'orange':'green')+');border:1px solid var(--'+(r.activo?'orange':'green')+');" '
      +'onclick="incToggleRegla(\''+r.id+'\','+r.activo+')">'+(r.activo?'⏸ Pausar':'▶ Activar')+'</button>'
      +'</td></tr>';
  }).join('');

  c.innerHTML = '<div class="tbl-wrap" style="margin-bottom:16px;">'
    +'<table><thead><tr><th>Dept.</th><th>Periodo</th><th>Objetivo</th><th>Bonus</th><th>Estado</th><th>Acciones</th></tr></thead>'
    +'<tbody>'+(rows||'<tr><td colspan="6" style="color:var(--text3);text-align:center;">Sin reglas configuradas</td></tr>')+'</tbody>'
    +'</table></div>'
    +'<button class="btn btn-primary" onclick="incNuevaRegla()">+ Nueva regla</button>'
    +'<div id="inc-regla-form" style="margin-top:16px;"></div>';
}
window.renderIncReglas = renderIncReglas;

function incNuevaRegla() { incMostrarFormRegla(null); }
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
  var dept = _incDeptActivo();
  // Opciones de dept para el selector
  var deptOpts = dept === 'Sala'
    ? '<option '+((!rule||rule.departamento==='Sala')?'selected':'')+'>Sala</option>'
      +'<option '+((rule&&rule.departamento==='Jefe de Sala')?'selected':'')+'>Jefe de Sala</option>'
    : '<option selected>'+dept+'</option>';

  el.innerHTML = '<div class="card" style="border-color:var(--amber);">'
    +'<div class="card-title">'+(isNew?'NUEVA REGLA':'EDITAR REGLA')+'</div>'
    +'<div class="grid2" style="gap:12px;">'
    +'<div class="fg"><label>Departamento</label><select id="rf-dept">'+deptOpts+'</select></div>'
    +'<div class="fg"><label>Periodo</label>'
    +'<select id="rf-periodo">'
    +'<option value="semanal" '+((!rule||rule.periodo==='semanal')?'selected':'')+'>Semanal</option>'
    +'<option value="mensual" '+((rule&&rule.periodo==='mensual')?'selected':'')+'>Mensual</option>'
    +'</select></div>'
    +'<div class="fg"><label>Objetivo ventas (€)</label>'
    +'<input type="number" id="rf-objetivo" step="0.01" min="0" value="'+(rule?rule.objetivo:'')+'"></div>'
    +'<div class="fg"><label>Importe bonus (€)</label>'
    +'<input type="number" id="rf-bonus" step="0.01" min="0" value="'+(rule?rule.importe_bonus:'')+'"></div>'
    +'<div class="fg sp2"><label>Notas</label>'
    +'<input type="text" id="rf-notas" value="'+(rule&&rule.notas?rule.notas:'')+'"></div>'
    +'</div>'
    +'<div class="btn-row">'
    +'<button class="btn btn-primary" onclick="incGuardarRegla(\''+(rule?rule.id:'')+'\')">💾 Guardar</button>'
    +'<button class="btn btn-secondary" onclick="document.getElementById(\'inc-regla-form\').innerHTML=\'\'">Cancelar</button>'
    +'</div></div>';
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
    var ok = await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/dept_incentive_rules?id=eq.'+id, {
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
  var ok = await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/dept_incentive_rules?id=eq.'+id, {
    method:'PATCH',
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
    body: JSON.stringify({ activo: !activo, updated_by: currentUser.nombre })
  });
  if(ok.ok){ invalidateCache('dept_incentive_rules'); await renderIncReglas(); }
  else toast('Error','error');
}
window.incToggleRegla = incToggleRegla;

// ═══════════════════════════════════════════════════════════════════════
// LIQUIDACIÓN MENSUAL RECEPCIÓN
// Solo admin. Mes completo. Salda FIO del mes (no los borra).
// ═══════════════════════════════════════════════════════════════════════

async function incLiquidarMes(empId, empNombre, ym, incBruto, penEur, incFinal){
  if(!canActAsAdmin(currentUser)){
    toast('Solo administradores pueden liquidar incentivos','warn');
    return;
  }

  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts = ym.split('-');
  var mesLabel = meses[parseInt(parts[1])-1]+' '+parts[0];

  // Modal de confirmación
  var modal = document.createElement('div');
  modal.id = 'liq-modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.5);">'
    +'<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--green);letter-spacing:.15em;margin-bottom:12px;">LIQUIDAR INCENTIVO</div>'
    +'<div style="font-size:15px;font-weight:700;margin-bottom:16px;">'+empNombre+' · '+mesLabel+'</div>'
    +'<table style="width:100%;margin-bottom:16px;font-size:13px;">'
    +'<tr><td style="color:var(--text3);">Incentivo bruto</td><td style="font-family:var(--font-mono);text-align:right;">'+(incBruto||0).toFixed(2)+'€</td></tr>'
    +'<tr><td style="color:var(--text3);">Penalización FIO</td><td style="font-family:var(--font-mono);text-align:right;color:var(--red);">−'+(penEur||0).toFixed(2)+'€</td></tr>'
    +'<tr style="border-top:2px solid var(--border);font-weight:700;">'
    +'<td>INCENTIVO FINAL</td>'
    +'<td style="font-family:var(--font-mono);text-align:right;font-size:16px;color:var(--green);">'+(incFinal||0).toFixed(2)+'€</td>'
    +'</tr></table>'
    +'<div class="fg" style="margin-bottom:16px;">'
    +'<label style="font-size:11px;">Notas (opcional)</label>'
    +'<input type="text" id="liq-notas" placeholder="Ej: Pagado por transferencia" style="width:100%;">'
    +'</div>'
    +'<div style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:10px;margin-bottom:16px;font-size:12px;color:var(--amber);">'
    +'⚠ Esta acción marcará los FIO del mes como saldados. No se puede deshacer.'
    +'</div>'
    +'<div style="display:flex;gap:10px;justify-content:flex-end;">'
    +'<button class="btn btn-secondary" onclick="document.getElementById(\'liq-modal-overlay\').remove()">Cancelar</button>'
    +'<button class="btn" style="background:var(--green);color:#fff;" onclick="_confirmarLiquidacion(\''+empId+'\',\''+empNombre+'\',\''+ym+'\','+incBruto+','+penEur+','+incFinal+')">✅ Confirmar liquidación</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(modal);
}
window.incLiquidarMes = incLiquidarMes;

async function _confirmarLiquidacion(empId, empNombre, ym, incBruto, penEur, incFinal){
  var notas = (document.getElementById('liq-notas')||{}).value || '';
  var overlay = document.getElementById('liq-modal-overlay');
  if(overlay) overlay.remove();

  // 1. Insertar en incentivos_liquidaciones
  var liqRow = {
    id:               genId(),
    empleado_id:      empId,
    empleado_nombre:  empNombre,
    mes:              ym,
    incentivo_bruto:  parseFloat(incBruto)||0,
    penalizacion_fio: parseFloat(penEur)||0,
    incentivo_final:  parseFloat(incFinal)||0,
    liquidado_por:    currentUser.nombre,
    liquidado_at:     localTs(),
    notas:            notas||null
  };
  var ok = await dbInsert('incentivos_liquidaciones', liqRow);
  if(!ok){
    toast('Error al registrar la liquidación. Inténtalo de nuevo.','err');
    return;
  }

  // 2. Marcar FIO del mes como saldados (no se borran)
  var fioRes = await syncroSupabaseFetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=eq.'+encodeURIComponent(empId)
      +'&incentive_month=eq.'+ym
      +'&status=in.(Validado,Cerrado,Disputado)',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'}}
  );
  var fios = fioRes.ok ? await fioRes.json() : [];
  for(var i=0; i<fios.length; i++){
    await syncroSupabaseFetch(SUPABASE_URL+'/rest/v1/fio?id=eq.'+fios[i].id, {
      method:'PATCH',
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({ saldado: true })
    });
  }

  // 3. Audit + cache + feedback
  await auditLog('INC_LIQUIDACION',
    currentUser.nombre+' liquidó incentivo '+empNombre+' · '+ym+' · '+parseFloat(incFinal).toFixed(2)+'€');
  invalidateCache('incentivos_liquidaciones');

  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var mesLabel = meses[parseInt(ym.split('-')[1])-1]+' '+ym.split('-')[0];
  toast('✅ Liquidación registrada — '+empNombre+' · '+mesLabel+' · '+parseFloat(incFinal).toFixed(2)+'€','ok');

  // 4. Refrescar vista
  await calcularIncentivosGestor();
}
window._confirmarLiquidacion = _confirmarLiquidacion;
