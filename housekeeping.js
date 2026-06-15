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
  if(!document.getElementById('modal-hk-exec')){
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

  var el = document.createElement('div');
  el.dataset.hkId = asig.id;
  el.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-left:4px solid ' + color + ';border-radius:8px;padding:12px;cursor:pointer;';
  el.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
    + '<div style="font-size:11px;color:' + color + ';font-weight:700;font-family:var(--font-mono);letter-spacing:.05em;">' + label + rtFlag + '</div>'
    + '<div style="font-size:11px;color:var(--text3);">' + estMin + (realMin ? ' · real ' + realMin : '') + '</div>'
    + '</div>'
    + '<div style="font-size:15px;font-weight:700;color:var(--text);">' + icon + ' ' + asig.objeto_nombre + '</div>'
    + (tipoLabel ? '<div style="font-size:12px;color:var(--text3);margin-top:2px;">' + tipoLabel + '</div>' : '')
    + empLine + motivo;
  el.addEventListener('click', function(){ hkOpenExec(asig.id); });
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
    // empleado: solo habitaciones; gobernanta: todas
    if(!isGob && a.tipo_objeto && a.tipo_objeto !== 'habitacion') return false;
    if(a.ad_hoc){
      var ts = a.hora_inicio || a.created_at || '';
      return ts.slice(0, 10) === hoy;
    }
    return planIds.indexOf(a.plan_id) >= 0;
  });

  var habCount = mias.filter(function(a){ return a.tipo_objeto === 'habitacion'; }).length;
  if(sub) sub.textContent = habCount + ' hab. · ' + hoy;

  // Quitar loader
  wrap.removeChild(loader);

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

  // Agrupar por zona_grupo, ordenar grupos alfabéticamente
  var grupos = {};
  zonas.forEach(function(z){
    var g = z.zona_grupo || 'OTROS';
    if(!grupos[g]) grupos[g] = [];
    grupos[g].push(z);
  });
  var gruposOrdenados = Object.keys(grupos).sort();

  gruposOrdenados.forEach(function(g){
    var gLabel = document.createElement('div');
    gLabel.style.cssText = 'font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.15em;margin:14px 0 6px;';
    gLabel.textContent = g;
    wrap.appendChild(gLabel);

    var gList = document.createElement('div');
    gList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    grupos[g].forEach(function(z){
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
          estadoText = 'Hecha · ' + (asigHoy.hora_fin||'').slice(11,16)
            + (isGob && asigHoy.employee_nombre ? ' · ' + asigHoy.employee_nombre : '');
        } else if(asigHoy && (asigHoy.estado === 'en_proceso' || asigHoy.estado === 'pausada')){
          icon = '🔵'; color = '#3b82f6';
          estadoText = 'En curso' + (isGob && asigHoy.employee_nombre ? ' · ' + asigHoy.employee_nombre : '');
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

      var puedeAbrir = asigHoy && (asigHoy.estado === 'en_proceso' || asigHoy.estado === 'pausada' || asigHoy.estado === 'pendiente');
      var puedeEjec  = isGob && minHoy > 0 && !(asigHoy && (asigHoy.estado === 'finalizado' || asigHoy.estado === 'revisado'));

      if(puedeAbrir){
        var btnAbrir = document.createElement('button');
        btnAbrir.className = 'tbtn';
        btnAbrir.style.fontSize = '11px';
        btnAbrir.textContent = 'Abrir';
        btnAbrir.addEventListener('click', (function(id){ return function(){ hkOpenExec(id); }; })(asigHoy.id));
        row.appendChild(btnAbrir);
      } else if(puedeEjec && !asigHoy){
        var btnLimp = document.createElement('button');
        btnLimp.className = 'tbtn';
        btnLimp.style.cssText = 'font-size:11px;background:var(--orange);color:white;';
        btnLimp.textContent = '▶ Limpiar ahora';
        btnLimp.addEventListener('click', (function(zid, znom, min){ return function(){ hkAdHocZona(zid, znom, min); }; })(z.id, z.nombre, minHoy));
        row.appendChild(btnLimp);
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

  // Botón incidencia
  if(soyDuenio || gob){
    actions.innerHTML += `<button class="tbtn" style="background:transparent;border:1px solid #ef4444;color:#ef4444;font-size:13px;padding:12px;margin-top:4px;" onclick="hkCrearIncidencia('${a.id}')">⚠ Crear incidencia</button>`;
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

async function hkCrearIncidencia(asigId){
  var asigs = await getDB('housekeeping_assignments');
  var a = asigs.find(x=>x.id===asigId);
  if(!a){ return; }
  var desc = prompt('Descripción de la incidencia en "'+a.objeto_nombre+'":');
  if(!desc || !desc.trim()){ return; }
  var inc = {
    id: hkGenId('inc'),
    fecha: today(),
    ts: localTs(),
    departamento: 'Housekeeping',
    tipo: 'HK',
    descripcion: desc.trim(),
    estado: 'Abierta',
    creado_por: currentUser.id,
    creado_nombre: currentUser.nombre,
    contexto: 'asig:'+a.id+' · '+a.objeto_nombre
  };
  // Reutilizar tabla incidencias del sistema
  await dbInsert('incidencias', inc);
  invalidateCache('incidencias');
  await dbUpdate('housekeeping_assignments', a.id, { incidencia_id: inc.id });
  invalidateCache('housekeeping_assignments');
  toast('Incidencia registrada','ok');
  hkCloseExec();
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

  // Modal de asignación
  html += `
    <div id="modal-hk-asignar" style="position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:680;padding:16px;">
      <div style="background:var(--bg2);border:2px solid var(--orange);border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">
        <div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--orange);letter-spacing:.15em;margin-bottom:6px;">NUEVA ASIGNACIÓN</div>
        <div id="hk-asig-title" style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:14px;">—</div>
        <div id="hk-asig-form"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
          <button class="tbtn" onclick="document.getElementById('modal-hk-asignar').style.display='none'">Cancelar</button>
          <button class="tbtn" style="background:var(--orange);color:white;" onclick="hkGuardarAsig()">Guardar</button>
        </div>
      </div>
    </div>
  `;

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

async function hkOpenAsignar(tipo){
  _hkAsignarTipo = tipo;
  var plans = await getDB('housekeeping_plans');
  var plan = plans.find(p=>p.fecha===_hkPlanFecha && p.turno===_hkPlanTurno);
  if(!plan){ toast('Crea primero el plan','warn'); return; }

  var [rooms, zonas, periodic, empleados] = await Promise.all([
    getDB('housekeeping_rooms'),
    getDB('housekeeping_public_areas'),
    getDB('housekeeping_periodic_tasks'),
    getDB('employees')
  ]);

  var empsHK = empleados.filter(function(e){
    if(e.estado && e.estado !== 'Activo') return false;
    return (e.area||'').toLowerCase().match(/(hk|housekeeping)/);
  });

  var titulo = tipo==='habitacion' ? 'Asignar habitación' : tipo==='zona_publica' ? 'Asignar zona pública' : 'Asignar tarea periódica';
  document.getElementById('hk-asig-title').textContent = titulo;

  var form = document.getElementById('hk-asig-form');
  var html = '';

  // Empleado
  html += '<div class="fg"><label>Empleado/a</label><select id="hk-asig-emp">';
  html += '<option value="__SIN_ASIGNAR__">— Sin asignar —</option>';
  empsHK.forEach(function(e){
    html += `<option value="${e.id}" data-nombre="${e.nombre}">${e.nombre}${e.puesto?' · '+e.puesto:''}</option>`;
  });
  html += '</select></div>';

  if(tipo === 'habitacion'){
    rooms = rooms.filter(r=>r.activa);
    rooms.sort(function(a,b){ return (a.planta||'').localeCompare(b.planta||'') || (a.numero||'').localeCompare(b.numero||''); });
    html += '<div class="fg"><label>Habitación</label><select id="hk-asig-obj">';
    rooms.forEach(function(r){
      html += `<option value="${r.id}" data-nombre="Hab. ${r.numero} (${r.tipo})" data-tipo="${r.tipo}" data-tlimpsalida="${r.tipo_limpieza_salida}" data-tsalmin="${r.tiempo_salida_min}">Hab. ${r.numero} · ${r.tipo} · P${r.planta}</option>`;
    });
    html += '</select></div>';
    html += `<div class="fg"><label>Tipo de limpieza</label><select id="hk-asig-tlimp" onchange="hkRecalcEst()">
      <option value="repaso">Repaso (15')</option>
      <option value="repaso_sabanas">Repaso + sábanas (30')</option>
      <option value="salida_syncro">Salida SYNCRO (35')</option>
      <option value="salida_premium">Salida Premium (45')</option>
      <option value="salida_fly">Salida FLY (55')</option>
      <option value="inspeccion">Inspección (1')</option>
      <option value="destripe">Destripe (variable)</option>
    </select></div>`;
  } else if(tipo === 'zona_publica'){
    zonas = zonas.filter(z=>z.activa);
    var dow = HK_DIAS[new Date(_hkPlanFecha+'T00:00:00').getDay()];
    zonas.sort(function(a,b){ return (a.orden||0) - (b.orden||0); });
    html += '<div class="fg"><label>Zona pública</label><select id="hk-asig-obj" onchange="hkRecalcEst()">';
    zonas.forEach(function(z){
      var dm = hkParseDiasMin(z.dias_minutos);
      var minHoy = dm[dow] || 0;
      var nombreShown = z.nombre + (minHoy?' · '+minHoy+'min':' · no toca hoy');
      html += `<option value="${z.id}" data-nombre="${z.nombre}" data-min="${minHoy||z.tiempo_estimado_min||15}">${nombreShown}</option>`;
    });
    html += '</select></div>';
  } else if(tipo === 'tarea_periodica'){
    periodic = periodic.filter(p=>p.activa);
    html += '<div class="fg"><label>Tarea periódica</label><select id="hk-asig-obj" onchange="hkRecalcEst()">';
    periodic.forEach(function(p){
      var t = p.tiempo_estimado_min || 60;
      html += `<option value="${p.id}" data-nombre="${p.nombre}" data-min="${t}">${p.nombre} · ${p.tiempo_referencia||t+' min'}</option>`;
    });
    html += '</select></div>';
  }

  // Tiempo estimado
  html += '<div class="fg"><label>Tiempo estimado (min)</label><input type="number" id="hk-asig-est" min="0" max="600" value="15"></div>';
  html += '<div class="fg"><label>Prioridad</label><select id="hk-asig-prio"><option value="normal">Normal</option><option value="alta">Alta</option></select></div>';

  form.innerHTML = html;
  hkRecalcEst();
  document.getElementById('modal-hk-asignar').style.display = 'flex';
}

function hkRecalcEst(){
  var est = document.getElementById('hk-asig-est'); if(!est) return;
  if(_hkAsignarTipo === 'habitacion'){
    var tlimp = document.getElementById('hk-asig-tlimp');
    if(tlimp){
      var t = HK_TIPO_TIEMPO[tlimp.value] || 15;
      est.value = t;
    }
  } else {
    var obj = document.getElementById('hk-asig-obj');
    if(obj && obj.selectedOptions && obj.selectedOptions[0]){
      var m = obj.selectedOptions[0].getAttribute('data-min');
      if(m) est.value = m;
    }
  }
}

async function hkGuardarAsig(){
  var plans = await getDB('housekeeping_plans');
  var plan = plans.find(p=>p.fecha===_hkPlanFecha && p.turno===_hkPlanTurno);
  if(!plan){ toast('Plan no encontrado','error'); return; }

  var empSel = document.getElementById('hk-asig-emp');
  var empId = empSel.value;
  var empNombre = empId==='__SIN_ASIGNAR__' ? 'Sin asignar' : (empSel.selectedOptions[0].getAttribute('data-nombre') || empSel.selectedOptions[0].textContent.split('·')[0].trim());

  var objSel = document.getElementById('hk-asig-obj');
  var objId = objSel.value;
  var objNombre = objSel.selectedOptions[0].getAttribute('data-nombre') || objSel.selectedOptions[0].textContent;

  var tEst = parseInt(document.getElementById('hk-asig-est').value)||0;
  var prio = document.getElementById('hk-asig-prio').value;

  var row = {
    id: hkGenId('hkas'),
    plan_id: plan.id,
    ad_hoc: 0,
    employee_id: empId,
    employee_nombre: empNombre,
    tipo_objeto: _hkAsignarTipo,
    objeto_id: objId,
    objeto_nombre: objNombre,
    tiempo_estimado_min: tEst,
    prioridad: prio,
    estado: 'pendiente'
  };

  if(_hkAsignarTipo === 'habitacion'){
    row.tipo_limpieza = document.getElementById('hk-asig-tlimp').value;
  }

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
async function renderHKZonasPublicas(){
  var content = document.getElementById('hk-zonas-content');
  if(!content) return;
  content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);">Cargando…</div>';

  invalidateCache('housekeeping_public_areas');
  invalidateCache('housekeeping_assignments');
  var [zonas, asigs] = await Promise.all([
    getDB('housekeeping_public_areas'),
    getDB('housekeeping_assignments')
  ]);

  var dow = hkTodayDow();
  var hoy = today();

  // Estado por zona: si tiene asignación finalizado/revisado hoy → verde
  // Si tiene asignación en proceso → azul
  // Si toca hoy y no hay asignación → amarillo
  // Si no toca hoy → gris

  zonas.sort(function(a,b){ return (a.orden||0)-(b.orden||0); });

  var html = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;font-size:11px;font-family:var(--font-mono);">';
  html += '<span>🟢 hecha hoy</span><span>🔵 en proceso</span><span>🟡 toca hoy</span><span>⚫ no toca</span>';
  html += '</div>';

  // Agrupar por zona_grupo
  var grupos = {};
  zonas.forEach(function(z){
    var g = z.zona_grupo || 'OTROS';
    if(!grupos[g]) grupos[g] = [];
    grupos[g].push(z);
  });

  Object.keys(grupos).forEach(function(g){
    html += `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.15em;margin:14px 0 6px;">${g}</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    grupos[g].forEach(function(z){
      var dm = hkParseDiasMin(z.dias_minutos);
      var minHoy = dm[dow] || 0;
      var asigHoy = asigs.find(function(a){
        if(a.tipo_objeto !== 'zona_publica') return false;
        if(a.objeto_id !== z.id) return false;
        if(a.ad_hoc){
          return (a.hora_inicio||a.created_at||'').indexOf(hoy) === 0;
        }
        // si está en plan de hoy
        return true; // simplificación: consideramos asignación reciente
      });

      var icon = '⚫', color = '#9ca3af', estadoText = 'No toca hoy';
      if(minHoy>0){
        if(asigHoy && (asigHoy.estado==='finalizado' || asigHoy.estado==='revisado')){
          icon='🟢'; color='#10b981'; estadoText = 'Hecha · '+(asigHoy.hora_fin||'').slice(11,16);
        } else if(asigHoy && (asigHoy.estado==='en_proceso' || asigHoy.estado==='pausada')){
          icon='🔵'; color='#3b82f6'; estadoText = 'En curso';
        } else {
          icon='🟡'; color='#f59e0b'; estadoText = 'Pendiente · '+minHoy+'min';
        }
      }

      var puedeEjecutar = hkIsGobernanta(currentUser) && minHoy>0 && !(asigHoy && (asigHoy.estado==='finalizado' || asigHoy.estado==='revisado'));
      var puedeAbrir = asigHoy && (asigHoy.estado==='en_proceso' || asigHoy.estado==='pausada' || asigHoy.estado==='pendiente');

      html += `
        <div style="background:var(--bg2);border:1px solid var(--border);border-left:4px solid ${color};border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px;">
          <div style="font-size:16px;">${icon}</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:var(--text);">${z.nombre}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">${estadoText}${z.tarea_grupo?' · '+z.tarea_grupo:''}</div>
          </div>
          ${puedeAbrir ? `<button class="tbtn" style="font-size:11px;" onclick="hkOpenExec('${asigHoy.id}')">Abrir</button>` : ''}
          ${puedeEjecutar && !asigHoy ? `<button class="tbtn" style="font-size:11px;background:var(--orange);color:white;" onclick="hkAdHocZona('${z.id}', '${z.nombre.replace(/'/g,"\\'")}', ${minHoy})">▶ Limpiar ahora</button>` : ''}
        </div>
      `;
    });
    html += '</div>';
  });

  content.innerHTML = html;
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
  var [asigs, plans] = await Promise.all([
    getDB('housekeeping_assignments'),
    getDB('housekeeping_plans')
  ]);
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
          </div>
        </div>
      `;
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
window.hkIsGobernanta = hkIsGobernanta;
window.hkIsHK = hkIsHK;
window._hkRenderZonasEnRuta = _hkRenderZonasEnRuta;
window.hkRenderHabCheckboxes = hkRenderHabCheckboxes;
window.hkHabChkClick = hkHabChkClick;
window.hkSelAllHab = hkSelAllHab;
window.hkUpdateHabResumen = hkUpdateHabResumen;
