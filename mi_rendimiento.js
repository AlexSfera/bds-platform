// ═══════════════════════════════════════════════════════════════════════
// MI_RENDIMIENTO.JS · MI DEPARTAMENTO — Vista empleado
// Incentivo neto + gráfico producción vs FIO + liquidación 6 meses
// Reutiliza lógica de cálculo de incentivos.js sin duplicar.
// ═══════════════════════════════════════════════════════════════════════

var _mrSelectedMonth = '';   // mes activo en formato "YYYY-MM"

// ── RENDER PRINCIPAL ────────────────────────────────────────────────
async function renderMiRendimiento(){
  var el = document.getElementById('mi-rendimiento-content');
  if(!el) return;

  var area = (currentUser && currentUser.area) || '';
  var esSala      = area === 'Sala' || area === 'Jefe de Sala';
  var esRecepcion = area === 'Recepción';

  if(!esSala && !esRecepcion){
    el.innerHTML = '<div class="card"><p style="color:var(--text3);padding:20px 0;">'
      + '📈 Sistema de incentivos no disponible para tu departamento aún.</p></div>';
    return;
  }

  var monthOpts = getMonthOptions(6);
  if(!_mrSelectedMonth) _mrSelectedMonth = monthOpts[0].value;

  var selOpts = monthOpts.map(function(o){
    return '<option value="'+o.value+'"'+(o.value===_mrSelectedMonth?' selected':'')+'>'+o.label+'</option>';
  }).join('');

  el.innerHTML = ''
    + '<div class="card" style="margin-bottom:16px;">'
    +   '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">'
    +     '<div class="fg" style="min-width:200px;"><label>Mes</label>'
    +       '<select id="mr-month-sel" onchange="onMrMonthChange(this.value)">'+selOpts+'</select>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<div id="mr-content"><p style="color:var(--text3);">Calculando…</p></div>';

  await _mrLoadData(esSala ? 'sala' : 'recepcion');
}
window.renderMiRendimiento = renderMiRendimiento;

async function onMrMonthChange(val){
  _mrSelectedMonth = val;
  var area = (currentUser && currentUser.area) || '';
  var tipo = (area === 'Sala' || area === 'Jefe de Sala') ? 'sala' : 'recepcion';
  await _mrLoadData(tipo);
}
window.onMrMonthChange = onMrMonthChange;

