// ═══════════════════════════════════════════════════
// CAJA — Cierre de caja Sala/Cocina + Validación + Portal
// Depende de: shared.js, checklist.js, sala.js
// ═══════════════════════════════════════════════════

var _editingCajaId = null;

function initCajaForm() { renderCajaList(); }

function openCajaForm(existingId) {
  _editingCajaId=existingId||null;
  var title=document.getElementById('caja-form-title');
  if(title) title.textContent=existingId?'Editar Cierre de Caja':'Nuevo Cierre de Caja';
  var fechaEl=document.getElementById('caja-fecha');
  if(fechaEl) fechaEl.value=today();
  var respEl=document.getElementById('caja-responsable');
  if(respEl){ respEl.value=currentUser.nombre+' — '+currentUser.puesto; respEl.readOnly=(currentUser.rol!=='admin'); }
  var lastShiftLink=document.getElementById('caja-shift-link');
  if(lastShiftLink) lastShiftLink.value=window._lastSavedShiftId||'';
  ['caja-ef-posmews','caja-tar-posmews','caja-str-posmews',
   'caja-room','caja-syncrolab','caja-alexander',
   'caja-pension-desayuno-pax','caja-pension-comidacena-pax',
   'caja-eur-pension-desayuno','caja-eur-pension-comidacena',
   'caja-ef-real','caja-tar-tpv','caja-str-real',
   'caja-propinas-tpv','caja-propinas-ef',
   'caja-retiro','caja-fondo-real',
   'caja-expl-diferencia','caja-accion-diferencia','caja-comentario',
   'caja-total-neto-manual','caja-total-bruto-manual'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  // BUG-29 SALA: fondo inicial = fondo_final del último cierre, readonly en HTML
  var fondoIniEl=document.getElementById('caja-fondo-ini');
  if(fondoIniEl) fondoIniEl.value='';
  if(!existingId){
    dbGetAll('sala_cash_closures').then(function(rows){
      var sorted=rows
        .filter(function(r){ return r.fondo_final!=null; })
        .sort(function(a,b){
          return (b.fecha||'').localeCompare(a.fecha||'')||
                 (b.created_at||'').localeCompare(a.created_at||'');
        });
      var ultimo=sorted[0];
      if(fondoIniEl&&ultimo){
        // Use fondo_real_sala (actual transferred) or fondo_final as fallback
        var fondo = parseFloat(ultimo.fondo_real_sala||ultimo.fondo_final||0);
        fondoIniEl.value = fondo.toFixed(2);
        calcCajaDifs();
      }
    });
  } else {
    dbGetAll('sala_cash_closures').then(function(rows){
      var row=rows.find(function(r){ return r.id===existingId; });
      if(!row) return;
      if(fondoIniEl&&row.fondo_inicial!=null) fondoIniEl.value=parseFloat(row.fondo_inicial).toFixed(2);
      // Load POSMEWS values
      function setF(id,val){ var el=document.getElementById(id); if(el&&val!=null) el.value=parseFloat(val).toFixed(2); }
      function setI(id,val){ var el=document.getElementById(id); if(el&&val!=null) el.value=parseInt(val)||0; }
      setF('caja-ef-posmews',  row.efectivo_posmews);
      setF('caja-tar-posmews', row.tarjeta_posmews);
      setF('caja-str-posmews', row.stripe_posmews);
      setF('caja-room',        row.room_charge);
      setF('caja-syncrolab',   row.syncrolab_charge);
      setF('caja-alexander',   row.cargo_alexander);
      setI('caja-pension-desayuno-pax',   row.pension_desayuno_pax);
      setI('caja-pension-comidacena-pax', row.pension_comidacena_pax);
      setF('caja-eur-pension-desayuno',   row.eur_pension_desayuno);
      setF('caja-eur-pension-comidacena', row.eur_pension_comidacena);
      setF('caja-ef-real',      row.efectivo_real);
      setF('caja-tar-tpv',      row.tarjeta_tpv);
      setF('caja-str-real',     row.stripe_real);
      setF('caja-propinas-tpv', row.propinas_tpv);
      setF('caja-propinas-ef',  row.propinas_efectivo);
      setF('caja-retiro',   row.retiro_caja_fuerte);
      setF('caja-fondo-real', row.fondo_real_sala);
      // Set fondoIni from DB for edit mode
      if(fondoIniEl && row.fondo_inicial!=null) fondoIniEl.value=parseFloat(row.fondo_inicial).toFixed(2);
      var explEl=document.getElementById('caja-expl-diferencia'); if(explEl) explEl.value=row.explicacion_diferencia||'';
      var accionEl=document.getElementById('caja-accion-diferencia'); if(accionEl) accionEl.value=row.accion_diferencia||'';
      var comEl=document.getElementById('caja-comentario'); if(comEl) comEl.value=row.comentario||'';
      var netoEl=document.getElementById('caja-total-neto-manual'); if(netoEl) netoEl.value=row.subtotal_neto||'';
      var brutoEl=document.getElementById('caja-total-bruto-manual'); if(brutoEl) brutoEl.value=row.total_bruto||'';
      calcCajaDifs();
    });
  }
  document.querySelectorAll('#caja-servicios-check input[type=checkbox]').forEach(function(cb){ cb.checked=false; });
  calcCajaTotal();
  document.getElementById('modal-caja').classList.add('open');
}

function calcCajaTotal() { calcCajaDifs(); }

function calcCajaDifs() {
  function getV(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  function setColor(el,val){ if(!el) return; var abs=Math.abs(val); el.style.color=abs<0.01?'var(--green)':abs>5?'var(--red)':'var(--amber)'; }
  function fmt(val){ return (val>=0?'+':'')+val.toFixed(2)+' €'; }
  function setEl(id,val){ var el=document.getElementById(id); if(el){el.textContent=fmt(val);setColor(el,val);} }

  // Bloque 1 — Fondo
  var fondoIni = getV('caja-fondo-ini');

  // Bloque 4 — Valores reales
  var efReal      = getV('caja-ef-real');
  var tarTpv      = getV('caja-tar-tpv');
  var strReal     = getV('caja-str-real');

  // Bloque 2 — POSMEWS
  var efPosmews   = getV('caja-ef-posmews');
  var tarPosmews  = getV('caja-tar-posmews');
  var strPosmews  = getV('caja-str-posmews');

  // Diferencias: Real - POSMEWS (spec)
  var difEf  = efReal  - efPosmews;
  var propinasTpv = getV('caja-propinas-tpv');
  var difTar = (tarTpv - propinasTpv) - tarPosmews;
  var difStr = strReal - strPosmews;

  setEl('caja-dif-ef',  difEf);
  setEl('caja-dif-tar', difTar);
  setEl('caja-dif-str', difStr);
  setEl('dif-ef-disp',  difEf);
  setEl('dif-tar-disp', difTar);
  setEl('dif-str-disp', difStr);

  var difTotal = difEf + difTar + difStr;
  var totalEl = document.getElementById('dif-sala-total');
  if(totalEl){ totalEl.textContent = fmt(difTotal); setColor(totalEl, difTotal); }

  // Bloque 7 — Fondo esperado a traspasar = Fondo recibido + Cash real - Retiro
  var retiro        = getV('caja-retiro');
  var fondoEsperado = fondoIni + efReal - retiro;
  var fondoReal     = getV('caja-fondo-real');
  var difFondo      = fondoReal - fondoEsperado;

  var fondoEspEl = document.getElementById('caja-fondo-esperado');
  if(fondoEspEl) fondoEspEl.textContent = fondoEsperado.toFixed(2) + ' €';
  var fondoDifEl = document.getElementById('caja-fondo-dif');
  if(fondoDifEl){
    fondoDifEl.textContent = Math.abs(difFondo) < 0.01 ? '✓ Fondo cuadrado' : '⚠ Diferencia fondo: ' + fmt(difFondo);
    fondoDifEl.style.color = Math.abs(difFondo) < 0.01 ? 'var(--green)' : 'var(--red)';
  }

  // Mostrar/ocultar bloque de explicación si hay diferencia
  var hayDif = Math.abs(difTotal) > 0.01;
  var alertEl = document.getElementById('caja-diferencia-alert');
  if(alertEl) alertEl.style.display = hayDif ? 'block' : 'none';
  var explBloque = document.getElementById('caja-expl-bloque');
  if(explBloque) explBloque.style.display = hayDif ? 'block' : 'none';
}

function checkCajaDiferencia() {
  var mediosTmp=(parseFloat((document.getElementById('caja-efectivo')||{}).value)||0)+(parseFloat((document.getElementById('caja-tarjeta')||{}).value)||0)+(parseFloat((document.getElementById('caja-room')||{}).value)||0)+(parseFloat((document.getElementById('caja-alexander')||{}).value)||0);
  var posmewsTmp=parseFloat((document.getElementById('caja-posmews-bruto')||{}).value)||0;
  var dif=posmewsTmp>0?mediosTmp-posmewsTmp:0;
  var alert=document.getElementById('caja-diferencia-alert');
  if(alert) alert.style.display=Math.abs(dif)>5?'block':'none';
}

function getCajaServicios() {
  var checked=[];
  document.querySelectorAll('#caja-servicios-check input[type=checkbox]:checked').forEach(function(cb){ checked.push(cb.value); });
  if(checked.length===0) checked=['Servicio'];
  return checked;
}

async function saveCajaForm() {
  var fecha = (document.getElementById('caja-fecha')||{}).value || today();
  var servicios = getCajaServicios();
  function getCV(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  function getStr(id){ return ((document.getElementById(id)||{}).value||'').trim(); }

  var fondoIni    = getCV('caja-fondo-ini');
  var efPosmews   = getCV('caja-ef-posmews');
  var tarPosmews  = getCV('caja-tar-posmews');
  var strPosmews  = getCV('caja-str-posmews');
  var efReal      = getCV('caja-ef-real');
  var tarTpv      = getCV('caja-tar-tpv');
  var strReal     = getCV('caja-str-real');
  var retiro      = getCV('caja-retiro');
  var fondoReal   = getCV('caja-fondo-real');

  // Diferencias: Real - POSMEWS
  var difEf  = efReal  - efPosmews;
  var propinasTpv = getV('caja-propinas-tpv');
  var difTar = (tarTpv - propinasTpv) - tarPosmews;
  var difStr = strReal - strPosmews;
  var difTotal = difEf + difTar + difStr;

  // Fondo esperado = Fondo recibido + Cash real - Retiro
  var fondoEsperado = fondoIni + efReal - retiro;

  // Validación: si hay diferencia, explicación obligatoria
  var hayDif = Math.abs(difTotal) > 0.01;
  var expl = getStr('caja-expl-diferencia');
  var accion = getStr('caja-accion-diferencia');
  if(hayDif && !expl) {
    toast('Hay diferencia — la explicación es obligatoria','err');
    document.getElementById('caja-expl-diferencia').focus();
    return;
  }
  if(hayDif && !accion) {
    toast('Hay diferencia — la acción tomada es obligatoria','err');
    document.getElementById('caja-accion-diferencia').focus();
    return;
  }
  var informado = !!(document.getElementById('caja-informado-si') || {checked:false}).checked;

  var closure = {
    id: _editingCajaId || genId(),
    fecha: fecha,
    servicios: JSON.stringify(servicios),
    responsable_id: currentUser.id,
    responsable_nombre: currentUser.nombre,
    // Bloque 2 — POSMEWS
    efectivo_posmews: efPosmews,
    tarjeta_posmews:  tarPosmews,
    stripe_posmews:   strPosmews,
    // Bloque 3 — Cargos e internos
    room_charge:              getCV('caja-room'),
    syncrolab_charge:         getCV('caja-syncrolab'),
    cargo_alexander:          getCV('caja-alexander'),
    pension_desayuno_pax:     getCV('caja-pension-desayuno-pax'),
    pension_comidacena_pax:   getCV('caja-pension-comidacena-pax'),
    eur_pension_desayuno:     getCV('caja-eur-pension-desayuno'),
    eur_pension_comidacena:   getCV('caja-eur-pension-comidacena'),
    // Bloque 4 — Reales
    efectivo_real: efReal,
    tarjeta_tpv:   tarTpv,
    stripe_real:   strReal,
    // Diferencias calculadas
    diferencia_efectivo: difEf,
    propinas_tpv:        getCV('caja-propinas-tpv'),
    propinas_efectivo:   getCV('caja-propinas-ef'),
    diferencia_tarjeta:  difTar,
    diferencia_stripe:   difStr,
    diferencia_operativa_sala: difTotal,
    diferencia_caja: difTotal,
    // Bloque 6 — Explicación
    explicacion_diferencia: expl,
    accion_diferencia:      accion,
    informado_responsable:  informado,
    comentario: getStr('caja-comentario'),
    // Bloque 7 — Fondo final
    retiro_caja_fuerte: retiro,
    fondo_inicial:      fondoIni,
    fondo_final:        fondoEsperado,
    fondo_real_sala:    fondoReal,
    // Totales
    subtotal_neto: getCV('caja-total-neto-manual'),
    total_bruto:   getCV('caja-total-bruto-manual'),
    estado: 'Pendiente validación',
    created_at: localTs(),
    updated_at: localTs()
  };
  try {
    var cajaUrl=SUPABASE_URL+'/rest/v1/sala_cash_closures';
    var cajaMethod=_editingCajaId?'PATCH':'POST';
    var cajaFetchUrl=_editingCajaId?cajaUrl+'?id=eq.'+encodeURIComponent(_editingCajaId):cajaUrl;
    var cajaRes=await fetch(cajaFetchUrl,{
      method:cajaMethod,
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify(closure)
    });
    if(!cajaRes.ok){ var errTxt=await cajaRes.text(); toast('Error Supabase: '+cajaRes.status,'err'); return; }
    invalidateCache('sala_cash_closures');
    closeModal('modal-caja');
    toast('Cierre de caja guardado ✓','ok');
    await renderCajaList();
    var valCajaEl=document.getElementById('val-caja-table');
    if(valCajaEl) await renderValCajaList();
  } catch(e){ toast('Error al guardar: '+e.message,'err'); }
}

async function renderCajaList() {
  var el=document.getElementById('caja-list');
  if(!el) return;
  el.innerHTML='<div style="color:var(--text3);font-family:var(--font-mono);font-size:12px;padding:20px;">Cargando...</div>';
  try {
    var data=await dbGetAll('sala_cash_closures');
    var canSeeAll=currentUser.rol==='admin'||currentUser.rol==='fb'||currentUser.rol==='chef'||(currentUser.validador==1||currentUser.validador===true);
    if(!canSeeAll){ data=data.filter(function(c){return c.responsable_id===currentUser.id||c.responsable_nombre===currentUser.nombre;}); }
    var filter=(document.getElementById('caja-filter-date')||{}).value||'hoy';
    var today2=today();
    data=data.filter(function(c){
      if(filter==='hoy') return c.fecha===today2;
      if(filter==='semana') return c.fecha>=startOfWeek();
      if(filter==='mes') return c.fecha>=startOfMonth();
      return true;
    });
    data.sort(function(a,b){return b.fecha.localeCompare(a.fecha);});
    if(!data.length){ el.innerHTML='<div class="empty"><div class="empty-icon">💰</div><div class="empty-text">Sin cierres en el periodo</div></div>'; return; }
    var rows=data.map(function(c){
      var servs=displayServicio(c.servicios||'');
      var diffColor=Math.abs(c.diferencia_caja||0)>5?'var(--red)':'var(--green)';
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(c.fecha)+'</td>'
        +'<td>'+servs+'</td>'
        +'<td style="font-weight:600">'+c.responsable_nombre+'</td>'
        +'<td style="font-family:var(--font-mono);font-weight:700;color:#3b82f6">'+(c.subtotal_neto||0).toFixed(2)+' €</td>'
        +'<td style="font-family:var(--font-mono);color:'+diffColor+'">'+(c.diferencia_caja>=0?'+':'')+((c.diferencia_caja||0).toFixed(2))+' €</td>'
        +'<td>'+bEstado(c.estado)+'</td>'
        +'<td><button class="btn btn-secondary btn-sm" onclick="openCajaForm(this.dataset.id)" data-id="'+c.id+'">✏️</button></td>'
        +'</tr>';
    }).join('');
    el.innerHTML='<table><tr><th>Fecha</th><th>Servicio</th><th>Responsable</th><th>Total neto</th><th>Diferencia</th><th>Estado</th><th></th></tr>'+rows+'</table>';
  } catch(e){ el.innerHTML='<div class="alert a-warn">Tabla sala_cash_closures pendiente de crear en Supabase.</div>'; }
}

function getServicioValue() {
  if(currentUser&&currentUser.area==='Recepción') return getRecTurnoValue();
  var isSala=currentUser&&currentUser.area==='Sala';
  if(isSala){
    var checked=[];
    document.querySelectorAll('input[name="servicio-sala"]:checked').forEach(function(cb){checked.push(cb.value);});
    return checked.length>0?JSON.stringify(checked):'';
  }
  var checkedC=[];
  document.querySelectorAll('input[name="servicio-cocina"]:checked').forEach(function(cb){checkedC.push(cb.value);});
  if(checkedC.length>0) return JSON.stringify(checkedC);
  return (document.getElementById('t-servicio')||{}).value||'';
}

function displayServicio(val) {
  return typeof formatServiceOrTurn === 'function' ? formatServiceOrTurn(val) : (val||'—');
}

function switchValTab(tab) {
  var followupDiv=document.getElementById('val-content-followup');
  var cajaDiv=document.getElementById('val-content-caja');
  var btnF=document.getElementById('val-tab-followup');
  var btnC=document.getElementById('val-tab-caja');
  if(!followupDiv||!cajaDiv) return;
  if(tab==='followup'){
    followupDiv.style.display='block'; cajaDiv.style.display='none';
    if(btnF) btnF.style.cssText='padding:8px 18px;border-radius:6px;border:2px solid #2ec4b6;background:rgba(46,196,182,.15);color:#2ec4b6;font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
    if(btnC) btnC.style.cssText='padding:8px 18px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text3);font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
    renderValidacion();
  } else {
    followupDiv.style.display='none'; cajaDiv.style.display='block';
    if(btnC) btnC.style.cssText='padding:8px 18px;border-radius:6px;border:2px solid #3b82f6;background:rgba(59,130,246,.15);color:#3b82f6;font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
    if(btnF) btnF.style.cssText='padding:8px 18px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text3);font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
    renderValCajaList();
  }
}

async function renderValCajaList() {
  var el=document.getElementById('val-caja-table');
  if(!el) return;
  try {
    var data=await dbGetAll('sala_cash_closures');
    var periodo=(document.getElementById('val-caja-periodo')||{}).value||'hoy';
    var t=today();
    data=data.filter(function(c){
      if(periodo==='hoy') return c.fecha===t;
      if(periodo==='semana') return c.fecha>=startOfWeek();
      if(periodo==='mes') return c.fecha>=startOfMonth();
      return true;
    });
    data.sort(function(a,b){return b.fecha.localeCompare(a.fecha);});
    if(!data.length){ el.innerHTML='<div class="empty"><div class="empty-icon">💰</div><div class="empty-text">Sin cierres en el periodo</div></div>'; return; }
    var canEdit=currentUser.rol==='admin'||currentUser.rol==='fb';
    var rows=data.map(function(c){
      var servs=displayServicio(c.servicios||'');
      var difOp=c.diferencia_operativa_sala||0;
      var difColor=Math.abs(difOp)<0.01?'var(--green)':Math.abs(difOp)>5?'var(--red)':'var(--amber)';
      var isPendiente=c.estado!=='Validado final';
      var totalPens=(parseInt(c.pension_desayuno)||0)+(parseInt(c.media_pension)||0)+(parseInt(c.pension_completa)||0);
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(c.fecha)+'</td>'
        +'<td>'+servs+'</td>'
        +'<td style="font-weight:600">'+c.responsable_nombre+'</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.efectivo_real||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.retiro_caja_fuerte||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.tarjeta_tpv||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.stripe_real||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.subtotal_neto||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.total_bruto||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono);color:'+difColor+'">'+(difOp>=0?'+':'')+difOp.toFixed(2)+'€</td>'
        +'<td style="text-align:center">'+totalPens+'p</td>'
        +'<td>'+bCajaEstado(c.estado||'Pendiente Sala')+'</td>'
        +'<td style="white-space:nowrap;display:flex;gap:4px;">'
        +(isPendiente&&canEdit?'<button class="vbtn vbtn-primary" data-cid="'+c.id+'" onclick="validarCierre(this.dataset.cid)">✓ Validar</button>':'')
        +'<button class="vbtn vbtn-sec" data-cid="'+c.id+'" onclick="openCajaForm(this.dataset.cid)">📋 Ver</button>'
        +(canEdit?'<button class="vbtn vbtn-warn" data-cid="'+c.id+'" onclick="reabrirCierre(this.dataset.cid)">↩ Revisar</button>':'')
        +'</td>'
        +'</tr>';
    }).join('');
    el.innerHTML='<table><tr><th>Fecha</th><th>Servicio</th><th>Responsable</th><th>Efectivo</th><th>Retiro</th><th>Tarjeta</th><th>Stripe</th><th>Neto</th><th>Bruto</th><th>Diferencia</th><th>Pensiones</th><th>Estado</th><th>Acción</th></tr>'+rows+'</table>';
  } catch(e){ el.innerHTML='<div class="alert a-warn">No se puede cargar — ejecuta primero el SQL de Sala.</div>'; }
}

async function validarCierre(cajaId) {
  var data=await dbGetAll('sala_cash_closures');
  var c=data.find(function(x){return x.id===cajaId;});
  var currentEstado=c?c.estado:'Pendiente';
  var nextEstado='Cuadrado Sala';
  if(currentEstado==='Cuadrado Sala') nextEstado='Validado final';
  else if(currentUser.rol==='admin'||currentUser.rol==='fb') nextEstado='Cuadrado Sala';
  await dbUpdate('sala_cash_closures',cajaId,{estado:nextEstado,validado_por:currentUser.nombre,validado_ts:new Date().toISOString(),updated_at:new Date().toISOString()});
  invalidateCache('sala_cash_closures');
  toast('Cierre: estado → '+nextEstado,'ok');
  await renderValCajaList();
}

function setDeadlineLimits() {
  var t=typeof getMinTaskDeadline==='function'?getMinTaskDeadline():today();
  var maxD=typeof getMaxTaskDeadline==='function'?getMaxTaskDeadline():today();
  ['it-deadline','mt-deadline','task-deadline'].forEach(function(id){
    var el=document.getElementById(id);
    if(el){el.min=t;el.max=maxD;}
  });
}

function openCajaOfferModal() {
  document.getElementById('modal-caja-offer').style.display='flex';
}

async function acceptCajaOffer() {
  document.getElementById('modal-caja-offer').style.display='none';
  await _doSaveTurno();
  setTimeout(function(){
    if(typeof showScreen==='function') showScreen('caja');
    setTimeout(function(){ if(typeof openCajaForm==='function') openCajaForm(); },200);
  },400);
}

async function declineCajaOffer() {
  document.getElementById('modal-caja-offer').style.display='none';
  await _doSaveTurno();
}

async function renderCostTable() {
  var el=document.getElementById('dash-cost-table');
  if(!el) return;
  var deptF=(document.getElementById('cost-dept-filter')||{}).value||'';
  var periodF=(document.getElementById('cost-period-filter')||{}).value||'semana';
  var t=today();
  var fromD=periodF==='mes'?startOfMonth():periodF==='hoy'?t:periodF==='todo'?'2020-01-01':startOfWeek();
  var employees=await getDB('employees');
  var shifts=await getDB('shifts');
  var filtShifts=shifts.filter(function(s){return s.fecha>=fromD&&s.fecha<=t;});
  var costMap={};
  employees.filter(function(e){return e.estado==='Activo'&&(!deptF||e.area===deptF);}).forEach(function(e){
    costMap[e.id]={nombre:e.nombre,puesto:e.puesto,area:e.area,ch:parseFloat(e.coste)||0,h:0,n:0};
  });
  filtShifts.forEach(function(s){
    if(!costMap[s.employee_id]) return;
    costMap[s.employee_id].h+=parseFloat(s.horas)||0;
    costMap[s.employee_id].n++;
  });
  var rows=Object.values(costMap).sort(function(a,b){return (b.ch*b.h)-(a.ch*a.h)||b.n-a.n;});
  if(!rows.length){el.innerHTML='<div class="empty"><div class="empty-text">Sin datos en el periodo</div></div>';return;}
  var totH=rows.reduce(function(s,e){return s+e.h;},0);
  var totC=rows.reduce(function(s,e){return s+e.ch*e.h;},0);
  var depts={};
  rows.forEach(function(e){if(!depts[e.area])depts[e.area]={h:0,c:0};depts[e.area].h+=e.h;depts[e.area].c+=e.ch*e.h;});
  var trs=rows.map(function(e){
    var ct=e.ch*e.h;
    var noC=e.ch===0;
    return '<tr>'
      +'<td><div style="font-weight:600">'+e.nombre+'</div><div style="font-size:11px;color:var(--text3)">'+e.puesto+'</div></td>'
      +'<td><span class="badge '+(e.area==='Sala'?'b-blue':e.area==='Cocina'?'b-orange':'b-gray')+'">'+e.area+'</span></td>'
      +'<td style="text-align:center;font-family:var(--font-mono)">'+e.n+'</td>'
      +'<td style="text-align:center;font-family:var(--font-mono)">'+e.h.toFixed(1)+'h</td>'
      +'<td style="text-align:right;font-family:var(--font-mono)">'+(noC?'<span style="color:var(--amber)">⚠ Sin coste</span>':e.ch.toFixed(2)+'€/h')+'</td>'
      +'<td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:#3b82f6">'+(noC?'—':ct.toFixed(2)+'€')+'</td>'
      +'</tr>';
  }).join('');
  var subs=Object.entries(depts).map(function(kv){
    return '<tr style="background:var(--bg3)">'
      +'<td colspan="3" style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.1em">SUBTOTAL '+kv[0].toUpperCase()+'</td>'
      +'<td style="text-align:center;font-family:var(--font-mono);font-weight:700">'+kv[1].h.toFixed(1)+'h</td>'
      +'<td></td>'
      +'<td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:#3b82f6">'+kv[1].c.toFixed(2)+'€</td>'
      +'</tr>';
  }).join('');
  el.innerHTML='<div style="overflow-x:auto"><table>'
    +'<tr><th>Empleado</th><th>Dept.</th><th style="text-align:center">Turnos</th><th style="text-align:center">Horas</th><th style="text-align:right">€/hora</th><th style="text-align:right">Coste</th></tr>'
    +trs+subs
    +'<tr style="background:var(--bg2);border-top:2px solid var(--border)">'
    +'<td colspan="3" style="font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:.1em">TOTAL GENERAL</td>'
    +'<td style="text-align:center;font-family:var(--font-mono);font-weight:700">'+totH.toFixed(1)+'h</td>'
    +'<td></td>'
    +'<td style="text-align:right;font-family:var(--font-mono);font-size:16px;font-weight:700;color:#3b82f6">'+totC.toFixed(2)+'€</td>'
    +'</tr></table>'
    +(rows.some(function(e){return e.ch===0;})?'<div style="font-size:11px;color:var(--amber);margin-top:8px;font-family:var(--font-mono)">⚠ Algunos empleados sin coste/hora — edítalos en Maestro.</div>':'')
    +'</div>';
}

function fixLeadingZeros(el) {
  var v=el.value;
  if(v.length>1&&v[0]==='0'&&v[1]!=='.'){el.value=parseFloat(v)||0;}
}

function switchDept(newDept) {
  if(!currentUser) return;
  currentUser.area=newDept;
  currentUser._activeDept=newDept;
  var badge=document.getElementById('topbar-dept-badge');
  if(badge){
    badge.textContent=newDept.toUpperCase();
    badge.style.color=newDept==='Recepción'?'#8b5cf6':newDept==='Sala'?'#3b82f6':newDept==='Cocina'?'#f59e0b':'#2ec4b6';
    badge.style.borderColor=badge.style.color;
  }
  var ds=document.getElementById('dept-switcher');
  if(ds) ds.value=newDept;
  buildNav();
  showScreen('turno');
  setTimeout(function(){initTurnoForm();},150);
  toast('Departamento: '+newDept,'ok');
}

function bCajaEstado(e){
  if(e==='Pendiente Sala'||e==='Pendiente validación'||e==='Pendiente') return '<span class="badge b-gray">● Pendiente Sala</span>';
  if(e==='Revisado Sala'||e==='Cuadrado Sala') return '<span class="badge b-blue">✓ Revisado Sala</span>';
  if(e==='Pendiente PMS') return '<span class="badge b-orange">⏳ Pendiente PMS</span>';
  if(e==='Confirmado PMS') return '<span class="badge b-green">✓ Confirmado PMS</span>';
  if(e==='Validado final') return '<span class="badge b-green" style="font-weight:700;">✓✓ Validado Final</span>';
  if(e==='A revisar') return '<span class="badge b-red">↩ A revisar</span>';
  return '<span class="badge b-gray">'+e+'</span>';
}

async function reabrirCierre(cajaId) {
  var motivo=prompt('Motivo para reabrir el cierre (obligatorio):');
  if(!motivo||!motivo.trim()){toast('Motivo obligatorio para reabrir','err');return;}
  var res=await fetch(
    SUPABASE_URL+'/rest/v1/sala_cash_closures?id=eq.'+encodeURIComponent(cajaId),
    {method:'PATCH',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
     body:JSON.stringify({estado:'A revisar'})}
  );
  if(res.ok){
    await auditLog('REABRIR_CIERRE','Cierre '+cajaId+' reabierto por '+currentUser.nombre+' — '+motivo);
    invalidateCache('sala_cash_closures');
    toast('Cierre reabierto — estado: A revisar','ok');
    await renderValCajaList();
  } else {toast('Error al reabrir cierre','err');}
}

async function openPostErrorModal(shiftId) {
  window._postErrorShiftId=shiftId;
  var empSel=document.getElementById('posterr-emp');
  if(empSel){
    empSel.innerHTML='<option value="">— Sin responsable específico —</option>';
    var emps=await getDB('employees');
    emps.filter(function(e){return e.estado==='Activo';}).forEach(function(e){
      var o=document.createElement('option');o.value=e.id;o.textContent=e.nombre+' ('+e.puesto+')';o.style.background='#ffffff';o.style.color='#111827';
      empSel.appendChild(o);
    });
  }
  ['posterr-tipo','posterr-sev','posterr-comentario'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  toggleState.posterr_fio=null;
  ['posterr-fio-si','posterr-fio-no'].forEach(function(id){var el=document.getElementById(id);if(el)el.className='tbtn';});
  document.getElementById('modal-post-error').classList.add('open');
}

async function savePostError() {
  var shiftId=window._postErrorShiftId;
  if(!shiftId){toast('Error: sin turno seleccionado','err');return;}
  var comentario=(document.getElementById('posterr-comentario')||{}).value||'';
  if(!comentario.trim()){toast('Comentario obligatorio','err');return;}
  var fio=toggleState.posterr_fio==='si';
  var tipo=(document.getElementById('posterr-tipo')||{}).value||'';
  var sev=(document.getElementById('posterr-sev')||{}).value||'';
  var empEl=document.getElementById('posterr-emp');
  var empId=empEl?empEl.value:'';
  var empNombre=empEl&&empEl.selectedOptions[0]?empEl.selectedOptions[0].textContent:'';
  var shifts=await getDB('shifts');
  var s=shifts.find(function(x){return x.id===shiftId;});
  if(!s){toast('Turno no encontrado','err');return;}
  var newFio=fio||s.fio===true||s.fio===1;
  await dbUpdate('shifts',shiftId,{
    fio:newFio, tipo_error:tipo||s.tipo_error, gravedad_error:sev||s.gravedad_error,
    error_employee_id:empId||s.error_employee_id,
    error_employee_nombre:empNombre!==s.nombre?empNombre:(s.error_employee_nombre||empNombre),
    estado:newFio?'Validado con FIO':s.estado,
    comentario_validador:s.comentario_validador?s.comentario_validador+' | ERROR POSTERIOR: '+comentario:'ERROR POSTERIOR: '+comentario,
    updated_at:new Date().toISOString()
  });
  invalidateCache('shifts');
  await auditLog('POST_ERROR_ADDED','Error posterior añadido a turno '+shiftId+' por '+currentUser.nombre+' — '+comentario);
  closeModal('modal-post-error');
  toast('Error posterior registrado','ok');
  await renderValidacion();
}

function updatePortalClock(){
  var el=document.getElementById('portal-clock');
  if(!el) return;
  var d=new Date();
  var days=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  el.textContent=days[d.getDay()]+' '+d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+' · '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

function _pClk(){ updatePortalClock(); setInterval(updatePortalClock,30000); }

async function deleteShift(shiftId){
  if(currentUser.rol!=='admin') return;
  if(!confirm('¿Eliminar este registro permanentemente?')) return;
  const allMerma=await getDB('merma');
  for(const m of allMerma){if(m.shift_id===shiftId) await dbDelete('merma',m.id);}
  const allIncis=await getDB('incidencias');
  for(const i of allIncis){if(i.shift_id===shiftId) await dbDelete('incidencias',i.id);}
  await dbDelete('shifts',shiftId);
  invalidateCache('shifts');invalidateCache('merma');invalidateCache('incidencias');
  await auditLog('DELETE_SHIFT','Admin deleted shift '+shiftId);
  toast('Registro eliminado','ok');
  await renderValidacion();
}

async function openShiftDetail(shiftId){
  const shifts=await getDB('shifts');
  const s=shifts.find(x=>x.id===shiftId);
  if(!s) return;
  const mermas=(await getDB('merma')).filter(m=>m.shift_id===shiftId);
  const incis=(await getDB('incidencias')).filter(i=>i.shift_id===shiftId);
  const allTareas=(await getDB('tareas')).filter(t=>t.shift_id===shiftId);
  var html='';
  html+='<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">';
  html+='<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:10px;">DATOS DEL TURNO</div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
  html+='<div><span style="color:var(--text3)">Empleado: </span><strong>'+s.nombre+'</strong></div>';
  html+='<div><span style="color:var(--text3)">Puesto: </span>'+s.puesto+'</div>';
  html+='<div><span style="color:var(--text3)">Fecha: </span><strong>'+fmtDate(s.fecha)+'</strong></div>';
  html+='<div><span style="color:var(--text3)">Servicio: </span><strong>'+displayServicio(s.servicio)+'</strong></div>';
  html+='<div><span style="color:var(--text3)">Horas: </span><strong>'+s.horas+'h</strong></div>';
  html+='<div><span style="color:var(--text3)">Responsable: </span>'+(s.responsable_nombre||'—')+'</div>';
  if(s.observacion) html+='<div style="grid-column:span 2"><span style="color:var(--text3)">Observación: </span>'+s.observacion+'</div>';
  html+='</div></div>';
  if(mermas.length>0){
    html+='<div style="background:var(--bg2);border:1px solid var(--amber);border-radius:8px;padding:14px;margin-bottom:12px;">';
    html+='<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.15em;margin-bottom:10px;">MERMA ('+mermas.length+' líneas)</div>';
    mermas.forEach(function(m){
      html+='<div style="font-size:13px;display:flex;gap:16px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">';
      html+='<strong>'+m.producto+'</strong>';
      html+='<span style="color:var(--text3)">'+m.cantidad+' '+m.unidad+'</span>';
      html+='<span class="badge b-yellow">'+m.causa+'</span>';
      if(m.coste_total>0) html+='<span style="color:var(--orange);font-family:var(--font-mono);">'+m.coste_total.toFixed(2)+'€</span>';
      html+='</div>';
    });
    html+='</div>';
  }
  document.getElementById('mv-info').innerHTML=html;
  document.getElementById('mv-costes').innerHTML='';
  document.getElementById('val-comentario').value='';
  document.getElementById('mv-title').textContent=s.nombre+' — '+fmtDate(s.fecha)+' — '+displayServicio(s.servicio);
  document.querySelectorAll('.modal-footer .btn-warn,.modal-footer .btn-danger,.modal-footer .btn-success').forEach(function(b){b.style.display='none';});
  document.getElementById('modal-validar').classList.add('open');
}
