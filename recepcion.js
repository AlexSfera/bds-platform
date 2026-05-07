// ═══════════════════════════════════════════════════
// RECEPCIÓN — Funciones específicas
// Depende de: shared.js (debe cargarse antes)
// ═══════════════════════════════════════════════════
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
// ═══════════════════════════════════════════════════════════════════════════
// RECEPCIÓN CAJA — Funciones completas
// ═══════════════════════════════════════════════════════════════════════════

var _recKpiState = {};
var _recCajaEditId = null;

function setRecKpi(key, val, btn) {
  _recKpiState[key] = val;
  // Visual: deselect siblings, select this
  if(btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.tbtn').forEach(function(b){ b.classList.remove('t-si','t-no','t-na'); });
    if(val==='si') btn.classList.add('t-si');
    else if(val==='no') btn.classList.add('t-no');
    else btn.classList.add('t-na');
  }
  // Show/hide dependent blocks
  if(key==='reservas_pendientes'){
    var bl=document.getElementById('kpi-reserv-pend-exp-block');
    if(bl) bl.style.display=val==='si'?'block':'none';
  }
  if(key==='upsell_desayuno'){
    var bl2=document.getElementById('kpi-upsell-detail');
    if(bl2) bl2.style.display=val==='si'?'grid':'none';
  }
  if(key==='comms_pendientes'){
    var bl3=document.getElementById('kpi-comms-pend-exp-block');
    if(bl3) bl3.style.display=val==='si'?'block':'none';
  }
  if(key==='clientes_insatisfechos'){
    var bl4=document.getElementById('kpi-clientes-detail');
    if(bl4) bl4.style.display=val==='si'?'grid':'none';
  }
  if(key==='dif_informado'){
    // handled inline
  }
}

function openRecKpiModal() {
  _recKpiState = {};
  // Reset all toggles
  document.querySelectorAll('#modal-rec-kpi .tbtn').forEach(function(b){ b.classList.remove('t-si','t-no','t-na'); });
  ['kpi-reserv-pend-exp-block','kpi-upsell-detail','kpi-comms-pend-exp-block','kpi-clientes-detail'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.style.display='none';
  });
  // Clear number inputs
  ['kpi-checkins','kpi-checkouts','kpi-reservas','kpi-desal-ofertados','kpi-desal-vendidos','kpi-clientes-num','kpi-tareas-creadas','kpi-tareas-cerradas'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('kpi-err').textContent='';
  var m=document.getElementById('modal-rec-kpi');
  if(m){ m.style.display='flex'; }
}

function closeRecKpiModal() {
  var m=document.getElementById('modal-rec-kpi');
  if(m) m.style.display='none';
}

function submitRecKpi() {
  var errs=[];
  var checkins=parseInt(document.getElementById('kpi-checkins').value)||0;
  var checkouts=parseInt(document.getElementById('kpi-checkouts').value)||0;
  var reservas=parseInt(document.getElementById('kpi-reservas').value)||0;
  if(!_recKpiState.reservas_pendientes) errs.push('Indica si quedan reservas pendientes');
  if(!_recKpiState.upsell_desayuno) errs.push('Indica si ofertaste desayunos');
  if(!_recKpiState.comms_revisadas) errs.push('Indica si revisaste comunicaciones');
  if(!_recKpiState.clientes_insatisfechos) errs.push('Indica si hubo clientes insatisfechos');
  if(errs.length>0){ document.getElementById('kpi-err').textContent=errs.join(' · '); return; }
  document.getElementById('kpi-err').textContent='';
  // Save KPI state for use in caja
  _recKpiState.checkins=checkins;
  _recKpiState.checkouts=checkouts;
  _recKpiState.reservas=reservas;
  _recKpiState.tareas_creadas=parseInt(document.getElementById('kpi-tareas-creadas').value)||0;
  _recKpiState.tareas_cerradas=parseInt(document.getElementById('kpi-tareas-cerradas').value)||0;
  closeRecKpiModal();
  openRecCajaModal();
}

function calcRecDifs() {
  var mewsCash=parseFloat(document.getElementById('rec-cash-mews').value)||0;
  var mewsTar=parseFloat(document.getElementById('rec-tarjeta-mews').value)||0;
  var mewsStr=parseFloat(document.getElementById('rec-stripe-mews').value)||0;
  var realCash=parseFloat(document.getElementById('rec-cash-real').value)||0;
  var realTpv=parseFloat(document.getElementById('rec-tpv-real').value)||0;
  var realStr=parseFloat(document.getElementById('rec-stripe-real').value)||0;

  var difCash=realCash-mewsCash;
  var difTar=realTpv-mewsTar;
  var difStr=realStr-mewsStr;
  var difTotal=difCash+difTar+difStr;

  function colorDif(val){
    var el_color=val===0?'var(--green)':val>0?'var(--blue)':'var(--red)';
    return {text:(val>=0?'+':'')+val.toFixed(2)+' €',color:el_color};
  }
  var dc=colorDif(difCash), dt=colorDif(difTar), ds=colorDif(difStr), dtt=colorDif(difTotal);
  var setCss=function(id,obj){var el=document.getElementById(id);if(el){el.textContent=obj.text;el.style.color=obj.color;}};
  setCss('rec-dif-cash',dc); setCss('rec-dif-tarjeta',dt); setCss('rec-dif-stripe',ds); setCss('rec-dif-total',dtt);

  var hasError=Math.abs(difTotal)>0.01;
  var alertEl=document.getElementById('rec-dif-alert');
  var expBlock=document.getElementById('rec-dif-exp-block');
  if(alertEl) alertEl.style.display=hasError?'block':'none';
  if(expBlock) expBlock.style.display=hasError?'block':'none';

  // Noche: show fondo inicial
  var turno=getRecTurnoValue();
  var fondoIni=document.getElementById('rec-fondo-inicial-block');
  if(fondoIni) fondoIni.style.display=turno==='Noche'?'block':'none';
}