// ── CARGA Y CÁLCULO ─────────────────────────────────────────────────
async function _mrLoadData(tipo){
  var el = document.getElementById('mr-content');
  if(!el) return;
  el.innerHTML = '<p style="color:var(--text3);">Calculando…</p>';

  var ym    = _mrSelectedMonth;
  var range = getMonthDateRange(ym);
  var empId = currentUser.id;
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var parts     = ym.split('-');
  var mesLabel  = meses[parseInt(parts[1])-1] + ' ' + parts[0];

  // ── 1. Datos comunes: FIO del mes ───────────────────────────────
  var fioRes = await fetch(
    SUPABASE_URL+'/rest/v1/fio?employee_id=eq.'+encodeURIComponent(empId)
      +'&incentive_month=eq.'+ym
      +'&status=in.(Validado,Cerrado,Disputado)'
      +(tipo==='recepcion' ? '&saldado=is.false' : '')
      +'&select=applied_points,created_at',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var fios = fioRes.ok ? await fioRes.json() : [];
  var totalPuntosFio = (fios||[]).reduce(function(s,f){ return s+parseFloat(f.applied_points||0); },0);
  var nFios = (fios||[]).length;

  // ── 2. Datos según tipo ─────────────────────────────────────────
  var bonusBruto = 0, bonusFinal = 0, penPct = 0, penEur = 0;
  var semanasData = [];      // [{ label, ventas, cumple, bonus }]
  var bonusSemanal = 0, bonusMensual = 0;
  var rSemanal = null, rMensual = null;
  var totalMes = 0;

  if(tipo === 'sala'){
    // Ventas semanales
    var ventasRes = await fetch(
      SUPABASE_URL+'/rest/v1/employee_sales_weekly?employee_id=eq.'+encodeURIComponent(empId)
        +'&fecha_inicio_semana=gte.'+range.inicio
        +'&fecha_inicio_semana=lte.'+range.fin
        +'&select=*&order=fecha_inicio_semana.asc',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    );
    var ventas = ventasRes.ok ? await ventasRes.json() : [];

    var allRules = await getDB('dept_incentive_rules');
    var rules = (allRules||[]).filter(function(r){
      return r.activo && (r.departamento==='Sala'||r.departamento==='Jefe de Sala');
    });
    rSemanal = rules.find(function(r){ return r.periodo==='semanal'; });
    rMensual  = rules.find(function(r){ return r.periodo==='mensual'; });

    totalMes = (ventas||[]).reduce(function(s,v){ return s+parseFloat(v.ventas||0); },0);
    var semanasOk = rSemanal ? (ventas||[]).filter(function(v){
      return parseFloat(v.ventas||0) >= parseFloat(rSemanal.objetivo||0);
    }).length : 0;

    bonusSemanal = rSemanal ? semanasOk * parseFloat(rSemanal.importe_bonus||0) : 0;
    bonusMensual = (rMensual && totalMes >= parseFloat(rMensual.objetivo||0))
      ? parseFloat(rMensual.importe_bonus||0) : 0;
    bonusBruto = bonusSemanal + bonusMensual;
    penPct     = getFioPenalizacion(totalPuntosFio);
    penEur     = bonusBruto * penPct;
    bonusFinal = Math.max(0, bonusBruto - penEur);

    var mesesN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    semanasData = (ventas||[]).map(function(v){
      var d  = new Date(v.fecha_inicio_semana+'T00:00:00');
      var vv = parseFloat(v.ventas||0);
      var cumple = rSemanal && vv >= parseFloat(rSemanal.objetivo||0);
      return {
        label  : 'S'+d.getDate()+'/'+mesesN[d.getMonth()],
        ventas : vv,
        objetivo: rSemanal ? parseFloat(rSemanal.objetivo||0) : 0,
        cumple : cumple,
        bonus  : cumple && rSemanal ? parseFloat(rSemanal.importe_bonus||0) : 0
      };
    });

  } else {
    // Recepción
    var ventasRecRes = await fetch(
      SUPABASE_URL+'/rest/v1/recepcion_ventas?empleado_id=eq.'+encodeURIComponent(empId)
        +'&fecha=gte.'+range.inicio+'&fecha=lte.'+range.fin
        +'&select=*&order=fecha.asc',
      {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
    );
    var ventasRec = ventasRecRes.ok ? await ventasRecRes.json() : [];
    function _ivaFactor(tipo){ return tipo === 'syncrolab' ? 1.21 : 1.10; }
    var incBrutoAcc = 0;
    (ventasRec||[]).forEach(function(v){
      var neto = parseFloat(v.importe||0) / _ivaFactor(v.tipo_venta);
      incBrutoAcc += neto * 0.10;
      totalMes    += parseFloat(v.importe||0);
    });
    bonusBruto = incBrutoAcc;
    penPct     = getFioPenalizacion(totalPuntosFio);
    penEur     = bonusBruto * penPct;
    bonusFinal = Math.max(0, bonusBruto - penEur);
  }

  // ── 3. Liquidación: últimos 6 meses ────────────────────────────
  var ultMeses = getMonthOptions(6).map(function(o){ return o.value; });
  var liqRes = await fetch(
    SUPABASE_URL+'/rest/v1/incentivos_liquidaciones?empleado_id=eq.'+encodeURIComponent(empId)
      +'&mes=in.('+ultMeses.join(',')+')'
      +'&select=mes,importe_final,estado,liquidado_at&order=mes.desc',
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}}
  );
  var liquidaciones = liqRes.ok ? await liqRes.json() : [];

  // ── 4. Render ───────────────────────────────────────────────────
  var penBadge = penPct > 0
    ? '<span class="badge b-red">−'+Math.round(penPct*100)+'% FIO ('+totalPuntosFio.toFixed(1)+' pts · '+nFios+' FIO)</span>'
    : '<span class="badge b-green">Sin penalización FIO</span>';

  function kpiCard(label, value, color, sub){
    return '<div style="flex:1;min-width:130px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px 16px;text-align:center;">'
      + '<div style="font-size:10px;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px;">'+label+'</div>'
      + '<div style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:'+color+';">'+value+'</div>'
      + (sub ? '<div style="font-size:10px;color:var(--text3);margin-top:3px;">'+sub+'</div>' : '')
      + '</div>';
  }

  // ── Gráfico 1: barras semanales con línea objetivo (solo Sala) ──
  var grafico1 = '';
  if(tipo === 'sala' && semanasData.length > 0){
    grafico1 = _mrBarChart(semanasData, mesLabel);
  }

  // ── Gráfico 2: barras liquidación 6 meses ──────────────────────
  var grafico2 = _mrLiqChart(liquidaciones, ultMeses, bonusFinal, ym);

  // ── Tabla semanas (solo Sala) ──────────────────────────────────
  var tablaSemanas = '';
  if(tipo === 'sala'){
    var filas = semanasData.length ? semanasData.map(function(s){
      return '<tr style="border-bottom:1px solid var(--border);">'
        + '<td style="padding:8px 12px;font-family:var(--font-mono);font-size:12px;color:var(--text2);">'+s.label+'</td>'
        + '<td style="padding:8px 12px;font-family:var(--font-mono);font-size:12px;text-align:right;">'
        +   s.ventas.toLocaleString('es-ES',{minimumFractionDigits:2})+'€'
        + '</td>'
        + '<td style="padding:8px 12px;text-align:center;">'
        +   (s.cumple ? '<span class="badge b-green">✅</span>' : '<span class="badge b-gray">—</span>')
        + '</td>'
        + '<td style="padding:8px 12px;font-family:var(--font-mono);font-size:12px;text-align:right;color:var(--green);">'
        +   (s.bonus > 0 ? '+'+s.bonus.toFixed(2)+'€' : '—')
        + '</td>'
        + '</tr>';
    }).join('')
    : '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--text3);">Sin ventas registradas este mes</td></tr>';

    tablaSemanas = '<div class="card" style="margin-bottom:16px;">'
      + '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">📅 Semanas — '+(rSemanal?'Obj. '+parseFloat(rSemanal.objetivo||0).toLocaleString('es-ES')+'€':'sin regla activa')+'</div>'
      + '<div style="overflow-x:auto;">'
      + '<table style="width:100%;border-collapse:collapse;">'
      + '<thead><tr style="background:var(--bg2);border-bottom:2px solid var(--border2);">'
      +   '<th style="text-align:left;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Semana</th>'
      +   '<th style="text-align:right;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Ventas</th>'
      +   '<th style="text-align:center;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--text3);">Obj.</th>'
      +   '<th style="text-align:right;padding:8px 12px;font-family:var(--font-mono);font-size:10px;text-transform:uppercase;color:var(--green);">Bonus</th>'
      + '</tr></thead>'
      + '<tbody>'+filas+'</tbody>'
      + '</table></div></div>';
  }

  // ── Resumen bonus ──────────────────────────────────────────────
  var resumenBonus = '<div class="card" style="margin-bottom:16px;">'
    + '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">💰 Resumen bonus ' + mesLabel + '</div>'
    + '<table style="width:100%;border-collapse:collapse;">';

  if(tipo === 'sala'){
    resumenBonus += '<tr style="border-bottom:1px solid var(--border);">'
      + '<td style="padding:8px 12px;font-size:13px;color:var(--text2);">Bonus semanal</td>'
      + '<td style="padding:8px 12px;font-family:var(--font-mono);font-size:13px;text-align:right;color:var(--text);">'+bonusSemanal.toFixed(2)+'€</td>'
      + '</tr>'
      + '<tr style="border-bottom:1px solid var(--border);">'
      + '<td style="padding:8px 12px;font-size:13px;color:var(--text2);">Bonus mensual</td>'
      + '<td style="padding:8px 12px;font-family:var(--font-mono);font-size:13px;text-align:right;color:var(--text);">'+bonusMensual.toFixed(2)+'€</td>'
      + '</tr>';
  } else {
    resumenBonus += '<tr style="border-bottom:1px solid var(--border);">'
      + '<td style="padding:8px 12px;font-size:13px;color:var(--text2);">Incentivo bruto (10% neto ventas)</td>'
      + '<td style="padding:8px 12px;font-family:var(--font-mono);font-size:13px;text-align:right;color:var(--text);">'+bonusBruto.toFixed(2)+'€</td>'
      + '</tr>';
  }

  resumenBonus += '<tr style="border-bottom:1px solid var(--border);">'
    + '<td style="padding:8px 12px;font-size:13px;color:var(--text2);">Penalización FIO &nbsp;' + penBadge + '</td>'
    + '<td style="padding:8px 12px;font-family:var(--font-mono);font-size:13px;text-align:right;color:var(--red);">−'+penEur.toFixed(2)+'€</td>'
    + '</tr>'
    + '<tr style="border-top:2px solid var(--border2);">'
    + '<td style="padding:10px 12px;font-size:14px;font-weight:700;color:var(--text);">BONUS FINAL</td>'
    + '<td style="padding:10px 12px;font-family:var(--font-mono);font-size:17px;font-weight:700;text-align:right;color:'+(bonusFinal>0?'var(--green)':'var(--text3)')+';">'+bonusFinal.toFixed(2)+'€</td>'
    + '</tr>'
    + '</table>'
    + '<p style="font-size:11px;color:var(--text3);margin-top:10px;">* Pendiente de revisión y aprobación por dirección.</p>'
    + '</div>';

  // ── Montar todo ────────────────────────────────────────────────
  el.innerHTML = ''
    // KPIs fila
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">'
    +   kpiCard('Producción mes', totalMes.toLocaleString('es-ES',{minimumFractionDigits:2})+'€', 'var(--accent)', mesLabel)
    +   kpiCard('Bonus bruto', bonusBruto.toFixed(2)+'€', 'var(--green)', 'antes de FIO')
    +   kpiCard('Penalización FIO', penEur > 0 ? '−'+penEur.toFixed(2)+'€' : '—', 'var(--red)', nFios+' FIO activo'+(nFios===1?'':'s'))
    +   kpiCard('Bonus final', bonusFinal.toFixed(2)+'€', bonusFinal > 0 ? 'var(--green)' : 'var(--text3)', '* pendiente aprobación')
    + '</div>'
    + grafico1
    + tablaSemanas
    + resumenBonus
    + grafico2;
}

