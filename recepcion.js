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
    reservas_pendientes: 'kpi-reserv-pend-exp-block',
    upsell_desayuno:     'kpi-upsell-detail',
    comms_pendientes:    'kpi-comms-pend-exp-block',
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
  ['kpi-reserv-pend-exp-block','kpi-upsell-detail','kpi-comms-pend-exp-block','kpi-clientes-detail','syncro-ventas-container','kpi-lead-block'].forEach(function(id){
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
  if(!_recKpiState.reservas_pendientes) errs.push('Indica si quedan reservas pendientes');
  if(!_recKpiState.upsell_desayuno)     errs.push('Indica si ofertaste desayunos');
  if(!_recKpiState.comms_revisadas)     errs.push('Indica si revisaste comunicaciones');
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
  _recKpiState.comms_no_exp = (document.getElementById('kpi-comms-no-exp')||{}).value||'';
  _recKpiState.clientes_num = parseInt((document.getElementById('kpi-clientes-num')||{}).value)||0;

  closeRecKpiModal();
  // BUG-01 FIX: guardar turno PRIMERO, luego abrir caja
  _doSaveTurno().then(function() {
    openRecCajaModal();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// calcRecDifs — definida en index.html (versión única y correcta)

// ═══════════════════════════════════════════════════════════════════════
// CAJA RECEPCIÓN — Abrir modal
// ═══════════════════════════════════════════════════════════════════════
function openRecCajaModal(existingId) {
  _recCajaEditId = existingId || null;

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

  var turno = getRecTurnoValue() || '—';
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
  var turno     = getRecTurnoValue();

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

  var ts    = new Date().toISOString();
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
    el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin cierres de caja en este periodo</div></div>';
    return;
  }

  var isAdminU   = currentUser && currentUser.rol === 'admin';
  var isJefeRec  = currentUser && currentUser.rol === 'jefe_recepcion';
  var canReopen  = isAdminU || isJefeRec;

  var html = '<div style="overflow-x:auto"><table>'
    + '<tr><th>Fecha</th><th>Turno</th><th>Recepcionista</th>'
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

    var acciones = '<button class="btn btn-secondary btn-sm" onclick="openRecCajaModal(\''+r.id+'\')">Ver</button>';
    if(canReopen && estado !== 'reabierto')
      acciones += ' <button class="btn btn-secondary btn-sm" onclick="reabrirCajaRec(\''+r.id+'\')">Reabrir</button>';
    if(isAdminU)
      acciones += ' <button class="btn btn-danger btn-sm" onclick="eliminarCajaRec(\''+r.id+'\')">Eliminar</button>';

    function dCell(val){ return '<td style="font-family:var(--font-mono);color:'+(Math.abs(val||0)<0.01?'var(--green)':'var(--red)')+'">'+((val||0)>=0?'+':'')+(parseFloat(val||0)).toFixed(2)+'€</td>'; }

    html += '<tr>'
      + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(r.fecha) + '</td>'
      + '<td>' + bTurno(r.turno) + '</td>'
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
      updated_at: new Date().toISOString()
    });
    await auditLog('REC_CAJA_REABRIR', 'Caja '+cajaId+' reabierta por '+currentUser.nombre+' — '+motivo.trim());
    invalidateCache(REC_TABLE);
    toast('Caja reabierta', 'ok');
    renderRecepcionCajaList();
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
      updated_at: new Date().toISOString()
    });
    await auditLog('REOPEN_SHIFT', currentUser.nombre+' reabrió turno '+shiftId+' — '+motivo.trim());
    invalidateCache('shifts');
    toast('Turno reabierto — vuelve a estado En corrección','ok');
    renderValidacion();
  } catch(e){ toast('Error: '+e.message,'err'); }
}

// ═══════════════════════════════════════════════════════════════════════
// FOLLOW-UP / INCIDENCIAS
// ═══════════════════════════════════════════════════════════════════════
var _fuCloseId = null;