function openRecCajaModal(existingId) {
  _recCajaEditId = existingId||null;
  // Reset form
  ['rec-cash-mews','rec-tarjeta-mews','rec-stripe-mews','rec-cash-real','rec-tpv-real','rec-stripe-real','rec-fondo-recibido','rec-fondo-traspaso','rec-fondo-inicial','rec-dif-exp','rec-dif-accion'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var turno=getRecTurnoValue()||'—';
  var label=document.getElementById('rec-caja-turno-label');
  if(label) label.textContent=turno;
  // Show/hide fondo inicial (only Noche)
  var fondoIni=document.getElementById('rec-fondo-inicial-block');
  if(fondoIni) fondoIni.style.display=turno==='Noche'?'block':'none';
  document.getElementById('rec-dif-alert').style.display='none';
  document.getElementById('rec-dif-exp-block').style.display='none';
  document.getElementById('rec-caja-err').textContent='';
  // Load existing if editing
  if(existingId){
    getDB('cash_closings').then(function(rows){
      var row=rows.find(function(r){return r.id===existingId;});
      if(!row) return;
      var set=function(id,val){var el=document.getElementById(id);if(el&&val!=null)el.value=val;};
      set('rec-fondo-recibido',row.rec_fondo_recibido);
      set('rec-cash-mews',row.rec_cash_mews);
      set('rec-tarjeta-mews',row.rec_tarjeta_mews);
      set('rec-stripe-mews',row.rec_stripe_mews);
      set('rec-cash-real',row.efectivo_real);
      set('rec-tpv-real',row.tarjeta_real);
      set('rec-stripe-real',row.stripe_real);
      set('rec-fondo-traspaso',row.rec_fondo_traspaso);
      set('rec-fondo-inicial',row.rec_fondo_inicial_dia);
      set('rec-dif-exp',row.diferencia_explicacion);
      set('rec-dif-accion',row.accion_tomada);
      calcRecDifs();
    });
  }
  var m=document.getElementById('modal-rec-caja');
  if(m){ m.style.display='flex'; }
}

function closeRecCajaModal() {
  var m=document.getElementById('modal-rec-caja');
  if(m) m.style.display='none';
}

async function submitRecCaja() {
  var errs=[];
  var mewsCash=parseFloat(document.getElementById('rec-cash-mews').value);
  var mewsTar=parseFloat(document.getElementById('rec-tarjeta-mews').value);
  var mewsStr=parseFloat(document.getElementById('rec-stripe-mews').value);
  var realCash=parseFloat(document.getElementById('rec-cash-real').value);
  var realTpv=parseFloat(document.getElementById('rec-tpv-real').value);
  var realStr=parseFloat(document.getElementById('rec-stripe-real').value);
  var fondoRec=parseFloat(document.getElementById('rec-fondo-recibido').value)||0;
  var fondoTras=parseFloat(document.getElementById('rec-fondo-traspaso').value);
  var turno=getRecTurnoValue();

  if(isNaN(mewsCash)) errs.push('Cash según MEWS obligatorio');
  if(isNaN(mewsTar))  errs.push('Tarjeta según MEWS obligatoria');
  if(isNaN(mewsStr))  errs.push('Stripe según MEWS obligatorio');
  if(isNaN(realCash)) errs.push('Cash real obligatorio');
  if(isNaN(realTpv))  errs.push('TPV real obligatorio');
  if(isNaN(realStr))  errs.push('Stripe real obligatorio');
  if(isNaN(fondoTras)) errs.push('Fondo traspasado obligatorio');

  var difTotal=(realCash-mewsCash)+(realTpv-mewsTar)+(realStr-mewsStr);
  var hasError=Math.abs(difTotal)>0.01;
  if(hasError){
    var exp=document.getElementById('rec-dif-exp').value.trim();
    if(!exp) errs.push('Diferencia detectada: explicación obligatoria');
  }
  if(turno==='Noche'){
    var fondoIni=parseFloat(document.getElementById('rec-fondo-inicial').value);
    if(isNaN(fondoIni)) errs.push('Fondo inicial día siguiente obligatorio (turno noche)');
  }
  if(errs.length>0){
    document.getElementById('rec-caja-err').textContent=errs.join(' · ');
    return;
  }
  document.getElementById('rec-caja-err').textContent='';

  var ts=new Date().toISOString();
  var fecha=document.getElementById('t-fecha')?document.getElementById('t-fecha').value:today();
  var record={
    id: _recCajaEditId||genId(),
    fecha: fecha,
    departamento: 'recepcion',
    turno: turno,
    shift_id: window._lastSavedShiftId||null,
    usuario_id: currentUser.id,
    usuario_nombre: currentUser.nombre,
    estado: 'cerrado',
    fondo_inicial: fondoRec,
    efectivo_real: realCash,
    tarjeta_real: realTpv,
    stripe_real: realStr,
    total_real: realCash+realTpv+realStr,
    total_sistema: mewsCash+mewsTar+mewsStr,
    diferencia_total: difTotal,
    diferencia_explicacion: document.getElementById('rec-dif-exp').value.trim()||null,
    accion_tomada: document.getElementById('rec-dif-accion').value.trim()||null,
    diferencia_informada: _recKpiState.dif_informado==='si',
    rec_cash_mews: mewsCash,
    rec_tarjeta_mews: mewsTar,
    rec_stripe_mews: mewsStr,
    rec_fondo_recibido: fondoRec,
    rec_fondo_traspaso: fondoTras,
    rec_fondo_inicial_dia: turno==='Noche'?(parseFloat(document.getElementById('rec-fondo-inicial').value)||null):null,
    created_at: _recCajaEditId?undefined:ts,
    updated_at: ts
  };

  try {
    if(_recCajaEditId){
      await dbUpdate('cash_closings', _recCajaEditId, record);
      await auditLog('REC_CAJA_EDIT', currentUser.nombre+' editó caja recepción '+fecha+' turno '+turno);
      toast('Caja recepción actualizada','ok');
    } else {
      await dbInsert('cash_closings', record);
      await auditLog('REC_CAJA_SAVE', currentUser.nombre+' cerró caja recepción '+fecha+' turno '+turno);
      toast('Caja recepción guardada','ok');
    }
    invalidateCache('cash_closings');
    closeRecCajaModal();
    renderRecepcionCajaList();
  } catch(e){
    document.getElementById('rec-caja-err').textContent='Error al guardar: '+e.message;
  }
}

async function renderRecepcionCajaList() {
  var el=document.getElementById('rec-caja-list');
  if(!el) return;
  el.innerHTML='<div class="empty"><div class="empty-text">Cargando...</div></div>';
  var periodo=document.getElementById('rec-dash-periodo')?document.getElementById('rec-dash-periodo').value:'hoy';
  var rows=[];
  try { rows=await getDB('cash_closings'); } catch(e){ rows=[]; }
  rows=rows.filter(function(r){return r.departamento==='recepcion';});
  // Filter by period
  var t=today(), sw=startOfWeek(), sm=startOfMonth();
  if(periodo==='hoy') rows=rows.filter(function(r){return r.fecha===t;});
  else if(periodo==='semana') rows=rows.filter(function(r){return r.fecha>=sw;});
  else if(periodo==='mes') rows=rows.filter(function(r){return r.fecha>=sm;});
  rows.sort(function(a,b){return b.fecha.localeCompare(a.fecha)||b.created_at.localeCompare(a.created_at);});
  if(!rows.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin cierres de caja en este periodo</div></div>';
    return;
  }
  var isAdmin=currentUser&&currentUser.rol==='admin';
  var isJefeRec=currentUser&&currentUser.rol==='jefe_recepcion';
  var canReopen=isAdmin||isJefeRec;
  var html='<table><tr><th>Fecha</th><th>Turno</th><th>Recepcionista</th><th>Δ Cash</th><th>Δ TPV</th><th>Δ Stripe</th><th>Δ Total</th><th>Estado</th><th>Acciones</th></tr>';
  rows.forEach(function(r){
    var difColor=Math.abs(r.diferencia_total||0)<0.01?'var(--green)':'var(--red)';
    var difTxt=(r.diferencia_total>=0?'+':'')+parseFloat(r.diferencia_total||0).toFixed(2)+'€';
    var estadoBadge=r.estado==='validado'?'<span class="badge b-green">✓ Validado</span>':r.estado==='reabierto'?'<span class="badge b-orange">↩ Reabierto</span>':'<span class="badge b-red">● '+r.estado+'</span>';
    var acciones='<button class="btn btn-secondary btn-sm" onclick="openRecCajaModal(&quot;'+r.id+'&quot;)">Ver</button>';
    if(canReopen && r.estado!=='reabierto') acciones+=' <button class="btn btn-secondary btn-sm" onclick="reabrirCajaRec(&quot;'+r.id+'&quot;)">Reabrir</button>';
    if(isAdmin) acciones+=' <button class="btn btn-danger btn-sm" onclick="eliminarCajaRec(&quot;'+r.id+'&quot;)">Eliminar</button>';
    html+='<tr><td>'+fmtDate(r.fecha)+'</td><td>'+bTurno(r.turno)+'</td><td>'+r.usuario_nombre+'</td>'
      +'<td style="color:'+difColor+'">'+(r.diferencia_total!==undefined?(r.efectivo_real-r.rec_cash_mews>=0?'+':'')+(r.efectivo_real-r.rec_cash_mews).toFixed(2)+'€':'—')+'</td>'
      +'<td style="color:'+difColor+'">'+(r.rec_tarjeta_mews!==undefined?(r.tarjeta_real-r.rec_tarjeta_mews>=0?'+':'')+(r.tarjeta_real-r.rec_tarjeta_mews).toFixed(2)+'€':'—')+'</td>'
      +'<td style="color:'+difColor+'">'+(r.rec_stripe_mews!==undefined?(r.stripe_real-r.rec_stripe_mews>=0?'+':'')+(r.stripe_real-r.rec_stripe_mews).toFixed(2)+'€':'—')+'</td>'
      +'<td style="font-family:var(--font-mono);font-weight:700;color:'+difColor+'">'+difTxt+'</td>'
      +'<td>'+estadoBadge+'</td><td>'+acciones+'</td></tr>';
  });
  html+='</table>';
  el.innerHTML=html;
}

function bTurno(t){
  var icons={Mañana:'🌅',Tarde:'🌆',Noche:'🌙'};
  return '<span style="font-size:12px">'+(icons[t]||'')+(t||'—')+'</span>';
}

async function reabrirCajaRec(cajaId) {
  var motivo=prompt('Motivo de reapertura (obligatorio):');
  if(!motivo||!motivo.trim()){toast('Motivo obligatorio','err');return;}
  try {
    await dbUpdate('cash_closings', cajaId, {
      estado:'reabierto',
      reabierto_por: currentUser.nombre,
      fecha_reapertura: new Date().toISOString(),
      motivo_reapertura: motivo.trim()
    });
    await dbInsert('closing_audit_log',{
      id:genId(),tabla:'cash_closings',registro_id:cajaId,
      usuario_id:currentUser.id,usuario_nombre:currentUser.nombre,
      accion:'reabierto',motivo:motivo.trim(),fecha_registro:today(),
      created_at:new Date().toISOString()
    });
    invalidateCache('cash_closings');
    toast('Caja reabierta','ok');
    renderRecepcionCajaList();
  } catch(e){ toast('Error: '+e.message,'err'); }
}

async function eliminarCajaRec(cajaId) {
  if(currentUser.rol!=='admin'){toast('Solo admin puede eliminar','err');return;}
  var motivo=prompt('Motivo de eliminación (obligatorio para auditoría):');
  if(!motivo||!motivo.trim()){toast('Motivo obligatorio','err');return;}
  if(!confirm('¿Eliminar este cierre de caja? Esta acción quedará registrada en auditoría.')) return;
  try {
    await dbInsert('closing_audit_log',{
      id:genId(),tabla:'cash_closings',registro_id:cajaId,
      usuario_id:currentUser.id,usuario_nombre:currentUser.nombre,
      accion:'eliminado',motivo:motivo.trim(),fecha_registro:today(),
      created_at:new Date().toISOString()
    });
    await dbDelete('cash_closings', cajaId);
    invalidateCache('cash_closings');
    toast('Caja eliminada — registrado en auditoría','ok');
    renderRecepcionCajaList();
  } catch(e){ toast('Error: '+e.message,'err'); }
}

async function renderRecepcionDashboard() {
  var el=document.getElementById('rec-dashboard-content');
  if(!el) return;
  el.innerHTML='<div class="empty"><div class="empty-text">Cargando...</div></div>';
  var periodo=document.getElementById('rec-dash-periodo2')?document.getElementById('rec-dash-periodo2').value:'hoy';
  var rows=[];
  try { rows=await getDB('cash_closings'); } catch(e){ rows=[]; }
  rows=rows.filter(function(r){return r.departamento==='recepcion';});
  var t=today(), sw=startOfWeek(), sm=startOfMonth();
  if(periodo==='hoy') rows=rows.filter(function(r){return r.fecha===t;});
  else if(periodo==='semana') rows=rows.filter(function(r){return r.fecha>=sw;});
  else if(periodo==='mes') rows=rows.filter(function(r){return r.fecha>=sm;});
  if(!rows.length){
    el.innerHTML='<div class="empty"><div class="empty-text">Sin datos en este periodo</div></div>';
    return;
  }
  var totalDif=rows.reduce(function(s,r){return s+Math.abs(r.diferencia_total||0);},0);
  var turnos=rows.length;
  var conError=rows.filter(function(r){return Math.abs(r.diferencia_total||0)>0.01;}).length;
  el.innerHTML='<div class="kpi-grid">'
    +'<div class="kpi-card"><div class="kpi-lbl">Cierres</div><div class="kpi-val">'+turnos+'</div></div>'
    +'<div class="kpi-card"><div class="kpi-lbl">Con diferencia</div><div class="kpi-val" style="color:var(--red)">'+conError+'</div></div>'
    +'<div class="kpi-card"><div class="kpi-lbl">Δ acumulada</div><div class="kpi-val" style="color:'+(totalDif>0?'var(--red)':'var(--green)')+'">'+(totalDif>0?totalDif.toFixed(2)+'€':'OK')+'</div></div>'
    +'</div>';
}

// ═══ PERMISOS: reapertura de turnos validados ═══
async function reabrirTurnoValidado(shiftId) {
  var canReopen = currentUser.rol==='admin'
    || (currentUser.rol==='jefe_recepcion' && true)
    || (currentUser.rol==='chef' && true)
    || (currentUser.rol==='fb' && true);
  if(!canReopen){toast('Sin permiso para reabrir','err');return;}
  var motivo=prompt('Motivo de reapertura:');
  if(!motivo||!motivo.trim()){toast('Motivo obligatorio','err');return;}
  try {
    await dbUpdate('shifts', shiftId, {
      estado:'En corrección',
      comentario_validador:'Reabierto por '+currentUser.nombre+': '+motivo.trim(),
      validado_por:null, validado_ts:null, updated_at:new Date().toISOString()
    });
    await auditLog('REOPEN_SHIFT', currentUser.nombre+' reabrió turno '+shiftId+' — '+motivo.trim());
    invalidateCache('shifts');
    toast('Turno reabierto — vuelve a estado En corrección','ok');
    renderValidacion();
  } catch(e){ toast('Error: '+e.message,'err'); }
}


// ═══════════════════════════════════════════════════════════════════
// FOLLOW-UP / INCIDENCIAS — Funciones completas
// ═══════════════════════════════════════════════════════════════════

var _fuCloseId = null;
var _syncroVentaIdx = 0;

// ── Render followup list in Mi Turno ──
async function renderFollowupList() {
  var el = document.getElementById('followup-incidencias-list');
  var countEl = document.getElementById('followup-count');
  var btnNew = document.getElementById('btn-new-followup');
  var subtitleEl = document.getElementById('followup-subtitle');
  if(!el) return;
  var isSupervisorUser = isAdmin(currentUser) || isSupervisor(currentUser);
  var isAdminUser = isAdmin(currentUser);
  var dept = currentUser ? (currentUser.area || '') : '';
  if(btnNew) btnNew.style.display = isSupervisorUser ? '' : 'none';
  if(subtitleEl) subtitleEl.textContent = isSupervisorUser
    ? 'Gestiones pendientes, tareas e incidencias operativas del departamento.'
    : 'Gestiones pendientes y tareas visibles para tu departamento. Las incidencias son solo para supervisores.';
  var allIncis = [], allTareas = [], allShifts = [];
  try { allIncis = await getDB('incidencias'); } catch(e){ allIncis = []; }
  try { allTareas = await getDB('tareas'); } catch(e){ allTareas = []; }
  try { allShifts = await getDB('shifts'); } catch(e){ allShifts = []; }
  var shiftMap = {};
  allShifts.forEach(function(s){ if(s.id) shiftMap[s.id] = s; });
  function sameDept(record){
    if(isAdminUser) return true;
    var rDept = getRecordDepartment(record, shiftMap);
    if(isSupervisorUser) return canViewDepartment(currentUser, rDept);
    return normalizeDeptName(rDept) === normalizeDeptName(dept)
      || record.employee_id === currentUser.id
      || record.creado_por === currentUser.nombre;
  }
  function isGestion(t){
    var txt = normalizeDeptName([t.origen,t.titulo,t.descripcion].join(' '));
    return txt.indexOf('gestion') !== -1 || txt.indexOf('gestión') !== -1;
  }
  var gestiones = allTareas.filter(function(t){ return isTaskOpen(t) && isGestion(t) && sameDept(t); });
  var tareas = allTareas.filter(function(t){ return isTaskOpen(t) && !isGestion(t) && sameDept(t); });
  var gestionesHistoricas = allIncis.filter(function(i){ return isIncidentOpen(i) && i.categoria === 'Gestión pendiente' && sameDept(i); });
  var incidencias = isSupervisorUser
    ? allIncis.filter(function(i){ return isIncidentOpen(i) && i.categoria !== 'Gestión pendiente' && sameDept(i); })
    : [];
  var total = gestiones.length + gestionesHistoricas.length + tareas.length + incidencias.length;
  if(countEl) countEl.textContent = total ? '(' + total + ' activas)' : '(sin activas)';
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
        if(canProgressTask(row) && st === TASK_STATES.ABIERTA) acciones += '<button class="btn btn-secondary btn-sm" onclick="advanceTask(\''+row.id+'\',\'En proceso\')">En proceso</button> ';
        if(canCloseTask(currentUser,row) && st === TASK_STATES.EN_PROCESO) acciones += '<button class="btn btn-secondary btn-sm" onclick="advanceTask(\''+row.id+'\',\'Cerrada\')">Cerrar</button>';
        return '<tr>'
          + '<td style="font-family:var(--font-mono);font-size:11px;'+(isOverdue(row.deadline)?'color:var(--red);font-weight:700;':'')+'">' + fmtDate(row.deadline) + (isOverdue(row.deadline)?' ⚠':'') + '</td>'
          + '<td>' + bTaskEstado(row.estado) + '</td>'
          + '<td style="font-size:12px;max-width:220px;">' + formatDisplayValue(row.descripcion || row.titulo) + '</td>'
          + '<td>' + deptBadge(row.dept_destino) + '</td>'
          + '<td style="font-size:12px;">' + formatDisplayValue(row.creado_por) + '</td>'
          + '<td>' + (acciones || '—') + '</td>'
          + '</tr>';
      }).join('') + '</table>';
  }
  function buildIncidentRows(list){
    if(!list.length) return '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Ninguna</div>';
    return '<table><tr><th>Tipo</th><th>Descripción</th><th>Empleado</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr>'
      + list.map(function(i){
        var apertura = i.created_at ? new Date(i.created_at) : null;
        var canClose = isAdminUser || (isSupervisorUser && canViewDepartment(currentUser, getRecordDepartment(i, shiftMap)));
        var normI = normalizeIncidentState(i.estado);
        var acciones = canClose
          ? (normI===INCIDENT_STATES.ABIERTA?'<button class="btn btn-secondary btn-sm" onclick="advanceIncident(\''+i.id+'\',\'En proceso\')">En proceso</button> ':'') + '<button class="btn btn-secondary btn-sm" onclick="openCloseFollowup(\''+i.id+'\')">Cerrar</button>'
          : '—';
        return '<tr>'
          + '<td style="font-size:12px;">' + formatDisplayValue(i.tipo_incidencia || i.categoria) + '</td>'
          + '<td style="font-size:12px;max-width:200px;">' + formatDisplayValue(i.descripcion).slice(0,70) + (i.descripcion && i.descripcion.length>70?'...':'') + '</td>'
          + '<td style="font-size:12px;">' + formatDisplayValue(i.nombre) + '</td>'
          + '<td style="font-size:11px;color:var(--text3);">' + (apertura ? apertura.toLocaleDateString('es-ES') : '—') + '</td>'
          + '<td>' + bIncidentEstado(i.estado) + '</td>'
          + '<td>' + acciones + '</td>'
          + '</tr>';
      }).join('') + '</table>';
  }
  var html = '<div style="margin-bottom:10px;"><div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.12em;margin-bottom:6px;">GESTIONES PENDIENTES ('+(gestiones.length+gestionesHistoricas.length)+')</div>'
    + buildTaskRows(gestiones) + (gestionesHistoricas.length ? buildIncidentRows(gestionesHistoricas) : '') + '</div>';
  html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--purple);letter-spacing:.12em;margin-bottom:6px;">TAREAS ('+tareas.length+')</div>' + buildTaskRows(tareas) + '</div>';
  if(isSupervisorUser){
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--red);letter-spacing:.12em;margin-bottom:6px;">INCIDENCIAS OPERATIVAS ('+incidencias.length+') — Solo supervisores</div>' + buildIncidentRows(incidencias) + '</div>';
  }
  el.innerHTML = html;
}

