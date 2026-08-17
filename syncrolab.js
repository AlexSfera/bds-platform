// ═══════════════════════════════════════════════════════════════════════
// SYNCROLAB.JS — CAJA SYNCROLAB (Nubimed/Clínica + VirtuGym/Fitness)
// Patrón traspaso/cierre como Sala. 2 cajas físicas de efectivo + 2 sistemas.
// Reglas: Tarde cierra · domingo (cualquier turno) cierra · Mañana entre semana solo traspasa.
// Una operación por turno+fecha. Traspaso solo efectivo, sin retiro.
// Tabla: syncrolab_cash_closures. Requiere SUPABASE_URL/KEY, genId, localTs,
// today, currentUser, _doSaveTurno, auditLog, invalidateCache, dbGetAll, toast (globales).
// ═══════════════════════════════════════════════════════════════════════
var LAB_TABLE = 'syncrolab_cash_closures';
var _labSubmitting = false; // anti doble-click
var LAB_CHARGES_TABLE = 'syncrolab_room_charges';
var _labTipoTurno = null;
var _labTraspasoEditId = null;
var _labCierreEditId = null;
var _labPrevEstado = null; // estado del registro al abrir en edición
var _labCharges = [];   // cargos a habitación vía MEWS (pendientes de conciliar en Recepción)

// ── Editor de cargos a habitación (MEWS) ─────────────────────────────────
function renderLabCharges(containerId){
  var c = document.getElementById(containerId);
  if(!c) return;
  if(!_labCharges.length){
    c.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:6px 0;">Sin cargos a habitación. Añade uno si SYNCROLAB cobra contra la factura de un huésped vía MEWS.</div>';
    return;
  }
  // Listado de habitaciones disponibles
  var _habNums = [];
  var _r; for(_r=101;_r<=117;_r++) _habNums.push(_r);
  for(_r=201;_r<=217;_r++) _habNums.push(_r);
  for(_r=301;_r<=312;_r++) _habNums.push(_r);
  var habOptsBase = '<option value="">— Hab. —</option>' + _habNums.map(function(n){ return '<option value="'+n+'">'+n+'</option>'; }).join('');

  var rows = _labCharges.map(function(ch, i){
    var habOpts = _habNums.map(function(n){
      return '<option value="'+n+'"'+(String(ch.habitacion)===String(n)?' selected':'')+'>'+n+'</option>';
    }).join('');
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">'
      + '<select onchange="_labChargeSet('+i+',\'sistema\',this.value)" style="color:#111827;background:#fff;padding:5px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;">'
        + '<option value="Nubimed"'+(ch.sistema==='Nubimed'?' selected':'')+'>Nubimed</option>'
        + '<option value="VirtuGym"'+(ch.sistema==='VirtuGym'?' selected':'')+'>VirtuGym</option>'
      + '</select>'
      + '<select onchange="_labChargeSet('+i+',\'habitacion\',this.value)" style="color:#111827;background:#fff;padding:5px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;width:80px;">'
        + '<option value=""'+(!(ch.habitacion)?' selected':'')+'>— Hab. —</option>'
        + habOpts
      + '</select>'
      + '<input type="text" placeholder="Huésped" value="'+(ch.huesped||'')+'" oninput="_labInputFilter(this,\'letters\','+i+',\'huesped\',\''+containerId+'\')" style="width:120px;color:#111827;background:#fff;padding:5px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;">'
      + '<input type="text" placeholder="Concepto" value="'+(ch.concepto||'')+'" oninput="_labInputFilter(this,\'letters\','+i+',\'concepto\',\''+containerId+'\')" style="flex:1;min-width:120px;color:#111827;background:#fff;padding:5px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;">'
      + '<input type="text" inputmode="decimal" placeholder="€" value="'+(ch.importe||'')+'" oninput="_labInputFilter(this,\'decimal\','+i+',\'importe\',\''+containerId+'\')" style="width:70px;color:#111827;background:#fff;padding:5px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;">'
      + '<button onclick="_labChargeDel('+i+',\''+containerId+'\')" style="background:var(--red);color:#fff;border:none;border-radius:5px;width:28px;height:28px;cursor:pointer;font-weight:700;">×</button>'
      + '<div style="display:flex;align-items:center;gap:4px;width:100%;margin-top:4px;">'
        + '<label style="font-size:11px;color:var(--text3);white-space:nowrap;">Foto:</label>'
        + (ch.imagen_url
          ? '<span id="lab-ch-foto-st-'+i+'"><a href="'+ch.imagen_url+'" target="_blank" rel="noopener"><img src="'+ch.imagen_url+'" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border);vertical-align:middle;"></a></span>'
            + ' <button onclick="_labChargePhotoDel('+i+',\''+containerId+'\')" style="background:transparent;border:none;color:var(--red);font-size:11px;cursor:pointer;text-decoration:underline;">Quitar</button>'
          : '<input type="file" accept="image/*" capture="environment" onchange="_labChargePhotoUpload(this,'+i+',\''+containerId+'\')" style="font-size:11px;max-width:180px;">'
            + '<span id="lab-ch-foto-st-'+i+'"></span>'
        )
      + '</div>'
      + '</div>';
  }).join('');
  var total = _labCharges.reduce(function(s,ch){ return s + (parseFloat(ch.importe)||0); }, 0);
  c.innerHTML = rows + '<div id="lab-total-'+containerId+'" style="text-align:right;font-size:12px;font-family:var(--font-mono);color:var(--text2);margin-top:4px;">Total cargos a habitación: <b>'+total.toFixed(2).replace('.',',')+' €</b></div>';
}
function _labChargeAdd(containerId){
  var defSys = _labTipoTurno ? 'Nubimed' : 'Nubimed';
  _labCharges.push({ sistema:'Nubimed', habitacion:'', huesped:'', concepto:'', importe:'' });
  renderLabCharges(containerId);
}
function _labChargeSet(i, k, v){ if(_labCharges[i]) _labCharges[i][k] = v; }
function _labChargeDel(i, containerId){ _labCharges.splice(i,1); renderLabCharges(containerId); }

// ── Actualiza solo el total sin re-renderizar las filas ──────────────────
function _labUpdateTotal(containerId){
  var total = _labCharges.reduce(function(s,ch){ return s + (parseFloat(ch.importe)||0); }, 0);
  var el = document.getElementById('lab-total-'+containerId);
  if(el) el.innerHTML = 'Total cargos a habitación: <b>'+total.toFixed(2).replace('.',',')+' €</b>';
}
// ── Filtro de entrada: letters = solo letras/espacios; decimal = solo números ──
function _labInputFilter(el, mode, idx, key, containerId){
  if(mode === 'letters'){
    el.value = el.value.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g,'');
  }
  if(mode === 'decimal'){
    el.value = el.value.replace(',', '.');  // FIX: coma española → punto decimal
    el.value = el.value.replace(/[^0-9.]/g,'');
    var p = el.value.split('.');
    if(p.length > 2) el.value = p[0]+'.'+p.slice(1).join('');
  }
  _labChargeSet(idx, key, el.value);
  if(key === 'importe') _labUpdateTotal(containerId);
}

