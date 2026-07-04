// ═══════════════════════════════════════════════════════════════
// VALIDACION.JS — Módulo de Validación · SYNCRO HUB
// Extraído de index.html · ARCH-01
// Contiene: validación de turnos, validación de caja,
//           portal PIN de entrada, funciones de navegación
// ═══════════════════════════════════════════════════════════════


// ── HELPERS DE CHECKLIST (compartidos) ──
// Devuelve los items del catálogo de checklist correspondientes al departamento
// y turno del shift `s`. Si no hay catálogo configurado, devuelve null.
// Fix bug: antes faltaba esta función y se mostraba "No hay checklist configurado"
// o aparecían items de Cocina en otros departamentos.
function _valChecklistItems(s){
  if(!s) return null;
  var area = s.area || '';
  var srv  = (s.servicio || '').toLowerCase();
  if(area === 'Friegue' || s.puesto === 'Friegue') return (typeof CHK_FRIEGUE_ITEMS !== 'undefined') ? CHK_FRIEGUE_ITEMS : null;
  if(area === 'Sala')   return (typeof CHK_SALA_ITEMS    !== 'undefined') ? CHK_SALA_ITEMS    : null;
  if(area === 'F&B')    return (typeof CHK_FNB_ITEMS     !== 'undefined') ? CHK_FNB_ITEMS     : null;
  if(area === 'Recepción' || area === 'Recepción SFERA'){
    if(srv.indexOf('noche') >= 0) return (typeof CHK_REC_NOCHE_ITEMS  !== 'undefined') ? CHK_REC_NOCHE_ITEMS  : null;
    if(srv.indexOf('tarde') >= 0) return (typeof CHK_REC_TARDE_ITEMS  !== 'undefined') ? CHK_REC_TARDE_ITEMS  : null;
    return (typeof CHK_REC_MANANA_ITEMS !== 'undefined') ? CHK_REC_MANANA_ITEMS : null;
  }
  if(/syncrolab/i.test(area)){
    if(srv.indexOf('tarde') >= 0) return (typeof CHK_LAB_TARDE_ITEMS  !== 'undefined') ? CHK_LAB_TARDE_ITEMS  : null;
    return (typeof CHK_LAB_MANANA_ITEMS !== 'undefined') ? CHK_LAB_MANANA_ITEMS : null;
  }
  if(area === 'Cocina') return (typeof CHK_COCINA_ITEMS !== 'undefined') ? CHK_COCINA_ITEMS : null;
  // Housekeeping, Mantenimiento, Administración, otros → sin checklist por ahora
  return null;
}
window._valChecklistItems = _valChecklistItems;


