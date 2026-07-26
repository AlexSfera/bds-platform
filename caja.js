
// ── HTML INJECTION ─────────────────────────────────────────
(function injectCajaHTML() {
  var root = document.getElementById('caja-root');
  if(!root) { root = document.createElement('div'); root.id='caja-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="screen" id="screen-caja">
  <div class="page-header">
    <div class="page-title">💰 Cierre Caja</div>
    <div class="page-sub">Jefe de Sala / F&amp;B / Admin</div>
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

    <!-- B1: EFECTIVO (orden: fondo inicial → cash posmews → traspaso previo → efectivo real) -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">1 · EFECTIVO</div>
      <div class="grid2">
        <div class="fg"><label>Fecha <span class="req">*</span></label><input type="date" id="caja-fecha"></div>
        <div class="fg" id="caja-admin-created-at-wrap" style="display:none"><label>Fecha/Hora cierre (admin override)</label><input type="datetime-local" id="caja-admin-created-at" step="60"></div>
        <div class="fg"><label>Fondo inicial — recibido del turno anterior (€)</label>
          <input type="text" inputmode="decimal" id="caja-fondo-ini" placeholder="0.00" readonly style="opacity:0.65;cursor:not-allowed;"></div>
        <div class="fg"><label>Cash POSMEWS (€) <span style="color:var(--text3);font-weight:400">— acumulado del día</span></label>
          <input type="text" inputmode="decimal" id="caja-ef-posmews" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Cash POSMEWS traspaso anterior (€)</label>
          <input type="text" inputmode="decimal" id="caja-ef-posmews-prev" placeholder="0.00" readonly style="opacity:0.65;cursor:not-allowed;"></div>
        <div class="fg"><label>Efectivo real contado (€) <span class="req">*</span></label>
          <input type="text" inputmode="decimal" id="caja-ef-real" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
      </div>
      <div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Δ EFECTIVO = Fondo inicial + Cash POSMEWS − Traspaso anterior − Efectivo real</span>
        <span id="caja-dif-ef" style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--green);">+0.00 €</span>
      </div>
    </div>

    <!-- B2: VALORES POSMEWS (tarjeta/stripe) -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">2 · VALORES SISTEMA POSMEWS</div>
      <div class="grid2">
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:10px;">
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

    <!-- B7: RETIRO Y FONDO FINAL A TRASPASAR -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">7 · RETIRO Y FONDO FINAL A TRASPASAR</div>
      <div class="grid2">
        <div class="fg"><label>Retiro efectivo caja fuerte (€)</label>
          <input type="text" inputmode="decimal" id="caja-retiro" placeholder="0.00" oninput="fixLeadingZeros(this);calcCajaDifs()"></div>
        <div class="fg"><label>Fondo final a traspasar (€) <span style="color:var(--text3);font-weight:400">— calculado</span></label>
          <div id="caja-fondo-esperado" style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--green);padding:8px 0;">0.00 €</div></div>
      </div>
      <div style="margin-top:8px;font-size:10px;color:var(--text3);font-family:var(--font-mono)">Fondo final = Efectivo real contado − Retiro caja fuerte</div>
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
    <div style="font-size:13px;color:var(--text2);margin-bottom:20px;">Puedes hacer el cierre de caja ahora o dejarlo para más tarde.</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button onclick="acceptCajaOffer()" style="width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">💰 Sí, realizar cierre de caja</button>
      <button onclick="declineCajaOffer()" style="width:100%;padding:14px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">No, solo guardar follow-up</button>
    </div>
  </div>
</div>

<!-- ══ CAJA-V2 SALA · MODAL ELECCIÓN: TRASPASO O CIERRE ══ -->
<div id="modal-sala-tipo" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:710;padding:16px;">
  <div style="background:var(--bg2);border:2px solid #3b82f6;border-radius:14px;padding:24px;width:100%;max-width:460px;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.2em;margin-bottom:6px;">SALA · OPERACIÓN DE CAJA</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">¿Traspaso o cierre de caja?</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">Solo Cena y Evento pueden cerrar caja. El resto de servicios solo traspasa. Una operación de caja por servicio y día — si sois varios camareros, la hace uno y el resto cierra sin caja.</div>
    <div class="fg" id="sala-tipo-serv-fixed" style="margin-bottom:12px;display:none;">
      <label>Servicio</label>
      <div id="sala-tipo-serv-label" style="font-size:16px;font-weight:700;color:var(--text);padding:8px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;">—</div>
    </div>
    <div class="fg" id="sala-tipo-serv-pick" style="margin-bottom:12px;display:none;">
      <label>Servicio <span class="req">*</span></label>
      <div style="font-size:11px;color:var(--text3);margin:2px 0 6px;">Indica el servicio de esta caja:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="tbtn" onclick="setSalaTipoServ('Desayuno',this)">Desayuno</button>
        <button class="tbtn" onclick="setSalaTipoServ('Comida',this)">Comida</button>
        <button class="tbtn" onclick="setSalaTipoServ('Cena',this)">Cena</button>
        <button class="tbtn" onclick="setSalaTipoServ('Evento',this)">Evento</button>
        <button class="tbtn" onclick="setSalaTipoServ('Otro',this)">Otro</button>
      </div>
    </div>
    <div id="sala-tipo-msg" style="font-size:12px;color:var(--text3);min-height:18px;margin-bottom:12px;font-family:var(--font-mono);"></div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="sala-tipo-btn-traspaso" onclick="startSalaTraspaso()" disabled style="width:100%;padding:14px;background:#0891b2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">🔁 Traspaso de caja al siguiente servicio</button>
      <button id="sala-tipo-btn-cierre" onclick="startSalaCierre()" disabled style="width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">💰 Cierre de caja (Cena / Evento)</button>
      <button id="sala-tipo-btn-skip" onclick="skipSalaCajaOp()" style="width:100%;padding:12px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">✓ Cerrar turno sin caja (la gestiona mi compañero/a)</button>
      <button onclick="closeSalaCajaChoice()" style="width:100%;padding:10px;background:transparent;color:var(--text3);border:none;font-size:13px;font-weight:600;cursor:pointer;">Cancelar</button>
    </div>
  </div>
</div>

<!-- ══ CAJA-V2 SALA · MODAL TRASPASO (solo efectivo, sin retiro) ══ -->
<div id="modal-sala-traspaso" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;">
  <div style="background:var(--bg2);border:2px solid #0891b2;border-radius:14px;padding:24px;width:100%;max-width:540px;margin:40px auto;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#0891b2;letter-spacing:.2em;margin-bottom:6px;">SALA · TRASPASO DE CAJA</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">Traspaso de caja — <span id="sala-tras-serv-label">Servicio</span></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:20px;">Traspaso simple de efectivo al siguiente servicio. Los camareros no hacen retiro. El fondo recibido viene del último cierre o traspaso y no es editable.</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>Fondo recibido (€)</label>
      <input type="text" id="sala-tras-fondo-recibido" value="0.00" readonly style="color:#111827;background:#ffffff;opacity:.6;cursor:not-allowed;">
    </div>
    <div class="fg" style="margin-bottom:8px;">
      <label>Ventas en efectivo POSMEWS (€) <span class="req">*</span></label>
      <input type="text" inputmode="decimal" id="sala-tras-cash-posmews" placeholder="0.00" oninput="calcSalaTraspaso()" style="color:#111827;background:#ffffff;">
    </div>
    <div class="fg" style="margin-bottom:8px;">
      <label>Cash real contado (€) <span class="req">*</span></label>
      <input type="text" inputmode="decimal" id="sala-tras-cash-real" placeholder="0.00" oninput="calcSalaTraspaso()" style="color:#111827;background:#ffffff;">
    </div>
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin:14px 0 8px;">TRASPASO AL SIGUIENTE SERVICIO</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-family:var(--font-mono);">Calculado = Fondo recibido + Ventas efectivo POSMEWS</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>Fondo esperado a traspasar (€)</label>
      <div id="sala-tras-fondo-esperado" style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--green);padding:8px 0;">0.00 €</div>
    </div>
    <div class="fg" style="margin-bottom:8px;">
      <label>Fondo real a traspasar (€) <span class="req">*</span></label>
      <input type="text" inputmode="decimal" id="sala-tras-fondo-real" placeholder="0.00" oninput="calcSalaTraspaso()" style="color:#111827;background:#ffffff;">
    </div>
    <div id="sala-tras-dif" style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;">—</div>
    <div id="sala-tras-dif-block" style="display:none;">
      <div class="fg" style="margin-bottom:8px;">
        <label>Explicación de la diferencia <span class="req">*</span></label>
        <textarea id="sala-tras-dif-exp" rows="2" placeholder="Explica por qué no cuadra el fondo..." style="color:#111827;background:#ffffff;"></textarea>
      </div>
    </div>
    <div id="sala-tras-err" style="color:var(--red);font-size:12px;min-height:18px;margin-bottom:8px;font-family:var(--font-mono);"></div>
    <div style="display:flex;gap:8px;">
      <button onclick="closeSalaTraspasoModal()" style="flex:1;padding:12px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Cancelar</button>
      <button onclick="submitSalaTraspaso()" style="flex:2;padding:12px;background:#0891b2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">💾 Guardar traspaso</button>
    </div>
  </div>