// ── Open new followup modal ──
async function openNewFollowup() {
  ['fu-tipo','fu-desc','fu-mews-id','fu-objetivo','fu-responsable'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.value = '';
  });
  document.getElementById('fu-err').textContent = '';
  // Populate responsable
  var empSel = document.getElementById('fu-responsable');
  if(empSel) {
    empSel.innerHTML = '<option value="">— Sin asignar —</option>';
    try {
      var emps = await getDB('employees');
      emps.filter(function(e){ return e.estado === 'Activo'; }).forEach(function(e){
        var o = document.createElement('option');
        o.value = e.id; o.textContent = e.nombre + ' — ' + e.puesto;
        o.style.background = '#ffffff'; o.style.color = '#111827';
        empSel.appendChild(o);
      });
    } catch(e){}
  }
  document.getElementById('modal-followup').style.display = 'flex';
}

function closeFollowupModal() {
  document.getElementById('modal-followup').style.display = 'none';
}

// ── Save new followup ──
async function saveFollowup() {
  var tipo = document.getElementById('fu-tipo').value;
  var desc = document.getElementById('fu-desc').value.trim();
  var errEl = document.getElementById('fu-err');
  if(!tipo){ errEl.textContent = 'Selecciona un tipo'; return; }
  if(!desc){ errEl.textContent = 'La descripción es obligatoria'; return; }
  errEl.textContent = '';
  var ts = new Date().toISOString();
  var respId = document.getElementById('fu-responsable').value;
  var respOpt = document.getElementById('fu-responsable');
  var respNombre = respId && respOpt ? (respOpt.options[respOpt.selectedIndex]||{}).text || '' : '';
  var record = {
    id: genId(),
    shift_id: window._lastSavedShiftId || null,
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    fecha: today(),
    servicio: getRecTurnoValue() || getServicioValue() || '—',
    categoria: 'Follow-up / Gestión',
    tipo_incidencia: tipo,
    descripcion: desc,
    accion_inmediata: '',
    requiere_formacion: 'No',
    requiere_disciplina: 'No',
    estado: INCIDENT_STATES.ABIERTA,
    severidad: 'Pendiente revision',
    staff_implicado_ids: '[]',
    staff_implicado_nombres: '[]',
    created_at: ts
  };
  try {
    var saved = await dbInsert('incidencias', record);
    if(!saved){ console.error('Follow-up incidencia insert failed',record); errEl.textContent = 'No se pudo guardar. Revisa los datos e inténtalo de nuevo.'; return; }
    invalidateCache('incidencias');
    toast('Incidencia registrada', 'ok');
    closeFollowupModal();
    renderFollowupList();
  } catch(e){
    errEl.textContent = 'No se pudo guardar. Revisa los datos e inténtalo de nuevo.';
  }
}

