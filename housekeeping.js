// ═══════════════════════════════════════════════════════════════════════
// SYNCRO HUB — Módulo Housekeeping (FASE 1)
// ═══════════════════════════════════════════════════════════════════════
// Tablas Supabase:
//   housekeeping_room_clean_types     — 7 tipos de limpieza
//   housekeeping_rooms                — 46 habitaciones
//   housekeeping_public_areas         — 71 zonas
//   housekeeping_periodic_tasks       — 56 tareas periódicas
//   housekeeping_plans                — planes diarios (fecha + turno)
//   housekeeping_assignments          — asignaciones (núcleo)
//
// Roles:
//   admin           → todo
//   jefe_departamento (depto=Housekeeping) = Gobernanta → todo HK
//   gobernante       → idem (legacy SUPERVISOR_DEPT_MAP)
//   empleado (area=HK|Housekeeping) → solo lo asignado a sí mismo
// ═══════════════════════════════════════════════════════════════════════

// ── HTML INJECTION ─────────────────────────────────────────
(function injectHKHTML() {
  // Inyectar pantallas si no existen aún
  var main = document.querySelector('.main') || document.querySelector('#app .main');
  if(!main) {
    // En reload puede inyectarse antes; reintentar en DOMContentLoaded
    document.addEventListener('DOMContentLoaded', injectHKHTML);
    return;
  }
  // Pantalla "Mi Ruta" — reemplaza placeholder existente
  var ruta = document.getElementById('screen-ruta-mod');
  if(ruta) {
    ruta.innerHTML = `
      <div class="page-header">
        <div class="page-title">🧹 Mi Ruta</div>
        <div class="page-sub" id="hk-ruta-sub">Cargando asignaciones…</div>
      </div>
      <div id="hk-ruta-content" style="padding:0 16px 80px;"></div>
    `;
  }
  // Otras pantallas HK
  var screens = [
    {id:'hk-plan',     title:'📅 Planificación HK',          sub:'Planificar habitaciones y zonas'},
    {id:'hk-config',   title:'⚙ Configuración HK',           sub:'Habitaciones, zonas y tipos de limpieza'},
    {id:'hk-revision', title:'✅ Revisión HK',                sub:'Marcar como revisado · reabrir asignaciones'},
    {id:'hk-dash',     title:'📊 Dashboard HK',               sub:'KPIs del equipo'},
    {id:'hk-zonas',    title:'🧽 Zonas públicas',             sub:'Estado y ejecución ad-hoc'}
  ];
  screens.forEach(function(sc){
    if(!document.getElementById('screen-'+sc.id)){
      var d = document.createElement('div');
      d.className = 'screen';
      d.id = 'screen-'+sc.id;
      d.innerHTML = `
        <div class="page-header">
          <div class="page-title">${sc.title}</div>
          <div class="page-sub">${sc.sub}</div>
        </div>
        <div id="${sc.id}-content" style="padding:0 16px 80px;"></div>
      `;
      main.appendChild(d);
    }
  });

  // Modal de ejecución (iniciar / pausar / finalizar)
  // Modal asignación — debe estar en body, NO dentro de content (se destruiría en re-render)
  // Garantizar que el modal de asignación existe en body con todos sus elementos internos
  if(!document.getElementById('hk-asig-title')){
    var existingAsigModal = document.getElementById('modal-hk-asignar');
    if(existingAsigModal) existingAsigModal.parentNode.removeChild(existingAsigModal);
    var modalAsig = document.createElement('div');
    modalAsig.id = 'modal-hk-asignar';
    modalAsig.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:680;padding:16px;';
    modalAsig.innerHTML = `
      <div style="background:var(--bg2);border:2px solid var(--orange);border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">
        <div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--orange);letter-spacing:.15em;margin-bottom:6px;">NUEVA ASIGNACIÓN</div>
        <div id="hk-asig-title" style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:14px;">—</div>
        <div id="hk-asig-form"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button class="tbtn" onclick="document.getElementById('modal-hk-asignar').style.display='none'">Cancelar</button>
          <button class="tbtn" style="background:var(--orange);color:white;" onclick="hkGuardarAsig()">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalAsig);
  }

  // Verificar que el modal tiene el panel de incidencia (versiones antiguas no lo tienen)
  if(!document.getElementById('hk-exec-inci-panel')){
    var oldExecModal = document.getElementById('modal-hk-exec');
    if(oldExecModal) oldExecModal.parentNode.removeChild(oldExecModal);
    var modal = document.createElement('div');
    modal.id = 'modal-hk-exec';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:680;padding:16px;';
    modal.innerHTML = `
      <div style="background:var(--bg2);border:2px solid var(--orange);border-radius:14px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">
        <div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--orange);letter-spacing:.15em;margin-bottom:6px;">HOUSEKEEPING · EJECUCIÓN</div>
        <div id="hk-exec-title" style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;">—</div>
        <div id="hk-exec-sub" style="font-size:12px;color:var(--text3);margin-bottom:18px;">—</div>

        <div id="hk-exec-info" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:var(--text2);"></div>

        <div id="hk-exec-actions" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;"></div>

        <div id="hk-exec-inci-panel" style="display:none;background:#ef444411;border:1px solid #ef4444;border-radius:10px;padding:14px;margin-bottom:12px;"></div>

        <div class="fg">
          <label>Notas (opcional)</label>
          <textarea id="hk-exec-notas" rows="2" placeholder="Observaciones, problemas, hallazgos…"></textarea>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button class="tbtn" onclick="hkCloseExec()">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
})();

// ═══════════════════════════════════════════════════════════════════════
// HELPERS HK
// ═══════════════════════════════════════════════════════════════════════
const HK_DIAS = ['DOM','LUN','MAR','MIE','JUE','VIE','SAB']; // getDay() base
const HK_DIAS_LABEL = {LUN:'Lun',MAR:'Mar',MIE:'Mié',JUE:'Jue',VIE:'Vie',SAB:'Sáb',DOM:'Dom'};
const HK_TIPO_LIMPIEZA_LABEL = {
  repaso:'Repaso',
  repaso_sabanas:'Repaso + sábanas',
  salida_syncro:'Salida SYNCRO',
  salida_premium:'Salida Premium',
  salida_fly:'Salida FLY',
  inspeccion:'Inspección',
  destripe:'Destripe'
};
const HK_TIPO_TIEMPO = {
  repaso:15, repaso_sabanas:30,
  salida_syncro:35, salida_premium:45, salida_fly:55,
  inspeccion:1, destripe:0
};
const HK_ESTADO_LABEL = {
  pendiente:'Pendiente',
  en_proceso:'En proceso',
  pausada:'Pausada',
  finalizado:'Finalizado',
  revisado:'Revisado',
  requiere_correccion:'Requiere corrección'
};
const HK_ESTADO_COLOR = {
  pendiente:'#9ca3af',
  en_proceso:'#3b82f6',
  pausada:'#f59e0b',
  finalizado:'#10b981',
  revisado:'#059669',
  requiere_correccion:'#ef4444'
};

function hkIsHK(user){
  if(!user) return false;
  var area = (user.area||'').toLowerCase();
  return area === 'hk' || area === 'housekeeping';
}
function hkIsGobernanta(user){
  if(!user) return false;
  if(user.rol === 'admin') return true;
  if(user.rol === 'gobernante') return true;
  if(user.rol === 'subgobernante') return true;
  if(user.rol === 'jefe_departamento' && hkIsHK(user)) return true;
  if(user.rol === 'jefe' && hkIsHK(user)) return true;
  return false;
}
function hkCanRevisar(user){ return hkIsGobernanta(user); }
function hkCanPlanificar(user){ return hkIsGobernanta(user); }
function hkCanConfigurar(user){ return hkIsGobernanta(user); }