</div>`;
})();

// ── FECHA OPERATIVA SALA ──────────────────────────────────────────────────
// Cena puede pasar de medianoche. FEAT-TURNO-AUTO (spec 22 §4): cualquier
// cierre entre 00:00–05:59 de una jornada abierta ayer conserva la fecha de
// apertura — la Cena termina hasta las 00:30–01:00 y el cutoff de 2h se
// quedaba corto. Cutoff subido a <06:00, alineado con autoAssignTurno.
function _salaFechaOperativa(){
  var now = new Date();
  if(now.getHours() < 6){
    var ayer = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return toYMD(ayer);
  }
  return today();
}

function initCajaForm() {
  renderCajaList();
}

function openCajaForm(existingId) {
  _editingCajaId = existingId || null;
  window._cajaCorrectMode = false;
  var title = document.getElementById('caja-form-title');
  if(title) title.textContent = existingId ? 'Editar Cierre de Caja' : 'Nuevo Cierre de Caja';
  var fechaEl = document.getElementById('caja-fecha');
  if(fechaEl) fechaEl.value = _salaFechaOperativa();
  var respEl = document.getElementById('caja-responsable');
  if(respEl){
    respEl.value = currentUser.nombre + ' — ' + currentUser.puesto;
    respEl.readOnly = (currentUser.rol !== 'admin');
  }
  var lastShiftLink = document.getElementById('caja-shift-link');
  if(lastShiftLink) lastShiftLink.value = window._lastSavedShiftId || '';
  ['caja-efectivo','caja-tarjeta','caja-room','caja-syncrolab','caja-alexander',
   'caja-pension-desayuno-pax','caja-pension-comidacena-pax',
   'caja-eur-pension-desayuno','caja-eur-pension-comidacena','caja-propinas',
   'caja-desc-imp','caja-desc-num','caja-anul-imp','caja-anul-num',
   'caja-inv-imp','caja-inv-num','caja-diferencia','caja-comentario',
   'caja-ef-real','caja-ef-posmews','caja-fondo-fin','caja-retiro'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  // FIX-FONDO-CIERRE: fondo_ini = último TRASPASO de hoy; si no hay → último CIERRE día anterior
  var fondoIniEl = document.getElementById('caja-fondo-ini');
  if(fondoIniEl) fondoIniEl.value = '';
  if(!existingId){
    invalidateCache('sala_cash_closures');
    dbGetAll('sala_cash_closures').then(function(rows){
      var t = _salaFechaOperativa();
      // 1. Último traspaso del mismo día
      var traspasoHoy = rows
        .filter(function(r){
          return r.tipo === 'traspaso' && r.fecha === t
            && (r.fondo_real_sala != null || r.fondo_final != null);
        })
        .sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
      // 2. Último cierre de día anterior (fallback)
      var cierreAnterior = rows
        .filter(function(r){
          return r.tipo === 'cierre' && (r.fecha||'') < t
            && (r.fondo_real_sala != null || r.fondo_final != null);
        })
        .sort(function(a,b){
          return (b.fecha||'').localeCompare(a.fecha||'') ||
                 (b.created_at||'').localeCompare(a.created_at||'');
        });
      var ultimo = traspasoHoy[0] || cierreAnterior[0];
      if(fondoIniEl && ultimo){
        fondoIniEl.value = parseFloat(ultimo.fondo_real_sala || ultimo.fondo_final || 0).toFixed(2);
      }
      // Cash POSMEWS ya traspasado hoy (para aislar ventas de la tarde)
      var prevEl = document.getElementById('caja-ef-posmews-prev');
      if(prevEl) prevEl.value = parseFloat((traspasoHoy[0] && traspasoHoy[0].efectivo_posmews) || 0).toFixed(2);
      calcCajaDifs();
    });
  } else {
    dbGetAll('sala_cash_closures').then(function(rows){
      var row = rows.find(function(r){ return r.id === existingId; });
      if(!row) return;
      window._cajaPrevEstado = row.estado || null;
      if(fondoIniEl && row.fondo_inicial != null) fondoIniEl.value = parseFloat(row.fondo_inicial).toFixed(2);
      var prevEl2 = document.getElementById('caja-ef-posmews-prev');
      if(prevEl2) prevEl2.value = parseFloat(row.cash_posmews_traspaso_previo || 0).toFixed(2);
      // Precarga de cargos y conceptos internos
      function setV(id,v){ var e=document.getElementById(id); if(e&&v!=null) e.value=v; }
      setV('caja-room', row.room_charge);
      setV('caja-syncrolab', row.syncrolab_charge);
      setV('caja-alexander', row.cargo_alexander);
      setV('caja-pension-desayuno-pax', row.pension_desayuno_pax);
      setV('caja-pension-comidacena-pax', row.pension_comidacena_pax);
      setV('caja-eur-pension-desayuno', row.eur_pension_desayuno);
      setV('caja-eur-pension-comidacena', row.eur_pension_comidacena);
      calcCajaDifs();
      // Bloquear si el usuario no puede editar este cierre — solo jefe depto / admin
      var isJefeDept = typeof canCorrectCaja==='function' && canCorrectCaja('Sala');
      var canEditCaja = currentUser.rol === 'admin' || currentUser.rol === 'fb' || isJefeDept;
      var canEdit     = canEditCaja || (window._cajaCorrectMode && isJefeDept);
      // Admin: mostrar campo override fecha/hora cierre
      var adminCreatedAtWrap = document.getElementById('caja-admin-created-at-wrap');
      if(adminCreatedAtWrap){
        if(currentUser.rol === 'admin'){
          adminCreatedAtWrap.style.display = '';
          var adminCAEl = document.getElementById('caja-admin-created-at');
          if(adminCAEl && row.created_at){
            try { var d=new Date(row.created_at); adminCAEl.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); } catch(e){}
          }
        } else { adminCreatedAtWrap.style.display = 'none'; }
      }
      // Guardar responsable original para detectar redacción por jefe
      window._cajaOriginalResponsableId = row.responsable_id || null;
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

// El servicio del cierre proviene de la elección (Cena/Evento) si existe
function _cierreServicios(){
  if(typeof _salaTipoServ === 'string' && _salaTipoServ) return [_salaTipoServ];
  return getCajaServicios();
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
  function fmt(val){ return (val >= 0 ? '+' : '') + val.toFixed(2).replace('.',',') + ' €'; }
  function setEl(id, val){
    var el = document.getElementById(id);
    if(el){ el.textContent = fmt(val); setColor(el, val); }
  }

  // EFECTIVO
  // Δ EFECTIVO = (fondo_inicial + cash_posmews - cash_posmews_traspaso_previo) - efectivo_real_contado
  var efReal   = getV('caja-ef-real');
  var efPosmews= getV('caja-ef-posmews');
  var efPosmewsPrev = getV('caja-ef-posmews-prev');
  var fondoIni = getV('caja-fondo-ini');
  var retiro   = getV('caja-retiro');
  var efEsperado = fondoIni + efPosmews - efPosmewsPrev;
  var difEf = efEsperado - efReal;

  var efEspEl = document.getElementById('caja-ef-esperado');
  if(efEspEl) efEspEl.textContent = efEsperado.toFixed(2).replace('.',',') + ' €';
  setEl('caja-dif-ef', difEf);
  setEl('dif-ef-disp', difEf);

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

  // FONDO FINAL A TRASPASAR = Efectivo real contado - Retiro caja fuerte
  var fondoRealV = getV('caja-ef-real');
  var retiroV    = getV('caja-retiro');
  var fondoEspV  = fondoRealV - retiroV;
  var fondoEspEl = document.getElementById('caja-fondo-esperado');
  if(fondoEspEl) fondoEspEl.textContent = fondoEspV.toFixed(2).replace('.',',') + ' €';

  // TOTAL BRUTO (display informativo: suma de todos los conceptos facturados,
  // incluidos cargos internos teóricos). NO se usa para la Δ de verificación.
  var totalBruto = getV('caja-ef-posmews') + getV('caja-tar-posmews') + getV('caja-str-posmews')
                 + getV('caja-room') + getV('caja-syncrolab') + getV('caja-alexander')
                 + getV('caja-eur-pension-desayuno') + getV('caja-eur-pension-comidacena');
  var brutoEl = document.getElementById('caja-total-bruto-display');
  if(brutoEl) brutoEl.textContent = totalBruto.toFixed(2).replace('.',',') + ' €';

  // VERIFICACION CON REALES — FIX-DELTA-VERIF (Jun 2026)
  // Δ = Venta total (sistema) − Venta real (cobrada físicamente)
  //   · Venta total = Cash POSMEWS + Tarjeta POSMEWS + Stripe POSMEWS
  //                 + cargos internos (Room + SYNCROLAB + Alexander + € pensiones)
  //   · Venta real  = (Efectivo real − Fondo inicial) + (TPV físico − Propinas TPV) + Stripe real
  // El efectivo se neto del fondo inicial para aislar la venta del turno del dinero
  // que ya estaba en caja (eso causaba el descuadre fantasma anterior).
  var ventaTotal = totalBruto;  // ya incluye POSMEWS + cargos internos + € pensiones
  var ventaRealFisica = (getV('caja-ef-real') - getV('caja-fondo-ini'))
                      + (getV('caja-tar-tpv') - getV('caja-propinas-tpv'))
                      + getV('caja-str-real');
  var difVerif  = ventaTotal - ventaRealFisica;
  var verifEl   = document.getElementById('caja-total-verif');
  if(verifEl){
    verifEl.textContent = Math.abs(difVerif)<0.01 ? '✓ Cuadrado' : ('Δ '+(difVerif>=0?'+':'')+difVerif.toFixed(2).replace('.',',')+'€');
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
  if(checked.length === 0) checked = ['Turno'];
  return checked;
}

async function saveCajaForm() {
  var _isCorrection = window._cajaCorrectMode; window._cajaCorrectMode = false;
  var _corrNote = window._cajaCorrectNote || ''; window._cajaCorrectNote = '';
  var fecha = (document.getElementById('caja-fecha')||{}).value||_salaFechaOperativa();
  var servicios = _cierreServicios();
  // CAJA-V2: una operación por servicio+fecha (admin exento, edición exenta)
  if(!_editingCajaId && currentUser.rol !== 'admin' && servicios.length){
    var dupServ = await getSalaOpToday(servicios[0]);
    if(dupServ){
      toast('El servicio '+servicios[0]+' ya registró una operación de caja hoy. Solo una por servicio.','err');
      return;
    }
  }
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
  var efPosmewsPrev = getCV('caja-ef-posmews-prev');
  var fondoIni  = getCV('caja-fondo-ini');
  var retiro    = getCV('caja-retiro');
  var tarPosmews= getCV('caja-tar-posmews');
  var tarTpv    = getCV('caja-tar-tpv');
  var propinasTpv = getCV('caja-propinas-tpv');
  var strPosmews= getCV('caja-str-posmews');
  var strReal   = getCV('caja-str-real');
  var difEf  = (fondoIni + efPosmews - efPosmewsPrev) - efReal;
  var difTar = (tarTpv - propinasTpv) - tarPosmews;
  var difStr = strReal - strPosmews;
  var difOperativa = difEf + difTar + difStr;
  var fondoFinalTraspasar = efReal - retiro;
  var mediosPago = efReal + tarTpv + strReal;
  var bruto = parseFloat((document.getElementById('caja-total-bruto-manual')||{}).value)||0;
  var ajustes=(parseFloat((document.getElementById('caja-desc-imp')||{}).value)||0)
             +(parseFloat((document.getElementById('caja-anul-imp')||{}).value)||0)
             +(parseFloat((document.getElementById('caja-inv-imp')||{}).value)||0);

  var closure = {
    id: _editingCajaId || genId(),
    fecha: fecha,
    servicios: JSON.stringify(servicios),
    tipo: 'cierre',
    responsable_id: currentUser.id,
    responsable_nombre: currentUser.nombre,
    // Payment fields
    efectivo_real: efReal,
    efectivo_posmews: efPosmews,
    cash_posmews_traspaso_previo: efPosmewsPrev,
    fondo_inicial: fondoIni,
    fondo_final: fondoFinalTraspasar,
    fondo_real_sala: fondoFinalTraspasar,
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
    syncrolab_charge: getCV('caja-syncrolab'),
    cargo_alexander: getCV('caja-alexander'),
    pension_desayuno_pax: getCV('caja-pension-desayuno-pax'),
    pension_comidacena_pax: getCV('caja-pension-comidacena-pax'),
    eur_pension_desayuno: getCV('caja-eur-pension-desayuno'),
    eur_pension_comidacena: getCV('caja-eur-pension-comidacena'),
    // Totals (manual entry)
    subtotal_neto: parseFloat((document.getElementById('caja-total-neto-manual')||{}).value)||0,
    total_bruto: parseFloat((document.getElementById('caja-total-bruto-manual')||{}).value)||0,
    total_medios_pago: mediosPago,
    total_ajustes: ajustes,
    comentario: comentario,
    estado: (_editingCajaId && (window._cajaPrevEstado==='A revisar' || window._cajaPrevEstado==='En corrección')) ? 'corregido' : 'Pendiente validación',
    updated_at: localTs()
  };
  // FIX-CIERRE-02: al editar, NO sobrescribir identidad del registro (fecha/turno/responsable).
  // Bug confirmado: editar una caja antigua le ponía fecha=today() y bloqueaba el turno de ese día.
  if(_editingCajaId && currentUser.rol !== 'admin'){ delete closure.fecha; }
  // FIX: created_at solo en alta nueva (antes se sobreescribía en cada edición)
  if(!_editingCajaId){
    closure.created_at = localTs();
  } else if(currentUser.rol === 'admin'){
    // Admin puede override de created_at desde el campo datetime-local
    var adminCAVal = (document.getElementById('caja-admin-created-at')||{}).value;
    if(adminCAVal){
      try { var _d=new Date(adminCAVal); closure.created_at=_d.getFullYear()+'-'+String(_d.getMonth()+1).padStart(2,'0')+'-'+String(_d.getDate()).padStart(2,'0')+'T'+String(_d.getHours()).padStart(2,'0')+':'+String(_d.getMinutes()).padStart(2,'0')+':00+02:00'; } catch(e){}
    }
  }
  // Redactado por jefe: jefe edita cierre de otro empleado (no admin)
  if(_editingCajaId && currentUser.rol !== 'admin' && window._cajaOriginalResponsableId && currentUser.id !== window._cajaOriginalResponsableId){
    closure.redactado_por_jefe = true;
    closure.redactado_por = currentUser.nombre;
    closure.redactado_ts = localTs();
  }

  if(_isCorrection){
    closure.corregida = true; closure.corrected_by = currentUser.nombre;
    closure.corrected_at = localTs(); closure.correction_note = _corrNote || null;
    if(window._cajaPrevEstado === 'validado' || window._cajaPrevEstado === 'Validado') closure.estado = window._cajaPrevEstado;
  }
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
    // BUG-TURNO-SALA-CIERRE (Jun 2026): el cierre completo Sala no pasaba por
    // _doSaveTurno() → no generaba fila en shifts → coste de personal infravalorado.
    // Solo en alta nueva; editar/corregir no debe duplicar turno.
    if(!_editingCajaId){
      try { await _doSaveTurno(); }
      catch(eTurno){ console.error('[CAJA] _doSaveTurno tras cierre Sala falló', eTurno); }
    }
    closeModal('modal-caja');
    toast('Cierre de caja guardado ✓','ok');
    await renderCajaList();
    if(typeof autoLogoutAfterCaja === 'function') autoLogoutAfterCaja();
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
    var today2 = _salaFechaOperativa();
    data = data.filter(function(c){
      if(filter==='hoy') return c.fecha === today2;
      if(filter==='semana') return c.fecha >= startOfWeek();
      if(filter==='mes') return c.fecha >= startOfMonth();
      return true;
    });
    data.sort(function(a,b){
      var fa = a.fecha||'', fb = b.fecha||'';
      if(fb !== fa) return fb.localeCompare(fa);
      var ta = a.created_at||a.updated_at||'', tb = b.created_at||b.updated_at||'';
      return tb.localeCompare(ta);
    });
    if(!data.length){
      el.innerHTML='<div class="empty"><div class="empty-icon">💰</div><div class="empty-text">Sin cierres en el periodo seleccionado</div></div>';
      return;
    }
    var rows = data.map(function(c){
      var servs = displayServicio(c.servicios||'');
      var diffColor = Math.abs(c.diferencia_caja||0)>5?'var(--red)':'var(--green)';
      var esTraspaso = c.tipo === 'traspaso';
      var tipoBadge = esTraspaso
        ? '<span class="badge" style="background:rgba(8,145,178,.15);color:#0891b2;border:1px solid #0891b2;">🔁 Traspaso</span>'
        : '<span class="badge" style="background:rgba(59,130,246,.15);color:#3b82f6;border:1px solid #3b82f6;">💰 Cierre</span>'
        + (c.redactado_por_jefe ? '<span class="badge" style="background:rgba(234,179,8,.15);color:#eab308;border:1px solid #eab308;margin-left:4px;" title="Redactado por '+(c.redactado_por||'jefe')+'">⚠</span>' : '');
      var verFn = esTraspaso ? 'openSalaTraspasoModal' : 'openCajaForm';
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(c.fecha)+'<br><span style="color:var(--text3)">'+(c.created_at?(function(ts){try{return new Date(ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'});}catch(e){return ts.slice(11,16);}})(c.created_at):'—')+'</span></td>'
        +'<td>'+servs+'</td>'
        +'<td>'+tipoBadge+'</td>'
        +'<td style="font-weight:600">'+c.responsable_nombre+'</td>'
        +'<td style="font-family:var(--font-mono);font-weight:700;color:#3b82f6">'+(c.subtotal_neto||0).toFixed(2).replace('.',',')+' €</td>'
        +'<td style="font-family:var(--font-mono);color:'+diffColor+'">'+(c.diferencia_caja>=0?'+':'')+((c.diferencia_caja||0).toFixed(2))+' €</td>'
        +'<td>'+bEstado(c.estado)+'</td>'
        +'<td><button class="btn btn-secondary btn-sm" onclick="'+verFn+'(this.dataset.id)" data-id="'+c.id+'">✏️</button></td>'
        +'</tr>';
    }).join('');
    el.innerHTML='<table><tr><th>Fecha</th><th>Servicio</th><th>Tipo</th><th>Responsable</th><th>Total neto</th><th>Diferencia</th><th>Estado</th><th></th></tr>'+rows+'</table>';
  } catch(e) {
    el.innerHTML='<div class="alert a-warn">Tabla sala_cash_closures pendiente de crear en Supabase. Ejecuta el SQL de configuración.</div>';
  }
}

// FEAT-TURNO-AUTO (spec 22): lectura cruda de los selectores manuales.
// NO llamar directamente — usar getServicioValue(), que aplica la
// asignación automática y las reglas de override (admin/jefe).
function _getServicioManual() {
  // Recepción: return turno (Mañana/Tarde/Noche)
  if(currentUser && currentUser.area === 'Recepción') return getRecTurnoValue();
  // Housekeeping: return turno (Mañana/Tarde) desde radio
  if(currentUser && (currentUser.area === 'HK' || currentUser.area === 'Housekeeping' || currentUser.area === 'Limpieza')){
    var hkChecked = document.querySelector('input[name="servicio-hk"]:checked');
    return hkChecked ? hkChecked.value : '';
  }
  // Administración: return turno (Mañana/Tarde) desde radio
  if(currentUser && currentUser.area === 'Administración'){
    var admChecked = document.querySelector('input[name="servicio-adm"]:checked');
    return admChecked ? admChecked.value : '';
  }
  // Mantenimiento: return turno (Mañana/Tarde/Extra) desde radio
  if(currentUser && currentUser.area === 'Mantenimiento'){
    var mntChecked = document.querySelector('input[name="servicio-mant"]:checked');
    return mntChecked ? mntChecked.value : '';
  }
  // SYNCROLAB: return turno (Mañana/Tarde) desde radio servicio-lab
  if(currentUser && /syncrolab|syncro lab|entrenador|fisio|cl\u00ednica|clinica/i.test((currentUser.area||'')+' '+(currentUser.puesto||''))){
    var labChecked = document.querySelector('input[name="servicio-lab"]:checked');
    return labChecked ? labChecked.value : '';
  }
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

// FEAT-TURNO-AUTO (spec 22): punto único de lectura del turno/servicio.
// El empleado no elige — se asigna por hora de cierre (autoAssignTurno,
// shared.js). Admin: override libre. Jefe/supervisor: solo Evento/Otro.
// Administración y depts sin config → selector manual como siempre.
// En corrección (editingShiftId) se conserva el servicio original del shift.
function getServicioValue() {
  var manual = _getServicioManual();
  if(typeof autoAssignTurno !== 'function' || !currentUser) return manual;
  // Corrección de un turno pasado: no reasignar por la hora actual
  if(typeof editingShiftId !== 'undefined' && editingShiftId){
    if(manual) return manual;
    return window._editingShiftServicioOriginal || manual;
  }
  var auto = autoAssignTurno(currentUser.area, currentUser.puesto);
  if(!auto) return manual; // dept excluido (Administración, etc.)
  if(manual && typeof _turnoAutoManualAllowed === 'function' && _turnoAutoManualAllowed(currentUser)){
    if(typeof isAdmin === 'function' && isAdmin(currentUser)) return manual;
    if(/Evento|Otro/.test(manual)) return manual; // jefe: solo Evento/Otro (spec §1.5)
  }
  return auto.servicioGuardado;
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
    +'<option>Error cobro</option><option>Cargo incorrecto</option>'
    +'<option>Devolución</option><option>Otro</option>'
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
    var t = _salaFechaOperativa();
    data = data.filter(function(c){
      if(periodo==='hoy') return c.fecha===t;
      if(periodo==='semana') return c.fecha>=startOfWeek();
      if(periodo==='mes') return c.fecha>=startOfMonth();
      return true;
    });
    data.sort(function(a,b){return b.fecha.localeCompare(a.fecha)||(b.created_at||'').localeCompare(a.created_at||'');});
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
      var isJefe = typeof canCorrectCaja==='function' && canCorrectCaja('Sala');
      var canEdit = isAdmin||currentUser.rol==='fb'||isJefe;
      var canValidar = isAdmin||currentUser.rol==='fb';
      var totalPens = (parseInt(c.pension_desayuno)||0)+(parseInt(c.media_pension)||0)+(parseInt(c.pension_completa)||0);
      // BUG-CAJ-04: Total ajustes (desc+anulaciones+invitaciones) — nuevo campo guardado
      var totalAjustes = c.total_ajustes != null ? c.total_ajustes.toFixed(2).replace('.',',')+'€' : '—';
      var ajColor = c.total_ajustes > 0 ? 'var(--amber)' : 'var(--text3)';
      return '<tr>'
        +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(c.fecha)+'<br><span style="color:var(--text3)">'+(c.created_at?(function(ts){try{return new Date(ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'});}catch(e){return ts.slice(11,16);}})(c.created_at):'—')+'</span></td>'
        +'<td>'+servs+'</td>'
        +'<td style="font-weight:600">'+c.responsable_nombre+'</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.efectivo_real||0).toFixed(2).replace('.',',')+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.retiro_caja_fuerte||0).toFixed(2).replace('.',',')+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.tarjeta_tpv||0).toFixed(2).replace('.',',')+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.stripe_real||0).toFixed(2).replace('.',',')+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.subtotal_neto||0).toFixed(2).replace('.',',')+'€</td>'
        +'<td style="font-family:var(--font-mono)">'+(c.total_bruto||0).toFixed(2).replace('.',',')+'€</td>'
        +(function(){
          var difEf=(c.diferencia_efectivo||0);
          var difTar=(c.diferencia_tarjeta||0);
          var difStr=(c.diferencia_stripe||0);
          var breakdown='<div style="font-size:10px;color:var(--text3);margin-top:2px">Ef:'+(difEf>=0?'+':'')+difEf.toFixed(2).replace('.',',')+'€ Tar:'+(difTar>=0?'+':'')+difTar.toFixed(2).replace('.',',')+'€ Str:'+(difStr>=0?'+':'')+difStr.toFixed(2).replace('.',',')+'€</div>';
          return '<td style="font-family:var(--font-mono);color:'+difColor+'">'+(difOp>=0?'+':'')+difOp.toFixed(2).replace('.',',')+'€'+breakdown+'</td>';
        })()
        +'<td style="font-family:var(--font-mono);color:'+ajColor+'">'+totalAjustes+'</td>'
        +'<td style="text-align:center">'+totalPens+'p</td>'
        +'<td>'+bCajaEstado(c.estado||'Pendiente Sala')+(c.redactado_por_jefe?'<span class="badge" style="background:rgba(234,179,8,.15);color:#eab308;border:1px solid #eab308;margin-left:4px;" title="Redactado por '+(c.redactado_por||'jefe')+' · '+(c.redactado_ts?new Date(c.redactado_ts).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}):'')+'">⚠</span>':'')+(typeof correctedBadge==='function'?correctedBadge(c):'')+'</td>'
        +'<td style="white-space:nowrap">'
        +'<div style="display:flex;flex-direction:column;gap:4px;">'
        +(isPendiente&&canValidar?'<button class="btn btn-success btn-sm" title="Revisar y validar este cierre" data-cid="'+c.id+'" onclick="openCajaSummary(this.dataset.cid,true)">✓ Validar</button>':'')
        +'<button class="btn btn-secondary btn-sm" title="Ver detalle (solo lectura)" data-cid="'+c.id+'" onclick="openCajaSummary(this.dataset.cid)">📋 Ver</button>'
        +(isAdmin?'<button class="btn btn-warn btn-sm" title="Reabrir y devolver al empleado para que lo corrija" data-cid="'+c.id+'" onclick="reabrirCierre(this.dataset.cid)">✏️ Corregir</button>':'')
        +((isAdmin||(typeof canCorrectCaja==='function'&&canCorrectCaja('Sala')))?'<button class="btn btn-secondary btn-sm" title="Editar los importes tú mismo, sin devolverlo al empleado. Nota obligatoria, queda auditado" data-cid="'+c.id+'" onclick="corregirCajaSala(this.dataset.cid)">✎ Corregir en sitio</button>':'')
        +(isAdmin?'<button class="btn btn-danger btn-sm" title="Eliminar definitivamente (solo admin)" data-cid="'+c.id+'" onclick="eliminarCierreCaja(this.dataset.cid)">🗑 Eliminar</button>':'')
        +'</div>'
        +'</td>'
        +'</tr>';
    }).join('');
    el.innerHTML='<table><tr><th>Fecha</th><th>Turno</th><th>Responsable</th><th>Efectivo</th><th>Retiro</th><th>Tarjeta</th><th>Stripe</th><th>Neto</th><th>Bruto</th><th>Diferencia</th><th>Total ajustes</th><th>Pensiones</th><th>Estado</th><th>Acción</th></tr>'+rows+'</table>';
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
  var difEf = (c.fondo_inicial||0) + (c.efectivo_posmews||0) - (c.cash_posmews_traspaso_previo||0) - (c.efectivo_real||0);
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
    + row('Fecha / Hora cierre', fmtDate(c.fecha) + (c.created_at ? ' · ' + (function(ts){try{return new Date(ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'});}catch(e){return ts.slice(11,16);}})(c.created_at) : ''))
    + row('Responsable', c.responsable_nombre, false)
    + row('Turno', displayServicio(c.servicios||''), false)
    + row('Estado', c.estado, false)
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">EFECTIVO</div>'
    + row('Fondo inicial', (c.fondo_inicial||0).toFixed(2).replace('.',',')+'€', true)
    + row('Cash POSMEWS', (c.efectivo_posmews||0).toFixed(2).replace('.',',')+'€', true)
    + row('Cash POSMEWS traspaso anterior', (c.cash_posmews_traspaso_previo||0).toFixed(2).replace('.',',')+'€', true)
    + row('Efectivo real contado', (c.efectivo_real||0).toFixed(2).replace('.',',')+'€', true)
    + row('Δ Efectivo', (difEf>=0?'+':'')+difEf.toFixed(2).replace('.',',')+'€', true, Math.abs(difEf)<0.01?'var(--green)':'var(--red)')
    + row('Retiro caja fuerte', (c.retiro_caja_fuerte||0).toFixed(2).replace('.',',')+'€', true)
    + row('Fondo final a traspasar', ((c.efectivo_real||0)-(c.retiro_caja_fuerte||0)).toFixed(2).replace('.',',')+'€', true)
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">TARJETA Y STRIPE</div>'
    + row('Tarjeta POSMEWS', (c.tarjeta_posmews||0).toFixed(2).replace('.',',')+'€', true)
    + row('Tarjeta TPV físico', (c.tarjeta_tpv||0).toFixed(2).replace('.',',')+'€', true)
    + row('Propinas TPV', (c.propinas_tpv||0).toFixed(2).replace('.',',')+'€', true)
    + row('Propinas efectivo', (c.propinas||c.propinas_efectivo||0).toFixed(2).replace('.',',')+'€', true)
    + (function(){
        var calcDifTar = (c.tarjeta_tpv||0) - (c.propinas_tpv||0) - (c.tarjeta_posmews||0);
        var nota = Math.abs(calcDifTar - difTar) > 0.01
          ? ' ⚠ DB: '+(difTar>=0?'+':'')+difTar.toFixed(2).replace('.',',')+'€'
          : '';
        return row('Δ Tarjeta (TPV - Propinas - POSMEWS)', (calcDifTar>=0?'+':'')+calcDifTar.toFixed(2).replace('.',',')+'€'+nota, true, Math.abs(calcDifTar)<0.01?'var(--green)':'var(--red)');
      })()
    + row('Stripe POSMEWS', (c.stripe_posmews||0).toFixed(2).replace('.',',')+'€', true)
    + row('Stripe real', (c.stripe_real||0).toFixed(2).replace('.',',')+'€', true)
    + row('Δ Stripe', (difStr>=0?'+':'')+difStr.toFixed(2).replace('.',',')+'€', true, Math.abs(difStr)<0.01?'var(--green)':'var(--red)')
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">CARGOS Y CONCEPTOS INTERNOS</div>'
    + row('Room Charge', (c.room_charge||0).toFixed(2).replace('.',',')+'€', true)
    + row('SYNCROLAB Charge clientes', (c.syncrolab_charge||0).toFixed(2).replace('.',',')+'€', true)
    + row('Cargo Alexander', (c.cargo_alexander||0).toFixed(2).replace('.',',')+'€', true)
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">PENSIONES (informativo)</div>'
    + row('Pensiones desayunos (pax)', (parseInt(c.pension_desayuno_pax)||0)+'p', true)
    + row('Pensiones comida+cena (pax)', (parseInt(c.pension_comidacena_pax)||0)+'p', true)
    + row('€ Pensiones desayunos', (c.eur_pension_desayuno||0).toFixed(2).replace('.',',')+'€', true)
    + row('€ Pensiones comidas+cenas', (c.eur_pension_comidacena||0).toFixed(2).replace('.',',')+'€', true)
    + '<div style="margin:12px 0 6px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em">TOTALES</div>'
    + row('Total neto sin IVA', (c.subtotal_neto||0).toFixed(2).replace('.',',')+'€', true)
    + row('Total bruto con IVA', (c.total_bruto||0).toFixed(2).replace('.',',')+'€', true)
    + (function(){
        // Verificación con reales: Venta total (sistema) − Venta real física
        var ventaTotal = (c.efectivo_posmews||0) + (c.tarjeta_posmews||0) + (c.stripe_posmews||0)
                       + (c.room_charge||0) + (c.syncrolab_charge||0) + (c.cargo_alexander||0)
                       + (c.eur_pension_desayuno||0) + (c.eur_pension_comidacena||0);
        var ventaReal  = ((c.efectivo_real||0) - (c.fondo_inicial||0))
                       + ((c.tarjeta_tpv||0) - (c.propinas_tpv||0))
                       + (c.stripe_real||0);
        var dv = ventaTotal - ventaReal;
        var dvCol = Math.abs(dv)<0.01?'var(--green)':Math.abs(dv)>5?'var(--red)':'var(--amber)';
        return '<div style="margin:12px 0 6px;padding:10px;border-radius:6px;background:var(--bg2);border:1px solid '+dvCol+'">'
          + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:'+dvCol+';letter-spacing:.1em;margin-bottom:4px">VERIFICACIÓN CON REALES</div>'
          + '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:'+dvCol+'">'+(Math.abs(dv)<0.01?'✓ Cuadrado':((dv>=0?'+':'')+dv.toFixed(2).replace('.',',')+'€'))+'</div>'
          + '<div style="font-size:11px;color:var(--text3);margin-top:6px;line-height:1.5">'
          + 'Venta total (sistema): <b>'+ventaTotal.toFixed(2).replace('.',',')+'€</b> − Venta real (física): <b>'+ventaReal.toFixed(2).replace('.',',')+'€</b><br>'
          + '<span style="color:var(--text3)">Venta total = POSMEWS (efectivo+tarjeta+Stripe) + cargos internos (Room+SYNCROLAB+Alexander+€ pensiones). '
          + 'Venta real = (Efectivo real − Fondo inicial) + (TPV físico − Propinas) + Stripe real. '
          + 'Compara lo que el sistema dice que se vendió contra lo realmente cobrado. 0 = cuadra; Δ alta = revisar antes de validar.</span>'
          + '</div></div>';
      })()
    + (function(){
        var calcDifTar2 = (c.tarjeta_tpv||0) - (c.propinas_tpv||0) - (c.tarjeta_posmews||0);
        var calcDifEf = (c.diferencia_efectivo||0);
        var calcDifStr = (c.diferencia_stripe||0);
        var calcTotal = calcDifEf + calcDifTar2 + calcDifStr;
        var col = Math.abs(calcTotal)<0.01?'var(--green)':Math.abs(calcTotal)>5?'var(--red)':'var(--amber)';
        return '<div style="margin:12px 0 6px;padding:10px;border-radius:6px;background:var(--bg2);border:1px solid '+col+'">'
          + '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:'+col+';letter-spacing:.1em;margin-bottom:4px">DIFERENCIA OPERATIVA (recalculada)</div>'
          + '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:'+col+'">'+(calcTotal>=0?'+':'')+calcTotal.toFixed(2).replace('.',',')+'€</div>'
          + '<div style="font-size:11px;color:var(--text3);margin-top:4px">Ef:'+(calcDifEf>=0?'+':'')+calcDifEf.toFixed(2).replace('.',',')+'€ · Tar:'+(calcDifTar2>=0?'+':'')+calcDifTar2.toFixed(2).replace('.',',')+'€ · Str:'+(calcDifStr>=0?'+':'')+calcDifStr.toFixed(2).replace('.',',')+'€</div>'
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
  try { await _doSaveTurno(); }
  catch(e){ console.error('[SALA] guardado de turno falló', e); toast('⛔ No se pudo guardar el turno: '+(e && e.message ? e.message : e), 'err'); return; }
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
  try { await _doSaveTurno(); }
  catch(e){ console.error('[SALA] guardado de turno falló', e); toast('⛔ No se pudo guardar el turno: '+(e && e.message ? e.message : e), 'err'); }
}

// ═══════════════════════════════════════════════════════════════════════
// CAJA-V2 SALA · ELECCIÓN TRASPASO/CIERRE + TRASPASO (solo efectivo, sin retiro)
// Reglas: Cena/Evento → traspaso o cierre · resto → solo traspaso
//         Una operación por servicio+fecha · varios camareros: 1 hace caja
// Requiere columna sala_cash_closures.tipo (default 'cierre').
// ═══════════════════════════════════════════════════════════════════════
var _salaTipoServ      = null;
var _salaTraspasoEditId = null;
var CIERRE_SERVICIOS   = ['Cena','Evento'];

// CAJA-V2 Sala · Si el usuario ya hizo una operación de caja hoy, fija ese servicio
// en Mi Turno (lo marca y bloquea) para que cierre de turno y caja coincidan.
async function lockSalaServIfCajaToday() {
  if(!currentUser) return;
  var rows = [];
  try { rows = await dbGetAll('sala_cash_closures'); } catch(e){ return; }
  var t = _salaFechaOperativa();
  var mine = rows.find(function(r){ return r.fecha === t && r.responsable_id === currentUser.id; });
  if(!mine) return;
  var servs = [];
  try { servs = JSON.parse(mine.servicios || '[]'); } catch(e){ servs = []; }
  if(!servs.length) return;

  document.querySelectorAll('input[name="servicio-sala"]').forEach(function(cb){
    cb.checked  = servs.indexOf(cb.value) !== -1;
    cb.disabled = true;
  });
  var multi = document.getElementById('t-servicio-multi');
  if(multi && !document.getElementById('sala-serv-locked-msg')){
    var note = document.createElement('div');
    note.id = 'sala-serv-locked-msg';
    note.style.cssText = 'font-size:12px;color:var(--text3);margin-top:8px;font-family:var(--font-mono);width:100%;';
    note.textContent = '🔒 Servicio fijado a ' + servs.join(', ') + ' — ya registraste ' +
      (mine.tipo === 'traspaso' ? 'un traspaso' : 'un cierre') + ' de caja hoy.';
    multi.parentElement.appendChild(note);
  }
}

function getSalaTurnoServicio() {
  // Servicio marcado en Mi Turno Sala (radio servicio-sala = selección única)
  var checked = [];
  document.querySelectorAll('input[name="servicio-sala"]:checked').forEach(function(cb){ checked.push(cb.value); });
  if(checked.length) return checked;
  // FEAT-TURNO-AUTO (spec 22): radios ocultos para el empleado → la caja
  // hereda el servicio automáticamente por proximidad al fin de ventana
  // (SERVICE_WINDOWS §3). Fuera de margen (>150 min) → selección manual
  // (casos Evento/Otro, que marca el jefe).
  var autoServ = _salaCajaServicioAuto();
  return autoServ ? [autoServ] : checked;
}

// Servicio de caja Sala por hora actual: fin de ventana más cercano.
// Desayuno fin 11:00 · Comida fin 16:30 · Cena fin 23:30 (spec 22 §3).
function _salaCajaServicioAuto(){
  if(typeof SERVICE_WINDOWS === 'undefined' || !SERVICE_WINDOWS) return null;
  var now = new Date(), m = now.getHours()*60 + now.getMinutes();
  var best = null, bestD = Infinity;
  Object.keys(SERVICE_WINDOWS).forEach(function(s){
    var p = String(SERVICE_WINDOWS[s][1]).split(':');
    var fin = (parseInt(p[0],10)||0)*60 + (parseInt(p[1],10)||0);
    var d = Math.abs(m - fin); if(d > 720) d = 1440 - d;
    if(d < bestD){ bestD = d; best = s; }
  });
  return bestD <= 150 ? best : null;
}

async function getSalaOpToday(servicio) {
  var rows = [];
  try { rows = await dbGetAll('sala_cash_closures'); } catch(e){ rows = []; }
  var t = _salaFechaOperativa();
  return rows.find(function(r){
    if(r.fecha !== t) return false;
    var servs = [];
    try { servs = JSON.parse(r.servicios || '[]'); } catch(e){ servs = []; }
    return servs.indexOf(servicio) !== -1;
  }) || null;
}

function openSalaCajaChoice() {
  var servs = getSalaTurnoServicio();
  // Si Mi Turno tiene exactamente 1 servicio → fijo; si 0 o varios → pedir
  _salaTipoServ = (servs.length === 1) ? servs[0] : null;

  var fixedBox = document.getElementById('sala-tipo-serv-fixed');
  var pickBox  = document.getElementById('sala-tipo-serv-pick');
  var lblFixed = document.getElementById('sala-tipo-serv-label');
  document.querySelectorAll('#sala-tipo-serv-pick .tbtn').forEach(function(b){ b.classList.remove('t-si'); });

  if(_salaTipoServ){
    if(fixedBox) fixedBox.style.display = 'block';
    if(pickBox)  pickBox.style.display  = 'none';
    if(lblFixed) lblFixed.textContent   = _salaTipoServ;
  } else {
    if(fixedBox) fixedBox.style.display = 'none';
    if(pickBox)  pickBox.style.display  = 'block';
  }

  var msg = document.getElementById('sala-tipo-msg');
  if(msg) msg.textContent = _salaTipoServ ? '' : 'Selecciona el servicio para continuar';
  setSalaTipoBtns(false, false);
  setSalaSkipBtn('none');
  var m = document.getElementById('modal-sala-tipo');
  if(m) m.style.display = 'flex';
  if(_salaTipoServ) evalSalaCajaChoice();
}

function closeSalaCajaChoice() {
  var m = document.getElementById('modal-sala-tipo');
  if(m) m.style.display = 'none';
}

function setSalaTipoServ(s, btn) {
  _salaTipoServ = s;
  if(btn && btn.parentElement){
    btn.parentElement.querySelectorAll('.tbtn').forEach(function(b){ b.classList.remove('t-si'); });
    btn.classList.add('t-si');
  }
  evalSalaCajaChoice();
}

function setSalaTipoBtns(traspasoOn, cierreOn) {
  var bt = document.getElementById('sala-tipo-btn-traspaso');
  var bc = document.getElementById('sala-tipo-btn-cierre');
  if(bt){ bt.disabled = !traspasoOn; bt.style.opacity = traspasoOn ? '1' : '.4'; bt.style.cursor = traspasoOn ? 'pointer' : 'not-allowed'; }
  if(bc){ bc.disabled = !cierreOn;   bc.style.opacity = cierreOn   ? '1' : '.4'; bc.style.cursor = cierreOn   ? 'pointer' : 'not-allowed'; }
}

function setSalaSkipBtn(mode, opTipo) {
  var b = document.getElementById('sala-tipo-btn-skip');
  if(!b) return;
  if(mode === 'self'){
    b.style.display = 'block';
    b.textContent = '✓ Cerrar turno — ' + (opTipo === 'traspaso' ? 'traspaso' : 'cierre') + ' de caja ya registrado por ti';
  } else {
    b.style.display = 'block';
    b.textContent = '✓ Cerrar turno sin caja (la gestiona mi compañero/a)';
  }
}

async function evalSalaCajaChoice() {
  var msg = document.getElementById('sala-tipo-msg');
  if(!_salaTipoServ){ setSalaTipoBtns(false, false); return; }
  setSalaTipoBtns(false, false);
  if(msg){ msg.textContent = 'Comprobando operaciones de hoy...'; msg.style.color = 'var(--text3)'; }

  var isAdminU = currentUser && currentUser.rol === 'admin';
  var dup = await getSalaOpToday(_salaTipoServ);
  var dupEsMia = dup && (dup.responsable_id === currentUser.id);

  if(dup && dupEsMia && !isAdminU){
    if(msg){
      msg.textContent = '✓ Ya registraste tu ' + (dup.tipo === 'traspaso' ? 'traspaso' : 'cierre') + ' de caja en el servicio ' + _salaTipoServ + '. Cierra el turno para terminar.';
      msg.style.color = 'var(--green)';
    }
    setSalaTipoBtns(false, false);
    setSalaSkipBtn('self', dup.tipo);
    return;
  }
  if(dup && !dupEsMia && !isAdminU){
    if(msg){
      msg.textContent = '⛔ El servicio '+_salaTipoServ+' ya registró '+(dup.tipo === 'traspaso' ? 'un traspaso' : 'un cierre')+' hoy ('+(dup.responsable_nombre || '')+'). Cierra el turno sin caja.';
      msg.style.color = 'var(--red)';
    }
    setSalaTipoBtns(false, false);
    setSalaSkipBtn('mate');
    return;
  }

  setSalaSkipBtn('none');
  var puedeCerrar = isAdminU || CIERRE_SERVICIOS.indexOf(_salaTipoServ) !== -1;
  setSalaTipoBtns(true, puedeCerrar);
  if(msg){
    if(dup && isAdminU){
      msg.textContent = '⚠ Ya existe una operación de este servicio hoy. Como admin puedes duplicar — revisa antes de guardar.';
      msg.style.color = 'var(--amber)';
    } else if(!puedeCerrar){
      msg.textContent = 'Servicio '+_salaTipoServ+': solo traspaso. El cierre lo hace Cena o Evento.';
      msg.style.color = 'var(--text3)';
    } else {
      msg.textContent = '';
    }
  }
}

function startSalaTraspaso() {
  var b = document.getElementById('sala-tipo-btn-traspaso');
  if(b && b.disabled) return;
  if(!_salaTipoServ){ toast('Selecciona el servicio','err'); return; }
  closeSalaCajaChoice();
  openSalaTraspasoModal();
}

async function startSalaCierre() {
  var b = document.getElementById('sala-tipo-btn-cierre');
  if(b && b.disabled) return;
  if(!_salaTipoServ){ toast('Selecciona el servicio','err'); return; }
  closeSalaCajaChoice();
  // Abrir el cierre completo existente (formulario actual)
  if(typeof showScreen === 'function') showScreen('caja');
  setTimeout(function(){ if(typeof openCajaForm === 'function') openCajaForm(); }, 150);
}

async function skipSalaCajaOp() {
  var serv = _salaTipoServ || '—';
  closeSalaCajaChoice();
  // FIX-CIERRE-01: surfacear fallo de guardado (antes moría en silencio)
  try { await _doSaveTurno(); }
  catch(e){ console.error('[SALA] cierre de turno falló', e); toast('⛔ No se pudo cerrar el turno: '+(e && e.message ? e.message : e), 'err'); return; }
  var dup = await getSalaOpToday(serv);
  var dupEsMia = dup && (dup.responsable_id === currentUser.id);
  if(dupEsMia){
    toast('Turno cerrado — caja ya registrada', 'ok');
  } else {
    if(typeof auditLog === 'function') auditLog('SALA_CAJA_SKIP', currentUser.nombre+' cerró turno Sala servicio '+serv+' sin operación de caja ('+today()+')');
    toast('Turno cerrado sin operación de caja', 'ok');
  }
  if(typeof autoLogoutAfterCaja === 'function') autoLogoutAfterCaja();
}

// ── TRASPASO SALA: modal ────────────────────────────────────────────────
function openSalaTraspasoModal(existingId) {
  _salaTraspasoEditId = existingId || null;
  ['sala-tras-cash-posmews','sala-tras-cash-real','sala-tras-fondo-real','sala-tras-dif-exp'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  var difBlock = document.getElementById('sala-tras-dif-block');
  if(difBlock) difBlock.style.display = 'none';
  var difEl = document.getElementById('sala-tras-dif');
  if(difEl){ difEl.textContent = '—'; difEl.style.color = 'var(--text3)'; }
  var errEl = document.getElementById('sala-tras-err');
  if(errEl) errEl.textContent = '';
  var fondoEl = document.getElementById('sala-tras-fondo-recibido');
  if(fondoEl) fondoEl.value = '0.00';
  var label = document.getElementById('sala-tras-serv-label');

  if(!existingId){
    if(label) label.textContent = _salaTipoServ || '—';
    invalidateCache('sala_cash_closures');
    dbGetAll('sala_cash_closures').then(function(rows){
      var t = _salaFechaOperativa();
      // FIX-FONDO-TRASPASO: fondo_recibido = fondo_final del último CIERRE del día anterior
      // No tomar traspasos anteriores ni registros del mismo día
      var cierreAnterior = rows
        .filter(function(r){
          return r.tipo === 'cierre' && (r.fecha||'') < t
            && (r.fondo_real_sala != null || r.fondo_final != null);
        })
        .sort(function(a,b){
          return (b.fecha||'').localeCompare(a.fecha||'') ||
                 (b.created_at||'').localeCompare(a.created_at||'');
        });
      var ultimo = cierreAnterior[0];
      if(fondoEl && ultimo){
        fondoEl.value = parseFloat(ultimo.fondo_real_sala || ultimo.fondo_final || 0).toFixed(2);
        calcSalaTraspaso();
      }
    });
  } else {
    dbGetAll('sala_cash_closures').then(function(rows){
      var row = rows.find(function(r){ return r.id === existingId; });
      if(!row) return;
      try { var s = JSON.parse(row.servicios||'[]'); _salaTipoServ = s[0] || _salaTipoServ; } catch(e){}
      if(label) label.textContent = _salaTipoServ || '—';
      function set(id, val){ var el = document.getElementById(id); if(el && val != null) el.value = val; }
      set('sala-tras-fondo-recibido', (parseFloat(row.fondo_inicial)||0).toFixed(2));
      set('sala-tras-cash-posmews',   row.efectivo_posmews);
      set('sala-tras-cash-real',      row.efectivo_real);
      set('sala-tras-fondo-real',     row.fondo_real_sala);
      set('sala-tras-dif-exp',        row.comentario);
      calcSalaTraspaso();
    });
  }
  var m = document.getElementById('modal-sala-traspaso');
  if(m) m.style.display = 'flex';
}

function closeSalaTraspasoModal() {
  var m = document.getElementById('modal-sala-traspaso');
  if(m) m.style.display = 'none';
}

function calcSalaTraspaso() {
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value)||0; }
  var fondoRec = gv('sala-tras-fondo-recibido');
  var ventas   = gv('sala-tras-cash-posmews');
  // Sin retiro: esperado = fondo recibido + ventas efectivo POSMEWS
  var esperado = fondoRec + ventas;
  var espEl = document.getElementById('sala-tras-fondo-esperado');
  if(espEl){ espEl.textContent = esperado.toFixed(2).replace('.',',') + ' €'; espEl.style.color = esperado >= 0 ? 'var(--green)' : 'var(--red)'; }

  var realRaw = (document.getElementById('sala-tras-fondo-real')||{value:''}).value;
  var difEl    = document.getElementById('sala-tras-dif');
  var difBlock = document.getElementById('sala-tras-dif-block');
  if(realRaw === '' || isNaN(parseFloat(realRaw))){
    if(difEl){ difEl.textContent = '—'; difEl.style.color = 'var(--text3)'; }
    if(difBlock) difBlock.style.display = 'none';
    return;
  }
  var dif = (parseFloat(realRaw)||0) - esperado;
  var cuadrado = Math.abs(dif) < 0.01;
  if(difEl){
    difEl.textContent = cuadrado ? '✓ Fondo cuadrado' : '⚠ Diferencia fondo: ' + (dif>=0?'+':'') + dif.toFixed(2).replace('.',',') + '€';
    difEl.style.color = cuadrado ? 'var(--green)' : 'var(--red)';
  }
  if(difBlock) difBlock.style.display = cuadrado ? 'none' : 'block';
}

async function submitSalaTraspaso() {
  function gv(id){ return parseFloat((document.getElementById(id)||{}).value); }
  var errs = [];
  var serv     = _salaTipoServ || '';
  var fondoRec = gv('sala-tras-fondo-recibido') || 0;
  var ventas   = gv('sala-tras-cash-posmews');
  var cashReal = gv('sala-tras-cash-real');
  var fondoReal= gv('sala-tras-fondo-real');

  if(!serv)               errs.push('Selecciona servicio');
  if(isNaN(ventas) || ventas < 0) errs.push('Ventas efectivo POSMEWS obligatorio (0 si no hubo)');
  if(isNaN(cashReal))     errs.push('Cash real contado obligatorio');
  if(isNaN(fondoReal))    errs.push('Fondo real a traspasar obligatorio');

  var esperado = fondoRec + (ventas||0);
  var dif      = (fondoReal||0) - esperado;
  var exp      = (document.getElementById('sala-tras-dif-exp')||{value:''}).value.trim();
  if(!isNaN(fondoReal) && Math.abs(dif) > 0.01 && !exp) errs.push('Fondo no cuadrado: explicación obligatoria');

  var errEl = document.getElementById('sala-tras-err');
  if(errs.length){ if(errEl) errEl.textContent = errs.join(' · '); toast(errs[0],'err'); return; }
  if(errEl) errEl.textContent = '';

  if(!_salaTraspasoEditId && currentUser.rol !== 'admin'){
    var dup = await getSalaOpToday(serv);
    if(dup){
      var m = 'El servicio '+serv+' ya registró '+(dup.tipo==='traspaso'?'un traspaso':'un cierre')+' hoy. Solo una operación por servicio.';
      if(errEl) errEl.textContent = m; toast(m,'err'); return;
    }
  }

  var ts = localTs();
  var record = {
    id: _salaTraspasoEditId || genId(),
    fecha: _salaFechaOperativa(),
    servicios: JSON.stringify([serv]),
    tipo: 'traspaso',
    responsable_id: currentUser.id,
    responsable_nombre: currentUser.nombre,
    // Efectivo (sin retiro)
    efectivo_posmews: ventas,
    efectivo_real: cashReal,
    fondo_inicial: fondoRec,
    fondo_final: fondoReal,
    fondo_real_sala: fondoReal,
    retiro_caja_fuerte: 0,
    diferencia_efectivo: dif,
    diferencia_operativa_sala: dif,
    diferencia_caja: dif,
    // resto a 0 (no aplica en traspaso)
    tarjeta_posmews: 0, tarjeta_tpv: 0, propinas_tpv: 0, propinas: 0, diferencia_tarjeta: 0,
    stripe_posmews: 0, stripe_real: 0, diferencia_stripe: 0,
    room_charge: 0, syncrolab_charge: 0, cargo_alexander: 0,
    pension_desayuno_pax: 0, pension_comidacena_pax: 0,
    eur_pension_desayuno: 0, eur_pension_comidacena: 0,
    subtotal_neto: 0, total_bruto: 0, total_medios_pago: cashReal, total_ajustes: 0,
    comentario: exp || null,
    estado: 'Pendiente validación',
    updated_at: ts
  };
  if(!_salaTraspasoEditId) record.created_at = ts;
  // FIX-CIERRE-02: al editar, NO sobrescribir identidad del registro (fecha/turno/responsable).
  // Bug confirmado: editar una caja antigua le ponía fecha=today() y bloqueaba el turno de ese día.
  if(_salaTraspasoEditId){ delete record.fecha; delete record.servicios; delete record.responsable_id; delete record.responsable_nombre; }

  try {
    var url = SUPABASE_URL + '/rest/v1/sala_cash_closures';
    var method = _salaTraspasoEditId ? 'PATCH' : 'POST';
    var fetchUrl = _salaTraspasoEditId ? url + '?id=eq.' + encodeURIComponent(_salaTraspasoEditId) : url;
    var res = await fetch(fetchUrl, {
      method: method,
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(record)
    });
    if(!res.ok){ throw new Error('HTTP '+res.status+' '+(await res.text())); }
    invalidateCache('sala_cash_closures');
    if(typeof auditLog === 'function') auditLog(_salaTraspasoEditId ? 'SALA_TRASPASO_EDIT' : 'SALA_TRASPASO_SAVE', currentUser.nombre+' '+(_salaTraspasoEditId?'editó':'traspasó')+' caja Sala '+today()+' servicio '+serv+' · fondo '+(fondoReal||0).toFixed(2).replace('.',',')+'€');
    await _doSaveTurno();
    closeSalaTraspasoModal();
    toast('Traspaso de caja guardado','ok');
    if(typeof renderCajaList === 'function') renderCajaList();
    if(typeof autoLogoutAfterCaja === 'function') autoLogoutAfterCaja();
  } catch(e){
    if(errEl) errEl.textContent = 'Error al guardar: '+e.message;
    toast('Error al guardar traspaso','err');
  }
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
  if(e==='con_error') return '<span class="badge b-red">⚠ Con error</span>';
  if(e==='sin_control') return '<span class="badge b-gray">◐ Sin control</span>';
  if(e==='validado'||e==='Validado') return '<span class="badge b-green">✓ Validado</span>';
  if(e==='reabierto') return '<span class="badge b-orange">↩ Reabierto</span>';
  if(e==='corregido') return '<span class="badge b-blue">✔ Corregido</span>';
  if(e==='pendiente_validacion') return '<span class="badge b-gray">● Pendiente validación</span>';
  return '<span class="badge b-gray">'+e+'</span>';
}

async function corregirCajaSala(id){
  if(typeof canCorrectCaja!=='function' || !canCorrectCaja('Sala')){ toast('Sin permiso para corregir esta caja','err'); return; }
  var nota = prompt('Nota de corrección (obligatoria):');
  if(nota===null) return;
  if(!nota.trim()){ toast('La nota de corrección es obligatoria','err'); return; }
  openCajaForm(id);
  window._cajaCorrectMode = true; window._cajaCorrectNote = nota.trim();
  toast('Modo corrección: edita los importes y guarda. La caja seguirá validada.','ok');
}
window.corregirCajaSala = corregirCajaSala;

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