async function renderFollowupList() {
  if(!currentUser) return;
  var el        = document.getElementById('followup-incidencias-list');
  var countEl   = document.getElementById('followup-count');
  var btnNew    = document.getElementById('btn-new-followup');
  var subtitleEl= document.getElementById('followup-subtitle');
  if(!el) return;

  var isSupervisorUser = isAdmin(currentUser) || isSupervisor(currentUser);
  var isAdminUser      = isAdmin(currentUser);
  var dept             = currentUser ? (currentUser.area || '') : '';

  if(btnNew)     btnNew.style.display    = isSupervisorUser ? '' : 'none';
  if(subtitleEl) subtitleEl.textContent  = isSupervisorUser
    ? 'Gestiones pendientes, tareas e incidencias operativas del departamento.'
    : 'Gestiones pendientes y tareas visibles para tu departamento.';

  var allIncis = [], allTareas = [], allShifts = [], allGestiones = [];
  try { allIncis     = await getDB('incidencias'); } catch(e){}
  try { allTareas    = await getDB('tareas');      } catch(e){}
  try { allShifts    = await getDB('shifts');      } catch(e){}
  try { allGestiones = await getDB('gestiones');   } catch(e){}

  var shiftMap = {};
  allShifts.forEach(function(s){ if(s.id) shiftMap[s.id] = s; });

  function sameDept(record){
    if(isAdminUser) return true;
    var rDept = getRecordDepartment(record, shiftMap);
    if(isSupervisorUser) return canViewDepartment(currentUser, rDept);
    return normalizeDeptName(rDept) === normalizeDeptName(dept)
      || record.employee_id === currentUser.id
      || record.creado_por  === currentUser.nombre;
  }
  function isGestion(t){
    var txt = normalizeDeptName([t.origen, t.titulo, t.descripcion].join(' '));
    return txt.indexOf('gestion') !== -1 || txt.indexOf('gestión') !== -1;
  }

  // ── GESTIONES: todos del mismo dpto pueden ver + gestionar + cerrar ──
  var gestiones = allGestiones.filter(function(g){
    if(isAdmin(currentUser) || isSupervisorUser) return sameDept(g);
    // Empleado: todas las gestiones de su departamento (no solo las propias)
    return normalizeDeptName(g.departamento||g.area||'') === normalizeDeptName(dept)
      && g.estado !== 'Cerrada';
  }).filter(function(g){ return g.estado !== 'Cerrada'; });

  // ── TAREAS: empleados del dpto destino + empleado que la creó + admin ──
  var tareas = allTareas.filter(function(t){
    if(!isTaskOpen(t)) return false;
    if(isAdmin(currentUser) || isSupervisorUser) return sameDept(t);
    // Empleado: dpto destino O quien la creó
    var esDeptDestino = normalizeDeptName(t.dept_destino||'') === normalizeDeptName(dept);
    var esCreador = t.creado_por === currentUser.nombre || t.employee_id === currentUser.id;
    return esDeptDestino || esCreador;
  });

  // ── INCIDENCIAS: empleado ve solo las suyas y solo hasta que se cierren ──
  var incidencias;
  if(isAdmin(currentUser) || isSupervisorUser){
    incidencias = allIncis.filter(function(i){
      return isIncidentOpen(i) && sameDept(i);
    });
  } else {
    // Empleado: solo las suyas propias, y solo si no están cerradas
    incidencias = allIncis.filter(function(i){
      var esSuya = i.employee_id === currentUser.id || i.nombre === currentUser.nombre;
      var abierta = normalizeIncidentState(i.estado) === INCIDENT_STATES.ABIERTA
                 || normalizeIncidentState(i.estado) === INCIDENT_STATES.EN_PROCESO;
      return esSuya && abierta;
    });
  }

  var total = gestiones.length + tareas.length + incidencias.length;
  if(countEl) countEl.textContent = total ? '('+total+' activas)' : '(sin activas)';

  if(!total){
    el.innerHTML = '<div class="empty"><div class="empty-text">Sin gestiones, tareas ni incidencias activas</div></div>';
    return;
  }

  function buildTaskRows(list){
    if(!list.length) return '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguna</div>';
    return '<table><tr><th>Deadline</th><th>Estado</th><th>Descripción</th><th>Destino</th><th>Creado por</th><th>Acciones</th></tr>'
      + list.map(function(row){
        var acciones = '';
        var st = normalizeTaskState(row.estado);
        var esDeptDestino = normalizeDeptName(row.dept_destino||'') === normalizeDeptName(dept);
        var puedeAvanzar = isAdmin(currentUser) || isSupervisorUser || esDeptDestino;
        // Empleado origen: solo ve (no puede avanzar ni cerrar)
        if(puedeAvanzar && st === TASK_STATES.ABIERTA)
          acciones += '<button class="btn btn-secondary btn-sm" onclick="advanceTask(\''+row.id+'\',\'En proceso\')">▶ En proceso</button> ';
        if((isAdmin(currentUser) || isSupervisorUser || (esDeptDestino && st === TASK_STATES.EN_PROCESO)) && st === TASK_STATES.EN_PROCESO)
          acciones += '<button class="btn btn-secondary btn-sm" onclick="advanceTask(\''+row.id+'\',\'Cerrada\')">✓ Cerrar</button>';
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px;'+(isOverdue(row.deadline)?'color:var(--red);font-weight:700':'')+'">'
          + fmtDate(row.deadline) + (isOverdue(row.deadline)?' ⚠':'') + '</td>'
          + '<td>'+bTaskEstado(row.estado)+'</td>'
          + '<td style="font-size:12px;max-width:220px;">'+formatDisplayValue(row.descripcion||row.titulo)+'</td>'
          + '<td>'+deptBadge(row.dept_destino)+'</td>'
          + '<td style="font-size:12px;">'+formatDisplayValue(row.creado_por)+'</td>'
          + '<td>'+(acciones||'—')+'</td>'
          + '</tr>';
      }).join('') + '</table>';
  }

  function buildIncidentRows(list){
    if(!list.length) return '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguna</div>';
    return '<table><tr><th>Tipo</th><th>Descripción</th><th>Empleado</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr>'
      + list.map(function(i){
        // Empleado: solo lectura (ve la incidencia hasta que se cierra, sin botones)
        // Jefe/Admin: pueden gestionar y cerrar
        var canManage = isAdminUser || (isSupervisorUser && canViewDepartment(currentUser, getRecordDepartment(i, shiftMap)));
        var normI     = normalizeIncidentState(i.estado);
        var acciones  = canManage
          ? (normI === INCIDENT_STATES.ABIERTA
              ? '<button class="btn btn-secondary btn-sm" onclick="advanceIncident(\''+i.id+'\',\'En proceso\')">▶ En proceso</button> '
              : '')
            + '<button class="btn btn-secondary btn-sm" onclick="openCloseFollowup(\''+i.id+'\')">✓ Cerrar</button>'
          : '👁 Solo lectura';
        return '<tr>'
          + '<td style="font-size:12px;">'+formatDisplayValue(i.tipo_incidencia||i.categoria)+'</td>'
          + '<td style="font-size:12px;max-width:200px;">'+formatDisplayValue(i.descripcion).slice(0,70)+(i.descripcion&&i.descripcion.length>70?'...':'')+'</td>'
          + '<td style="font-size:12px;">'+formatDisplayValue(i.nombre)+'</td>'
          + '<td style="font-size:11px;color:var(--text3);">'+(i.created_at?new Date(i.created_at).toLocaleDateString('es-ES'):'—')+'</td>'
          + '<td>'+bIncidentEstado(i.estado)+'</td>'
          + '<td>'+acciones+'</td>'
          + '</tr>';
      }).join('') + '</table>';
  }

    function buildGestionRows(list){
    if(!list.length) return '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguna</div>';
    return '<table><tr><th>Tipo</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>'
      + list.map(function(g){
        var gState = g.estado || 'Abierta';
        // Todos del mismo dpto pueden gestionar + cerrar
        var canAct = isAdmin(currentUser) || isSupervisorUser
          || normalizeDeptName(g.departamento||g.area||'') === normalizeDeptName(dept);
        var acciones = '';
        if(canAct){
          if(gState === 'Abierta')
            acciones = '<button class="btn btn-secondary btn-sm" onclick="advanceGestion(\''+g.id+'\',\'En proceso\')">▶ En proceso</button>';
          else if(gState === 'En proceso')
            acciones = '<button class="btn btn-secondary btn-sm" onclick="openCloseGestion(\''+g.id+'\')">✓ Cerrar</button>';
        }
        return '<tr>'
          + '<td style="font-size:12px;">'+formatDisplayValue(g.tipo_gestion)+'</td>'
          + '<td style="font-size:12px;max-width:220px;">'+formatDisplayValue(g.descripcion)+'</td>'
          + '<td>'+bGestionEstado(gState)+'</td>'
          + '<td>'+(acciones||'—')+'</td>'
          + '</tr>';
      }).join('') + '</table>';
  }

  var html = '<div style="margin-bottom:10px;">'
    + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.12em;margin-bottom:6px;">GESTIONES PENDIENTES ('+gestiones.length+')</div>'
    + buildGestionRows(gestiones)
    + '</div>';

  html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">'
    + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--purple);letter-spacing:.12em;margin-bottom:6px;">TAREAS ('+tareas.length+')</div>'
    + buildTaskRows(tareas)
    + '</div>';

  if(isSupervisorUser){
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">'
      + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--red);letter-spacing:.12em;margin-bottom:6px;">INCIDENCIAS OPERATIVAS ('+incidencias.length+') — Solo supervisores</div>'
      + buildIncidentRows(incidencias)
      + '</div>';
  }

  el.innerHTML = html;
}