// ── Foto por línea de cargo (P28) ──────────────────────────────────────
async function _labChargePhotoUpload(inputEl, idx, containerId){
  if(!inputEl.files || !inputEl.files.length) return;
  var file = inputEl.files[0];
  if(!file.type.startsWith('image/')){ toast('Solo imágenes','err'); inputEl.value=''; return; }
  if(file.size > 5*1024*1024){ toast('Máximo 5 MB por foto','err'); inputEl.value=''; return; }
  var statusEl = document.getElementById('lab-ch-foto-st-'+idx);
  if(statusEl) statusEl.innerHTML = '<span style="color:var(--text3);font-size:11px;">Subiendo…</span>';
  try {
    var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'').substring(0,60);
    var path = 'charges/' + genId() + '_' + safeName;
    var res = await syncroSupabaseFetch(SUPABASE_URL + '/storage/v1/object/syncrolab/' + encodeURIComponent(path), {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': file.type, 'x-upsert': 'true' },
      body: file
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    var publicUrl = SUPABASE_URL + '/storage/v1/object/public/syncrolab/' + path;
    if(_labCharges[idx]) _labCharges[idx].imagen_url = publicUrl;
    if(statusEl) statusEl.innerHTML = '<a href="'+publicUrl+'" target="_blank" rel="noopener"><img src="'+publicUrl+'" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border);vertical-align:middle;"></a>';
  } catch(e) {
    if(statusEl) statusEl.innerHTML = '<span style="color:var(--red);font-size:11px;">Error</span>';
    toast('Error al subir foto del cargo: '+e.message,'err');
  }
}
function _labChargePhotoDel(idx, containerId){
  if(_labCharges[idx]) _labCharges[idx].imagen_url = null;
  renderLabCharges(containerId);
}

function _labChargesValid(){
  // cada cargo debe tener habitación, concepto e importe > 0
  for(var i=0;i<_labCharges.length;i++){
    var ch=_labCharges[i];
    if(!(ch.habitacion||'').trim() || !(ch.concepto||'').trim() || isNaN(parseFloat(ch.importe)) || parseFloat(ch.importe)<=0) return false;
  }
  return true;
}
async function _labSaveCharges(syncrolabCashId, fecha){
  if(!_labCharges.length) return;
  var ts = localTs();
  var url = SUPABASE_URL + '/rest/v1/' + LAB_CHARGES_TABLE;
  for(var i=0;i<_labCharges.length;i++){
    var ch = _labCharges[i];
    var rec = {
      id: genId(), syncrolab_cash_id: syncrolabCashId, fecha: fecha,
      sistema: ch.sistema || 'Nubimed', habitacion: (ch.habitacion||'').trim(),
      huesped_nombre: (ch.huesped||'').trim(), concepto: (ch.concepto||'').trim(),
      importe: parseFloat(ch.importe)||0,
      imagen_url: ch.imagen_url || null,
      solicitado_por_id: currentUser.id, solicitado_por_nombre: currentUser.nombre,
      estado: 'pendiente', created_at: ts, updated_at: ts
    };
    await syncroSupabaseFetch(url, { method:'POST', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify(rec) });
  }
  invalidateCache(LAB_CHARGES_TABLE);
}

function _labEsDomingo(fechaStr){
  // fechaStr 'YYYY-MM-DD' → true si es domingo
  try { var d = new Date((fechaStr||today())+'T12:00:00'); return d.getDay() === 0; } catch(e){ return false; }
}
function _labPuedeCerrar(turno, fecha){
  if(currentUser && currentUser.rol === 'admin') return true;
  if(_labEsDomingo(fecha)) return true;   // domingo turno único cierra
  return turno === 'Tarde';
}

function _labCurrentTurno(){
  var sel = document.querySelector('input[name="servicio-lab"]:checked');
  if(sel) return sel.value;
  // FEAT-TURNO-AUTO (spec 22): radios ocultos/sin marcar → turno automático
  // por hora de cierre (Mañana fin 16:30 · Tarde fin 19:30/21:15).
  // lockLabTurnoIfCajaToday sigue teniendo prioridad (marca el radio).
  if(typeof autoAssignTurno === 'function' && currentUser){
    var a = autoAssignTurno(currentUser.area, currentUser.puesto);
    if(a) return a.turno;
  }
  return null;
}

async function getLabOpToday(turno){
  var rows = [];
  try { rows = await dbGetAll(LAB_TABLE); } catch(e){ rows = []; }
  var t = today();
  return rows.find(function(r){ return r.fecha === t && r.turno === turno; }) || null;
}

// ── Mi Turno: fijar turno si ya hizo caja hoy ────────────────────────────
async function lockLabTurnoIfCajaToday(){
  if(!currentUser) return;
  var rows = [];
  try { rows = await dbGetAll(LAB_TABLE); } catch(e){ return; }
  var t = today();
  var mine = rows.find(function(r){ return r.fecha === t && r.responsable_id === currentUser.id; });
  if(!mine || !mine.turno) return;
  document.querySelectorAll('input[name="servicio-lab"]').forEach(function(r){
    r.checked = (r.value === mine.turno); r.disabled = true;
  });
  var lab = document.getElementById('t-servicio-lab');
  if(lab && !document.getElementById('lab-turno-locked-msg')){
    var note = document.createElement('div');
    note.id = 'lab-turno-locked-msg';
    note.style.cssText = 'font-size:12px;color:var(--text3);margin-top:8px;font-family:var(--font-mono);width:100%;';
    note.textContent = '🔒 Turno fijado a ' + mine.turno + ' — ya registraste ' +
      (mine.tipo === 'traspaso' ? 'un traspaso' : 'un cierre') + ' de caja hoy.';
    lab.parentElement.appendChild(note);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL ELECCIÓN
// ═══════════════════════════════════════════════════════════════════════
function openLabCajaChoice(){
  _labTipoTurno = _labCurrentTurno();
  var fixedBox = document.getElementById('lab-tipo-turno-fixed');
  var pickBox  = document.getElementById('lab-tipo-turno-pick');
  var lblFixed = document.getElementById('lab-tipo-turno-label');
  document.querySelectorAll('#lab-tipo-turno-pick .tbtn').forEach(function(b){ b.classList.remove('t-si'); });
  if(_labTipoTurno){
    if(fixedBox) fixedBox.style.display = 'block';
    if(pickBox)  pickBox.style.display  = 'none';
    if(lblFixed) lblFixed.textContent   = _labTipoTurno + (_labEsDomingo() ? ' (domingo)' : '');
  } else {
    if(fixedBox) fixedBox.style.display = 'none';
    if(pickBox)  pickBox.style.display  = 'block';
  }
  var msg = document.getElementById('lab-tipo-msg');
  if(msg) msg.textContent = _labTipoTurno ? '' : 'Selecciona tu turno para continuar';
  setLabTipoBtns(false, false);
  setLabSkipBtn('none');
  var m = document.getElementById('modal-lab-tipo');
  if(m) m.style.display = 'flex';
  if(_labTipoTurno) evalLabCajaChoice();
}
function closeLabCajaChoice(){
  var m = document.getElementById('modal-lab-tipo');
  if(m) m.style.display = 'none';
}
function setLabTipoTurno(t, btn){
  _labTipoTurno = t;
  if(btn && btn.parentElement){
    btn.parentElement.querySelectorAll('.tbtn').forEach(function(b){ b.classList.remove('t-si'); });
    btn.classList.add('t-si');
  }
  evalLabCajaChoice();
}
function setLabTipoBtns(traspasoOn, cierreOn){
  var bt = document.getElementById('lab-tipo-btn-traspaso');
  var bc = document.getElementById('lab-tipo-btn-cierre');
  if(bt){ bt.disabled = !traspasoOn; bt.style.opacity = traspasoOn?'1':'.4'; bt.style.cursor = traspasoOn?'pointer':'not-allowed'; }
  if(bc){ bc.disabled = !cierreOn;   bc.style.opacity = cierreOn?'1':'.4';   bc.style.cursor = cierreOn?'pointer':'not-allowed'; }
}
function setLabSkipBtn(mode, opTipo){
  var b = document.getElementById('lab-tipo-btn-skip');
  if(!b) return;
  b.style.display = 'block';
  if(mode === 'self') b.textContent = '✓ Cerrar turno — ' + (opTipo === 'traspaso' ? 'traspaso' : 'cierre') + ' de caja ya registrado por ti';
  else b.textContent = '✓ Cerrar turno sin caja (la gestiona mi compañero/a)';
}
async function evalLabCajaChoice(){
  var msg = document.getElementById('lab-tipo-msg');
  if(!_labTipoTurno){ setLabTipoBtns(false, false); return; }
  setLabTipoBtns(false, false);
  if(msg){ msg.textContent = 'Comprobando operaciones de hoy...'; msg.style.color = 'var(--text3)'; }
  var isAdminU = currentUser && currentUser.rol === 'admin';
  var dup = await getLabOpToday(_labTipoTurno);
  var dupEsMia = dup && (dup.responsable_id === currentUser.id);
  if(dup && dupEsMia && !isAdminU){
    if(msg){ msg.textContent = '✓ Ya registraste tu ' + (dup.tipo === 'traspaso' ? 'traspaso' : 'cierre') + ' de caja en el turno ' + _labTipoTurno + '. Cierra el turno para terminar.'; msg.style.color = 'var(--green)'; }
    setLabTipoBtns(false, false); setLabSkipBtn('self', dup.tipo); return;
  }
  if(dup && !dupEsMia && !isAdminU){
    if(msg){ msg.textContent = '⛔ El turno '+_labTipoTurno+' ya registró '+(dup.tipo==='traspaso'?'un traspaso':'un cierre')+' hoy ('+(dup.responsable_nombre||'')+'). Cierra el turno sin caja.'; msg.style.color = 'var(--red)'; }
    setLabTipoBtns(false, false); setLabSkipBtn('mate'); return;
  }
  setLabSkipBtn('none');
  var puedeCerrar = _labPuedeCerrar(_labTipoTurno, today());
  setLabTipoBtns(true, puedeCerrar);
  if(msg){
    if(dup && isAdminU){ msg.textContent = '⚠ Ya existe una operación de este turno hoy. Como admin puedes duplicar — revisa antes de guardar.'; msg.style.color = 'var(--amber)'; }
    else if(!puedeCerrar){ msg.textContent = 'Turno '+_labTipoTurno+': solo traspaso. El cierre lo hace el turno de Tarde (o el turno único del domingo).'; msg.style.color = 'var(--text3)'; }
    else { msg.textContent = ''; }
  }
}
function startLabTraspaso(){
  var b = document.getElementById('lab-tipo-btn-traspaso');
  if(b && b.disabled) return;
  if(!_labTipoTurno){ toast('Selecciona tu turno','err'); return; }
  closeLabCajaChoice();
  openLabTraspasoModal();
}
function startLabCierre(){
  var b = document.getElementById('lab-tipo-btn-cierre');
  if(b && b.disabled) return;
  if(!_labTipoTurno){ toast('Selecciona tu turno','err'); return; }
  closeLabCajaChoice();
  openLabCierreModal();
}
async function skipLabCajaOp(){
  var turno = _labTipoTurno || _labCurrentTurno() || '—';
  closeLabCajaChoice();
  // FIX-CIERRE-01: antes un fallo aquí moría en silencio (sin toast, sin logout, turno sin cerrar)
  try { await _doSaveTurno(); }
  catch(e){ console.error('[LAB] cierre de turno falló', e); toast('⛔ No se pudo cerrar el turno: '+(e && e.message ? e.message : e), 'err'); return; }
  var dup = await getLabOpToday(turno);
  var dupEsMia = dup && (dup.responsable_id === currentUser.id);
  if(dupEsMia){ toast('Turno cerrado — caja ya registrada', 'ok'); }
  else { if(typeof auditLog === 'function') auditLog('LAB_CAJA_SKIP', currentUser.nombre+' cerró turno SYNCROLAB '+turno+' sin operación de caja ('+today()+')'); toast('Turno cerrado sin operación de caja', 'ok'); }
  _labAutoLogout();
}

function _labAutoLogout(){
  if(typeof autoLogoutAfterCaja === 'function') autoLogoutAfterCaja();
  else setTimeout(function(){ if(typeof logout === 'function') logout(); }, 1200);
}

// ── helpers de lectura/escritura DB ──────────────────────────────────────
async function _labSave(record, editId){
  var url = SUPABASE_URL + '/rest/v1/' + LAB_TABLE;
  var method = editId ? 'PATCH' : 'POST';
  var fetchUrl = editId ? url + '?id=eq.' + encodeURIComponent(editId) : url;
  var res = await syncroSupabaseFetch(fetchUrl, {
    method: method,
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(record)
  });
  if(!res.ok) throw new Error('HTTP '+res.status+' '+(await res.text()));
  invalidateCache(LAB_TABLE);
}

// ═══════════════════════════════════════════════════════════════════════
// TRASPASO (solo efectivo · 2 cajas: Nubimed + VirtuGym · sin retiro)
// ═══════════════════════════════════════════════════════════════════════
function openLabTraspasoModal(existingId){
  _labTraspasoEditId = existingId || null;
  ['lab-tras-nub-ventas','lab-tras-nub-real','lab-tras-vg-ventas','lab-tras-vg-real','lab-tras-dif-exp','lab-tras-comentario'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  ['lab-tras-nub-fondo','lab-tras-vg-fondo'].forEach(function(id){ var el = document.getElementById(id); if(el) el.value = '0.00'; });
  var difBlock = document.getElementById('lab-tras-dif-block');
  if(difBlock) difBlock.style.display = 'none';
  var errEl = document.getElementById('lab-tras-err'); if(errEl) errEl.textContent = '';
  var label = document.getElementById('lab-tras-turno-label');

  _labCharges = []; renderLabCharges('lab-tras-charges');
  if(!existingId){
    if(label) label.textContent = _labTipoTurno || '—';
    invalidateCache(LAB_TABLE);
    dbGetAll(LAB_TABLE).then(function(rows){
      var sorted = rows.slice().sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||'') || (b.created_at||'').localeCompare(a.created_at||''); });
      var ultimoNub = sorted.find(function(r){ return r.efectivo_traspasado_nubimed != null || r.fondo_recibido_nubimed != null; });
      var ultimoVg  = sorted.find(function(r){ return r.efectivo_traspasado_virtugym != null || r.fondo_recibido_virtugym != null; });
      var fN = document.getElementById('lab-tras-nub-fondo');
      var fV = document.getElementById('lab-tras-vg-fondo');
      if(fN && ultimoNub) fN.value = parseFloat(ultimoNub.efectivo_traspasado_nubimed || 0).toFixed(2);
      if(fV && ultimoVg) fV.value = parseFloat(ultimoVg.efectivo_traspasado_virtugym || 0).toFixed(2);
      if(!ultimoNub && !ultimoVg){
        var av = document.getElementById('lab-tras-aviso');
        if(av){ av.style.display='block'; av.textContent = 'No hay fondo recibido desde turno anterior. Revisa con responsable.'; }
      }
      calcLabTraspaso();
    });
  } else {
    dbGetAll(LAB_TABLE).then(function(rows){
      var row = rows.find(function(r){ return r.id === existingId; }); if(!row) return;
      _labPrevEstado = row.estado || null;
      _labTipoTurno = row.turno || _labTipoTurno;
      if(label) label.textContent = _labTipoTurno || '—';
      function set(id,v){ var el=document.getElementById(id); if(el&&v!=null) el.value=v; }
      set('lab-tras-nub-fondo', (parseFloat(row.fondo_recibido_nubimed)||0).toFixed(2));
      set('lab-tras-nub-ventas', row.efectivo_nubimed_sistema);
      set('lab-tras-nub-real', row.efectivo_nubimed_real);
      set('lab-tras-vg-fondo', (parseFloat(row.fondo_recibido_virtugym)||0).toFixed(2));
      set('lab-tras-vg-ventas', row.efectivo_virtugym_sistema);
      set('lab-tras-vg-real', row.efectivo_virtugym_real);
      set('lab-tras-comentario', row.comentario_traspaso);
      set('lab-tras-dif-exp', row.explicacion_diferencia);
      calcLabTraspaso();
      // Cargar cargos MEWS vinculados
      dbGetAll(LAB_CHARGES_TABLE).then(function(charges){
        _labCharges = charges.filter(function(c){ return c.syncrolab_cash_closure_id === existingId || c.cash_closure_id === existingId; });
        renderLabCharges('lab-tras-charges');
      });
    });
  }
  var m = document.getElementById('modal-lab-traspaso'); if(m) m.style.display = 'flex';
}
function closeLabTraspasoModal(){ var m = document.getElementById('modal-lab-traspaso'); if(m) m.style.display = 'none'; }

function calcLabTraspaso(){
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  var nFondo=gv('lab-tras-nub-fondo'), nVentas=gv('lab-tras-nub-ventas');
  var vFondo=gv('lab-tras-vg-fondo'),  vVentas=gv('lab-tras-vg-ventas');
  // Esperado por caja = fondo + ventas efectivo (sin retiro)
  var nEsp = nFondo + nVentas, vEsp = vFondo + vVentas;
  var espN=document.getElementById('lab-tras-nub-esperado'); if(espN) espN.textContent = nEsp.toFixed(2).replace('.',',')+' €';
  var espV=document.getElementById('lab-tras-vg-esperado');  if(espV) espV.textContent = vEsp.toFixed(2).replace('.',',')+' €';
  // Real a traspasar por caja
  var nReal=gv('lab-tras-nub-real'), vReal=gv('lab-tras-vg-real');
  var totalTras = nReal + vReal;
  var totEl=document.getElementById('lab-tras-total'); if(totEl) totEl.textContent = totalTras.toFixed(2).replace('.',',')+' €';
  // Diferencia total (real − esperado de ambas)
  var dif = (nReal - nEsp) + (vReal - vEsp);
  var difEl=document.getElementById('lab-tras-dif'); var difBlock=document.getElementById('lab-tras-dif-block');
  var nRealRaw=(document.getElementById('lab-tras-nub-real')||{value:''}).value;
  var vRealRaw=(document.getElementById('lab-tras-vg-real')||{value:''}).value;
  if(nRealRaw==='' && vRealRaw===''){ if(difEl){ difEl.textContent='—'; difEl.style.color='var(--text3)'; } if(difBlock) difBlock.style.display='none'; return; }
  var cuadrado = Math.abs(dif) < 0.01;
  if(difEl){ difEl.textContent = cuadrado ? '✓ Fondo cuadrado' : '⚠ Diferencia fondo: '+(dif>=0?'+':'')+dif.toFixed(2).replace('.',',')+'€'; difEl.style.color = cuadrado?'var(--green)':'var(--red)'; }
  if(difBlock) difBlock.style.display = cuadrado ? 'none' : 'block';
}

async function submitLabTraspaso(){
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value); }
  var errs=[];
  var turno=_labTipoTurno||_labCurrentTurno()||'';
  var nFondo=gv('lab-tras-nub-fondo')||0, nVentas=gv('lab-tras-nub-ventas'), nReal=gv('lab-tras-nub-real');
  var vFondo=gv('lab-tras-vg-fondo')||0,  vVentas=gv('lab-tras-vg-ventas'),  vReal=gv('lab-tras-vg-real');
  if(!turno) errs.push('Selecciona turno');
  if(isNaN(nVentas)||nVentas<0) errs.push('Ventas efectivo Nubimed obligatorio (0 si no hubo)');
  if(isNaN(nReal)) errs.push('Efectivo real Nubimed obligatorio');
  if(isNaN(vVentas)||vVentas<0) errs.push('Ventas efectivo VirtuGym obligatorio (0 si no hubo)');
  if(isNaN(vReal)) errs.push('Efectivo real VirtuGym obligatorio');
  var nEsp=nFondo+(nVentas||0), vEsp=vFondo+(vVentas||0);
  var dif=((nReal||0)-nEsp)+((vReal||0)-vEsp);
  var exp=(document.getElementById('lab-tras-dif-exp')||{value:''}).value.trim();
  if(!isNaN(nReal)&&!isNaN(vReal)&&Math.abs(dif)>0.01&&!exp) errs.push('Fondo no cuadrado: explicación obligatoria');
  if(!_labChargesValid()) errs.push('Cada cargo a habitación necesita habitación, concepto e importe');
  var errEl=document.getElementById('lab-tras-err');
  if(errs.length){ if(errEl) errEl.textContent=errs.join(' · '); toast(errs[0],'err'); return; }
  if(errEl) errEl.textContent='';
  if(!_labTraspasoEditId){
    var dup=await getLabOpToday(turno);
    if(dup){
      if(currentUser.rol==='admin'){
        if(!confirm('⚠ Ya existe un '+(dup.tipo==='traspaso'?'traspaso':'cierre')+' para turno '+turno+' hoy.\n\n¿Seguro que quieres crear OTRO registro?')) return;
      } else {
        var m='El turno '+turno+' ya registró '+(dup.tipo==='traspaso'?'un traspaso':'un cierre')+' hoy. Solo una operación por turno.'; if(errEl) errEl.textContent=m; toast(m,'err'); return;
      }
    }
  }
  if(_labSubmitting){ toast('Guardando…','info'); return; } _labSubmitting=true;
  var ts=localTs();
  var totalTras=(nReal||0)+(vReal||0);
  var record={
    id:_labTraspasoEditId||genId(), shift_id:window._lastSavedShiftId||null,
    fecha:today(), turno:turno, tipo:'traspaso',
    responsable_id:currentUser.id, responsable_nombre:currentUser.nombre,
    fondo_recibido_nubimed:nFondo, efectivo_nubimed_sistema:nVentas, efectivo_nubimed_real:nReal,
    fondo_recibido_virtugym:vFondo, efectivo_virtugym_sistema:vVentas, efectivo_virtugym_real:vReal,
    efectivo_traspasado_nubimed:nReal, efectivo_traspasado_virtugym:vReal, efectivo_total_traspasado:totalTras,
    empleado_entrega_id:currentUser.id, empleado_entrega_nombre:currentUser.nombre,
    comentario_traspaso:(document.getElementById('lab-tras-comentario')||{value:''}).value.trim()||null,
    diferencia_total_syncrolab:dif,
    explicacion_diferencia:exp||null,
    estado:(_labTraspasoEditId && _labPrevEstado==='correccion') ? 'corregido' : 'pendiente_validacion', updated_at:ts
  };
  if(!_labTraspasoEditId) record.created_at=ts;
  // FIX-CIERRE-02: al editar, NO sobrescribir identidad del registro (fecha/turno/responsable).
  // Bug confirmado: editar una caja antigua le ponía fecha=today() y bloqueaba el turno de ese día.
  if(_labTraspasoEditId){ delete record.fecha; delete record.turno; delete record.shift_id; delete record.responsable_id; delete record.responsable_nombre; delete record.empleado_entrega_id; delete record.empleado_entrega_nombre; }
  try{
    await _labSave(record,_labTraspasoEditId);
    if(!_labTraspasoEditId) await _labSaveCharges(record.id, record.fecha);
    if(typeof auditLog==='function') auditLog(_labTraspasoEditId?'LAB_TRASPASO_EDIT':'LAB_TRASPASO_SAVE', currentUser.nombre+' '+(_labTraspasoEditId?'editó':'traspasó')+' caja SYNCROLAB '+today()+' turno '+turno+' · total '+totalTras.toFixed(2).replace('.',',')+'€'+(_labCharges.length?' · '+_labCharges.length+' cargo(s) habitación':''));
    await _doSaveTurno();
    closeLabTraspasoModal();
    toast('Caja SYNCROLAB guardada correctamente y pendiente de validación.','ok');
    if(typeof renderLabCajaList==='function') renderLabCajaList();
    _labAutoLogout();
  }catch(e){ if(errEl) errEl.textContent='Error al guardar: '+e.message; toast('Error al guardar traspaso','err'); }finally{ _labSubmitting=false; }
}