// ── DELETE SHIFT (admin only) ──
async function deleteShift(shiftId){
  if(currentUser.rol!=='admin') return;
  if(!confirm('¿Eliminar este registro permanentemente? Esta acción no se puede deshacer.')) return;
  // Delete related merma, ajustes, incidencias y recepcion_ventas (cross-sell)
  const allMerma = await getDB('merma');
  for(const m of allMerma){ if(m.shift_id===shiftId) await dbDelete('merma',m.id); }
  const allAjustes = await getDB('ajustes');
  for(const a of allAjustes){ if(a.shift_id===shiftId) await dbDelete('ajustes',a.id); }
  const allIncis = await getDB('incidencias');
  for(const i of allIncis){ if(i.shift_id===shiftId) await dbDelete('incidencias',i.id); }
  const allRecVentas = await getDB('recepcion_ventas');
  for(const v of allRecVentas){ if(v.shift_id===shiftId) await dbDelete('recepcion_ventas',v.id); }
  await dbDelete('shifts',shiftId);
  invalidateCache('shifts'); invalidateCache('merma'); invalidateCache('ajustes'); invalidateCache('incidencias'); invalidateCache('recepcion_ventas');
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
  const recVentas = (await getDB('recepcion_ventas')).filter(function(v){ return v.shift_id===shiftId; });
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

  // ── BLOQUE 1B: KPIs DEL TURNO (dept-aware) ──
  // Renderiza los KPIs que el empleado declaró al cerrar turno.
  // Solo pinta lo que EXISTE en la BD (Fase 1 puramente visual).
  html += _renderKpisTurno(s);

  // ── BLOQUE 2: Checklist ──
  if(s.checklist_items){
    try{
      var chk = JSON.parse(s.checklist_items);
      var items = _valChecklistItems(s);
      var done = chk.filter(Boolean).length;
      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:10px;">2 · CHECKLIST ('+done+'/'+chk.length+' completados)</div>';
      if(!items){
        html += '<div style="color:var(--text3);font-size:12px;">No hay checklist configurado para este departamento.</div>';
      } else {
      html += '<div style="display:flex;flex-direction:column;gap:4px;">';
      chk.forEach(function(checked,i){
        if(i<items.length){
          html += '<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);">'
            +'<div style="width:18px;height:18px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:'+(checked?'var(--green)':'var(--bg4)')+';border:1px solid '+(checked?'var(--green)':'var(--border)')+';font-size:11px;">'+(checked?'✓':'')+'</div>'
            +'<span style="color:'+(checked?'var(--text)':'var(--text3)')+'">'+items[i]+'</span>'
            +'</div>';
        }
      });
      html += '</div>';
      }
      html += '</div>';
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
  // ── BLOQUE 5B: Cross-selling Recepción ──
  var esRecepcion = (s.area||'').toLowerCase().includes('recep');
  if(esRecepcion){
    var TIPO_LABEL_RV = {desayuno:'🌅 Desayuno', comida_cena:'🍽️ Comida/Cena', syncrolab:'💪 SYNCROLAB'};
    function _ivaFactorVal(tipo){ return tipo === 'syncrolab' ? 1.21 : 1.10; }
    if(recVentas.length > 0){
      var totalBruto = 0; var totalIncentivo = 0;
      recVentas.forEach(function(v){ totalBruto += parseFloat(v.importe||0); totalIncentivo += parseFloat(v.importe||0) / _ivaFactorVal(v.tipo_venta) * 0.10; });
      html += '<div style="background:var(--bg2);border:1px solid var(--green);border-radius:8px;padding:14px;margin-bottom:12px;">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--green);letter-spacing:.15em;margin-bottom:10px;">5B · CROSS-SELLING ('+recVentas.length+' venta(s) · incentivo estimado '+totalIncentivo.toFixed(2)+'€)</div>';
      html += '<div class="tbl-wrap"><table style="font-size:12px;width:100%;">';
      html += '<tr style="color:var(--text3);"><th style="text-align:left;padding:4px 8px;">Tipo</th><th style="text-align:right;padding:4px 8px;">Bruto</th><th style="text-align:right;padding:4px 8px;">Neto</th><th style="text-align:right;padding:4px 8px;">Incentivo</th><th style="text-align:left;padding:4px 8px;">MEWS ref</th></tr>';
      recVentas.forEach(function(v){
        var bruto = parseFloat(v.importe||0);
        var neto  = bruto / _ivaFactorVal(v.tipo_venta);
        var inc   = neto * 0.10;
        html += '<tr style="border-top:1px solid var(--border);">';
        html += '<td style="padding:4px 8px;">'+(TIPO_LABEL_RV[v.tipo_venta]||v.tipo_venta)+(v.servicio_detalle?' · <span style="color:var(--text3);">'+v.servicio_detalle+'</span>':'')+'</td>';
        html += '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);">'+bruto.toFixed(2)+'€</td>';
        html += '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--text2);">'+neto.toFixed(2)+'€</td>';
        html += '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--green);">+'+inc.toFixed(2)+'€</td>';
        html += '<td style="padding:4px 8px;color:var(--text3);">'+(v.reserva_mews||'—')+'</td>';
        html += '</tr>';
      });
      html += '</table></div></div>';
    } else {
      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text3);">5B · Sin ventas cross-sell registradas</div>';
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
  if(typeof canValidateDepartment==='function' && canValidateDepartment(user,'Recepción')) return true;
  if((user.area||'').toLowerCase() === 'mantenimiento') return true;
  return false;
}

function canSeeMermaTab(user, dept){
  if(!user) return false;
  // Dept filter: solo visible cuando el filtro es Cocina (o vacío con acceso a Cocina)
  var deptSelVal = dept !== undefined ? dept : ((document.getElementById('v-dept')||{}).value||'');
  if(deptSelVal && deptSelVal !== 'Cocina') return false;
  if(typeof isAdmin === 'function' && isAdmin(user)) return true;
  if(typeof isAdjuntoDirectivo==='function' && isAdjuntoDirectivo(user)) return true;
  if(typeof canValidateDepartment==='function' && canValidateDepartment(user,'Cocina')) return true;
  return false;
}

function _updateMermaTabVisibility(){
  var btn = document.getElementById('val-tab-merma');
  if(!btn) return;
  var visible = canSeeMermaTab(currentUser);
  btn.style.display = visible ? 'inline-block' : 'none';
  // Si el tab merma estaba activo y ya no es visible, volver a TURNOS
  if(!visible){
    var mermaDiv = document.getElementById('val-content-merma');
    if(mermaDiv && mermaDiv.style.display !== 'none') switchValTab('followup');
  }
}

function _updateNotasTabVisibility(){
  var btn = document.getElementById('val-tab-notas');
  if(!btn) return;
  var visible = typeof _canSeeNotasTab==='function' ? _canSeeNotasTab(currentUser) : false;
  btn.style.display = visible ? 'inline-block' : 'none';
  if(!visible){
    var notasDiv = document.getElementById('val-content-notas');
    if(notasDiv && notasDiv.style.display !== 'none') switchValTab('followup');
  }
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
  var followupDiv  = document.getElementById('val-content-followup');
  var operativoDiv = document.getElementById('val-content-operativo');
  var cajaDiv      = document.getElementById('val-content-caja');
  var hypoxicDiv   = document.getElementById('val-content-hypoxic');
  var mermaDiv     = document.getElementById('val-content-merma');
  var notasDiv     = document.getElementById('val-content-notas');
  var btnF = document.getElementById('val-tab-followup');
  var btnO = document.getElementById('val-tab-operativo');
  var btnC = document.getElementById('val-tab-caja');
  var btnH = document.getElementById('val-tab-hypoxic');
  var btnM = document.getElementById('val-tab-merma');
  var btnN = document.getElementById('val-tab-notas');
  if(!followupDiv||!cajaDiv) { console.warn('Tab divs not found'); return; }

  // Hide all
  followupDiv.style.display = 'none';
  if(operativoDiv) operativoDiv.style.display = 'none';
  cajaDiv.style.display = 'none';
  if(hypoxicDiv) hypoxicDiv.style.display = 'none';
  if(mermaDiv) mermaDiv.style.display = 'none';
  if(notasDiv) notasDiv.style.display = 'none';

  // Reset all buttons inactive
  _valTabStyleInactive(btnF);
  if(btnO) _valTabStyleInactive(btnO);
  _valTabStyleInactive(btnC);
  _valTabStyleInactive(btnH);
  if(btnM) _valTabStyleInactive(btnM);
  if(btnN) _valTabStyleInactive(btnN);

  if(tab === 'caja'){
    cajaDiv.style.display = 'block';
    _valTabStyleActive(btnC, '#3b82f6');
    renderValCajaList();
  } else if(tab === 'hypoxic'){
    if(hypoxicDiv) hypoxicDiv.style.display = 'block';
    _valTabStyleActive(btnH, '#a855f7');
    if(typeof renderValHypoxicList === 'function') renderValHypoxicList();
  } else if(tab === 'operativo'){
    if(operativoDiv) operativoDiv.style.display = 'block';
    if(btnO) _valTabStyleActive(btnO, '#10b981');
    var _opDept = (document.getElementById('v-dept')||{}).value||'';
    if(typeof renderFollowUpExtras === 'function') renderFollowUpExtras(_opDept);
  } else if(tab === 'merma'){
    if(mermaDiv) mermaDiv.style.display = 'block';
    if(btnM){
      btnM.style.cssText='padding:8px 18px;border-radius:6px;border:2px solid #f59e0b;background:rgba(245,158,11,.15);color:#f59e0b;font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
    }
    renderValMermaList();
  } else if(tab === 'notas'){
    if(notasDiv) notasDiv.style.display = 'block';
    if(btnN){
      btnN.style.cssText='padding:8px 18px;border-radius:6px;border:2px solid #8b5cf6;background:rgba(139,92,246,.15);color:#8b5cf6;font-family:var(--font-mono);font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.1em;';
    }
    renderValNotasList();
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
  var canEdit = isAdminU || (typeof canValidateDepartment==='function' && canValidateDepartment(currentUser,'Recepción'));

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
  renderValAjustes(dept);

  var salaCard = el.closest ? el.closest('.card') : null;
  var _hideSala = dept === 'Recepción' || (dept && dept.indexOf('SYNCROLAB') !== -1);
  if(salaCard) salaCard.style.display = _hideSala ? 'none' : '';
  if(dept === 'Recepción') return; // early return: Recepción solo tiene su propio bloque

  try {
    var data = await dbGetAll('sala_cash_closures');
    var _totalRaw = data.length;
    var _lastFecha = _totalRaw > 0 ? (data.slice().sort(function(a,b){return (b.fecha||'').localeCompare(a.fecha||'');})[0].fecha || '—') : '—';
    var periodo = (document.getElementById('val-caja-periodo')||{}).value||'semana';
    var t = today();
    data = data.filter(function(c){
      if(periodo==='hoy') return c.fecha===t;
      if(periodo==='semana') return c.fecha>=startOfWeek();
      if(periodo==='mes') return c.fecha>=startOfMonth();
      return true;
    });
    data.sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||'') || (b.created_at||'').localeCompare(a.created_at||''); });
    if(!data.length){
      el.innerHTML='<div class="empty"><div class="empty-icon">💰</div><div class="empty-text">Sin cierres en el periodo</div>'
        +'<div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:var(--font-mono);">'
        +'Total en tabla: '+_totalRaw+' · Último registro: '+_lastFecha+' · Semana desde: '+startOfWeek()+'</div></div>';
      return;
    }
    var rows = data.map(function(c){
      var servs=displayServicio(c.servicios||'');
      var _esTras = c.tipo === 'traspaso';
      var _tipoBadge = _esTras
        ? ' <span class="badge" style="background:rgba(8,145,178,.15);color:#0891b2;border:1px solid #0891b2;font-size:9px;">🔁 Traspaso</span>'
        : ' <span class="badge" style="background:rgba(59,130,246,.15);color:#3b82f6;border:1px solid #3b82f6;font-size:9px;">💰 Cierre</span>';
      servs = servs + _tipoBadge;
      var difOp = c.diferencia_operativa_sala||0;
      var difColor = Math.abs(difOp)<0.01?'var(--green)':Math.abs(difOp)>5?'var(--red)':'var(--amber)';
      var isPendiente = c.estado!=='Validado final';
      var isAdmin = currentUser.rol==='admin';
      var canValidar = isAdmin || (typeof canValidateDepartment==='function' && canValidateDepartment(currentUser,'Sala'));
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
  var canValRec = (typeof canValidateDepartment==='function') && canValidateDepartment(currentUser,'Recepción');
  if(!isAdminU && !canValRec){ block.style.display = 'none'; return; }

  // Regla de departamento: mostrar solo cuando dept = Recepción o Todos (vacío)
  var dept = (typeof deptArg === 'string') ? deptArg : ((document.getElementById('v-dept')||{}).value || '');
  var _isAdminRec = currentUser && currentUser.rol === 'admin';
  // Admin: show solo con Todos o Recepción; jefe: solo Recepción
  if(dept && dept !== 'Recepción' && !(_isAdminRec && dept === '')){ block.style.display = 'none'; return; }
  block.style.display = 'block';
  el.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';

  var rows = [];
  try { rows = await getDB('recepcion_cash'); } catch(e){ rows = []; }

  var periodo = (document.getElementById('val-caja-periodo')||{value:'semana'}).value || 'semana';
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
  var isValidador = (typeof canValidateDepartment==='function') && canValidateDepartment(currentUser,'SYNCROLAB');
  if(!isAdminU && !isValidador){ block.style.display = 'none'; return; }
  // Regla dept: admin ve siempre; coordinadora solo en contexto SYNCROLAB
  var dept = (typeof deptArg === 'string') ? deptArg : ((document.getElementById('v-dept')||{}).value || '');
  if(!isAdminU && dept && dept.indexOf('SYNCROLAB') === -1 && dept !== 'Recepción SYNCROLAB'){ block.style.display = 'none'; return; }
  block.style.display = 'block';
  el.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';

  var rows = [];
  try { rows = await getDB('syncrolab_cash_closures'); } catch(e){ rows = []; }
  var periodo = (document.getElementById('val-caja-periodo')||{value:'semana'}).value || 'semana';
  var t = today();
  rows = rows.filter(function(r){
    if(periodo === 'hoy')    return r.fecha === t;
    if(periodo === 'semana') return r.fecha >= startOfWeek();
    if(periodo === 'mes')    return r.fecha >= startOfMonth();
    return true;
  });
  rows.sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||'') || (b.created_at||'').localeCompare(a.created_at||''); });

  if(!rows.length){ el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin operaciones de caja SYNCROLAB en este periodo</div></div>'; return; }

  // Precargar cargos MEWS para mostrar total por cierre
  var allCharges = [];
  try { allCharges = await getDB('syncrolab_room_charges'); } catch(e){ allCharges = []; }

  var html = '<table><tr><th>Fecha</th><th>Turno</th><th>Tipo</th><th>Responsable</th><th>Cargos MEWS</th><th>Δ Nubimed</th><th>Δ VirtuGym</th><th>Δ Total</th><th>Estado</th><th>Acción</th></tr>';
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
    var estBadge = est === 'validado'
      ? '<span class="badge b-green">✓ Validado</span>'
      : est === 'correccion' ? '<span class="badge b-orange">↩ Corrección</span>'
      : est === 'corregido'  ? '<span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid #ef4444;">✔ Corregido</span>'
      : est === 'cerrado'    ? '<span class="badge b-gray">● Cerrado</span>'
      : '<span class="badge b-gray">● Pendiente</span>';
    // Cargos MEWS vinculados a este cierre/traspaso
    var cargosDelCierre = allCharges.filter(function(c){
      return c.syncrolab_cash_closure_id === r.id || c.cash_closure_id === r.id;
    });
    var totalCargos = cargosDelCierre.reduce(function(s,c){ return s + (parseFloat(c.importe)||0); }, 0);
    var cargosCell = cargosDelCierre.length
      ? '<td style="font-family:var(--font-mono);font-size:11px;color:#f59e0b;" title="'+cargosDelCierre.length+' cargo(s) a habitación">'+totalCargos.toFixed(2)+'€ ('+cargosDelCierre.length+')</td>'
      : '<td style="color:var(--text3);font-size:11px;">—</td>';
    var verFn = esTraspaso ? 'openLabTraspasoModal' : 'openLabCierreModal';
    var puedeValidar = isValidador && est !== 'validado';
    var acc = '<div style="display:flex;flex-direction:column;gap:4px;">'
      + '<button class="btn btn-secondary btn-sm" onclick="'+verFn+'(\''+r.id+'\')">📋 Ver</button>'
      + (puedeValidar ? '<button class="btn btn-sm" style="background:var(--green);color:#fff;" onclick="validarCajaLab(\''+r.id+'\')">✓ Validar</button>' : '')
      + (isAdminU && est !== 'validado' ? '<button class="btn btn-warn btn-sm" onclick="correccionCajaLab(\''+r.id+'\')">↩ Corrección</button>' : '')
      + (isAdminU ? '<button class="btn btn-danger btn-sm" onclick="eliminarCajaLab(\''+r.id+'\')">🗑 Eliminar</button>' : '')
      + '</div>';
    html += '<tr>'
      + '<td style="font-family:var(--font-mono);font-size:11px">' + fmtDate(r.fecha) + '</td>'
      + '<td>' + (r.turno || '—') + '</td>'
      + '<td>' + tipoBadge + '</td>'
      + '<td style="font-weight:600">' + (r.responsable_nombre || '—') + '</td>'
      + cargosCell
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
      body: JSON.stringify({ estado:'validado', updated_at:localTs() })
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
        ? '<button class="btn btn-success" onclick="validarCierre(\''+cajaId+'\');closeModal(\'modal-caja-summary\')">✓ Validar</button>'
          + '<button class="btn btn-warn" onclick="marcarCajaError(\'sala_cash_closures\',\''+cajaId+'\')">⚠ Marcar error</button>'
          + '<button class="btn btn-secondary" onclick="marcarCajaSinControl(\'sala_cash_closures\',\''+cajaId+'\')">◐ Sin control</button>'
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

// Acciones de validación de caja (genéricas: sirven para Sala/Recepción/SYNCROLAB)
async function marcarCajaError(table, id){
  var c = prompt('Marcar CON ERROR — describe el error (obligatorio):');
  if(c===null) return;
  if(!c.trim()){ toast('Comentario obligatorio','err'); return; }
  await dbUpdate(table, id, { estado:'con_error', validado_por:currentUser.nombre, validado_ts:localTs(), updated_at:localTs() });
  invalidateCache(table);
  if(typeof auditLog==='function') await auditLog('CAJA_CON_ERROR', currentUser.nombre+' · '+table+' · '+id+' · '+c.trim());
  toast('Cierre marcado CON ERROR','ok');
  var m=document.getElementById('modal-caja-summary'); if(m) m.style.display='none';
  if(typeof renderValCajaList==='function') await renderValCajaList();
}
async function marcarCajaSinControl(table, id){
  var c = prompt('SIN CONTROL — motivo (obligatorio):');
  if(c===null) return;
  if(!c.trim()){ toast('Motivo obligatorio','err'); return; }
  await dbUpdate(table, id, { estado:'sin_control', validado_por:currentUser.nombre, validado_ts:localTs(), updated_at:localTs() });
  invalidateCache(table);
  if(typeof auditLog==='function') await auditLog('CAJA_SIN_CONTROL', currentUser.nombre+' · '+table+' · '+id+' · '+c.trim());
  toast('Cierre marcado SIN CONTROL','ok');
  var m=document.getElementById('modal-caja-summary'); if(m) m.style.display='none';
  if(typeof renderValCajaList==='function') await renderValCajaList();
}
window.marcarCajaError = marcarCajaError;
window.marcarCajaSinControl = marcarCajaSinControl;

async function validarCierre(cajaId) {
  var data = await dbGetAll('sala_cash_closures');
  var c = data.find(function(x){return x.id===cajaId;});
  var currentEstado = c ? c.estado : 'Pendiente';
  var nextEstado = 'Cuadrado Sala';
  if(currentEstado === 'Cuadrado Sala') nextEstado = 'Validado final';
  else if(typeof canValidateDepartment==='function' && canValidateDepartment(currentUser,'Sala')) nextEstado = 'Cuadrado Sala';

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

// ── GRID RESPONSIVE DEL PORTAL (JS puro — inmune a conflictos CSS) ──
function _pGridCols(){
  var g = document.getElementById('portal-dept-grid');
  if(!g) return;
  var w = window.innerWidth;
  var cols = w >= 900 ? 4 : w >= 600 ? 3 : 2;
  g.style.gridTemplateColumns = 'repeat('+cols+',1fr)';
}
window.addEventListener('resize', _pGridCols);
// Llamar también cuando el portal se hace visible
var _pGridObserver = new MutationObserver(function(mutations){
  mutations.forEach(function(m){
    if(m.target.id === 'portal-screen' && m.target.style.display !== 'none') _pGridCols();
  });
});
(function(){
  var ps = document.getElementById('portal-screen');
  if(ps) _pGridObserver.observe(ps, { attributes: true, attributeFilter: ['style'] });
  _pGridCols();
})();

var _pD='',_pP='',_pGoBusy=false;
var _pLabel = '', _pColor = '#2ec4b6';

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

// ── MAPA dept ID → áreas de employees ──────────────────────────
var _pDeptAreas = {
  'cocina':       ['Cocina','Friegue','F&B'],
  'sala':         ['Sala','F&B'],
  'recepcion':    ['Recepción','Recepción SFERA'],
  'rec-syncrolab':['Recepción SYNCROLAB','SYNCROLAB'],
  'entrenadores': ['Entrenadores','SYNCROLAB'],  // área SYNCROLAB, filtrado por puesto abajo
  'housekeeping': ['Housekeeping'],
  'mantenimiento':['Mantenimiento'],
  'administracion':['Administración','RRHH','Recursos Humanos','F&B']
};
// Puestos que pertenecen al portal Entrenadores (dentro del área SYNCROLAB)
var _entrenadorPuestos = ['Entrenador(a)','Coordinador(a) de Entrenadores'];

// ── PANTALLA EQUIPO DEPARTAMENTO (pre-PIN) ──────────────────────
async function pSel(dept, label, color){
  _pD = dept; _pP = ''; _pGoBusy = false; _pColor = color || '#2ec4b6'; _pLabel = label || dept;

  // Construir pantalla de equipo
  var main = document.querySelector('#portal-screen > main');
  if(!main) { _pOpenPin(label, color); return; }

  var areas = _pDeptAreas[dept] || [label];
  var emps = [];
  try { emps = (await getDB('employees')).filter(function(e){ return e.estado === 'Activo'; }); } catch(e){}
  var deptEmps = emps.filter(function(e){
    var a = (e.area||'').trim();
    var areaMatch = areas.some(function(x){ return x.toLowerCase() === a.toLowerCase(); });
    if(!areaMatch) return false;
    // Para Entrenadores: solo mostrar puestos específicos del área SYNCROLAB
    if(dept === 'entrenadores' && a.toLowerCase() === 'syncrolab'){
      var p = (e.puesto||'').trim();
      return _entrenadorPuestos.some(function(ep){ return ep.toLowerCase() === p.toLowerCase(); });
    }
    return true;
  });

  // Clasificar por rol
  // JEFES: rol admin/fb/jefe/adjunto — pero solo del área nativa del dept
  // Excepción: fb siempre aparece en cocina/sala/administracion (cross-dept)
  var jefes = deptEmps.filter(function(e){
    if(e.rol === 'admin' || e.rol === 'fb' || e.rol === 'adjunto') return true;
    if(e.rol === 'jefe'){
      // Jefe de departamento: solo si su área es nativa de este dept (no cross-dept)
      // Para administracion: solo incluir jefes cuya área sea Administración/RRHH/Recursos Humanos
      if(dept === 'administracion'){
        var nativeAdmon = ['administración','rrhh','recursos humanos'];
        return nativeAdmon.indexOf((e.area||'').trim().toLowerCase()) !== -1;
      }
      return true;
    }
    // validador sin rol jefe: solo en su área nativa
    if(e.validador == 1) return true;
    return false;
  });

  // RESPONSABLES: responsable==1, rol empleado — no tiene sentido en administracion
  var responsables = dept === 'administracion' ? [] : deptEmps.filter(function(e){
    return e.responsable == 1 && e.rol !== 'jefe' && e.rol !== 'admin' && e.rol !== 'fb' && e.rol !== 'adjunto';
  });

  // EQUIPO: empleados sin rol especial, sin duplicar
  var jefeIds = jefes.map(function(e){ return e.id; });
  var respIds = responsables.map(function(e){ return e.id; });
  // Quitar de responsables a quien ya está en jefes (Angélica: admin + responsable==1)
  responsables = responsables.filter(function(e){ return jefeIds.indexOf(e.id) === -1; });
  respIds = responsables.map(function(e){ return e.id; });
  var equipo = deptEmps.filter(function(e){
    return e.rol === 'empleado' && jefeIds.indexOf(e.id) === -1 && respIds.indexOf(e.id) === -1;
  });

  function empInitials(nombre){
    var parts = (nombre||'').trim().split(/\s+/);
    return (parts[0]||'').charAt(0).toUpperCase() + (parts[1]||'').charAt(0).toUpperCase();
  }
  // Cada tarjeta es clickable → abre el PIN directamente
  function empCard(e){
    return '<div onclick="_pOpenPin()" style="display:flex;align-items:center;gap:14px;background:#0f2035;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 16px;min-width:160px;cursor:pointer;transition:all .15s;" onmouseover="this.style.background=\'#162840\';this.style.borderColor=\''+color+'88\'" onmouseout="this.style.background=\'#0f2035\';this.style.borderColor=\'rgba(255,255,255,.12)\'">'
      +'<div style="width:40px;height:40px;border-radius:50%;background:'+color+'33;border:2px solid '+color+'66;display:flex;align-items:center;justify-content:center;font-family:\'JetBrains Mono\',monospace;font-size:13px;font-weight:700;color:'+color+';flex-shrink:0;">'+empInitials(e.nombre)+'</div>'
      +'<div><div style="font-size:14px;font-weight:600;color:#f1f5f9;">'+e.nombre+'</div>'
      +'<div style="font-size:12px;color:#94a3b8;">'+e.puesto+'</div></div>'
      +'</div>';
  }
  function section(titleLabel, titleColor, empsArr){
    if(!empsArr.length) return '';
    return '<div style="margin-bottom:28px;">'
      +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:10px;font-weight:700;letter-spacing:.2em;color:'+titleColor+';text-transform:uppercase;margin-bottom:12px;">'+titleLabel+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:10px;">'
      +empsArr.map(empCard).join('')
      +'</div></div>';
  }

  var html = ''
    +'<div id="pdept-team-screen" style="animation:fadeIn .2s ease;">'
    +'<div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;">'
    +'<button onclick="pBack()" style="display:flex;align-items:center;gap:8px;background:#1e3a5f;border:2px solid '+color+';border-radius:10px;padding:10px 18px;color:#f1f5f9;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.03em;" onmouseover="this.style.background=\''+color+'33\'" onmouseout="this.style.background=\'#1e3a5f\'">← Atrás</button>'
    +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:13px;font-weight:700;letter-spacing:.2em;color:'+color+';text-transform:uppercase;">'+label+'</div>'
    +'</div>'
    +(equipo.length       ? section('EQUIPO',                '#94a3b8', equipo)       : '')
    +(responsables.length ? section('RESPONSABLE DE TURNO',  '#2ec4b6', responsables) : '')
    +(jefes.length        ? section('JEFE / VALIDADOR',      color,     jefes)        : '')
    +(!deptEmps.length    ? '<div style="color:#64748b;font-size:14px;padding:20px 0;">Sin empleados activos — haz click aquí para entrar con PIN<br><br><button onclick="_pOpenPin()" style="background:'+color+';border:none;border-radius:8px;padding:12px 24px;color:#0B1F33;font-size:14px;font-weight:700;cursor:pointer;">Entrar con PIN →</button></div>' : '')
    +'</div>';

  // Ocultar secciones del portal grid y mostrar pantalla de equipo
  main.querySelectorAll('section').forEach(function(s){ s.style.display = 'none'; });
  var existing = document.getElementById('pdept-team-screen');
  if(existing){ existing.outerHTML = html; }
  else {
    var d = document.createElement('div');
    d.innerHTML = html;
    main.appendChild(d.firstChild);
  }
}

function _pOpenPin(){
  var box = document.getElementById('p-pin-box');
  var lbl = document.getElementById('pdept-lbl');
  var err = document.getElementById('p-err');
  if(box){box.textContent='* * * *';box.className='p-pin-box';box.style.borderColor='rgba(46,196,182,.3)';box.style.color='#2ec4b6';}
  if(lbl){ lbl.textContent = _pLabel || _pD; lbl.style.color = _pColor; }
  if(err){err.style.display='none';err.textContent='';}
  document.getElementById('portal-pin-modal').style.display='flex';
}

function pBack(){
  var teamDiv = document.getElementById('pdept-team-screen');
  if(teamDiv) teamDiv.remove();
  var main = document.querySelector('#portal-screen > main');
  if(main) main.querySelectorAll('section').forEach(function(s){ s.style.display = ''; });
  _pD = ''; _pP = '';
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

// ── VALIDACIÓN AJUSTES DE CAJA ──────────────────────────────────────────
async function renderValAjustes(deptArg){
  var block = document.getElementById('val-ajustes-caja-block');
  var el    = document.getElementById('val-ajustes-caja-table');
  if(!block || !el) return;
  var isAdminU = currentUser && currentUser.rol === 'admin';
  var isAdjDir = typeof isAdjuntoDirectivo === 'function' && isAdjuntoDirectivo(currentUser);
  var isSalaJefe = currentUser && ['fb','supervisor','chef'].indexOf(currentUser.rol) >= 0;
  if(!isAdminU && !isAdjDir && !isSalaJefe){ block.style.display='none'; return; }
  var dept = (typeof deptArg === 'string') ? deptArg : ((document.getElementById('v-dept')||{}).value||'');
  // Ajustes son de Sala: mostrar si Todos, Sala o admin/adjunto
  if(dept && dept !== 'Sala' && !isAdminU && !isAdjDir){ block.style.display='none'; return; }
  block.style.display='block';
  el.innerHTML='<div class="empty"><div class="empty-text">Cargando...</div></div>';
  var periodo=(document.getElementById('val-caja-periodo')||{value:'semana'}).value||'semana';
  var t=today();
  var rows=[];
  try{ rows=await getDB('ajustes'); }catch(e){ rows=[]; }
  rows=rows.filter(function(r){
    if(periodo==='hoy')    return r.fecha===t;
    if(periodo==='semana') return r.fecha>=startOfWeek();
    if(periodo==='mes')    return r.fecha>=startOfMonth();
    return true;
  });
  if(dept && dept!=='') rows=rows.filter(function(r){ return (r.area||'')=== dept; });
  rows.sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||'')||(b.created_at||'').localeCompare(a.created_at||''); });
  if(!rows.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">💳</div><div class="empty-text">Sin ajustes de caja en este periodo</div></div>';
    return;
  }
  var html='<table><tr><th>Fecha</th><th>Empleado</th><th>Tipo</th><th>Importe</th><th>Motivo</th></tr>';
  rows.forEach(function(r){
    var imp=parseFloat(r.importe)||0;
    var col=imp<0?'var(--red)':imp>0?'var(--green)':'var(--text3)';
    html+='<tr>'
      +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(r.fecha)+'</td>'
      +'<td style="font-weight:600">'+(r.nombre||'—')+'</td>'
      +'<td><span class="badge b-gray">'+(r.tipo||'—')+'</span></td>'
      +'<td style="font-family:var(--font-mono);color:'+col+'">'+(imp>=0?'+':'')+imp.toFixed(2)+' €</td>'
      +'<td style="font-size:12px;color:var(--text3)">'+(r.motivo||'—').slice(0,60)+'</td>'
      +'</tr>';
  });
  html+='</table>';
  el.innerHTML=html;
}
window.renderValAjustes = renderValAjustes;


// ═══════════════════════════════════════════════════════════════════════
// CHECKLIST < 70% → SUGERENCIA DE FIO AUTOMÁTICO AL VALIDAR
// Política unificada (jun 2026) para: Cocina · Friegue · Sala · Recepción
//                                     · SYNCROLAB · Housekeeping
// Al pulsar "✓ Validar":
//   1. Si el turno NO tiene checklist configurado → pasa directo a doValidacion()
//   2. Si tiene checklist y % completado >= 70 → pasa directo a doValidacion()
//   3. Si % completado < 70 → abre modal de confirmación FIO:
//      - El supervisor ve detalle (X/Y, %, items sin marcar)
//      - Puede ajustar nivel y comentario antes de guardar
//      - Botón A: "Registrar FIO + Validar" (crea fio + valida)
//      - Botón B: "Validar sin FIO" (requiere justificación escrita)
//      - Botón C: "Cancelar" (no hace nada)
// ═══════════════════════════════════════════════════════════════════════

// Departamentos para los que aplica el FIO automático por checklist
var _FIO_CHK_DEPTS = ['Cocina','Friegue','Sala','Recepción','SYNCROLAB','Housekeeping'];

// Análisis del checklist de un shift. Devuelve {hasChk, total, done, pct, missing[]}
function _analyzeShiftChecklist(s){
  var out = {hasChk:false, total:0, done:0, pct:100, missing:[]};
  if(!s || !s.checklist_items) return out;
  try {
    var arr = JSON.parse(s.checklist_items);
    if(!Array.isArray(arr) || arr.length===0) return out;
    var items = _valChecklistItems(s);
    out.hasChk = true;
    out.total = arr.length;
    out.done  = arr.filter(Boolean).length;
    out.pct   = out.total>0 ? Math.round((out.done/out.total)*100) : 100;
    if(items){
      arr.forEach(function(checked,i){
        if(!checked && i<items.length) out.missing.push(items[i]);
      });
    }
  } catch(e){}
  return out;
}

// ¿Aplica política <70%? (dept en la lista, hay checklist, y por debajo del umbral)
function _shouldOfferChkFio(s){
  if(!s) return null;
  var dept = s.area || '';
  if(_FIO_CHK_DEPTS.indexOf(dept) < 0) return null;
  var a = _analyzeShiftChecklist(s);
  if(!a.hasChk || a.total<5) return null;  // checklists muy cortos no disparan FIO
  // Umbral 70% redondeando hacia abajo: ej. 8 items → necesita 5 (8*0.7=5.6 → floor=5)
  var minRequired = Math.floor(a.total * 0.7);
  if(a.done >= minRequired) return null;
  a.minRequired = minRequired;
  a.dept = dept;
  return a;
}

// Wrapper del botón "Validar". Si <70% abre el modal de confirmación FIO.
async function tryValidacion(newEstado){
  if(!validatingShiftId) return;
  // Solo aplica al validar (no a "En corrección")
  if(newEstado !== 'Validado') return doValidacion(newEstado);

  var shifts = await getDB('shifts');
  var s = shifts.find(function(x){ return x.id === validatingShiftId; });
  if(!s) return doValidacion(newEstado);

  var analysis = _shouldOfferChkFio(s);
  if(!analysis) return doValidacion(newEstado);

  // Abrir modal de confirmación
  await _openChkFioConfirmModal(s, analysis);
}
window.tryValidacion = tryValidacion;

// Modal de confirmación FIO por checklist incompleto
async function _openChkFioConfirmModal(s, a){
  window._chkFioCtx = { shift: s, analysis: a };

  // Buscar entrada del catálogo FIO para este dept con nombre "No cumplir checklist..."
  var catEntry = null;
  try {
    var cat = await getDB('fio_catalog');
    catEntry = cat.find(function(c){
      return c.activo !== false
        && c.departamento === a.dept
        && /no\s*cumplir.*checklist/i.test(c.nombre || '');
    });
  } catch(e){}
  window._chkFioCtx.catEntry = catEntry;

  var L = catEntry ? (FIO_LEVELS[catEntry.nivel_default] || FIO_LEVELS.L2) : FIO_LEVELS.L2;
  var basePoints = catEntry ? (catEntry.puntos_default || L.points) : 1;

  var missingHtml = a.missing.length > 0
    ? '<div style="max-height:140px;overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;margin-top:6px;">'
      + a.missing.map(function(it){ return '<div style="font-size:11px;color:var(--text3);padding:2px 0;">✗ '+it+'</div>'; }).join('')
      + '</div>'
    : '';

  var ov = document.getElementById('modal-chk-fio-confirm');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-chk-fio-confirm';
    ov.className = 'modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-chk-fio-confirm'); });
  }
  ov.innerHTML =
      '<div class="modal" style="max-width:560px;">'
    + '<div class="modal-h"><h3>⚠ Checklist incompleto · ' + a.dept + '</h3>'
    + '<button class="modal-x" onclick="closeModal(\'modal-chk-fio-confirm\')">✕</button></div>'
    + '<div class="modal-b">'
    + '<div style="padding:10px;background:var(--bg2);border-left:3px solid var(--red);border-radius:4px;margin-bottom:12px;font-size:13px;">'
    +   '<div style="font-weight:700;color:var(--red);margin-bottom:4px;">'+a.done+' de '+a.total+' marcados ('+a.pct+'%)</div>'
    +   '<div style="color:var(--text2);font-size:12px;">Mínimo requerido para no generar FIO: <strong>'+a.minRequired+'/'+a.total+' (70%)</strong></div>'
    +   '<div style="color:var(--text3);font-size:11px;margin-top:6px;">Empleado: <strong>'+formatDisplayValue(s.nombre)+'</strong> · '+fmtDate(s.fecha)+' · '+formatServiceOrTurn(s.servicio)+'</div>'
    + '</div>'
    + (catEntry
        ? '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Tipo de fallo: <strong>'+catEntry.nombre+'</strong></div>'
        : '<div style="padding:8px;background:var(--bg2);border:1px solid var(--amber);border-radius:4px;font-size:11px;color:var(--amber);margin-bottom:8px;">⚠ No hay entrada en catálogo FIO para "'+a.dept+'". Solicita a admin que añada el fallo de checklist al catálogo. El FIO se creará igualmente con nivel manual.</div>'
      )
    + '<div class="fg"><label>Nivel · puntos *</label>'
    + '<select id="chkfio-level">'
    +   ['L1','L2','L3'].map(function(lc){
          var Lx = FIO_LEVELS[lc];
          var sel = (lc === L.code) ? ' selected' : '';
          return '<option value="'+lc+'"'+sel+'>'+Lx.code+' · '+Lx.name+' ('+Lx.points+'p)</option>';
        }).join('')
    + '</select></div>'
    + '<div class="fg"><label>Comentario · evidencia *</label>'
    + '<textarea id="chkfio-comment" rows="4" placeholder="Detalla qué items críticos faltaron o por qué se valida sin FIO."></textarea>'
    + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Obligatorio. Mínimo 15 caracteres.</div></div>'
    + '<div style="margin-top:10px;"><div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Items sin marcar ('+a.missing.length+'):</div>' + missingHtml + '</div>'
    + '</div>'
    + '<div class="modal-f" style="display:flex;gap:6px;flex-wrap:wrap;">'
    + '<button class="btn btn-secondary" onclick="closeModal(\'modal-chk-fio-confirm\')">Cancelar</button>'
    + '<button class="btn btn-warn" onclick="_chkFioValidateOnly()">Validar sin FIO</button>'
    + '<button class="btn btn-primary" onclick="_chkFioValidateWithFio()">Registrar FIO + Validar</button>'
    + '</div></div>';
  ov.classList.add('open');
}