// ── Gestiones en Mi Turno (BUG-39) ──────────────────────────
async function advanceGestion(gid, newState){
  await dbUpdate('gestiones', gid, {estado: newState, updated_at: localTs()});
  invalidateCache('gestiones');
  auditLog('GESTION_ADVANCE', currentUser.nombre+' → '+newState+': gestión '+gid);
  toast('Estado actualizado', 'ok');
  if(typeof renderFollowupList === 'function') renderFollowupList();
}

async function openCloseGestion(gid){
  var txt = prompt('Acción tomada para cerrar esta gestión (obligatorio):');
  if(txt === null) return;
  if(!txt.trim()){ toast('Acción obligatoria', 'err'); return; }
  var gg = await getDB('gestiones');
  var g = gg.find(function(x){ return x.id === gid; });
  if(!g){ toast('Gestión no encontrada', 'err'); return; }
  var tgMins = Math.round((Date.now() - new Date(g.created_at).getTime()) / 60000);
  var ts = localTs();
  await dbUpdate('gestiones', gid, {
    estado: 'Cerrada',
    accion_tomada: txt.trim(),
    cerrado_por: currentUser.nombre,
    cerrado_ts: ts,
    tiempo_gestion: tgMins,
    updated_at: ts
  });
  invalidateCache('gestiones');
  auditLog('GESTION_CERRADA', 'id: '+gid+' | tiempo: '+tgMins+' min | accion: '+txt.trim());
  toast('Gestión cerrada', 'ok');
  if(typeof renderFollowupList === 'function') renderFollowupList();
}