// ═══════════════════════════════════════════════════════════════════════
// CIERRE (2 sistemas · efectivo/tarjeta/Stripe/transferencia · diferencia = real − sistema)
// ═══════════════════════════════════════════════════════════════════════
var _LAB_C_FIELDS = ['efectivo','tarjeta','stripe','transferencia'];
function _labCG(sys, campo, tipo){ return parseFloat((document.getElementById('lab-c-'+sys+'-'+campo+'-'+tipo)||{}).value)||0; }

function openLabCierreModal(existingId){
  _labCierreEditId = existingId || null;
  window._cajaCorrectMode = false;
  ['nub','vg'].forEach(function(sys){
    _LAB_C_FIELDS.forEach(function(c){
      ['sistema','real'].forEach(function(t){ var el=document.getElementById('lab-c-'+sys+'-'+c+'-'+t); if(el) el.value=''; });
    });
  });
  var fN=document.getElementById('lab-c-nub-fondo'); if(fN) fN.value='0.00';
  var fV=document.getElementById('lab-c-vg-fondo');  if(fV) fV.value='0.00';
  var exp=document.getElementById('lab-c-dif-exp'); if(exp) exp.value='';
  var difBlock=document.getElementById('lab-c-dif-block'); if(difBlock) difBlock.style.display='none';
  var errEl=document.getElementById('lab-c-err'); if(errEl) errEl.textContent='';
  var label=document.getElementById('lab-c-turno-label'); if(label) label.textContent=_labTipoTurno||'—';
  _labCharges = []; renderLabCharges('lab-c-charges');
  if(typeof resetCajaFotos === 'function') resetCajaFotos('lab-c-fotos', []);

  if(!existingId){
    invalidateCache(LAB_TABLE);
    dbGetAll(LAB_TABLE).then(function(rows){
      var sorted=rows.slice().sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||'')||(b.created_at||'').localeCompare(a.created_at||''); });
      var uN=sorted.find(function(r){ return r.efectivo_traspasado_nubimed!=null||r.fondo_recibido_nubimed!=null; });
      var uV=sorted.find(function(r){ return r.efectivo_traspasado_virtugym!=null||r.fondo_recibido_virtugym!=null; });
      if(fN&&uN) fN.value=parseFloat(uN.efectivo_traspasado_nubimed||0).toFixed(2);
      if(fV&&uV) fV.value=parseFloat(uV.efectivo_traspasado_virtugym||0).toFixed(2);
      calcLabCierre();
    });
  } else {
    dbGetAll(LAB_TABLE).then(function(rows){
      var row=rows.find(function(r){ return r.id===existingId; }); if(!row) return;
      _labPrevEstado = row.estado || null;
      _labTipoTurno=row.turno||_labTipoTurno; if(label) label.textContent=_labTipoTurno||'—';
      function set(id,v){ var el=document.getElementById(id); if(el&&v!=null) el.value=v; }
      set('lab-c-nub-fondo',(parseFloat(row.fondo_recibido_nubimed)||0).toFixed(2));
      set('lab-c-vg-fondo',(parseFloat(row.fondo_recibido_virtugym)||0).toFixed(2));
      ['nub','vg'].forEach(function(sys){
        var pre = sys==='nub'?'nubimed':'virtugym';
        _LAB_C_FIELDS.forEach(function(c){
          set('lab-c-'+sys+'-'+c+'-sistema', row[c+'_'+pre+'_sistema']);
          set('lab-c-'+sys+'-'+c+'-real',    row[c+'_'+pre+'_real']);
        });
      });
      set('lab-c-dif-exp', row.explicacion_diferencia);
      if(typeof resetCajaFotos === 'function'){
        var _ex = Array.isArray(row.imagenes_adjuntas) ? row.imagenes_adjuntas.map(function(u){ return {url:u, name:'foto'}; }) : [];
        resetCajaFotos('lab-c-fotos', _ex);
      }
      calcLabCierre();
      // Cargar cargos MEWS vinculados
      dbGetAll(LAB_CHARGES_TABLE).then(function(charges){
        _labCharges = charges.filter(function(c){ return c.syncrolab_cash_closure_id === existingId || c.cash_closure_id === existingId; });
        renderLabCharges('lab-c-charges');
      });
    });
  }
  var m=document.getElementById('modal-lab-cierre'); if(m) m.style.display='flex';
}
function closeLabCierreModal(){ var m=document.getElementById('modal-lab-cierre'); if(m) m.style.display='none'; }

