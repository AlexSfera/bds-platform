// ═══════════════════════════════════════════════════════════════
// VALIDACION.JS — Módulo de Validación · SYNCRO HUB
// Extraído de index.html · ARCH-01
// Contiene: validación de turnos, validación de caja,
//           portal PIN de entrada, funciones de navegación
// ═══════════════════════════════════════════════════════════════

// ── DELETE SHIFT (admin only) ──
async function deleteShift(shiftId){
  if(currentUser.rol!=='admin') return;
  if(!confirm('¿Eliminar este registro permanentemente? Esta acción no se puede deshacer.')) return;
  // Delete related merma, ajustes e incidencias
  const allMerma = await getDB('merma');
  for(const m of allMerma){ if(m.shift_id===shiftId) await dbDelete('merma',m.id); }
  const allAjustes = await getDB('ajustes');
  for(const a of allAjustes){ if(a.shift_id===shiftId) await dbDelete('ajustes',a.id); }
  const allIncis = await getDB('incidencias');
  for(const i of allIncis){ if(i.shift_id===shiftId) await dbDelete('incidencias',i.id); }
  await dbDelete('shifts',shiftId);
  invalidateCache('shifts'); invalidateCache('merma'); invalidateCache('ajustes'); invalidateCache('incidencias');
  await auditLog('DELETE_SHIFT','Admin deleted shift '+shiftId);
  toast('Registro eliminado','ok');
  await renderValidacion();
}