// Opción A: registrar FIO + validar turno
async function _chkFioValidateWithFio(){
  var ctx = window._chkFioCtx; if(!ctx) return;
  var s = ctx.shift, a = ctx.analysis, cat = ctx.catEntry;
  var lvl = (document.getElementById('chkfio-level')||{}).value || 'L2';
  var comment = ((document.getElementById('chkfio-comment')||{}).value || '').trim();
  if(comment.length < 15){ toast('Comentario obligatorio (mín. 15 caracteres)','err'); return; }

  var L = FIO_LEVELS[lvl] || FIO_LEVELS.L2;
  var basePts = cat ? (cat.puntos_default || L.points) : L.points;

  // Auto-completar comentario validador con marca [FIO_CHK]
  var valComment = (document.getElementById('val-comentario')||{}).value || '';
  var autoNote = '[FIO_CHK] Checklist '+a.done+'/'+a.total+' ('+a.pct+'%) — '+comment;
  document.getElementById('val-comentario').value = valComment ? (valComment + ' | ' + autoNote) : autoNote;

  // 1) Crear FIO
  var rec = {
    id: genId(),
    shift_id: s.id,
    employee_id: s.employee_id,
    employee_name: s.nombre,
    departamento: a.dept,
    fault_id: cat ? cat.id : null,
    fault_name: cat ? cat.nombre : 'No cumplir checklist de apertura/cierre',
    categoria: cat ? (cat.categoria || '') : 'Checklist',
    fecha: s.fecha,
    incentive_month: _fioMonth(s.fecha),
    level_code: L.code,
    base_points: basePts,
    applied_points: basePts,
    impact_area: 'Operación',
    evidence_text: '',
    evidence_image: null,
    description: 'Checklist incompleto al cierre: '+a.done+'/'+a.total+' ('+a.pct+'%). '+comment,
    created_by: currentUser.nombre,
    status: FIO_STATUS.REGISTRADO,
    empleado_informado: false,
    created_at: localTs()
  };
  try {
    await dbInsert('fio', rec);
    invalidateCache('fio');
    await auditLog('FIO_AUTO_CHK', currentUser.nombre+' → '+s.nombre+' | checklist '+a.done+'/'+a.total+' ('+a.pct+'%) | '+L.code+' '+basePts+'p');
  } catch(e){
    toast('Error al crear FIO: '+e.message,'err');
    return;
  }

  closeModal('modal-chk-fio-confirm');
  // 2) Validar turno (sigue el flujo normal)
  await doValidacion('Validado');
  toast('FIO registrado y turno validado','ok');
}
window._chkFioValidateWithFio = _chkFioValidateWithFio;