function calcLabCierre(){
  var difTotalGeneral=0;
  ['nub','vg'].forEach(function(sys){
    var difSys=0;
    _LAB_C_FIELDS.forEach(function(c){
      var d=_labCG(sys,c,'real')-_labCG(sys,c,'sistema');
      var cell=document.getElementById('lab-c-'+sys+'-'+c+'-dif');
      if(cell){ cell.textContent=(d>=0?'+':'')+d.toFixed(2).replace('.',',')+'€'; cell.style.color=Math.abs(d)<0.01?'var(--green)':'var(--red)'; }
      difSys+=d;
    });
    var difSysEl=document.getElementById('lab-c-'+sys+'-dif-total');
    if(difSysEl){ difSysEl.textContent=(difSys>=0?'+':'')+difSys.toFixed(2).replace('.',',')+'€'; difSysEl.style.color=Math.abs(difSys)<0.01?'var(--green)':'var(--red)'; }
    difTotalGeneral+=difSys;
  });
  var totEl=document.getElementById('lab-c-dif-total-syncrolab');
  if(totEl){ totEl.textContent=(difTotalGeneral>=0?'+':'')+difTotalGeneral.toFixed(2).replace('.',',')+' €'; totEl.style.color=Math.abs(difTotalGeneral)<0.01?'var(--green)':'var(--red)'; }
  var difBlock=document.getElementById('lab-c-dif-block');
  if(difBlock) difBlock.style.display = Math.abs(difTotalGeneral)<0.01 ? 'none' : 'block';
}