// ── Open close followup modal ──
function openCloseFollowup(id) {
  _fuCloseId = id;
  ['fu-close-accion','fu-close-resultado','fu-close-comentario'].forEach(function(el){
    var e = document.getElementById(el); if(e) e.value = '';
  });
  document.getElementById('fu-close-err').textContent = '';
  document.getElementById('modal-followup-close').style.display = 'flex';
}

// ── Submit close followup ──
async function submitCloseFollowup() {
  var accion = document.getElementById('fu-close-accion').value.trim();
  var resultado = document.getElementById('fu-close-resultado').value.trim();
  var errEl = document.getElementById('fu-close-err');
  if(!accion){ errEl.textContent = 'La acción realizada es obligatoria'; return; }
  if(!resultado){ errEl.textContent = 'El resultado es obligatorio'; return; }
  var ts = new Date().toISOString();
  // Calc tiempo solución
  try {
    var allIncis = await getDB('incidencias');
    var inci = allIncis.find(function(i){ return i.id === _fuCloseId; });
    if(!inci){ errEl.textContent = 'No se encontró la incidencia.'; return; }
    var allShifts = await getDB('shifts');
    var shiftMap = {};
    allShifts.forEach(function(s){ if(s.id) shiftMap[s.id] = s; });
    if(!(isAdmin(currentUser) || (isSupervisor(currentUser) && canViewDepartment(currentUser, getRecordDepartment(inci, shiftMap))))){
      errEl.textContent = 'No tienes permiso para cerrar incidencias de este departamento.';
      return;
    }
    var comentarioCierre = document.getElementById('fu-close-comentario').value.trim();
    if((inci.severidad === 'Alta' || inci.severidad === 'Crítica') && !comentarioCierre){
      errEl.textContent = 'El comentario de cierre es obligatorio para incidencias de alta severidad.';
      return;
    }
    var tiempoMs = inci && inci.created_at ? (new Date(ts) - new Date(inci.created_at)) : 0;
    var tiempoH = Math.floor(tiempoMs/3600000);
    var tiempoM = Math.floor((tiempoMs%3600000)/60000);
    var cierreTxt = 'Cierre: ' + accion + ' · Resultado: ' + resultado + (comentarioCierre ? ' · Comentario: ' + comentarioCierre : '');
    var saved = await dbUpdate('incidencias', _fuCloseId, {
      estado: INCIDENT_STATES.CERRADA,
      accion_inmediata: [inci.accion_inmediata, cierreTxt].filter(Boolean).join(' | ')
    });
    if(!saved){ errEl.textContent = 'No se pudo cerrar la incidencia. Inténtalo de nuevo.'; return; }
    invalidateCache('incidencias');
    toast('Incidencia cerrada — tiempo: ' + tiempoH + 'h ' + tiempoM + 'min', 'ok');
    document.getElementById('modal-followup-close').style.display = 'none';
    renderFollowupList();
  } catch(e){
    errEl.textContent = 'No se pudo cerrar la incidencia. Inténtalo de nuevo.';
  }
}