// Opción B: validar sin FIO (requiere justificación)
async function _chkFioValidateOnly(){
  var ctx = window._chkFioCtx; if(!ctx) return;
  var a = ctx.analysis;
  var comment = ((document.getElementById('chkfio-comment')||{}).value || '').trim();
  if(comment.length < 15){ toast('Justificación obligatoria (mín. 15 caracteres)','err'); return; }

  // Anexar justificación al comentario validador
  var valComment = (document.getElementById('val-comentario')||{}).value || '';
  var autoNote = '[CHK_SIN_FIO] Checklist '+a.done+'/'+a.total+' ('+a.pct+'%) — '+comment;
  document.getElementById('val-comentario').value = valComment ? (valComment + ' | ' + autoNote) : autoNote;

  await auditLog('CHK_VALIDATE_NO_FIO', currentUser.nombre+' justificó validar sin FIO: checklist '+a.done+'/'+a.total+' — '+comment.slice(0,60));
  closeModal('modal-chk-fio-confirm');
  await doValidacion('Validado');
}
window._chkFioValidateOnly = _chkFioValidateOnly;

// ── MERMA TAB ────────────────────────────────────────────────────────────
async function renderValMermaList(){
  var kpiEl  = document.getElementById('val-merma-kpis');
  var tableEl = document.getElementById('val-merma-table');
  if(!tableEl) return;

  var desde  = (document.getElementById('v-desde')||{}).value || '';
  var hasta  = (document.getElementById('v-hasta')||{}).value || '';

  tableEl.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';
  if(kpiEl) kpiEl.innerHTML = '';

  var all = [];
  try { all = await getDB('merma'); } catch(e){ console.error('Error cargando merma', e); }

  // Filtrar solo Cocina/Friegue/FnB (campo puede ser area o departamento)
  all = all.filter(function(m){
    var a = (m.area || m.departamento || '').toLowerCase();
    return a === 'cocina' || a === 'friegue' || a === 'fnb';
  });
  if(desde) all = all.filter(function(m){ return (m.fecha||'') >= desde; });
  if(hasta) all = all.filter(function(m){ return (m.fecha||'') <= hasta; });

  all.sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||'') || (b.created_at||'').localeCompare(a.created_at||''); });

  // KPIs
  if(kpiEl){
    var totalLineas = all.length;
    var totalCoste  = all.reduce(function(s,m){ return s+(m.coste_total||0); }, 0);
    var sinCoste    = all.filter(function(m){ return !m.coste_unitario || m.coste_unitario===0; }).length;
    kpiEl.innerHTML = '<div class="kpi-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">'
      +'<div class="kpi k-orange"><div class="kpi-lbl">Líneas</div><div class="kpi-val">'+totalLineas+'</div></div>'
      +'<div class="kpi k-orange"><div class="kpi-lbl">Coste total</div><div class="kpi-val">'+totalCoste.toFixed(2)+'€</div></div>'
      +(sinCoste>0?'<div class="kpi k-red"><div class="kpi-lbl">Sin coste</div><div class="kpi-val">'+sinCoste+'</div><div class="kpi-sub">Pendiente valorar</div></div>':'')
      +'</div>';
  }

  if(!all.length){
    tableEl.innerHTML = '<div class="empty"><div class="empty-icon">🍋</div><div class="empty-text">Sin líneas de merma en el periodo</div></div>';
    return;
  }

  var isAdminU = typeof isAdmin==='function' && isAdmin(currentUser);
  var canEdit  = isAdminU || (typeof canValidateDepartment==='function' && canValidateDepartment(currentUser,'Cocina'));

  tableEl.innerHTML = '<table>'
    +'<tr><th>Fecha</th><th>Empleado</th><th>Servicio</th><th>Producto</th><th>Cant.</th><th>Causa</th><th>Observación</th><th>Coste</th>'+(canEdit?'<th></th>':'')+'</tr>'
    +all.map(function(m){
      var sinC = !m.coste_unitario || m.coste_unitario===0;
      var fecha = typeof fmtDate==='function' ? fmtDate(m.fecha) : (m.fecha||'—');
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">'+fecha+'</td>'
        +'<td style="font-size:12px">'+( m.nombre||'—')+'</td>'
        +'<td style="font-size:12px">'+( m.servicio||'—')+'</td>'
        +'<td style="font-weight:600">'+( m.producto||'—')+'</td>'
        +'<td style="font-family:var(--font-mono);font-size:12px">'+( m.cantidad||'—')+' '+(m.unidad||'')+'</td>'
        +'<td style="font-size:12px">'+( m.causa||'—')+'</td>'
        +'<td style="font-size:11px;color:var(--text3)">'+( m.obs||'—')+'</td>'
        +'<td style="font-family:var(--font-mono);'+(sinC?'color:var(--amber)':'color:var(--orange)')+'">'
          +(sinC?'⚠ Pendiente':(m.coste_total||0).toFixed(2)+'€')+'</td>'        +(canEdit          ?'<td><button class="vbtn vbtn-sec" onclick="valMermaEditCoste(\''+m.id+'\',\''+encodeURIComponent(m.producto||'')+'\',' +(m.cantidad||0)+',\''+( m.unidad||'g')+'\','+( m.coste_unitario||0)+')" title="Valorar">✏️</button></td>'          :'')        +'</tr>';
    }).join('')
    +'</table>';
}
window.renderValMermaList = renderValMermaList;