async function corregirCajaLab(id){
  if(typeof canCorrectCaja!=='function' || !canCorrectCaja('SYNCROLAB')){ toast('Sin permiso para corregir esta caja','err'); return; }
  var nota = prompt('Nota de corrección (obligatoria):');
  if(nota===null) return;
  if(!nota.trim()){ toast('La nota de corrección es obligatoria','err'); return; }
  openLabCierreModal(id);
  window._cajaCorrectMode = true; window._cajaCorrectNote = nota.trim();
  toast('Modo corrección: edita los importes y guarda. La caja seguirá validada.','ok');
}
window.corregirCajaLab = corregirCajaLab;

async function submitLabCierre(){
  var _isCorrection = window._cajaCorrectMode; window._cajaCorrectMode = false;
  var _corrNote = window._cajaCorrectNote || ''; window._cajaCorrectNote = '';
  var turno=_labTipoTurno||_labCurrentTurno()||'';
  var errEl=document.getElementById('lab-c-err'); if(errEl) errEl.textContent='';
  if(!turno){ if(errEl) errEl.textContent='Selecciona turno'; toast('Selecciona turno','err'); return; }
  if(!_labCierreEditId && currentUser.rol!=='admin' && !_labPuedeCerrar(turno,today())){
    var mc='El turno '+turno+' no puede cerrar caja. Haz un traspaso.'; if(errEl) errEl.textContent=mc; toast(mc,'err'); return;
  }
  if(!_labCierreEditId){
    var dup=await getLabOpToday(turno);
    if(dup){
      if(currentUser.rol==='admin'){
        if(!confirm('⚠ Ya existe un '+(dup.tipo==='traspaso'?'traspaso':'cierre')+' para turno '+turno+' hoy.\n\n¿Seguro que quieres crear OTRO registro?')) return;
      } else {
        var md='El turno '+turno+' ya registró '+(dup.tipo==='traspaso'?'un traspaso':'un cierre')+' hoy. Solo una operación por turno.'; if(errEl) errEl.textContent=md; toast(md,'err'); return;
      }
    }
  }
  if(_labSubmitting){ toast('Guardando…','info'); return; } _labSubmitting=true;
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  var rec={};
  ['nub','vg'].forEach(function(sys){
    var pre=sys==='nub'?'nubimed':'virtugym';
    var difSys=0,totSis=0,totReal=0;
    _LAB_C_FIELDS.forEach(function(c){
      var s=_labCG(sys,c,'sistema'), r=_labCG(sys,c,'real'), d=r-s;
      rec[c+'_'+pre+'_sistema']=s; rec[c+'_'+pre+'_real']=r; rec['diferencia_'+c+'_'+pre]=d;
      difSys+=d; totSis+=s; totReal+=r;
    });
    rec['diferencia_total_'+pre]=difSys;
    rec['total_sistema_'+pre]=totSis; rec['total_real_'+pre]=totReal;
    rec['fondo_recibido_'+pre]=gv('lab-c-'+sys+'-fondo');
  });
  rec.total_sistema_syncrolab=rec.total_sistema_nubimed+rec.total_sistema_virtugym;
  rec.total_real_syncrolab=rec.total_real_nubimed+rec.total_real_virtugym;
  rec.diferencia_total_syncrolab=rec.total_real_syncrolab-rec.total_sistema_syncrolab;

  var exp=(document.getElementById('lab-c-dif-exp')||{value:''}).value.trim();
  if(Math.abs(rec.diferencia_total_syncrolab)>0.01 && !exp){ if(errEl) errEl.textContent='Hay diferencia: la explicación es obligatoria.'; toast('Explica la diferencia','err'); return; }
  if(!_labChargesValid()){ if(errEl) errEl.textContent='Cada cargo a habitación necesita habitación, concepto e importe.'; toast('Revisa los cargos a habitación','err'); return; }

  var ts=localTs();
  Object.assign(rec,{
    id:_labCierreEditId||genId(), shift_id:window._lastSavedShiftId||null,
    fecha:today(), turno:turno, tipo:'cierre',
    responsable_id:currentUser.id, responsable_nombre:currentUser.nombre,
    explicacion_diferencia:exp||null,
    imagenes_adjuntas:(typeof getCajaFotosUrls==='function' ? getCajaFotosUrls('lab-c-fotos') : []),
    estado:(_labCierreEditId && _labPrevEstado==='correccion') ? 'corregido' : 'pendiente_validacion', updated_at:ts
  });
  if(!_labCierreEditId) rec.created_at=ts;
  // FIX-CIERRE-02: al editar, NO sobrescribir identidad del registro (fecha/turno/responsable).
  // Bug confirmado: editar una caja antigua le ponía fecha=today() y bloqueaba el turno de ese día.
  if(_labCierreEditId){ delete rec.fecha; delete rec.turno; delete rec.shift_id; delete rec.responsable_id; delete rec.responsable_nombre; }
  if(_isCorrection){ rec.corregida=true; rec.corrected_by=currentUser.nombre; rec.corrected_at=ts; rec.correction_note=_corrNote||null; if(_labPrevEstado==='validado') rec.estado='validado'; }
  try{
    await _labSave(rec,_labCierreEditId);
    if(!_labCierreEditId) await _labSaveCharges(rec.id, rec.fecha);
    if(typeof auditLog==='function') auditLog(_labCierreEditId?'LAB_CAJA_EDIT':'LAB_CAJA_SAVE', currentUser.nombre+' '+(_labCierreEditId?'editó':'cerró')+' caja SYNCROLAB '+today()+' turno '+turno+' · Δ '+rec.diferencia_total_syncrolab.toFixed(2).replace('.',',')+'€'+(_labCharges.length?' · '+_labCharges.length+' cargo(s) habitación':''));
    await _doSaveTurno();
    closeLabCierreModal();
    toast('Caja SYNCROLAB guardada correctamente y pendiente de validación.','ok');
    if(typeof renderLabCajaList==='function') renderLabCajaList();
    _labAutoLogout();
  }catch(e){ if(errEl) errEl.textContent='Error al guardar: '+e.message; toast('Error al guardar cierre','err'); }finally{ _labSubmitting=false; }
}