// ══════════════════════════════════════════════════════════════════════
// GRÁFICO 1 — Barras semanales: ventas vs objetivo (Sala)
// SVG inline, sin librerías
// ══════════════════════════════════════════════════════════════════════
function _mrBarChart(semanas, mesLabel){
  if(!semanas || !semanas.length) return '';

  var W = 540, H = 180, PAD_L = 52, PAD_R = 16, PAD_T = 20, PAD_B = 36;
  var chartW = W - PAD_L - PAD_R;
  var chartH = H - PAD_T - PAD_B;
  var n      = semanas.length;
  var barW   = Math.floor(chartW / n * 0.55);
  var gap    = chartW / n;

  var maxVal = semanas.reduce(function(m,s){ return Math.max(m, s.ventas, s.objetivo); }, 0);
  if(maxVal <= 0) maxVal = 1;
  var scale  = chartH / (maxVal * 1.1);

  function yPos(v){ return PAD_T + chartH - Math.round(v * scale); }

  // Línea objetivo (horizontal)
  var objY   = semanas[0].objetivo > 0 ? yPos(semanas[0].objetivo) : -1;
  var lineaObj = objY > 0
    ? '<line x1="'+PAD_L+'" y1="'+objY+'" x2="'+(W-PAD_R)+'" y2="'+objY
      +'" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".8"/>'
      +'<text x="'+(W-PAD_R+3)+'" y="'+(objY+4)+'" font-size="9" fill="var(--amber)" font-family="var(--font-mono)">Obj</text>'
    : '';

  // Barras
  var bars = semanas.map(function(s, i){
    var x   = PAD_L + Math.round(i * gap + gap/2 - barW/2);
    var bH  = Math.max(2, Math.round(s.ventas * scale));
    var y   = PAD_T + chartH - bH;
    var col = s.cumple ? 'var(--green)' : (s.ventas > 0 ? 'var(--amber)' : 'var(--border2)');
    // Label eje X
    var lx  = PAD_L + Math.round(i * gap + gap/2);
    return '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+bH+'" rx="3" fill="'+col+'" opacity=".85"/>'
      +'<text x="'+lx+'" y="'+(H-PAD_B+14)+'" text-anchor="middle" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">'+s.label+'</text>';
  }).join('');

  // Eje Y: 3 ticks
  var yticks = [0, 0.5, 1].map(function(pct){
    var v = maxVal * 1.1 * pct;
    var y = PAD_T + chartH - Math.round(v * scale);
    var lbl = v >= 1000 ? (v/1000).toFixed(1)+'k' : Math.round(v)+'';
    return '<line x1="'+(PAD_L-4)+'" y1="'+y+'" x2="'+PAD_L+'" y2="'+y+'" stroke="var(--border)" stroke-width="1"/>'
      +'<text x="'+(PAD_L-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">'+lbl+'</text>';
  }).join('');

  var svg = '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:'+W+'px;display:block;">'
    // Ejes
    + '<line x1="'+PAD_L+'" y1="'+PAD_T+'" x2="'+PAD_L+'" y2="'+(PAD_T+chartH)+'" stroke="var(--border)" stroke-width="1"/>'
    + '<line x1="'+PAD_L+'" y1="'+(PAD_T+chartH)+'" x2="'+(W-PAD_R)+'" y2="'+(PAD_T+chartH)+'" stroke="var(--border)" stroke-width="1"/>'
    + yticks
    + lineaObj
    + bars
    + '</svg>';

  return '<div class="card" style="margin-bottom:16px;">'
    + '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">📊 Producción semanal — ' + mesLabel + '</div>'
    + svg
    + '<div style="display:flex;gap:14px;margin-top:8px;font-size:10px;font-family:var(--font-mono);color:var(--text3);">'
    +   '<span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Cumple objetivo</span>'
    +   '<span><span style="display:inline-block;width:10px;height:10px;background:var(--amber);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Sin objetivo</span>'
    +   '<span><span style="display:inline-block;width:30px;height:2px;background:var(--amber);margin-right:4px;vertical-align:middle;display:inline-block;"></span>Objetivo</span>'
    + '</div>'
    + '</div>';
}

// ══════════════════════════════════════════════════════════════════════
// GRÁFICO 2 — Barras acumuladas liquidación últimos 6 meses
// ══════════════════════════════════════════════════════════════════════
function _mrLiqChart(liquidaciones, ultMeses, bonusMesActual, ymActual){
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function shortLabel(ym){
    var p = ym.split('-');
    return meses[parseInt(p[1])-1]+' '+p[0].slice(2);
  }

  // Construir serie: para cada mes → liquidado o estimado
  var serie = ultMeses.slice().reverse().map(function(ym){
    var liq = (liquidaciones||[]).find(function(l){ return l.mes === ym; });
    var esMesActual = ym === ymActual;
    return {
      label   : shortLabel(ym),
      importe : liq ? parseFloat(liq.importe_final||0) : (esMesActual ? bonusMesActual : 0),
      estado  : liq ? (liq.estado||'pendiente') : (esMesActual ? 'estimado' : 'sin datos'),
      actual  : esMesActual && !liq
    };
  });

  var W = 540, H = 160, PAD_L = 52, PAD_R = 16, PAD_T = 16, PAD_B = 32;
  var chartW = W - PAD_L - PAD_R;
  var chartH = H - PAD_T - PAD_B;
  var n      = serie.length;
  var barW   = Math.floor(chartW / n * 0.55);
  var gap    = chartW / n;

  var maxVal = serie.reduce(function(m,s){ return Math.max(m, s.importe); }, 0);
  if(maxVal <= 0) maxVal = 1;
  var scale  = chartH / (maxVal * 1.15);

  function yPos(v){ return PAD_T + chartH - Math.round(v * scale); }

  var bars = serie.map(function(s, i){
    var x  = PAD_L + Math.round(i * gap + gap/2 - barW/2);
    var bH = Math.max(s.importe > 0 ? 3 : 2, Math.round(s.importe * scale));
    var y  = PAD_T + chartH - bH;
    var col = s.estado === 'Liquidado'  ? 'var(--green)'
            : s.actual                  ? 'var(--accent)'
            : s.importe > 0             ? 'var(--text3)'
            :                             'var(--border2)';
    var lx = PAD_L + Math.round(i * gap + gap/2);
    // Valor sobre barra si > 0
    var valLabel = s.importe > 0
      ? '<text x="'+lx+'" y="'+(y-4)+'" text-anchor="middle" font-size="8" fill="var(--text3)" font-family="var(--font-mono)">'+s.importe.toFixed(0)+'€</text>'
      : '';
    return '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+bH+'" rx="3" fill="'+col+'" opacity="'+(s.actual?'.65':'.85')+'"/>'
      + valLabel
      + '<text x="'+lx+'" y="'+(H-PAD_B+14)+'" text-anchor="middle" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">'+s.label+'</text>';
  }).join('');

  var yticks = [0, 0.5, 1].map(function(pct){
    var v = maxVal * 1.15 * pct;
    var y = PAD_T + chartH - Math.round(v * scale);
    var lbl = v >= 1000 ? (v/1000).toFixed(1)+'k' : Math.round(v)+'';
    return '<line x1="'+(PAD_L-4)+'" y1="'+y+'" x2="'+PAD_L+'" y2="'+y+'" stroke="var(--border)" stroke-width="1"/>'
      +'<text x="'+(PAD_L-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="9" fill="var(--text3)" font-family="var(--font-mono)">'+lbl+'</text>';
  }).join('');

  var svg = '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:'+W+'px;display:block;">'
    + '<line x1="'+PAD_L+'" y1="'+PAD_T+'" x2="'+PAD_L+'" y2="'+(PAD_T+chartH)+'" stroke="var(--border)" stroke-width="1"/>'
    + '<line x1="'+PAD_L+'" y1="'+(PAD_T+chartH)+'" x2="'+(W-PAD_R)+'" y2="'+(PAD_T+chartH)+'" stroke="var(--border)" stroke-width="1"/>'
    + yticks + bars + '</svg>';

  return '<div class="card">'
    + '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">📅 Evolución bonus — últimos 6 meses</div>'
    + svg
    + '<div style="display:flex;gap:14px;margin-top:8px;font-size:10px;font-family:var(--font-mono);color:var(--text3);">'
    +   '<span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Liquidado</span>'
    +   '<span><span style="display:inline-block;width:10px;height:10px;background:var(--accent);border-radius:2px;margin-right:4px;vertical-align:middle;opacity:.65;"></span>Mes actual (estimado)</span>'
    +   '<span><span style="display:inline-block;width:10px;height:10px;background:var(--text3);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Histórico</span>'
    + '</div>'
    + '</div>';
}