// ── SYNCROLAB ventas ──
var _syncroVentas = [];
function addSyncroVenta() {
  var idx = _syncroVentaIdx++;
  _syncroVentas.push({idx:idx});
  var c = document.getElementById('syncro-ventas-container');
  if(!c) return;
  var div = document.createElement('div');
  div.id = 'syncro-venta-' + idx;
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
  var el = document.getElementById('syncro-venta-' + idx);
  if(el) el.remove();
  _syncroVentas = _syncroVentas.filter(function(v){ return v.idx !== idx; });
}
function collectSyncroVentas() {
  var result = [];
  document.querySelectorAll('#syncro-ventas-container > div').forEach(function(div){
    var id = div.id.replace('syncro-venta-','');
    var tipo = (document.getElementById('sv-tipo-'+id)||{}).value||'';
    var importe = parseFloat((document.getElementById('sv-importe-'+id)||{}).value)||0;
    var mews = (document.getElementById('sv-mews-'+id)||{}).value||'';
    var obs = (document.getElementById('sv-obs-'+id)||{}).value||'';
    if(tipo) result.push({tipo:tipo, importe:importe, mews:mews, obs:obs});
  });
  return result;
}

// ── Update initTurnoForm to call renderFollowupList ──
var _origInitTurnoForm = typeof initTurnoForm === 'function' ? initTurnoForm : null;