// ═══════════════════════════════════════════════════════════════════════
// INYECCIÓN DE MODALES (patrón caja.js)
// ═══════════════════════════════════════════════════════════════════════
(function injectLabHTML(){
  function _campoCierre(sys, c, label){
    return '<tr>'
      + '<td style="padding:4px 6px;font-size:12px;color:var(--text2);">'+label+'</td>'
      + '<td style="padding:4px;"><input type="text" inputmode="decimal" id="lab-c-'+sys+'-'+c+'-sistema" placeholder="0.00" oninput="calcLabCierre()" style="width:90px;color:#111827;background:#fff;padding:5px;border:1px solid #d1d5db;border-radius:5px;"></td>'
      + '<td style="padding:4px;"><input type="text" inputmode="decimal" id="lab-c-'+sys+'-'+c+'-real" placeholder="0.00" oninput="calcLabCierre()" style="width:90px;color:#111827;background:#fff;padding:5px;border:1px solid #d1d5db;border-radius:5px;"></td>'
      + '<td id="lab-c-'+sys+'-'+c+'-dif" style="padding:4px 6px;font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text3);">—</td>'
      + '</tr>';
  }
  function _bloqueCierre(sys, titulo, color){
    return '<div style="border:1px solid '+color+';border-radius:10px;padding:14px;margin-bottom:14px;">'
      + '<div style="font-weight:700;color:'+color+';margin-bottom:8px;">'+titulo+'</div>'
      + '<div class="fg" style="margin-bottom:8px;"><label>Fondo recibido (€)</label><input type="text" id="lab-c-'+sys+'-fondo" value="0.00" readonly style="color:#111827;background:#fff;opacity:.6;cursor:not-allowed;width:120px;"></div>'
      + '<table style="width:100%;border-collapse:collapse;"><tr style="font-size:10px;color:var(--text3);text-transform:uppercase;"><th style="text-align:left;padding:2px 6px;"></th><th style="text-align:left;padding:2px;">Según sistema</th><th style="text-align:left;padding:2px;">Real contado</th><th style="text-align:left;padding:2px 6px;">Δ</th></tr>'
      + _campoCierre(sys,'efectivo','Efectivo')
      + _campoCierre(sys,'tarjeta','Tarjeta / TPV')
      + _campoCierre(sys,'stripe','Stripe')
      + _campoCierre(sys,'transferencia','Transferencia')
      + '</table>'
      + '<div style="text-align:right;margin-top:8px;font-size:12px;font-family:var(--font-mono);">Δ '+titulo+': <span id="lab-c-'+sys+'-dif-total" style="font-weight:700;color:var(--text3);">0.00€</span></div>'
      + '</div>';
  }

  var html = `
<!-- ══ SYNCROLAB · MODAL ELECCIÓN ══ -->
<div id="modal-lab-tipo" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:710;padding:16px;">
  <div style="background:var(--bg2);border:2px solid #a855f7;border-radius:14px;padding:24px;width:100%;max-width:460px;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#a855f7;letter-spacing:.2em;margin-bottom:6px;">SYNCROLAB · OPERACIÓN DE CAJA</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">¿Traspaso o cierre de caja?</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">Dos cajas: Nubimed/Clínica y VirtuGym/Fitness. El cierre lo hace el turno de Tarde (o el turno único del domingo). Mañana entre semana solo traspasa. Una operación por turno y día.</div>
    <div class="fg" id="lab-tipo-turno-fixed" style="margin-bottom:12px;display:none;"><label>Turno</label><div id="lab-tipo-turno-label" style="font-size:16px;font-weight:700;color:var(--text);padding:8px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;">—</div></div>
    <div class="fg" id="lab-tipo-turno-pick" style="margin-bottom:12px;display:none;"><label>Turno <span class="req">*</span></label><div style="font-size:11px;color:var(--text3);margin:2px 0 6px;">Indica tu turno:</div><div style="display:flex;gap:8px;"><button class="tbtn" onclick="setLabTipoTurno('Mañana',this)">🌅 Mañana</button><button class="tbtn" onclick="setLabTipoTurno('Tarde',this)">🌆 Tarde</button></div></div>
    <div id="lab-tipo-msg" style="font-size:12px;color:var(--text3);min-height:18px;margin-bottom:12px;font-family:var(--font-mono);"></div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="lab-tipo-btn-traspaso" onclick="startLabTraspaso()" disabled style="width:100%;padding:14px;background:#0891b2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">🔁 Traspaso de caja al siguiente turno</button>
      <button id="lab-tipo-btn-cierre" onclick="startLabCierre()" disabled style="width:100%;padding:14px;background:#a855f7;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">💰 Cierre de caja (Tarde / domingo)</button>
      <button id="lab-tipo-btn-skip" onclick="skipLabCajaOp()" style="width:100%;padding:12px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">✓ Cerrar turno sin caja (la gestiona mi compañero/a)</button>
      <button onclick="closeLabCajaChoice()" style="width:100%;padding:10px;background:transparent;color:var(--text3);border:none;font-size:13px;font-weight:600;cursor:pointer;">Cancelar</button>
    </div>
  </div>
</div>

<!-- ══ SYNCROLAB · MODAL TRASPASO (2 cajas efectivo, sin retiro) ══ -->
<div id="modal-lab-traspaso" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;">
  <div style="background:var(--bg2);border:2px solid #0891b2;border-radius:14px;padding:24px;width:100%;max-width:560px;margin:40px auto;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#0891b2;letter-spacing:.2em;margin-bottom:6px;">SYNCROLAB · TRASPASO DE CAJA</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">Traspaso — <span id="lab-tras-turno-label">Turno</span></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:14px;">Traspaso solo de efectivo de las dos cajas. Sin retiro. El fondo recibido viene del último cierre/traspaso (no editable).</div>
    <div id="lab-tras-aviso" style="display:none;background:rgba(245,158,11,.1);border:1px solid var(--amber);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:12px;"></div>
    <div style="border:1px solid #6366f1;border-radius:10px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#6366f1;margin-bottom:8px;">🩺 Nubimed / Clínica</div>
      <div class="fg" style="margin-bottom:6px;"><label>Fondo recibido (€)</label><input type="text" id="lab-tras-nub-fondo" value="0.00" readonly style="color:#111827;background:#fff;opacity:.6;cursor:not-allowed;width:120px;"></div>
      <div class="fg" style="margin-bottom:6px;"><label>Ventas efectivo Nubimed (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="lab-tras-nub-ventas" placeholder="0.00" oninput="calcLabTraspaso()" style="color:#111827;background:#fff;"></div>
      <div class="fg" style="margin-bottom:6px;"><label>Efectivo real a traspasar (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="lab-tras-nub-real" placeholder="0.00" oninput="calcLabTraspaso()" style="color:#111827;background:#fff;"></div>
      <div style="font-size:11px;font-family:var(--font-mono);color:var(--text3);">Esperado: <span id="lab-tras-nub-esperado" style="color:var(--green);font-weight:700;">0.00 €</span></div>
    </div>
    <div style="border:1px solid #10b981;border-radius:10px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#10b981;margin-bottom:8px;">🏋 VirtuGym / Fitness</div>
      <div class="fg" style="margin-bottom:6px;"><label>Fondo recibido (€)</label><input type="text" id="lab-tras-vg-fondo" value="0.00" readonly style="color:#111827;background:#fff;opacity:.6;cursor:not-allowed;width:120px;"></div>
      <div class="fg" style="margin-bottom:6px;"><label>Ventas efectivo VirtuGym (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="lab-tras-vg-ventas" placeholder="0.00" oninput="calcLabTraspaso()" style="color:#111827;background:#fff;"></div>
      <div class="fg" style="margin-bottom:6px;"><label>Efectivo real a traspasar (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="lab-tras-vg-real" placeholder="0.00" oninput="calcLabTraspaso()" style="color:#111827;background:#fff;"></div>
      <div style="font-size:11px;font-family:var(--font-mono);color:var(--text3);">Esperado: <span id="lab-tras-vg-esperado" style="color:var(--green);font-weight:700;">0.00 €</span></div>
    </div>
    <div style="text-align:right;font-size:14px;font-family:var(--font-mono);margin-bottom:8px;">Total efectivo traspasado: <span id="lab-tras-total" style="font-weight:700;color:var(--text);">0.00 €</span></div>
    <div id="lab-tras-dif" style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;">—</div>
    <div id="lab-tras-dif-block" style="display:none;"><div class="fg" style="margin-bottom:8px;"><label>Explicación de la diferencia <span class="req">*</span></label><textarea id="lab-tras-dif-exp" rows="2" style="color:#111827;background:#fff;"></textarea></div></div>
    <div style="border:1px dashed #f59e0b;border-radius:10px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-weight:700;color:#f59e0b;font-size:13px;">🏨 Cargos a habitación (MEWS)</div>
        <button onclick="_labChargeAdd('lab-tras-charges')" style="background:#f59e0b;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">+ Añadir cargo</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Lo que SYNCROLAB cobra contra la factura de un huésped. Recepción lo carga en MEWS y lo confirma en su cierre. No cuenta como efectivo de tu caja.</div>
      <div id="lab-tras-charges"></div>
    </div>
    <div class="fg" style="margin-bottom:8px;"><label>Comentario del traspaso</label><input type="text" id="lab-tras-comentario" placeholder="Opcional" style="color:#111827;background:#fff;"></div>
    <div id="lab-tras-err" style="color:var(--red);font-size:12px;min-height:18px;margin-bottom:8px;font-family:var(--font-mono);"></div>
    <div style="display:flex;gap:8px;"><button onclick="closeLabTraspasoModal()" style="flex:1;padding:12px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-weight:600;cursor:pointer;">Cancelar</button><button onclick="submitLabTraspaso()" style="flex:2;padding:12px;background:#0891b2;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">💾 Guardar traspaso</button></div>
  </div>
</div>

<!-- ══ SYNCROLAB · MODAL CIERRE (2 sistemas completos) ══ -->
<div id="modal-lab-cierre" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;">
  <div style="background:var(--bg2);border:2px solid #a855f7;border-radius:14px;padding:24px;width:100%;max-width:640px;margin:40px auto;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#a855f7;letter-spacing:.2em;margin-bottom:6px;">SYNCROLAB · CIERRE DE CAJA</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">Cierre — <span id="lab-c-turno-label">Turno</span></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">Rellena primero Nubimed/Clínica y luego VirtuGym/Fitness. La diferencia se calcula sola (real − sistema).</div>
    ${_bloqueCierre('nub','🩺 Nubimed / Clínica','#6366f1')}
    ${_bloqueCierre('vg','🏋 VirtuGym / Fitness','#10b981')}
    <div style="border:1px dashed #f59e0b;border-radius:10px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-weight:700;color:#f59e0b;font-size:13px;">🏨 Cargos a habitación (MEWS)</div>
        <button onclick="_labChargeAdd('lab-c-charges')" style="background:#f59e0b;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">+ Añadir cargo</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Cobros contra factura de huésped. Recepción los carga en MEWS y los confirma. No cuentan como ingreso de tu caja.</div>
      <div id="lab-c-charges"></div>
    </div>
    <div style="text-align:right;font-size:15px;font-family:var(--font-mono);margin-bottom:8px;border-top:1px solid var(--border);padding-top:10px;">Diferencia total SYNCROLAB: <span id="lab-c-dif-total-syncrolab" style="font-weight:700;color:var(--text3);">0.00 €</span></div>
    <div id="lab-c-dif-block" style="display:none;"><div class="fg" style="margin-bottom:8px;"><label>Explicación de la diferencia <span class="req">*</span></label><textarea id="lab-c-dif-exp" rows="2" style="color:#111827;background:#fff;"></textarea></div></div>
    <div id="lab-c-err" style="color:var(--red);font-size:12px;min-height:18px;margin-bottom:8px;font-family:var(--font-mono);"></div>
    <div class="fg" style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;color:var(--text2);margin-bottom:4px;">Fotos adjuntas (tickets, TPV, incidencias…) — varias permitidas</label>
      <input type="file" id="lab-c-fotos-input" accept="image/*" capture="environment" multiple onchange="handleCajaFotosInput(this,'lab-c-fotos','syncrolab')" style="color:var(--text);font-size:13px;padding:6px 0;">
      <div id="lab-c-fotos-status" style="font-size:11px;color:var(--text3);font-family:var(--font-mono);margin-top:4px;"></div>
      <div id="lab-c-fotos-thumbs" style="margin-top:6px;"></div>
    </div>
    <div style="display:flex;gap:8px;"><button onclick="closeLabCierreModal()" style="flex:1;padding:12px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-weight:600;cursor:pointer;">Cancelar</button><button onclick="submitLabCierre()" style="flex:2;padding:12px;background:#a855f7;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">💾 Guardar cierre</button></div>
  </div>
</div>`;
  var div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
})();
