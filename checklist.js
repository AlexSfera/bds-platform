// ═══════════════════════════════════════════════════
// CHECKLIST — Funciones compartidas por todos los departamentos
// Depende de: shared.js
// ═══════════════════════════════════════════════════

var _chkState = [];
var _chkSavedState = [];
var _chkPendingData = null;

// ── DATOS CHECKLIST COCINA ──
var CHK_COCINA_ITEMS = ['Camaras y cuarto frio revisados','Temperaturas de camaras y congeladores OK','Producto sin fecha / en mal estado retirado','Buffet gestionado correctamente','Vitrina gestionada correctamente (montaje + retirada)','No quedan comandas pendientes','Fuegos, horno, plancha, freidoras apagados','Gas cerrado','Extractor / campana apagados','Fogones limpios sin grasa','Bancadas limpias','Paredes sin grasa visible','Faltas de stock anotadas'];
var CHK_COCINA_SECTIONS = [{title:'APPCC Y PRODUCTO',count:3},{title:'BUFFET Y VITRINA',count:2},{title:'MAQUINARIA Y SEGURIDAD',count:4},{title:'LIMPIEZA COCINA',count:3},{title:'STOCK',count:1}];

// ── DATOS CHECKLIST FRIEGUE ──
var CHK_FRIEGUE_ITEMS = ['Suelos fregados correctamente','Bancadas limpias','Paredes limpias','Fregaderos / pilas vacios y limpios','Tablas de corte limpias y desinfectadas','Utensilios limpios y colocados','Basuras retiradas','Cubos limpios','Bolsas repuestas','Carton y vidrio retirados','Camaras y zonas ordenadas','Producto colocado correctamente','Bayetas preparadas correctamente','Panos en cesta de ropa sucia','Material de limpieza limpio y colocado'];
var CHK_FRIEGUE_SECTIONS = [{title:'LIMPIEZA GENERAL',count:3},{title:'UTENSILIOS Y ZONAS',count:3},{title:'BASURA Y RESIDUOS',count:4},{title:'ORGANIZACION',count:2},{title:'MATERIAL DE LIMPIEZA',count:3}];

// ── DATOS CHECKLIST SALA ──
var CHK_SALA_ITEMS = ['Sala montada correctamente','Terraza revisada','Barra limpia y operativa','Reservas revisadas y confirmadas','Material suficiente (cuberteria, menaje, servilletas)','Cartas / QR disponibles','Comandas pendientes revisadas','Comunicacion con cocina correcta','Incidencias comunicadas al responsable','Quejas de cliente registradas si existieron','Descuentos comunicados al responsable','Anulaciones comunicadas al responsable','Invitaciones y cortesias comunicadas','TPV operativo al cierre','Mesas limpias y montadas para siguiente servicio','Terraza recogida','Barra recogida y limpia','Material repuesto','Tareas creadas si procede','Turno listo para validacion'];
var CHK_SALA_SECTIONS = [{title:'PREPARACION DEL SERVICIO',count:6},{title:'DURANTE EL SERVICIO',count:4},{title:'CAJA Y CONTROL',count:4},{title:'CIERRE',count:6}];

// ── DATOS CHECKLIST F&B ──
var CHK_FNB_ITEMS = ['Registro de ventas del servicio completado','Caja cuadrada y cerrada correctamente','Stock de bebidas revisado','Pedidos pendientes anotados','Incidencias con clientes registradas','Sala recogida y en orden','Personal de sala informado de novedades','Reservas del siguiente servicio revisadas'];
var CHK_FNB_SECTIONS = [{title:'CONTROL ADMINISTRATIVO',count:4},{title:'OPERACIONES SALA Y SERVICIO',count:4}];

