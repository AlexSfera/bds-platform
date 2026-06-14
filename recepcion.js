
// ── HTML: el markup de los modales de Recepción (modal-rec-kpi, modal-rec-caja,
//    modal-rec-tipo, modal-rec-traspaso) vive en index.html. recepcion.js NO
//    inyecta HTML para evitar IDs duplicados. Aquí solo va la lógica.

// ═══════════════════════════════════════════════════
// RECEPCIÓN — Funciones específicas
// Depende de: shared.js (debe cargarse antes)
// Tabla Supabase: recepcion_cash (NO cash_closings)
// ═══════════════════════════════════════════════════

// ── TABLA CORRECTA ──
var REC_TABLE = 'recepcion_cash';

function getRecTurnoValue() {
  var sel = document.querySelector('input[name="rec-turno"]:checked');
  return sel ? sel.value : '';
}

function updateRecTurnoStyle() {
  ['manana','tarde','noche'].forEach(function(t){
    var lbl = document.getElementById('rec-turno-'+t+'-lbl');
    var inp = document.getElementById('rec-turno-'+t);
    if(lbl && inp) {
      lbl.style.borderColor = inp.checked ? '#8b5cf6' : 'var(--border)';
      lbl.style.background  = inp.checked ? 'rgba(139,92,246,.1)' : 'var(--bg2)';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// KPI STATE
// ═══════════════════════════════════════════════════════════════════════
var _recKpiState = {};
var _recCajaEditId = null;

function setRecKpi(key, val, btn) {
  _recKpiState[key] = val;
  if(btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.tbtn').forEach(function(b){ b.classList.remove('t-si','t-no','t-na'); });
    if(val==='si') btn.classList.add('t-si');
    else if(val==='no') btn.classList.add('t-no');
    else btn.classList.add('t-na');
  }
  var deps = {
    upsell_desayuno:     'kpi-upsell-detail',
    clientes_insatisfechos: 'kpi-clientes-detail',
    syncrolab_ventas:    'syncro-ventas-container',
    lead_pendiente:      'kpi-lead-block'
  };
  if(deps[key]){
    var bl = document.getElementById(deps[key]);
    if(bl) bl.style.display = val==='si' ? (key==='upsell_desayuno'?'grid':'block') : 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// KPI MODAL
// ═══════════════════════════════════════════════════════════════════════
function openRecKpiModal() {
  _recKpiState = {};
  document.querySelectorAll('#modal-rec-kpi .tbtn').forEach(function(b){ b.classList.remove('t-si','t-no','t-na'); });
  ['kpi-upsell-detail','kpi-clientes-detail','syncro-ventas-container','kpi-lead-block'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.style.display='none';
  });
  ['kpi-checkins','kpi-checkouts','kpi-reservas','kpi-desal-ofertados','kpi-desal-vendidos','kpi-clientes-num','kpi-tareas-creadas','kpi-tareas-cerradas'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var errEl = document.getElementById('kpi-err');
  if(errEl) errEl.textContent='';
  var m=document.getElementById('modal-rec-kpi');
  if(m) m.style.display='flex';
}

function closeRecKpiModal() {
  var m=document.getElementById('modal-rec-kpi');
  if(m) m.style.display='none';
}

function submitRecKpi() {
  var errs = [];
  if(!_recKpiState.upsell_desayuno)     errs.push('Indica si ofertaste desayunos');
  if(!_recKpiState.clientes_insatisfechos) errs.push('Indica si hubo clientes insatisfechos');

  if(_recKpiState.syncrolab_ventas === 'si'){
    var ventas = collectSyncroVentas();
    var ventaErr = false;
    ventas.forEach(function(v,i){
      if(!v.tipo)             { errs.push('Venta SYNCROLAB #'+(i+1)+': selecciona tipo'); ventaErr=true; }
      if(!v.importe||v.importe<=0) { errs.push('Venta SYNCROLAB #'+(i+1)+': importe obligatorio'); ventaErr=true; }
      if(!v.mews)             { errs.push('Venta SYNCROLAB #'+(i+1)+': nº reserva MEWS obligatorio'); ventaErr=true; }
    });
    if(!ventaErr && ventas.length===0) errs.push('Añade al menos una venta SYNCROLAB');
  }
  if(_recKpiState.lead_pendiente === 'si'){
    var leadDesc = (document.getElementById('kpi-lead-desc')||{}).value||'';
    if(!leadDesc.trim()) errs.push('Describe el lead pendiente en Bitrix24');
  }
  if(errs.length > 0){
    var errEl = document.getElementById('kpi-err');
    if(errEl) errEl.textContent = errs.join(' · ');
    return;
  }
  var errEl2 = document.getElementById('kpi-err');
  if(errEl2) errEl2.textContent = '';

  _recKpiState.checkins  = parseInt((document.getElementById('kpi-checkins')||{}).value)||0;
  _recKpiState.checkouts = parseInt((document.getElementById('kpi-checkouts')||{}).value)||0;
  _recKpiState.reservas  = parseInt((document.getElementById('kpi-reservas')||{}).value)||0;
  _recKpiState.syncrolab_ventas_data = collectSyncroVentas();
  _recKpiState.lead_desc   = (document.getElementById('kpi-lead-desc')||{}).value||'';
  _recKpiState.lead_resp   = (document.getElementById('kpi-lead-resp')||{}).value||'';
  _recKpiState.lead_fecha  = (document.getElementById('kpi-lead-fecha')||{}).value||'';
  _recKpiState.clientes_num = parseInt((document.getElementById('kpi-clientes-num')||{}).value)||0;

  closeRecKpiModal();
  // BUG-01 FIX: guardar turno PRIMERO, luego abrir caja
  // CAJA-V2: pregunta traspaso o cierre en vez de abrir cierre directo
  _doSaveTurno().then(function() {
    openRecCajaChoice();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// calcRecDifs — definida en index.html (versión única y correcta)

// ═══════════════════════════════════════════════════════════════════════
// CAJA RECEPCIÓN — Abrir modal
// ═══════════════════════════════════════════════════════════════════════
function openRecCajaModal(existingId) {
  _recCajaEditId = existingId || null;
  if(typeof renderRecLabCharges === 'function') renderRecLabCharges();

  // Reset todos los campos
  // Reset campos editables — fondo se carga del cierre anterior
  ['rec-cash-mews','rec-tarjeta-mews','rec-stripe-mews','rec-trans-mews',
   'rec-cash-real','rec-tpv-real','rec-stripe-real','rec-trans-real',
   'rec-fondo-traspaso','rec-fondo-real',
   'rec-cf-importe','rec-room-charge','rec-syncrolab-charge',
   'rec-pension-desayuno-pax','rec-pension-comidacena-pax',
   'rec-eur-pension-desayuno','rec-eur-pension-comidacena',
   'rec-cargo-alexander','rec-dif-exp','rec-dif-accion'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });

  // BUG-29: Fondo recibido = fondo_real_a_traspasar del último cierre — readonly
  var fondoEl = document.getElementById('rec-fondo-recibido');
  if(fondoEl){
    fondoEl.value = '0.00';
    fondoEl.setAttribute('readonly','readonly');
    fondoEl.style.opacity = '0.6';
    fondoEl.style.cursor  = 'not-allowed';
  }
  if(!existingId){
    getDB(REC_TABLE).then(function(rows){
      var sorted = rows
        .filter(function(r){ return r.fondo_real_a_traspasar != null; })
        .sort(function(a,b){
          return (b.fecha||'').localeCompare(a.fecha||'') ||
                 (b.created_at||'').localeCompare(a.created_at||'');
        });
      var ultimo = sorted[0];
      if(fondoEl && ultimo){
        var fondo = parseFloat(ultimo.fondo_real_a_traspasar)||0;
        fondoEl.value = fondo.toFixed(2);
        calcRecDifs();
      }
    });
  }

  var turno = getRecTurnoValue() || _recTipoTurno || '—';
  var label = document.getElementById('rec-caja-turno-label');
  if(label) label.textContent = turno;

  var alertEl  = document.getElementById('rec-dif-alert');
  var expBlock = document.getElementById('rec-dif-exp-block');
  if(alertEl)  alertEl.style.display  = 'none';
  if(expBlock) expBlock.style.display = 'none';

  var errEl = document.getElementById('rec-caja-err');
  if(errEl) errEl.textContent = '';

  // Cargar datos existentes si es edición
  if(existingId){
    getDB(REC_TABLE).then(function(rows){
      var row = rows.find(function(r){ return r.id === existingId; });
      if(!row) return;
      function set(id, val){ var el=document.getElementById(id); if(el && val!=null) el.value=val; }
      // Campos reales de recepcion_cash
      set('rec-fondo-recibido',    row.fondo_recibido);
      set('rec-cash-mews',         row.cash_mews);
      set('rec-tarjeta-mews',      row.tarjeta_mews);
      set('rec-stripe-mews',       row.stripe_mews);
      set('rec-trans-mews',        row.transferencia_mews);
      set('rec-cash-real',         row.cash_real);
      set('rec-tpv-real',          row.tpv_real);
      set('rec-stripe-real',       row.stripe_real);
      set('rec-trans-real',        row.transferencia_banco);
      set('rec-fondo-traspaso',    row.fondo_traspasado);
      set('rec-cf-importe',        row.retiro_caja_fuerte);
      set('rec-room-charge',       row.room_charge_recibido);
      set('rec-syncrolab-charge',  row.syncrolab_room_charged);
      set('rec-pension-desayuno-pax',   row.pension_desayuno_pax);
      set('rec-pension-comidacena-pax', row.pension_comidacena_pax);
      set('rec-eur-pension-desayuno',   row.eur_pension_desayuno);
      set('rec-eur-pension-comidacena', row.eur_pension_comidacena);
      set('rec-fondo-real',             row.fondo_real_a_traspasar);
      set('rec-cargo-alexander',   row.cargo_alexander);
      set('rec-dif-exp',           row.explicacion_diferencia);
      set('rec-dif-accion',        row.accion_diferencia);
      calcRecDifs();
    });
  }

  var m = document.getElementById('modal-rec-caja');
  if(m) m.style.display = 'flex';
}

function closeRecCajaModal() {
  var m = document.getElementById('modal-rec-caja');
  if(m) m.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════
// CAJA RECEPCIÓN — Guardar (BUG-16 FIX: tabla y campos correctos)
// ═══════════════════════════════════════════════════════════════════════
async function submitRecCaja() {
  var errs = [];

  function gv(id){ return parseFloat(document.getElementById(id) ? document.getElementById(id).value : ''); }
  function gi(id){ return parseInt(document.getElementById(id) ? document.getElementById(id).value : '')||0; }

  var mewsCash  = gv('rec-cash-mews');
  var mewsTar   = gv('rec-tarjeta-mews');
  var mewsStr   = gv('rec-stripe-mews');
  var mewsTrans = gv('rec-trans-mews') || 0;
  var realCash  = gv('rec-cash-real');
  var realTpv   = gv('rec-tpv-real');
  var realStr   = gv('rec-stripe-real');
  var realTrans = gv('rec-trans-real') || 0;
  var fondoRec  = gv('rec-fondo-recibido') || 0;
  var fondoTras = gv('rec-fondo-traspaso');
  var cfImporte = gv('rec-cf-importe') || 0;
  var turno     = getRecTurnoValue() || _recTipoTurno || '';

  // Cargos hotel y pensiones
  var roomCharge           = gv('rec-room-charge') || 0;
  var syncrolabCharge      = gv('rec-syncrolab-charge') || 0;
  var pensionDesayunoPax   = gi('rec-pension-desayuno-pax');
  var pensionComidaCenaPax = gi('rec-pension-comidacena-pax');
  var eurPensionDesayuno   = gv('rec-eur-pension-desayuno') || 0;
  var eurPensionComidaCena = gv('rec-eur-pension-comidacena') || 0;
  var cargoAlexander       = gv('rec-cargo-alexander') || 0;

  if(isNaN(mewsCash))  errs.push('Cash según MEWS obligatorio');
  if(isNaN(mewsTar))   errs.push('Tarjeta según MEWS obligatoria');
  if(isNaN(mewsStr))   errs.push('Stripe según MEWS obligatorio');
  if(isNaN(realCash))  errs.push('Cash real obligatorio');
  if(isNaN(realTpv))   errs.push('TPV real obligatorio');
  if(isNaN(realStr))   errs.push('Stripe real obligatorio');
  if(isNaN(fondoTras)) errs.push('Fondo traspasado obligatorio');
  if(!turno)           errs.push('Selecciona turno: Mañana, Tarde o Noche');

  // Δ Cash = Fondo recibido + Cash MEWS - Cash real
  var difCash  = fondoRec + mewsCash - realCash;
  var difTar   = realTpv   - mewsTar;
  var difStr   = realStr   - mewsStr;
  var difTrans = realTrans - mewsTrans;
  // Fondo esperado = Cash real - Retiro
  var fondoEsperado = realCash - cfImporte;
  var difTotal = difCash + difTar + difStr + difTrans;

  var hasError = Math.abs(difTotal) > 0.01;
  if(hasError){
    var exp = (document.getElementById('rec-dif-exp')||{value:''}).value.trim();
    if(!exp) errs.push('Diferencia detectada: explicación obligatoria');
  }
  if(errs.length > 0){
    var errEl = document.getElementById('rec-caja-err');
    if(errEl){ errEl.textContent = errs.join(' · '); errEl.style.display='block'; }
    console.error('submitRecCaja validation errors:', errs);
    toast(errs[0], 'err');
    return;
  }
  var errEl2 = document.getElementById('rec-caja-err');
  if(errEl2) errEl2.textContent = '';

  // CAJA-V2: Mañana/Tarde solo traspasan + una operación por turno y día
  if(!_recCajaEditId && currentUser.rol !== 'admin'){
    if(turno !== 'Noche'){
      var msgT = 'El turno de '+turno+' no puede cerrar caja. Haz un traspaso.';
      if(errEl2) errEl2.textContent = msgT;
      toast(msgT, 'err');
      return;
    }
    var dupC = await getRecOpToday(turno);
    if(dupC){
      var msgD = 'El turno '+turno+' ya registró '+(dupC.tipo === 'traspaso' ? 'un traspaso' : 'un cierre')+' hoy. Solo una operación por turno.';
      if(errEl2) errEl2.textContent = msgD;
      toast(msgD, 'err');
      return;
    }
  }

  var ts    = localTs();
  var fecha = document.getElementById('t-fecha') ? document.getElementById('t-fecha').value : today();

  // BUG-16 FIX: nombres de columnas reales de recepcion_cash
  var record = {
    id:                        _recCajaEditId || genId(),
    shift_id:                  window._lastSavedShiftId || null,
    fecha:                     fecha,
    turno:                     turno,
    responsable_id:            currentUser.id,
    responsable_nombre:        currentUser.nombre,
    usuario_id:                currentUser.id,
    usuario_nombre:            currentUser.nombre,
    estado:                    'cerrado',
    tipo:                      'cierre',
    // Fondos
    fondo_recibido:            fondoRec,
    fondo_traspasado:          fondoTras,
    fondo_real_a_traspasar:    fondoEsperado,  // Fondo recibido + Cash real - Retiro
    fondo_inicial_siguiente:   fondoTras,
    retiro_caja_fuerte:        cfImporte,
    // MEWS
    cash_mews:                 mewsCash,
    tarjeta_mews:              mewsTar,
    stripe_mews:               mewsStr,
    transferencia_mews:        mewsTrans,
    // Real
    cash_real:                 realCash,
    tpv_real:                  realTpv,
    stripe_real:               realStr,
    transferencia_banco:       realTrans,
    transferencia_banco_updated_at: window._recTransFecha || null,
    // Diferencias
    dif_cash:                  difCash,
    dif_tarjeta:               difTar,
    dif_stripe:                difStr,
    dif_transferencia:         difTrans,
    dif_total:                 difTotal,
    dif_fondo_traspaso:        0,
    // Explicación
    explicacion_diferencia:    (document.getElementById('rec-dif-exp')||{value:''}).value.trim() || null,
    accion_diferencia:         (document.getElementById('rec-dif-accion')||{value:''}).value.trim() || null,
    informado_responsable:     _recKpiState.dif_informado === 'si' ? 'si' : 'no',
    // Cargos hotel
    room_charge_recibido:      roomCharge,
    syncrolab_room_charged:    syncrolabCharge,
    // Pensiones (nuevos campos)
    pension_desayuno_pax:    pensionDesayunoPax,
    pension_comidacena_pax:  pensionComidaCenaPax,
    eur_pension_desayuno:    eurPensionDesayuno,
    eur_pension_comidacena:  eurPensionComidaCena,
    cargo_alexander:         cargoAlexander,
    // Timestamps
    updated_at:                ts
  };

  if(!_recCajaEditId) record.created_at = ts;

  try {
    if(_recCajaEditId){
      await dbUpdate(REC_TABLE, _recCajaEditId, record);
      await auditLog('REC_CAJA_EDIT', currentUser.nombre+' editó caja recepción '+fecha+' turno '+turno);
      toast('Caja recepción actualizada', 'ok');
    } else {
      await dbInsert(REC_TABLE, record);
      await auditLog('REC_CAJA_SAVE', currentUser.nombre+' cerró caja recepción '+fecha+' turno '+turno);
      toast('Caja recepción guardada', 'ok');
      if(typeof autoLogoutAfterCaja === 'function') autoLogoutAfterCaja();
    }
    invalidateCache(REC_TABLE);
    closeRecCajaModal();
    renderRecepcionCajaList();
  } catch(e){
    var errEl3 = document.getElementById('rec-caja-err');
    if(errEl3) errEl3.textContent = 'Error al guardar: '+e.message;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CAJA RECEPCIÓN — Lista y dashboard (tabla correcta)
// ═══════════════════════════════════════════════════════════════════════
async function renderRecepcionCajaList() {
  var el = document.getElementById('rec-caja-list');
  if(!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';

  var periodo = (document.getElementById('rec-dash-periodo')||{value:'hoy'}).value || 'hoy';
  var rows = [];
  try { rows = await getDB(REC_TABLE); } catch(e){ rows = []; }

  // Filtro por periodo
  var t = today(), sw = startOfWeek(), sm = startOfMonth();
  if(periodo === 'hoy')    rows = rows.filter(function(r){ return r.fecha === t; });
  else if(periodo === 'semana') rows = rows.filter(function(r){ return r.fecha >= sw; });
  else if(periodo === 'mes')    rows = rows.filter(function(r){ return r.fecha >= sm; });

  rows.sort(function(a,b){
    return (b.fecha||'').localeCompare(a.fecha||'') || (b.created_at||'').localeCompare(a.created_at||'');
  });

  if(!rows.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin operaciones de caja en este periodo</div></div>';
    return;
  }

  var isAdminU   = currentUser && currentUser.rol === 'admin';
  var isJefeRec  = currentUser && currentUser.rol === 'jefe_recepcion';
  var canReopen  = isAdminU || isJefeRec;

  var html = '<div style="overflow-x:auto"><table>'
    + '<tr><th>Fecha</th><th>Turno</th><th>Tipo</th><th>Recepcionista</th>'
    + '<th>Δ Cash</th><th>Δ TPV</th><th>Δ Stripe</th><th>Δ Trans.</th><th>Δ Total</th>'
    + '<th>Estado</th><th>Acciones</th></tr>';

  rows.forEach(function(r){
    var dif      = parseFloat(r.dif_total || 0);
    var difColor = Math.abs(dif) < 0.01 ? 'var(--green)' : 'var(--red)';
    var difTxt   = (dif >= 0 ? '+' : '') + dif.toFixed(2) + '€';

    var estado = r.estado || 'cerrado';
    var estadoBadge = estado === 'validado'  ? '<span class="badge b-green">✓ Validado</span>'
                    : estado === 'reabierto' ? '<span class="badge b-orange">↩ Reabierto</span>'
                    : '<span class="badge b-red">● '+estado+'</span>';

    var esTraspaso = r.tipo === 'traspaso';
    var tipoBadge  = esTraspaso
      ? '<span class="badge" style="background:rgba(8,145,178,.15);color:#0891b2;border:1px solid #0891b2;">🔁 Traspaso</span>'
      : '<span class="badge" style="background:rgba(139,92,246,.15);color:#8b5cf6;border:1px solid #8b5cf6;">💰 Cierre</span>';
    var verFn    = esTraspaso ? 'openRecTraspasoModal' : 'openRecCajaModal';
    var acciones = '<button class="btn btn-secondary btn-sm" onclick="'+verFn+'(\''+r.id+'\')">Ver</button>';
    if(canReopen && estado !== 'reabierto')
      acciones += ' <button class="btn btn-secondary btn-sm" onclick="reabrirCajaRec(\''+r.id+'\')">Reabrir</button>';
    if(isAdminU)
      acciones += ' <button class="btn btn-danger btn-sm" onclick="eliminarCajaRec(\''+r.id+'\')">Eliminar</button>';

    function dCell(val){ return '<td style="font-family:var(--font-mono);color:'+(Math.abs(val||0)<0.01?'var(--green)':'var(--red)')+'">'+((val||0)>=0?'+':'')+(parseFloat(val||0)).toFixed(2)+'€</td>'; }

    html += '<tr>'
      + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(r.fecha) + '</td>'
      + '<td>' + bTurno(r.turno) + '</td>'
      + '<td>' + tipoBadge + '</td>'
      + '<td style="font-weight:600">' + (r.responsable_nombre || r.usuario_nombre || '—') + '</td>'
      + dCell(r.dif_cash)
      + dCell(r.dif_tarjeta)
      + dCell(r.dif_stripe)
      + dCell(r.dif_transferencia)
      + '<td style="font-family:var(--font-mono);font-weight:700;color:'+difColor+'">'+difTxt+'</td>'
      + '<td>' + estadoBadge + '</td>'
      + '<td style="white-space:nowrap">' + acciones + '</td>'
      + '</tr>';
  });
  html += '</table></div>';
  el.innerHTML = html;
}

function bTurno(t){
  var icons = { Mañana:'🌅', Tarde:'🌆', Noche:'🌙' };
  return '<span style="font-size:12px">' + (icons[t]||'') + (t||'—') + '</span>';
}

async function renderRecepcionDashboard() {
  var el = document.getElementById('rec-dashboard-content');
  if(!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';

  var periodo = (document.getElementById('rec-dash-periodo2')||{value:'hoy'}).value || 'hoy';
  var rows = [];
  try { rows = await getDB(REC_TABLE); } catch(e){ rows = []; }

  var t = today(), sw = startOfWeek(), sm = startOfMonth();
  if(periodo === 'hoy')    rows = rows.filter(function(r){ return r.fecha === t; });
  else if(periodo === 'semana') rows = rows.filter(function(r){ return r.fecha >= sw; });
  else if(periodo === 'mes')    rows = rows.filter(function(r){ return r.fecha >= sm; });

  if(!rows.length){
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin datos en este periodo</div></div>';
    return;
  }

  var totalDif  = rows.reduce(function(s,r){ return s + Math.abs(parseFloat(r.dif_total)||0); }, 0);
  var turnos    = rows.length;
  var conError  = rows.filter(function(r){ return Math.abs(parseFloat(r.dif_total)||0) > 0.01; }).length;
  var totalTrans = rows.reduce(function(s,r){ return s + Math.abs(parseFloat(r.dif_transferencia)||0); }, 0);

  el.innerHTML = '<div class="kpi-grid">'
    + '<div class="kpi k-amber"><div class="kpi-lbl">Cierres</div><div class="kpi-val">'+turnos+'</div></div>'
    + '<div class="kpi k-red"><div class="kpi-lbl">Con diferencia</div><div class="kpi-val">'+conError+'</div></div>'
    + '<div class="kpi k-orange"><div class="kpi-lbl">Δ Total acum.</div><div class="kpi-val" style="color:'+(totalDif>0?'var(--red)':'var(--green)')+'">'+totalDif.toFixed(2)+'€</div></div>'
    + '<div class="kpi k-blue"><div class="kpi-lbl">Δ Transferencias</div><div class="kpi-val" style="color:'+(totalTrans>0?'var(--red)':'var(--green)')+'">'+totalTrans.toFixed(2)+'€</div></div>'
    + '</div>';
}

// ═══════════════════════════════════════════════════════════════════════
// REABRIR / ELIMINAR CAJA
// ═══════════════════════════════════════════════════════════════════════
async function reabrirCajaRec(cajaId) {
  var motivo = prompt('Motivo de reapertura (obligatorio):');
  if(!motivo || !motivo.trim()){ toast('Motivo obligatorio','err'); return; }
  try {
    await dbUpdate(REC_TABLE, cajaId, {
      estado: 'reabierto',
      reabierto_por: currentUser.nombre,
      comentario: motivo.trim(),
      updated_at: localTs()
    });
    await auditLog('REC_CAJA_REABRIR', 'Caja '+cajaId+' reabierta por '+currentUser.nombre+' — '+motivo.trim());
    invalidateCache(REC_TABLE);
    toast('Caja reabierta', 'ok');
    renderRecepcionCajaList();
    if(typeof renderValCajaRecepcion === 'function') renderValCajaRecepcion();
  } catch(e){ toast('Error: '+e.message,'err'); }
}

async function eliminarCajaRec(cajaId) {
  if(!currentUser || currentUser.rol !== 'admin'){ toast('Solo admin puede eliminar','err'); return; }
  var motivo = prompt('Motivo de eliminación (obligatorio para auditoría):');
  if(!motivo || !motivo.trim()){ toast('Motivo obligatorio','err'); return; }
  if(!confirm('¿Eliminar este cierre de caja? Quedará registrado en auditoría.')) return;
  try {
    await auditLog('REC_CAJA_DELETE', 'Caja '+cajaId+' eliminada por '+currentUser.nombre+' — '+motivo.trim());
    await dbDelete(REC_TABLE, cajaId);
    invalidateCache(REC_TABLE);
    toast('Caja eliminada — registrado en auditoría','ok');
    renderRecepcionCajaList();
    if(typeof renderValCajaRecepcion === 'function') renderValCajaRecepcion();
  } catch(e){ toast('Error: '+e.message,'err'); }
}

// ═══════════════════════════════════════════════════════════════════════
// REAPERTURA DE TURNO VALIDADO
// ═══════════════════════════════════════════════════════════════════════
async function reabrirTurnoValidado(shiftId) {
  var canReopen = currentUser.rol === 'admin'
    || currentUser.rol === 'jefe_recepcion'
    || currentUser.rol === 'chef'
    || currentUser.rol === 'fb';
  if(!canReopen){ toast('Sin permiso para reabrir','err'); return; }
  var motivo = prompt('Motivo de reapertura:');
  if(!motivo || !motivo.trim()){ toast('Motivo obligatorio','err'); return; }
  try {
    await dbUpdate('shifts', shiftId, {
      estado: 'En corrección',
      comentario_validador: 'Reabierto por '+currentUser.nombre+': '+motivo.trim(),
      validado_por: null, validado_ts: null,
      updated_at: localTs()
    });
    await auditLog('REOPEN_SHIFT', currentUser.nombre+' reabrió turno '+shiftId+' — '+motivo.trim());
    invalidateCache('shifts');
    toast('Turno reabierto — vuelve a estado En corrección','ok');
    renderValidacion();
  } catch(e){ toast('Error: '+e.message,'err'); }
}


// ═══════════════════════════════════════════════════════════════════════
// SYNCROLAB VENTAS
// ═══════════════════════════════════════════════════════════════════════
var _syncroVentaIdx = 0;
var _syncroVentas   = [];

function addSyncroVenta() {
  var idx = _syncroVentaIdx++;
  _syncroVentas.push({idx:idx});
  var c = document.getElementById('syncro-ventas-container');
  if(!c) return;
  var div = document.createElement('div');
  div.id = 'syncro-venta-'+idx;
  div.style.cssText = 'border:1px solid #06b6d4;border-radius:6px;padding:10px;margin-bottom:8px;position:relative;';
  div.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    + '<div class="fg"><label>Tipo de servicio <span class="req">*</span></label><select id="sv-tipo-'+idx+'" style="color:#111827;background:#ffffff;"><option value="">— Seleccionar —</option><option>Entrenamiento personal</option><option>Fisioterapia</option><option>Recuperación</option><option>Testing deportivo</option><option>Nutrición</option><option>Consulta médica</option><option>Otro SYNCROLAB</option></select></div>'
    + '<div class="fg"><label>Importe (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="sv-importe-'+idx+'" placeholder="0.00" style="color:#111827;background:#ffffff;"></div>'
    + '<div class="fg"><label>Nº reserva MEWS <span class="req">*</span></label><input type="text" id="sv-mews-'+idx+'" placeholder="Nº reserva" style="color:#111827;background:#ffffff;"></div>'
    + '<div class="fg"><label>Comentario</label><input type="text" id="sv-obs-'+idx+'" placeholder="Opcional" style="color:#111827;background:#ffffff;"></div>'
    + '</div>'
    + '<button onclick="removeSyncroVenta('+idx+')" style="position:absolute;top:8px;right:8px;background:var(--red-dim);border:1px solid var(--red);color:var(--red);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">✕</button>';
  c.appendChild(div);
}

function removeSyncroVenta(idx) {
  var el = document.getElementById('syncro-venta-'+idx);
  if(el) el.remove();
  _syncroVentas = _syncroVentas.filter(function(v){ return v.idx !== idx; });
}

function collectSyncroVentas() {
  var result = [];
  document.querySelectorAll('#syncro-ventas-container > div').forEach(function(div){
    var id     = div.id.replace('syncro-venta-','');
    var tipo   = (document.getElementById('sv-tipo-'+id)||{value:''}).value;
    var importe= parseFloat((document.getElementById('sv-importe-'+id)||{value:''}).value)||0;
    var mews   = (document.getElementById('sv-mews-'+id)||{value:''}).value;
    var obs    = (document.getElementById('sv-obs-'+id)||{value:''}).value;
    if(tipo) result.push({tipo, importe, mews, obs});
  });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(function(){
    if(typeof renderFollowupList === 'function') renderFollowupList();
  }, 500);
});

// bGestionEstado → gestiones.js (eliminado duplicado · ARCH-03)
// ═══════════════════════════════════════════════════════════════════════
// RECEPCIÓN — Funciones auxiliares caja (extraídas de index.html · ARCH-01)
// ═══════════════════════════════════════════════════════════════════════

function setTransferDate() {
  var el = document.getElementById('rec-trans-real');
  var dateEl = document.getElementById('rec-trans-fecha');
  if(!dateEl) return;
  if(!el || !el.value || parseFloat(el.value) === 0) {
    dateEl.style.display = 'none';
    return;
  }
  var d = new Date();
  var fmt = d.toLocaleDateString('es-ES') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  dateEl.textContent = '📅 Última actualización: ' + fmt;
  dateEl.style.display = 'block';
  window._recTransFecha = localTs();
}

function calcRecDifs() {
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  var mewsCash  = gv('rec-cash-mews');
  var mewsTar   = gv('rec-tarjeta-mews');
  var mewsStr   = gv('rec-stripe-mews');
  var mewsTrans = gv('rec-trans-mews');
  var realCash  = gv('rec-cash-real');
  var realTpv   = gv('rec-tpv-real');
  var realStr   = gv('rec-stripe-real');
  var realTrans = gv('rec-trans-real');
  var fondoRec  = parseFloat((document.getElementById('rec-fondo-recibido')||{}).value)||0;
  var cfImporte = gv('rec-cf-importe');

  var difCash  = mewsCash - (realCash - fondoRec);
  var difTar   = mewsTar  - realTpv;
  var difStr   = mewsStr  - realStr;
  var difTrans = mewsTrans - realTrans;
  var difTotal = difCash + difTar + difStr + difTrans;

  function fmt(val){ return (val>=0?'+':'')+val.toFixed(2)+' €'; }
  function setColor(id, val){
    var el=document.getElementById(id); if(!el) return;
    el.textContent = fmt(val);
    el.style.color = Math.abs(val)<0.01 ? 'var(--green)' : 'var(--red)';
  }
  setColor('rec-dif-cash',    difCash);
  setColor('rec-dif-tarjeta', difTar);
  setColor('rec-dif-stripe',  difStr);
  setColor('rec-dif-trans',   difTrans);
  setColor('rec-dif-total',   difTotal);

  var fondoEsperado = fondoRec + mewsCash - cfImporte;
  var feEl = document.getElementById('rec-fondo-esperado');
  if(feEl){ feEl.textContent=fondoEsperado.toFixed(2)+' €'; feEl.style.color=fondoEsperado>=0?'var(--green)':'var(--red)'; }
  var fondoReal2 = parseFloat((document.getElementById('rec-fondo-traspaso')||{}).value)||0;
  var difFondo2 = fondoReal2 - fondoEsperado;
  var fondoDifEl = document.getElementById('rec-fondo-dif');
  if(fondoDifEl){
    fondoDifEl.textContent = Math.abs(difFondo2)<0.01 ? '✓ Fondo cuadrado' : '⚠ Diferencia fondo: '+(difFondo2>=0?'+':'')+difFondo2.toFixed(2)+'€';
    fondoDifEl.style.color = Math.abs(difFondo2)<0.01 ? 'var(--green)' : 'var(--red)';
  }

  var hasError = Math.abs(difTotal)>0.01;
  var alertEl  = document.getElementById('rec-dif-alert');
  var expBlock = document.getElementById('rec-dif-exp-block');
  if(alertEl)  alertEl.style.display  = hasError?'block':'none';
  if(expBlock) expBlock.style.display = hasError?'block':'none';
}


// ═══════════════════════════════════════════════════════════════════════
// CAJA-V2 · ELECCIÓN TRASPASO/CIERRE + TRASPASO DE CAJA RECEPCIÓN
// Reglas: Mañana/Tarde → solo traspaso · Noche → traspaso o cierre
//         Una operación (cierre O traspaso) por turno y día · admin exento
// Cadena de fondo: fondo recibido = fondo_real_a_traspasar del último
// registro (cierre o traspaso, comparten tabla recepcion_cash).
// Requiere columna recepcion_cash.tipo (default 'cierre').
// ═══════════════════════════════════════════════════════════════════════
var _recTipoTurno      = null;
var _recTraspasoEditId = null;
var _recTrasCF         = null;

// CAJA-V2 · Si el usuario ya registró una operación de caja hoy (cualquier turno),
// el turno de Mi Turno queda fijado a ese valor y no se puede cambiar.
// Garantiza: traspaso y cierre de turno siempre el MISMO turno por persona/día.
async function lockRecTurnoIfCajaToday() {
  if(!currentUser) return;
  var rows = [];
  try { rows = await getDB(REC_TABLE); } catch(e){ return; }
  var t = today();
  var mine = rows.find(function(r){
    return r.fecha === t && (r.responsable_id === currentUser.id || r.usuario_id === currentUser.id);
  });
  if(!mine || !mine.turno) return;

  var map = { 'Mañana':'manana', 'Tarde':'tarde', 'Noche':'noche' };
  var key = map[mine.turno];
  document.querySelectorAll('input[name="rec-turno"]').forEach(function(r){
    r.checked  = (r.value === mine.turno);
    r.disabled = true;  // bloqueado: ya hay operación de caja hoy
  });
  if(typeof updateRecTurnoStyle === 'function') updateRecTurnoStyle();

  // Aviso visible bajo el selector
  var block = document.getElementById('rec-turno-block');
  if(block && !document.getElementById('rec-turno-locked-msg')){
    var note = document.createElement('div');
    note.id = 'rec-turno-locked-msg';
    note.style.cssText = 'font-size:12px;color:var(--text3);margin-top:8px;font-family:var(--font-mono);';
    note.textContent = '🔒 Turno fijado a ' + mine.turno + ' — ya registraste ' +
      (mine.tipo === 'traspaso' ? 'un traspaso' : 'un cierre') + ' de caja hoy.';
    block.appendChild(note);
  }
}

async function getRecOpToday(turno) {
  var rows = [];
  try { rows = await getDB(REC_TABLE); } catch(e){ rows = []; }
  var t = today();
  return rows.find(function(r){ return r.fecha === t && r.turno === turno; }) || null;
}

function openRecCajaChoice() {
  // FIX UX: el turno se hereda de Mi Turno (radio rec-turno). NO se elige dos veces.
  _recTipoTurno = getRecTurnoValue() || null;

  var fixedBox = document.getElementById('rec-tipo-turno-fixed');
  var pickBox  = document.getElementById('rec-tipo-turno-pick');
  var lblFixed = document.getElementById('rec-tipo-turno-label');
  ['manana','tarde','noche'].forEach(function(k){
    var b = document.getElementById('rec-tipo-turno-'+k);
    if(b) b.classList.remove('t-si');
  });

  if(_recTipoTurno){
    // Heredado: rótulo fijo, sin selector
    if(fixedBox) fixedBox.style.display = 'block';
    if(pickBox)  pickBox.style.display  = 'none';
    if(lblFixed) lblFixed.textContent   = _recTipoTurno;
  } else {
    // Fallback (entró por sidebar sin Mi Turno hoy): pedir turno una vez
    if(fixedBox) fixedBox.style.display = 'none';
    if(pickBox)  pickBox.style.display  = 'block';
  }

  var msg = document.getElementById('rec-tipo-msg');
  if(msg) msg.textContent = _recTipoTurno ? '' : 'Selecciona tu turno para continuar';
  setRecTipoBtns(false, false);
  setRecSkipBtn('none');
  var m = document.getElementById('modal-rec-tipo');
  if(m) m.style.display = 'flex';
  if(_recTipoTurno) evalRecCajaChoice();
}

function closeRecCajaChoice() {
  var m = document.getElementById('modal-rec-tipo');
  if(m) m.style.display = 'none';
}

function setRecTipoTurno(t, btn) {
  _recTipoTurno = t;
  if(btn && btn.parentElement){
    btn.parentElement.querySelectorAll('.tbtn').forEach(function(b){ b.classList.remove('t-si'); });
    btn.classList.add('t-si');
  }
  evalRecCajaChoice();
}

function setRecTipoBtns(traspasoOn, cierreOn) {
  var bt = document.getElementById('rec-tipo-btn-traspaso');
  var bc = document.getElementById('rec-tipo-btn-cierre');
  if(bt){ bt.disabled = !traspasoOn; bt.style.opacity = traspasoOn ? '1' : '.4'; bt.style.cursor = traspasoOn ? 'pointer' : 'not-allowed'; }
  if(bc){ bc.disabled = !cierreOn;   bc.style.opacity = cierreOn   ? '1' : '.4'; bc.style.cursor = cierreOn   ? 'pointer' : 'not-allowed'; }
}

function setRecSkipBtn(mode, opTipo) {
  // mode: 'self' (yo ya hice caja) · 'mate' (compañero la hizo) · 'none' (nadie)
  var b = document.getElementById('rec-tipo-btn-skip');
  if(!b) return;
  if(mode === 'self'){
    b.style.display = 'block';
    b.textContent = '✓ Cerrar turno — ' + (opTipo === 'traspaso' ? 'traspaso' : 'cierre') + ' de caja ya registrado por ti';
  } else if(mode === 'mate'){
    b.style.display = 'block';
    b.textContent = '✓ Cerrar turno sin caja (la gestiona mi compañero/a)';
  } else {
    b.style.display = 'block';
    b.textContent = '✓ Cerrar turno sin caja (la gestiona mi compañero/a)';
  }
}

async function evalRecCajaChoice() {
  var msg = document.getElementById('rec-tipo-msg');
  if(!_recTipoTurno){ setRecTipoBtns(false, false); return; }
  setRecTipoBtns(false, false);
  if(msg){ msg.textContent = 'Comprobando operaciones de hoy...'; msg.style.color = 'var(--text3)'; }

  var isAdminU = currentUser && currentUser.rol === 'admin';
  var dup = await getRecOpToday(_recTipoTurno);
  var dupEsMia = dup && (dup.responsable_id === currentUser.id || dup.usuario_id === currentUser.id);

  if(dup && dupEsMia && !isAdminU){
    // YO ya hice mi caja hoy → no hay nada que elegir, solo cerrar turno
    if(msg){
      msg.textContent = '✓ Ya registraste tu ' + (dup.tipo === 'traspaso' ? 'traspaso' : 'cierre') + ' de caja en el turno ' + _recTipoTurno + '. Cierra el turno para terminar.';
      msg.style.color = 'var(--green)';
    }
    setRecTipoBtns(false, false);
    setRecSkipBtn('self', dup.tipo);
    return;
  }

  if(dup && !dupEsMia && !isAdminU){
    // Mi COMPAÑERO hizo la caja → cerrar sin caja
    if(msg){
      msg.textContent = '⛔ El turno '+_recTipoTurno+' ya registró '+(dup.tipo === 'traspaso' ? 'un traspaso' : 'un cierre')+' hoy ('+(dup.responsable_nombre || dup.usuario_nombre || '')+'). Cierra el turno sin caja.';
      msg.style.color = 'var(--red)';
    }
    setRecTipoBtns(false, false);
    setRecSkipBtn('mate');
    return;
  }

  setRecSkipBtn('none');
  var puedeCerrar = isAdminU || _recTipoTurno === 'Noche';
  setRecTipoBtns(true, puedeCerrar);
  if(msg){
    if(dup && isAdminU){
      msg.textContent = '⚠ Ya existe una operación de este turno hoy. Como admin puedes duplicar — revisa antes de guardar.';
      msg.style.color = 'var(--amber)';
    } else if(!puedeCerrar){
      msg.textContent = 'Turno '+_recTipoTurno+': solo traspaso. El cierre de caja corresponde al turno de Noche.';
      msg.style.color = 'var(--text3)';
    } else {
      msg.textContent = '';
    }
  }
}

// Cierre de turno SIN operación de caja (2 recepcionistas: la caja la hace el compañero)
async function skipRecCajaOp() {
  var turno = _recTipoTurno || getRecTurnoValue() || '—';
  closeRecCajaChoice();
  var dup = await getRecOpToday(turno);
  var dupEsMia = dup && (dup.responsable_id === currentUser.id || dup.usuario_id === currentUser.id);
  if(dupEsMia){
    // Yo ya hice la caja: el turno simplemente se cierra, sin registro de "skip"
    toast('Turno cerrado — caja ya registrada', 'ok');
  } else {
    auditLog('REC_CAJA_SKIP', currentUser.nombre+' cerró turno '+turno+' sin operación de caja ('+today()+')');
    toast('Turno cerrado sin operación de caja', 'ok');
  }
  if(typeof autoLogoutAfterCaja === 'function') autoLogoutAfterCaja();
}

function startRecTraspaso() {
  var b = document.getElementById('rec-tipo-btn-traspaso');
  if(b && b.disabled) return;
  if(!_recTipoTurno){ toast('Selecciona tu turno','err'); return; }
  closeRecCajaChoice();
  openRecTraspasoModal();
}

function startRecCierre() {
  var b = document.getElementById('rec-tipo-btn-cierre');
  if(b && b.disabled) return;
  if(!_recTipoTurno){ toast('Selecciona tu turno','err'); return; }
  closeRecCajaChoice();
  openRecCajaModal();
}

// ── TRASPASO: modal ─────────────────────────────────────────────────────
function openRecTraspasoModal(existingId) {
  _recTraspasoEditId = existingId || null;
  _recTrasCF = null;

  ['rec-tras-ventas-mews','rec-tras-cash-real','rec-tras-cf-importe',
   'rec-tras-fondo-real','rec-tras-dif-exp','rec-tras-dif-accion'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  ['rec-tras-cf-si','rec-tras-cf-no'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.classList.remove('t-si','t-no');
  });
  var cfBlock = document.getElementById('rec-tras-cf-block');
  if(cfBlock) cfBlock.style.display = 'none';
  var difBlock = document.getElementById('rec-tras-dif-block');
  if(difBlock) difBlock.style.display = 'none';
  var difEl = document.getElementById('rec-tras-dif');
  if(difEl){ difEl.textContent = '—'; difEl.style.color = 'var(--text3)'; }
  var errEl = document.getElementById('rec-tras-err');
  if(errEl) errEl.textContent = '';

  var fondoEl = document.getElementById('rec-tras-fondo-recibido');
  if(fondoEl) fondoEl.value = '0.00';

  var label = document.getElementById('rec-tras-turno-label');

  if(!existingId){
    if(label) label.textContent = _recTipoTurno || getRecTurnoValue() || '—';
    // Fondo recibido = fondo_real_a_traspasar del último cierre O traspaso — no editable
    getDB(REC_TABLE).then(function(rows){
      var sorted = rows
        .filter(function(r){ return r.fondo_real_a_traspasar != null; })
        .sort(function(a,b){
          return (b.fecha||'').localeCompare(a.fecha||'') ||
                 (b.created_at||'').localeCompare(a.created_at||'');
        });
      var ultimo = sorted[0];
      if(fondoEl && ultimo){
        fondoEl.value = (parseFloat(ultimo.fondo_real_a_traspasar)||0).toFixed(2);
        calcRecTraspaso();
      }
    });
  } else {
    getDB(REC_TABLE).then(function(rows){
      var row = rows.find(function(r){ return r.id === existingId; });
      if(!row) return;
      _recTipoTurno = row.turno || _recTipoTurno;
      if(label) label.textContent = row.turno || '—';
      function set(id, val){ var el = document.getElementById(id); if(el && val != null) el.value = val; }
      set('rec-tras-fondo-recibido', (parseFloat(row.fondo_recibido)||0).toFixed(2));
      set('rec-tras-ventas-mews',    row.cash_mews);
      set('rec-tras-cash-real',      row.cash_real);
      set('rec-tras-fondo-real',     row.fondo_traspasado);
      set('rec-tras-dif-exp',        row.explicacion_diferencia);
      set('rec-tras-dif-accion',     row.accion_diferencia);
      var cf = parseFloat(row.retiro_caja_fuerte)||0;
      if(cf > 0){
        setRecTrasCF('si', document.getElementById('rec-tras-cf-si'));
        set('rec-tras-cf-importe', cf);
      } else {
        setRecTrasCF('no', document.getElementById('rec-tras-cf-no'));
      }
      calcRecTraspaso();
    });
  }

  var m = document.getElementById('modal-rec-traspaso');
  if(m) m.style.display = 'flex';
}

function closeRecTraspasoModal() {
  var m = document.getElementById('modal-rec-traspaso');
  if(m) m.style.display = 'none';
}

function setRecTrasCF(val, btn) {
  _recTrasCF = val;
  if(btn && btn.parentElement){
    btn.parentElement.querySelectorAll('.tbtn').forEach(function(b){ b.classList.remove('t-si','t-no'); });
    btn.classList.add(val === 'si' ? 't-si' : 't-no');
  }
  var block = document.getElementById('rec-tras-cf-block');
  if(block) block.style.display = val === 'si' ? 'block' : 'none';
  if(val === 'no'){
    var imp = document.getElementById('rec-tras-cf-importe');
    if(imp) imp.value = '';
  }
  calcRecTraspaso();
}

function calcRecTraspaso() {
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  var fondoRec = gv('rec-tras-fondo-recibido');
  var ventas   = gv('rec-tras-ventas-mews');
  var cf       = _recTrasCF === 'si' ? gv('rec-tras-cf-importe') : 0;

  // Fondo esperado = Fondo recibido + Ventas efectivo MEWS − Retiro caja fuerte
  var esperado = fondoRec + ventas - cf;
  var espEl = document.getElementById('rec-tras-fondo-esperado');
  if(espEl){
    espEl.textContent = esperado.toFixed(2) + ' €';
    espEl.style.color = esperado >= 0 ? 'var(--green)' : 'var(--red)';
  }

  var realRaw = (document.getElementById('rec-tras-fondo-real')||{value:''}).value;
  var difEl    = document.getElementById('rec-tras-dif');
  var difBlock = document.getElementById('rec-tras-dif-block');
  if(realRaw === '' || isNaN(parseFloat(realRaw))){
    if(difEl){ difEl.textContent = '—'; difEl.style.color = 'var(--text3)'; }
    if(difBlock) difBlock.style.display = 'none';
    return;
  }
  var dif = (parseFloat(realRaw)||0) - esperado;
  var cuadrado = Math.abs(dif) < 0.01;
  if(difEl){
    difEl.textContent = cuadrado ? '✓ Fondo cuadrado' : '⚠ Diferencia fondo: ' + (dif >= 0 ? '+' : '') + dif.toFixed(2) + '€';
    difEl.style.color = cuadrado ? 'var(--green)' : 'var(--red)';
  }
  if(difBlock) difBlock.style.display = cuadrado ? 'none' : 'block';
}

// ── TRASPASO: guardar ───────────────────────────────────────────────────
async function submitRecTraspaso() {
  var errs = [];
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value); }

  var turno    = _recTipoTurno || getRecTurnoValue() || '';
  var fondoRec = gv('rec-tras-fondo-recibido') || 0;
  var ventas   = gv('rec-tras-ventas-mews');
  var cashReal = gv('rec-tras-cash-real');
  var fondoReal= gv('rec-tras-fondo-real');
  var cf       = _recTrasCF === 'si' ? gv('rec-tras-cf-importe') : 0;

  if(!turno)              errs.push('Selecciona turno');
  if(isNaN(ventas) || ventas < 0)  errs.push('Ventas en efectivo según MEWS obligatorio (0 si no hubo)');
  if(isNaN(cashReal))     errs.push('Cash real contado obligatorio');
  if(_recTrasCF !== 'si' && _recTrasCF !== 'no') errs.push('Indica si hay retiro para caja fuerte');
  if(_recTrasCF === 'si' && (isNaN(cf) || cf <= 0)) errs.push('Importe del retiro a caja fuerte obligatorio');
  if(isNaN(fondoReal))    errs.push('Fondo real a traspasar obligatorio');

  var esperado = fondoRec + (ventas||0) - (cf||0);
  var dif      = (fondoReal||0) - esperado;
  var exp      = (document.getElementById('rec-tras-dif-exp')||{value:''}).value.trim();
  if(!isNaN(fondoReal) && Math.abs(dif) > 0.01 && !exp)
    errs.push('Fondo no cuadrado: explicación obligatoria');

  var errEl = document.getElementById('rec-tras-err');
  if(errs.length > 0){
    if(errEl) errEl.textContent = errs.join(' · ');
    toast(errs[0], 'err');
    return;
  }
  if(errEl) errEl.textContent = '';

  // Una operación por turno y día (creación · admin exento)
  if(!_recTraspasoEditId && currentUser.rol !== 'admin'){
    var dup = await getRecOpToday(turno);
    if(dup){
      var msgD = 'El turno '+turno+' ya registró '+(dup.tipo === 'traspaso' ? 'un traspaso' : 'un cierre')+' hoy. Solo una operación por turno.';
      if(errEl) errEl.textContent = msgD;
      toast(msgD, 'err');
      return;
    }
  }

  var ts    = localTs();
  var fecha = document.getElementById('t-fecha') && document.getElementById('t-fecha').value
            ? document.getElementById('t-fecha').value : today();

  var record = {
    id:                      _recTraspasoEditId || genId(),
    shift_id:                window._lastSavedShiftId || null,
    fecha:                   fecha,
    turno:                   turno,
    tipo:                    'traspaso',
    estado:                  'cerrado',
    responsable_id:          currentUser.id,
    responsable_nombre:      currentUser.nombre,
    usuario_id:              currentUser.id,
    usuario_nombre:          currentUser.nombre,
    // Fondos — cadena: el siguiente turno recibe el fondo real entregado
    fondo_recibido:          fondoRec,
    fondo_traspasado:        fondoReal,
    fondo_real_a_traspasar:  fondoReal,
    fondo_inicial_siguiente: fondoReal,
    retiro_caja_fuerte:      cf || 0,
    // Efectivo del turno (reutiliza columnas existentes — sin cambio de esquema)
    cash_mews:               ventas,
    cash_real:               cashReal,
    tarjeta_mews:            0,
    stripe_mews:             0,
    transferencia_mews:      0,
    tpv_real:                0,
    stripe_real:             0,
    transferencia_banco:     0,
    // Diferencias — solo aplica el descuadre de fondo
    dif_cash:                dif,
    dif_tarjeta:             0,
    dif_stripe:              0,
    dif_transferencia:       0,
    dif_total:               dif,
    dif_fondo_traspaso:      dif,
    explicacion_diferencia:  exp || null,
    accion_diferencia:       (document.getElementById('rec-tras-dif-accion')||{value:''}).value.trim() || null,
    updated_at:              ts
  };
  if(!_recTraspasoEditId) record.created_at = ts;

  try {
    if(_recTraspasoEditId){
      await dbUpdate(REC_TABLE, _recTraspasoEditId, record);
      await auditLog('REC_TRASPASO_EDIT', currentUser.nombre+' editó traspaso caja recepción '+fecha+' turno '+turno+' · fondo '+(fondoReal||0).toFixed(2)+'€');
      toast('Traspaso actualizado', 'ok');
    } else {
      await dbInsert(REC_TABLE, record);
      await auditLog('REC_TRASPASO_SAVE', currentUser.nombre+' traspasó caja recepción '+fecha+' turno '+turno+' · fondo '+(fondoReal||0).toFixed(2)+'€');
      toast('Traspaso de caja guardado', 'ok');
      if(typeof autoLogoutAfterCaja === 'function') autoLogoutAfterCaja();
    }
    invalidateCache(REC_TABLE);
    closeRecTraspasoModal();
    renderRecepcionCajaList();
  } catch(e){
    if(errEl) errEl.textContent = 'Error al guardar: '+e.message;
    toast('Error al guardar traspaso', 'err');
  }
}


// ═══════════════════════════════════════════════════════════════════════
// CAJA-V2 · CARGOS SYNCROLAB PENDIENTES (conciliación en cierre Recepción)
// Recepción ve los cargos que SYNCROLAB pidió cargar a habitación y confirma
// si los cargó en MEWS (cargado) o no (no_cargado).
// ═══════════════════════════════════════════════════════════════════════
async function renderRecLabCharges() {
  var block = document.getElementById('rec-lab-charges-block');
  var list  = document.getElementById('rec-lab-charges-list');
  if(!block || !list) return;
  var rows = [];
  try { rows = await getDB('syncrolab_room_charges'); } catch(e){ rows = []; }
  var pend = rows.filter(function(r){ return r.estado === 'pendiente'; })
                 .sort(function(a,b){ return (a.fecha||'').localeCompare(b.fecha||''); });
  if(!pend.length){ block.style.display = 'none'; return; }
  block.style.display = 'block';
  list.innerHTML = pend.map(function(c){
    var sysBadge = c.sistema === 'VirtuGym'
      ? '<span class="badge" style="background:rgba(16,185,129,.15);color:#10b981;border:1px solid #10b981;">VirtuGym</span>'
      : '<span class="badge" style="background:rgba(99,102,241,.15);color:#6366f1;border:1px solid #6366f1;">Nubimed</span>';
    return '<div style="padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">'
      + '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">'
        + '<div style="font-size:13px;"><b>Hab. '+(c.habitacion||'—')+'</b> · '+(c.huesped_nombre||'—')+' '+sysBadge+'</div>'
        + '<div style="font-family:var(--font-mono);font-weight:700;color:var(--text);">'+(parseFloat(c.importe)||0).toFixed(2)+' €</div>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">'+(c.concepto||'')+' <span style="color:var(--text3);">· '+fmtDate(c.fecha)+' · pidió '+(c.solicitado_por_nombre||'')+'</span></div>'
      + '<div style="display:flex;gap:6px;">'
        + '<button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="confirmarCargoLab(\''+c.id+'\',\'cargado\')">✓ Cargado en MEWS</button>'
        + '<button class="btn btn-sm btn-warn" onclick="confirmarCargoLab(\''+c.id+'\',\'no_cargado\')">✗ No cargado</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

async function confirmarCargoLab(id, nuevoEstado) {
  if(nuevoEstado === 'no_cargado'){
    var motivo = prompt('Motivo de no cargar (queda registrado):');
    if(motivo === null) return;
    var coment = motivo || null;
  }
  try {
    await fetch(SUPABASE_URL + '/rest/v1/syncrolab_room_charges?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        estado: nuevoEstado,
        cargado_por: currentUser.nombre,
        cargado_ts: localTs(),
        comentario_recepcion: (typeof coment !== 'undefined') ? coment : null,
        updated_at: localTs()
      })
    });
    invalidateCache('syncrolab_room_charges');
    if(typeof auditLog === 'function') auditLog('LAB_CARGO_' + (nuevoEstado === 'cargado' ? 'CARGADO' : 'NO_CARGADO'), currentUser.nombre + ' marcó cargo SYNCROLAB ' + id + ' como ' + nuevoEstado);
    toast(nuevoEstado === 'cargado' ? 'Cargo confirmado en MEWS' : 'Cargo marcado como no cargado', 'ok');
    renderRecLabCharges();
  } catch(e){ toast('Error al actualizar cargo', 'err'); }
}