// ── EDITAR COSTE DE MERMA desde pestaña Validación ───────────────────
var _vmc_current = {}; // estado del modal activo

function valMermaEditCoste(id, productoEnc, cantidad, unidad, costeActual) {
  _vmc_current = { id: id, cantidad: cantidad };
  var producto = decodeURIComponent(productoEnc);

  var existing = document.getElementById('modal-val-merma-coste');
  if (existing) existing.remove();

  var div = document.createElement('div');
  div.id = 'modal-val-merma-coste';
  div.className = 'modal-overlay';
  div.innerHTML = '<div class="modal" style="max-width:420px;" onclick="event.stopPropagation()">'
    + '<div class="modal-h"><h3>✏️ Valorar merma</h3>'
    + '<button class="modal-x" onclick="_valMermaCloseModal()">✕</button></div>'
    + '<div class="modal-b">'
    + '<div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:16px;">'
    + '<div style="font-weight:600;font-size:14px;">' + producto + '</div>'
    + '<div style="font-size:12px;color:var(--text2);margin-top:4px;">' + cantidad + ' ' + unidad + '</div>'
    + '</div>'
    + '<div class="fg">'
    + '<label>Coste unitario (€/' + unidad + ') <span class="req">*</span></label>'
    + '<input id="vmc-coste-unit" type="number" min="0" step="0.00001" value="' + (costeActual || '') + '" placeholder="ej: 0.01888">'
    + '</div>'
    + '<div id="vmc-preview" style="text-align:center;padding:10px;background:var(--bg3);border-radius:8px;margin-top:8px;display:none;">'
    + '<span style="font-size:12px;color:var(--text2)">Coste total: </span>'
    + '<span id="vmc-total" style="font-size:20px;font-weight:700;color:var(--orange)"></span>'
    + '</div>'
    + '</div>'
    + '<div class="modal-f">'
    + '<button class="btn btn-secondary" onclick="_valMermaCloseModal()">Cancelar</button>'
    + '<button class="btn btn-primary" onclick="valMermaSaveCoste()">💾 Guardar coste</button>'
    + '</div></div>';

  document.body.appendChild(div);
  div.addEventListener('click', function(e) { if (e.target === div) _valMermaCloseModal(); });
  div.classList.add('open');

  var inp = document.getElementById('vmc-coste-unit');
  if (inp) {
    inp.focus(); inp.select();
    inp.addEventListener('input', function() {
      var cu = parseFloat(inp.value) || 0;
      var total = cu * cantidad;
      var prev = document.getElementById('vmc-preview');
      var tot  = document.getElementById('vmc-total');
      if (cu > 0) { if(tot) tot.textContent = total.toFixed(2) + '€'; if(prev) prev.style.display = 'block'; }
      else { if(prev) prev.style.display = 'none'; }
    });
  }
}
window.valMermaEditCoste = valMermaEditCoste;