// ── Update calcRecDifs to include caja fuerte logic ──
function calcRecDifs() {
  var mewsCash = parseFloat((document.getElementById('rec-cash-mews')||{}).value)||0;
  var mewsTar  = parseFloat((document.getElementById('rec-tarjeta-mews')||{}).value)||0;
  var mewsStr  = parseFloat((document.getElementById('rec-stripe-mews')||{}).value)||0;
  var realCash = parseFloat((document.getElementById('rec-cash-real')||{}).value)||0;
  var realTpv  = parseFloat((document.getElementById('rec-tpv-real')||{}).value)||0;
  var realStr  = parseFloat((document.getElementById('rec-stripe-real')||{}).value)||0;
  var fondoRec = parseFloat((document.getElementById('rec-fondo-recibido')||{}).value)||0;
  var cfImporte= parseFloat((document.getElementById('rec-cf-importe')||{}).value)||0;

  var difCash  = realCash - mewsCash;
  var difTar   = realTpv  - mewsTar;
  var difStr   = realStr  - mewsStr;
  var difTotal = difCash + difTar + difStr;

  function fmt(val){
    return (val>=0?'+':'')+val.toFixed(2)+' €';
  }
  function setColor(id, val){
    var el = document.getElementById(id);
    if(!el) return;
    el.textContent = fmt(val);
    el.style.color = Math.abs(val)<0.01?'var(--green)':val>0?'var(--blue)':'var(--red)';
  }
  setColor('rec-dif-cash', difCash);
  setColor('rec-dif-tarjeta', difTar);
  setColor('rec-dif-stripe', difStr);
  setColor('rec-dif-total', difTotal);

  // Caja fuerte: fondo esperado = fondo recibido + cash MEWS - retiro CF
  var fondoEsperado = fondoRec + mewsCash - cfImporte;
  var feEl = document.getElementById('rec-fondo-esperado');
  if(feEl){
    feEl.textContent = fondoEsperado.toFixed(2) + ' €';
    feEl.style.color = fondoEsperado >= 0 ? 'var(--green)' : 'var(--red)';
  }

  var hasError = Math.abs(difTotal) > 0.01;
  var alertEl = document.getElementById('rec-dif-alert');
  var expBlock = document.getElementById('rec-dif-exp-block');
  if(alertEl) alertEl.style.display = hasError ? 'block' : 'none';
  if(expBlock) expBlock.style.display = hasError ? 'block' : 'none';

  var turno = typeof getRecTurnoValue === 'function' ? getRecTurnoValue() : '';
  var fondoIni = document.getElementById('rec-fondo-inicial-block');
  if(fondoIni) fondoIni.style.display = turno === 'Noche' ? 'block' : 'none';
}

