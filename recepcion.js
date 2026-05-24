
// ── HTML INJECTION ─────────────────────────────────────────
(function injectRecHTML() {
  var root = document.getElementById('rec-root');
  if(!root) { root = document.createElement('div'); root.id='rec-root'; document.body.appendChild(root); }
  root.innerHTML = `<div id="modal-rec-kpi" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;">
  <div style="background:var(--bg2);border:2px solid #8b5cf6;border-radius:14px;padding:24px;width:100%;max-width:580px;margin:40px auto;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.2em;margin-bottom:6px;">RECEPCIÓN · KPI DE TURNO</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">Cierre de turno — Preguntas de control</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:20px;">Responde antes de pasar al cuadre de caja.</div>

    <!-- OPERACIÓN -->
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px;">OPERACIÓN</div>
    <div class="grid2" style="margin-bottom:12px;">
      <div class="fg"><label>Check-ins realizados</label><input type="text" inputmode="decimal" id="kpi-checkins" placeholder="0" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>Check-outs realizados</label><input type="text" inputmode="decimal" id="kpi-checkouts" placeholder="0" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>Reservas gestionadas</label><input type="text" inputmode="decimal" id="kpi-reservas" placeholder="0" style="color:#111827;background:#ffffff;"></div>
    </div>
    <div class="fg" style="margin-bottom:8px;">
      <label>¿Quedan reservas pendientes para el siguiente turno?</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="tbtn" id="kpi-reserv-pend-si" onclick="setRecKpi('reservas_pendientes','si',this)">SÍ</button>
        <button class="tbtn" id="kpi-reserv-pend-no" onclick="setRecKpi('reservas_pendientes','no',this)">NO</button>
      </div>
    </div>
    <div id="kpi-reserv-pend-exp-block" style="display:none;" class="fg">
      <label>Explicación reservas pendientes <span class="req">*</span></label>
      <textarea id="kpi-reserv-pend-exp" rows="2" placeholder="Detalla las reservas pendientes..."></textarea>
    </div>

    <!-- UPSELL DESAYUNOS -->
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.15em;text-transform:uppercase;margin:16px 0 8px;">DESAYUNOS / UPSELL</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>¿Ofertaste desayunos a clientes sin desayuno incluido?</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="tbtn" id="kpi-upsell-si" onclick="setRecKpi('upsell_desayuno','si',this)">SÍ</button>
        <button class="tbtn" id="kpi-upsell-no" onclick="setRecKpi('upsell_desayuno','no',this)">NO</button>
        <button class="tbtn" id="kpi-upsell-na" onclick="setRecKpi('upsell_desayuno','na',this)">No aplica</button>
      </div>
    </div>
    <div id="kpi-upsell-detail" style="display:none;" class="grid2">
      <div class="fg"><label>¿A cuántos clientes se ofreció?</label><input type="text" inputmode="decimal" id="kpi-desal-ofertados" placeholder="0" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>¿Cuántos desayunos se vendieron?</label><input type="text" inputmode="decimal" id="kpi-desal-vendidos" placeholder="0" style="color:#111827;background:#ffffff;"></div>
    </div>

    <!-- VENTAS SYNCROLAB -->
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#06b6d4;letter-spacing:.15em;text-transform:uppercase;margin:16px 0 8px;">VENTAS SYNCROLAB</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>¿Has vendido servicios SYNCROLAB?</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="tbtn" id="kpi-syncro-si" onclick="setRecKpi('syncrolab_ventas','si',this);document.getElementById('kpi-syncro-block').style.display='block'">SÍ</button>
        <button class="tbtn" id="kpi-syncro-no" onclick="setRecKpi('syncrolab_ventas','no',this);document.getElementById('kpi-syncro-block').style.display='none'">NO</button>
      </div>
    </div>
    <div id="kpi-syncro-block" style="display:none;border:1px solid #06b6d4;border-radius:8px;padding:12px;margin-bottom:8px;">
      <div style="font-size:11px;color:#06b6d4;font-family:var(--font-mono);font-weight:700;margin-bottom:8px;">VENTAS SYNCROLAB — añade una línea por venta</div>
      <div id="syncro-ventas-container"></div>
      <button onclick="addSyncroVenta()" style="display:flex;align-items:center;gap:6px;background:rgba(6,182,212,.1);border:1px dashed #06b6d4;color:#06b6d4;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:12px;font-weight:700;width:100%;justify-content:center;margin-top:6px;">+ Añadir venta</button>
    </div>

    <!-- BITRIX24 / COMUNICACIÓN -->
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.15em;text-transform:uppercase;margin:16px 0 8px;">BITRIX24 / COMUNICACIÓN</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>¿Revisaste WhatsApp / email / llamadas pendientes en Bitrix24?</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="tbtn" id="kpi-comms-si" onclick="setRecKpi('comms_revisadas','si',this)">SÍ</button>
        <button class="tbtn" id="kpi-comms-no" onclick="setRecKpi('comms_revisadas','no',this)">NO</button>
      </div>
    </div>
    <div id="kpi-comms-no-block" style="display:none;" class="fg">
      <label>Motivo de no revisión <span class="req">*</span></label>
      <textarea id="kpi-comms-no-exp" rows="2" placeholder="¿Por qué no pudiste revisar?"></textarea>
    </div>
    <div class="fg" style="margin-bottom:8px;">
      <label>¿Queda algún lead pendiente en Bitrix24?</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="tbtn" id="kpi-lead-si" onclick="setRecKpi('lead_pendiente','si',this);document.getElementById('kpi-lead-block').style.display='block'">SÍ</button>
        <button class="tbtn" id="kpi-lead-no" onclick="setRecKpi('lead_pendiente','no',this);document.getElementById('kpi-lead-block').style.display='none'">NO</button>
      </div>
    </div>
    <div id="kpi-lead-block" style="display:none;border:1px solid #8b5cf6;border-radius:8px;padding:12px;margin-bottom:8px;">
      <div class="grid2">
        <div class="fg"><label>Descripción del lead <span class="req">*</span></label><textarea id="kpi-lead-desc" rows="2" placeholder="Describe el lead pendiente..."></textarea></div>
        <div class="fg"><label>¿Registrado en Bitrix24?</label>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <button class="tbtn" id="kpi-lead-bitrix-si" onclick="setRecKpi('lead_en_bitrix','si',this)">SÍ</button>
            <button class="tbtn" id="kpi-lead-bitrix-no" onclick="setRecKpi('lead_en_bitrix','no',this)">NO</button>
          </div>
        </div>
        <div class="fg"><label>Responsable</label><input type="text" id="kpi-lead-resp" placeholder="Nombre del responsable" style="color:#111827;background:#ffffff;"></div>
        <div class="fg"><label>Fecha/hora seguimiento</label><input type="datetime-local" id="kpi-lead-fecha" style="color:#111827;background:#ffffff;"></div>
      </div>
    </div>

    <!-- CLIENTES / INCIDENCIAS -->
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.15em;text-transform:uppercase;margin:16px 0 8px;">CLIENTES / INCIDENCIAS</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>¿Hubo clientes insatisfechos durante el turno?</label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="tbtn" id="kpi-clientes-si" onclick="setRecKpi('clientes_insatisfechos','si',this)">SÍ</button>
        <button class="tbtn" id="kpi-clientes-no" onclick="setRecKpi('clientes_insatisfechos','no',this)">NO</button>
      </div>
    </div>
    <div id="kpi-clientes-detail" style="display:none;" class="grid2">
      <div class="fg"><label>¿Cuántos clientes insatisfechos?</label><input type="text" inputmode="decimal" id="kpi-clientes-num" placeholder="0" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>¿Informado al responsable?</label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button class="tbtn" id="kpi-resp-inf-si" onclick="setRecKpi('clientes_resp_informado','si',this)">SÍ</button>
          <button class="tbtn" id="kpi-resp-inf-no" onclick="setRecKpi('clientes_resp_informado','no',this)">NO</button>
        </div>
      </div>
    </div>

    <div id="kpi-err" style="color:var(--red);font-size:12px;min-height:18px;margin-bottom:8px;font-family:var(--font-mono);"></div>
    <button onclick="submitRecKpi()" style="width:100%;padding:14px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">Continuar al cuadre de caja →</button>
  </div>
</div>
<div id="modal-rec-caja" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;">
  <div style="background:var(--bg2);border:2px solid #8b5cf6;border-radius:14px;padding:24px;width:100%;max-width:560px;margin:40px auto;">
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.2em;margin-bottom:6px;">RECEPCIÓN · CUADRE DE CAJA MEWS</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">Control de caja — <span id="rec-caja-turno-label">Turno</span></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:20px;">Compara los datos de MEWS con los valores reales. Si hay diferencia, es obligatorio explicarla.</div>

    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:8px;">TRASPASO</div>
    <div class="fg" style="margin-bottom:12px;">
      <label>Fondo recibido del turno anterior (€)</label>
      <input type="text" inputmode="decimal" id="rec-fondo-recibido" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;">
    </div>

    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.15em;margin-bottom:8px;">SEGÚN PMS MEWS</div>
    <div class="grid2" style="margin-bottom:12px;">
      <div class="fg"><label>Cash según MEWS (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="rec-cash-mews" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>Tarjeta según MEWS (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="rec-tarjeta-mews" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>Stripe según MEWS (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="rec-stripe-mews" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;"></div>
    </div>

    <!-- TRANSFERENCIAS -->
    <div class="sec-div" style="margin-top:10px;">Transferencias</div>
    <div class="grid2">
      <div class="fg"><label>Transferencias según MEWS (€)</label>
        <input type="text" inputmode="decimal" id="rec-trans-mews" placeholder="0.00" oninput="calcRecDifs()"></div>
      <div class="fg"><label>Transferencias Banco (€)</label>
        <input type="text" inputmode="decimal" id="rec-trans-real" placeholder="0.00" oninput="calcRecDifs();setTransferDate()">
        <div id="rec-trans-fecha" style="font-size:10px;color:var(--text3);margin-top:3px;font-family:var(--font-mono);display:none;"></div>
      </div>

    </div>

    <!-- CARGOS HOTEL -->
    <div class="sec-div" style="margin-top:10px;">Cargos Hotel</div>
    <div class="grid2">
      <div class="fg"><label>Room Charge (€)</label>
        <input type="text" inputmode="decimal" id="rec-room-charge" placeholder="0.00"></div>
      <div class="fg"><label>SYNCROLAB Charge (€)</label>
        <input type="text" inputmode="decimal" id="rec-syncrolab-charge" placeholder="0.00"></div>
      <div class="fg"><label>Cargo Alexander (€)</label>
        <input type="text" inputmode="decimal" id="rec-cargo-alexander" placeholder="0.00"></div>
    </div>

    <!-- PENSIONES -->
    <div class="sec-div" style="margin-top:10px;">Pensiones <span style="font-size:10px;color:var(--text3);font-weight:400;">— Informativo · no bloquea validación</span></div>
    <div class="grid2">
      <div class="fg"><label>Pensiones desayunos (nº pax)</label>
        <input type="text" inputmode="decimal" id="rec-pension-desayuno-pax" placeholder="0"></div>
      <div class="fg"><label>Pensiones comida+cena (nº pax)</label>
        <input type="text" inputmode="decimal" id="rec-pension-comidacena-pax" placeholder="0"></div>
      <div class="fg"><label>€ Pensiones Desayunos (importe)</label>
        <input type="text" inputmode="decimal" id="rec-eur-pension-desayuno" placeholder="0.00" oninput="fixLeadingZeros(this)"></div>
      <div class="fg"><label>€ Pensiones Comidas+Cenas (importe)</label>
        <input type="text" inputmode="decimal" id="rec-eur-pension-comidacena" placeholder="0.00" oninput="fixLeadingZeros(this)"></div>
    </div>

    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.15em;margin-bottom:8px;">REAL / FÍSICO</div>
    <div class="grid2" style="margin-bottom:12px;">
      <div class="fg"><label>Cash real contado (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="rec-cash-real" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>TPV físico (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="rec-tpv-real" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;"></div>
      <div class="fg"><label>Stripe real — Stripe.com (€) <span class="req">*</span></label><input type="text" inputmode="decimal" id="rec-stripe-real" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;"></div>
    </div>

    <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
      <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin-bottom:10px;">DIFERENCIAS CALCULADAS</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;text-align:center;margin-bottom:10px;">
        <div><div style="font-size:11px;color:var(--text3);">Δ Cash</div><div id="rec-dif-cash" style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--green);">0.00 €</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Δ Tarjeta</div><div id="rec-dif-tarjeta" style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--green);">0.00 €</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Δ Stripe</div><div id="rec-dif-stripe" style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--green);">0.00 €</div></div>
        <div><div style="font-size:11px;color:var(--text3);">Δ Transferencia</div><div id="rec-dif-trans" style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--green);">0.00 €</div></div>
      </div>
      <div style="text-align:center;padding:10px;background:var(--bg4);border-radius:6px;">
        <div style="font-size:11px;color:var(--text3);">Diferencia operativa total</div>
        <div id="rec-dif-total" style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:var(--green);">0.00 €</div>
      </div>
    </div>

    <div id="rec-dif-alert" style="display:none;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px;color:#dc2626;font-size:12px;margin-bottom:12px;font-family:var(--font-mono);">⚠ Diferencia detectada — explicación obligatoria antes de cerrar</div>

    <div id="rec-dif-exp-block" style="display:none;">
      <div class="fg"><label>Explicación de la diferencia <span class="req">*</span></label>
        <textarea id="rec-dif-exp" rows="2" placeholder="Explica el motivo de la diferencia detectada..." style="color:#111827;background:#ffffff;"></textarea></div>
      <div class="fg"><label>Acción tomada <span class="req">*</span></label>
        <textarea id="rec-dif-accion" rows="2" placeholder="¿Qué hiciste para resolver la diferencia?" style="color:#111827;background:#ffffff;"></textarea></div>
      <div class="fg"><label>¿Informado al responsable?</label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button class="tbtn" id="rec-dif-resp-si" onclick="setRecKpi('dif_informado','si',this)">SÍ</button>
          <button class="tbtn" id="rec-dif-resp-no" onclick="setRecKpi('dif_informado','no',this)">NO</button>
        </div>
      </div>
    </div>

    <!-- Retiro caja fuerte -->
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin:14px 0 8px;">CAJA FUERTE</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>¿Hay retiro para caja fuerte? <span class="req">*</span></label>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button class="tbtn" id="rec-cf-si" onclick="setRecKpi('caja_fuerte','si',this);document.getElementById('rec-cf-block').style.display='block';calcRecDifs()">SÍ</button>
        <button class="tbtn" id="rec-cf-no" onclick="setRecKpi('caja_fuerte','no',this);document.getElementById('rec-cf-block').style.display='none';document.getElementById('rec-cf-importe').value='0';calcRecDifs()">NO</button>
      </div>
    </div>
    <div id="rec-cf-block" style="display:none;" class="fg">
      <label>Importe retirado a caja fuerte (€) <span class="req">*</span></label>
      <input type="text" inputmode="decimal" id="rec-cf-importe" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;">
    </div>

    <!-- Traspaso fondo -->
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.15em;margin:14px 0 8px;">TRASPASO AL SIGUIENTE TURNO</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-family:var(--font-mono);">Calculado = Fondo recibido + Cash MEWS − Retiro caja fuerte</div>
    <div class="fg" style="margin-bottom:8px;">
      <label>Fondo esperado a traspasar (€)</label>
      <div id="rec-fondo-esperado" style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--green);padding:8px 0;">—</div>
    </div>
    <div class="fg" style="margin-bottom:8px;">
      <label>Fondo real a traspasar (€) <span class="req">*</span></label>
      <input type="text" inputmode="decimal" id="rec-fondo-traspaso" placeholder="0.00" oninput="calcRecDifs()" style="color:#111827;background:#ffffff;">
    </div>
    <div id="rec-fondo-dif" style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;">—</div>
    <div id="rec-caja-err" style="color:var(--red);font-size:12px;min-height:18px;margin-bottom:8px;font-family:var(--font-mono);"></div>
    <div style="display:flex;gap:8px;">
      <button onclick="closeRecCaja()" style="flex:1;padding:12px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">← Volver al KPI</button>
      <button onclick="submitRecCaja()" style="flex:2;padding:12px;background:#8b5cf6;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">💾 Guardar y cerrar turno</button>
    </div>
  </div>
</div>`;
})();

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
      updated_at: localTs()
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
