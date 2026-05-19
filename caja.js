
// ── HTML INJECTION ─────────────────────────────────────────
(function injectCajaHTML() {
  var root = document.getElementById('caja-root');
  if(!root) { root = document.createElement('div'); root.id='caja-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="screen" id="screen-caja">
  <div class="page-header">
    <div class="page-title">💰 Cierre Caja</div>
    <div class="page-sub">Responsable de turno / Jefe de Sala / F&amp;B / Admin</div>
  </div>
  <div id="caja-alert-area"></div>
  <div class="filter-bar" style="margin-bottom:16px;">
    <div class="fg"><label>Periodo</label>
      <select id="caja-filter-date" onchange="renderCajaList()">
        <option value="hoy">Hoy</option><option value="semana">Esta semana</option>
        <option value="mes">Este mes</option><option value="todo">Todos</option>
      </select></div>
    <div style="margin-left:auto;">
      <button class="btn btn-primary" onclick="openCajaForm()">+ Nuevo Cierre</button>
    </div>
  </div>
  <div id="caja-list" class="tbl-wrap"></div>
</div>
<div class="modal-overlay" id="modal-caja">
  <div class="modal" style="max-width:680px;max-height:90vh;overflow-y:auto;">
    <div class="modal-title">💰 <span id="caja-form-title">Nuevo Cierre de Caja — Sala</span></div>
    <input type="hidden" id="caja-responsable">
    <div style="display:none" id="caja-servicios-check"><input type="checkbox" value="Servicio" checked></div>

    <!-- B1: FONDO INICIAL -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">1 · FONDO INICIAL</div>
      <div class="grid2">
        <div class="fg"><label>Fecha <span class="req">*</span></label><input type="date" id="caja-fecha"></div>
        <div class="fg"><label>Fondo recibido del turno anterior (€)</label>
          <input type="text" inputmode="decimal" id="caja-fondo-ini" placeholder="0.00" readonly style="opacity:0.65;cursor:not-allowed;"></div>
      </div>
    </div>

    <!-- B2: VALORES POSMEWS -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">2 · VALORES SISTEMA POSMEWS</div>
      <div class="grid2">
        <div class="fg"><label>Cash POSMEWS (€)</label>
          <input type="text" inputmode="decimal" id="caja-ef-posmews" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Tarjeta POSMEWS (€)</label>
          <input type="text" inputmode="decimal" id="caja-tar-posmews" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Stripe POSMEWS (€)</label>
          <input type="text" inputmode="decimal" id="caja-str-posmews" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
      </div>
    </div>

    <!-- B3: CARGOS INTERNOS -->
    <div style="background:var(--bg2);border:1px solid #f59e0b;border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#d97706;letter-spacing:.15em;margin-bottom:10px;">3 · CARGOS Y CONCEPTOS INTERNOS</div>
      <div class="grid2">
        <div class="fg"><label>Room Charge (€)</label>
          <input type="text" inputmode="decimal" id="caja-room" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>SYNCROLAB Charge clientes (€)</label>
          <input type="text" inputmode="decimal" id="caja-syncrolab" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Cargo Alexander (€)</label>
          <input type="text" inputmode="decimal" id="caja-alexander" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#d97706;letter-spacing:.1em;margin-bottom:8px;">PENSIONES <span style="font-weight:400;color:var(--text3);">— Informativo · no genera diferencia obligatoria</span></div>
        <div class="grid2">
          <div class="fg"><label>Pensiones desayunos (nº pax)</label>
            <input type="text" inputmode="decimal" id="caja-pension-desayuno-pax" placeholder="0"></div>
          <div class="fg"><label>Pensiones comida+cena (nº pax)</label>
            <input type="text" inputmode="decimal" id="caja-pension-comidacena-pax" placeholder="0"></div>
          <div class="fg"><label>€ Pensiones Desayunos (importe)</label>
            <input type="text" inputmode="decimal" id="caja-eur-pension-desayuno" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
          <div class="fg"><label>€ Pensiones Comidas+Cenas (importe)</label>
            <input type="text" inputmode="decimal" id="caja-eur-pension-comidacena" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        </div>
      </div>
    </div>

    <!-- B4: VALORES REALES -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">4 · VALORES REALES FÍSICOS</div>
      <div class="grid2">
        <div class="fg"><label>Cash real contado (€)</label>
          <input type="text" inputmode="decimal" id="caja-ef-real" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>TPV físico (€)</label>
          <input type="text" inputmode="decimal" id="caja-tar-tpv" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Stripe plataforma (€)</label>
          <input type="text" inputmode="decimal" id="caja-str-real" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Propinas TPV (€)</label>
          <input type="text" inputmode="decimal" id="caja-propinas-tpv" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Propinas efectivo (€)</label>
          <input type="text" inputmode="decimal" id="caja-propinas-ef" placeholder="0.00" oninput="fixLeadingZeros(this)"></div>
      </div>
    </div>

    <!-- B5: DIFERENCIAS CALCULADAS -->
    <div style="background:var(--bg2);border:2px solid #3b82f6;border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.15em;margin-bottom:10px;">5 · DIFERENCIAS CALCULADAS — Calculado automáticamente</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;margin-bottom:10px;">
        <div><div style="font-size:11px;color:var(--text3);">Δ Cash</div><div id="caja-dif-ef" style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--green);">+0.00 €</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Δ TPV (neto propinas)</div><div id="caja-dif-tar" style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--green);">+0.00 €</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Δ Stripe</div><div id="caja-dif-str" style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--green);">+0.00 €</div></div>
      </div>
      <div style="text-align:center;padding:12px;background:var(--bg3);border-radius:6px;">
        <div style="font-size:11px;color:var(--text3);">Diferencia operativa total</div>
        <div id="dif-sala-total" style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:var(--green);">+0.00 €</div>
      </div>
      <!-- aliases for compatibility -->
      <div style="display:none"><span id="dif-ef-disp"></span><span id="dif-tar-disp"></span><span id="dif-str-disp"></span></div>
      <div id="caja-diferencia-alert" style="display:none;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px;color:#dc2626;font-size:12px;margin-top:10px;">⚠ Diferencia detectada — explicación obligatoria antes de guardar</div>
    </div>

    <!-- B6: EXPLICACIÓN DIFERENCIA -->
    <div id="caja-expl-bloque" style="display:none;background:var(--bg2);border:1px solid var(--red);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--red);letter-spacing:.15em;margin-bottom:10px;">6 · GESTIÓN DE DIFERENCIAS</div>
      <div class="fg" style="margin-bottom:10px;">
        <label>Explicación de la diferencia <span class="req">*</span></label>
        <textarea id="caja-expl-diferencia" rows="2" placeholder="Explica el motivo de la diferencia detectada..."></textarea>
      </div>
      <div class="fg" style="margin-bottom:10px;">
        <label>Acción tomada <span class="req">*</span></label>
        <textarea id="caja-accion-diferencia" rows="2" placeholder="¿Qué hiciste para resolver la diferencia?"></textarea>
      </div>
      <div class="fg">
        <label>¿Informado al responsable?</label>
        <div style="display:flex;gap:10px;margin-top:6px;">
          <button type="button" id="caja-informado-si" class="btn btn-secondary btn-sm" onclick="setCajaInformado(true)">Sí</button>
          <button type="button" id="caja-informado-no" class="btn btn-secondary btn-sm" onclick="setCajaInformado(false)">No</button>
        </div>
      </div>
    </div>

    <!-- COMENTARIO GENERAL -->
    <div class="fg" style="margin-bottom:12px;">
      <label>Comentario general (opcional)</label>
      <textarea id="caja-comentario" rows="2" placeholder="Observaciones adicionales..."></textarea>
    </div>

    <!-- B7: FONDO FINAL -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">7 · FONDO FINAL Y TRASPASO</div>
      <div class="grid2">
        <div class="fg"><label>Retiro efectivo caja fuerte (€)</label>
          <input type="text" inputmode="decimal" id="caja-retiro" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Fondo esperado a traspasar (€)</label>
          <div id="caja-fondo-esperado" style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--green);padding:8px 0;">0.00 €</div></div>
        <div class="fg"><label>Fondo real a traspasar (€) <span class="req">*</span></label>
          <input type="text" inputmode="decimal" id="caja-fondo-real" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div style="display:flex;align-items:flex-end;padding-bottom:4px;">
          <div id="caja-fondo-dif" style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text3);">—</div>
        </div>
      </div>
    </div>

    <!-- TOTALES -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div class="grid2">
        <div class="fg"><label>Total neto sin IVA (€)</label>
          <input type="text" inputmode="decimal" id="caja-total-neto-manual" placeholder="0.00" oninput="fixLeadingZeros(this)"></div>
        <div class="fg">
          <label>Total bruto — Calculado automáticamente</label>
          <div id="caja-total-bruto-display" style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--blue);padding:8px 0;">0.00 €</div>
          <input type="hidden" id="caja-total-bruto-manual">
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Verificación con reales: <span id="caja-total-verif" style="font-weight:700;">—</span></div>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('modal-caja')">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCajaForm()">💾 Guardar Cierre</button>
    </div>
  </div>