async function openNewFollowup() {
  ['fu-tipo','fu-desc','fu-mews-id','fu-objetivo','fu-responsable'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  var errEl = document.getElementById('fu-err');
  if(errEl) errEl.textContent = '';

  var empSel = document.getElementById('fu-responsable');
  if(empSel){
    empSel.innerHTML = '<option value="">— Sin asignar —</option>';
    try {
      var emps = await getDB('employees');
      emps.filter(function(e){ return e.estado==='Activo'; }).forEach(function(e){
        var o = document.createElement('option');
        o.value = e.id; o.textContent = e.nombre+' — '+e.puesto;
        o.style.background = '#ffffff'; o.style.color = '#111827';
        empSel.appendChild(o);
      });
    } catch(e){}
  }
  var m = document.getElementById('modal-followup');
  if(m) m.style.display = 'flex';
}

function closeFollowupModal() {
  var m = document.getElementById('modal-followup');
  if(m) m.style.display = 'none';
}

async function saveFollowup() {
  var tipo  = (document.getElementById('fu-tipo')||{value:''}).value;
  var desc  = ((document.getElementById('fu-desc')||{value:''}).value).trim();
  var errEl = document.getElementById('fu-err');
  if(!tipo){ if(errEl) errEl.textContent='Selecciona un tipo'; return; }
  if(!desc){ if(errEl) errEl.textContent='La descripción es obligatoria'; return; }
  if(errEl) errEl.textContent = '';

  // BUG-27 FIX: si no hay shift_id en memoria, buscar turno del empleado de hoy
  var resolvedShiftId = window._lastSavedShiftId || null;
  if(!resolvedShiftId && currentUser){
    try {
      var allShiftsToday = await getDB('shifts');
      var todayStr = today();
      var myShift = allShiftsToday.find(function(s){
        return s.employee_id === currentUser.id && s.fecha === todayStr;
      });
      if(myShift) resolvedShiftId = myShift.id;
    } catch(e){}
  }

  var ts = new Date().toISOString();
  var record = {
    id: genId(),
    shift_id: resolvedShiftId,
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    departamento: currentUser.area || '—',
    fecha: today(),
    servicio: getRecTurnoValue() || getServicioValue() || '—',
    categoria: 'Gestión pendiente',
    tipo_incidencia: tipo,
    descripcion: desc,
    accion_inmediata: '',
    requiere_formacion: 'no',
    requiere_disciplina: 'no',
    estado: INCIDENT_STATES.ABIERTA,
    severidad: 'Media',
    informado_responsable: 'no',
    staff_implicado_ids: '[]',
    staff_implicado_nombres: '[]',
    created_at: ts
  };

  try {
    var saved = await dbInsert('incidencias', record);
    if(!saved){ if(errEl) errEl.textContent='No se pudo guardar. Inténtalo de nuevo.'; return; }
    invalidateCache('incidencias');
    toast('Gestión pendiente registrada','ok');
    closeFollowupModal();
    renderFollowupList();
  } catch(e){
    if(errEl) errEl.textContent = 'Error: '+(e.message||JSON.stringify(e));
  }
}

function openCloseFollowup(id) {
  _fuCloseId = id;
  ['fu-close-accion','fu-close-resultado','fu-close-comentario'].forEach(function(id2){
    var e = document.getElementById(id2); if(e) e.value = '';
  });
  var errEl = document.getElementById('fu-close-err');
  if(errEl) errEl.textContent = '';
  var m = document.getElementById('modal-followup-close');
  if(m) m.style.display = 'flex';
}

async function submitCloseFollowup() {
  var accion    = ((document.getElementById('fu-close-accion')||{value:''}).value).trim();
  var resultado = ((document.getElementById('fu-close-resultado')||{value:''}).value).trim();
  var errEl     = document.getElementById('fu-close-err');

  if(!accion){    if(errEl) errEl.textContent='La acción realizada es obligatoria'; return; }
  if(!resultado){ if(errEl) errEl.textContent='El resultado es obligatorio'; return; }

  var ts = new Date().toISOString();
  try {
    var allIncis = await getDB('incidencias');
    var inci = allIncis.find(function(i){ return i.id === _fuCloseId; });
    if(!inci){ if(errEl) errEl.textContent='No se encontró la incidencia.'; return; }

    var allShifts = await getDB('shifts');
    var shiftMap  = {};
    allShifts.forEach(function(s){ if(s.id) shiftMap[s.id] = s; });

    if(!(isAdmin(currentUser) || (isSupervisor(currentUser) && canViewDepartment(currentUser, getRecordDepartment(inci, shiftMap))))){
      if(errEl) errEl.textContent = 'No tienes permiso para cerrar incidencias de este departamento.';
      return;
    }

    var comentarioCierre = ((document.getElementById('fu-close-comentario')||{value:''}).value).trim();
    if((inci.severidad==='Alta'||inci.severidad==='Crítica') && !comentarioCierre){
      if(errEl) errEl.textContent = 'El comentario de cierre es obligatorio para incidencias de alta severidad.';
      return;
    }

    // BUG-09 FIX: calcular tiempo de gestión en minutos
    var tiempoMs  = inci.created_at ? (new Date(ts) - new Date(inci.created_at)) : 0;
    var tiempoMin = Math.round(tiempoMs / 60000);

    var cierreTxt = accion + (resultado ? ' · Resultado: '+resultado : '') + (comentarioCierre ? ' · Nota: '+comentarioCierre : '');

    var saved = await dbUpdate('incidencias', _fuCloseId, {
      estado:          INCIDENT_STATES.CERRADA,
      accion_tomada:   cierreTxt,
      accion_inmediata:[inci.accion_inmediata, cierreTxt].filter(Boolean).join(' | '),
      cerrado_ts:      ts,
      cerrado_por:     currentUser.nombre,
      tiempo_gestion:  tiempoMin
    });
    if(!saved){ if(errEl) errEl.textContent='No se pudo cerrar la incidencia. Inténtalo de nuevo.'; return; }

    invalidateCache('incidencias');
    toast('Incidencia cerrada — '+fmtTiempoGestion(tiempoMin),'ok');
    var m = document.getElementById('modal-followup-close');
    if(m) m.style.display = 'none';
    renderFollowupList();
  } catch(e){
    if(errEl) errEl.textContent = 'No se pudo cerrar la incidencia. Inténtalo de nuevo.';
  }
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
    + '<div class="fg"><label>Importe (€) <span class="req">*</span></label><input type="number" id="sv-importe-'+idx+'" min="0" step="0.01" placeholder="0.00" style="color:#111827;background:#ffffff;"></div>'
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

function bGestionEstado(st){
  if(!st||st==='Abierta') return '<span class="badge b-red">Abierta</span>';
  if(st==='En proceso') return '<span class="badge b-yellow">En proceso</span>';
  if(st==='Cerrada') return '<span class="badge b-green">Cerrada</span>';
  return '<span class="badge b-gray">'+st+'</span>';
}