// ── renderFollowupList is called from initTurnoForm patch below ──
// No showScreen override needed — avoids infinite recursion risk

// ── Update submitRecKpi to collect new fields ──
function submitRecKpi() {
  var errs = [];
  if(!_recKpiState.reservas_pendientes) errs.push('Indica si quedan reservas pendientes');
  if(!_recKpiState.upsell_desayuno)     errs.push('Indica si ofertaste desayunos');
  if(!_recKpiState.comms_revisadas)     errs.push('Indica si revisaste comunicaciones');
  if(!_recKpiState.clientes_insatisfechos) errs.push('Indica si hubo clientes insatisfechos');
  // SYNCROLAB validation
  if(_recKpiState.syncrolab_ventas === 'si'){
    var ventas = collectSyncroVentas();
    var ventaErr = false;
    ventas.forEach(function(v,i){
      if(!v.tipo) { errs.push('Venta SYNCROLAB #'+(i+1)+': selecciona tipo'); ventaErr=true; }
      if(!v.importe||v.importe<=0) { errs.push('Venta SYNCROLAB #'+(i+1)+': importe obligatorio'); ventaErr=true; }
      if(!v.mews) { errs.push('Venta SYNCROLAB #'+(i+1)+': nº reserva MEWS obligatorio'); ventaErr=true; }
    });
    if(!ventaErr && ventas.length === 0) errs.push('Añade al menos una venta SYNCROLAB');
  }
  // Lead Bitrix24 validation
  if(_recKpiState.lead_pendiente === 'si'){
    var leadDesc = (document.getElementById('kpi-lead-desc')||{}).value||'';
    if(!leadDesc.trim()) errs.push('Describe el lead pendiente en Bitrix24');
  }
  if(errs.length > 0){ document.getElementById('kpi-err').textContent = errs.join(' · '); return; }
  document.getElementById('kpi-err').textContent = '';
  // Collect all state
  _recKpiState.checkins = parseInt((document.getElementById('kpi-checkins')||{}).value)||0;
  _recKpiState.checkouts = parseInt((document.getElementById('kpi-checkouts')||{}).value)||0;
  _recKpiState.reservas = parseInt((document.getElementById('kpi-reservas')||{}).value)||0;
  _recKpiState.syncrolab_ventas_data = collectSyncroVentas();
  _recKpiState.lead_desc = (document.getElementById('kpi-lead-desc')||{}).value||'';
  _recKpiState.lead_resp = (document.getElementById('kpi-lead-resp')||{}).value||'';
  _recKpiState.lead_fecha = (document.getElementById('kpi-lead-fecha')||{}).value||'';
  _recKpiState.comms_no_exp = (document.getElementById('kpi-comms-no-exp')||{}).value||'';
  _recKpiState.clientes_num = parseInt((document.getElementById('kpi-clientes-num')||{}).value)||0;
  closeRecKpiModal();
  // Guardar turno ANTES de abrir caja — este era el bug principal
  _doSaveTurno().then(function() {
    openRecCajaModal();
  });
}

// ── Hook into initTurnoForm for Recepción label changes ──
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(function(){
    renderFollowupList();
  }, 500);
});