</div>
<div id="modal-caja-offer" style="position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:700;padding:16px;">
  <div style="background:var(--bg2);border:2px solid #3b82f6;border-radius:14px;padding:24px;width:100%;max-width:440px;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.15em;margin-bottom:8px;">SALA · TURNO COMPLETADO</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">¿Realizar cierre de caja ahora?</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:20px;">Como responsable de turno, puedes hacer el cierre de caja o dejarlo para más tarde.</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button onclick="acceptCajaOffer()" style="width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">💰 Sí, realizar cierre de caja</button>
      <button onclick="declineCajaOffer()" style="width:100%;padding:14px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">No, solo guardar follow-up</button>
    </div>
  </div>
</div>`;
})();

function initCajaForm() {
  renderCajaList();
}

function openCajaForm(existingId) {
  _editingCajaId = existingId || null;
  var title = document.getElementById('caja-form-title');
  if(title) title.textContent = existingId ? 'Editar Cierre de Caja' : 'Nuevo Cierre de Caja';
  var fechaEl = document.getElementById('caja-fecha');
  if(fechaEl) fechaEl.value = today();
  var respEl = document.getElementById('caja-responsable');
  if(respEl){
    respEl.value = currentUser.nombre + ' — ' + currentUser.puesto;
    respEl.readOnly = (currentUser.rol !== 'admin');
  }
  var lastShiftLink = document.getElementById('caja-shift-link');
  if(lastShiftLink) lastShiftLink.value = window._lastSavedShiftId || '';
  ['caja-efectivo','caja-tarjeta','caja-room','caja-alexander',
   'caja-pension-d','caja-pension-m','caja-pension-c','caja-propinas',
   'caja-desc-imp','caja-desc-num','caja-anul-imp','caja-anul-num',
   'caja-inv-imp','caja-inv-num','caja-diferencia','caja-comentario',
   'caja-ef-real','caja-ef-posmews','caja-fondo-fin','caja-retiro'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  // BUG-29 SALA: fondo inicial = fondo_final del último cierre, readonly en HTML
  var fondoIniEl = document.getElementById('caja-fondo-ini');
  if(fondoIniEl) fondoIniEl.value = '';
  if(!existingId){
    dbGetAll('sala_cash_closures').then(function(rows){
      var sorted = rows
        .filter(function(r){ return r.fondo_real_sala != null || r.fondo_final != null; })
        .sort(function(a,b){
          return (b.fecha || '').localeCompare(a.fecha || '') ||
                 (b.created_at || '').localeCompare(a.created_at || '');
        });
      var ultimo = sorted[0];
      if(fondoIniEl && ultimo){
        fondoIniEl.value = parseFloat(ultimo.fondo_real_sala || ultimo.fondo_final || 0).toFixed(2);
        calcCajaDifs();
      }
    });
  } else {
    dbGetAll('sala_cash_closures').then(function(rows){
      var row = rows.find(function(r){ return r.id === existingId; });
      if(!row) return;
      if(fondoIniEl && row.fondo_inicial != null) fondoIniEl.value = parseFloat(row.fondo_inicial).toFixed(2);
      calcCajaDifs();
      // Bloquear si el usuario no puede editar este cierre
      var canEditCaja = currentUser.rol === 'admin' || currentUser.rol === 'fb';
      var isPendiente = row.estado === 'Pendiente validación';
      var esPropio    = row.responsable_id === currentUser.id;
      var canEdit     = canEditCaja || (isPendiente && esPropio);
      if(!canEdit){
        document.querySelectorAll('#modal-caja input, #modal-caja textarea, #modal-caja select').forEach(function(el){ el.readOnly=true; el.style.pointerEvents='none'; });
        var btnGuardar = document.getElementById('caja-btn-guardar');
        if(btnGuardar) btnGuardar.style.display = 'none';
        var titleEl = document.getElementById('caja-form-title');
        if(titleEl) titleEl.textContent = 'Ver Cierre de Caja (solo lectura)';
      }
    });
  }
  document.querySelectorAll('#caja-servicios-check input[type=checkbox]').forEach(function(cb){ cb.checked = false; });
  calcCajaTotal();
  document.getElementById('modal-caja').classList.add('open');
}

var _cajaInformado = false;
function setCajaInformado(val){
  _cajaInformado = val;
  var si = document.getElementById('caja-informado-si');
  var no = document.getElementById('caja-informado-no');
  if(si) si.style.background = val ? 'var(--green)' : '';
  if(no) no.style.background = !val ? 'var(--red)' : '';
}

function calcCajaTotal() { calcCajaDifs(); }

function calcCajaDifs() {
  function getV(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  function setColor(el, val) {
    if(!el) return;
    var abs = Math.abs(val);
    el.style.color = abs < 0.01 ? 'var(--green)' : abs > 5 ? 'var(--red)' : 'var(--amber)';
  }
  function fmt(val){ return (val >= 0 ? '+' : '') + val.toFixed(2) + ' €'; }
  function setEl(id, val){
    var el = document.getElementById(id);
    if(el){ el.textContent = fmt(val); setColor(el, val); }
  }

  // EFECTIVO
  // diferencia_efectivo = efectivo_real_contado - (fondo_inicial + cash_posmews)
  var efReal   = getV('caja-ef-real');
  var efPosmews= getV('caja-ef-posmews');
  var fondoIni = getV('caja-fondo-ini');
  var fondoFin = getV('caja-fondo-fin');
  var retiro   = getV('caja-retiro');
  var efEsperado = fondoIni + efPosmews;
  var difEf = efReal - efEsperado;
  // Control retiro: efectivo_real debe = fondo_final + retiro
  var difRetiro = efReal - fondoFin - retiro;

  var efEspEl = document.getElementById('caja-ef-esperado');
  if(efEspEl) efEspEl.textContent = efEsperado.toFixed(2) + ' €';
  setEl('caja-dif-ef', difEf);
  setEl('dif-ef-disp', difEf);
  var retiroEl = document.getElementById('caja-dif-retiro');
  if(retiroEl){
    retiroEl.textContent = Math.abs(difRetiro) < 0.01 ? '✓ OK retiro' : 'Δ retiro: '+fmt(difRetiro);
    retiroEl.style.color = Math.abs(difRetiro) < 0.01 ? 'var(--green)' : 'var(--red)';
  }

  // TARJETA: diferencia = (TPV - Propinas_TPV) - POSMEWS
  var tarPosmews = getV('caja-tar-posmews');
  var tarTpv     = getV('caja-tar-tpv');
  var propinasTpv= getV('caja-propinas-tpv');
  var tarCuadrada = tarTpv - propinasTpv;
  var difTar = tarCuadrada - tarPosmews;
  setEl('caja-dif-tar', difTar);
  setEl('dif-tar-disp', difTar);

  // STRIPE
  var strPosmews = getV('caja-str-posmews');
  var strReal    = getV('caja-str-real');
  var difStr = strReal - strPosmews;
  setEl('caja-dif-str', difStr);
  setEl('dif-str-disp', difStr);

  // DIFERENCIA OPERATIVA SALA (efectivo + tarjeta + stripe only)
  var difTotal = difEf + difTar + difStr;
  var totalEl = document.getElementById('dif-sala-total');
  if(totalEl){ totalEl.textContent = fmt(difTotal); setColor(totalEl, difTotal); }

  // Alert
  var alertEl = document.getElementById('caja-diferencia-alert');
  if(alertEl) alertEl.style.display = Math.abs(difTotal) > 0.01 ? 'block' : 'none';
  // Show * on comentario when diferencia exists
  var reqEl = document.getElementById('caja-comentario-req');
  if(reqEl) reqEl.style.display = Math.abs(difTotal) > 0.01 ? 'inline' : 'none';

  // FONDO ESPERADO = Cash real - Retiro
  var fondoRealV = getV('caja-ef-real');
  var retiroV    = getV('caja-retiro');
  var fondoEspV  = fondoRealV - retiroV;
  var fondoEspEl = document.getElementById('caja-fondo-esperado');
  if(fondoEspEl) fondoEspEl.textContent = fondoEspV.toFixed(2) + ' €';

  // FONDO DIF = Fondo real - Fondo esperado
  var fondoRealInput = getV('caja-fondo-real');
  var fondoDif = fondoRealInput - fondoEspV;
  var fondoDifEl = document.getElementById('caja-fondo-dif');
  if(fondoDifEl){
    fondoDifEl.textContent = (Math.abs(fondoDif)<0.01 ? '✓ OK' : (fondoDif>=0?'+':'')+fondoDif.toFixed(2)+' €');
    fondoDifEl.style.color = Math.abs(fondoDif)<0.01 ? 'var(--green)' : Math.abs(fondoDif)>5 ? 'var(--red)' : 'var(--amber)';
  }

  // TOTAL BRUTO
  var totalBruto = getV('caja-ef-posmews') + getV('caja-tar-posmews') + getV('caja-str-posmews')
                 + getV('caja-room') + getV('caja-syncrolab') + getV('caja-alexander')
                 + getV('caja-eur-pension-desayuno') + getV('caja-eur-pension-comidacena');
  var brutoEl = document.getElementById('caja-total-bruto-display');
  if(brutoEl) brutoEl.textContent = totalBruto.toFixed(2) + ' €';

  // VERIFICACION CON REALES
  var totalReal = getV('caja-ef-real') + (getV('caja-tar-tpv') - getV('caja-propinas-tpv')) + getV('caja-str-real');
  var difVerif  = totalBruto - totalReal;
  var verifEl   = document.getElementById('caja-total-verif');
  if(verifEl){
    verifEl.textContent = Math.abs(difVerif)<0.01 ? '✓ Cuadrado' : ('Δ '+(difVerif>=0?'+':'')+difVerif.toFixed(2)+'€');
    verifEl.style.color = Math.abs(difVerif)<0.01 ? 'var(--green)' : 'var(--amber)';
  }
}

function checkCajaDiferencia() {
  var mediosTmp=(parseFloat((document.getElementById('caja-efectivo')||{}).value)||0)+(parseFloat((document.getElementById('caja-tarjeta')||{}).value)||0)+(parseFloat((document.getElementById('caja-room')||{}).value)||0)+(parseFloat((document.getElementById('caja-alexander')||{}).value)||0);
  var posmewsTmp=parseFloat((document.getElementById('caja-posmews-bruto')||{}).value)||0;
  var dif = posmewsTmp>0?mediosTmp-posmewsTmp:0;
  var alert = document.getElementById('caja-diferencia-alert');
  if(alert) alert.style.display = Math.abs(dif) > 5 ? 'block' : 'none';
}

function getCajaServicios() {
  var checked = [];
  document.querySelectorAll('#caja-servicios-check input[type=checkbox]:checked').forEach(function(cb){ checked.push(cb.value); });
  // If no services checked (hidden), use a default
  if(checked.length === 0) checked = ['Servicio'];
  return checked;
}

async function saveCajaForm() {
  var fecha = (document.getElementById('caja-fecha')||{}).value||today();
  var servicios = getCajaServicios();
  // servicios auto-filled
  // Calculate diferencia operativa from current form values
  var _efR=parseFloat((document.getElementById('caja-ef-real')||{}).value)||0;
  var _efP=parseFloat((document.getElementById('caja-ef-posmews')||{}).value)||0;
  var _foI=parseFloat((document.getElementById('caja-fondo-ini')||{}).value)||0;
  var _tTP=parseFloat((document.getElementById('caja-tar-tpv')||{}).value)||0;
  var _tPS=parseFloat((document.getElementById('caja-tar-posmews')||{}).value)||0;
  var _pTV=parseFloat((document.getElementById('caja-propinas-tpv')||{}).value)||0;
  var _sR=parseFloat((document.getElementById('caja-str-real')||{}).value)||0;
  var _sP=parseFloat((document.getElementById('caja-str-posmews')||{}).value)||0;
  var _dEf = _efR - (_foI + _efP);
  var _dTar = (_tTP - _pTV) - _tPS;
  var _dStr = _sR - _sP;
  var dif = _dEf + _dTar + _dStr;
  var comentario = (document.getElementById('caja-comentario')||{}).value||'';
  if(Math.abs(dif) > 0.01 && !comentario.trim()) {
    toast('Hay diferencia en caja — el comentario es obligatorio','err');
    document.getElementById('caja-comentario').focus();
    return;
  }

  function getCV(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  var efReal    = getCV('caja-ef-real');
  var efPosmews = getCV('caja-ef-posmews');
  var fondoIni  = getCV('caja-fondo-ini');
  var fondoFin  = getCV('caja-fondo-fin');
  var retiro    = getCV('caja-retiro');
  var tarPosmews= getCV('caja-tar-posmews');
  var tarTpv    = getCV('caja-tar-tpv');
  var propinasTpv = getCV('caja-propinas-tpv');
  var strPosmews= getCV('caja-str-posmews');
  var strReal   = getCV('caja-str-real');
  var difEf  = efReal - (fondoIni + efPosmews);
  var difTar = (tarTpv - propinasTpv) - tarPosmews;
  var difStr = strReal - strPosmews;
  var difOperativa = difEf + difTar + difStr;
  var mediosPago = efReal + tarTpv + strReal;
  var bruto = parseFloat((document.getElementById('caja-total-bruto-manual')||{}).value)||0;
  var ajustes=(parseFloat((document.getElementById('caja-desc-imp')||{}).value)||0)
             +(parseFloat((document.getElementById('caja-anul-imp')||{}).value)||0)
             +(parseFloat((document.getElementById('caja-inv-imp')||{}).value)||0);

  var closure = {
    id: _editingCajaId || genId(),
    fecha: fecha,
    servicios: JSON.stringify(servicios),
    responsable_id: currentUser.id,
    responsable_nombre: currentUser.nombre,
    // Payment fields
    efectivo_real: efReal,
    efectivo_posmews: efPosmews,
    fondo_inicial: fondoIni,
    fondo_final: getCV('caja-fondo-real'),
    fondo_real_sala: getCV('caja-fondo-real'),
    retiro_caja_fuerte: retiro,
    diferencia_efectivo: difEf,
    tarjeta_posmews: tarPosmews,
    tarjeta_tpv: tarTpv,
    propinas_tpv: propinasTpv,
    propinas: parseFloat((document.getElementById('caja-propinas')||{}).value)||0,
    diferencia_tarjeta: difTar,
    stripe_posmews: strPosmews,
    stripe_real: strReal,
    diferencia_stripe: difStr,
    diferencia_operativa_sala: difOperativa,
    diferencia_caja: difOperativa,
    // PMS fields
    room_charge: getCV('caja-room'),
    cargo_alexander: getCV('caja-alexander'),
    pension_desayuno: getCV('caja-pension-d'),
    media_pension: getCV('caja-pension-m'),
    pension_completa: getCV('caja-pension-c'),
    // Totals (manual entry)
    subtotal_neto: parseFloat((document.getElementById('caja-total-neto-manual')||{}).value)||0,
    total_bruto: parseFloat((document.getElementById('caja-total-bruto-manual')||{}).value)||0,
    total_medios_pago: mediosPago,
    total_ajustes: ajustes,
    comentario: comentario,
    estado: 'Pendiente validación',
    created_at: localTs(),
    updated_at: localTs()
  };

  try {
    var cajaUrl = SUPABASE_URL + '/rest/v1/sala_cash_closures';
    var cajaMethod = _editingCajaId ? 'PATCH' : 'POST';
    var cajaFetchUrl = _editingCajaId ? cajaUrl + '?id=eq.' + encodeURIComponent(_editingCajaId) : cajaUrl;
    var cajaRes = await fetch(cajaFetchUrl, {
      method: cajaMethod,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(closure)
    });
    console.log('[CAJA SAVE] status:', cajaRes.status, 'id:', closure.id);
    if(!cajaRes.ok){
      var errTxt = await cajaRes.text();
      console.error('[CAJA ERROR]', errTxt);
      toast('Error Supabase cierre caja: ' + cajaRes.status, 'err');
      return;
    }
    invalidateCache('sala_cash_closures');
    closeModal('modal-caja');
    toast('Cierre de caja guardado ✓','ok');
    await renderCajaList();
    // Refresh validation tab if open
    var valCajaEl = document.getElementById('val-caja-table');
    if(valCajaEl) await renderValCajaList();
  } catch(e) {
    console.error('Caja save error:', e);
    toast('Error al guardar cierre de caja: ' + e.message,'err');
  }
}

async function renderCajaList() {
  var el = document.getElementById('caja-list');
  if(!el) return;
  el.innerHTML = '<div style="color:var(--text3);font-family:var(--font-mono);font-size:12px;padding:20px;">Cargando...</div>';
  try {
    var data = await dbGetAll('sala_cash_closures');
    // Permission: employees only see own closures
    var canSeeAll = currentUser.rol==='admin'||currentUser.rol==='fb'||currentUser.rol==='chef'||(currentUser.validador==1||currentUser.validador===true);
    if(!canSeeAll){
      data = data.filter(function(c){ return c.responsable_id===currentUser.id||c.responsable_nombre===currentUser.nombre; });
    }
    var filter = (document.getElementById('caja-filter-date')||{}).value||'hoy';
    var today2 = today();
    data = data.filter(function(c){
      if(filter==='hoy') return c.fecha === today2;
      if(filter==='semana') return c.fecha >= startOfWeek();
      if(filter==='mes') return c.fecha >= startOfMonth();
      return true;
    });
    data.sort(function(a,b){ return b.fecha.localeCompare(a.fecha); });
    if(!data.length){
      el.innerHTML='<div class="empty"><div class="empty-icon">💰</div><div class="empty-text">Sin cierres en el periodo seleccionado</div></div>';
      return;
    }
    var rows = data.map(function(c){
      var servs = displayServicio(c.servicios||'');
      var diffColor = Math.abs(c.diferencia_caja||0)>5?'var(--red)':'var(--green)';
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(c.fecha)+'<br><span style="color:var(--text3)">'+(c.created_at?c.created_at.slice(11,16):'—')+'</span></td>'
        +'<td>'+servs+'</td>'
        +'<td style="font-weight:600">'+c.responsable_nombre+'</td>'
        +'<td style="font-family:var(--font-mono);font-weight:700;color:#3b82f6">'+(c.subtotal_neto||0).toFixed(2)+' €</td>'
        +'<td style="font-family:var(--font-mono);color:'+diffColor+'">'+(c.diferencia_caja>=0?'+':'')+((c.diferencia_caja||0).toFixed(2))+' €</td>'
        +'<td>'+bEstado(c.estado)+'</td>'
        +'<td><button class="btn btn-secondary btn-sm" onclick="openCajaForm(this.dataset.id)" data-id="'+c.id+'">✏️</button></td>'
        +'</tr>';
    }).join('');
    el.innerHTML='<table><tr><th>Fecha</th><th>Servicio</th><th>Responsable</th><th>Total neto</th><th>Diferencia</th><th>Estado</th><th></th></tr>'+rows+'</table>';
  } catch(e) {
    el.innerHTML='<div class="alert a-warn">Tabla sala_cash_closures pendiente de crear en Supabase. Ejecuta el SQL de configuración.</div>';
  }
}

function getServicioValue() {
  // Recepción: return turno (Mañana/Tarde/Noche)
  if(currentUser && currentUser.area === 'Recepción') return getRecTurnoValue();
  var isSala = currentUser && currentUser.area === 'Sala';
  if(isSala) {
    var checked = [];
    document.querySelectorAll('input[name="servicio-sala"]:checked').forEach(function(cb){ checked.push(cb.value); });
    return checked.length > 0 ? JSON.stringify(checked) : '';
  }
  // Cocina also uses multiselect now
  var checkedC = [];
  document.querySelectorAll('input[name="servicio-cocina"]:checked').forEach(function(cb){ checkedC.push(cb.value); });
  if(checkedC.length > 0) return JSON.stringify(checkedC);
  // Fallback to single select
  return (document.getElementById('t-servicio')||{}).value||'';
}

function displayServicio(val) {
  return typeof formatServiceOrTurn === 'function' ? formatServiceOrTurn(val) : (val || '—');
}

// ═══════════════════════════════════════════════════════════
// AJUSTES MODAL (Sala — before checklist)
// ═══════════════════════════════════════════════════════════
var _ajustesChoice = null;
var _ajustesLines = [];

function openAjustesModal() {
  _ajustesChoice = null;
  _ajustesLines = [];
  // Reset UI
  document.getElementById('ajustes-lines-block').style.display = 'none';
  document.getElementById('ajustes-lines').innerHTML = '';
  document.getElementById('ajustes-confirm-btn').disabled = true;
  ['ajustes-no-btn','ajustes-si-btn'].forEach(function(id){
    var el=document.getElementById(id); if(el){el.style.outline='none';el.style.boxShadow='none';}
  });
  document.getElementById('modal-ajustes').style.display = 'flex';
}

function ajustesChoice(choice) {
  _ajustesChoice = choice;
  var noBtn = document.getElementById('ajustes-no-btn');
  var siBtn = document.getElementById('ajustes-si-btn');
  var linesBlock = document.getElementById('ajustes-lines-block');
  var confirmBtn = document.getElementById('ajustes-confirm-btn');
  if(choice === 'no') {
    if(noBtn) noBtn.style.boxShadow = '0 0 0 2px var(--green)';
    if(siBtn) siBtn.style.boxShadow = 'none';
    if(linesBlock) linesBlock.style.display = 'none';
    if(confirmBtn) confirmBtn.disabled = false;
  } else {
    if(siBtn) siBtn.style.boxShadow = '0 0 0 2px #3b82f6';
    if(noBtn) noBtn.style.boxShadow = 'none';
    if(linesBlock) linesBlock.style.display = 'block';
    if(!document.getElementById('ajustes-lines').children.length) addAjusteLine();
    if(confirmBtn) confirmBtn.disabled = false;
  }
}

function addAjusteLine() {
  var container = document.getElementById('ajustes-lines');
  var idx = container.children.length;
  var div = document.createElement('div');
  div.className = 'card';
  div.style.marginBottom = '8px';
  div.style.padding = '10px';
  div.style.borderLeft = '3px solid #3b82f6';
  div.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
    +'<div class="fg"><label>Tipo</label>'
    +'<select id="aj-tipo-'+idx+'" style="font-size:13px;">'
    +'<option>Descuento</option><option>Anulación</option><option>Invitación</option>'
    +'<option>Devolución</option><option>Rehecho</option><option>Error de cobro</option>'
    +'<option>Error TPV</option><option>Cargo habitación incorrecto</option>'
    +'<option>Cargo Alexander</option><option>Otro</option>'
    +'</select></div>'
    +'<div class="fg"><label>Nº operaciones</label>'
    +'<input type="text" inputmode="decimal" id="aj-num-'+idx+'" min="1" value="1" style="font-size:13px;"></div>'
    +'<div class="fg"><label>Importe estimado (€)</label>'
    +'<input type="text" inputmode="decimal" id="aj-imp-'+idx+'" placeholder="0.00" style="font-size:13px;"></div>'
    +'<div class="fg"><label>¿Comunicado al responsable?</label>'
    +'<div class="toggle-group">'    +'<button class="tbtn" id="aj-resp-si-'+idx+'" data-idx="'+idx+'" data-val="si" onclick="setAjToggleBtn(this)">SÍ</button>'    +'<button class="tbtn" id="aj-resp-no-'+idx+'" data-idx="'+idx+'" data-val="no" onclick="setAjToggleBtn(this)">NO</button>'    +'</div></div>'
    +'<div class="fg sp2"><label>Motivo</label>'
    +'<input type="text" id="aj-motivo-'+idx+'" placeholder="Describe brevemente" style="font-size:13px;"></div>'
    +'</div>'
    +'<button onclick="this.parentElement.remove()" style="margin-top:6px;background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;">✕ Eliminar línea</button>';
  container.appendChild(div);
}

var _ajToggles = {};
function setAjToggle(idx, val) { _ajToggles[idx] = val; }
function setAjToggleBtn(btn) {
  var idx = btn.getAttribute('data-idx');
  var val = btn.getAttribute('data-val');
  _ajToggles[String(idx)] = val;
  var si = document.getElementById('aj-resp-si-'+idx);
  var no = document.getElementById('aj-resp-no-'+idx);
  if(si){ si.classList.toggle('active', val==='si'); si.style.background=val==='si'?'var(--green)':''; si.style.color=val==='si'?'#fff':''; }
  if(no){ no.classList.toggle('active', val==='no'); no.style.background=val==='no'?'var(--red)':''; no.style.color=val==='no'?'#fff':''; }
}

function collectAjusteLines() {
  var lines = [];
  var container = document.getElementById('ajustes-lines');
  if(!container) return lines;
  var count = container.children.length;
  for(var i=0;i<count;i++){
    var tipo = (document.getElementById('aj-tipo-'+i)||{}).value||'';
    var num = parseInt((document.getElementById('aj-num-'+i)||{}).value)||1;
    var imp = parseFloat((document.getElementById('aj-imp-'+i)||{}).value)||0;
    var motivo = (document.getElementById('aj-motivo-'+i)||{}).value||'';
    var comunicado = _ajToggles[i]||'';
    if(tipo) lines.push({tipo,num,importe:imp,motivo,comunicado_responsable:comunicado});
  }
  return lines;
}

function confirmAjustes() {
  if(_ajustesChoice === 'si') {
    _ajustesLines = collectAjusteLines();
    if(_ajustesLines.length === 0) { toast('Añade al menos una línea de ajuste','err'); return; }
  } else {
    _ajustesLines = [];
  }
  document.getElementById('modal-ajustes').style.display = 'none';
  // Open checklist
  chkOpen({});
}

function closeAjustesModal() {
  document.getElementById('modal-ajustes').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// ── SEARCHABLE EMPLOYEE SELECT WIDGET ────────────────────────
// Replaces a native <select> with a filterable list.
// Native <select> is kept hidden + in sync so all existing save functions work unchanged.
function _initEmpSearchSelect(selectId, placeholder) {
  var sel = document.getElementById(selectId);
  if(!sel) return;
  var wrapId = selectId + '-sw';
  var old = document.getElementById(wrapId);
  if(old) old.remove();
  sel.style.display = 'none';
  var opts = Array.from(sel.options);
  var wrap = document.createElement('div');
  wrap.id = wrapId;
  wrap.innerHTML =
    '<input type="search" id="'+wrapId+'-q" placeholder="'+(placeholder||'Buscar empleado...')+'" autocomplete="off" '
    +'style="width:100%;border-radius:6px 6px 0 0;margin-bottom:0;">'
    +'<div id="'+wrapId+'-res" style="background:var(--bg);border:1px solid var(--border);border-top:none;'
    +'border-radius:0 0 6px 6px;max-height:160px;overflow-y:auto;"></div>';
  sel.parentNode.insertBefore(wrap, sel.nextSibling);
  var inp = document.getElementById(wrapId+'-q');
  var res = document.getElementById(wrapId+'-res');
  function render(q) {
    q = (q||'').toLowerCase().trim();
    var list = opts.filter(function(o) { return !q || o.textContent.toLowerCase().indexOf(q) !== -1; });
    if(!list.length) { res.innerHTML='<div style="padding:10px;font-size:12px;color:var(--text3);">Sin resultados</div>'; return; }
    res.innerHTML = list.map(function(o) {
      var active = o.value && o.value === sel.value;
      return '<div data-v="'+o.value+'" style="padding:9px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);'
        +(active?'background:rgba(46,196,182,.12);color:#2ec4b6;font-weight:600;':'color:var(--text);')
        +'">'+o.textContent+'</div>';
    }).join('');
    res.querySelectorAll('[data-v]').forEach(function(div) {
      div.addEventListener('mousedown', function(e) {
        e.preventDefault();
        sel.value = div.getAttribute('data-v');
        inp.value = sel.value ? div.textContent : '';
        render('');
      });
    });
  }
  inp.addEventListener('input', function() { render(inp.value); });
  if(sel.value && sel.selectedOptions[0]) inp.value = sel.selectedOptions[0].textContent;
  render('');
}

// ADD POSTERIOR ERROR (FIO post-validation)
// ═══════════════════════════════════════════════════════════

async function renderValCajaList() {
  var el = document.getElementById('val-caja-table');
  if(!el) return;
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
      var difOp = c.diferencia_operativa_sala||0;
      var difColor = Math.abs(difOp)<0.01?'var(--green)':Math.abs(difOp)>5?'var(--red)':'var(--amber)';
      var isPendiente = c.estado!=='Validado final';
      var isAdmin = currentUser.rol==='admin';
      var canEdit = isAdmin||currentUser.rol==='fb';
      var canValidar = canEdit;
      var totalPens = (parseInt(c.pension_desayuno)||0)+(parseInt(c.media_pension)||0)+(parseInt(c.pension_completa)||0);
      // BUG-CAJ-04: Total ajustes (desc+anulaciones+invitaciones) — nuevo campo guardado
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
    el.innerHTML='<table><tr><th>Fecha</th><th>Servicio</th><th>Responsable</th><th>Efectivo</th><th>Retiro</th><th>Tarjeta</th><th>Stripe</th><th>Neto</th><th>Bruto</th><th>Diferencia</th><th>Total ajustes</th><th>Pensiones</th><th>Estado</th><th>Acción</th></tr>'+rows+'</table>';
  } catch(e) {
    el.innerHTML='<div class="alert a-warn">No se puede cargar — ejecuta primero el SQL de Sala Phase 1.</div>';
  }
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
      +'<span style="'+(mono?'font-family:var(--font-mono);':'')+( color?'color:'+color+';font-weight:700':'')+'">'+ val+'</span>'
      +'</div>';
  }

  var html = '<div style="padding:4px 0">'
    + row('Fecha / Hora cierre', fmtDate(c.fecha) + (c.created_at ? ' · ' + c.created_at.slice(11,16) : ''))
    + row('Responsable', c.responsable_nombre, false)
    + row('Servicio', displayServicio(c.servicios||''), false)
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

  // Use existing detail overlay or create inline modal
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
  // Pick next state based on current state
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
  // Save follow-up shift
  await _doSaveTurno();
  // Navigate to caja and open form
  setTimeout(function(){
    // Click the caja nav button directly
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

// renderCostTable() — defined in dashboard.js (respects _dashCurrentDept)

function fixLeadingZeros(el) {
  var v = el.value.replace(',', '.');
  el.value = v;
  if(v.length > 1 && v[0] === '0' && v[1] !== '.') {
    el.value = parseFloat(v) || 0;
  }
}

function switchDept(newDept) {
  if(!currentUser) return;
  currentUser.area = newDept;
  currentUser._activeDept = newDept;
  // Update badge color by dept
  var badge = document.getElementById('topbar-dept-badge');
  if(badge){
    badge.textContent = newDept.toUpperCase();
    badge.style.color = newDept==='Recepción'?'#8b5cf6':newDept==='Sala'?'#3b82f6':newDept==='Cocina'?'#f59e0b':'#2ec4b6';
    badge.style.borderColor = badge.style.color;
  }
  // Update dept switcher
  var ds=document.getElementById('dept-switcher');
  if(ds) ds.value=newDept;
  // Rebuild nav for new dept
  buildNav();
  showScreen('turno');
  setTimeout(function(){ initTurnoForm(); }, 150);
  toast('Departamento: ' + newDept, 'ok');
}

// BUG-CAJ-06: Eliminar cierre — solo admin + audit_log previo
async function eliminarCierreCaja(cajaId) {
  if(currentUser.rol !== 'admin') { toast('Solo admin puede eliminar cierres','err'); return; }
  var motivo = prompt('Motivo de eliminación (obligatorio para auditoría):');
  if(!motivo || !motivo.trim()) { toast('Motivo obligatorio','err'); return; }
  if(!confirm('¿Eliminar este cierre de caja? Acción irreversible — quedará registrada en auditoría.')) return;
  await auditLog('DELETE_CIERRE_CAJA', 'Cierre '+cajaId+' eliminado por '+currentUser.nombre+' — '+motivo.trim());
  var res = await fetch(
    SUPABASE_URL + '/rest/v1/sala_cash_closures?id=eq.' + encodeURIComponent(cajaId),
    { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer '+SUPABASE_KEY, 'Prefer': 'return=minimal' } }
  );
  if(res.ok) {
    invalidateCache('sala_cash_closures');
    toast('Cierre eliminado y auditado','ok');
    await renderCajaList();
  } else { toast('Error al eliminar cierre','err'); }
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