function _valMermaCloseModal() {
  var m = document.getElementById('modal-val-merma-coste');
  if (m) m.remove();
  _vmc_current = {};
}
window._valMermaCloseModal = _valMermaCloseModal;

async function valMermaSaveCoste() {
  var id       = _vmc_current.id;
  var cantidad = _vmc_current.cantidad;
  if (!id) { toast('Error: sin referencia de merma', 'err'); return; }

  var inp = document.getElementById('vmc-coste-unit');
  var costeUnit = parseFloat((inp || {}).value);
  if (!costeUnit || costeUnit <= 0) { toast('Introduce el coste unitario', 'err'); return; }

  var costeTotal = parseFloat((costeUnit * cantidad).toFixed(2));

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/merma?id=eq.' + id, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ coste_unitario: costeUnit, coste_total: costeTotal })
    });
    if (!res.ok) { var e = await res.text(); toast('Error: ' + e, 'err'); return; }

    invalidateCache('merma');
    _valMermaCloseModal();
    toast('Coste guardado — ' + costeTotal.toFixed(2) + '€', 'ok');
    renderValMermaList();
  } catch(e) {
    toast('Error: ' + (e.message || e), 'err');
  }
}
window.valMermaSaveCoste = valMermaSaveCoste;


// ── NOTAS TAB (Validación) ────────────────────────────────────────────
async function renderValNotasList(){
  var tableEl = document.getElementById('val-notas-table');
  var kpiEl   = document.getElementById('val-notas-kpis');
  if(!tableEl) return;

  var desde = (document.getElementById('v-desde')||{}).value || '';
  var hasta  = (document.getElementById('v-hasta')||{}).value || '';
  var dept   = (document.getElementById('v-dept')||{}).value  || '';

  tableEl.innerHTML = '<div class="empty"><div class="empty-text">Cargando...</div></div>';
  if(kpiEl) kpiEl.innerHTML = '';

  var all = [];
  try { all = await getDB('employee_notes'); } catch(e){ console.error('employee_notes load error', e); }

  // Filtro por dept si está seleccionado
  if(dept) all = all.filter(function(n){ return n.area === dept; });
  // Filtro por fecha
  var toDateStr = function(ts){ return ts ? ts.slice(0,10) : ''; };
  if(desde) all = all.filter(function(n){ return toDateStr(n.created_at) >= desde; });
  if(hasta) all = all.filter(function(n){ return toDateStr(n.created_at) <= hasta; });

  all.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  // KPIs
  if(kpiEl){
    var noLeidas = all.filter(function(n){ return !n.leida; }).length;
    var cats = {};
    all.forEach(function(n){ cats[n.categoria]=(cats[n.categoria]||0)+1; });
    kpiEl.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">'
      +'<div class="kpi k-purple"><div class="kpi-lbl">Total</div><div class="kpi-val">'+all.length+'</div></div>'
      +Object.keys(cats).map(function(c){
        return '<div class="kpi k-purple"><div class="kpi-lbl">'+c+'</div><div class="kpi-val">'+cats[c]+'</div></div>';
      }).join('')
      +(noLeidas>0?'<div class="kpi k-red"><div class="kpi-lbl">Sin leer</div><div class="kpi-val">'+noLeidas+'</div></div>':'')
      +'</div>';
  }

  if(!all.length){
    tableEl.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Sin notas en el periodo / departamento seleccionado</div></div>';
    return;
  }

  var isAdminU = typeof isAdmin==='function' && isAdmin(currentUser);

  tableEl.innerHTML = '<table>'
    +'<tr><th>Fecha</th><th>Empleado</th><th>Dpto</th><th>Categoría</th><th>Nota</th><th>Estado</th><th>Acción</th></tr>'
    +all.map(function(n){
      var catColor = n.categoria==='Queja'?'#ef4444':n.categoria==='Mejora'?'#10b981':'#8b5cf6';
      var fecha = n.created_at ? new Date(n.created_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
      var estadoBadge = n.leida
        ? '<span class="badge b-green">Leída</span>'
        : '<span class="badge b-red">Nueva</span>';
      var markBtn = !n.leida
        ? '<button class="vbtn vbtn-sec" onclick="markNotaLeida(\''+n.id+'\')" title="Marcar leída">✓</button>'
        : '';
      var delBtn = isAdminU
        ? '<button class="vbtn vbtn-del" onclick="deleteNota(\''+n.id+'\')" title="Eliminar">🗑</button>'
        : '';
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">'+fecha+'</td>'
        +'<td style="font-size:12px">'+formatDisplayValue(n.nombre||'—')+'</td>'
        +'<td><span class="dept-badge">'+formatDisplayValue(n.area||'—')+'</span></td>'
        +'<td><span class="badge" style="color:'+catColor+';border:1px solid '+catColor+';background:rgba(139,92,246,.08);">'+n.categoria+'</span></td>'
        +'<td style="font-size:13px;max-width:320px;">'+formatDisplayValue(n.texto)+'</td>'
        +'<td>'+estadoBadge+'</td>'
        +'<td style="white-space:nowrap">'+markBtn+' '+delBtn+'</td>'
        +'</tr>';
    }).join('')
    +'</table>';
}
window.renderValNotasList = renderValNotasList;

// ═══════════════════════════════════════════════════════════════════════
// BLOQUE 1B · KPIs DEL TURNO — Fase 1 puramente visual
// Renderiza en el modal de validación los KPIs que el empleado declaró
// al cerrar turno. Solo pinta lo que EXISTE hoy en la tabla `shifts`.
// Roadmap:
//  - Sala        → campos ya persistidos (descuentos/anulaciones/etc.) ✓
//  - Entrenadores→ shifts.kpi_entrenador (JSON) ✓
//  - Cocina      → merma se muestra en bloque 4B (no se duplica aquí)
//  - Recepción   → check-in/check-out/leads NO están en shifts (Fase 2)
//  - HK/Mant/Admon/Fisios/Rec.SYNCROLAB → pendientes Fase 3
// ═══════════════════════════════════════════════════════════════════════
function _renderKpisTurno(s){
  if(!s) return '';
  var area = (s.area || s.departamento || '').toLowerCase().trim();
  var puesto = (s.puesto || '').toLowerCase();

  var isSala      = area === 'sala' || area === 'jefe de sala' || area === 'f&b' || area === 'food & beverage' || area === 'fnb';
  var isCocina    = area === 'cocina' || area === 'friegue';
  var isRecep     = /recep/.test(area) && !/syncrolab/.test(area);
  var isRecLab    = /recep.*syncrolab/.test(area);
  var isEntrenador = /entrenador/.test(area) || /entrenador/.test(puesto) || /coord.*entren/.test(puesto);
  var isFisio     = /fisio|cl[ií]nica/.test(area) || /fisio/.test(puesto);
  var isHK        = area === 'housekeeping' || area === 'hk' || area === 'limpieza';
  var isMant      = area === 'mantenimiento';
  var isAdmon     = area === 'administración' || area === 'administracion';

  var bodyHtml = '';

  // ── SALA ────────────────────────────────────────────────────
  if(isSala){
    var rows = [];
    if(s.descuentos_si)   rows.push({lbl:'Descuentos',   num:s.descuentos_num,   motivo:s.descuentos_motivo});
    if(s.anulaciones_si)  rows.push({lbl:'Anulaciones',  num:s.anulaciones_num,  motivo:s.anulaciones_motivo});
    if(s.devoluciones_si) rows.push({lbl:'Devoluciones', num:s.devoluciones_num, motivo:s.devoluciones_motivo});
    if(s.invitaciones_si){
      var invMotivo = [];
      if(s.invitaciones_tipo)      invMotivo.push('Tipo: '+s.invitaciones_tipo);
      if(s.invitaciones_producto)  invMotivo.push('Producto: '+s.invitaciones_producto);
      if(s.invitaciones_posmews)   invMotivo.push('En POSMEWS');
      rows.push({lbl:'Invitaciones', num:s.invitaciones_num, motivo:invMotivo.join(' · ')});
    }
    if(rows.length > 0){
      bodyHtml += '<div style="display:grid;grid-template-columns:1fr 60px 2fr;gap:6px 12px;font-size:13px;">';
      bodyHtml += '<div style="color:var(--text3);font-size:11px;">CONCEPTO</div>'
                + '<div style="color:var(--text3);font-size:11px;text-align:right;">Nº</div>'
                + '<div style="color:var(--text3);font-size:11px;">MOTIVO / DETALLE</div>';
      rows.forEach(function(r){
        bodyHtml += '<div><strong>'+r.lbl+'</strong></div>'
                  + '<div style="text-align:right;font-family:var(--font-mono);">'+(parseInt(r.num)||0)+'</div>'
                  + '<div style="color:var(--text2);">'+(formatDisplayValue(r.motivo)||'—')+'</div>';
      });
      bodyHtml += '</div>';
    } else {
      bodyHtml += '<div style="color:var(--text3);font-size:12px;">Sin descuentos, anulaciones, invitaciones ni devoluciones declaradas.</div>';
    }
    return _kpiBlockWrap('1B · KPI SALA · descuentos / anulaciones / invitaciones / devoluciones', bodyHtml, '#2ec4b6');
  }

  // ── ENTRENADORES ────────────────────────────────────────────
  if(isEntrenador){
    var CAMPOS_ENTR = [
      ['dir_efectiva',    '📢 Clases dirigidas efectivas'],
      ['dir_no_efectiva', '📢 Clases dirigidas NO efectivas'],
      ['pt',              '🏋 PT individuales'],
      ['pt_duo',          '🏋 PT DUO'],
      ['pt_30',           '🏋 PT 30 min'],
      ['val_funcional',   '📊 Valoraciones funcionales'],
      ['visbody',         '📊 Valoraciones Visbody'],
      ['banera_hielo',    '🧊 Bañeras de hielo']
    ];
    var kpi = null;
    if(s.kpi_entrenador){
      try{ kpi = JSON.parse(s.kpi_entrenador); }catch(e){ kpi = null; }
    }
    if(kpi){
      bodyHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;">';
      var totalAct = 0;
      CAMPOS_ENTR.forEach(function(pair){
        var v = parseInt(kpi[pair[0]])||0; totalAct += v;
        var col = v > 0 ? 'var(--text)' : 'var(--text3)';
        bodyHtml += '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--border);">'
                  + '<span style="color:'+col+';">'+pair[1]+'</span>'
                  + '<strong style="font-family:var(--font-mono);color:'+col+';">'+v+'</strong>'
                  + '</div>';
      });
      bodyHtml += '</div>';
      bodyHtml += '<div style="margin-top:10px;font-size:12px;color:var(--text3);border-top:1px solid var(--border);padding-top:8px;">'
                + 'Total actividades autodeclaradas: <strong style="color:var(--text);font-family:var(--font-mono);">'+totalAct+'</strong> '
                + '· <em>El incentivo oficial se calcula con VirtuGym (Informes → Entrenadores).</em>'
                + '</div>';
    } else {
      bodyHtml += '<div style="color:var(--text3);font-size:12px;">'
                + 'El empleado no rellenó el cuestionario KPI de entrenadores (turno cerrado sin declarar actividad).'
                + '</div>';
    }
    return _kpiBlockWrap('1B · KPI ENTRENADORES · autocontrol de actividad', bodyHtml, '#8b5cf6');
  }

  // ── RECEPCIÓN HOTEL ─────────────────────────────────────────
  if(isRecep){
    // Nota honesta: cross-selling ya se muestra en bloque 5B.
    // Los KPIs simples (check-in/out, leads, clientes) NO están hoy en shifts.
    bodyHtml += '<div style="color:var(--text3);font-size:12px;line-height:1.5;">'
              + 'Los KPIs de check-in, check-out, número de reservas, upsell desayuno, leads Bitrix24 y clientes insatisfechos '
              + '<strong style="color:var(--amber);">se rellenan al cerrar turno pero no se persisten actualmente</strong>. '
              + 'Se guardan solo las ventas cross-selling (visibles en el bloque 5B) y el cuadre de caja.<br><br>'
              + '<em>Fase 2 pendiente:</em> añadir columnas a <code>shifts</code> y persistirlas en <code>submitRecKpi</code>. '
              + 'Hasta entonces, para trazar KPIs de Recepción usa Bitrix24 + POSMEWS + MEWS.'
              + '</div>';
    return _kpiBlockWrap('1B · KPI RECEPCIÓN HOTEL · pendiente Fase 2', bodyHtml, '#f59e0b');
  }

  // ── RECEPCIÓN SYNCROLAB ─────────────────────────────────────
  if(isRecLab){
    bodyHtml += '<div style="color:var(--text3);font-size:12px;">'
              + 'Recepción SYNCROLAB registra el cuadre de caja al cerrar turno. Los KPIs específicos de actividad '
              + '(reservas, no-shows, upsells) no están definidos en shifts todavía — <em>Fase 3</em>.'
              + '</div>';
    return _kpiBlockWrap('1B · KPI RECEPCIÓN SYNCROLAB · pendiente Fase 3', bodyHtml, '#f59e0b');
  }

  // ── COCINA ──────────────────────────────────────────────────
  if(isCocina){
    var mermaFlag = (s.merma_declarada||'').toLowerCase();
    bodyHtml += '<div style="font-size:13px;">'
              + '<span style="color:var(--text3);">Merma declarada: </span>'
              + '<strong>'+(mermaFlag === 'si' ? '✓ Sí (ver bloque de merma abajo)' : mermaFlag === 'no' ? '✗ No' : '—')+'</strong>'
              + '</div>'
              + '<div style="color:var(--text3);font-size:12px;margin-top:6px;">'
              + 'KPIs específicos de cocina (platos vendidos, incidencias de servicio, retrasos) — <em>pendiente Fase 3</em>.'
              + '</div>';
    return _kpiBlockWrap('1B · KPI COCINA · resumen', bodyHtml, '#2ec4b6');
  }

  // ── HOUSEKEEPING / MANT / ADMON / FISIO — placeholder honesto ──
  if(isHK || isMant || isAdmon || isFisio){
    var deptLbl = isHK ? 'HOUSEKEEPING'
                : isMant ? 'MANTENIMIENTO'
                : isAdmon ? 'ADMINISTRACIÓN'
                : 'FISIOTERAPEUTAS';
    bodyHtml += '<div style="color:var(--text3);font-size:12px;line-height:1.5;">'
              + 'Este departamento no tiene KPIs específicos declarados en el turno todavía. '
              + 'Se registran horas, observaciones, checklist y gestiones/incidencias/tareas de forma estándar.<br>'
              + '<em>Fase 3 pendiente:</em> definir KPIs propios (habitaciones limpiadas, incidencias resueltas, gestiones cerradas, sesiones realizadas…).'
              + '</div>';
    return _kpiBlockWrap('1B · KPI '+deptLbl+' · pendiente Fase 3', bodyHtml, '#64748b');
  }

  // Departamento no reconocido: no pintar bloque para no ensuciar el modal.
  return '';
}

// Helper visual — wrapper consistente con el resto de bloques del modal
function _kpiBlockWrap(titulo, innerHtml, color){
  return '<div style="background:var(--bg2);border:1px solid '+color+';border-radius:8px;padding:14px;margin-bottom:12px;">'
       + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:'+color+';letter-spacing:.15em;margin-bottom:10px;">'
       + titulo + '</div>'
       + innerHtml
       + '</div>';
}

window._renderKpisTurno = _renderKpisTurno;
window._kpiBlockWrap    = _kpiBlockWrap;