// ── OPEN SHIFT DETAIL (admin/chef/fb) ──
async function openShiftDetail(shiftId){
  const shifts = await getDB('shifts');
  const s = shifts.find(x=>x.id===shiftId);
  if(!s) return;
  const mermas = (await getDB('merma')).filter(m=>m.shift_id===shiftId);
  const ajustes= (await getDB('ajustes')).filter(a=>a.shift_id===shiftId);
  const incis  = (await getDB('incidencias')).filter(function(i){return recordMatchesShift(i,s);});
  const allTareas = (await getDB('tareas')).filter(function(t){return recordMatchesShift(t,s);});

  var html = '';

  // ── BLOQUE 1: Datos generales ──
  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:10px;">1 · DATOS DEL TURNO</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
  html += '<div><span style="color:var(--text3)">Empleado: </span><strong>'+formatDisplayValue(s.nombre)+'</strong></div>';
  html += '<div><span style="color:var(--text3)">Puesto: </span>'+formatDisplayValue(s.puesto)+'</div>';
  html += '<div><span style="color:var(--text3)">Fecha: </span><strong>'+fmtDate(s.fecha)+'</strong></div>';
  html += '<div><span style="color:var(--text3)">Turno: </span><strong>'+formatServiceOrTurn(s.servicio)+'</strong></div>';
  html += '<div><span style="color:var(--text3)">Horas: </span><strong>'+s.horas+'h</strong></div>';
  if(s.area!=='Recepción') html += '<div><span style="color:var(--text3)">Responsable turno: </span>'+formatDisplayValue(s.responsable_nombre)+'</div>';
  html += '<div><span style="color:var(--text3)">Estado: </span>'+bEstado(s.estado)+'</div>';
  html += '<div><span style="color:var(--text3)">Validado por: </span>'+(s.validado_por||'—')+'</div>';
  if(s.observacion) html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Observación: </span>'+s.observacion+'</div>';
  html += '</div></div>';

  // ── BLOQUE 2: Checklist ──
  if(s.checklist_items){
    try{
      var chk = JSON.parse(s.checklist_items);
      var isFriegue = s.area==='Friegue'||s.puesto==='Friegue';
      var items = isFriegue ? CHK_FRIEGUE_ITEMS : CHK_COCINA_ITEMS;
      var done = chk.filter(Boolean).length;
      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:10px;">2 · CHECKLIST ('+done+'/'+chk.length+' completados)</div>';
      html += '<div style="display:flex;flex-direction:column;gap:4px;">';
      chk.forEach(function(checked,i){
        if(i<items.length){
          html += '<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);">'
            +'<div style="width:18px;height:18px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:'+(checked?'var(--green)':'var(--bg4)')+';border:1px solid '+(checked?'var(--green)':'var(--border)')+';font-size:11px;">'+(checked?'✓':'')+'</div>'
            +'<span style="color:'+(checked?'var(--text)':'var(--text3)')+'">'+items[i]+'</span>'
            +'</div>';
        }
      });
      html += '</div></div>';
    }catch(e){}
  }

  // ── BLOQUE 3: Gestión pendiente ──
  var allGest3  = (await getDB('gestiones')).filter(function(g){ return recordMatchesShift(g,s); });
  var gestions3 = allTareas.concat(allGest3);
  var incisOp3  = incis.slice();
  if(gestions3.length>0){
    html += '<div style="background:var(--bg2);border:1px solid var(--amber);border-radius:8px;padding:14px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.15em;margin-bottom:10px;">3 · GESTIONES PENDIENTES DECLARADAS</div>';
    gestions3.forEach(function(g){
      html += '<div style="font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
      if(g.tipo_incidencia || g.origen) html += '<div><span style="color:var(--text3)">Tipo: </span><span class="badge b-yellow">'+formatDisplayValue(g.tipo_incidencia || g.origen)+'</span></div>';
      if(g.estado) html += '<div><span style="color:var(--text3)">Estado: </span>'+(g.dept_destino ? bTaskEstado(g.estado) : bIncidentEstado(g.estado))+'</div>';
      if(g.dept_destino) html += '<div><span style="color:var(--text3)">Departamento destino: </span>'+deptBadge(g.dept_destino)+'</div>';
      if(g.deadline) html += '<div><span style="color:var(--text3)">Deadline: </span>'+fmtDate(g.deadline)+'</div>';
      html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Descripción: </span><strong>'+formatDisplayValue(g.descripcion || g.titulo)+'</strong></div>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text3);">Sin gestiones pendientes declaradas</div>';
  }

  // ── BLOQUE 4: Incidencia operativa ──
  if(incisOp3.length>0){
    html += '<div style="background:var(--bg2);border:1px solid var(--red);border-radius:8px;padding:14px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--red);letter-spacing:.15em;margin-bottom:10px;">4 · INCIDENCIA OPERATIVA</div>';
    incisOp3.forEach(function(i){
      html += '<div style="font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
      if(i.tipo_incidencia) html += '<div><span style="color:var(--text3)">Tipo: </span><span class="badge b-red">'+formatDisplayValue(i.tipo_incidencia)+'</span></div>';
      html += '<div><span style="color:var(--text3)">Informado resp.: </span>'+(i.informado_responsable==='si'?'✓ Sí':'✗ No')+'</div>';
      html += '<div><span style="color:var(--text3)">Estado: </span>'+bIncidentEstado(i.estado)+'</div>';
      html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Descripción: </span><strong>'+formatDisplayValue(i.descripcion)+'</strong></div>';
      if(i.accion_inmediata) html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Acción inmediata: </span>'+formatDisplayValue(i.accion_inmediata)+'</div>';
      if(i.staff_implicado_nombres){
        try{
          var staffTxt = formatStaffList(i.staff_implicado_nombres);
          if(staffTxt !== '—'){
            html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Personas involucradas: </span>';
            html += staffTxt.split(',').map(function(n){return '<span class="badge b-yellow" style="margin-right:4px;">'+formatDisplayValue(n)+'</span>';}).join('');
            html += '</div>';
          }
        }catch(e){}
      }
      html += '</div>';
    });
    html += '</div>';
  }
  if(incisOp3.length===0){
    html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text3);">Sin incidencias operativas declaradas</div>';
  }

  // ── BLOQUE 4: Merma (solo para dptos que generan merma: Cocina/Friegue/FnB) ──
  var deptShift = (s.area || s.departamento || '').toLowerCase().trim();
  function _matchDept(arr){ return arr.some(function(d){ return deptShift === d.toLowerCase(); }); }
  var aplicaMerma   = _matchDept(['Cocina','Friegue','FnB','Food & Beverage']);
  var aplicaAjustes = _matchDept(['Sala','Recepción','Recepcion','FnB']);
  console.log('[VAL] dpto:', JSON.stringify(s.area), '| aplicaMerma:', aplicaMerma, '| aplicaAjustes:', aplicaAjustes);

  if(aplicaMerma){
    if(mermas.length>0){
      html += '<div style="background:var(--bg2);border:1px solid var(--amber);border-radius:8px;padding:14px;margin-bottom:12px;">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.15em;margin-bottom:10px;">4 · MERMA ('+mermas.length+' líneas)</div>';
      mermas.forEach(function(m){
        html += '<div style="font-size:13px;display:flex;gap:16px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">';
        html += '<strong>'+m.producto+'</strong>';
        html += '<span style="color:var(--text3)">'+m.cantidad+' '+m.unidad+'</span>';
        html += '<span class="badge b-yellow">'+m.causa+'</span>';
        if(m.coste_total>0) html += '<span style="color:var(--orange);font-family:var(--font-mono);">'+m.coste_total.toFixed(2)+'€</span>';
        if(m.obs) html += '<span style="color:var(--text3);font-size:11px;">'+m.obs+'</span>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text3);">4 · Sin merma declarada</div>';
    }
  }

  // ── BLOQUE 4B: Ajustes (solo Sala/Recepción) ──
  if(aplicaAjustes){
    if(ajustes.length>0){
      var totAj = 0;
      ajustes.forEach(function(a){ totAj += parseFloat(a.importe)||0; });
      html += '<div style="background:var(--bg2);border:1px solid #3b82f6;border-radius:8px;padding:14px;margin-bottom:12px;">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.15em;margin-bottom:10px;">4 · AJUSTES ('+ajustes.length+' líneas · total '+totAj.toFixed(2)+' €)</div>';
      ajustes.forEach(function(a){
        var col = (parseFloat(a.importe)||0) < 0 ? 'var(--red)' : 'var(--green)';
        html += '<div style="font-size:13px;display:flex;gap:16px;padding:6px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;align-items:center;">';
        html += '<strong>'+formatDisplayValue(a.tipo)+'</strong>';
        html += '<span style="color:'+col+';font-family:var(--font-mono);font-weight:600;">'+(parseFloat(a.importe)||0).toFixed(2)+' €</span>';
        if(a.motivo) html += '<span style="color:var(--text3);">'+formatDisplayValue(a.motivo)+'</span>';
        if(a.obs) html += '<span style="color:var(--text3);font-size:11px;">📝 '+formatDisplayValue(a.obs)+'</span>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text3);">4 · Sin ajustes declarados</div>';
    }
  }
  // ── BLOQUE 6: Tarea generada ──
  if(allTareas.length>0){
    html += '<div style="background:var(--bg2);border:1px solid var(--purple);border-radius:8px;padding:14px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--purple);letter-spacing:.15em;margin-bottom:10px;">5 · TAREA GENERADA</div>';
    allTareas.forEach(function(t){
      html += '<div style="font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
      html += '<div><span style="color:var(--text3)">Dpto. destino: </span>'+deptBadge(t.dept_destino)+'</div>';
      html += '<div><span style="color:var(--text3)">Prioridad: </span>'+bPrio(t.prioridad)+'</div>';
      html += '<div><span style="color:var(--text3)">Deadline: </span><strong>'+fmtDate(t.deadline)+'</strong></div>';
      html += '<div><span style="color:var(--text3)">Estado: </span>'+bTaskEstado(t.estado)+'</div>';
      html += '<div><span style="color:var(--text3)">Origen: </span>'+t.origen+'</div>';
      if(t.descripcion) html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Descripción: </span>'+t.descripcion+'</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ── BLOQUE 7: Validación supervisor ──
  if(s.validado_por || s.fio){
    html += '<div style="background:var(--bg2);border:1px solid #2ec4b6;border-radius:8px;padding:14px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:10px;">6 · VALIDACIÓN SUPERVISOR</div>';
    html += '<div style="font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    html += '<div><span style="color:var(--text3)">Validado por: </span><strong>'+(s.validado_por||'—')+'</strong></div>';
    html += '<div><span style="color:var(--text3)">Fecha: </span>'+(s.validado_ts?fmtTs(s.validado_ts):'—')+'</div>';
    if(s.fio) html += '<div style="grid-column:span 2"><span class="badge b-red">⚠ FIO — Fallo Individual Operativo</span></div>';
    if(s.tipo_error) html += '<div><span style="color:var(--text3)">Tipo error: </span><span class="badge b-orange">'+s.tipo_error+'</span></div>';
    if(s.gravedad_error) html += '<div><span style="color:var(--text3)">Severidad: </span>'+bSev(s.gravedad_error)+'</div>';
    if(s.error_employee_nombre) html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Responsable del error: </span><strong>'+s.error_employee_nombre+'</strong></div>';
    if(s.comentario_validador) html += '<div style="grid-column:span 2"><span style="color:var(--text3)">Comentario: </span><em>'+s.comentario_validador+'</em></div>';
    html += '</div></div>';
  }

  document.getElementById('mv-info').innerHTML = html;
  document.getElementById('mv-costes').innerHTML = '';
  document.getElementById('val-comentario').value = '';
  document.getElementById('mv-title').textContent = s.nombre+' — '+fmtDateTs(s.fecha,s.created_at)+' — '+displayServicio(s.servicio);
  // Hide validation action buttons - detail view only shows info
  document.querySelectorAll('.modal-footer .btn-warn, .modal-footer .btn-danger, .modal-footer .btn-success').forEach(function(b){
    b.style.display = 'none';
  });
  document.getElementById('modal-validar').classList.add('open');
}

// ── STAFF IMPLICADO (local filter — dataset already loaded in checklist.js) ──
function filterStaffList(q) {
  var dd = document.getElementById('val-fio-dropdown');
  if(!dd) return;
  var filtered = (_fioAllEmps||[]).filter(function(e){
    return e.nombre && e.nombre.toLowerCase().includes(q.toLowerCase());
  });
  if(!q || filtered.length===0){ dd.style.display='none'; return; }
  dd.innerHTML = filtered.map(function(e){
    return '<div style="padding:8px 12px;cursor:pointer;font-size:13px;" onclick="selectFioEmp('+JSON.stringify(e)+')">'+e.nombre+'</div>';
  }).join('');
  dd.style.display = 'block';
}

// ── POST-ERROR MODAL ──
async function openPostErrorModal(shiftId) {
  window._postErrorShiftId = shiftId;
  var shifts = await getDB('shifts');
  var s = shifts.find(function(x){return x.id===shiftId;});
  if(!s){toast('Turno no encontrado','err');return;}
  var titleEl=document.getElementById('pe-title');
  if(titleEl) titleEl.textContent='🔍 Revisión posterior — '+s.nombre+' — '+fmtDate(s.fecha);
  var infoEl=document.getElementById('pe-shift-info');
  if(infoEl){
    infoEl.innerHTML='<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;">'
      +'<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:8px;">DATOS DEL TURNO</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      +'<div><span style="color:var(--text3)">Empleado: </span><strong>'+formatDisplayValue(s.nombre)+'</strong></div>'
      +'<div><span style="color:var(--text3)">Fecha: </span>'+fmtDate(s.fecha)+'</div>'
      +'<div><span style="color:var(--text3)">Turno: </span>'+formatServiceOrTurn(s.servicio)+'</div>'
      +'<div><span style="color:var(--text3)">Estado: </span>'+bEstado(s.estado)+'</div>'
      +(s.comentario_validador?'<div style="grid-column:span 2"><span style="color:var(--text3)">Validación original: </span><em>'+formatDisplayValue(s.comentario_validador)+'</em></div>':'')
      +'</div></div>';
  }
  _peFioSelectedEmps=[];
  var peTagsEl=document.getElementById('pe-fio-tags'); if(peTagsEl) peTagsEl.innerHTML='';
  var peSrchEl=document.getElementById('pe-fio-search'); if(peSrchEl) peSrchEl.value='';
  var peDdEl=document.getElementById('pe-fio-dropdown'); if(peDdEl) peDdEl.style.display='none';
  var peNingunoEl=document.getElementById('pe-emp-ninguno'); if(peNingunoEl) peNingunoEl.checked=false;
  getDB('employees').then(function(emps){ _peFioAllEmps=emps.filter(function(e){return e.estado==='Activo';}); });
  ['posterr-tipo','posterr-sev','posterr-impacto-bonus','posterr-comentario'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  toggleState.posterr_fio=null;
  ['posterr-fio-si','posterr-fio-no'].forEach(function(id){var el=document.getElementById(id);if(el)el.className='tbtn';});
  var revalBtn=document.getElementById('pe-btn-revalidar');
  if(revalBtn){
    var canReval=currentUser&&(isAdmin(currentUser)||['fb','chef','jefe_recepcion'].indexOf(currentUser.rol)!==-1);
    revalBtn.style.display=canReval?'':'none';
  }
  document.getElementById('modal-post-error').classList.add('open');
}

async function savePostError() {
  var shiftId = window._postErrorShiftId;
  if(!shiftId){toast('Error: sin turno seleccionado','err');return;}
  var comentario = (document.getElementById('posterr-comentario')||{}).value||'';
  if(!comentario.trim()){toast('Comentario obligatorio','err');return;}
  var fio = toggleState.posterr_fio === 'si';
  var tipo = (document.getElementById('posterr-tipo')||{}).value||'';
  var sev = (document.getElementById('posterr-sev')||{}).value||'';
  var impactoBonus = (document.getElementById('posterr-impacto-bonus')||{}).value||'';
  var empId = _peFioSelectedEmps.length>0 ? JSON.stringify(_peFioSelectedEmps.map(function(e){return e.id;})) : '';
  var empNombre = _peFioSelectedEmps.length>0 ? JSON.stringify(_peFioSelectedEmps.map(function(e){return e.nombre;})) : '';

  var shifts = await getDB('shifts');
  var s = shifts.find(function(x){return x.id===shiftId;});
  if(!s){toast('Turno no encontrado','err');return;}

  var newFio = fio || s.fio === true || s.fio === 1;
  await dbUpdate('shifts', shiftId, {
    fio: newFio,
    tipo_error: tipo || s.tipo_error,
    gravedad_error: sev || s.gravedad_error,
    impacto_bonus: impactoBonus || s.impacto_bonus,
    error_employee_id: empId || s.error_employee_id,
    error_employee_nombre: empNombre || s.error_employee_nombre,
    num_errores: _peFioSelectedEmps.length || s.num_errores || 0,
    estado: newFio ? 'Validado con FIO' : s.estado,
    comentario_validador: s.comentario_validador ? s.comentario_validador + ' | NOTA POSTERIOR: ' + comentario : 'NOTA POSTERIOR: ' + comentario,
    updated_at: localTs()
  });
  invalidateCache('shifts');
  await auditLog('POST_ERROR_ADDED', 'Nota posterior en turno '+shiftId+' por '+currentUser.nombre+' — '+comentario);
  closeModal('modal-post-error');
  toast('Nota posterior registrada','ok');
  await renderValidacion();
  if(document.getElementById('screen-dashboard')&&document.getElementById('screen-dashboard').classList.contains('active')){
    await renderDashboard();
  }
}

async function doRevalidar() {
  var shiftId = window._postErrorShiftId;
  if(!shiftId){toast('Error: sin turno seleccionado','err');return;}
  var comentario = (document.getElementById('posterr-comentario')||{}).value||'';
  if(!comentario.trim()){toast('Comentario obligatorio para revalidar','err');return;}
  var tipo = (document.getElementById('posterr-tipo')||{}).value||'';
  var sev = (document.getElementById('posterr-sev')||{}).value||'';
  var impactoBonus = (document.getElementById('posterr-impacto-bonus')||{}).value||'';
  var empId = _peFioSelectedEmps.length>0 ? JSON.stringify(_peFioSelectedEmps.map(function(e){return e.id;})) : '';
  var empNombre = _peFioSelectedEmps.length>0 ? JSON.stringify(_peFioSelectedEmps.map(function(e){return e.nombre;})) : '';
  await dbUpdate('shifts', shiftId, {
    fio: true,
    tipo_error: tipo,
    gravedad_error: sev,
    impacto_bonus: impactoBonus,
    error_employee_id: empId,
    error_employee_nombre: empNombre,
    num_errores: _peFioSelectedEmps.length,
    estado: 'Validado con FIO',
    comentario_validador: comentario,
    validado_por: currentUser.nombre,
    validado_ts: localTs(),
    updated_at: localTs()
  });
  invalidateCache('shifts');
  await auditLog('REVALIDADO_CON_FIO','shift_id: '+shiftId+' | responsable: '+currentUser.nombre+(empNombre?' | empleados: '+empNombre:''));
  closeModal('modal-post-error');
  toast('Revalidado con FIO','ok');
  await renderValidacion();
  if(document.getElementById('screen-dashboard')&&document.getElementById('screen-dashboard').classList.contains('active')){
    await renderDashboard();
  }
}

async function openReopenModal(shiftId) {
  window._reopenShiftId = shiftId;
  var shifts = await getDB('shifts');
  var s = shifts.find(function(x){return x.id===shiftId;});
  if(!s){toast('Turno no encontrado','err');return;}
  var infoEl = document.getElementById('reabrir-info');
  if(infoEl) infoEl.textContent = s.nombre + ' — ' + fmtDate(s.fecha) + ' — ' + displayServicio(s.servicio) + ' (' + s.estado + ')';
  var motivoEl = document.getElementById('reabrir-motivo');
  if(motivoEl) motivoEl.value = '';
  document.getElementById('modal-reabrir').classList.add('open');
}

async function saveReopenShift() {
  var shiftId = window._reopenShiftId;
  if(!shiftId){toast('Error: sin turno seleccionado','err');return;}
  var motivo = (document.getElementById('reabrir-motivo')||{}).value||'';
  if(!motivo.trim()){toast('Motivo obligatorio para reabrir','err');return;}

  var shifts = await getDB('shifts');
  var s = shifts.find(function(x){return x.id===shiftId;});
  if(!s){toast('Turno no encontrado','err');return;}

  var nota = '[REABIERTO por ' + currentUser.nombre + ' — ' + localTs() + '] ' + motivo.trim();
  var nuevoComentario = s.comentario_validador ? s.comentario_validador + ' | ' + nota : nota;

  await dbUpdate('shifts', shiftId, {
    estado: 'En corrección',
    comentario_validador: nuevoComentario,
    updated_at: localTs()
  });
  invalidateCache('shifts');
  auditLog('REABRIR_INFORME', 'Turno '+shiftId+' ('+s.nombre+' '+fmtDate(s.fecha)+') — Motivo: '+motivo.trim());
  closeModal('modal-reabrir');
  toast('Informe reabierto — pendiente de corrección','ok');
  await renderValidacion();
  if(document.getElementById('screen-dashboard')&&document.getElementById('screen-dashboard').classList.contains('active')){
    await renderDashboard();
  }
}

// ── VALIDACIÓN TABS ──
function canSeeHypoxicTab(user){
  if(!user) return false;
  if(typeof isAdmin === 'function' && isAdmin(user)) return true;
  if(user.rol === 'jefe_recepcion') return true;
  if((user.area||'').toLowerCase() === 'mantenimiento') return true;
  return false;
}

function _valTabStyleActive(btn, color){
  if(!btn) return;
  btn.style.cssText='padding:8px 18px;border-radius:6px;border:2px solid '+color+';background:'+(color==='#2ec4b6'?'rgba(46,196,182,.15)':color==='#3b82f6'?'rgba(59,130,246,.15)':'rgba(168,85,247,.15)')+';color:'+color+';font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
}
function _valTabStyleInactive(btn){
  if(!btn) return;
  btn.style.cssText='padding:8px 18px;border-radius:6px;border:1px solid var(--border);background:none;color:var(--text3);font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
}

function switchValTab(tab) {
  var followupDiv = document.getElementById('val-content-followup');
  var cajaDiv     = document.getElementById('val-content-caja');
  var hypoxicDiv  = document.getElementById('val-content-hypoxic');
  var btnF = document.getElementById('val-tab-followup');
  var btnC = document.getElementById('val-tab-caja');
  var btnH = document.getElementById('val-tab-hypoxic');
  if(!followupDiv||!cajaDiv) { console.warn('Tab divs not found'); return; }

  // Hide all
  followupDiv.style.display = 'none';
  cajaDiv.style.display = 'none';
  if(hypoxicDiv) hypoxicDiv.style.display = 'none';

  // Reset all buttons inactive
  _valTabStyleInactive(btnF);
  _valTabStyleInactive(btnC);
  _valTabStyleInactive(btnH);

  if(tab === 'caja'){
    cajaDiv.style.display = 'block';
    _valTabStyleActive(btnC, '#3b82f6');
    renderValCajaList();
  } else if(tab === 'hypoxic'){
    if(hypoxicDiv) hypoxicDiv.style.display = 'block';
    _valTabStyleActive(btnH, '#a855f7');
    if(typeof renderValHypoxicList === 'function') renderValHypoxicList();
  } else {
    followupDiv.style.display = 'block';
    _valTabStyleActive(btnF, '#2ec4b6');
    renderValidacion();
  }
}

// ── HYPOXIC ROOM TAB CONTENT ──
async function renderValHypoxicList(){
  var el = document.getElementById('val-hypoxic-table');
  if(!el) return;

  var desde = (document.getElementById('v-desde')||{}).value || '';
  var hasta = (document.getElementById('v-hasta')||{}).value || '';

  var all = [];
  try { all = await getDB('hypoxic_room_incidencias'); } catch(e){ console.error('Error cargando hypoxic_room_incidencias', e); }

  if(desde) all = all.filter(function(h){ return (h.fecha||'') >= desde; });
  if(hasta) all = all.filter(function(h){ return (h.fecha||'') <= hasta; });

  all.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  if(!all.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">🌬</div><div class="empty-text">Sin incidencias Hypoxic Room en el rango seleccionado</div></div>';
    return;
  }

  var isAdminU = (typeof isAdmin === 'function') && isAdmin(currentUser);
  var isJefeRec = currentUser && currentUser.rol === 'jefe_recepcion';
  var canEdit = isAdminU || isJefeRec;

  var rows = all.map(function(h){
    var types = '';
    try { var arr = JSON.parse(h.incident_types||'[]'); types = Array.isArray(arr) ? arr.join(', ') : (h.incident_types||''); }
    catch(e){ types = h.incident_types||''; }
    var fechaHora = (typeof fmtDateTs === 'function') ? fmtDateTs(h.fecha, h.created_at) : (h.fecha+' · '+(h.created_at||''));
    var puerta = h.door_open_multiple_over_1min_last_hour
      ? '<span class="badge b-red">SÍ</span>'
      : '<span class="badge b-green">NO</span>';
    var cliente = h.client_notified_reception
      ? '<span class="badge b-yellow">SÍ</span>'
      : '<span class="badge b-gray">NO</span>';
    var estado = h.estado || 'Pendiente';
    var obs = h.observaciones || '—';
    var co2 = h.co2_level;
    var co2Class = (co2>=1000) ? 'b-red' : (co2>=700 ? 'b-amber' : 'b-green');
    var curAlt = h.current_altitude_m != null ? h.current_altitude_m : '—';
    var setPt  = h.set_point_altitude_m != null ? h.set_point_altitude_m : '—';
    // Comparar: si valor actual está por debajo del set point, marca rojo
    var altClass = 'b-gray';
    if(h.current_altitude_m != null && h.set_point_altitude_m != null){
      var diff = h.set_point_altitude_m - h.current_altitude_m;
      if(Math.abs(diff) >= 300) altClass = 'b-red';
      else if(Math.abs(diff) >= 100) altClass = 'b-amber';
      else altClass = 'b-green';
    }
    // Acciones según rol
    var actBtns = '';
    if(canEdit){
      actBtns += '<button class="vbtn vbtn-sec" onclick="editHypoxicItem(\''+h.id+'\')" title="Rectificar">✏️</button>';
    }
    if(isAdminU){
      actBtns += ' <button class="vbtn vbtn-del" onclick="deleteHypoxicItem(\''+h.id+'\')" title="Eliminar">🗑</button>';
    }
    var actCell = canEdit ? '<td style="white-space:nowrap;"><div style="display:flex;gap:4px;flex-wrap:nowrap;">'+actBtns+'</div></td>' : '';
    return '<tr>'
      + '<td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">'+fechaHora+'</td>'
      + '<td style="font-weight:700;font-family:var(--font-mono);text-align:center;">'+formatDisplayValue(h.room_number)+'</td>'
      + '<td>'+formatDisplayValue(types)+'</td>'
      + '<td style="text-align:center;"><span class="badge '+co2Class+'">'+formatDisplayValue(co2)+'</span></td>'
      + '<td style="text-align:center;"><span class="badge '+altClass+'">'+formatDisplayValue(curAlt)+'</span></td>'
      + '<td style="text-align:center;font-family:var(--font-mono);">'+formatDisplayValue(setPt)+'</td>'
      + '<td style="text-align:center;">'+puerta+'</td>'
      + '<td style="text-align:center;">'+cliente+'</td>'
      + '<td style="font-size:12px;">'+formatDisplayValue(h.employee_nombre)+'</td>'
      + '<td style="font-size:11px;">'+formatDisplayValue(h.turno||'')+'</td>'
      + '<td><span class="badge b-amber">'+formatDisplayValue(estado)+'</span></td>'
      + '<td style="font-size:11px;color:var(--text3);max-width:200px;">'+formatDisplayValue(obs)+'</td>'
      + actCell
      + '</tr>';
  }).join('');

  var accionTh = canEdit ? '<th>Acción</th>' : '';
  el.innerHTML = '<table>'
    + '<tr><th>Fecha · Hora</th><th>Hab</th><th>Tipos</th><th>CO2</th><th>Val. actual (m)</th><th>Set point (m)</th><th>Puerta</th><th>Cliente avisó</th><th>Empleado</th><th>Turno</th><th>Estado</th><th>Observaciones</th>'+accionTh+'</tr>'
    + rows
    + '</table>';
}
window.renderValHypoxicList = renderValHypoxicList;

// ── VALIDACIÓN CAJA ──
async function renderValCajaList() {
  var el = document.getElementById('val-caja-table');
  if(!el) return;

  // FIX: leer el filtro real de la UI (v-dept), no la variable fantasma _currentValDept
  var dept = (document.getElementById('v-dept')||{}).value || '';

  // Recepción se pinta en su propio bloque (renderValCajaRecepcion).
  // Regla: Recepción solo si Departamento=Recepción · Sala si Sala/Todos.
  renderValCajaRecepcion(dept);
  renderValCajaLab(dept);

  var salaCard = el.closest ? el.closest('.card') : null;
  if(dept === 'Recepción'){
    // Ocultar tabla de Sala: en Recepción no aplica
    if(salaCard) salaCard.style.display = 'none';
    return;
  }
  if(salaCard) salaCard.style.display = '';

  try {
    var data = await dbGetAll('sala_cash_closures');
    var periodo = (document.getElementById('val-caja-periodo')||{}).value||'hoy';
    var t = today();
    data = data.filter(function(c){
      if(periodo==='hoy') return c.fecha===t;
      if(periodo==='semana') return c.fecha>=startOfWeek();
      if(periodo==='mes') return c.fecha>=startOfMonth();
      return true;
    });
    data.sort(function(a,b){return b.fecha.localeCompare(a.fecha);});
    if(!data.length){
      el.innerHTML='<div class="empty"><div class="empty-icon">💰</div><div class="empty-text">Sin cierres en el periodo</div></div>';
      return;
    }
    var rows = data.map(function(c){
      var servs=displayServicio(c.servicios||'');
      var _esTras = c.tipo === 'traspaso';
      var _tipoBadge = _esTras
        ? ' <span class="badge" style="background:rgba(8,145,178,.15);color:#0891b2;border:1px solid #0891b2;font-size:9px;">🔁 Traspaso</span>'
        : '';
      servs = servs + _tipoBadge;
      var difOp = c.diferencia_operativa_sala||0;
      var difColor = Math.abs(difOp)<0.01?'var(--green)':Math.abs(difOp)>5?'var(--red)':'var(--amber)';
      var isPendiente = c.estado!=='Validado final';
      var isAdmin = currentUser.rol==='admin';
      var canValidar = isAdmin||currentUser.rol==='fb';
      var totalPens = (parseInt(c.pension_desayuno)||0)+(parseInt(c.media_pension)||0)+(parseInt(c.pension_completa)||0);
      // BUG-CAJ-04: Total ajustes
      var totalAjustes = c.total_ajustes != null ? c.total_ajustes.toFixed(2)+'€' : '—';
      var ajColor = c.total_ajustes > 0 ? 'var(--amber)' : 'var(--text3)';
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(c.fecha)+'<br><span style="color:var(--text3)">'+(c.created_at?c.created_at.slice(11,16):'—')+'</span></td>'
        +'<td>'+servs+'</td>'
        +'<td style="font-weight:600">'+c.responsable_nombre+'</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.efectivo_real||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.retiro_caja_fuerte||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.tarjeta_tpv||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.stripe_real||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.subtotal_neto||0).toFixed(2)+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.total_bruto||0).toFixed(2)+'€</td>'
        +(function(){
          var difEf=(c.diferencia_efectivo||0);
          var difTar=(c.diferencia_tarjeta||0);
          var difStr=(c.diferencia_stripe||0);
          var breakdown='<div style="font-size:10px;color:var(--text3);margin-top:2px">Ef:'+(difEf>=0?'+':'')+difEf.toFixed(2)+'€ Tar:'+(difTar>=0?'+':'')+difTar.toFixed(2)+'€ Str:'+(difStr>=0?'+':'')+difStr.toFixed(2)+'€</div>';
          return '<td style="font-family:var(--font-mono);color:'+difColor+'">'+(difOp>=0?'+':'')+difOp.toFixed(2)+'€'+breakdown+'</td>';
        })()
        +'<td style="font-family:var(--font-mono);color:'+ajColor+'">'+totalAjustes+'</td>'
        +'<td style="text-align:center">'+totalPens+'p</td>'
        +'<td>'+bCajaEstado(c.estado||'Pendiente Sala')+'</td>'
        +'<td style="white-space:nowrap">'
        +'<div style="display:flex;flex-direction:column;gap:4px;">'
        +(isPendiente&&canValidar?'<button class="btn btn-success btn-sm" data-cid="'+c.id+'" onclick="openCajaSummary(this.dataset.cid,true)">✓ Validar</button>':'')
        +'<button class="btn btn-secondary btn-sm" data-cid="'+c.id+'" onclick="openCajaSummary(this.dataset.cid)">📋 Ver</button>'
        +(isAdmin?'<button class="btn btn-warn btn-sm" data-cid="'+c.id+'" onclick="reabrirCierre(this.dataset.cid)">✏️ Corregir</button>':'')
        +(isAdmin?'<button class="btn btn-danger btn-sm" data-cid="'+c.id+'" onclick="eliminarCierreCaja(this.dataset.cid)">🗑 Eliminar</button>':'')
        +'</div>'
        +'</td>'
        +'</tr>';
    }).join('');
    el.innerHTML='<table><tr><th>Fecha</th><th>Turno</th><th>Responsable</th><th>Efectivo</th><th>Retiro</th><th>Tarjeta</th><th>Stripe</th><th>Neto</th><th>Bruto</th><th>Diferencia</th><th>Total ajustes</th><th>Pensiones</th><th>Estado</th><th>Acción</th></tr>'+rows+'</table>';
  } catch(e) {
    el.innerHTML='<div class="alert a-warn">No se puede cargar — ejecuta primero el SQL de Sala Phase 1.</div>';
  }
}

// ── CAJA-V2 · VALIDACIÓN CAJAS RECEPCIÓN (cierres + traspasos) ──────────
// Visible: admin + jefe_recepcion · Acciones: Ver / Reabrir / Eliminar(admin)
// Reutiliza modales y funciones de recepcion.js (tabla recepcion_cash).
async function renderValCajaRecepcion(deptArg) {
  var block = document.getElementById('val-rec-caja-block');
  var el    = document.getElementById('val-rec-caja-table');
  if(!block || !el) return;

  var isAdminU  = currentUser && currentUser.rol === 'admin';
  var isJefeRec = currentUser && currentUser.rol === 'jefe_recepcion';
  if(!isAdminU && !isJefeRec){ block.style.display = 'none'; return; }

  // Regla de departamento: mostrar solo cuando dept = Recepción o Todos (vacío)
  var dept = (typeof deptArg === 'string') ? deptArg : ((document.getElementById('v-dept')||{}).value || '');
  if(dept && dept !== 'Recepción'){ block.style.display = 'none'; return; }
  block.style.display = 'block';
  el.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';

  var rows = [];
  try { rows = await getDB('recepcion_cash'); } catch(e){ rows = []; }

  var periodo = (document.getElementById('val-rec-caja-periodo')||{value:'semana'}).value || 'semana';
  var t = today();
  rows = rows.filter(function(r){
    if(periodo === 'hoy')    return r.fecha === t;
    if(periodo === 'semana') return r.fecha >= startOfWeek();
    if(periodo === 'mes')    return r.fecha >= startOfMonth();
    return true;
  });
  rows.sort(function(a,b){
    return (b.fecha||'').localeCompare(a.fecha||'') || (b.created_at||'').localeCompare(a.created_at||'');
  });

  if(!rows.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin operaciones de caja Recepción en este periodo</div></div>';
    return;
  }

  var html = '<table><tr><th>Fecha</th><th>Turno</th><th>Tipo</th><th>Recepcionista</th>'
    + '<th>Fondo recibido</th><th>Retiro</th><th>Fondo traspasado</th><th>Δ Total</th>'
    + '<th>Estado</th><th>Acción</th></tr>';

  rows.forEach(function(r){
    var dif      = parseFloat(r.dif_total || 0);
    var difColor = Math.abs(dif) < 0.01 ? 'var(--green)' : 'var(--red)';
    var esTraspaso = r.tipo === 'traspaso';
    var tipoBadge  = esTraspaso
      ? '<span class="badge" style="background:rgba(8,145,178,.15);color:#0891b2;border:1px solid #0891b2;">🔁 Traspaso</span>'
      : '<span class="badge" style="background:rgba(139,92,246,.15);color:#8b5cf6;border:1px solid #8b5cf6;">💰 Cierre</span>';
    var estado = r.estado || 'cerrado';
    var estadoBadge = estado === 'validado'  ? '<span class="badge b-green">✓ Validado</span>'
                    : estado === 'reabierto' ? '<span class="badge b-orange">↩ Reabierto</span>'
                    : '<span class="badge b-gray">● '+estado+'</span>';
    var verFn = esTraspaso ? 'openRecTraspasoModal' : 'openRecCajaModal';

    var acciones = '<div style="display:flex;flex-direction:column;gap:4px;">'
      + '<button class="btn btn-secondary btn-sm" onclick="'+verFn+'(\''+r.id+'\')">📋 Ver</button>'
      + (estado !== 'reabierto' ? '<button class="btn btn-warn btn-sm" onclick="reabrirCajaRec(\''+r.id+'\')">↩ Reabrir</button>' : '')
      + (isAdminU ? '<button class="btn btn-danger btn-sm" onclick="eliminarCajaRec(\''+r.id+'\')">🗑 Eliminar</button>' : '')
      + '</div>';

    html += '<tr>'
      + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(r.fecha) + '</td>'
      + '<td>' + (r.turno || '—') + '</td>'
      + '<td>' + tipoBadge + '</td>'
      + '<td style="font-weight:600">' + (r.responsable_nombre || r.usuario_nombre || '—') + '</td>'
      + '<td style="font-family:var(--font-mono)">' + (parseFloat(r.fondo_recibido)||0).toFixed(2) + '€</td>'
      + '<td style="font-family:var(--font-mono)">' + (parseFloat(r.retiro_caja_fuerte)||0).toFixed(2) + '€</td>'
      + '<td style="font-family:var(--font-mono)">' + (parseFloat(r.fondo_real_a_traspasar)||0).toFixed(2) + '€</td>'
      + '<td style="font-family:var(--font-mono);font-weight:700;color:' + difColor + '">' + (dif >= 0 ? '+' : '') + dif.toFixed(2) + '€</td>'
      + '<td>' + estadoBadge + '</td>'
      + '<td style="white-space:nowrap">' + acciones + '</td>'
      + '</tr>';
  });
  html += '</table>';
  el.innerHTML = html;
}
window.renderValCajaRecepcion = renderValCajaRecepcion;

// ── CAJA-V2 · VALIDACIÓN CAJAS SYNCROLAB (Nubimed + VirtuGym) ───────────
// Visible: admin + jefe_recepcion (validador) · Acciones: Ver / Validar / Corrección / Eliminar(admin)
async function renderValCajaLab(deptArg){
  var block = document.getElementById('val-lab-caja-block');
  var el    = document.getElementById('val-lab-caja-table');
  if(!block || !el) return;
  var isAdminU  = currentUser && currentUser.rol === 'admin';
  var isValidador = currentUser && (currentUser.rol === 'jefe_recepcion' || currentUser.rol === 'coord_recepcion_syncrolab');
  if(!isAdminU && !isValidador){ block.style.display = 'none'; return; }
  // Regla dept: mostrar si dept = SYNCROLAB o vacío (Todos)
  var dept = (typeof deptArg === 'string') ? deptArg : ((document.getElementById('v-dept')||{}).value || '');
  if(dept && dept.indexOf('SYNCROLAB') === -1 && dept !== 'Recepción SYNCROLAB'){ block.style.display = 'none'; return; }
  block.style.display = 'block';
  el.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';

  var rows = [];
  try { rows = await getDB('syncrolab_cash_closures'); } catch(e){ rows = []; }
  var periodo = (document.getElementById('val-lab-caja-periodo')||{value:'semana'}).value || 'semana';
  var t = today();
  rows = rows.filter(function(r){
    if(periodo === 'hoy')    return r.fecha === t;
    if(periodo === 'semana') return r.fecha >= startOfWeek();
    if(periodo === 'mes')    return r.fecha >= startOfMonth();
    return true;
  });
  rows.sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||'') || (b.created_at||'').localeCompare(a.created_at||''); });

  if(!rows.length){ el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin operaciones de caja SYNCROLAB en este periodo</div></div>'; return; }

  var html = '<table><tr><th>Fecha</th><th>Turno</th><th>Tipo</th><th>Responsable</th><th>Δ Nubimed</th><th>Δ VirtuGym</th><th>Δ Total</th><th>Estado</th><th>Acción</th></tr>';
  rows.forEach(function(r){
    var difN = parseFloat(r.diferencia_total_nubimed || 0);
    var difV = parseFloat(r.diferencia_total_virtugym || 0);
    var difT = parseFloat(r.diferencia_total_syncrolab || 0);
    function dc(v){ return '<td style="font-family:var(--font-mono);color:'+(Math.abs(v)<0.01?'var(--green)':'var(--red)')+'">'+(v>=0?'+':'')+v.toFixed(2)+'€</td>'; }
    var esTraspaso = r.tipo === 'traspaso';
    var tipoBadge = esTraspaso
      ? '<span class="badge" style="background:rgba(8,145,178,.15);color:#0891b2;border:1px solid #0891b2;">🔁 Traspaso</span>'
      : '<span class="badge" style="background:rgba(168,85,247,.15);color:#a855f7;border:1px solid #a855f7;">💰 Cierre</span>';
    var est = r.estado || 'pendiente_validacion';
    var estBadge = est === 'validado' ? '<span class="badge b-green">✓ Validado</span>'
                 : est === 'correccion' ? '<span class="badge b-orange">↩ Corrección</span>'
                 : est === 'cerrado' ? '<span class="badge b-gray">● Cerrado</span>'
                 : '<span class="badge b-gray">● Pendiente</span>';
    var verFn = esTraspaso ? 'openLabTraspasoModal' : 'openLabCierreModal';
    var acc = '<div style="display:flex;flex-direction:column;gap:4px;">'
      + '<button class="btn btn-secondary btn-sm" onclick="'+verFn+'(\''+r.id+'\')">📋 Ver</button>'
      + ((est !== 'validado') ? '<button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="validarCajaLab(\''+r.id+'\')">✓ Validar</button>' : '')
      + ((est !== 'correccion' && est !== 'validado') ? '<button class="btn btn-warn btn-sm" onclick="correccionCajaLab(\''+r.id+'\')">↩ Corrección</button>' : '')
      + (isAdminU ? '<button class="btn btn-danger btn-sm" onclick="eliminarCajaLab(\''+r.id+'\')">🗑 Eliminar</button>' : '')
      + '</div>';
    html += '<tr>'
      + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(r.fecha) + '</td>'
      + '<td>' + (r.turno || '—') + '</td>'
      + '<td>' + tipoBadge + '</td>'
      + '<td style="font-weight:600">' + (r.responsable_nombre || '—') + '</td>'
      + dc(difN) + dc(difV) + dc(difT)
      + '<td>' + estBadge + '</td>'
      + '<td style="white-space:nowrap">' + acc + '</td>'
      + '</tr>';
  });
  html += '</table>';
  el.innerHTML = html;
}
window.renderValCajaLab = renderValCajaLab;

async function validarCajaLab(id){
  var rows = await getDB('syncrolab_cash_closures');
  var row = rows.find(function(r){ return r.id === id; });
  if(!row) return;
  if(Math.abs(parseFloat(row.diferencia_total_syncrolab||0)) > 0.01 && !(row.explicacion_diferencia||'').trim()){
    toast('No se puede validar: diferencia sin explicación','err'); return;
  }
  try{
    await fetch(SUPABASE_URL+'/rest/v1/syncrolab_cash_closures?id=eq.'+encodeURIComponent(id), {
      method:'PATCH', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({ estado:'validado', validado_por:currentUser.nombre, validado_ts:localTs(), updated_at:localTs() })
    });
    invalidateCache('syncrolab_cash_closures');
    if(typeof auditLog==='function') auditLog('LAB_CAJA_VALIDAR', currentUser.nombre+' validó caja SYNCROLAB '+row.fecha+' turno '+row.turno);
    toast('Caja SYNCROLAB validada','ok');
    renderValCajaLab();
  }catch(e){ toast('Error al validar','err'); }
}

async function correccionCajaLab(id){
  var motivo = prompt('Motivo de la corrección (se enviará al responsable):');
  if(motivo === null) return;
  try{
    await fetch(SUPABASE_URL+'/rest/v1/syncrolab_cash_closures?id=eq.'+encodeURIComponent(id), {
      method:'PATCH', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({ estado:'correccion', comentario_validador:motivo||null, updated_at:localTs() })
    });
    invalidateCache('syncrolab_cash_closures');
    if(typeof auditLog==='function') auditLog('LAB_CAJA_CORRECCION', currentUser.nombre+' envió a corrección caja SYNCROLAB '+id+' · '+(motivo||''));
    toast('Enviado a corrección','ok');
    renderValCajaLab();
  }catch(e){ toast('Error','err'); }
}

async function eliminarCajaLab(id){
  if(currentUser.rol !== 'admin'){ toast('Solo admin puede eliminar','err'); return; }
  var motivo = prompt('Motivo de la eliminación (obligatorio, queda en auditoría):');
  if(motivo === null) return;
  if(!motivo.trim()){ toast('Motivo obligatorio','err'); return; }
  if(!confirm('¿Eliminar definitivamente esta caja SYNCROLAB? No se puede deshacer.')) return;
  try{
    if(typeof auditLog==='function') await auditLog('LAB_CAJA_DELETE', currentUser.nombre+' eliminó caja SYNCROLAB '+id+' · motivo: '+motivo);
    await fetch(SUPABASE_URL+'/rest/v1/syncrolab_cash_closures?id=eq.'+encodeURIComponent(id), {
      method:'DELETE', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Prefer':'return=minimal'}
    });
    invalidateCache('syncrolab_cash_closures');
    toast('Caja eliminada — registrado en auditoría','ok');
    renderValCajaLab();
  }catch(e){ toast('Error al eliminar','err'); }
}

async function openCajaSummary(cajaId, showValidar) {
  var data = await dbGetAll('sala_cash_closures');
  var c = data.find(function(x){ return x.id === cajaId; });
  if(!c){ toast('Cierre no encontrado','err'); return; }

  var difOp = c.diferencia_operativa_sala || 0;
  var difColor = Math.abs(difOp)<0.01 ? 'var(--green)' : Math.abs(difOp)>5 ? 'var(--red)' : 'var(--amber)';
  var difEf = c.diferencia_efectivo||0;
  var difTar = c.diferencia_tarjeta||0;
  var difStr = c.diferencia_stripe||0;

  function row(label, val, mono, color){
    if(val===undefined||val===null||val==='') return '';
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">'
      +'<span style="color:var(--text3);font-size:11px;font-family:var(--font-mono);text-transform:uppercase">'+label+'</span>'
      +'<span style="'+(mono?'font-family:var(--font-mono);':'')+( color?'color:'+color+';font-weight:700':'')+'">'+val+'</span>'
      +'</div>';
  }

  var html = '<div style="padding:4px 0">'
    + row('Fecha / Hora cierre', fmtDate(c.fecha) + (c.created_at ? ' · ' + c.created_at.slice(11,16) : ''))
    + row('Responsable', c.responsable_nombre, false)
    + row('Turno', displayServicio(c.servicios||''), false)
    + row('Estado', c.estado, false)
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">EFECTIVO</div>'
    + row('Efectivo real contado', (c.efectivo_real||0).toFixed(2)+'€', true)
    + row('Fondo inicial', (c.fondo_inicial||0).toFixed(2)+'€', true)
    + row('Cash POSMEWS', (c.efectivo_posmews||0).toFixed(2)+'€', true)
    + row('Fondo final', (c.fondo_final||0).toFixed(2)+'€', true)
    + row('Retiro caja fuerte', (c.retiro_caja_fuerte||0).toFixed(2)+'€', true)
    + row('Δ Efectivo', (difEf>=0?'+':'')+difEf.toFixed(2)+'€', true, Math.abs(difEf)<0.01?'var(--green)':'var(--red)')
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">TARJETA Y STRIPE</div>'
    + row('Tarjeta POSMEWS', (c.tarjeta_posmews||0).toFixed(2)+'€', true)
    + row('Tarjeta TPV físico', (c.tarjeta_tpv||0).toFixed(2)+'€', true)
    + row('Propinas TPV', (c.propinas_tpv||0).toFixed(2)+'€', true)
    + row('Propinas efectivo', (c.propinas||c.propinas_efectivo||0).toFixed(2)+'€', true)
    + (function(){
        var calcDifTar = (c.tarjeta_tpv||0) - (c.propinas_tpv||0) - (c.tarjeta_posmews||0);
        var nota = Math.abs(calcDifTar - difTar) > 0.01
          ? ' ⚠ DB: '+(difTar>=0?'+':'')+difTar.toFixed(2)+'€'
          : '';
        return row('Δ Tarjeta (TPV - Propinas - POSMEWS)', (calcDifTar>=0?'+':'')+calcDifTar.toFixed(2)+'€'+nota, true, Math.abs(calcDifTar)<0.01?'var(--green)':'var(--red)');
      })()
    + row('Stripe POSMEWS', (c.stripe_posmews||0).toFixed(2)+'€', true)
    + row('Stripe real', (c.stripe_real||0).toFixed(2)+'€', true)
    + row('Δ Stripe', (difStr>=0?'+':'')+difStr.toFixed(2)+'€', true, Math.abs(difStr)<0.01?'var(--green)':'var(--red)')
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">TOTALES</div>'
    + row('Total neto sin IVA', (c.subtotal_neto||0).toFixed(2)+'€', true)
    + row('Total bruto con IVA', (c.total_bruto||0).toFixed(2)+'€', true)
    + row('Pensiones', ((parseInt(c.pension_desayuno)||0)+(parseInt(c.media_pension)||0)+(parseInt(c.pension_completa)||0))+'p', true)
    + (function(){
        var calcDifTar2 = (c.tarjeta_tpv||0) - (c.propinas_tpv||0) - (c.tarjeta_posmews||0);
        var calcDifEf = (c.diferencia_efectivo||0);
        var calcDifStr = (c.diferencia_stripe||0);
        var calcTotal = calcDifEf + calcDifTar2 + calcDifStr;
        var col = Math.abs(calcTotal)<0.01?'var(--green)':Math.abs(calcTotal)>5?'var(--red)':'var(--amber)';
        return '<div style="margin:12px 0 6px;padding:10px;border-radius:6px;background:var(--bg2);border:1px solid '+col+'">'
          + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:'+col+';letter-spacing:.1em;margin-bottom:4px">DIFERENCIA OPERATIVA (recalculada)</div>'
          + '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:'+col+'">'+(calcTotal>=0?'+':'')+calcTotal.toFixed(2)+'€</div>'
          + '<div style="font-size:11px;color:var(--text3);margin-top:4px">Ef:'+(calcDifEf>=0?'+':'')+calcDifEf.toFixed(2)+'€ · Tar:'+(calcDifTar2>=0?'+':'')+calcDifTar2.toFixed(2)+'€ · Str:'+(calcDifStr>=0?'+':'')+calcDifStr.toFixed(2)+'€</div>'
          + '</div>';
      })()
    + (c.comentario ? row('Comentario', c.comentario) : '')
    + (c.validado_por ? row('Validado por', c.validado_por+' · '+fmtTs(c.validado_ts)) : '')
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">'
    + (showValidar && c.estado !== 'Validado final'
        ? '<button class="btn btn-success" onclick="validarCierre(\''+cajaId+'\');closeModal(\'modal-caja-summary\')">✓ Confirmar Validación</button>'
        : '')
    + '<button class="btn btn-secondary" onclick="var m=document.getElementById(\'modal-caja-summary\');if(m)m.style.display=\'none\'">Cerrar</button>'
    + '</div>';

  var overlay = document.getElementById('modal-caja-summary');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'modal-caja-summary';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'display:flex;z-index:2000';
    overlay.innerHTML = '<div class="modal" style="max-width:520px;max-height:85vh;overflow-y:auto">'
      +'<div class="modal-title">📋 Resumen Cierre de Caja</div>'
      +'<div id="modal-caja-summary-body"></div>'
      +'</div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  document.getElementById('modal-caja-summary-body').innerHTML = html;
}

async function validarCierre(cajaId) {
  var data = await dbGetAll('sala_cash_closures');
  var c = data.find(function(x){return x.id===cajaId;});
  var currentEstado = c ? c.estado : 'Pendiente';
  var nextEstado = 'Cuadrado Sala';
  if(currentEstado === 'Cuadrado Sala') nextEstado = 'Validado final';
  else if(currentUser.rol==='admin'||currentUser.rol==='fb') nextEstado = 'Cuadrado Sala';

  await dbUpdate('sala_cash_closures', cajaId, {
    estado: nextEstado,
    validado_por: currentUser.nombre,
    validado_ts: localTs(),
    updated_at: localTs()
  });
  invalidateCache('sala_cash_closures');
  toast('Cierre: estado → '+nextEstado,'ok');
  await renderValCajaList();
}

async function reabrirCierre(cajaId) {
  var motivo = prompt('Motivo para reabrir el cierre (obligatorio):');
  if(!motivo||!motivo.trim()){ toast('Motivo obligatorio para reabrir','err'); return; }
  var res = await fetch(
    SUPABASE_URL + '/rest/v1/sala_cash_closures?id=eq.' + encodeURIComponent(cajaId),
    { method:'PATCH', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify({estado:'A revisar'}) }
  );
  if(res.ok){
    await auditLog('REABRIR_CIERRE', 'Cierre '+cajaId+' reabierto por '+currentUser.nombre+' — '+motivo);
    invalidateCache('sala_cash_closures');
    toast('Cierre reabierto — estado: A revisar','ok');
    await renderValCajaList();
  } else { toast('Error al reabrir cierre','err'); }
}

// ── DEADLINE LIMITS ──
function setDeadlineLimits() {
  var t = typeof getMinTaskDeadline === 'function' ? getMinTaskDeadline() : today();
  var maxD = typeof getMaxTaskDeadline === 'function' ? getMaxTaskDeadline() : today();
  ['it-deadline','mt-deadline','task-deadline'].forEach(function(id){
    var el = document.getElementById(id);
    if(el){ el.min = t; el.max = maxD; }
  });
}

// ── CIERRE CAJA OFFER (after checklist, for Sala responsables) ──
function openCajaOfferModal() {
  document.getElementById('modal-caja-offer').style.display = 'flex';
}

async function acceptCajaOffer() {
  document.getElementById('modal-caja-offer').style.display = 'none';
  await _doSaveTurno();
  setTimeout(function(){
    var cajaBtn = document.querySelector('[data-screen="caja"]') ||
                  document.querySelector('.nav-btn[onclick*="caja"]');
    if(cajaBtn) cajaBtn.click();
    else if(typeof showScreen === 'function') showScreen('caja');
    setTimeout(function(){
      if(typeof openCajaForm === 'function') openCajaForm();
    }, 200);
  }, 400);
}

async function declineCajaOffer() {
  document.getElementById('modal-caja-offer').style.display = 'none';
  await _doSaveTurno();
}

// ── MISC HELPERS ──
function fixLeadingZeros(el) {
  var v = el.value;
  if(v.length > 1 && v[0] === '0' && v[1] !== '.') {
    el.value = parseFloat(v) || 0;
  }
}

function switchDept(newDept) {
  if(!currentUser) return;
  currentUser.area = newDept;
  currentUser._activeDept = newDept;
  var badge = document.getElementById('topbar-dept-badge');
  if(badge){
    badge.textContent = newDept.toUpperCase();
    badge.style.color = newDept==='Recepción'?'#8b5cf6':newDept==='Sala'?'#3b82f6':newDept==='Cocina'?'#f59e0b':'#2ec4b6';
    badge.style.borderColor = badge.style.color;
  }
  var ds=document.getElementById('dept-switcher');
  if(ds) ds.value=newDept;
  buildNav();
  showScreen('turno');
  setTimeout(function(){ initTurnoForm(); }, 150);
  toast('Departamento: ' + newDept, 'ok');
}

// ═══════════════════════════════════════════════════════════════
// PORTAL PIN — Entrada por departamento
// ═══════════════════════════════════════════════════════════════

function updatePortalClock(){
  var el=document.getElementById('portal-clock');
  if(!el) return;
  var d=new Date();
  var days=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  el.textContent=days[d.getDay()]+' '+d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+' · '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
updatePortalClock();
setInterval(updatePortalClock, 30000);

var _pD='',_pP='',_pGoBusy=false;

function _pClk(){
  var d=new Date();
  var ds=['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
  var ms=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var h=String(d.getHours()).padStart(2,'0');
  var m=String(d.getMinutes()).padStart(2,'0');
  var el=document.getElementById('pclock');
  if(el) el.textContent=ds[d.getDay()]+' '+d.getDate()+' '+ms[d.getMonth()]+' '+d.getFullYear()+'  -  '+h+':'+m;
}
_pClk();
setInterval(_pClk,30000);

function pSel(dept,label,color){
  _pD=dept; _pP=''; _pGoBusy=false;
  var box=document.getElementById('p-pin-box');
  var lbl=document.getElementById('pdept-lbl');
  var err=document.getElementById('p-err');
  if(box){box.textContent='* * * *';box.className='p-pin-box';box.style.borderColor='rgba(46,196,182,.3)';box.style.color='#2ec4b6';}
  if(lbl){lbl.textContent=label;lbl.style.color=color;}
  if(err){err.style.display='none';err.textContent='';}
  document.getElementById('portal-pin-modal').style.display='flex';
}

function pK(d){
  if(_pGoBusy||_pP.length>=6) return;
  _pP+=d;
  var box=document.getElementById('p-pin-box');
  if(box) box.textContent=_pP.replace(/./g,'*');
}

function pBk(){
  if(_pGoBusy) return;
  _pP=_pP.slice(0,-1);
  var box=document.getElementById('p-pin-box');
  if(box) box.textContent=_pP.length===0?'* * * *':_pP.replace(/./g,'*');
}

function pClose(){
  _pP=''; _pGoBusy=false;
  document.getElementById('portal-pin-modal').style.display='none';
}

async function pGo(){
  if(_pGoBusy) return;
  if(_pP.length < 4) return;
  _pGoBusy=true;
  var pin=_pP;
  runMigrations();
  seedEmployees();
  var RP={'300415':'admin','0101':'chef','1010':'fb'};
  var emps=await getDB('employees');
  var u=null;
  if(RP[pin]){
    var r=RP[pin];
    u=emps.find(function(e){return e.rol===r&&e.estado==='Activo';});
    if(!u){
      u={id:'SYS_'+r,
         nombre:r==='admin'?'Administrador':r==='chef'?'Chef':'F&B Manager',
         rol:r,estado:'Activo',pin:pin,
         responsable:r==='chef'?1:0,validador:1,
         area:'Administracion',
         puesto:r==='admin'?'Administrador':r==='chef'?'Jefe de Cocina':'F&B Manager',
         coste:0,obs:'',
         fecha_alta:localTs().slice(0,10)};
    }
  } else {
    u=emps.find(function(e){return e.pin===pin&&e.estado==='Activo';});
  }
  if(!u){
    var box=document.getElementById('p-pin-box');
    var err=document.getElementById('p-err');
    if(box){box.className='p-pin-box p-err';box.textContent='PIN incorrecto';box.style.borderColor='#ef4444';box.style.color='#ef4444';}
    if(err){err.textContent='Inténtalo de nuevo';err.style.display='block';}
    setTimeout(function(){
      _pP=''; _pGoBusy=false;
      if(box){box.className='p-pin-box';box.textContent='* * * *';box.style.borderColor='rgba(46,196,182,.3)';box.style.color='#2ec4b6';}
      if(err){err.style.display='none';err.textContent='';}
    },1500);
    return;
  }
  document.getElementById('portal-pin-modal').style.display='none';
  _pLaunch(u);
}

async function _pLaunch(u){
  document.getElementById('portal-screen').style.display='none';
  currentUser=u;
  var ls=document.getElementById('login-screen');
  var ap=document.getElementById('app');
  if(ls) ls.style.display='none';
  if(ap) ap.style.display='block';
  await startApp();
}

document.addEventListener('keydown',function(e){
  var m=document.getElementById('portal-pin-modal');
  if(!m||m.style.display==='none') return;
  if(e.key>='0'&&e.key<='9'){ e.preventDefault(); pK(e.key); }
  else if(e.key==='Backspace'){ e.preventDefault(); pBk(); }
  else if(e.key==='Enter'){ e.preventDefault(); pGo(); }
  else if(e.key==='Escape') pClose();
});

// ═══════════════════════════════════════════════════════════════
// PATCH: populate incidencia/gestión tipo selector al abrir pantalla turno
// ═══════════════════════════════════════════════════════════════
(function() {
  var _origShow = typeof showScreen === 'function' ? showScreen : null;
  if (_origShow && !showScreen._inciPatched) {
    var _showScreenBase = _origShow;
    showScreen = function(id) {
      _showScreenBase(id);
      if (id === 'turno' && currentUser) {
        setTimeout(function() {
          var dept = currentUser.area || 'Cocina';
          if (typeof populateInciTipoSelector === 'function')
            populateInciTipoSelector('i-tipo-incidencia', dept);
          if (typeof populateGestionTipoSelector === 'function')
            populateGestionTipoSelector('g-tipo', dept);
          if (typeof renderFollowupList === 'function')
            renderFollowupList();
        }, 150);
      }
    };
    showScreen._inciPatched = true;
  }
})();