// ── DATOS CHECKLIST RECEPCIÓN ──
var CHK_REC_MANANA_SECTIONS = [{"title":"INICIO DE TURNO","count":4},{"title":"OPERACION MEWS","count":4},{"title":"HOUSEKEEPING","count":2},{"title":"CAJA","count":4},{"title":"COMUNICACION","count":3},{"title":"CIERRE DE TURNO","count":3}];
var CHK_REC_MANANA_ITEMS = ["Fichaje realizado desde móvil","Revisado handover del turno noche","Revisadas incidencias pendientes","Revisadas tareas abiertas","Revisadas salidas del día en MEWS","Revisadas llegadas del día en MEWS","Revisados cargos pendientes antes de check-out","Revisadas pensiones / extras","Revisado estado de habitaciones con housekeeping","Comunicadas habitaciones prioritarias","Cash MEWS comparado con cash físico","Tarjeta MEWS comparada con TPV","Stripe MEWS comparado con Stripe real","Diferencias explicadas si existen","WhatsApp / email / llamadas revisadas","Incidencias registradas correctamente","Tareas necesarias creadas","Handover preparado para turno tarde","Follow-up refleja situación real","Fichaje de salida realizado desde móvil"];
var CHK_REC_TARDE_SECTIONS = [{"title":"INICIO DE TURNO","count":4},{"title":"CHECK-IN","count":8},{"title":"CAJA","count":5},{"title":"COMUNICACION","count":3},{"title":"CIERRE DE TURNO","count":3}];
var CHK_REC_TARDE_ITEMS = ["Fichaje realizado desde móvil","Revisado handover del turno mañana","Revisadas llegadas pendientes","Revisadas incidencias abiertas","Check-ins realizados con datos completos","Documento registrado correctamente","Email y teléfono registrados","Speech de instalaciones realizado","Pulsera / llave entregada correctamente","Cliente informado sobre restaurante / horarios / servicios","Peticiones especiales comunicadas","Cambios de habitación registrados en MEWS","Cash MEWS comparado con cash físico","Tarjeta MEWS comparada con TPV","Stripe MEWS comparado con Stripe real","Cobros pendientes revisados","Diferencias explicadas si existen","WhatsApp / email / llamadas revisadas","Clientes insatisfechos escalados","Tareas necesarias creadas","Handover preparado para turno noche","Follow-up refleja situación real","Fichaje de salida realizado desde móvil"];
var CHK_REC_NOCHE_SECTIONS = [{"title":"INICIO DE TURNO","count":4},{"title":"OPERACION NOCTURNA","count":6},{"title":"CAJA Y CIERRE","count":6},{"title":"PREPARACION DIA SIGUIENTE","count":3},{"title":"CIERRE FINAL","count":3}];
var CHK_REC_NOCHE_ITEMS = ["Fichaje realizado desde móvil","Revisado handover del turno tarde","Revisadas llegadas pendientes","Revisadas incidencias abiertas","Revisadas llegadas tardías","Revisados no-shows","Revisadas reservas del día siguiente","Revisadas salidas tempranas","Incidencias nocturnas registradas","Situaciones de seguridad comunicadas si aplica","Cash MEWS comparado con cash físico","Tarjeta MEWS comparada con TPV","Stripe MEWS comparado con Stripe real","Cobros pendientes revisados","Facturación pendiente identificada","Diferencias explicadas si existen","Llegadas del día siguiente revisadas","Habitaciones prioritarias identificadas","Peticiones especiales preparadas","Handover preparado para turno mañana","Follow-up refleja situación real","Fichaje de salida realizado desde móvil"];

// ── FUNCIONES ──
function chkToggle(idx){
  _chkState[idx]=!_chkState[idx];
  var b=document.getElementById('chk-'+idx);
  if(b) b.className='chk-box'+(_chkState[idx]?' checked':'');
  chkUpdateProgress();
}

function chkUpdateProgress(){
  var done=_chkState.filter(Boolean).length;
  var total=_chkState.length;
  var pct=total>0?Math.round(done/total*100):0;
  var bar=document.getElementById('chk-bar');
  if(bar) bar.style.width=pct+'%';
  var btn=document.getElementById('chk-confirm-btn');
  var warn=document.getElementById('chk-warn');
  if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.cursor='pointer';}
  if(warn){
    warn.style.display='block';
    if(done===total){warn.style.color='var(--green)';warn.textContent='Completo: '+done+'/'+total;}
    else{warn.style.color='var(--text3)';warn.textContent=done+' de '+total+' marcados. Puedes enviar igualmente.';}
  }
}

function chkClose(){
  var m=document.getElementById('modal-checklist');
  if(m) m.classList.remove('open');
  _chkPendingData=null;
}

async function chkConfirm(){
  _chkSavedState=_chkState.slice();
  var m=document.getElementById('modal-checklist');
  if(m) m.classList.remove('open');
  var isSala=currentUser&&currentUser.area==='Sala';
  var isRec=currentUser&&(currentUser.area==='Recepción'||currentUser._activeDept==='Recepción');
  if(isSala&&currentUser._activeDept!=='Recepción'){
    if(typeof openSalaCajaChoice === 'function') openSalaCajaChoice();
    else openCajaOfferModal();
  } else if(isRec || currentUser._activeDept === 'Recepción'){
    openRecKpiModal();
  } else {
    await _doSaveTurno();
  }
}

function buildChkHTML(sections,items){
  var html='',idx=0;
  sections.forEach(function(s,si){
    html+='<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:.12em;color:#2ec4b6;text-transform:uppercase;margin:'+(si===0?'0':'10px')+' 0 8px;">'+s.title+'</div>';
    for(var i=0;i<s.count;i++){
      html+='<div class="chk-item" onclick="chkToggle('+idx+')">'
        +'<div class="chk-box" id="chk-'+idx+'"></div>'
        +'<div class="chk-text">'+items[idx]+'</div>'
        +'</div>';
      idx++;
    }
  });
  return html;
}