function hkTodayDow(){
  var d = new Date();
  return HK_DIAS[d.getDay()];
}
function hkNowHM(){
  var d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function hkGenId(prefix){ return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }

function hkParseDiasMin(json){
  if(!json) return {};
  if(typeof json === 'object') return json;
  try { return JSON.parse(json); } catch(e){ return {}; }
}

function hkFmtDuration(min){
  if(!min || min<=0) return '—';
  var h = Math.floor(min/60), m = min%60;
  return h>0 ? (h+'h'+(m>0?' '+m+'m':'')) : (m+'m');
}

function hkBadge(text, color){
  return `<span style="background:${color}22;color:${color};border:1px solid ${color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;">${text}</span>`;
}

// ═══════════════════════════════════════════════════════════════════════
// ROUTER — llamado desde shared.js showScreen
// ═══════════════════════════════════════════════════════════════════════
async function renderHKScreen(id){
  switch(id){
    case 'ruta-mod': return renderHKMiRuta();
    case 'hk-plan':  return renderHKPlanificacion();
    case 'hk-config': return renderHKConfig();
    case 'hk-revision': return renderHKRevision();
    case 'hk-dash': return renderHKDashboard();
    case 'hk-zonas': return renderHKZonasPublicas();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MI RUTA — vista del empleado HK y de Gobernanta para SU ruta
// ═══════════════════════════════════════════════════════════════════════
// Tab activo en Mi Ruta (tabs: 'habitaciones' | 'zonas')
// Tab activo en Mi Ruta
let _hkRutaTab = 'habitaciones';

// Helper: card clicable que enlaza evento via JS (evita problemas de escaping en innerHTML)
function _hkCard(asig, isGob){
  var color = HK_ESTADO_COLOR[asig.estado] || '#9ca3af';
  var label = HK_ESTADO_LABEL[asig.estado] || asig.estado;
  var tipoLabel = asig.tipo_limpieza ? (HK_TIPO_LIMPIEZA_LABEL[asig.tipo_limpieza]||asig.tipo_limpieza) : '';
  var icon = asig.tipo_objeto === 'habitacion' ? '🚪' : (asig.tipo_objeto === 'zona_publica' ? '🧽' : '🔧');
  var realMin = asig.tiempo_real_min ? hkFmtDuration(asig.tiempo_real_min) : '';
  var estMin  = asig.tiempo_estimado_min ? hkFmtDuration(asig.tiempo_estimado_min) : '';
  var rtFlag  = (asig.re_trabajo_count||0) > 0 ? ' 🔁' : '';
  var empLine = isGob ? '<div style="font-size:11px;color:var(--text3);margin-top:2px;">👤 ' + (asig.employee_nombre||'Sin asignar') + '</div>' : '';
  var motivo  = asig.motivo_reapertura
    ? '<div style="font-size:11px;color:#ef4444;margin-top:6px;background:#ef444411;padding:6px 8px;border-radius:6px;">⚠ Reabierta: ' + asig.motivo_reapertura + '</div>'
    : '';

  // Botón de acción según estado
  var accionLabel = '', accionColor = '';
  if(asig.estado === 'pendiente')        { accionLabel = '▶ Iniciar';    accionColor = '#3b82f6'; }
  else if(asig.estado === 'en_proceso')  { accionLabel = '✓ Finalizar';  accionColor = '#10b981'; }
  else if(asig.estado === 'pausada')     { accionLabel = '▶ Continuar';  accionColor = '#3b82f6'; }
  else if(asig.estado === 'requiere_correccion'){ accionLabel = '▶ Reanudar'; accionColor = '#f59e0b'; }

  var el = document.createElement('div');
  el.dataset.hkId = asig.id;
  el.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-left:4px solid ' + color + ';border-radius:8px;padding:12px;';

  var topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
  topRow.innerHTML = '<div style="font-size:11px;color:' + color + ';font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;">' + label + rtFlag + '</div>'
    + '<div style="font-size:11px;color:var(--text3);">' + estMin + (realMin ? ' · real ' + realMin : '') + '</div>';
  el.appendChild(topRow);

  var nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;';
  nameEl.textContent = icon + ' ' + asig.objeto_nombre;
  el.appendChild(nameEl);

  if(tipoLabel){ var tlEl=document.createElement('div'); tlEl.style.cssText='font-size:12px;color:var(--text3);margin-top:2px;'; tlEl.textContent=tipoLabel; el.appendChild(tlEl); }
  if(empLine){ var empEl=document.createElement('div'); empEl.innerHTML=empLine; el.appendChild(empEl); }
  if(motivo){ var motEl=document.createElement('div'); motEl.innerHTML=motivo; el.appendChild(motEl); }

  if(accionLabel){
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;';

    var btnAccion = document.createElement('button');
    btnAccion.className = 'tbtn';
    btnAccion.style.cssText = 'flex:1;background:' + accionColor + ';color:white;font-size:13px;padding:10px;';
    btnAccion.textContent = accionLabel;
    btnAccion.addEventListener('click', (function(id, estado){
      return function(e){
        e.stopPropagation();
        var act = estado==='pendiente'?'start':estado==='en_proceso'?'finish':estado==='pausada'?'resume':'start';
        _hkExecAsigId = id;
        hkAction(act).then(function(){ renderHKMiRuta(); });
      };
    })(asig.id, asig.estado));
    btnRow.appendChild(btnAccion);

    var btnDetalle = document.createElement('button');
    btnDetalle.className = 'tbtn';
    btnDetalle.style.cssText = 'font-size:12px;padding:10px 14px;';
    btnDetalle.textContent = '⋯';
    btnDetalle.title = 'Ver detalle / pausar / incidencia';
    btnDetalle.addEventListener('click', function(e){ e.stopPropagation(); hkOpenExec(asig.id); });
    btnRow.appendChild(btnDetalle);
    el.appendChild(btnRow);
  } else {
    el.style.cursor = 'pointer';
    el.addEventListener('click', function(){ hkOpenExec(asig.id); });
  }

  return el;
}

async function renderHKMiRuta(){
  var wrap = document.getElementById('hk-ruta-content');
  var sub  = document.getElementById('hk-ruta-sub');
  if(!wrap) return;
  if(!currentUser){ wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Sesión no iniciada</div>'; return; }

  var isGob = hkIsGobernanta(currentUser);

  // ── Tabs ──────────────────────────────────────────────────────────
  wrap.innerHTML = '';
  var tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:6px;margin-bottom:16px;';

  var btnHab = document.createElement('button');
  btnHab.className = 'tbtn' + (_hkRutaTab === 'habitaciones' ? ' on' : '');
  btnHab.textContent = '🚪 Habitaciones';
  btnHab.onclick = function(){ _hkRutaTab = 'habitaciones'; renderHKMiRuta(); };

  var btnZon = document.createElement('button');
  btnZon.className = 'tbtn' + (_hkRutaTab === 'zonas' ? ' on' : '');
  btnZon.textContent = '🧽 Zonas públicas';
  btnZon.onclick = function(){ _hkRutaTab = 'zonas'; renderHKMiRuta(); };

  tabBar.appendChild(btnHab);
  tabBar.appendChild(btnZon);
  wrap.appendChild(tabBar);

  if(_hkRutaTab === 'zonas'){
    if(sub) sub.textContent = 'Mi Ruta · ' + today();
    await _hkRenderZonasEnRuta(wrap, isGob);
    return;
  }

  // ── Tab Habitaciones ──────────────────────────────────────────────
  var loader = document.createElement('div');
  loader.style.cssText = 'color:var(--text3);font-size:12px;padding:8px 0;';
  loader.textContent = 'Cargando…';
  wrap.appendChild(loader);

  invalidateCache('housekeeping_assignments');
  invalidateCache('housekeeping_plans');
  var results = await Promise.all([
    getDB('housekeeping_assignments'),
    getDB('housekeeping_plans')
  ]);
  var asigs = results[0];
  var plans = results[1];

  var hoy = today();
  var planIds = plans.filter(function(p){ return p.fecha === hoy; }).map(function(p){ return p.id; });

  var mias = asigs.filter(function(a){
    if(a.employee_id !== currentUser.id) return false;
    // Pestaña Habitaciones: solo tipo_objeto='habitacion'
    if(a.tipo_objeto !== 'habitacion') return false;
    if(a.ad_hoc){
      var ts = a.hora_inicio || a.created_at || '';
      return ts.slice(0, 10) === hoy;
    }
    return planIds.indexOf(a.plan_id) >= 0;
  });

  var habCount = mias.filter(function(a){ return a.tipo_objeto === 'habitacion'; }).length;
  if(sub) sub.textContent = habCount + ' hab. · ' + hoy;

  // Quitar loader (si aún es hijo de wrap)
  if(loader.parentNode === wrap) wrap.removeChild(loader);

  if(!mias.length){
    var empty = document.createElement('div');
    empty.style.cssText = 'background:var(--bg3);border:1px dashed var(--border2);border-radius:10px;padding:32px;text-align:center;';
    empty.innerHTML = '<div style="font-size:32px;margin-bottom:8px;">🌱</div>'
      + '<div style="font-size:14px;color:var(--text2);font-weight:600;margin-bottom:4px;">Sin habitaciones asignadas hoy</div>'
      + '<div style="font-size:12px;color:var(--text3);">La Gobernanta planificará tu ruta del día.</div>';
    wrap.appendChild(empty);
    if(isGob){
      var gobBox = document.createElement('div');
      gobBox.style.cssText = 'margin-top:16px;background:var(--bg3);border:1px solid var(--orange);border-radius:10px;padding:16px;';
      gobBox.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--orange);font-weight:700;letter-spacing:.1em;margin-bottom:6px;">GOBERNANTA</div>'
        + '<div style="font-size:13px;color:var(--text2);margin-bottom:10px;">Ve a Planificación para asignar habitaciones al equipo.</div>';
      var btnPlan = document.createElement('button');
      btnPlan.className = 'tbtn';
      btnPlan.style.cssText = 'background:var(--orange);color:white;';
      btnPlan.textContent = '📅 Ir a Planificación';
      btnPlan.onclick = function(){ showScreen('hk-plan'); };
      gobBox.appendChild(btnPlan);
      wrap.appendChild(gobBox);
    }
    return;
  }

  // Orden operativo
  var orden = {en_proceso:0, pausada:1, pendiente:2, requiere_correccion:3, finalizado:4, revisado:5};
  mias.sort(function(a,b){ return (orden[a.estado]||9) - (orden[b.estado]||9); });

  // Banner en proceso
  var activa = mias.find(function(a){ return a.estado === 'en_proceso'; });
  if(activa){
    var inicio = activa.hora_inicio ? activa.hora_inicio.slice(11,16) : '—';
    var banner = document.createElement('div');
    banner.style.cssText = 'background:#3b82f622;border:2px solid #3b82f6;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;';
    var bannerBtn = document.createElement('button');
    bannerBtn.className = 'tbtn';
    bannerBtn.style.cssText = 'background:#3b82f6;color:white;';
    bannerBtn.textContent = 'Abrir';
    bannerBtn.addEventListener('click', (function(id){ return function(){ hkOpenExec(id); }; })(activa.id));
    banner.innerHTML = '<div style="font-size:24px;">⏱</div>'
      + '<div style="flex:1;">'
      + '<div style="font-size:11px;color:#3b82f6;font-weight:700;font-family:var(--font-mono);letter-spacing:.1em;">EN PROCESO DESDE ' + inicio + '</div>'
      + '<div style="font-size:14px;font-weight:700;color:var(--text);">' + activa.objeto_nombre + '</div>'
      + '</div>';
    banner.appendChild(bannerBtn);
    wrap.appendChild(banner);
  }

  // Lista de asignaciones
  var lista = document.createElement('div');
  lista.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  mias.forEach(function(a){
    lista.appendChild(_hkCard(a, isGob));
  });
  wrap.appendChild(lista);
}

// ─── ZONAS PÚBLICAS INTEGRADAS EN MI RUTA ──────────────────────────
async function _hkRenderZonasEnRuta(wrap, isGob){
  invalidateCache('housekeeping_public_areas');
  invalidateCache('housekeeping_assignments');
  invalidateCache('housekeeping_plans');
  var results = await Promise.all([
    getDB('housekeeping_public_areas'),
    getDB('housekeeping_assignments'),
    getDB('housekeeping_plans')
  ]);
  var zonas = results[0];
  var asigs = results[1];
  var plans = results[2];

  var dow = hkTodayDow();
  var hoy = today();
  var planIdsHoy = plans.filter(function(p){ return p.fecha === hoy; }).map(function(p){ return p.id; });

  zonas = zonas.filter(function(z){ return z.activa; });
  zonas.sort(function(a,b){ return (a.nombre||'').localeCompare(b.nombre||'', 'es'); });

  // Leyenda
  var leyenda = document.createElement('div');
  leyenda.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:11px;font-family:var(--font-mono);';
  leyenda.innerHTML = '<span>🟢 hecha hoy</span><span>🔵 en proceso</span><span>🟡 toca hoy</span><span>⚫ no toca</span>';
  wrap.appendChild(leyenda);

  // Nota: la gobernanta ve solo SUS zonas aquí (como una camarera más).
  // La supervisión completa vive en 🧽 Zonas Públicas (renderHKZonasPublicas).

  // Agrupar por zona_grupo, ordenar grupos alfabéticamente
  var grupos = {};
  zonas.forEach(function(z){
    var g = z.zona_grupo || 'OTROS';
    if(!grupos[g]) grupos[g] = [];
    grupos[g].push(z);
  });
  var gruposOrdenados = Object.keys(grupos).sort();

  gruposOrdenados.forEach(function(g){
    // Filtrar SIEMPRE por asignación al usuario actual (gobernanta o camarera)
    var zonasDelGrupo = grupos[g].filter(function(z){
      var asigMia = asigs.find(function(a){
        if(a.tipo_objeto !== 'zona_publica' || a.objeto_id !== z.id) return false;
        if(a.ad_hoc) return (a.hora_inicio||a.created_at||'').slice(0,10) === hoy;
        return planIdsHoy.indexOf(a.plan_id) >= 0;
      });
      return asigMia && asigMia.employee_id === currentUser.id;
    });
    if(!zonasDelGrupo.length) return; // saltar grupo si no hay zonas para este empleado

    var gLabel = document.createElement('div');
    gLabel.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.15em;margin:14px 0 6px;';
    gLabel.textContent = g;
    wrap.appendChild(gLabel);

    var gList = document.createElement('div');
    gList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    zonasDelGrupo.forEach(function(z){
      var dm = hkParseDiasMin(z.dias_minutos);
      var minHoy = dm[dow] || 0;
      var asigHoy = asigs.find(function(a){
        if(a.tipo_objeto !== 'zona_publica') return false;
        if(a.objeto_id !== z.id) return false;
        if(a.ad_hoc) return (a.hora_inicio||a.created_at||'').slice(0,10) === hoy;
        return planIdsHoy.indexOf(a.plan_id) >= 0;
      });

      var icon = '⚫', color = '#9ca3af', estadoText = 'No toca hoy';
      if(minHoy > 0){
        if(asigHoy && (asigHoy.estado === 'finalizado' || asigHoy.estado === 'revisado')){
          icon = '🟢'; color = '#10b981';
          estadoText = 'Hecha · ' + (asigHoy.hora_fin||'').slice(11,16);
        } else if(asigHoy && (asigHoy.estado === 'en_proceso' || asigHoy.estado === 'pausada')){
          icon = '🔵'; color = '#3b82f6';
          estadoText = 'En curso';
        } else {
          icon = '🟡'; color = '#f59e0b';
          estadoText = 'Pendiente · ' + minHoy + 'min';
        }
      }

      var row = document.createElement('div');
      row.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-left:4px solid ' + color + ';border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px;';
      row.innerHTML = '<div style="font-size:16px;">' + icon + '</div>'
        + '<div style="flex:1;">'
        + '<div style="font-size:13px;font-weight:600;color:var(--text);">' + z.nombre + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + estadoText + (z.tarea_grupo ? ' · ' + z.tarea_grupo : '') + '</div>'
        + '</div>';

      // Ejecución: solo puede abrir si la zona está asignada a él (pendiente/en_proceso/pausada)
      var puedeAbrir = asigHoy && (asigHoy.estado === 'en_proceso' || asigHoy.estado === 'pausada' || asigHoy.estado === 'pendiente');
      if(puedeAbrir){
        var btnAbrir = document.createElement('button');
        btnAbrir.className = 'tbtn';
        btnAbrir.style.fontSize = '11px';
        btnAbrir.textContent = 'Abrir';
        btnAbrir.addEventListener('click', (function(id){ return function(){ hkOpenExec(id); }; })(asigHoy.id));
        row.appendChild(btnAbrir);
      }

      gList.appendChild(row);
    });
    wrap.appendChild(gList);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL EJECUCIÓN — iniciar/pausar/continuar/finalizar
// ═══════════════════════════════════════════════════════════════════════
let _hkExecAsigId = null;

async function hkOpenExec(asigId){
  _hkExecAsigId = asigId;
  var asigs = await getDB('housekeeping_assignments');
  var a = asigs.find(x=>x.id===asigId);
  if(!a){ toast('Asignación no encontrada','error'); return; }

  document.getElementById('hk-exec-title').textContent = a.objeto_nombre;
  var sub = (a.tipo_limpieza ? (HK_TIPO_LIMPIEZA_LABEL[a.tipo_limpieza]||a.tipo_limpieza) : (a.tipo_objeto==='zona_publica'?'Zona pública':''))
    + (a.tiempo_estimado_min ? ' · estimado '+hkFmtDuration(a.tiempo_estimado_min) : '');
  document.getElementById('hk-exec-sub').textContent = sub;

  // Info actual
  var info = '';
  info += `<div style="display:flex;justify-content:space-between;align-items:center;">
    <span>Estado:</span>
    ${hkBadge(HK_ESTADO_LABEL[a.estado]||a.estado, HK_ESTADO_COLOR[a.estado]||'#9ca3af')}
  </div>`;
  if(a.hora_inicio) info += `<div style="margin-top:6px;">Inicio: <b>${a.hora_inicio.slice(11,16)}</b></div>`;
  if(a.hora_fin)    info += `<div style="margin-top:4px;">Fin: <b>${a.hora_fin.slice(11,16)}</b></div>`;
  if(a.total_pausa_min) info += `<div style="margin-top:4px;">Pausa acumulada: <b>${a.total_pausa_min} min</b></div>`;
  if(a.tiempo_real_min) info += `<div style="margin-top:4px;">Tiempo real: <b>${hkFmtDuration(a.tiempo_real_min)}</b></div>`;
  if(a.re_trabajo_count) info += `<div style="margin-top:6px;color:#ef4444;font-size:12px;">🔁 Re-trabajo: ${a.re_trabajo_count}×</div>`;
  document.getElementById('hk-exec-info').innerHTML = info;

  document.getElementById('hk-exec-notas').value = a.notas || '';

  // Acciones según estado
  var actions = document.getElementById('hk-exec-actions');
  actions.innerHTML = '';

  var soyDuenio = a.employee_id === currentUser.id;
  var gob = hkIsGobernanta(currentUser);

  if(a.estado === 'pendiente' && (soyDuenio || gob)){
    actions.innerHTML += `<button class="tbtn" style="background:#3b82f6;color:white;font-size:14px;padding:14px;" onclick="hkAction('start')">▶ Iniciar limpieza</button>`;
  }
  if(a.estado === 'en_proceso' && (soyDuenio || gob)){
    actions.innerHTML += `<button class="tbtn" style="background:#f59e0b;color:white;font-size:14px;padding:14px;" onclick="hkAction('pause')">⏸ Pausar</button>`;
    actions.innerHTML += `<button class="tbtn" style="background:#10b981;color:white;font-size:14px;padding:14px;" onclick="hkAction('finish')">✓ Finalizar</button>`;
  }
  if(a.estado === 'pausada' && (soyDuenio || gob)){
    actions.innerHTML += `<button class="tbtn" style="background:#3b82f6;color:white;font-size:14px;padding:14px;" onclick="hkAction('resume')">▶ Continuar</button>`;
    actions.innerHTML += `<button class="tbtn" style="background:#10b981;color:white;font-size:14px;padding:14px;" onclick="hkAction('finish')">✓ Finalizar</button>`;
  }
  if(a.estado === 'requiere_correccion' && (soyDuenio || gob)){
    actions.innerHTML += `<button class="tbtn" style="background:#3b82f6;color:white;font-size:14px;padding:14px;" onclick="hkAction('start')">▶ Reanudar tras corrección</button>`;
  }
  if(a.estado === 'finalizado' && gob){
    actions.innerHTML += `<button class="tbtn" style="background:#059669;color:white;font-size:14px;padding:14px;" onclick="hkAction('revisar')">✓ Marcar como Revisado</button>`;
    actions.innerHTML += `<button class="tbtn" style="background:#ef4444;color:white;font-size:14px;padding:14px;" onclick="hkAction('reabrir')">↺ Reabrir (requiere corrección)</button>`;
  }
  if(a.estado === 'revisado' && currentUser.rol === 'admin'){
    actions.innerHTML += `<button class="tbtn" style="background:#ef4444;color:white;font-size:14px;padding:14px;" onclick="hkAction('reabrir')">↺ Reabrir (admin)</button>`;
  }

  // Panel de incidencia inline (debajo de acciones, sobre notas)
  if(soyDuenio || gob){
    actions.innerHTML += `<button class="tbtn" style="background:transparent;border:1px solid #ef4444;color:#ef4444;font-size:13px;padding:12px;margin-top:4px;" onclick="hkToggleInciPanel()">⚠ Registrar incidencia</button>`;
  }

  // Panel de incidencia — existe en el modal como elemento fijo, solo resetear contenido
  var inciPanel = document.getElementById('hk-exec-inci-panel');
  if(inciPanel){
    inciPanel.style.display = 'none';
    var tiposOpts = HK_INCI_TIPOS.map(function(t){
      return '<option value="'+t+'">'+t+'</option>';
    }).join('');
    inciPanel.innerHTML = ''; // contenido lo maneja el modal secundario
  }

  document.getElementById('modal-hk-exec').style.display = 'flex';
}

function hkCloseExec(){
  document.getElementById('modal-hk-exec').style.display = 'none';
  _hkExecAsigId = null;
}

async function hkAction(act){
  if(!_hkExecAsigId) return;
  var asigs = await getDB('housekeeping_assignments');
  var a = asigs.find(x=>x.id===_hkExecAsigId);
  if(!a){ toast('Asignación no encontrada','error'); hkCloseExec(); return; }

  var notas = (document.getElementById('hk-exec-notas').value||'').trim();
  var updates = { notas: notas || a.notas };
  var ts = localTs();

  if(act === 'start'){
    // Regla: solo una activa por empleado
    var activa = asigs.find(x=>x.employee_id===currentUser.id && (x.estado==='en_proceso'));
    if(activa && activa.id !== a.id){
      if(!confirm('Tienes "'+activa.objeto_nombre+'" en curso. ¿Pausar esa y empezar esta?')) return;
      await dbUpdate('housekeeping_assignments', activa.id, {
        estado:'pausada',
        pausa_inicio: ts
      });
      invalidateCache('housekeeping_assignments');
    }
    // Si viene de "requiere_correccion" → incrementar re_trabajo y reiniciar hora_fin
    if(a.estado === 'requiere_correccion'){
      updates.re_trabajo_count = (a.re_trabajo_count||0) + 1;
      updates.hora_fin = null;
      updates.tiempo_real_min = null;
    }
    if(!a.hora_inicio){
      updates.hora_inicio = ts;
    }
    updates.estado = 'en_proceso';
    updates.pausa_inicio = null;
  }
  else if(act === 'pause'){
    updates.estado = 'pausada';
    updates.pausa_inicio = ts;
  }
  else if(act === 'resume'){
    // Acumular pausa
    if(a.pausa_inicio){
      var dPausa = new Date(ts).getTime() - new Date(a.pausa_inicio).getTime();
      var minPausa = Math.max(0, Math.round(dPausa/60000));
      updates.total_pausa_min = (a.total_pausa_min||0) + minPausa;
    }
    updates.pausa_inicio = null;
    updates.estado = 'en_proceso';
  }
  else if(act === 'finish'){
    if(!a.hora_inicio){ toast('No se puede finalizar sin iniciar','error'); return; }
    // Si estaba pausada → cerrar pausa primero
    var totalPausa = a.total_pausa_min || 0;
    if(a.estado === 'pausada' && a.pausa_inicio){
      var dP = new Date(ts).getTime() - new Date(a.pausa_inicio).getTime();
      totalPausa += Math.max(0, Math.round(dP/60000));
    }
    var dTotal = new Date(ts).getTime() - new Date(a.hora_inicio).getTime();
    var minTotal = Math.max(0, Math.round(dTotal/60000));
    var tReal = Math.max(0, minTotal - totalPausa);
    updates.estado = 'finalizado';
    updates.hora_fin = ts;
    updates.pausa_inicio = null;
    updates.total_pausa_min = totalPausa;
    updates.tiempo_real_min = tReal;
    // Si es la Gobernanta limpiando → auto-revisar (es máxima autoridad HK)
    if(hkIsGobernanta(currentUser) && a.employee_id === currentUser.id){
      updates.estado = 'revisado';
      updates.revisado_por = currentUser.id;
      updates.revisado_nombre = currentUser.nombre;
      updates.revisado_ts = ts;
    }
    // Actualizar last_clean en el objeto
    await hkUpdateLastClean(a, ts);
  }
  else if(act === 'revisar'){
    updates.estado = 'revisado';
    updates.revisado_por = currentUser.id;
    updates.revisado_nombre = currentUser.nombre;
    updates.revisado_ts = ts;
  }
  else if(act === 'reabrir'){
    var motivo = prompt('Motivo de la reapertura (obligatorio):');
    if(!motivo || !motivo.trim()){ toast('Motivo obligatorio','error'); return; }
    updates.estado = 'requiere_correccion';
    updates.motivo_reapertura = motivo.trim();
    updates.revisado_por = null;
    updates.revisado_nombre = null;
    updates.revisado_ts = null;
  }

  await dbUpdate('housekeeping_assignments', a.id, updates);
  invalidateCache('housekeeping_assignments');

  await auditLog('hk_'+act, {asig_id:a.id, objeto:a.objeto_nombre});

  toast('✓ '+(act==='start'?'Iniciada':act==='pause'?'Pausada':act==='resume'?'Continuada':act==='finish'?'Finalizada':act==='revisar'?'Revisada':'Reabierta'), 'ok');
  hkCloseExec();

  // Refrescar pantalla actual
  var current = document.querySelector('.screen.active');
  if(current){
    var id = current.id.replace('screen-','');
    showScreen(id);
  }
}

async function hkUpdateLastClean(a, ts){
  if(a.tipo_objeto === 'habitacion'){
    await dbUpdate('housekeeping_rooms', a.objeto_id, {
      last_clean_ts: ts,
      last_clean_type: a.tipo_limpieza,
      last_clean_employee: a.employee_nombre
    });
    invalidateCache('housekeeping_rooms');
  } else if(a.tipo_objeto === 'zona_publica'){
    await dbUpdate('housekeeping_public_areas', a.objeto_id, {
      ultima_limpieza_ts: ts,
      ultima_limpieza_emp: a.employee_nombre
    });
    invalidateCache('housekeeping_public_areas');
  } else if(a.tipo_objeto === 'tarea_periodica'){
    await dbUpdate('housekeeping_periodic_tasks', a.objeto_id, {
      ultima_ejecucion_ts: ts,
      ultima_ejecucion_emp: a.employee_nombre
    });
    invalidateCache('housekeeping_periodic_tasks');
  }
}

// Tipos de incidencia HK (del catálogo incidencia_tipos.js)
var HK_INCI_TIPOS = [
  'Habitación no lista / pendiente',
  'Repaso pendiente',
  'Limpieza insuficiente',
  'Queja / huésped insatisfecho',
  'Objeto olvidado',
  'Daño en habitación',
  'Falta de amenities / lencería',
  'Problema con lavandería',
  'Problema con mantenimiento',
  'Problema con recepción / estado habitación',
  'Accidente / seguridad',
  'Incumplimiento de procedimiento',
  'Retraso / disciplina',
  'Otro'
];

function hkToggleInciPanel(){
  // Abrir modal secundario de incidencia
  var tiposOpts = HK_INCI_TIPOS.map(function(t){
    return '<option value="'+t+'">'+t+'</option>';
  }).join('');

  var existing = document.getElementById('modal-hk-inci');
  if(existing) existing.parentNode.removeChild(existing);

  var m = document.createElement('div');
  m.id = 'modal-hk-inci';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
  m.innerHTML = '<div style="background:var(--bg2);border:2px solid #ef4444;border-radius:14px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">'
    + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:#ef4444;letter-spacing:.1em;margin-bottom:12px;">⚠ NUEVA INCIDENCIA · HOUSEKEEPING</div>'
    + '<div class="fg" style="margin-bottom:10px;">'
    + '<label>Tipo de incidencia</label>'
    + '<select id="hk-inci-tipo">'+tiposOpts+'</select>'
    + '</div>'
    + '<div class="fg" style="margin-bottom:10px;">'
    + '<label>Descripción <span style="color:#ef4444;">*</span></label>'
    + '<textarea id="hk-inci-desc" rows="3" placeholder="Describe el problema encontrado…"></textarea>'
    + '</div>'
    + '<div class="fg" style="margin-bottom:14px;">'
    + '<label>Acción tomada / inmediata</label>'
    + '<textarea id="hk-inci-accion" rows="2" placeholder="Qué hiciste para resolverlo (si aplica)…"></textarea>'
    + '</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button class="tbtn" style="flex:1;" id="hk-inci-cancel">Cancelar</button>'
    + '<button class="tbtn" style="flex:2;background:#ef4444;color:white;" onclick="hkGuardarIncidencia()">Guardar incidencia</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(m);
  document.getElementById('hk-inci-cancel').addEventListener('click', function(){ m.remove(); });
}

async function hkGuardarIncidencia(){
  if(!_hkExecAsigId) return;
  var asigs = await getDB('housekeeping_assignments');
  var a = asigs.find(function(x){ return x.id === _hkExecAsigId; });
  if(!a){ toast('Asignación no encontrada','error'); return; }

  var tipoEl = document.getElementById('hk-inci-tipo') || document.getElementById('hk-exec-inci-tipo');
  var descEl = document.getElementById('hk-inci-desc') || document.getElementById('hk-exec-inci-desc');
  var accionEl = document.getElementById('hk-inci-accion') || document.getElementById('hk-exec-inci-accion');

  var tipo = tipoEl ? tipoEl.value : 'Otro';
  var desc = descEl ? descEl.value.trim() : '';
  var accion = accionEl ? accionEl.value.trim() : '';

  if(!desc){ toast('Describe la incidencia','warn'); document.getElementById('hk-inci-desc') && document.getElementById('hk-inci-desc').focus(); return; }

  var inc = {
    id: hkGenId('inc'),
    fecha: today(),
    created_at: localTs(),
    shift_id: null,
    servicio: '[]',
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: 'Housekeeping',
    departamento: 'Housekeeping',
    categoria: 'Reportada por empleado',
    severidad: 'Media',
    descripcion: desc,
    accion_inmediata: accion,
    room: a.tipo_objeto === 'habitacion' && typeof normalizeIncidentRoom === 'function'
      ? (normalizeIncidentRoom(a.objeto_nombre || '') || null)
      : null,
    visible_companeros: false,
    staff_implicado_ids: '[]',
    staff_implicado_nombres: '[]',
    tipo_incidencia: tipo,
    requiere_formacion: 'No',
    requiere_disciplina: 'No',
    estado: 'Abierta'
  };

  var res = await dbInsert('incidencias', inc);
  if(!res){ toast('Error al guardar incidencia','error'); return; }
  invalidateCache('incidencias');
  await dbUpdate('housekeeping_assignments', a.id, { incidencia_id: inc.id });
  invalidateCache('housekeeping_assignments');
  toast('⚠ Incidencia registrada','ok');
  // Cerrar modal secundario de incidencia
  var mInci = document.getElementById('modal-hk-inci');
  if(mInci) mInci.remove();
  // Refrescar Revisión HK si está activa
  if(typeof renderHKRevision === 'function'){
    var revScreen = document.getElementById('screen-hk-revision');
    if(revScreen && revScreen.classList.contains('active')) renderHKRevision();
  }
}

async function hkCrearIncidencia(asigId){
  // Legacy: abre el panel inline si el modal está abierto
  hkToggleInciPanel();
}

// ═══════════════════════════════════════════════════════════════════════
// PLANIFICACIÓN — Gobernanta crea plan del día + asigna
// ═══════════════════════════════════════════════════════════════════════
let _hkPlanFecha = null;
let _hkPlanTurno = 'Mañana';

async function renderHKPlanificacion(){
  var content = document.getElementById('hk-plan-content');
  if(!content) return;
  if(!hkCanPlanificar(currentUser)){
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Sin permisos</div>';
    return;
  }
  if(!_hkPlanFecha) _hkPlanFecha = today();
  content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-family:var(--font-mono);font-size:11px;">Cargando…</div>';

  invalidateCache('housekeeping_plans');
  invalidateCache('housekeeping_assignments');
  var [plans, asigs, rooms, zonas, periodic, empleados] = await Promise.all([
    getDB('housekeeping_plans'),
    getDB('housekeeping_assignments'),
    getDB('housekeeping_rooms'),
    getDB('housekeeping_public_areas'),
    getDB('housekeeping_periodic_tasks'),
    getDB('employees')
  ]);

  // Limite 7 días
  var maxFecha = new Date(); maxFecha.setDate(maxFecha.getDate()+7);
  var maxStr = toYMD(maxFecha);

  var plan = plans.find(p=>p.fecha===_hkPlanFecha && p.turno===_hkPlanTurno);

  // Cargas por empleada
  var asigsPlan = plan ? asigs.filter(a=>a.plan_id === plan.id) : [];
  var cargas = {};
  asigsPlan.forEach(function(a){
    cargas[a.employee_id] = (cargas[a.employee_id]||0) + (a.tiempo_estimado_min||0);
  });

  // Empleados HK
  var empsHK = empleados.filter(function(e){
    if(e.estado && e.estado !== 'Activo') return false;
    return (e.area||'').toLowerCase().match(/(hk|housekeeping)/);
  });

  var html = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">
      <div class="fg" style="margin:0;flex:1;min-width:140px;">
        <label style="margin-bottom:2px;">Fecha</label>
        <input type="date" id="hk-plan-fecha" value="${_hkPlanFecha}" min="${today()}" max="${maxStr}"
          onchange="_hkPlanFecha=this.value;renderHKPlanificacion()">
      </div>
      <div class="fg" style="margin:0;">
        <label style="margin-bottom:2px;">Turno</label>
        <div style="display:flex;gap:4px;">
          <button class="tbtn ${_hkPlanTurno==='Mañana'?'on':''}" onclick="_hkPlanTurno='Mañana';renderHKPlanificacion()">Mañana</button>
          <button class="tbtn ${_hkPlanTurno==='Tarde'?'on':''}" onclick="_hkPlanTurno='Tarde';renderHKPlanificacion()">Tarde</button>
        </div>
      </div>
    </div>
  `;

  if(!plan){
    html += `
      <div style="background:var(--bg3);border:1px dashed var(--border2);border-radius:10px;padding:24px;text-align:center;">
        <div style="font-size:14px;color:var(--text2);margin-bottom:12px;">No hay plan para ${fmtDate(_hkPlanFecha)} · ${_hkPlanTurno}</div>
        <button class="tbtn" style="background:var(--orange);color:white;" onclick="hkCreatePlan()">+ Crear plan</button>
        <button class="tbtn" style="margin-left:8px;" onclick="hkAutogenPlan()">🤖 Autogenerar zonas del día</button>
      </div>
    `;
    content.innerHTML = html;
    return;
  }

  // Resumen cargas
  html += '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px;">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.1em;margin-bottom:8px;">CARGA POR EMPLEADO (estimado)</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
  if(!empsHK.length){
    html += '<div style="color:var(--text3);font-size:12px;">No hay empleados HK</div>';
  }
  empsHK.forEach(function(e){
    var min = cargas[e.id]||0;
    var color = min === 0 ? '#9ca3af' : (min > 450 ? '#ef4444' : (min > 360 ? '#f59e0b' : '#10b981'));
    html += `<div style="background:var(--bg2);border:1px solid ${color};padding:6px 10px;border-radius:8px;font-size:11px;">
      <span style="font-weight:700;color:var(--text);">${e.nombre}</span>
      <span style="color:${color};margin-left:6px;font-family:var(--font-mono);">${hkFmtDuration(min)}</span>
    </div>`;
  });
  html += '</div></div>';

  // Lista de asignaciones
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);font-weight:700;letter-spacing:.1em;">ASIGNACIONES ('+asigsPlan.length+')</div>';
  html += '<div style="display:flex;gap:6px;">';
  html += '<button class="tbtn" onclick="hkOpenAsignar(\'habitacion\')">+ Habitación</button>';
  html += '<button class="tbtn" onclick="hkOpenAsignar(\'zona_publica\')">+ Zona</button>';
  html += '<button class="tbtn" onclick="hkOpenAsignar(\'tarea_periodica\')">+ Periódica</button>';
  html += '</div></div>';

  if(!asigsPlan.length){
    html += '<div style="background:var(--bg3);border:1px dashed var(--border2);border-radius:10px;padding:24px;text-align:center;color:var(--text3);font-size:12px;">Sin asignaciones aún</div>';
  } else {
    asigsPlan.sort(function(a,b){ return (a.employee_nombre||'').localeCompare(b.employee_nombre||''); });
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    asigsPlan.forEach(function(a){
      var color = HK_ESTADO_COLOR[a.estado]||'#9ca3af';
      var icon = a.tipo_objeto === 'habitacion' ? '🚪' : (a.tipo_objeto === 'zona_publica' ? '🧽' : '🔧');
      var tipoLabel = a.tipo_limpieza ? (HK_TIPO_LIMPIEZA_LABEL[a.tipo_limpieza]||a.tipo_limpieza) : '';
      html += `
        <div style="background:var(--bg2);border:1px solid var(--border);border-left:4px solid ${color};border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:var(--text);">${icon} ${a.objeto_nombre}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">
              ${a.employee_nombre} · ${tipoLabel} · est. ${hkFmtDuration(a.tiempo_estimado_min)}
              ${hkBadge(HK_ESTADO_LABEL[a.estado]||a.estado, color)}
            </div>
          </div>
          ${a.estado==='pendiente' ? `<button class="tbtn" style="font-size:11px;" onclick="hkBorrarAsig('${a.id}')">×</button>` : ''}
        </div>
      `;
    });
    html += '</div>';
  }

  content.innerHTML = html;
}

async function hkCreatePlan(){
  if(!hkCanPlanificar(currentUser)){ toast('Sin permisos','error'); return; }
  var plan = {
    id: hkGenId('hkpl'),
    fecha: _hkPlanFecha,
    turno: _hkPlanTurno,
    creado_por: currentUser.id,
    creado_nombre: currentUser.nombre,
    estado: 'activo'
  };
  var res = await dbInsert('housekeeping_plans', plan);
  if(!res){ toast('Error al crear plan','error'); return; }
  invalidateCache('housekeeping_plans');
  toast('Plan creado','ok');
  renderHKPlanificacion();
}

async function hkAutogenPlan(){
  // Crear plan si no existe + auto-añadir zonas públicas que tocan ese día
  if(!hkCanPlanificar(currentUser)){ toast('Sin permisos','error'); return; }
  var plans = await getDB('housekeeping_plans');
  var plan = plans.find(p=>p.fecha===_hkPlanFecha && p.turno===_hkPlanTurno);
  if(!plan){
    await hkCreatePlan();
    plans = await getDB('housekeeping_plans');
    plan = plans.find(p=>p.fecha===_hkPlanFecha && p.turno===_hkPlanTurno);
    if(!plan){ return; }
  }

  // Día de la semana del fecha
  var d = new Date(_hkPlanFecha+'T00:00:00');
  var dow = HK_DIAS[d.getDay()];

  var zonas = await getDB('housekeeping_public_areas');
  var zonasHoy = zonas.filter(function(z){
    if(!z.activa) return false;
    var dm = hkParseDiasMin(z.dias_minutos);
    return dm[dow] && Number(dm[dow])>0;
  });

  if(!zonasHoy.length){ toast('No hay zonas activas para '+dow,'warn'); return; }
  if(!confirm('Se crearán '+zonasHoy.length+' asignaciones de zonas para '+dow+'. Empleado quedará como SIN ASIGNAR (se asignará después). ¿Continuar?')) return;

  // Crear asignaciones sin empleado asignado (employee_id = '__SIN_ASIGNAR__')
  var ts = localTs();
  for(var i=0;i<zonasHoy.length;i++){
    var z = zonasHoy[i];
    var dm = hkParseDiasMin(z.dias_minutos);
    var tEst = Number(dm[dow])||z.tiempo_estimado_min||0;
    var row = {
      id: hkGenId('hkas'),
      plan_id: plan.id,
      ad_hoc: 0,
      employee_id: '__SIN_ASIGNAR__',
      employee_nombre: 'Sin asignar',
      tipo_objeto: 'zona_publica',
      objeto_id: z.id,
      objeto_nombre: z.nombre,
      tiempo_estimado_min: tEst,
      estado: 'pendiente'
    };
    await dbInsert('housekeeping_assignments', row);
  }
  invalidateCache('housekeeping_assignments');
  toast(zonasHoy.length+' zonas añadidas','ok');
  renderHKPlanificacion();
}

let _hkAsignarTipo = null;
let _hkAsigPlanObj  = null;
let _hkAsigRooms    = [];
let _hkAsigZonas    = [];
let _hkAsigPeriodic = [];
let _hkAsigEmps     = [];

async function hkOpenAsignar(tipo){
  try {
  _hkAsignarTipo = tipo;
  var plans = await getDB('housekeeping_plans');
  var plan = plans.find(function(p){ return p.fecha===_hkPlanFecha && p.turno===_hkPlanTurno; });
  if(!plan){ toast('Sin plan para hoy · '+_hkPlanFecha+' · '+_hkPlanTurno,'warn'); return; }
  _hkAsigPlanObj = plan;

  var results = await Promise.all([
    getDB('housekeeping_rooms'),
    getDB('housekeeping_public_areas'),
    getDB('housekeeping_periodic_tasks'),
    getDB('employees'),
    getDB('housekeeping_assignments')
  ]);
  var rooms    = results[0];
  var zonas    = results[1];
  var periodic = results[2];
  var empleados= results[3];
  var asigs    = results[4];

  // Habitaciones ya asignadas en este plan
  var habsYa = new Set(
    asigs.filter(function(a){ return a.plan_id===plan.id && a.tipo_objeto==='habitacion'; })
         .map(function(a){ return a.objeto_id; })
  );

  _hkAsigEmps = empleados.filter(function(e){
    if(e.estado && e.estado !== 'Activo') return false;
    return (e.area||'').toLowerCase().match(/(hk|housekeeping)/);
  });
  _hkAsigRooms = rooms.filter(function(r){ return r.activa; })
    .sort(function(a,b){
      return String(a.planta||'').localeCompare(String(b.planta||'')) ||
             String(a.numero||'').localeCompare(String(b.numero||''));
    });
  _hkAsigZonas    = zonas.filter(function(z){ return z.activa; })
    .sort(function(a,b){ return (a.nombre||'').localeCompare(b.nombre||'','es'); });
  _hkAsigPeriodic = periodic.filter(function(p){ return p.activa; });

  var titulo = tipo==='habitacion' ? 'Asignar habitaciones' :
               tipo==='zona_publica' ? 'Asignar zona pública' : 'Asignar tarea periódica';

  // Garantizar que el modal existe en body con sus elementos internos
  if(!document.getElementById('hk-asig-title')){
    var _old = document.getElementById('modal-hk-asignar');
    if(_old) _old.parentNode.removeChild(_old);
    var _m = document.createElement('div');
    _m.id = 'modal-hk-asignar';
    _m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:680;padding:16px;';
    _m.innerHTML = '<div style="background:var(--bg2);border:2px solid var(--orange);border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">'
      + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--orange);letter-spacing:.15em;margin-bottom:6px;">NUEVA ASIGNACIÓN</div>'
      + '<div id="hk-asig-title" style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:14px;">—</div>'
      + '<div id="hk-asig-form"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'
      + '<button class="tbtn" id="hk-asig-cancel">Cancelar</button>'
      + '<button class="tbtn" style="background:var(--orange);color:white;" id="hk-asig-save">Guardar</button>'
      + '</div></div>';
    document.body.appendChild(_m);
    document.getElementById('hk-asig-cancel').addEventListener('click', function(){ document.getElementById('modal-hk-asignar').style.display='none'; });
    document.getElementById('hk-asig-save').addEventListener('click', function(){ hkGuardarAsig(); });
  }

  document.getElementById('hk-asig-title').textContent = titulo;

  var form = document.getElementById('hk-asig-form');
  form._habsYa = habsYa;

  // ── Empleado (común) ─────────────────────────────────────────────
  var empDiv = document.createElement('div');
  empDiv.className = 'fg';
  empDiv.innerHTML = '<label>Empleado/a</label>';
  var empSel = document.createElement('select');
  empSel.id = 'hk-asig-emp';
  var optSin = document.createElement('option');
  optSin.value = '__SIN_ASIGNAR__'; optSin.textContent = '— Sin asignar —';
  empSel.appendChild(optSin);
  _hkAsigEmps.forEach(function(e){
    var opt = document.createElement('option');
    opt.value = e.id; opt.setAttribute('data-nombre', e.nombre);
    opt.textContent = e.nombre + (e.puesto ? ' · ' + e.puesto : '');
    empSel.appendChild(opt);
  });
  empDiv.appendChild(empSel);
  form.innerHTML = '';
  form.appendChild(empDiv);

  // ── HABITACIONES: tipo de limpieza + checkboxes ──────────────────
  if(tipo === 'habitacion'){
    // Tipo limpieza
    var tlimpDiv = document.createElement('div');
    tlimpDiv.className = 'fg';
    tlimpDiv.innerHTML = '<label>Tipo de limpieza</label>';
    var tlimpSel = document.createElement('select');
    tlimpSel.id = 'hk-asig-tlimp';
    [
      ['repaso',         "Repaso · 15 min"],
      ['repaso_sabanas', "Repaso + sábanas · 30 min"],
      ['salida_syncro',  "Salida SYNCRO · 35 min"],
      ['salida_premium', "Salida Premium · 45 min"],
      ['salida_fly',     "Salida FLY · 55 min"],
      ['inspeccion',     "Inspección · 1 min"],
      ['destripe',       "Destripe · variable"]
    ].forEach(function(pair){
      var opt = document.createElement('option');
      opt.value = pair[0]; opt.textContent = pair[1];
      tlimpSel.appendChild(opt);
    });
    tlimpSel.addEventListener('change', function(){
      hkRenderHabCheckboxes();
      hkUpdateHabResumen();
    });
    tlimpDiv.appendChild(tlimpSel);
    form.appendChild(tlimpDiv);

    // Habitaciones — grid de checkboxes
    var habDiv = document.createElement('div');
    habDiv.className = 'fg';
    var habHeader = document.createElement('div');
    habHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    habHeader.innerHTML = '<label style="margin:0;">Habitaciones</label>';
    // Aviso de restricción de tipo
    var _tlimpVal = tlimpSel ? tlimpSel.value : '';
    var _tiposAllow = HK_TLIMP_TIPOS_PERMITIDOS[_tlimpVal];
    if(_tiposAllow){
      var avisoEl = document.createElement('div');
      avisoEl.style.cssText = 'font-size:10px;color:var(--orange);font-family:var(--font-mono);margin-top:4px;grid-column:1/-1;';
      avisoEl.textContent = 'Solo habitaciones: ' + _tiposAllow.join(', ');
      habHeader.appendChild(avisoEl);
    }
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;';
    var btnTodas = document.createElement('button');
    btnTodas.type = 'button'; btnTodas.className = 'tbtn';
    btnTodas.style.cssText = 'font-size:11px;padding:4px 8px;';
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = function(){ hkSelAllHab(true); };
    var btnNing = document.createElement('button');
    btnNing.type = 'button'; btnNing.className = 'tbtn';
    btnNing.style.cssText = 'font-size:11px;padding:4px 8px;';
    btnNing.textContent = 'Ninguna';
    btnNing.onclick = function(){ hkSelAllHab(false); };
    btnRow.appendChild(btnTodas); btnRow.appendChild(btnNing);
    habHeader.appendChild(btnRow);
    habDiv.appendChild(habHeader);

    var grid = document.createElement('div');
    grid.id = 'hk-asig-hab-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;max-height:320px;overflow-y:auto;padding:2px;';
    habDiv.appendChild(grid);

    var resumen = document.createElement('div');
    resumen.id = 'hk-asig-resumen';
    resumen.style.cssText = 'margin-top:8px;font-size:11px;color:var(--text3);font-family:var(--font-mono);';
    resumen.textContent = 'Ninguna seleccionada';
    habDiv.appendChild(resumen);
    form.appendChild(habDiv);

    hkRenderHabCheckboxes();

  // ── ZONA PÚBLICA ─────────────────────────────────────────────────
  } else if(tipo === 'zona_publica'){
    var dow = HK_DIAS[new Date(_hkPlanFecha+'T00:00:00').getDay()];
    var zonaDiv = document.createElement('div');
    zonaDiv.className = 'fg';
    zonaDiv.innerHTML = '<label>Zona pública</label>';
    var zonaSel = document.createElement('select');
    zonaSel.id = 'hk-asig-obj';
    _hkAsigZonas.forEach(function(z){
      var dm = hkParseDiasMin(z.dias_minutos);
      var minHoy = dm[dow] || 0;
      var opt = document.createElement('option');
      opt.value = z.id;
      opt.setAttribute('data-nombre', z.nombre);
      opt.setAttribute('data-min', String(minHoy || z.tiempo_estimado_min || 15));
      opt.textContent = z.nombre + (minHoy ? ' · '+minHoy+'min' : ' · no toca hoy');
      zonaSel.appendChild(opt);
    });
    zonaSel.addEventListener('change', hkRecalcEst);
    zonaDiv.appendChild(zonaSel);
    form.appendChild(zonaDiv);
    _hkAddEstPrio(form);

  // ── TAREA PERIÓDICA ───────────────────────────────────────────────
  } else if(tipo === 'tarea_periodica'){
    var perDiv = document.createElement('div');
    perDiv.className = 'fg';
    perDiv.innerHTML = '<label>Tarea periódica</label>';
    var perSel = document.createElement('select');
    perSel.id = 'hk-asig-obj';
    _hkAsigPeriodic.forEach(function(p){
      var t = p.tiempo_estimado_min || 60;
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.setAttribute('data-nombre', p.nombre);
      opt.setAttribute('data-min', String(t));
      opt.textContent = p.nombre + ' · ' + (p.tiempo_referencia || t+' min');
      perSel.appendChild(opt);
    });
    perSel.addEventListener('change', hkRecalcEst);
    perDiv.appendChild(perSel);
    form.appendChild(perDiv);
    _hkAddEstPrio(form);
  }

  document.getElementById('modal-hk-asignar').style.display = 'flex';
  } catch(e) {
    console.error('[hkOpenAsignar] Error:', e);
    toast('Error al abrir modal: ' + (e.message||String(e)), 'error');
  }
}

// Helper: añade campos Tiempo estimado + Prioridad al form
function _hkAddEstPrio(form){
  var estDiv = document.createElement('div');
  estDiv.className = 'fg';
  estDiv.innerHTML = '<label>Tiempo estimado (min)</label><input type="number" id="hk-asig-est" min="0" max="600" value="15">';
  form.appendChild(estDiv);
  var prioDiv = document.createElement('div');
  prioDiv.className = 'fg';
  prioDiv.innerHTML = '<label>Prioridad</label><select id="hk-asig-prio"><option value="normal">Normal</option><option value="alta">Alta</option></select>';
  form.appendChild(prioDiv);
  hkRecalcEst();
}

// Tipos de habitación permitidos por tipo de limpieza
// null = sin restricción (todos los tipos)
var HK_TLIMP_TIPOS_PERMITIDOS = {
  salida_syncro:  ['SYNCRO'],
  salida_premium: ['PREMIUM','PANORAMIC','QUEEN'],
  salida_fly:     ['FLY']
  // repaso, repaso_sabanas, inspeccion, destripe: sin restricción
};

// Renderiza/re-renderiza la grilla de checkboxes de habitaciones
function hkRenderHabCheckboxes(){
  var grid = document.getElementById('hk-asig-hab-grid');
  if(!grid) return;
  var form = document.getElementById('hk-asig-form');
  var habsYa = (form && form._habsYa) ? form._habsYa : new Set();
  var TIPO_COLOR = {SYNCRO:'#3b82f6',PREMIUM:'#8b5cf6',PANORAMIC:'#a855f7',FLY:'#06b6d4',QUEEN:'#f59e0b'};

  // Filtrar habitaciones por tipo permitido según limpieza seleccionada
  var tlimpSel = document.getElementById('hk-asig-tlimp');
  var tiposPermitidos = HK_TLIMP_TIPOS_PERMITIDOS[tlimpSel ? tlimpSel.value : ''] || null;
  var roomsFiltradas = tiposPermitidos
    ? _hkAsigRooms.filter(function(r){ return tiposPermitidos.indexOf(r.tipo) >= 0; })
    : _hkAsigRooms;

  // Agrupar por planta
  var porPlanta = {};
  roomsFiltradas.forEach(function(r){
    var p = 'P'+(r.planta||'?');
    if(!porPlanta[p]) porPlanta[p]=[];
    porPlanta[p].push(r);
  });

  grid.innerHTML = '';
  Object.keys(porPlanta).sort().forEach(function(planta){
    var sep = document.createElement('div');
    sep.style.cssText = 'grid-column:1/-1;font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.1em;margin-top:6px;';
    sep.textContent = planta;
    grid.appendChild(sep);

    porPlanta[planta].forEach(function(r){
      var yaAsig = habsYa.has(r.id);
      var col = TIPO_COLOR[r.tipo] || '#9ca3af';
      var lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;flex-direction:column;align-items:center;background:var(--bg3);border:2px solid var(--border);border-radius:8px;padding:6px 4px;font-size:11px;gap:2px;cursor:'+(yaAsig?'not-allowed':'pointer')+';'+(yaAsig?'opacity:.35;':'')+'transition:border-color .12s;';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-room-id', r.id);
      cb.setAttribute('data-room-nombre', 'Hab. '+r.numero+' ('+r.tipo+')');
      cb.style.display = 'none';
      if(yaAsig) cb.disabled = true;
      var numSpan = document.createElement('span');
      numSpan.style.cssText = 'font-weight:700;color:var(--text);';
      numSpan.textContent = r.numero;
      var tipoSpan = document.createElement('span');
      tipoSpan.style.cssText = 'font-size:9px;color:'+col+';font-family:var(--font-mono);';
      tipoSpan.textContent = r.tipo;
      lbl.appendChild(cb);
      lbl.appendChild(numSpan);
      lbl.appendChild(tipoSpan);
      if(!yaAsig){
        lbl.addEventListener('click', function(e){
          e.preventDefault();
          cb.checked = !cb.checked;
          lbl.style.borderColor = cb.checked ? col : 'var(--border)';
          lbl.style.background  = cb.checked ? col+'22' : 'var(--bg3)';
          hkUpdateHabResumen();
        });
      }
      grid.appendChild(lbl);
    });
  });
  hkUpdateHabResumen();
}

function hkSelAllHab(sel){
  var TIPO_COLOR = {SYNCRO:'#3b82f6',PREMIUM:'#8b5cf6',PANORAMIC:'#a855f7',FLY:'#06b6d4',QUEEN:'#f59e0b'};
  document.querySelectorAll('#hk-asig-hab-grid input[type=checkbox]:not(:disabled)').forEach(function(cb){
    cb.checked = sel;
    var lbl = cb.closest('label');
    var r = _hkAsigRooms.find(function(x){ return x.id===cb.getAttribute('data-room-id'); });
    var col = r ? (TIPO_COLOR[r.tipo]||'#9ca3af') : 'var(--orange)';
    if(lbl){
      lbl.style.borderColor = sel ? col : 'var(--border)';
      lbl.style.background  = sel ? col+'22' : 'var(--bg3)';
    }
  });
  hkUpdateHabResumen();
}

function hkUpdateHabResumen(){
  var resumen = document.getElementById('hk-asig-resumen');
  if(!resumen) return;
  var cbs = document.querySelectorAll('#hk-asig-hab-grid input[type=checkbox]:checked');
  var tlimpSel = document.getElementById('hk-asig-tlimp');
  var tlimp = tlimpSel ? tlimpSel.value : 'repaso';
  var tUnit = HK_TIPO_TIEMPO[tlimp] || 0;
  var n = cbs.length;
  resumen.textContent = n === 0 ? 'Ninguna seleccionada'
    : n + ' hab. · ' + (tUnit ? hkFmtDuration(n * tUnit) + ' estimado total' : 'tiempo variable');
}

function hkRecalcEst(){
  var est = document.getElementById('hk-asig-est'); if(!est) return;
  var obj = document.getElementById('hk-asig-obj');
  if(obj && obj.selectedOptions && obj.selectedOptions[0]){
    var m = obj.selectedOptions[0].getAttribute('data-min');
    if(m) est.value = m;
  }
}

async function hkGuardarAsig(){
  var plan = _hkAsigPlanObj;
  if(!plan){
    var plans = await getDB('housekeeping_plans');
    plan = plans.find(function(p){ return p.fecha===_hkPlanFecha && p.turno===_hkPlanTurno; });
  }
  if(!plan){ toast('Plan no encontrado','error'); return; }

  var empSel = document.getElementById('hk-asig-emp');
  var empId = empSel.value;
  var empNombre = empId==='__SIN_ASIGNAR__' ? 'Sin asignar'
    : (empSel.selectedOptions[0].getAttribute('data-nombre') || empSel.selectedOptions[0].textContent.split('·')[0].trim());
  var prio = (document.getElementById('hk-asig-prio')||{value:'normal'}).value;

  // ── HABITACIONES: una asignación por checkbox marcado ────────────
  if(_hkAsignarTipo === 'habitacion'){
    var cbs = document.querySelectorAll('#hk-asig-hab-grid input[type=checkbox]:checked');
    if(!cbs.length){ toast('Selecciona al menos una habitación','warn'); return; }
    var tlimp = document.getElementById('hk-asig-tlimp').value;
    var tEst  = HK_TIPO_TIEMPO[tlimp] || 0;
    var errores = 0;
    for(var i=0; i<cbs.length; i++){
      var cb = cbs[i];
      var row = {
        id: hkGenId('hkas'),
        plan_id: plan.id,
        ad_hoc: 0,
        employee_id: empId,
        employee_nombre: empNombre,
        tipo_objeto: 'habitacion',
        objeto_id: cb.getAttribute('data-room-id'),
        objeto_nombre: cb.getAttribute('data-room-nombre'),
        tipo_limpieza: tlimp,
        tiempo_estimado_min: tEst,
        prioridad: prio,
        estado: 'pendiente'
      };
      var res = await dbInsert('housekeeping_assignments', row);
      if(!res) errores++;
    }
    invalidateCache('housekeeping_assignments');
    document.getElementById('modal-hk-asignar').style.display = 'none';
    toast(errores===0 ? cbs.length+' hab. asignadas' : errores+' errores de '+cbs.length, errores===0?'ok':'warn');
    renderHKPlanificacion();
    return;
  }

  // ── ZONA / TAREA PERIÓDICA: asignación única ─────────────────────
  var objSel = document.getElementById('hk-asig-obj');
  var row = {
    id: hkGenId('hkas'),
    plan_id: plan.id,
    ad_hoc: 0,
    employee_id: empId,
    employee_nombre: empNombre,
    tipo_objeto: _hkAsignarTipo,
    objeto_id: objSel.value,
    objeto_nombre: objSel.selectedOptions[0].getAttribute('data-nombre') || objSel.selectedOptions[0].textContent,
    tiempo_estimado_min: parseInt((document.getElementById('hk-asig-est')||{value:'0'}).value)||0,
    prioridad: prio,
    estado: 'pendiente'
  };
  var res = await dbInsert('housekeeping_assignments', row);
  if(!res){ toast('Error al guardar','error'); return; }
  invalidateCache('housekeeping_assignments');
  document.getElementById('modal-hk-asignar').style.display = 'none';
  toast('Asignación creada','ok');
  renderHKPlanificacion();
}

async function hkBorrarAsig(id){
  if(!confirm('¿Eliminar esta asignación?')) return;
  await auditLog('hk_delete_asig', {id:id});
  await dbDelete('housekeeping_assignments', id);
  invalidateCache('housekeeping_assignments');
  toast('Asignación eliminada','ok');
  renderHKPlanificacion();
}

// ═══════════════════════════════════════════════════════════════════════
// ZONAS PÚBLICAS — vista de estado + ejecución ad-hoc Gobernanta
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// 🧽 ZONAS PÚBLICAS — Panel Supervisor Zona-céntrica (solo gobernanta)
// Complementa Planificación (mañana), Revisión (hoy) y Dashboard (KPI global)
// aportando la vista LONGITUDINAL por zona: histórico y rendimiento.
// Bloques:
//   1 · Radar del día (KPIs + alertas)
//   2 · Tabla estado por zona (última vez · rendimiento · incidencias)
//   3 · Modal histórico por zona (últimas 30 ejec. + mini-gráfica semanal)
//   4 · Matriz empleado × zona (últimos 30d)
// ═══════════════════════════════════════════════════════════════════════

function _hkYesterdayYMD(){
  var d = new Date(); d.setDate(d.getDate()-1);
  return toYMD(d);
}
function _hkYesterdayDow(){
  var d = new Date(); d.setDate(d.getDate()-1);
  return HK_DIAS[d.getDay()];
}
function _hkDaysAgoYMD(n){
  var d = new Date(); d.setDate(d.getDate()-n);
  return toYMD(d);
}

async function renderHKZonasPublicas(){
  var content = document.getElementById('hk-zonas-content');
  if(!content) return;
  if(!hkIsGobernanta(currentUser)){
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Sin permisos</div>';
    return;
  }
  content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Cargando panel supervisor…</div>';

  invalidateCache('housekeeping_public_areas');
  invalidateCache('housekeeping_assignments');
  invalidateCache('housekeeping_plans');
  invalidateCache('incidencias');
  invalidateCache('employees');

  var [zonas, asigs, plans, incis, emps] = await Promise.all([
    getDB('housekeeping_public_areas'),
    getDB('housekeeping_assignments'),
    getDB('housekeeping_plans'),
    getDB('incidencias'),
    getDB('employees')
  ]);

  zonas = zonas.filter(function(z){ return z.activa; });
  zonas.sort(function(a,b){ return (a.orden||0)-(b.orden||0) || (a.nombre||'').localeCompare(b.nombre||'','es'); });

  // Solo asignaciones de zonas públicas — reduce ruido y CPU
  var zAsigs = asigs.filter(function(a){ return a.tipo_objeto === 'zona_publica'; });

  var hoy = today();
  var ayer = _hkYesterdayYMD();
  var d30 = _hkDaysAgoYMD(30);
  var dow = hkTodayDow();
  var dowAyer = _hkYesterdayDow();

  var planIdsHoy = plans.filter(function(p){ return p.fecha === hoy; }).map(function(p){ return p.id; });
  var planIdsAyer = plans.filter(function(p){ return p.fecha === ayer; }).map(function(p){ return p.id; });

  // Helper para saber si una asig pertenece a fecha X
  function _asigFecha(a){
    if(a.ad_hoc) return (a.hora_inicio||a.created_at||'').slice(0,10);
    // planificada: usar fecha del plan
    var p = plans.find(function(pp){ return pp.id === a.plan_id; });
    return p ? p.fecha : (a.created_at||'').slice(0,10);
  }
  function _asigDeHoy(a){ if(a.ad_hoc) return _asigFecha(a) === hoy; return planIdsHoy.indexOf(a.plan_id) >= 0; }
  function _asigDeAyer(a){ if(a.ad_hoc) return _asigFecha(a) === ayer; return planIdsAyer.indexOf(a.plan_id) >= 0; }

  var html = '';

  // ── BLOQUE 1: RADAR DEL DÍA ────────────────────────────────
  html += _hkZP_Radar(zonas, zAsigs, incis, hoy, ayer, dow, dowAyer, _asigDeHoy, _asigDeAyer);

  // ── BLOQUE 2: TABLA ESTADO POR ZONA ────────────────────────
  html += _hkZP_TablaZonas(zonas, zAsigs, incis, dow, hoy, d30, _asigFecha, _asigDeHoy);

  // ── BLOQUE 4: MATRIZ EMPLEADO × ZONA ───────────────────────
  html += _hkZP_Matriz(zonas, zAsigs, emps, d30, _asigFecha);

  content.innerHTML = html;
}

// ── BLOQUE 1 ─────────────────────────────────────────────────
function _hkZP_Radar(zonas, zAsigs, incis, hoy, ayer, dow, dowAyer, _asigDeHoy, _asigDeAyer){
  var tocanHoy = zonas.filter(function(z){ var dm = hkParseDiasMin(z.dias_minutos); return (dm[dow]||0) > 0; });
  var hechasHoy = 0, enProcesoHoy = 0, pendientesHoy = 0;
  var sinAsignarHoy = [];
  var enCursoLargo = [];   // en curso > 60 min desde hora_inicio

  var now = new Date();
  tocanHoy.forEach(function(z){
    var asig = zAsigs.find(function(a){ return a.objeto_id === z.id && _asigDeHoy(a); });
    if(!asig){ sinAsignarHoy.push(z); return; }
    if(asig.estado === 'finalizado' || asig.estado === 'revisado'){ hechasHoy++; return; }
    if(asig.estado === 'en_proceso' || asig.estado === 'pausada'){
      enProcesoHoy++;
      if(asig.hora_inicio){
        var ini = new Date(asig.hora_inicio);
        var mins = (now - ini) / 60000;
        var pausa = parseInt(asig.total_pausa_min)||0;
        if((mins - pausa) > 60) enCursoLargo.push({z:z, a:asig, mins: Math.round(mins - pausa)});
      }
      return;
    }
    pendientesHoy++;
  });

  // Zonas que tocaban ayer y NO se hicieron
  var tocanAyer = zonas.filter(function(z){ var dm = hkParseDiasMin(z.dias_minutos); return (dm[dowAyer]||0) > 0; });
  var faltantesAyer = [];
  tocanAyer.forEach(function(z){
    var asig = zAsigs.find(function(a){ return a.objeto_id === z.id && _asigDeAyer(a) && (a.estado === 'finalizado' || a.estado === 'revisado'); });
    if(!asig) faltantesAyer.push(z);
  });

  var noTocan = zonas.length - tocanHoy.length;

  var html = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:12px;">1 · RADAR DEL DÍA</div>';

  // KPIs
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:8px;margin-bottom:14px;">';
  html += '<div class="kpi k-green"><div class="kpi-lbl">Hechas hoy</div><div class="kpi-val">'+hechasHoy+'/'+tocanHoy.length+'</div></div>';
  html += '<div class="kpi k-blue"><div class="kpi-lbl">En curso</div><div class="kpi-val">'+enProcesoHoy+'</div></div>';
  html += '<div class="kpi k-orange"><div class="kpi-lbl">Pendientes</div><div class="kpi-val">'+pendientesHoy+'</div></div>';
  html += '<div class="kpi"><div class="kpi-lbl">No tocan</div><div class="kpi-val">'+noTocan+'</div></div>';
  html += '</div>';

  // Alertas
  var alertas = [];
  if(faltantesAyer.length){
    alertas.push({icon:'⚠', color:'#ef4444', txt:faltantesAyer.length+' zona(s) que tocaban ayer NO se limpiaron: '+faltantesAyer.map(function(z){return z.nombre;}).slice(0,3).join(', ')+(faltantesAyer.length>3?'…':'')});
  }
  if(sinAsignarHoy.length){
    alertas.push({icon:'🟡', color:'#f59e0b', txt:sinAsignarHoy.length+' zona(s) tocan hoy y siguen SIN asignar: '+sinAsignarHoy.map(function(z){return z.nombre;}).slice(0,3).join(', ')+(sinAsignarHoy.length>3?'…':'')});
  }
  if(enCursoLargo.length){
    alertas.push({icon:'🔵', color:'#3b82f6', txt:enCursoLargo.length+' zona(s) en curso hace más de 1h: '+enCursoLargo.map(function(x){return x.z.nombre+' ('+x.mins+'min)';}).slice(0,3).join(', ')});
  }
  if(alertas.length === 0){
    html += '<div style="font-size:12px;color:var(--text3);padding:8px 0;">✓ Sin alertas.</div>';
  } else {
    alertas.forEach(function(al){
      html += '<div style="background:var(--bg3);border-left:3px solid '+al.color+';padding:8px 12px;border-radius:6px;margin-bottom:6px;font-size:12px;color:var(--text);">'
        + '<span style="margin-right:6px;">'+al.icon+'</span>' + al.txt + '</div>';
    });
  }

  html += '</div>';
  return html;
}

// ── BLOQUE 2 ─────────────────────────────────────────────────
function _hkZP_TablaZonas(zonas, zAsigs, incis, dow, hoy, d30, _asigFecha, _asigDeHoy){
  var html = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:12px;">2 · ESTADO POR ZONA</div>';

  html += '<div class="tbl-wrap"><table style="font-size:12px;width:100%;">';
  html += '<tr style="color:var(--text3);border-bottom:1px solid var(--border);">'
       + '<th style="text-align:left;padding:6px;">Zona</th>'
       + '<th style="text-align:left;padding:6px;">Grupo</th>'
       + '<th style="text-align:center;padding:6px;">Días × min</th>'
       + '<th style="text-align:left;padding:6px;">Última vez</th>'
       + '<th style="text-align:center;padding:6px;">Rend. 30d</th>'
       + '<th style="text-align:center;padding:6px;">Inc. 30d</th>'
       + '<th style="text-align:right;padding:6px;">Acciones</th>'
       + '</tr>';

  zonas.forEach(function(z){
    var dm = hkParseDiasMin(z.dias_minutos);
    var diasActivos = Object.keys(dm).filter(function(k){ return (dm[k]||0) > 0; }).length;
    var minEstZona = (dm[dow]||0) || z.tiempo_estimado_min || 0;

    // Última asig finalizada
    var asigsZona = zAsigs.filter(function(a){ return a.objeto_id === z.id && (a.estado === 'finalizado' || a.estado === 'revisado') && a.hora_fin; });
    asigsZona.sort(function(a,b){ return (b.hora_fin||'').localeCompare(a.hora_fin||''); });
    var ultima = asigsZona[0];
    var ultimaTxt = ultima
      ? (ultima.hora_fin||'').slice(0,10) + ' · ' + (ultima.employee_nombre||'—') + ' · ' + hkFmtDuration(ultima.tiempo_real_min||0)
      : '<span style="color:var(--text3);">Nunca</span>';

    // Rendimiento 30d = media (tiempo_real / tiempo_estimado)
    var asigs30 = zAsigs.filter(function(a){
      return a.objeto_id === z.id
        && (a.estado === 'finalizado' || a.estado === 'revisado')
        && a.tiempo_real_min > 0
        && a.tiempo_estimado_min > 0
        && (a.hora_fin||'').slice(0,10) >= d30;
    });
    var rendPct = null;
    if(asigs30.length){
      var sum = 0;
      asigs30.forEach(function(a){ sum += (a.tiempo_real_min / a.tiempo_estimado_min); });
      rendPct = Math.round((sum / asigs30.length) * 100);
    }
    var rendTxt, rendColor;
    if(rendPct === null){ rendTxt = '—'; rendColor = 'var(--text3)'; }
    else if(rendPct <= 100){ rendTxt = rendPct+'%'; rendColor = '#10b981'; }
    else if(rendPct <= 150){ rendTxt = rendPct+'%'; rendColor = '#f59e0b'; }
    else { rendTxt = rendPct+'%'; rendColor = '#ef4444'; }

    // Incidencias 30d asociadas a esta zona (vía asignaciones)
    var incIds30 = zAsigs
      .filter(function(a){ return a.objeto_id === z.id && a.incidencia_id && (a.hora_fin||a.hora_inicio||a.created_at||'').slice(0,10) >= d30; })
      .map(function(a){ return a.incidencia_id; });
    var incCount = incIds30.filter(function(id, i, arr){ return arr.indexOf(id) === i; }).length;

    // Asig activa (para saber si hay algo abrir/ejecutar hoy)
    var asigActivaHoy = zAsigs.find(function(a){
      return a.objeto_id === z.id && _asigDeHoy(a)
        && (a.estado === 'pendiente' || a.estado === 'en_proceso' || a.estado === 'pausada');
    });
    var yaHechaHoy = zAsigs.find(function(a){
      return a.objeto_id === z.id && _asigDeHoy(a) && (a.estado === 'finalizado' || a.estado === 'revisado');
    });
    var puedeLimpNow = minEstZona > 0 && !asigActivaHoy && !yaHechaHoy;

    var nombreEsc = (z.nombre||'').replace(/'/g, "\\'").replace(/"/g,'&quot;');

    var acciones = '<button class="tbtn" style="font-size:10px;" onclick="hkZonaVerHistorico(\''+z.id+'\',\''+nombreEsc+'\')">📊 Histórico</button>';
    if(puedeLimpNow){
      acciones += ' <button class="tbtn" style="font-size:10px;background:var(--orange);color:white;" onclick="hkAdHocZona(\''+z.id+'\',\''+nombreEsc+'\','+minEstZona+')">▶ Limpiar ahora</button>';
    }
    if(asigActivaHoy){
      acciones += ' <button class="tbtn" style="font-size:10px;" onclick="hkOpenExec(\''+asigActivaHoy.id+'\')">Abrir</button>';
    }

    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:8px 6px;font-weight:600;color:var(--text);">'+z.nombre+'</td>';
    html += '<td style="padding:8px 6px;color:var(--text3);">'+(z.zona_grupo||'—')+'</td>';
    html += '<td style="padding:8px 6px;text-align:center;font-family:var(--font-mono);color:var(--text2);">'+diasActivos+' × '+minEstZona+'m</td>';
    html += '<td style="padding:8px 6px;font-size:11px;">'+ultimaTxt+'</td>';
    html += '<td style="padding:8px 6px;text-align:center;font-family:var(--font-mono);font-weight:700;color:'+rendColor+';">'+rendTxt+'</td>';
    html += '<td style="padding:8px 6px;text-align:center;font-family:var(--font-mono);color:'+(incCount>0?'#ef4444':'var(--text3)')+';">'+incCount+'</td>';
    html += '<td style="padding:8px 6px;text-align:right;white-space:nowrap;">'+acciones+'</td>';
    html += '</tr>';
  });

  html += '</table></div>';
  html += '<div style="font-size:10px;color:var(--text3);margin-top:8px;">'
       + 'Rend. = media (tiempo real ÷ tiempo estimado) últimos 30d. '
       + '<span style="color:#10b981;">≤100%</span> · <span style="color:#f59e0b;">≤150%</span> · <span style="color:#ef4444;">&gt;150%</span>'
       + '</div>';
  html += '</div>';
  return html;
}

// ── BLOQUE 3 · MODAL HISTÓRICO ───────────────────────────────
async function hkZonaVerHistorico(zonaId, zonaNombre){
  var asigs = await getDB('housekeeping_assignments');
  var incis = await getDB('incidencias');
  var d30 = _hkDaysAgoYMD(90); // histórico 90d para modal

  var lista = asigs.filter(function(a){
    return a.tipo_objeto === 'zona_publica'
      && a.objeto_id === zonaId
      && (a.estado === 'finalizado' || a.estado === 'revisado')
      && a.hora_fin;
  });
  lista.sort(function(a,b){ return (b.hora_fin||'').localeCompare(a.hora_fin||''); });
  lista = lista.slice(0, 30);

  // Gráfica: tiempo real por semana (últimas 8 semanas)
  var semanas = _hkZP_UltimasSemanas(8);
  var totPorSem = semanas.map(function(){ return {sum:0, n:0}; });
  lista.forEach(function(a){
    var f = (a.hora_fin||'').slice(0,10);
    for(var i=0;i<semanas.length;i++){
      if(f >= semanas[i].ini && f <= semanas[i].fin){
        totPorSem[i].sum += (a.tiempo_real_min||0);
        totPorSem[i].n += 1;
        break;
      }
    }
  });
  var mediasSem = totPorSem.map(function(t){ return t.n ? Math.round(t.sum/t.n) : 0; });
  var maxSem = Math.max.apply(null, mediasSem.concat([1]));

  var svgW = 320, svgH = 90, barW = svgW / semanas.length;
  var svg = '<svg width="100%" viewBox="0 0 '+svgW+' '+svgH+'" style="max-width:'+svgW+'px;">';
  mediasSem.forEach(function(v, i){
    var h = v > 0 ? Math.max(2, (v / maxSem) * (svgH - 20)) : 0;
    var x = i * barW + 2;
    var y = svgH - h - 14;
    var col = v > 0 ? '#3b82f6' : '#334155';
    svg += '<rect x="'+x+'" y="'+y+'" width="'+(barW-4)+'" height="'+h+'" fill="'+col+'" rx="2"/>';
    if(v > 0) svg += '<text x="'+(x + (barW-4)/2)+'" y="'+(y - 2)+'" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="monospace">'+v+'</text>';
    svg += '<text x="'+(x + (barW-4)/2)+'" y="'+(svgH - 2)+'" text-anchor="middle" fill="#64748b" font-size="8" font-family="monospace">'+semanas[i].lbl+'</text>';
  });
  svg += '</svg>';

  // Tabla últimas 30
  var filas = lista.map(function(a){
    var delta = (a.tiempo_estimado_min && a.tiempo_real_min)
      ? Math.round((a.tiempo_real_min - a.tiempo_estimado_min))
      : null;
    var deltaTxt = delta === null ? '—'
      : (delta > 0 ? '<span style="color:#ef4444;">+'+delta+'m</span>'
                   : (delta < 0 ? '<span style="color:#10b981;">'+delta+'m</span>'
                                : '<span style="color:var(--text3);">0m</span>'));
    var incTxt = a.incidencia_id ? '<span class="badge b-red" style="font-size:10px;">Sí</span>' : '';
    return '<tr style="border-bottom:1px solid var(--border);">'
      + '<td style="padding:6px;font-family:var(--font-mono);font-size:11px;">'+(a.hora_fin||'').slice(0,10)+' '+(a.hora_fin||'').slice(11,16)+'</td>'
      + '<td style="padding:6px;font-size:12px;">'+formatDisplayValue(a.employee_nombre||'—')+'</td>'
      + '<td style="padding:6px;text-align:right;font-family:var(--font-mono);">'+hkFmtDuration(a.tiempo_real_min||0)+'</td>'
      + '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:var(--text3);">'+hkFmtDuration(a.tiempo_estimado_min||0)+'</td>'
      + '<td style="padding:6px;text-align:right;font-family:var(--font-mono);">'+deltaTxt+'</td>'
      + '<td style="padding:6px;text-align:center;">'+incTxt+'</td>'
      + '</tr>';
  }).join('');
  if(!filas){ filas = '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text3);">Sin ejecuciones en el histórico.</td></tr>'; }

  var bodyHtml = '<div style="font-size:12px;color:var(--text3);margin-bottom:10px;">Media tiempo real por semana (últimas 8):</div>'
    + svg
    + '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin:16px 0 8px;">ÚLTIMAS 30 EJECUCIONES</div>'
    + '<div class="tbl-wrap"><table style="font-size:12px;width:100%;">'
    + '<tr style="color:var(--text3);border-bottom:1px solid var(--border);">'
    + '<th style="text-align:left;padding:4px 6px;">Fecha</th>'
    + '<th style="text-align:left;padding:4px 6px;">Camarera</th>'
    + '<th style="text-align:right;padding:4px 6px;">Tiempo real</th>'
    + '<th style="text-align:right;padding:4px 6px;">Estimado</th>'
    + '<th style="text-align:right;padding:4px 6px;">Δ</th>'
    + '<th style="text-align:center;padding:4px 6px;">Inc.</th>'
    + '</tr>'
    + filas
    + '</table></div>';

  _hkZP_OpenModal('📊 Histórico · ' + zonaNombre, bodyHtml);
}

function _hkZP_UltimasSemanas(n){
  var out = [];
  var now = new Date();
  // Alinear al lunes de esta semana
  var dow = now.getDay(); // 0=dom
  var offsetLun = (dow === 0) ? 6 : (dow - 1);
  var lunes = new Date(now); lunes.setDate(now.getDate() - offsetLun); lunes.setHours(0,0,0,0);
  for(var i = n - 1; i >= 0; i--){
    var ini = new Date(lunes); ini.setDate(lunes.getDate() - i*7);
    var fin = new Date(ini);   fin.setDate(ini.getDate() + 6);
    out.push({
      ini: toYMD(ini),
      fin: toYMD(fin),
      lbl: 'S' + Math.ceil(((ini - new Date(ini.getFullYear(),0,1)) / 86400000 + new Date(ini.getFullYear(),0,1).getDay() + 1) / 7)
    });
  }
  return out;
}

function _hkZP_OpenModal(title, bodyHtml){
  var ov = document.getElementById('modal-hk-zona-hist');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-hk-zona-hist';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:none;align-items:flex-start;justify-content:center;z-index:700;padding:16px;overflow-y:auto;';
    ov.innerHTML = '<div class="modal-box" style="max-width:680px;width:100%;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:24px;">'
      + '<div id="hk-zona-hist-title" style="font-family:var(--font-mono);font-weight:700;font-size:14px;color:var(--text);margin-bottom:14px;"></div>'
      + '<div id="hk-zona-hist-body"></div>'
      + '<div style="display:flex;justify-content:flex-end;margin-top:16px;">'
      + '<button class="btn btn-secondary" onclick="document.getElementById(\'modal-hk-zona-hist\').style.display=\'none\'">Cerrar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target === ov) ov.style.display = 'none'; });
  }
  document.getElementById('hk-zona-hist-title').textContent = title;
  document.getElementById('hk-zona-hist-body').innerHTML = bodyHtml;
  ov.style.display = 'flex';
}

// ── BLOQUE 4 · MATRIZ EMPLEADO × ZONA ────────────────────────
function _hkZP_Matriz(zonas, zAsigs, emps, d30, _asigFecha){
  var empsHK = emps.filter(function(e){
    if(e.estado && e.estado !== 'Activo') return false;
    return (e.area||'').toLowerCase().match(/(hk|housekeeping|limpieza)/);
  });
  empsHK.sort(function(a,b){ return (a.nombre||'').localeCompare(b.nombre||'','es'); });

  var html = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:12px;">4 · RENDIMIENTO EMPLEADA × ZONA · últimos 30d</div>';

  if(!empsHK.length){
    html += '<div style="font-size:12px;color:var(--text3);">Sin empleadas HK activas.</div></div>';
    return html;
  }

  // Precalcular: por (empId, zonaId) → {n:count, sumReal:min, sumEst:min}
  var mapa = {};
  zAsigs.forEach(function(a){
    if(a.estado !== 'finalizado' && a.estado !== 'revisado') return;
    if(!a.tiempo_real_min || a.tiempo_real_min <= 0) return;
    var f = _asigFecha(a);
    if(f < d30) return;
    var k = a.employee_id + '|' + a.objeto_id;
    if(!mapa[k]) mapa[k] = {n:0, sumReal:0, sumEst:0};
    mapa[k].n += 1;
    mapa[k].sumReal += a.tiempo_real_min;
    mapa[k].sumEst  += (a.tiempo_estimado_min || 0);
  });

  html += '<div class="tbl-wrap" style="overflow-x:auto;"><table style="font-size:11px;width:100%;min-width:'+(200 + zonas.length * 90)+'px;">';
  // Header con nombres de zona rotados
  html += '<tr style="border-bottom:1px solid var(--border);">';
  html += '<th style="text-align:left;padding:6px;position:sticky;left:0;background:var(--bg2);z-index:2;color:var(--text3);">Empleada</th>';
  zonas.forEach(function(z){
    html += '<th style="padding:6px;color:var(--text3);text-align:center;vertical-align:bottom;height:100px;">'
         + '<div style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;">'+z.nombre+'</div>'
         + '</th>';
  });
  html += '</tr>';

  empsHK.forEach(function(e){
    html += '<tr style="border-bottom:1px solid var(--border);">';
    html += '<td style="padding:6px;font-weight:600;color:var(--text);position:sticky;left:0;background:var(--bg2);z-index:1;white-space:nowrap;">'+formatDisplayValue(e.nombre)+'</td>';
    zonas.forEach(function(z){
      var k = e.id + '|' + z.id;
      var d = mapa[k];
      if(!d){
        html += '<td style="padding:6px;text-align:center;color:var(--text3);">·</td>';
      } else {
        var med = Math.round(d.sumReal / d.n);
        var ratio = d.sumEst > 0 ? (d.sumReal / d.sumEst) : null;
        var col = ratio === null ? 'var(--text2)'
          : (ratio <= 1.0 ? '#10b981' : (ratio <= 1.5 ? '#f59e0b' : '#ef4444'));
        html += '<td style="padding:6px;text-align:center;font-family:var(--font-mono);color:'+col+';">'
             + '<div style="font-weight:700;">'+d.n+'</div>'
             + '<div style="font-size:9px;">'+med+'m</div>'
             + '</td>';
      }
    });
    html += '</tr>';
  });
  html += '</table></div>';
  html += '<div style="font-size:10px;color:var(--text3);margin-top:8px;">Cada celda: nº limpiezas · tiempo medio. Color = rendimiento medio (real÷estimado).</div>';
  html += '</div>';
  return html;
}

async function hkAdHocZona(zonaId, zonaNombre, tEst){
  if(!hkIsGobernanta(currentUser)){ toast('Sin permisos','error'); return; }
  if(!confirm('¿Iniciar limpieza ad-hoc de "'+zonaNombre+'" ahora?')) return;
  var ts = localTs();
  var row = {
    id: hkGenId('hkas'),
    plan_id: null,
    ad_hoc: 1,
    employee_id: currentUser.id,
    employee_nombre: currentUser.nombre,
    tipo_objeto: 'zona_publica',
    objeto_id: zonaId,
    objeto_nombre: zonaNombre,
    tiempo_estimado_min: tEst||15,
    estado: 'en_proceso',
    hora_inicio: ts
  };
  var res = await dbInsert('housekeeping_assignments', row);
  if(!res){ toast('Error','error'); return; }
  invalidateCache('housekeeping_assignments');
  toast('Iniciada','ok');
  renderHKZonasPublicas();
}

// ═══════════════════════════════════════════════════════════════════════
// REVISIÓN — Gobernanta revisa todo
// ═══════════════════════════════════════════════════════════════════════
async function renderHKRevision(){
  var content = document.getElementById('hk-revision-content');
  if(!content) return;
  if(!hkCanRevisar(currentUser)){
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Sin permisos</div>';
    return;
  }
  invalidateCache('housekeeping_assignments');
  invalidateCache('incidencias');
  var [asigs, plans, allIncis] = await Promise.all([
    getDB('housekeeping_assignments'),
    getDB('housekeeping_plans'),
    getDB('incidencias')
  ]);
  // Incidencias HK de hoy
  var hkIncisHoy = allIncis.filter(function(i){
    return (i.departamento||i.area||'') === 'Housekeeping'
      && (i.created_at||'').slice(0,10) === today();
  });
  var hoy = today();
  var planesHoy = plans.filter(p=>p.fecha===hoy);
  var planIds = planesHoy.map(p=>p.id);

  // Finalizadas pendientes de revisión + en proceso + requiere_correccion
  var lista = asigs.filter(function(a){
    if(a.ad_hoc){
      return (a.hora_inicio||a.created_at||'').indexOf(hoy)===0;
    }
    return planIds.indexOf(a.plan_id)>=0;
  });
  lista.sort(function(a,b){
    var o = {finalizado:0, en_proceso:1, pausada:2, pendiente:3, requiere_correccion:0.5, revisado:5};
    return (o[a.estado]||9)-(o[b.estado]||9);
  });

  var totalFin = lista.filter(a=>a.estado==='finalizado').length;
  var totalRev = lista.filter(a=>a.estado==='revisado').length;
  var totalProc = lista.filter(a=>a.estado==='en_proceso' || a.estado==='pausada').length;

  var html = '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">';
  html += `<div style="flex:1;min-width:120px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">PENDIENTES REVISIÓN</div>
    <div style="font-size:22px;font-weight:700;color:#10b981;">${totalFin}</div>
  </div>`;
  html += `<div style="flex:1;min-width:120px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">EN PROCESO</div>
    <div style="font-size:22px;font-weight:700;color:#3b82f6;">${totalProc}</div>
  </div>`;
  html += `<div style="flex:1;min-width:120px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">REVISADAS</div>
    <div style="font-size:22px;font-weight:700;color:#059669;">${totalRev}</div>
  </div>`;
  html += '</div>';

  if(!lista.length){
    html += '<div style="background:var(--bg3);border:1px dashed var(--border2);border-radius:10px;padding:24px;text-align:center;color:var(--text3);">No hay asignaciones hoy</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    lista.forEach(function(a){
      var color = HK_ESTADO_COLOR[a.estado]||'#9ca3af';
      var icon = a.tipo_objeto === 'habitacion' ? '🚪' : (a.tipo_objeto === 'zona_publica' ? '🧽' : '🔧');
      var realMin = a.tiempo_real_min ? hkFmtDuration(a.tiempo_real_min) : '';
      var estMin = a.tiempo_estimado_min ? hkFmtDuration(a.tiempo_estimado_min) : '';
      var dev = '';
      if(a.tiempo_real_min && a.tiempo_estimado_min){
        var d = a.tiempo_real_min - a.tiempo_estimado_min;
        var dColor = d>0?'#ef4444':'#10b981';
        dev = ` <span style="color:${dColor};font-family:var(--font-mono);font-size:11px;">${d>0?'+':''}${d}m</span>`;
      }
      html += `
        <div style="background:var(--bg2);border:1px solid var(--border);border-left:4px solid ${color};border-radius:8px;padding:10px;cursor:pointer;" onclick="hkOpenExec('${a.id}')">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;font-weight:600;color:var(--text);">${icon} ${a.objeto_nombre}</div>
            ${hkBadge(HK_ESTADO_LABEL[a.estado]||a.estado, color)}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">
            ${a.employee_nombre} · est. ${estMin} ${realMin?'· real '+realMin:''} ${dev}
            ${(a.re_trabajo_count||0)>0?' · 🔁 '+a.re_trabajo_count+'×':''}
            ${a.incidencia_id?'<span style="color:#ef4444;font-weight:700;"> · ⚠ incidencia</span>':''}
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  // ── Incidencias HK del día ─────────────────────────────────────────
  if(hkIncisHoy.length){
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:#ef4444;font-weight:700;letter-spacing:.1em;margin:18px 0 6px;">⚠ INCIDENCIAS HK HOY ('+hkIncisHoy.length+')</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    hkIncisHoy.forEach(function(i){
      var estadoColor = i.estado==='Cerrada'?'#10b981':i.estado==='En proceso'?'#f59e0b':'#ef4444';
      html += '<div style="background:#ef444411;border:1px solid #ef4444;border-radius:8px;padding:10px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
        + '<div style="font-size:12px;font-weight:600;color:var(--text);">' + (i.tipo_incidencia||i.categoria||'Incidencia') + '</div>'
        + '<span style="background:'+estadoColor+'22;color:'+estadoColor+';border:1px solid '+estadoColor+';padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">' + i.estado + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text2);">' + (i.descripcion||'') + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Por: ' + (i.nombre||'') + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  content.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD HK
// ═══════════════════════════════════════════════════════════════════════
async function renderHKDashboard(){
  var content = document.getElementById('hk-dash-content');
  if(!content) return;
  if(!hkCanRevisar(currentUser)){
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Sin permisos</div>';
    return;
  }
  content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Cargando…</div>';

  invalidateCache('housekeeping_assignments');
  var asigs = await getDB('housekeeping_assignments');
  var hoy = today();

  // KPIs hoy
  var hoyAs = asigs.filter(function(a){
    if(a.ad_hoc) return (a.hora_inicio||a.created_at||'').indexOf(hoy)===0;
    return (a.hora_inicio||'').indexOf(hoy)===0 || (a.created_at||'').indexOf(hoy)===0;
  });
  var finalizadas = hoyAs.filter(a=>a.estado==='finalizado' || a.estado==='revisado').length;
  var planeadas = hoyAs.length;
  var pct = planeadas? Math.round(finalizadas*100/planeadas) : 0;

  // Tiempo medio por tipo
  var porTipo = {};
  hoyAs.filter(a=>a.tiempo_real_min && a.tipo_limpieza).forEach(function(a){
    if(!porTipo[a.tipo_limpieza]) porTipo[a.tipo_limpieza] = [];
    porTipo[a.tipo_limpieza].push(a.tiempo_real_min);
  });

  // Productividad por empleado (hoy)
  var porEmp = {};
  hoyAs.filter(a=>a.tiempo_real_min).forEach(function(a){
    if(!porEmp[a.employee_id]) porEmp[a.employee_id] = {nombre:a.employee_nombre, total:0, n:0};
    porEmp[a.employee_id].total += a.tiempo_real_min;
    porEmp[a.employee_id].n += 1;
  });

  // Re-trabajo
  var rt = hoyAs.filter(a=>(a.re_trabajo_count||0)>0).length;
  var rtPct = planeadas? Math.round(rt*100/planeadas) : 0;

  // Pausas largas
  var pausasLargas = asigs.filter(function(a){
    if((a.hora_inicio||'').indexOf(hoy)!==0) return false;
    if(a.estado!=='pausada' || !a.pausa_inicio) return false;
    var diff = (Date.now() - new Date(a.pausa_inicio).getTime())/60000;
    return diff > 15;
  });

  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px;">';
  html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;">
    <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);font-weight:700;">CUMPLIMIENTO HOY</div>
    <div style="font-size:28px;font-weight:700;color:${pct>=80?'#10b981':pct>=50?'#f59e0b':'#ef4444'};">${pct}%</div>
    <div style="font-size:11px;color:var(--text3);">${finalizadas}/${planeadas}</div>
  </div>`;
  html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;">
    <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);font-weight:700;">RE-TRABAJO</div>
    <div style="font-size:28px;font-weight:700;color:${rtPct>10?'#ef4444':'#10b981'};">${rtPct}%</div>
    <div style="font-size:11px;color:var(--text3);">${rt} reabiertas</div>
  </div>`;
  html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;">
    <div style="font-size:10px;color:var(--text3);font-family:var(--font-mono);font-weight:700;">PAUSAS &gt; 15min</div>
    <div style="font-size:28px;font-weight:700;color:${pausasLargas.length?'#f59e0b':'#10b981'};">${pausasLargas.length}</div>
    <div style="font-size:11px;color:var(--text3);">alertas activas</div>
  </div>`;
  html += '</div>';

  // Pausas largas detalle
  if(pausasLargas.length){
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.1em;margin-bottom:6px;">⚠ ALERTAS — PAUSAS LARGAS</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">';
    pausasLargas.forEach(function(a){
      var min = Math.round((Date.now() - new Date(a.pausa_inicio).getTime())/60000);
      html += `<div style="background:#f59e0b22;border:1px solid #f59e0b;border-radius:8px;padding:8px 12px;font-size:12px;">
        <b>${a.employee_nombre}</b> · ${a.objeto_nombre} · pausada hace <b>${min} min</b>
      </div>`;
    });
    html += '</div>';
  }

  // Tiempo medio por tipo
  if(Object.keys(porTipo).length){
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.1em;margin-bottom:6px;">TIEMPO REAL MEDIO POR TIPO</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">';
    Object.keys(porTipo).forEach(function(t){
      var arr = porTipo[t];
      var avg = Math.round(arr.reduce((s,v)=>s+v,0)/arr.length);
      var est = HK_TIPO_TIEMPO[t]||0;
      var dev = est? (avg-est) : null;
      var devColor = dev===null?'#9ca3af':dev>0?'#ef4444':'#10b981';
      html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">
        <span><b>${HK_TIPO_LIMPIEZA_LABEL[t]||t}</b> <span style="color:var(--text3);">(${arr.length} hab.)</span></span>
        <span>real <b>${avg}min</b> ${est?' · est. '+est+'min · <span style="color:'+devColor+';">'+(dev>0?'+':'')+dev+'</span>':''}</span>
      </div>`;
    });
    html += '</div>';
  }

  // Productividad por empleado
  if(Object.keys(porEmp).length){
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.1em;margin-bottom:6px;">PRODUCTIVIDAD HOY</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    Object.keys(porEmp).forEach(function(eid){
      var e = porEmp[eid];
      html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;display:flex;justify-content:space-between;">
        <span><b>${e.nombre}</b></span>
        <span style="color:var(--text3);">${e.n} tareas · ${hkFmtDuration(e.total)}</span>
      </div>`;
    });
    html += '</div>';
  }

  content.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN — habitaciones, zonas, tareas periódicas
// ═══════════════════════════════════════════════════════════════════════
let _hkConfTab = 'hab';

async function renderHKConfig(){
  var content = document.getElementById('hk-config-content');
  if(!content) return;
  if(!hkCanConfigurar(currentUser)){
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Sin permisos</div>';
    return;
  }

  var html = '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">';
  html += `<button class="tbtn ${_hkConfTab==='hab'?'on':''}" onclick="_hkConfTab='hab';renderHKConfig()">🚪 Habitaciones</button>`;
  html += `<button class="tbtn ${_hkConfTab==='zonas'?'on':''}" onclick="_hkConfTab='zonas';renderHKConfig()">🧽 Zonas (${'71'})</button>`;
  html += `<button class="tbtn ${_hkConfTab==='periodicas'?'on':''}" onclick="_hkConfTab='periodicas';renderHKConfig()">🔧 Periódicas</button>`;
  html += `<button class="tbtn ${_hkConfTab==='tipos'?'on':''}" onclick="_hkConfTab='tipos';renderHKConfig()">⏱ Tipos limpieza</button>`;
  html += '</div>';

  if(_hkConfTab === 'hab') html += await hkRenderConfigHab();
  else if(_hkConfTab === 'zonas') html += await hkRenderConfigZonas();
  else if(_hkConfTab === 'periodicas') html += await hkRenderConfigPeriodicas();
  else if(_hkConfTab === 'tipos') html += await hkRenderConfigTipos();

  content.innerHTML = html;
}

async function hkRenderConfigHab(){
  var rooms = await getDB('housekeeping_rooms');
  rooms.sort(function(a,b){ return (a.planta||'').localeCompare(b.planta||'') || (a.numero||'').localeCompare(b.numero||''); });
  var html = '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;font-size:12px;color:var(--text2);">';
  html += '<b>'+rooms.length+' habitaciones</b> · ';
  var c = {};
  rooms.forEach(r=>{ c[r.tipo]=(c[r.tipo]||0)+1; });
  html += Object.keys(c).map(k=>k+': '+c[k]).join(' · ');
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;">';
  rooms.forEach(function(r){
    var tipoColor = {SYNCRO:'#3b82f6', PREMIUM:'#8b5cf6', PANORAMIC:'#a855f7', FLY:'#06b6d4', QUEEN:'#f59e0b'};
    var col = tipoColor[r.tipo] || '#9ca3af';
    var inactiva = !r.activa;
    html += `<div style="background:var(--bg2);border:1px solid ${col};border-radius:6px;padding:6px 8px;font-size:11px;text-align:center;${inactiva?'opacity:.4;':''}">
      <div style="font-weight:700;color:var(--text);">${r.numero}</div>
      <div style="font-size:9px;color:${col};font-family:var(--font-mono);">${r.tipo}</div>
      <div style="font-size:9px;color:var(--text3);">P${r.planta} · ${r.tiempo_salida_min}'</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

async function hkRenderConfigZonas(){
  var zonas = await getDB('housekeeping_public_areas');
  zonas.sort(function(a,b){ return (a.orden||0)-(b.orden||0); });
  var grupos = {};
  zonas.forEach(z=>{ var g=z.zona_grupo||'OTROS'; if(!grupos[g]) grupos[g]=[]; grupos[g].push(z); });

  var html = '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;">'+zonas.length+' zonas · plantilla semanal con tiempo por día</div>';
  Object.keys(grupos).forEach(function(g){
    html += `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.15em;margin:14px 0 6px;">${g} (${grupos[g].length})</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    grupos[g].forEach(function(z){
      var dm = hkParseDiasMin(z.dias_minutos);
      var dias = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM'].map(function(d){
        var v = dm[d];
        return `<span style="display:inline-block;width:32px;text-align:center;font-size:9px;font-family:var(--font-mono);padding:2px;border-radius:3px;background:${v?'#10b98122':'transparent'};color:${v?'#10b981':'#9ca3af'};border:1px solid ${v?'#10b981':'var(--border)'};">${HK_DIAS_LABEL[d]}${v?'<br>'+v:''}</span>`;
      }).join('');
      html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;${!z.activa?'opacity:.4;':''}">
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px;">${z.nombre}</div>
        <div style="display:flex;gap:2px;flex-wrap:wrap;">${dias}</div>
      </div>`;
    });
    html += '</div>';
  });
  return html;
}

async function hkRenderConfigPeriodicas(){
  var per = await getDB('housekeeping_periodic_tasks');
  var cats = {};
  per.forEach(p=>{ var c=p.categoria||'otros'; if(!cats[c]) cats[c]=[]; cats[c].push(p); });
  var labels = {
    'periodica_1_2_meses':'PERIÓDICAS CADA 1-2 MESES',
    'baja_ocupacion_semanal':'BAJA OCUPACIÓN — SEMANAL'
  };
  var html = '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;">'+per.length+' tareas periódicas</div>';
  Object.keys(cats).forEach(function(c){
    html += `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.15em;margin:14px 0 6px;">${labels[c]||c} (${cats[c].length})</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    cats[c].forEach(function(p){
      html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12px;display:flex;justify-content:space-between;${!p.activa?'opacity:.4;':''}">
        <span>${p.nombre}</span>
        <span style="color:var(--text3);font-family:var(--font-mono);font-size:11px;">${p.tiempo_referencia||'—'}</span>
      </div>`;
    });
    html += '</div>';
  });
  return html;
}

async function hkRenderConfigTipos(){
  var tipos = await getDB('housekeeping_room_clean_types');
  tipos.sort(function(a,b){ return (a.orden||0)-(b.orden||0); });
  var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  tipos.forEach(function(t){
    html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;${!t.activo?'opacity:.4;':''}">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text);">${t.nombre}</div>
        <div style="font-size:11px;color:var(--text3);">${t.descripcion||''}</div>
      </div>
      <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--orange);">${t.tiempo_min}'</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════════════
// Expose to global
// ═══════════════════════════════════════════════════════════════════════
window.renderHKScreen = renderHKScreen;
window.renderHKMiRuta = renderHKMiRuta;
window.renderHKPlanificacion = renderHKPlanificacion;
window.renderHKConfig = renderHKConfig;
window.renderHKRevision = renderHKRevision;
window.renderHKDashboard = renderHKDashboard;
window.renderHKZonasPublicas = renderHKZonasPublicas;
window.hkOpenExec = hkOpenExec;
window.hkCloseExec = hkCloseExec;
window.hkAction = hkAction;
window.hkCrearIncidencia = hkCrearIncidencia;
window.hkCreatePlan = hkCreatePlan;
window.hkAutogenPlan = hkAutogenPlan;
window.hkOpenAsignar = hkOpenAsignar;
window.hkRecalcEst = hkRecalcEst;
window.hkGuardarAsig = hkGuardarAsig;
window.hkBorrarAsig = hkBorrarAsig;
window.hkAdHocZona = hkAdHocZona;
window.hkZonaVerHistorico = hkZonaVerHistorico;
window.hkIsGobernanta = hkIsGobernanta;
window.hkIsHK = hkIsHK;
window.hkToggleInciPanel = hkToggleInciPanel;
window.hkGuardarIncidencia = hkGuardarIncidencia;
window._hkRenderZonasEnRuta = _hkRenderZonasEnRuta;
window.hkRenderHabCheckboxes = hkRenderHabCheckboxes;
window.hkSelAllHab = hkSelAllHab;
window.hkUpdateHabResumen = hkUpdateHabResumen;