function chkOpen(pendingData){
  _chkPendingData=pendingData;
  var isFriegue=(currentUser&&(currentUser.area==='Friegue'||currentUser.puesto==='Friegue'));
  var isSala=(currentUser&&currentUser.area==='Sala');
  var isFnB=(currentUser&&(currentUser.rol==='fb'||currentUser.area==='F&B'));
  var isRec=(currentUser&&(currentUser.area==='Recepción'||currentUser._activeDept==='Recepción'));
  var recTurno=isRec?getRecTurnoValue():'';
  var sections,items;
  if(isRec){
    if(recTurno==='Tarde'){sections=CHK_REC_TARDE_SECTIONS;items=CHK_REC_TARDE_ITEMS;}
    else if(recTurno==='Noche'){sections=CHK_REC_NOCHE_SECTIONS;items=CHK_REC_NOCHE_ITEMS;}
    else{sections=CHK_REC_MANANA_SECTIONS;items=CHK_REC_MANANA_ITEMS;}
  } else if(isFriegue){sections=CHK_FRIEGUE_SECTIONS;items=CHK_FRIEGUE_ITEMS;}
  else if(isSala){sections=CHK_SALA_SECTIONS;items=CHK_SALA_ITEMS;}
  else if(isFnB){sections=CHK_FNB_SECTIONS;items=CHK_FNB_ITEMS;}
  else{sections=CHK_COCINA_SECTIONS;items=CHK_COCINA_ITEMS;}
  _chkState=Array(items.length).fill(false);
  document.getElementById('chk-items').innerHTML=buildChkHTML(sections,items);
  var bar=document.getElementById('chk-bar');if(bar)bar.style.width='0%';
  var warn=document.getElementById('chk-warn');
  if(warn){warn.style.display='block';warn.style.color='var(--text3)';warn.textContent='0 de '+items.length+' marcados. Puedes enviar igualmente.';}
  var btn=document.getElementById('chk-confirm-btn');
  if(btn){btn.disabled=false;btn.style.opacity='1';btn.style.cursor='pointer';}
  var m=document.getElementById('modal-checklist');if(m)m.classList.add('open');
}

async function loadStaffImplicado(){
  var container=document.getElementById('staff-implicado-list');
  if(!container) return;
  var employees=await getDB('employees');
  var staff=employees.filter(function(e){
    return e.estado==='Activo'&&(e.area==='Cocina'||e.area==='Sala'||e.area==='Friegue');
  });
  if(!staff.length){container.innerHTML='<div style="font-size:12px;color:var(--text3);">Sin empleados activos en Cocina/Sala</div>';return;}
  container.innerHTML=staff.map(function(e){
    return '<label style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px;">'
      +'<input type="checkbox" value="'+e.id+'" data-nombre="'+e.nombre+'" style="width:16px;height:16px;accent-color:#2ec4b6;flex-shrink:0;">'
      +'<span><strong>'+e.nombre+'</strong> <span style="font-size:11px;color:var(--text3);">'+e.puesto+'</span></span>'
      +'</label>';
  }).join('');
}

function getStaffImplicado(){
  var container=document.getElementById('staff-implicado-list');
  if(!container) return {ids:[],nombres:[]};
  var checked=container.querySelectorAll('input[type=checkbox]:checked');
  var ids=[],nombres=[];
  checked.forEach(function(cb){ids.push(cb.value);nombres.push(cb.getAttribute('data-nombre'));});
  return {ids:ids,nombres:nombres};
}

function recalcMermaTotal(){
  var total=0;
  document.querySelectorAll('[id^="mcoste-"]').forEach(function(inp){
    if(inp.id==='mcoste-sum') return;
    var cu=parseFloat(inp.value)||0;
    var row=inp.closest('.mcoste-row');
    if(row){
      var cantEl=row.querySelector('.mcoste-cant');
      if(cantEl){total+=cu*(parseFloat(cantEl.textContent)||1);}
      else{total+=cu;}
    } else {total+=cu;}
  });
  var sumEl=document.getElementById('mcoste-sum');
  if(sumEl) sumEl.textContent=total.toFixed(2)+' €';
  var totalEl=document.getElementById('val-coste-total');
  if(totalEl&&!totalEl._userEdited) totalEl.value=total.toFixed(2);
}

async function runLocalStorageMigration(){
  const el=document.getElementById('migration-status');
  if(el) el.textContent='Migrando datos locales...';
  const count=await migrateFromLocalStorage();
  if(el) el.textContent=count>0?'✓ Migrados '+count+' registros a Supabase.':'No hay datos locales para migrar.';
  invalidateCache('employees');invalidateCache('shifts');invalidateCache('merma');invalidateCache('incidencias');invalidateCache('tareas');
  toast(count>0?'Migración completada: '+count+' registros':'Sin datos locales','ok');
}
