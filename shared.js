// ═══════════════════════════════════════════════════════════════
// SUPABASE CONFIG — replace localStorage with Supabase REST API
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://tsfhrpdpbkciofvejrao.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3GWGNkIs6byRG1F1BIxlkg_qhiRUgBt';
// Endpoint interno de Vercel para envío de correos via Resend.
// No requiere configuración aquí — la ruta /api/send-email siempre existe en este proyecto.
const SYNCRO_EMAIL_ENDPOINT = '/api/send-email';

// HTTP helper for Supabase REST API
async function sbRequest(method, table, body=null, params='') {
  const url = SUPABASE_URL + '/rest/v1/' + table + (params ? '?' + params : '');
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': (method === 'POST' || method === 'PATCH') ? 'return=representation' : 'return=minimal'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase error:', method, table, err);
    return null;
  }
  if (method === 'DELETE') return true;
  const text = await res.text();
  if (!text || text === '' || text === 'null') return method === 'PATCH' ? true : [];
  try { return JSON.parse(text); } catch(e) { return method === 'PATCH' ? true : []; }
}

// ── ASYNC DB LAYER ──
// All operations return promises — UI must await them

async function dbGetAll(table) {
  // Try ordered by created_at; fallback to id if column missing; fallback to unordered
  let data = await sbRequest('GET', table, null, 'order=created_at.desc');
  if (data === null) data = await sbRequest('GET', table, null, 'order=id.desc');
  if (data === null) data = await sbRequest('GET', table, null, '');
  return data || [];
}

async function dbInsert(table, row) {
  return await sbRequest('POST', table, row);
}

async function dbUpdate(table, id, updates) {
  return await sbRequest('PATCH', table, updates, 'id=eq.' + id);
}

async function dbDelete(table, id) {
  return await sbRequest('DELETE', table, null, 'id=eq.' + id);
}

async function dbUpsert(table, rows) {
  // Insert array, skip conflicts
  return await sbRequest('POST', table, Array.isArray(rows)?rows:[rows],
    null);
}

// ── CACHE LAYER — keep data in memory for fast reads ──
const _cache = {};
const _cacheTs = {};
const CACHE_TTL = 30000; // 30 seconds

async function getDB(table) {
  const now = Date.now();
  if (_cache[table] && (now - (_cacheTs[table]||0)) < CACHE_TTL) {
    return _cache[table];
  }
  let data = await dbGetAll(table);
  // MERGE-BX-01 (Jul 2026): los turnos técnicos de Bitrix NO son turnos
  // operativos. Se excluyen de TODA la app (dashboard, validación, KPIs,
  // recuentos, sumas de horas y guard de 2 turnos/día):
  //   · estado 'Sin declarar'  → esqueletos BXSH_ autogenerados (legacy)
  //   · sync_status 'merged_into_manual' → ya fusionados en un turno manual
  // Trazabilidad: los registros siguen en Supabase (solo SQL).
  if (table === 'shifts' && Array.isArray(data)) {
    data = data.filter(function(s){
      return s.estado !== 'Sin declarar' && s.sync_status !== 'merged_into_manual';
    });
  }
  _cache[table] = data;
  _cacheTs[table] = now;
  return data;
}

function invalidateCache(table) {
  delete _cache[table];
  delete _cacheTs[table];
}

async function setDB(table, data) {
  // setDB is used in bulk — for Supabase we upsert all rows
  // This is called from importBackup only
  for (const row of data) {
    await sbRequest('POST', table, row,
      'on_conflict=id');
  }
  invalidateCache(table);
}


// ═══════════════════════════════════════════════════════════════════════
// SCHEMA VERSION & DEPT CONFIG
const SCHEMA_VERSION = '5.0';
const DEPTS = ['Cocina','Sala','Mantenimiento','Recepción','Administración','Economato','Limpieza'];
const DEPT_COLORS = {
  'Cocina':'#f59e0b','Sala':'#3b82f6','Mantenimiento':'#ef4444',
  'Recepción':'#8b5cf6','Administración':'#a855f7','Economato':'#06b6d4','Limpieza':'#f97316'
};
const DEPT_ICONS = {
  'Cocina':'🍳','Sala':'🍽','Mantenimiento':'🔧','Recepción':'🏨',
  'Administración':'📋','Economato':'📦','Limpieza':'🧹'
};

// Pins for role-level access
const ROLE_PINS = {'300415':'admin','0101':'chef'};

const TASK_STATES = {
  ABIERTA: 'Abierta',
  EN_PROCESO: 'En proceso',
  CERRADA: 'Cerrada',
  VALIDADA: 'Validada'
};
const INCIDENT_STATES = {
  ABIERTA: 'Abierta',
  EN_PROCESO: 'En proceso',
  CERRADA: 'Cerrada',
  VALIDADA: 'Validada'
};
const SUPERVISOR_DEPT_MAP = {
  chef: ['Cocina', 'Friegue'],
  fb: ['Sala', 'Cocina', 'Friegue', 'FnB', 'Food & Beverage'],
  jefe_recepcion: ['Recepción', 'Recepción SFERA'],
  gobernante: ['Housekeeping', 'Limpieza'],
  subgobernante: ['Housekeeping', 'Limpieza'],
  jefe_mantenimiento: ['Mantenimiento'],
  coord_recepcion_syncrolab: ['Recepción SYNCROLAB', 'SyncroLab', 'SYNCROLAB'],
  coord_entrenadores: ['Entrenadores', 'SYNCROLAB', 'SyncroLab'],
  coord_fisioterapeutas: ['Fisioterapeutas', 'Clínica', 'SYNCROLAB', 'SyncroLab'],
  adjunto_directivo: ['*'],  // acceso a todos los departamentos
  adjunto: ['*']             // alias legacy
};

// Grupos de área para el rol 'jefe': su `area` expande a los departamentos que cubre.
// Si el area no es clave aquí, cubre solo su propio nombre.
const AREA_GROUPS = {
  'F&B':             ['Sala', 'Cocina', 'Friegue', 'FnB', 'Food & Beverage'],
  'Food & Beverage': ['Sala', 'Cocina', 'Friegue', 'FnB', 'Food & Beverage'],
  'Cocina':          ['Cocina', 'Friegue'],
  'Sala':            ['Sala'],
  'Recepción':       ['Recepción', 'Recepción SFERA'],
  'Housekeeping':    ['Housekeeping', 'Limpieza'],
  'Limpieza':        ['Housekeeping', 'Limpieza'],
  'SYNCROLAB':       ['SYNCROLAB', 'SyncroLab', 'Recepción SYNCROLAB', 'Entrenadores', 'Fisioterapeutas', 'Clínica'],
  'Recepción SYNCROLAB': ['SYNCROLAB', 'SyncroLab', 'Recepción SYNCROLAB', 'Entrenadores', 'Fisioterapeutas', 'Clínica'],
  'Mantenimiento':   ['Mantenimiento'],
  'Economato':       ['Economato'],
  'Administración':  ['Administración']
};

// ── SUBROLES SYNCROLAB ────────────────────────────────────────────────
// Entrenadores y Fisioterapeutas comparten area='SYNCROLAB'. La distinción
// real está en `puesto`. Estos helpers globales resuelven el subrol por
// puesto para que menú, checklist, instrucciones y catálogos (incidencias/
// gestiones) usen la configuración correcta — NO la genérica de SYNCROLAB
// (que es la de Recepción SYNCROLAB con caja).
var _PUESTOS_ENTRENADOR = ['Entrenador(a)', 'Coordinador(a) de Entrenadores'];
var _PUESTOS_FISIO      = ['Fisioterapeuta', 'Coordinador(a) de Fisioterapeutas'];

function _esEntrenador(u){
  u = u || (typeof currentUser !== 'undefined' ? currentUser : null);
  if(!u) return false;
  if(u.rol === 'coord_entrenadores') return true;
  return _PUESTOS_ENTRENADOR.indexOf(u.puesto || '') !== -1;
}
function _esFisio(u){
  u = u || (typeof currentUser !== 'undefined' ? currentUser : null);
  if(!u) return false;
  if(u.rol === 'coord_fisioterapeutas') return true;
  return _PUESTOS_FISIO.indexOf(u.puesto || '') !== -1;
}
// Departamento efectivo para catálogos (incidencia_tipos / gestion_tipos /
// instrucciones / checklist). Devuelve 'Entrenadores' / 'Fisioterapeutas' /
// 'Recepción SYNCROLAB' aunque el area en BD sea 'SYNCROLAB'.
function _deptCatalogo(u){
  u = u || (typeof currentUser !== 'undefined' ? currentUser : null);
  if(!u) return '';
  var area = u.area || '';
  if(/syncrolab|syncro lab/i.test(area)){
    if(_esEntrenador(u)) return 'Entrenadores';
    if(_esFisio(u))      return 'Fisioterapeutas';
    return 'Recepción SYNCROLAB';
  }
  return area;
}
window._esEntrenador = _esEntrenador;
window._esFisio      = _esFisio;
window._deptCatalogo = _deptCatalogo;

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL STATE
let currentUser = null;
let currentPin  = '';
let toggleState = {};
let mermaRows   = [];
let sinMermaFlag= false;
let editingShiftId    = null;
let validatingShiftId = null;
let _validatingMermas = [];
// Variables FIO viejas eliminadas en Fase 4 (autocomplete sustituido por módulo FIO)
let _editEmpId        = null;

// ═══════════════════════════════════════════════════════════════════════
// DEPT HELPERS (called from HTML template literals above)
function deptStyle(d) {
  const c = DEPT_COLORS[d]||'#888';
  return `background:${c}22;color:${c};border:1px solid ${c};font-size:10px;`;
}
function deptIcon(d){ return DEPT_ICONS[d]||'🏢'; }
function deptBadge(d) {
  if(!d) return '<span class="badge b-gray">—</span>';
  const c = DEPT_COLORS[d];
  const icon = DEPT_ICONS[d]||'';
  if(!c) return `<span class="badge b-gray">${d}</span>`;
  return `<span class="badge" style="background:${c}22;color:${c};border:1px solid ${c};">${icon} ${d}</span>`;
}

// ═══════════════════════════════════════════════════════════════════════
// STORAGE LAYER — replace getDB/setDB with Supabase client for multi-device
// getDB: now handled by Supabase async version above
// setDB: now handled by Supabase async version above
function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

// ── DATE & FORMAT HELPERS ──
function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function localTs(){
  var d=new Date();
  var pad=function(n){return String(Math.floor(Math.abs(n))).padStart(2,'0');};
  var tz=-d.getTimezoneOffset();
  var sign=tz>=0?'+':'-';
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
    +'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())
    +sign+pad(tz/60)+':'+pad(tz%60);
}
function fmtDate(d){ if(!d) return '—'; var p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function fmtTs(ts){
  if(!ts) return '—';
  var timeStr = typeof ts === 'string' && ts.length >= 16 ? ts.slice(11,16) : '—';
  var d = new Date(ts);
  return (isNaN(d.getTime()) ? ts.slice(0,10) : d.toLocaleDateString('es-ES'))+' '+timeStr;
}
function fmtDateTs(fecha,ts){
  if(!fecha) return '—';
  if(!ts) return fmtDate(fecha);
  var d=new Date(ts);
  return fmtDate(fecha)+' '+d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
}
function fmtTiempoGestion(mins){ if(!mins||mins<=0) return '—'; var h=Math.floor(mins/60),m=mins%60; return h>0?(h+'h'+(m>0?' '+m+'min':'')):(m+'min'); }
function startOfWeek(){ var d=new Date(); d.setHours(0,0,0,0); var day=d.getDay(), diff=d.getDate()-day+(day===0?-6:1); d.setDate(diff); return toYMD(d); }
function startOfMonth(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01'; }
function isOverdue(dl){ return dl && dl < today(); }
function getDateOnly(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function toYMD(date){
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
// getMinTaskDeadline, getMaxTaskDeadline, validateTaskDeadline,
// normalizeTaskState, isTaskOpen → tareas.js
// normalizeIncidentState, isIncidentOpen → incidencias.js
function normalizeDeptName(dept){ return String(dept||'').trim().toLowerCase(); }
function isAdmin(user){ return !!user && user.rol==='admin'; }
function isAdjuntoDirectivo(user){ return !!user && (user.rol==='adjunto' || user.rol==='adjunto_directivo'); }
// Quién puede hacer cosas de admin operativo (todo salvo gestionar al usuario admin):
function canActAsAdmin(user){ return isAdmin(user) || isAdjuntoDirectivo(user); }
// Contable: solo lectura de cierres de caja + dashboard. No valida, no es jefe ni admin.
function isContable(user){ return !!user && user.rol==='contable'; }
// Quién puede gestionar usuarios con rol=admin (solo el propio admin):
function canManageAdminUsers(user){ return isAdmin(user); }
function isSupervisor(user){ return !!user && (user.rol==='jefe' || Object.prototype.hasOwnProperty.call(SUPERVISOR_DEPT_MAP,user.rol)); }
function getSupervisorDepartments(user){
  if(!user) return [];
  if(isAdmin(user)) return ['*'];
  if(user.rol==='jefe'){
    var a=user.area||'';
    return AREA_GROUPS[a] || (a?[a]:[]);
  }
  return SUPERVISOR_DEPT_MAP[user.rol] || (user.area?[user.area]:[]);
}
function canViewDepartment(user,dept){
  if(isAdmin(user)) return true;
  var d=normalizeDeptName(dept);
  if(!d) return false;
  var depts=getSupervisorDepartments(user);
  if(depts.indexOf('*')!==-1) return true;  // comodín — acceso a todos
  return depts.map(normalizeDeptName).indexOf(d)!==-1;
}
function canValidateDepartment(user,dept){
  // adjunto_directivo con area=Administración: solo lectura, no valida
  if(isAdjuntoDirectivo(user) && (user.area==='Administración')) return false;
  return isAdmin(user) || isAdjuntoDirectivo(user) || (isSupervisor(user)&&canViewDepartment(user,dept));
}
function getRecordDepartment(record,shiftMap){
  if(!record) return '[NO DATA]';
  var direct = record.area || record.departamento || record.dept_destino || record.dept_origen;
  if(direct) return direct;
  if(shiftMap && record.shift_id){
    var shift = shiftMap[record.shift_id];
    if(typeof shift === 'string') return shift || '[NO DATA]';
    if(shift && shift.area) return shift.area;
  }
  var cat = record.categoria || '';
  if(['Cocina','Sala','Recepción','Housekeeping','Limpieza','Mantenimiento','Economato','FnB','Food & Beverage','SYNCROLAB','SyncroLab'].indexOf(cat) !== -1) return cat;
  return '[NO DATA]';
}
function canEditRecord(user,record){
  if(isAdmin(user)) return true;
  var dept=getRecordDepartment(record);
  if(isSupervisor(user)) return canViewDepartment(user,dept);
  return !!user && (record.employee_id===user.id || record.responsable_id===user.id || record.usuario_id===user.id);
}
// canValidateTask, canCloseTask → tareas.js
function canValidateShift(user,shift){ return canValidateDepartment(user,getRecordDepartment(shift)); }
function canEditCashClosing(user,closing){ return isAdmin(user) || (isSupervisor(user)&&canViewDepartment(user,getRecordDepartment(closing))) || (!!user&&(closing.responsable_id===user.id||closing.usuario_id===user.id)); }
// canCloseIncident, canValidateIncident → incidencias.js
function formatDisplayValue(value){
  if(value===null || value===undefined || value==='') return '—';
  if(Array.isArray(value)) return value.length?value.map(formatDisplayValue).join(', '):'—';
  if(typeof value==='string'){
    var v=value.trim();
    if(!v || v==='null' || v==='undefined') return '—';
    try{ var parsed=JSON.parse(v); if(Array.isArray(parsed)) return formatDisplayValue(parsed); }catch(e){}
    return v;
  }
  return String(value);
}
function formatServiceOrTurn(value){ return formatDisplayValue(value); }
function formatStaffList(value){ return formatDisplayValue(value); }
function recordMatchesShift(record, shift){
  if(!record || !shift) return false;
  if(record.shift_id) return String(record.shift_id) === String(shift.id);
  if(record.fecha && shift.fecha && record.fecha !== shift.fecha) return false;
  var sameEmployee = record.employee_id && shift.employee_id && record.employee_id === shift.employee_id;
  var sameName = record.nombre && shift.nombre && record.nombre === shift.nombre;
  if(!sameEmployee && !sameName) return false;
  if(record.servicio && shift.servicio && formatServiceOrTurn(record.servicio) !== formatServiceOrTurn(shift.servicio)) return false;
  return true;
}
// advanceIncident → incidencias.js
async function auditLog(action,detail){
  const row={
    id:genId(),
    ts:localTs(),
    usuario:(currentUser&&currentUser.nombre)||'?',
    rol:(currentUser&&currentUser.rol)||'?',
    action:action,
    detail:detail
  };
  const saved=await dbInsert('audit_log',row);
  if(!saved) console.error('audit_log insert failed',row);
}

// ═══════════════════════════════════════════════════════════════════════
// MIGRATIONS — Supabase version (tables already created via SQL)
function runMigrations(){
  // In Supabase mode, tables are created via SQL script
  // This function is kept for compatibility but does nothing
  console.log('[MIGRATION] Supabase mode — tables managed via SQL');
}

// ═══════════════════════════════════════════════════════════════════════
// SEED — handled by SQL script in Supabase
async function seedEmployees(){
  // Seed is done via SQL script — this function is a no-op in Supabase mode
  return;
  
  // seed handled by SQL
}
async function pinOk(){
  const employees=await getDB('employees');
  let found=null;
  // FIX-PIN-BOSS (Jul 2026): el PIN PERSONAL siempre tiene prioridad sobre
  // los PIN de rol. El PIN de BOSS (300415) coincide con ROLE_PINS['admin'],
  // y el sistema entraba como el admin activo más reciente (Carles).
  // Orden nuevo: 1º empleado con ese PIN exacto → 2º fallback a PIN de rol.
  // BUG-PIN-01: si el PIN está duplicado entre empleados activos, bloquea.
  const _pinMatches=employees.filter(e=>e.pin===currentPin&&e.estado==='Activo');
  if(_pinMatches.length>1){
    try{ auditLog('PIN_DUPLICADO','PIN compartido por: '+_pinMatches.map(e=>e.nombre+' ('+e.id+')').join(', ')); }catch(_e){}
    const elD=document.getElementById('pin-display');
    if(elD){ elD.classList.add('error'); elD.textContent='PIN DUPLICADO'; }
    const leD=document.getElementById('login-error');
    if(leD){ leD.style.display='block'; }
    setTimeout(()=>{ currentPin=''; updPin(); if(elD) elD.classList.remove('error'); if(leD) leD.style.display='none'; },2000);
    return;
  }
  if(_pinMatches.length===1){
    found=_pinMatches[0];
  } else if(ROLE_PINS[currentPin]){
    const rol=ROLE_PINS[currentPin];
    found=employees.find(e=>e.rol===rol&&e.estado==='Activo')||{id:'SYS_'+rol,nombre:rol==='admin'?'Administrador':rol==='jefe_recepcion'?'Jefe Recepción':'Chef',rol,estado:'Activo',pin:currentPin,responsable:1,validador:1,area:rol==='jefe_recepcion'?'Recepción':'Cocina',puesto:rol};
  }
  if(!found){
    const el=document.getElementById('pin-display');
    el.classList.add('error'); el.textContent='ERROR';
    document.getElementById('login-error').style.display='block';
    setTimeout(()=>{ currentPin=''; updPin(); el.classList.remove('error'); document.getElementById('login-error').style.display='none'; },1500);
    return;
  }
  currentUser=found; currentPin=''; updPin(); startApp();
}
function autoLogoutAfterCaja(){
  // CAJA-V2 C3 · logout automático tras guardar/cerrar caja (SYNCROLAB, Sala, Recepción)
  setTimeout(function(){ if(typeof logout === 'function') logout(); }, 1200);
}
function logout(){
  currentUser=null;
  var ap=document.getElementById('app');
  if(ap) ap.style.display='none';
  var bn=document.getElementById('bottom-nav');
  if(bn) bn.style.display='none';
  var ps=document.getElementById('portal-screen');
  if(ps){ ps.style.display='flex'; ps.style.visibility=''; ps.style.pointerEvents=''; }
}
document.addEventListener('keydown',e=>{ var ls=document.getElementById('login-screen'); if(!ls||ls.style.display==='none') return; if(e.key>='0'&&e.key<='9') pinPress(e.key); if(e.key==='Backspace') pinDel(); if(e.key==='Enter') pinOk(); });

// ═══════════════════════════════════════════════════════════════════════
// APP
function fixSelectColors(){
  document.querySelectorAll('select').forEach(function(s){
    var computed=window.getComputedStyle(s);
    var bg=s.style.background||s.style.backgroundColor||computed.backgroundColor||'';
    var isLight=bg.indexOf('fff')>-1||bg.indexOf('f9fa')>-1||bg.indexOf('f3f4')>-1||bg.indexOf('f0f9')>-1;
    if(isLight){
      s.style.setProperty('background','#ffffff','important');
      s.style.setProperty('color','#111827','important');
      Array.from(s.options).forEach(function(o){
        o.style.background='#ffffff'; o.style.color='#111827';
      });
    } else {
      s.style.setProperty('background','#132540','important');
      s.style.setProperty('color','#f0f4ff','important');
      Array.from(s.options).forEach(function(o){
        o.style.background='#1a3a5c'; o.style.color='#f0f4ff';
      });
    }
  });
}
async function startApp(){
  if(typeof resetChkState === 'function') resetChkState();
  var ls2=document.getElementById('login-screen'); if(ls2) ls2.style.display='none';
  // Ensure portal is completely out of the way
  var _portal=document.getElementById('portal-screen');
  if(_portal){ _portal.style.display='none'; _portal.style.pointerEvents='none'; _portal.style.visibility='hidden'; }
  document.getElementById('app').style.display='block';
  var unTop=document.getElementById('user-name-top'); if(unTop) unTop.textContent=currentUser.nombre;
  const rl={admin:'ADMIN',adjunto:'ADJ.DIR/RRHH',adjunto_directivo:'ADJ.DIR',jefe:(currentUser.area?'JEFE · '+currentUser.area.toUpperCase():'JEFE'),chef:'CHEF',fb:'F&B',jefe_recepcion:'JEF.REC',jefe_mantenimiento:'JEF.MANT.',subgobernante:'SUBGOB.',supervisor:'SUPERV.',mantenimiento:'MANT.',empleado:currentUser.area?currentUser.area.toUpperCase():'EMPLEADO'};
  var urTop=document.getElementById('user-role-top'); if(urTop) urTop.textContent=rl[currentUser.rol]||currentUser.rol.toUpperCase();
  buildNav();
  // Show loading state
  showScreen('readme');
  // Preload employees into cache
  try { await getDB('employees'); } catch(e) { console.warn('preload error', e); }
  await populateDashEmpDropdowns();
  setTimeout(fixSelectColors, 200);
}
function getScreens(rol){
  // ── V4.2: matriz redistribuida según Excel CEO (Jun 2026) ─────────
  var area   = (currentUser && currentUser.area)   || '';
  var puesto = (currentUser && currentUser.puesto) || '';

  // ── Flags de área ────────────────────────────────────────────────
  var isSala       = area === 'Sala' || area === 'Jefe de Sala';
  var isRecepcion  = area === 'Recepción' || area === 'Recepción SFERA';
  var isCocina     = area === 'Cocina';
  var isFriegue    = area === 'Friegue';
  var isHK         = area === 'HK' || area === 'Housekeeping' || area === 'Limpieza';
  var isMant       = area === 'Mantenimiento';
  var isAdmon      = area === 'Administración';
  var isFB         = area === 'F&B' || area === 'Food & Beverage' || area === 'FnB';
  var isRecSyncrolab = /recep.*syncrolab/i.test(area);
  var isSyncrolabArea = /^syncrolab$/i.test(area) || /^syncrolab$/i.test(area.trim());
  var isEntrenadores = area === 'Entrenadores';
  var isFisio      = area === 'Fisioterapeutas' || area === 'Clínica';

  // ── Flags de rol ─────────────────────────────────────────────────
  var isAdminU = rol === 'admin';
  var isAdjDir = typeof isAdjuntoDirectivo === 'function' && isAdjuntoDirectivo(currentUser);
  var isJefe   = isAdminU || isAdjDir
                 || (typeof isSupervisor === 'function' && isSupervisor(currentUser))
                 || ['chef','fb','jefe_recepcion','supervisor','jefe',
                     'coord_recepcion_syncrolab','coord_entrenadores',
                     'coord_fisioterapeutas','gobernante',
                     'jefe_mantenimiento','subgobernante'].indexOf(rol) >= 0;

  // ── Áreas que NO generan incentivos ──────────────────────────────
  var noIncMiDpto   = isFriegue || isMant || isAdmon;
  var noIncGestion  = isCocina  || isFriegue || isMant || isAdmon;

  // ── Catálogo de pantallas ────────────────────────────────────────
  var ITEMS = {
    readme:      {id:'readme',      label:'📋 Info'},
    turno:       {id:'turno',       label:'🕐 Mi Turno'},
    gestiones:   {id:'gestiones',   label:'📌 Gestiones'},
    tareas:      {id:'tareas',      label:'🔗 Tareas'},
    incidencias: {id:'incidencias', label:'⚠ Incidencias'},
    hypoxic:     {id:'hypoxic',     label:'🫁 Hypoxic Room'},
    validacion:  {id:'validacion',  label:'🛡 Validación'},
    dashboard:   {id:'dashboard',   label:'📊 Dashboard'},
    dashHK:      {id:'hk-dash',     label:'📊 Dashboard HK'},
    maestro:     {id:'maestro',     label:'👥 Maestro'},
    export:      {id:'export',      label:'⬇ Exportar'},
    fio:         {id:'fio',         label:'⚖ FIO'},
    misfio:      {id:'mis-fio',     label:'⚖ Mis FIO'},
    merma:       {id:'merma-mod',   label:'📦 Merma'},
    ruta:        {id:'ruta-mod',    label:'🧹 Mi Ruta'},
    cajaRec:     {id:'rec-caja-op', label:'💰 Caja', action:'openRecCajaChoice'},
    cajaLab:     {id:'lab-caja-op', label:'💰 Caja', action:'openLabCajaChoice'},
    mantmod:     {id:'mant-mod',    label:'🗂 Kanban Tareas'},
    hkPlan:      {id:'hk-plan',     label:'📅 Planificación'},
    hkZonas:     {id:'hk-zonas',    label:'🧽 Zonas públicas'},
    hkConfig:    {id:'hk-config',   label:'⚙ Configuración HK'},
    hkRevision:  {id:'hk-revision', label:'🔍 Revisión HK'},
    fichaje:     {id:'fichaje',     label:'📋 Alertas Fichaje'},
    incentivos:  {id:'incentivos',  label:'💰 Incentivos'},
    miRendimiento:{id:'mi-rendimiento', label:'📈 Mi Rendimiento'},
    informes:    {id:'informes',    label:'📊 Informes'},
    checklist:   {id:'chk-mod',     label:'✅ Checklist', action:'openChkMidDay'},
    nota:        {id:'notas-mod',   label:'💬 Nota'}
  };

  // ════════════════════════════════════════════════════════════════
  // ADMIN — sin Info, sin Mi Turno; Tareas + Hypoxic; Alertas en GESTIÓN
  // ════════════════════════════════════════════════════════════════
  if(isAdminU){
    return [
      ITEMS.gestiones, ITEMS.incidencias, ITEMS.tareas, ITEMS.hypoxic,
      {sep:true,label:'MI DEPARTAMENTO'},
      ITEMS.validacion, ITEMS.dashHK,
      {id:'liquidacion-entr', label:'💳 Liquidación'},
      {sep:true,label:'MANAGER BAR',dropdown:true},
      ITEMS.fichaje, ITEMS.dashboard,
      ITEMS.maestro, ITEMS.export, ITEMS.fio, ITEMS.informes
    ];
  }

  // ════════════════════════════════════════════════════════════════
  // ADJUNTO DIRECTIVO (Angélica / RRHH) — acceso a Informes de su dept
  // ════════════════════════════════════════════════════════════════
  if(isAdjDir){
    return [
      ITEMS.turno, ITEMS.gestiones, ITEMS.incidencias, ITEMS.tareas,
      ITEMS.misfio, ITEMS.fichaje, ITEMS.nota,
      {sep:true,label:'MI DEPARTAMENTO'},
      ITEMS.validacion, ITEMS.dashHK,
      {sep:true,label:'MANAGER BAR',dropdown:true},
      ITEMS.dashboard,
      ITEMS.maestro, ITEMS.export, ITEMS.fio, ITEMS.informes
    ];
  }

  // ════════════════════════════════════════════════════════════════
  // CONTABLE — solo cierres de caja (Validación · pestaña Caja) + Dashboard
  // Entra a los cierres pero NO valida (read-only, ver validacion.js)
  // ════════════════════════════════════════════════════════════════
  if(rol === 'contable'){
    return [ ITEMS.validacion, ITEMS.dashboard ];
  }

  // ════════════════════════════════════════════════════════════════
  // EMPLEADOS Y JEFES NORMALES
  // ════════════════════════════════════════════════════════════════

  // ── MI DÍA ───────────────────────────────────────────────────────
  var miDia = [];

  if(isHK){
    // HK: Mi Ruta y Revisión (gobernanta) se anteponen a Mi Turno
    miDia.push(ITEMS.ruta);
    miDia.push(ITEMS.checklist);
    miDia.push(ITEMS.turno);
  } else {
    miDia.push(ITEMS.turno);
    if(isCocina) miDia.push(ITEMS.merma);              // Cocina: Merma en MI DÍA
    miDia.push(ITEMS.checklist);
    // Entrenadores: subrol de SYNCROLAB SIN caja (no gestionan cajas físicas)
    var _esEntr = (typeof _esEntrenador === 'function') && _esEntrenador(currentUser);
    // Caja: empleado Recepción / jefe SYNCROLAB / cualquiera de Rec.SYNCROLAB
    if(isRecepcion && !isJefe) miDia.push(ITEMS.cajaRec);
    if(!_esEntr){
      if(isRecSyncrolab) miDia.push(ITEMS.cajaLab);
      else if(isSyncrolabArea && isJefe) miDia.push(ITEMS.cajaLab);
    }
  }

  miDia.push(ITEMS.gestiones);
  miDia.push(ITEMS.tareas);
  miDia.push(ITEMS.incidencias);
  if(isRecepcion || isMant) miDia.push(ITEMS.hypoxic); // Hypoxic: Recepción + Mantenimiento (admin lo tiene en su bloque)
  miDia.push(ITEMS.nota);                              // Nota/Sugerencia: todos los empleados

  // ── MI DEPARTAMENTO ──────────────────────────────────────────────
  var miDpto = [];
  if(!isAdmon){
    if(isJefe) miDpto.push(ITEMS.validacion);           // Validación: primera para jefes
    if(isMant) miDpto.push(ITEMS.mantmod);
    miDpto.push(ITEMS.fichaje);
    miDpto.push(ITEMS.misfio);
    if(!noIncMiDpto) miDpto.push(ITEMS.miRendimiento);
  }

  // ── MANAGER BAR (solo jefe) ──────────────────────────────────────
  var gestion = [];
  if(isJefe){
    gestion.push(ITEMS.dashboard);
    gestion.push(ITEMS.maestro);   // jefe/coordinador: gestiona empleados de SU departamento
    gestion.push(ITEMS.fio);
    gestion.push(ITEMS.informes);
  }
  // C4: Config HK en Manager Bar (después de inicializar gestion)
  if(isHK && isJefe) gestion.push(ITEMS.hkConfig);

  // ── Ensamblar ────────────────────────────────────────────────────
  var out = miDia.slice();
  if(miDpto.length){
    out.push({sep:true,label:'MI DEPARTAMENTO'});
    out = out.concat(miDpto);
  }
  // ── C4: Gestión HK dropdown (Gobernante / Subgobernanta) ──
  if(isHK && isJefe){
    out.push({sep:true,label:'GESTIÓN HK',dropdown:true});
    out.push(ITEMS.hkRevision);
    out.push(ITEMS.dashHK);
    out.push(ITEMS.hkPlan);
    out.push(ITEMS.hkZonas);
  }
  if(gestion.length){
    out.push({sep:true,label:'MANAGER BAR',dropdown:true});
    out = out.concat(gestion);
  }
  return out;
}

function buildNav(){
  // Safety: ensure portal is fully hidden when app is running
  var ps=document.getElementById('portal-screen');
  if(ps){ ps.style.display='none'; ps.style.pointerEvents='none'; }
  const nav=document.getElementById('topbar-nav'); nav.innerHTML='';
  const bnav=document.getElementById('bnav-inner'); if(bnav) bnav.innerHTML='';
  const screens=getScreens(currentUser.rol);
  // Nav icons for bottom nav
  const _svg=(p)=>'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
  const ICONS={
    'readme':    _svg('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>'),
    'turno':     _svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    'tareas':    _svg('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    'validacion':_svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>'),
    'dashboard': _svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
    'maestro':   _svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    'export':    _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    'gestiones': _svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    'incidencias': _svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    'hypoxic':   _svg('<path d="M12 2a3 3 0 0 0-3 3c0 1.5 1 2.5 1 4v3a4 4 0 0 1-2 3.5L7 16a3 3 0 0 0 0 4.5 3 3 0 0 0 4 0l1-1 1 1a3 3 0 0 0 4 0 3 3 0 0 0 0-4.5l-1-.5a4 4 0 0 1-2-3.5V9c0-1.5 1-2.5 1-4a3 3 0 0 0-3-3z"/>'),
    'rec-caja-op': _svg('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 10h.01"/><path d="M2 10h20"/>')
  };
  const SHORT={'readme':'Info','turno':'Turno','tareas':'Tareas','validacion':'Valid.','dashboard':'Panel','maestro':'Equipo','export':'Export','gestiones':'Gestiones','incidencias':'Incid.','hypoxic':'Hypoxic','caja':'Caja','rec-caja':'Caja Rec.','rec-caja-op':'Caja','merma-mod':'Merma','ajustes-mod':'Aj.Caja','ruta-mod':'Ruta','rec-mod':'Recep.','mant-mod':'Kanban'};

  // Pintar sidebar (escritorio) + bottom nav (móvil) + topbar legacy oculto
  const sideb = document.getElementById('sidebar-nav');
  if(sideb) sideb.innerHTML = '';

  // ── TOPBAR V4.2: grupos planos (MI DÍA, MI DEPARTAMENTO) + GESTIÓN dropdown ──
  var currentGroup = null;
  var currentGroupItems = null;
  var currentIsDropdown = false;

  function _startGroup(label, opts){
    opts = opts || {};
    var g = document.createElement('div');
    var clsKey = label.toLowerCase().replace(/[^a-z]/g,'');
    g.className = 'nav-group nav-group-' + clsKey;

    if(opts.dropdown){
      // ── Grupo con dropdown (ej. MANAGER BAR) ──
      g.classList.add('nav-group-dropdown');
      var btn = document.createElement('button');
      btn.className = 'nav-btn-dropdown-toggle';
      btn.id = 'nav-' + clsKey + '-toggle';
      btn.innerHTML = '<span>' + label + '</span> <span class="chevron">▾</span>'
                    + '<span class="alert-dot" id="dot-' + clsKey + '-group"></span>';
      var menu = document.createElement('div');
      menu.className = 'nav-dropdown-menu';
      btn.onclick = function(ev){
        ev.stopPropagation();
        var willOpen = !btn.classList.contains('open');
        // Cerrar otros dropdowns abiertos primero
        Array.prototype.forEach.call(document.querySelectorAll('.nav-btn-dropdown-toggle.open'), function(b){
          if(b !== btn){
            b.classList.remove('open');
            var m = b.parentNode.querySelector('.nav-dropdown-menu');
            if(m) m.classList.remove('open');
          }
        });
        btn.classList.toggle('open', willOpen);
        menu.classList.toggle('open', willOpen);
      };
      g.appendChild(btn);
      g.appendChild(menu);
      nav.appendChild(g);
      currentGroup = g;
      currentGroupItems = menu;
      currentIsDropdown = true;
      return;
    }

    // ── Grupo normal: label encima + items debajo ──
    currentIsDropdown = false;
    var lbl = document.createElement('div');
    lbl.className = 'nav-group-label';
    lbl.textContent = label;
    var items = document.createElement('div');
    items.className = 'nav-group-items';
    g.appendChild(lbl);
    g.appendChild(items);
    nav.appendChild(g);
    currentGroup = g;
    currentGroupItems = items;
  }

  // Arrancar primer grupo MI DÍA
  _startGroup('MI DÍA');

  screens.forEach(s=>{
    if(s.sep){
      _startGroup(s.label, {dropdown: !!s.dropdown});
      if(sideb){
        const sep = document.createElement('div');
        sep.className = 'sidebar-group-label';
        sep.textContent = s.label;
        sideb.appendChild(sep);
      }
      return;
    }
    const isPending = !!s.pending;

    // Sidebar (escritorio)
    if(sideb){
      const a = document.createElement('button');
      a.className = 'sidebar-btn' + (isPending ? ' is-pending' : '');
      a.id = 'side-' + s.id;
      a.innerHTML = s.label + (isPending ? ' <span class="pill-pending">Pendiente</span>' : '')
                  + '<span class="alert-dot" id="dotside-'+s.id+'"></span>';
      if(isPending){
        a.onclick = function(){ toast('Módulo en desarrollo','info'); };
      } else if(s.action){
        a.onclick = function(){ if(typeof window[s.action] === 'function') window[s.action](); else toast('Función no disponible','err'); };
      } else {
        a.onclick = function(){ showScreen(s.id); };
      }
      sideb.appendChild(a);
    }

    // Topbar — dentro del grupo actual (plano o dropdown)
    const b=document.createElement('button');
    b.className='nav-btn' + (isPending ? ' is-pending' : '');
    b.id='nav-'+s.id;
    b.innerHTML=s.label+'<span class="alert-dot" id="dot-'+s.id+'"></span>';
    b.onclick=function(){
      // Si el botón está dentro de un dropdown, cerrarlo al hacer click
      var parentMenu = b.closest('.nav-dropdown-menu');
      if(parentMenu){
        parentMenu.classList.remove('open');
        var parentGroup = parentMenu.closest('.nav-group');
        var toggleBtn = parentGroup && parentGroup.querySelector('.nav-btn-dropdown-toggle');
        if(toggleBtn) toggleBtn.classList.remove('open');
      }
      if(isPending){ toast('Módulo en desarrollo','info'); return; }
      if(s.action){ if(typeof window[s.action] === 'function') window[s.action](); return; }
      showScreen(s.id);
    };
    currentGroupItems.appendChild(b);

    // Bottom nav (móvil) — plano siempre
    if(bnav){
      const bb=document.createElement('button');
      bb.className='bnav-btn' + (isPending ? ' is-pending' : '');
      bb.id='bnav-'+s.id;
      bb.innerHTML='<span class="bnav-icon">'+(ICONS[s.id]||'●')+'</span><span class="bnav-label">'+(SHORT[s.id]||s.id)+'</span><span class="bnav-dot" id="bdot-'+s.id+'"></span>';
      bb.onclick=function(){
        if(isPending){ toast('Módulo en desarrollo','info'); return; }
        if(s.action){ if(typeof window[s.action] === 'function') window[s.action](); return; }
        showScreen(s.id);
      };
      bnav.appendChild(bb);
    }
  });
  // Limpia grupos vacíos (ej. MI DÍA si admin no tiene items antes del primer sep)
  Array.prototype.forEach.call(nav.querySelectorAll('.nav-group'), function(g){
    var items = g.querySelector('.nav-group-items, .nav-dropdown-menu');
    if(!items || items.children.length === 0) g.parentNode.removeChild(g);
  });
  // Show bottom nav
  var bn=document.getElementById('bottom-nav');
  if(bn) bn.style.display='block';

  // Rellenar bloque usuario topbar (área · puesto · nombre)
  var deptEl   = document.getElementById('topbar-dept');
  var puestoEl = document.getElementById('topbar-puesto');
  var nameEl   = document.getElementById('topbar-name');
  if(deptEl)   deptEl.textContent   = currentUser && currentUser.area   ? ('🏢 ' + currentUser.area)   : '';
  if(puestoEl) puestoEl.textContent = currentUser && currentUser.puesto ? ('🎯 ' + currentUser.puesto) : '';
  if(nameEl)   nameEl.textContent   = currentUser && currentUser.nombre ? ('👤 ' + currentUser.nombre) : '';

  // Listener global (una sola vez) para cerrar dropdowns al click fuera
  if(!window._navDropdownClickInit){
    window._navDropdownClickInit = true;
    document.addEventListener('click', function(e){
      Array.prototype.forEach.call(document.querySelectorAll('.nav-btn-dropdown-toggle.open'), function(btn){
        if(btn.parentNode.contains(e.target)) return;
        btn.classList.remove('open');
        var menu = btn.parentNode.querySelector('.nav-dropdown-menu');
        if(menu) menu.classList.remove('open');
      });
    }, true);
    // ESC también cierra
    document.addEventListener('keydown', function(e){
      if(e.key !== 'Escape') return;
      Array.prototype.forEach.call(document.querySelectorAll('.nav-btn-dropdown-toggle.open'), function(btn){
        btn.classList.remove('open');
        var menu = btn.parentNode.querySelector('.nav-dropdown-menu');
        if(menu) menu.classList.remove('open');
      });
    });
  }
}
async function showScreen(id){
  // Reset topbar dept accent when leaving dashboard
  if(id !== 'dashboard') document.documentElement.style.removeProperty('--topbar-accent-color');
  // Safety: ensure portal never blocks app screens
  var _ps=document.getElementById('portal-screen');
  if(_ps && _ps.style.display!=='flex') { _ps.style.display='none'; _ps.style.pointerEvents='none'; }
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.sidebar-btn').forEach(b=>b.classList.remove('active'));
  const s=document.getElementById('screen-'+id); if(s) s.classList.add('active');
  const nb=document.getElementById('nav-'+id); if(nb) nb.classList.add('active');
  const bb=document.getElementById('bnav-'+id); if(bb) bb.classList.add('active');
  const sb=document.getElementById('side-'+id); if(sb) sb.classList.add('active');
  window.scrollTo(0,0);
  if(id==='readme' && typeof renderInfoScreen==='function'){ renderInfoScreen(); }
  if(id==='turno'){ initTurnoForm(); }
  if(id==='tareas'){ renderTareas(); }
  if(id==='validacion'){
    initValDeptFilter();
    var _startTab = (currentUser && (currentUser.rol==='coord_recepcion_syncrolab' || currentUser.rol==='contable')) ? 'caja' : 'followup';
    switchValTab(_startTab);
    if(typeof _updateContableTabLock==='function') _updateContableTabLock();
  }
  if(id==='dashboard'){
    // Show dept filter for admin/fb
    var dw=document.getElementById('dash-dept-wrapper');
    if(dw) dw.style.display=(currentUser.rol==='admin'||currentUser.rol==='fb')?'block':'none';
    renderDashboard(); renderCostTable();
  }
  if(id==='rec-caja'){ renderRecepcionCajaList(); }
  if(id==='maestro'){ renderMaestro(); }
  if(id==='gestiones'){ renderGestionesScreen(); }
  if(id==='incidencias'){ renderIncidenciasScreen(); }
  if(id==='fio'){ renderFIOScreen(); }
  if(id==='mis-fio'){ renderMisFIOScreen(); }
  if(id==='hypoxic'){ renderHypoxicScreen(); }
  if(id==='merma-mod'){ renderMermaMod(); }
  if(id==='ajustes-mod'){ renderAjustesMod(); }
  if(id==='notas-mod'){ renderNotasMod(); }
  if(id==='mant-mod'    && typeof renderMantenimientoMod==='function')  renderMantenimientoMod();
  // ── Housekeeping ──
  if(id==='ruta-mod'    && typeof renderHKMiRuta==='function')         renderHKMiRuta();
  if(id==='hk-plan'     && typeof renderHKPlanificacion==='function')  renderHKPlanificacion();
  if(id==='hk-zonas'    && typeof renderHKZonasPublicas==='function')  renderHKZonasPublicas();
  if(id==='hk-config'   && typeof renderHKConfig==='function')         renderHKConfig();
  if(id==='hk-revision' && typeof renderHKRevision==='function')       renderHKRevision();
  if(id==='hk-dash'     && typeof renderHKDashboard==='function')      renderHKDashboard();
  if(id==='fichaje'     && typeof renderFichaje==='function')          { _fichajeFilterPeriodo=''; renderFichaje(); }
  if(id==='incentivos'  && typeof renderIncentivos==='function')        renderIncentivos();
  if(id==='mi-rendimiento' && typeof renderMiRendimiento==='function')  renderMiRendimiento();
  if(id==='liquidacion-entr' && typeof renderLiquidacionEntr==='function') renderLiquidacionEntr();
  if(id==='informes'    && typeof renderInformes==='function')           renderInformes();
  updateDots();
}
async function updateDots(){
  const shifts=await getDB('shifts');
  const tareas=await getDB('tareas');
  const hasCor=shifts.some(s=>s.employee_id===currentUser.id&&s.estado==='En corrección');
  const pendT=tareas.filter(t=>t.dept_destino===currentUser.area&&isTaskOpen(t)).length;
  // Desktop dots
  const valDot=document.getElementById('dot-turno'); if(valDot) valDot.classList.toggle('show',hasCor);
  const tDot=document.getElementById('dot-tareas'); if(tDot) tDot.classList.toggle('show',pendT>0);
  // Mobile bottom nav dots
  const bvalDot=document.getElementById('bdot-turno'); if(bvalDot) bvalDot.classList.toggle('show',hasCor);
  const btDot=document.getElementById('bdot-tareas'); if(btDot) btDot.classList.toggle('show',pendT>0);
}
async function populateDashEmpDropdowns(){
  const employees=(await getDB('employees')).filter(e=>e.estado==='Activo');
  ['dash-emp','dm-emp'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    sel.innerHTML='<option value="">Todos</option>';
    employees.forEach(e=>{ const o=document.createElement('option'); o.value=e.nombre; o.textContent=e.nombre; o.style.background='#ffffff'; o.style.color='#111827'; sel.appendChild(o); });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TOGGLES (autocomplete FIO viejo eliminado en Fase 4)
function setT(name,val){
  toggleState[name]=val;
  const maps={
    followup:{si:'fu-si',no:'fu-no',na:'fu-na'},
    gestion:{si:'g-si',no:'g-no'},
    incidencia:{si:'i-si',no:'i-no'},
    reqform:{si:'rf-si',no:'rf-no'},
    reqdisc:{si:'rd-si',no:'rd-no'},
    inci_task:{si:'it-si',no:'it-no'},
    merma_task:{si:'mt-si',no:'mt-no'},
    informresp:{si:'informresp-si',no:'informresp-no'},
  };
  const ids=maps[name]; if(!ids) return;
  Object.entries(ids).forEach(([k,eid])=>{
    const el=document.getElementById(eid); if(!el) return;
    el.className='tbtn';
    if(k===val) el.classList.add(val==='si'?'t-si':val==='no'?'t-no':'t-na');
  });
  if(name==='gestion'){
    const blk=document.getElementById('block-gestion');
    if(blk) val==='si'?blk.classList.add('visible'):blk.classList.remove('visible');
    if(val==='si' && typeof poblarSelectorHabitacion==='function'){
      poblarSelectorHabitacion(document.getElementById('g-habitacion'), '');
    }
  }
  if(name==='incidencia'){
    const blk=document.getElementById('block-incidencia');
    if(blk) val==='si'?blk.classList.add('visible'):blk.classList.remove('visible');
    if(val==='si') loadStaffImplicado();
  }
}
function resetToggles(){
  toggleState={};
  ['fu-si','fu-no','fu-na','g-si','g-no','i-si','i-no','rf-si','rf-no','rd-si','rd-no','it-si','it-no','mt-si','mt-no'].forEach(id=>{ const el=document.getElementById(id); if(el) el.className='tbtn'; });
  const blkG=document.getElementById('block-gestion'); if(blkG) blkG.classList.remove('visible');
  const blkI=document.getElementById('block-incidencia'); if(blkI) blkI.classList.remove('visible');
  hideTaskGen('inci'); hideTaskGen('merma');
}
// showTaskGen, hideTaskGen → tareas.js

// ═══════════════════════════════════════════════════════════════════════
// MERMA ROWS
function addMermaRow(data={}){
  // Abre el modal con buscador de merma.js (mismo para turno y sidebar)
  sinMermaFlag=false;
  var btn=document.getElementById('sinmerma-btn');
  if(btn) btn.className='tbtn';
  if(typeof openMermaModal === 'function'){
    openMermaModal();
  } else {
    // Fallback: comportamiento legacy
    const rowId=genId(); mermaRows.push({rowId,...data}); renderMermaRows();
  }
}
function removeMermaRow(rowId){ flushMermaRows(); mermaRows=mermaRows.filter(r=>r.rowId!==rowId); renderMermaRows(); updMermaStatus(); }
function flushMermaRows(){
  mermaRows=mermaRows.map(r=>({
    rowId:r.rowId,
    producto:document.getElementById('mp-'+r.rowId)?.value.trim()||r.producto||'',
    cantidad:parseFloat(document.getElementById('mq-'+r.rowId)?.value)||r.cantidad||0,
    unidad:document.getElementById('mu-'+r.rowId)?.value||r.unidad||'uds',
    causa:document.getElementById('mc-'+r.rowId)?.value||r.causa||'',
    obs:document.getElementById('mo-'+r.rowId)?.value.trim()||r.obs||''
  }));
}
function renderMermaRows(){
  flushMermaRows();
  const c=document.getElementById('merma-container'); c.innerHTML='';
  mermaRows.forEach((row,idx)=>{
    const div=document.createElement('div'); div.className='merma-row'; div.id='mrow-'+row.rowId;
    div.innerHTML=`<div class="merma-row-hdr"><span>Merma #${idx+1}</span><button class="btn-del-row" onclick="removeMermaRow('${row.rowId}')">✕</button></div>
    <div class="grid4">
      <div class="fg sp2"><label>Producto <span class="req">*</span></label><input type="text" id="mp-${row.rowId}" value="${row.producto||''}" placeholder="ej: Salmón"></div>
      <div class="fg"><label>Cantidad <span class="req">*</span></label><input type="number" id="mq-${row.rowId}" value="${row.cantidad||''}" min="0" step="0.01" placeholder="0.00"></div>
      <div class="fg"><label>Unidad</label><select id="mu-${row.rowId}"><option value="kg" ${row.unidad==='kg'?'selected':''}>kg</option><option value="g" ${row.unidad==='g'?'selected':''}>g</option><option value="L" ${row.unidad==='L'?'selected':''}>L</option><option value="uds" ${!row.unidad||row.unidad==='uds'?'selected':''}>uds</option><option value="raciones" ${row.unidad==='raciones'?'selected':''}>raciones</option></select></div>
      <div class="fg sp2"><label>Causa <span class="req">*</span></label><select id="mc-${row.rowId}"><option value="">— Seleccionar —</option><option ${row.causa==='Caducidad'?'selected':''}>Caducidad</option><option ${row.causa==='Error de preparación'?'selected':''}>Error de preparación</option><option ${row.causa==='Accidente'?'selected':''}>Accidente</option><option ${row.causa==='Devolución sala'?'selected':''}>Devolución sala</option><option ${row.causa==='Exceso de producción'?'selected':''}>Exceso de producción</option><option ${row.causa==='Otro'?'selected':''}>Otro</option></select></div>
      <div class="fg sp2"><label>Observación</label><input type="text" id="mo-${row.rowId}" value="${row.obs||''}" placeholder="Nota opcional"></div>
    </div>`;
    c.appendChild(div);
  });
  updMermaStatus();
}
function getMermaRow(rowId){ return {rowId,producto:document.getElementById('mp-'+rowId)?.value.trim()||'',cantidad:parseFloat(document.getElementById('mq-'+rowId)?.value)||0,unidad:document.getElementById('mu-'+rowId)?.value||'uds',causa:document.getElementById('mc-'+rowId)?.value||'',obs:document.getElementById('mo-'+rowId)?.value.trim()||''}; }
function collectMerma(){ return mermaRows.map(r=>getMermaRow(r.rowId)); }
function updMermaStatus(){
  const el=document.getElementById('merma-status');
  if(sinMermaFlag){el.textContent='✓ Sin merma en este turno';el.style.color='var(--green)';return;}
  const n=mermaRows.length;
  el.textContent=n===0?'Sin líneas — añade o marca "Sin merma"':`${n} línea(s) de merma`;
  el.style.color=n===0?'var(--red)':'var(--amber)';
}
function toggleSinMerma(){
  sinMermaFlag=!sinMermaFlag;
  const btn=document.getElementById('sinmerma-btn');
  if(sinMermaFlag){mermaRows=[];renderMermaRows();btn.className='tbtn t-si';}else{btn.className='tbtn';}
  updMermaStatus();
}

// ═══════════════════════════════════════════════════════════════════════
// TURNO FORM
async function initTurnoForm(){
  var isSalaUser = currentUser && currentUser.area === 'Sala';
  setDeadlineLimits();
  editingShiftId=null;
  document.getElementById('turno-form-mode').textContent='NUEVO';
  document.getElementById('btn-save-turno').textContent='💾 Guardar Turno';
  const fechaInput = document.getElementById('t-fecha');
  // FIX-CENA-MEDIANOCHE: turnos nocturnos que cruzan medianoche usan fecha = ayer
  // Sala: Cena hasta las 2 AM · Recepción: Noche hasta las 7 AM
  var _fechaTurnoInit = today();
  var _hNowInit = (new Date()).getHours();
  var _areaNowInit = currentUser ? String(currentUser.area||'') : '';
  if((_areaNowInit === 'Sala' && _hNowInit < 2) || (_areaNowInit === 'Recepción' && _hNowInit < 7)){
    var _ayerDInit = getDateOnly(new Date()); _ayerDInit.setDate(_ayerDInit.getDate()-1);
    _fechaTurnoInit = toYMD(_ayerDInit);
  }
  fechaInput.value=_fechaTurnoInit;
  // Fecha bloqueada a la fecha operativa para TODOS salvo admin (Fix Jun 2026:
  // antes solo se bloqueaba a empleados; jefes/coords podían borrarla y
  // guardar turnos con fecha vacía).
  var _esAdminF = currentUser && currentUser.rol === 'admin';
  if(!_esAdminF && !editingShiftId){
    fechaInput.min = _fechaTurnoInit;
    fechaInput.max = _fechaTurnoInit;
    fechaInput.setAttribute('readonly','readonly');
    fechaInput.setAttribute('tabindex','-1');
    fechaInput.style.pointerEvents = 'none';
    fechaInput.style.opacity = '0.7';
    fechaInput.style.cursor = 'not-allowed';
  } else {
    fechaInput.removeAttribute('min');
    fechaInput.removeAttribute('max');
    fechaInput.removeAttribute('readonly');
    fechaInput.removeAttribute('tabindex');
    fechaInput.style.pointerEvents = '';
    fechaInput.style.opacity = '';
    fechaInput.style.cursor = '';
  }
  const employees=await getDB('employees');
  const sel=document.getElementById('t-responsable');
  sel.innerHTML='<option value="">— Seleccionar —</option>';
  // ── BUG-RESP-01 · Filtro responsable por área del usuario + dpts hermanos ──
  // Mapa: cada área puede ver responsables de su área + las hermanas.
  // F&B Manager (rol fb / puesto contiene "F&B") es visible en Cocina, Friegue y Sala.
  var RESP_AREA_MAP = {
    'Cocina':              ['Cocina','Friegue'],
    'Friegue':             ['Cocina','Friegue'],
    'Sala':                ['Sala'],
    'FnB':                 ['Sala','Cocina','Friegue','FnB','Food & Beverage'],
    'Food & Beverage':     ['Sala','Cocina','Friegue','FnB','Food & Beverage'],
    'Recepción':           ['Recepción','Recepción SFERA'],
    'Recepción SFERA':     ['Recepción','Recepción SFERA'],
    'Recepción SYNCROLAB': ['Recepción SYNCROLAB'],
    'Housekeeping':        ['Housekeeping','Limpieza'],
    'Limpieza':            ['Housekeeping','Limpieza'],
    'SYNCROLAB':           ['SYNCROLAB','SyncroLab','Entrenadores'],
    'SyncroLab':           ['SYNCROLAB','SyncroLab','Entrenadores'],
    'Entrenadores':        ['SYNCROLAB','SyncroLab','Entrenadores'],
    'Administración':      ['Administración']
  };
  var userArea = currentUser && currentUser.area;
  var allowedAreas = RESP_AREA_MAP[userArea] || (userArea ? [userArea] : []);
  function _isFnbManager(emp){
    var p = String(emp.puesto||'').toLowerCase();
    return emp.rol === 'fb' || p.indexOf('f&b') !== -1 || p.indexOf('fnb') !== -1 || p.indexOf('food') !== -1;
  }
  function _isJefeRecSyncrolab(emp){
    // Jefe de Recepción SOLO en Recepción SFERA. Excluir si su área es SYNCROLAB.
    return false; // ya filtrado vía allowedAreas, sin lógica extra
  }
  var responsables = employees.filter(function(e) {
    var r = e.responsable;
    var isResp = r === 1 || r === true || r === '1' || r === 'true';
    var isActive = e.estado === 'Activo' || e.estado === 'activo';
    if(!isResp || !isActive) return false;
    if(!userArea) return true; // admin sin area → ver todos
    if(allowedAreas.indexOf(e.area) !== -1) return true;
    // F&B Manager visible en Cocina/Friegue/Sala
    var fnbVisibleAreas = ['Cocina','Friegue','Sala','FnB','Food & Beverage'];
    if(_isFnbManager(e) && fnbVisibleAreas.indexOf(userArea) !== -1) return true;
    return false;
  });
  responsables.forEach(function(e) {
    var o = document.createElement('option');
    o.value = e.id; o.textContent = e.nombre + ' — ' + e.puesto;
    o.style.background='#ffffff'; o.style.color='#111827';
    sel.appendChild(o);
  });
  if(responsables.length === 0) {
    // Fallback: si no hay responsables válidos, ofrecer admin + supervisors activos del propio dept
    employees.filter(function(e){
      return (e.estado==='Activo'||e.estado==='activo') && (e.area===userArea || e.rol==='admin');
    }).forEach(function(e){
      var o=document.createElement('option'); o.value=e.id; o.textContent=e.nombre+' — '+(e.puesto||e.rol);
      o.style.background='#ffffff'; o.style.color='#111827';
      sel.appendChild(o);
    });
  }

  // Area-specific form config
  var salaBlock = document.getElementById('sala-fields-block');
  var sub = document.getElementById('turno-sub');
  var isRecepcionUser = currentUser && currentUser.area === 'Recepción';
  if(isRecepcionUser) {
    if(sub) sub.textContent = 'Recepción Hotel · Balcón de la Sella';
    // Hide merma
    var mermaSecRec = document.getElementById('merma-section');
    if(mermaSecRec) mermaSecRec.style.display = 'none';
    var sinMermaRec = document.getElementById('sin-merma-block');
    if(sinMermaRec) sinMermaRec.style.display = 'none';
    // Hide ALL servicio blocks
    var tservM = document.getElementById('t-servicio-multi');
    var tservC = document.getElementById('t-servicio-cocina');
    var tservS = document.getElementById('t-servicio');
    if(tservM) tservM.style.display='none';
    if(tservC) tservC.style.display='none';
    if(tservS) tservS.style.display='none';
    // Hide the servicio FG label wrapper
    var servLabel = document.querySelector('label[for="t-servicio"]');
    if(servLabel && servLabel.closest('.fg')) servLabel.closest('.fg').style.display='none';
    // Show TURNO selector
    var recTurnoDiv = document.getElementById('rec-turno-block');
    if(recTurnoDiv) { recTurnoDiv.style.display='block'; }
    // Reset turno radios + limpiar aviso de bloqueo previo
    var _oldLock = document.getElementById('rec-turno-locked-msg');
    if(_oldLock) _oldLock.remove();
    document.querySelectorAll('input[name="rec-turno"]').forEach(function(r){ r.checked=false; r.disabled=false; });
    updateRecTurnoStyle();
    // CAJA-V2 · Turno único por persona/día: si ya hizo caja hoy, fijar y bloquear
    if(typeof lockRecTurnoIfCajaToday === 'function') lockRecTurnoIfCajaToday();
    // Hide responsable selector
    var tResp = document.getElementById('t-responsable');
    if(tResp && tResp.closest('.fg')) tResp.closest('.fg').style.display='none';
    if(!editingShiftId && !toggleState.gestion) setT('gestion','no');
    if(!editingShiftId && !toggleState.incidencia) setT('incidencia','no');
  } else if(isSalaUser) {
    if(salaBlock) salaBlock.style.display = 'none'; // removed - using ajustes popup
    var mermaSecEl = document.getElementById('merma-section');
    if(mermaSecEl) mermaSecEl.style.display = 'none';
    var sinMermaEl = document.getElementById('sin-merma-block');
    if(sinMermaEl) sinMermaEl.style.display = 'none';
    // Sala: show sala multiselect, hide cocina multiselect and single select
    var tservSingleSala = document.getElementById('t-servicio');
    var tservCocinaMs = document.getElementById('t-servicio-cocina');
    if(tservSingleSala) tservSingleSala.style.display = 'none';
    if(tservCocinaMs) tservCocinaMs.style.display = 'none';
    if(sub) sub.textContent = 'Sala · Balcón de la Sella';
    // Show multiselect for Sala, hide single select
    var tservSingle = document.getElementById('t-servicio');
    var tservMulti = document.getElementById('t-servicio-multi');
    if(tservSingle) tservSingle.style.display = 'none';
    if(tservMulti){ tservMulti.style.display = 'flex'; tservMulti.style.flexWrap='wrap'; tservMulti.style.gap='4px'; }
    // Uncheck all
    var _oldSalaLock = document.getElementById('sala-serv-locked-msg');
    if(_oldSalaLock) _oldSalaLock.remove();
    document.querySelectorAll('input[name="servicio-sala"]').forEach(function(cb){ cb.checked=false; cb.disabled=false; });
  document.querySelectorAll('input[name="servicio-cocina"]').forEach(function(cb){ cb.checked=false; });
    // CAJA-V2 Sala · servicio fijado si ya hizo caja hoy
    if(typeof lockSalaServIfCajaToday === 'function') lockSalaServIfCajaToday();
    // Default gestion/incidencia to 'no' for clean start
    if(!editingShiftId && !toggleState.gestion) setT('gestion','no');
    if(!editingShiftId && !toggleState.incidencia) setT('incidencia','no');
  } else if(currentUser && /syncrolab|syncro lab|entrenador|fisio|cl[ií]nica/i.test((currentUser.area||'')+' '+(currentUser.puesto||''))) {
    // ── SYNCROLAB (Training/Clínica/Recovery/Testing) ──────────────
    if(salaBlock) salaBlock.style.display = 'none';
    if(sub) sub.textContent = 'SYNCROLAB';
    var mermaSecLab = document.getElementById('merma-section');
    if(mermaSecLab) mermaSecLab.style.display = 'none';
    var sinMermaLab = document.getElementById('sin-merma-block');
    if(sinMermaLab) sinMermaLab.style.display = 'none';
    // Ocultar todos los demás selectores
    ['t-servicio','t-servicio-cocina','t-servicio-multi','t-servicio-hk'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.style.display = 'none';
    });
    var recTurnoLab = document.getElementById('rec-turno-block');
    if(recTurnoLab) recTurnoLab.style.display = 'none';
    // Mostrar selector SYNCROLAB (Mañana/Tarde)
    var tservLab = document.getElementById('t-servicio-lab');
    if(tservLab){ tservLab.style.display = 'flex'; tservLab.style.flexWrap = 'wrap'; }
    var lblLab = document.getElementById('t-servicio-label');
    if(lblLab) lblLab.innerHTML = 'Turno <span class="req">*</span>';
    var servBlockLab = document.getElementById('servicio-fg-block');
    if(servBlockLab) servBlockLab.style.display = 'block';
    // Reset + limpiar aviso de bloqueo previo
    var _oldLabLock = document.getElementById('lab-turno-locked-msg');
    if(_oldLabLock) _oldLabLock.remove();
    document.querySelectorAll('input[name="servicio-lab"]').forEach(function(r){ r.checked=false; r.disabled=false; });
    // Mostrar responsable
    var tRespLab = document.getElementById('t-responsable');
    if(tRespLab && tRespLab.closest('.fg')) tRespLab.closest('.fg').style.display = 'block';
    // CAJA-V2 SYNCROLAB · turno fijado si ya hizo caja hoy
    if(typeof lockLabTurnoIfCajaToday === 'function') lockLabTurnoIfCajaToday();
    if(!editingShiftId && !toggleState.gestion) setT('gestion','no');
    if(!editingShiftId && !toggleState.incidencia) setT('incidencia','no');
  } else if(currentUser && (currentUser.area === 'HK' || currentUser.area === 'Housekeeping' || currentUser.area === 'Limpieza')) {
    // ── HOUSEKEEPING ────────────────────────────────────────────
    if(salaBlock) salaBlock.style.display = 'none';
    if(sub) sub.textContent = 'Housekeeping · Balcón de la Sella';
    // Ocultar merma
    var mermaSecHK = document.getElementById('merma-section');
    if(mermaSecHK) mermaSecHK.style.display = 'none';
    var sinMermaHK = document.getElementById('sin-merma-block');
    if(sinMermaHK) sinMermaHK.style.display = 'none';
    // Ocultar selects de Cocina/Sala
    var tservSingleHK = document.getElementById('t-servicio');
    var tservCocinaHK = document.getElementById('t-servicio-cocina');
    var tservSalaHK = document.getElementById('t-servicio-multi');
    var tservHK = document.getElementById('t-servicio-hk');
    if(tservSingleHK) tservSingleHK.style.display = 'none';
    if(tservCocinaHK) tservCocinaHK.style.display = 'none';
    if(tservSalaHK) tservSalaHK.style.display = 'none';
    if(tservHK) { tservHK.style.display = 'flex'; tservHK.style.flexWrap = 'wrap'; }
    // Label "Turno" en lugar de "Servicio"
    var lblHK = document.getElementById('t-servicio-label');
    if(lblHK) lblHK.innerHTML = 'Turno <span class="req">*</span>';
    // Mostrar servicio block
    var servBlockHK = document.getElementById('servicio-fg-block');
    if(servBlockHK) servBlockHK.style.display = 'block';
    // Reset radios
    document.querySelectorAll('input[name="servicio-hk"]').forEach(function(r){ r.checked = false; });
    // Mostrar responsable
    var tRespHK = document.getElementById('t-responsable');
    if(tRespHK && tRespHK.parentElement) tRespHK.parentElement.style.display = 'block';
    // Ocultar rec-turno-block
    var recTurnoHK = document.getElementById('rec-turno-block');
    if(recTurnoHK) recTurnoHK.style.display = 'none';
    if(!editingShiftId && !toggleState.gestion) setT('gestion','no');
    if(!editingShiftId && !toggleState.incidencia) setT('incidencia','no');
  } else if(currentUser && currentUser.area === 'Administración') {
    // ── ADMINISTRACIÓN — Mañana / Tarde, sin merma ──────────────
    if(salaBlock) salaBlock.style.display = 'none';
    if(sub) sub.textContent = 'Administración · SYNCROSFERA';
    // Ocultar merma
    var mermaSecAdm = document.getElementById('merma-section');
    if(mermaSecAdm) mermaSecAdm.style.display = 'none';
    var sinMermaAdm = document.getElementById('sin-merma-block');
    if(sinMermaAdm) sinMermaAdm.style.display = 'none';
    // Ocultar todos los demás selectores de servicio
    ['t-servicio','t-servicio-cocina','t-servicio-multi','t-servicio-hk','t-servicio-lab'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.style.display = 'none';
    });
    var recTurnoAdm = document.getElementById('rec-turno-block');
    if(recTurnoAdm) recTurnoAdm.style.display = 'none';
    // Mostrar selector Administración (Mañana/Tarde)
    var tservAdm = document.getElementById('t-servicio-adm');
    if(tservAdm){ tservAdm.style.display = 'flex'; tservAdm.style.flexWrap = 'wrap'; }
    var lblAdm = document.getElementById('t-servicio-label');
    if(lblAdm) lblAdm.innerHTML = 'Turno <span class="req">*</span>';
    var servBlockAdm = document.getElementById('servicio-fg-block');
    if(servBlockAdm) servBlockAdm.style.display = 'block';
    // Reset radios
    document.querySelectorAll('input[name="servicio-adm"]').forEach(function(r){ r.checked = false; });
    // Mostrar responsable
    var tRespAdm = document.getElementById('t-responsable');
    if(tRespAdm && tRespAdm.closest('.fg')) tRespAdm.closest('.fg').style.display = 'block';
    if(!editingShiftId && !toggleState.gestion) setT('gestion','no');
    if(!editingShiftId && !toggleState.incidencia) setT('incidencia','no');
  } else {
    if(salaBlock) salaBlock.style.display = 'none';
    if(sub) sub.textContent = 'Cocina · Balcón de la Sella';
    // Show single select for Cocina
    var tservSingle2 = document.getElementById('t-servicio');
    var tservMulti2 = document.getElementById('t-servicio-multi');
    if(tservSingle2) tservSingle2.style.display = 'block';
    if(tservMulti2) tservMulti2.style.display = 'none';
    var mermaSecEl2 = document.getElementById('merma-section');
    if(mermaSecEl2) mermaSecEl2.style.display = 'block';
    var sinMermaEl2 = document.getElementById('sin-merma-block');
    if(sinMermaEl2) sinMermaEl2.style.display = 'block';
    // Show servicio block for Cocina
    var servFgBlockCoc = document.getElementById('servicio-fg-block');
    if(servFgBlockCoc) servFgBlockCoc.style.display = 'block';
    // Cocina: show cocina multiselect, hide sala multiselect and single select
    var tservSingleCoc = document.getElementById('t-servicio');
    var cocinaMulti = document.getElementById('t-servicio-cocina');
    var salaMultiHide = document.getElementById('t-servicio-multi');
    if(tservSingleCoc) tservSingleCoc.style.display = 'none';
    if(cocinaMulti){ cocinaMulti.style.display='flex'; }
    if(salaMultiHide) salaMultiHide.style.display = 'none';
    // Show responsable
    var tResp2 = document.getElementById('t-responsable');
    if(tResp2 && tResp2.parentElement) tResp2.parentElement.style.display='block';
    // Hide rec-turno-block
    var recTurnoDivCoc = document.getElementById('rec-turno-block');
    if(recTurnoDivCoc) recTurnoDivCoc.style.display='none';
    // Uncheck all
    document.querySelectorAll('input[name="servicio-cocina"]').forEach(function(cb){ cb.checked=false; });
    if(!editingShiftId && !toggleState.gestion) setT('gestion','no');
    if(!editingShiftId && !toggleState.incidencia) setT('incidencia','no');
  }
  renderCorrectionsPend();
  renderMisTurnos();
  updMermaStatus();
  setTimeout(renderFollowupList, 200);
}
function clearTurnoForm(){
  clearSalaFields();
  editingShiftId=null;
  const modeEl=document.getElementById('turno-form-mode'); if(modeEl) modeEl.textContent='NUEVO';
  const saveBtn=document.getElementById('btn-save-turno'); if(saveBtn) saveBtn.textContent='💾 Guardar Turno';
  ['t-fecha','t-servicio','t-horas','t-obs','i-desc','i-accion','g-desc','g-tipo','g-reserva','i-tipo-incidencia','it-dept','it-prio','it-titulo','it-deadline','it-desc','mt-dept','mt-prio','mt-titulo','mt-deadline','mt-desc'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    if(el.tagName==='SELECT') el.value=''; else el.value=el.type==='date'?today():'';
  });
  const fechaInput = document.getElementById('t-fecha');
  // FIX-CENA-MEDIANOCHE: turnos nocturnos que cruzan medianoche usan fecha = ayer
  // Sala: Cena hasta las 2 AM · Recepción: Noche hasta las 7 AM
  var _fechaTurno = today();
  var _hNow = (new Date()).getHours();
  var _areaNow = currentUser ? String(currentUser.area||'') : '';
  if((_areaNow === 'Sala' && _hNow < 2) || (_areaNow === 'Recepción' && _hNow < 7)){
    var _ayerD = getDateOnly(new Date()); _ayerD.setDate(_ayerD.getDate()-1);
    _fechaTurno = toYMD(_ayerD);
  }
  if(fechaInput) fechaInput.value=_fechaTurno;
  // Fix Jun 2026: bloquear fecha para todos salvo admin (antes solo empleado).
  var _esAdminCF = currentUser && currentUser.rol === 'admin';
  if(fechaInput && !_esAdminCF && !editingShiftId){
    fechaInput.min = _fechaTurno;
    fechaInput.max = _fechaTurno;
    fechaInput.setAttribute('readonly','readonly');
    fechaInput.setAttribute('tabindex','-1');
    fechaInput.style.pointerEvents = 'none';
    fechaInput.style.opacity = '0.7';
    fechaInput.style.cursor = 'not-allowed';
  } else if(fechaInput) {
    fechaInput.removeAttribute('min');
    fechaInput.removeAttribute('max');
    fechaInput.removeAttribute('readonly');
    fechaInput.removeAttribute('tabindex');
    fechaInput.style.pointerEvents = '';
    fechaInput.style.opacity = '';
    fechaInput.style.cursor = '';
  }
  resetToggles(); mermaRows=[]; sinMermaFlag=false;
  document.getElementById('sinmerma-btn').className='tbtn';
  // Re-init toggles to 'no' so buttons are always in a clean state
  setT('gestion','no'); setT('incidencia','no');
  renderMermaRows(); document.getElementById('turno-alert-area').innerHTML='';
}

// ═══════════════════════════════════════════════════════════════════════
// CORRECCIONES PENDIENTES
async function renderCorrectionsPend(){
  const shifts=(await getDB('shifts')).filter(s=>s.employee_id===currentUser.id&&s.estado==='En corrección');
  const area=document.getElementById('correcciones-area');
  if(!shifts.length){area.innerHTML='';return;}
  area.innerHTML=shifts.map(s=>`<div class="correction-card">
    <div class="correction-hdr">↩ TURNO DEVUELTO — ${fmtDate(s.fecha)} · ${displayServicio(s.servicio)}</div>
    ${s.comentario_validador?`<div style="font-size:12px;color:var(--text2);background:var(--bg);padding:8px;border-radius:var(--radius);margin-bottom:8px;font-style:italic;">"${s.comentario_validador}" — ${s.validado_por}</div>`:''}
    <button class="btn btn-warn btn-sm" onclick="loadForCorrection('${s.id}')">✏ Abrir y corregir</button>
  </div>`).join('');
}
async function loadForCorrection(shiftId){
  const s=(await getDB('shifts')).find(x=>x.id===shiftId); if(!s) return;
  editingShiftId=shiftId;
  document.getElementById('turno-form-mode').textContent='CORRECCIÓN · '+fmtDate(s.fecha)+' · '+formatServiceOrTurn(s.servicio);
  document.getElementById('btn-save-turno').textContent='📤 Reenviar';
  // Fix Jun 2026: si el turno original se guardó sin fecha (bug previo),
  // autocompleta con hoy para que el empleado pueda corregir.
  document.getElementById('t-fecha').value = s.fecha || today();
  document.getElementById('t-servicio').value=s.servicio;
  var _elHoras = document.getElementById('t-horas'); if(_elHoras) _elHoras.value=s.horas;
  document.getElementById('t-responsable').value=s.responsable_id||'';
  var _elObs = document.getElementById('t-obs'); if(_elObs) _elObs.value=s.observacion||'';
  setT('incidencia',s.incidencia_declarada);
  sinMermaFlag=s.merma_declarada==='no';
  if(sinMermaFlag) document.getElementById('sinmerma-btn').className='tbtn t-si';
  const mermas=(await getDB('merma')).filter(m=>m.shift_id===shiftId);
  mermaRows=[]; mermas.forEach(m=>mermaRows.push({rowId:genId(),producto:m.producto,cantidad:m.cantidad,unidad:m.unidad||'uds',causa:m.causa,obs:m.obs||''}));
  renderMermaRows();
  const inci=(await getDB('incidencias')).find(i=>i.shift_id===shiftId);
  if(inci){ document.getElementById('i-cat').value=inci.categoria||''; document.getElementById('i-sev').value=inci.severidad||''; document.getElementById('i-desc').value=inci.descripcion||''; document.getElementById('i-accion').value=inci.accion_inmediata||''; setT('reqform',inci.requiere_formacion==='Sí'?'si':'no'); setT('reqdisc',inci.requiere_disciplina==='Sí'?'si':'no'); }
  document.getElementById('turno-form-card').scrollIntoView({behavior:'smooth'});
  toast('Turno cargado para corrección','warn');
}

// ═══════════════════════════════════════════════════════════════════════
// SAVE TURNO
// MERGE-BX-02 (Jul 2026): re-intento de asociación Bitrix → turno manual
// al guardar. Si existen registros de fichaje Bitrix pendientes
// (bitrix_time_records.sync_status='pending_manual_shift') del mismo
// empleado en fecha ±1 día, y su hora de cierre está a ≤1h del guardado
// del turno, se vuelcan las horas al turno manual recién creado.

function saveTurno(){
  // Step 1: validate the form first (reuse validation logic)
  const alertArea=document.getElementById('turno-alert-area'); alertArea.innerHTML='';
  const errs=[];
  const fecha=document.getElementById('t-fecha').value;
  var _isRecepcion = currentUser && currentUser.area === 'Recepción';
  // Date lock: employees can only register today (unless correcting)
  var _fechaOpSave = today(); var _hSave = (new Date()).getHours(); var _aSave = currentUser ? String(currentUser.area||'') : ''; if((_aSave === 'Sala' && _hSave < 2) || (_aSave === 'Recepción' && _hSave < 7)){ var _aySave = getDateOnly(new Date()); _aySave.setDate(_aySave.getDate()-1); _fechaOpSave = toYMD(_aySave); }
  if(currentUser.rol==='empleado' && !editingShiftId && fecha !== today() && fecha !== _fechaOpSave){
    alertArea.innerHTML='<div class="alert a-err">⚠ Solo puedes registrar el turno de hoy.</div>';
    return;
  }
  const servicio=getServicioValue();
  // Horas: campo eliminado — pendiente integración Bitrix24 fichaje
  const resp=_isRecepcion ? 'ok' : document.getElementById('t-responsable').value;
  if(!fecha) errs.push('Fecha obligatoria');
  // Servicio/Turno validation — Recepción uses rec-turno radio, not servicio
  if(_isRecepcion){
    if(!servicio) errs.push('Selecciona turno: Mañana, Tarde o Noche');
  } else {
    if(!servicio||servicio==='[]'||servicio==='') errs.push('Turno obligatorio');
  }
  // Responsable: only required for Sala and Cocina, NOT Recepción
  if(!_isRecepcion && !resp){
    var _isSala2 = currentUser && currentUser.area === 'Sala';
    errs.push(_isSala2 ? 'Responsable de turno obligatorio — configura responsables de Sala en Maestro' : 'Responsable obligatorio');
  }
  if(!toggleState.gestion) errs.push('Indica si queda alguna gestión pendiente');
  if(!toggleState.incidencia) errs.push('Indica si hubo incidencia operativa');
  // Merma validation — ONLY for Cocina/Friegue. Sala, Recepción y Housekeeping exentos.
  var _isSalaUser = currentUser && currentUser.area === 'Sala';
  var _isHKUser = currentUser && (currentUser.area === 'HK' || currentUser.area === 'Housekeeping' || currentUser.area === 'Limpieza');
  var _isLabUser = currentUser && /syncrolab|entrenador|fisioterapeuta/i.test(currentUser.area||'');
  // Admin/adjunto puede cerrar turnos de Cocina SIN declarar merma (datos aún por cargar).
  // El jefe NO es canActAsAdmin → sigue obligado a declarar merma (mismo rol de cierre).
  var _isAdminUser = typeof canActAsAdmin==='function' && canActAsAdmin(currentUser);
  if(!_isSalaUser && !_isRecepcion && !_isHKUser && !_isLabUser && !_isAdminUser){
    if(!sinMermaFlag&&mermaRows.length===0) errs.push('Declara merma o marca Sin merma');
    const mermaDataCheck=collectMerma();
    mermaDataCheck.forEach(function(m,i){if(!m.producto)errs.push('Merma #'+(i+1)+': producto');if(!m.cantidad||m.cantidad<=0)errs.push('Merma #'+(i+1)+': cantidad');if(!m.causa)errs.push('Merma #'+(i+1)+': causa');});
  }
  if(toggleState.gestion==='si'){
    if(!(document.getElementById('g-desc')||{}).value||!document.getElementById('g-desc').value.trim()) errs.push('Gestión pendiente: describe qué queda por resolver');
  }
  if(toggleState.incidencia==='si'){
    if(!document.getElementById('i-desc').value.trim()) errs.push('Incidencia: describe qué ocurrió');
    if(toggleState.inci_task==='si'){
      var itDl=validateTaskDeadline((document.getElementById('it-deadline')||{}).value||'');
      if(!itDl.ok) errs.push(itDl.msg);
    }
  }
  if(toggleState.merma_task==='si'){
    var mtDl=validateTaskDeadline((document.getElementById('mt-deadline')||{}).value||'');
    if(!mtDl.ok) errs.push(mtDl.msg);
  }
  if(errs.length>0){
    alertArea.innerHTML='<div class="alert a-err">⚠ '+errs.join(' · ')+'</div>';
    return;
  }
  // Step 2: for Sala open Ajustes first, for Cocina go straight to checklist
  if(currentUser && currentUser.area === 'Sala') {
    openAjustesModal();
  } else {
    chkOpen({});
  }
}


// ═══════════════════════════════════════════════════════════════════════
// _doSaveTurno — CORE: guarda el turno en Supabase + registros hijo
// Reconstruida Jul 2026 — la original se perdió por Ctrl+A overwrite.
// ═══════════════════════════════════════════════════════════════════════
async function _doSaveTurno() {
  var ts = localTs();
  var isEditing = !!editingShiftId;
  var shiftId = editingShiftId || genId();

  // ── Recoger datos del formulario ────────────────────────────────────
  var fecha    = document.getElementById('t-fecha').value || today();
  var servicio = getServicioValue();
  var isRecepcion = currentUser && currentUser.area === 'Recepción';
  var resp     = isRecepcion ? '' : (document.getElementById('t-responsable').value || '');
  var obsEl    = document.getElementById('t-obs');
  var obs      = obsEl ? obsEl.value.trim() : '';

  // Resolver nombre del responsable
  var respNombre = '';
  if (resp) {
    try {
      var emps = await getDB('employees');
      var respEmp = emps.find(function(e) { return e.id === resp; });
      if (respEmp) respNombre = respEmp.nombre || '';
    } catch (e) { /* silenciar */ }
  }

  // ── Construir registro de turno ─────────────────────────────────────
  var shift = {
    id:                   shiftId,
    employee_id:          currentUser.id,
    nombre:               currentUser.nombre,
    puesto:               currentUser.puesto || '',
    area:                 currentUser.area || '',
    fecha:                fecha,
    servicio:             servicio,
    horas:                0,
    responsable_id:       resp || null,
    responsable_nombre:   respNombre,
    follow_up:            toggleState.gestion || 'no',
    merma_declarada:      sinMermaFlag ? 'no' : (mermaRows.length > 0 ? 'si' : 'no'),
    incidencia_declarada: toggleState.incidencia || 'no',
    observacion:          obs,
    estado:               'Pendiente'
  };

  // KPI (JSON)
  if (typeof _ajustesLines !== 'undefined' && _ajustesLines && _ajustesLines.length > 0) {
    shift.ajustes_sala = JSON.stringify(_ajustesLines);
  }
  if (window._recepKpiState) {
    shift.kpi_recepcion = JSON.stringify(window._recepKpiState);
  }
  if (window._entrKpiState) {
    shift.kpi_entrenador = JSON.stringify(window._entrKpiState);
  }

  // Checklist
  if (typeof _chkSavedState !== 'undefined' && Array.isArray(_chkSavedState) && _chkSavedState.length > 0) {
    shift.checklist = JSON.stringify(_chkSavedState);
    var done = _chkSavedState.filter(Boolean).length;
    shift.checklist_pct = Math.round((done / _chkSavedState.length) * 100);
  }

  // ── Guardar turno (INSERT o UPDATE) ─────────────────────────────────
  if (isEditing) {
    var upd = {};
    for (var k in shift) { if (k !== 'id') upd[k] = shift[k]; }
    await dbUpdate('shifts', editingShiftId, upd);
  } else {
    shift.created_at = ts;
    await dbInsert('shifts', shift);
  }

  window._lastSavedShiftId = shiftId;
  invalidateCache('shifts');

  // ── Merma ───────────────────────────────────────────────────────────
  if (!sinMermaFlag && mermaRows.length > 0) {
    var mermaData = collectMerma();
    for (var mi = 0; mi < mermaData.length; mi++) {
      var mRec = mermaData[mi];
      if (!mRec.producto) continue;
      await dbInsert('merma', {
        id:          genId(),
        shift_id:    shiftId,
        employee_id: currentUser.id,
        nombre:      currentUser.nombre,
        area:        currentUser.area || '',
        fecha:       fecha,
        producto:    mRec.producto,
        cantidad:    mRec.cantidad,
        unidad:      mRec.unidad || 'uds',
        causa:       mRec.causa,
        obs:         mRec.obs || '',
        created_at:  ts
      });
    }
    invalidateCache('merma');
  }

  // ── Gestión pendiente ───────────────────────────────────────────────
  if (toggleState.gestion === 'si') {
    var gDesc = ((document.getElementById('g-desc') || {}).value || '').trim();
    var gTipo = (document.getElementById('g-tipo') || {}).value || 'Otro';
    var gPrio = (document.getElementById('g-prioridad') || {}).value || 'media';
    var gHab  = ((document.getElementById('g-habitacion') || {}).value || '').trim();
    var gRes  = ((document.getElementById('g-reserva') || {}).value || '').trim();

    await dbInsert('gestiones', {
      id:                    genId(),
      shift_id:              shiftId,
      employee_id:           currentUser.id,
      nombre:                currentUser.nombre,
      area:                  currentUser.area || '',
      departamento:          currentUser.area || '',
      fecha:                 fecha,
      tipo_gestion:          gTipo,
      descripcion:           gDesc,
      prioridad:             gPrio,
      habitacion:            gHab || null,
      num_reserva:           gRes || null,
      leido_por:             [],
      accion_tomada:         '',
      estado:                'Abierta',
      informado_responsable: 'no',
      created_at:            ts
    });
    invalidateCache('gestiones');
  }

  // ── Incidencia ──────────────────────────────────────────────────────
  if (toggleState.incidencia === 'si') {
    var inciObj = buildInciObj(shiftId, fecha, servicio, ts);
    await dbInsert('incidencias', inciObj);
    invalidateCache('incidencias');
  }

  // ── Tareas (incidencia / merma) ─────────────────────────────────────
  if (toggleState.inci_task === 'si') {
    await createTask({
      titulo:      (document.getElementById('it-titulo') || {}).value || 'Tarea de incidencia',
      dept_destino:(document.getElementById('it-dept') || {}).value || currentUser.area || '',
      dept_origen: currentUser.area || '',
      prioridad:   (document.getElementById('it-prio') || {}).value || 'media',
      deadline:    (document.getElementById('it-deadline') || {}).value || '',
      descripcion: (document.getElementById('it-desc') || {}).value || '',
      origen:      'incidencia',
      shift_id:    shiftId,
      creado_por:  currentUser.nombre
    });
    invalidateCache('tareas');
  }
  if (toggleState.merma_task === 'si') {
    await createTask({
      titulo:      (document.getElementById('mt-titulo') || {}).value || 'Tarea de merma',
      dept_destino:(document.getElementById('mt-dept') || {}).value || currentUser.area || '',
      dept_origen: currentUser.area || '',
      prioridad:   (document.getElementById('mt-prio') || {}).value || 'media',
      deadline:    (document.getElementById('mt-deadline') || {}).value || '',
      descripcion: (document.getElementById('mt-desc') || {}).value || '',
      origen:      'merma',
      shift_id:    shiftId,
      creado_por:  currentUser.nombre
    });
    invalidateCache('tareas');
  }

  // ── Ajustes de Sala (tabla individual) ──────────────────────────────
  if (typeof _ajustesLines !== 'undefined' && _ajustesLines && _ajustesLines.length > 0) {
    for (var ai = 0; ai < _ajustesLines.length; ai++) {
      var aj = _ajustesLines[ai];
      var ajImporte = parseFloat(aj.importe) || 0;
      if (typeof AJUSTE_TIPOS_NEGATIVOS !== 'undefined' && AJUSTE_TIPOS_NEGATIVOS.indexOf(aj.tipo) >= 0) {
        ajImporte = -Math.abs(ajImporte);
      }
      await dbInsert('ajustes', {
        id:          genId(),
        shift_id:    shiftId,
        employee_id: currentUser.id,
        nombre:      currentUser.nombre,
        area:        currentUser.area || '',
        fecha:       fecha,
        tipo:        aj.tipo || '',
        importe:     ajImporte,
        motivo:      aj.motivo || '',
        obs:         '',
        created_at:  ts
      });
    }
    invalidateCache('ajustes');
    _ajustesLines = [];
  }

  // ── MERGE-BX-02: Asociación Bitrix time records ─────────────────────
  try {
    var btPending = await sbRequest('GET', 'bitrix_time_records', null,
      'sync_status=eq.pending_manual_shift&employee_id=eq.' + currentUser.id);
    if (btPending && btPending.length > 0) {
      var shiftDate = new Date(fecha + 'T12:00:00');
      var matched = btPending.filter(function(bt) {
        var btDate = new Date((bt.fecha_operativa || '') + 'T12:00:00');
        return Math.abs((shiftDate - btDate) / 86400000) <= 1;
      });
      if (matched.length > 0) {
        var totalSec = 0;
        var matchedIds = [];
        matched.forEach(function(bt) {
          totalSec += parseInt(bt.duration_seconds) || 0;
          matchedIds.push(bt.id);
        });
        var btHoras = Math.round(totalSec / 36) / 100;
        await dbUpdate('shifts', shiftId, { horas: btHoras });
        for (var bi = 0; bi < matchedIds.length; bi++) {
          await dbUpdate('bitrix_time_records', matchedIds[bi], {
            sync_status: 'matched',
            shift_id:    shiftId,
            matched_at:  ts
          });
        }
        invalidateCache('bitrix_time_records');
        invalidateCache('shifts');
      }
    }
  } catch (e) {
    console.warn('[MERGE-BX-02] Bitrix association skipped:', e.message || e);
  }

  // ── Limpieza ────────────────────────────────────────────────────────
  if (typeof clearChkLocalStorage === 'function') clearChkLocalStorage();
  auditLog('TURNO_SAVE', (isEditing ? 'CORRECCIÓN ' : '') + shiftId + ' | ' + fecha + ' | ' + servicio);
  var _wasEditing = isEditing;
  clearTurnoForm();
  renderMisTurnos();
  if (typeof renderFollowupList === 'function') renderFollowupList();
  if (typeof renderCorrectionsPend === 'function') renderCorrectionsPend();
  toast(_wasEditing ? 'Turno corregido y reenviado ✓' : 'Turno guardado ✓', 'ok');
}
window._doSaveTurno = _doSaveTurno;

// ── FOLLOW-UP EXTRAS: Incidencias abiertas · Gestiones pendientes · Tareas pendientes ─
// ── Validación · incidencias: filtro por contador + estado clicable que guarda (vía openItemModal) ──
var _valInciCache = [];
var _valInciFilter = '';
var _valGestCache = [];
var _valGestFilter = '';
var _valTaskCache = [];
var _valTaskFilter = '';
var _valShiftMap  = {};  // shiftMap compartido para resolver dept de incidencias
function valInciRenderTable(){
  var inciEl=document.getElementById('val-incidencias-table');
  if(!inciEl) return;
  var f=_valInciFilter;
  var list=(_valInciCache||[]).filter(function(i){
    var s=(i.estado||'').toLowerCase();
    if(f==='abierta')    return s==='abierta'||s==='abierto';
    if(f==='en proceso') return s==='en proceso';
    if(f==='cerrada')    return s==='cerrada'||s==='cerrado';
    return s!=='cerrada'&&s!=='cerrado';   // Total / sin filtro → no cerradas (vista por defecto)
  });
  if(!list.length){
    inciEl.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin incidencias en este filtro</div></div>';
    return;
  }
  var h='<table><tr><th>Fecha</th><th>Empleado</th><th>Dept.</th><th>Descripción</th><th>Estado</th></tr>';
  list.forEach(function(i){
    var badge = '<span data-itemtype="incidencia" data-itemid="'+i.id+'" '
      +'style="cursor:pointer;" title="Clic para ver / gestionar" class="badge estado-clickable '
      +(((i.estado||'').toLowerCase()==='cerrada'||((i.estado||'').toLowerCase()==='cerrado'))?'b-green'
        :((i.estado||'').toLowerCase()==='en proceso'?'b-blue':'b-red'))
      +'">'
      +(((i.estado||'').toLowerCase()==='cerrada'||((i.estado||'').toLowerCase()==='cerrado'))?'Cerrada'
        :((i.estado||'').toLowerCase()==='en proceso'?'En proceso':'Abierta'))
      +'</span>';
    h+='<tr>'
      +'<td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">'+fmtDate((i.fecha||(i.created_at||'').slice(0,10)))+'</td>'
      +'<td style="font-size:12px">'+(i.nombre_empleado||i.employee_name||i.nombre||'—')+'</td>'
      +'<td>'+deptBadge(i.area || (_valShiftMap[i.shift_id]&&_valShiftMap[i.shift_id].area) || '—')+'</td>'
      +'<td style="max-width:240px;font-size:12px">'+(i.descripcion||'—').slice(0,80)+'</td>'
      +'<td>'+badge+'</td>'
      +'</tr>';
  });
  inciEl.innerHTML=h+'</table>';
}
function valInciFilterBy(state, el){
  _valInciFilter = (_valInciFilter===state) ? '' : state;
  var k=document.getElementById('val-op-inci-kpis');
  if(k){ var cs=k.querySelectorAll('.kpi'); for(var j=0;j<cs.length;j++){ cs[j].style.outline=''; } }
  if(el && _valInciFilter){ el.style.outline='2px solid currentColor'; el.style.outlineOffset='-1px'; }
  valInciRenderTable();
}
window.valInciFilterBy = valInciFilterBy;
window.valInciRenderTable = valInciRenderTable;

function valGestRenderTable(){
  var gestEl=document.getElementById('val-gestiones-table');
  if(!gestEl) return;
  var f=_valGestFilter;
  var list=(_valGestCache||[]).filter(function(g){
    var s=(g.estado||'').toLowerCase();
    if(f==='abierta')    return s==='abierta'||s==='abierto'||!s;
    if(f==='en proceso') return s==='en proceso';
    if(f==='cerrada')    return s==='cerrada'||s==='cerrado';
    return s!=='cerrada'&&s!=='cerrado';   // Total / sin filtro → no cerradas
  });
  if(!list.length){
    gestEl.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin gestiones en este filtro</div></div>';
    return;
  }
  var h='<table><tr><th>Fecha</th><th>Empleado</th><th>Dept.</th><th>Descripción</th><th>Estado</th></tr>';
  list.forEach(function(g){
    h+='<tr>'
      +'<td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">'+fmtDate((g.fecha||(g.created_at||'').slice(0,10)))+'</td>'
      +'<td style="font-size:12px">'+(g.nombre_empleado||g.employee_name||g.nombre||'—')+'</td>'
      +'<td>'+deptBadge(g.departamento||g.area||'—')+'</td>'
      +'<td style="max-width:260px;font-size:12px">'+(g.descripcion||g.description||'—').slice(0,80)+'</td>'
      +'<td>'+(typeof bGestionEstado==='function'?bGestionEstado(g.estado):bEstado(g.estado))+'</td>'
      +'</tr>';
  });
  gestEl.innerHTML=h+'</table>';
}
function valGestFilterBy(state, el){
  _valGestFilter = (_valGestFilter===state) ? '' : state;
  var k=document.getElementById('val-op-gest-kpis');
  if(k){ var cs=k.querySelectorAll('.kpi'); for(var j=0;j<cs.length;j++){ cs[j].style.outline=''; } }
  if(el && _valGestFilter){ el.style.outline='2px solid currentColor'; el.style.outlineOffset='-1px'; }
  valGestRenderTable();
}
window.valGestFilterBy = valGestFilterBy;
window.valGestRenderTable = valGestRenderTable;

function valTaskRenderTable(){
  var tarEl=document.getElementById('val-tareas-table');
  if(!tarEl) return;
  var f=_valTaskFilter;
  var list=(_valTaskCache||[]).filter(function(t){
    var s=(t.estado||'').toLowerCase();
    if(f==='abierta')    return s==='abierta'||s==='abierto'||!s;
    if(f==='en proceso') return s==='en proceso';
    if(f==='cerrada')    return s==='cerrada'||s==='cerrado'||s==='completada';
    return s!=='cerrada'&&s!=='cerrado'&&s!=='completada';   // Total / sin filtro → pendientes
  });
  if(!list.length){
    tarEl.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin tareas en este filtro</div></div>';
    return;
  }
  var h='<table><tr><th>Creada</th><th>Título</th><th>Dept. Destino</th><th>Deadline</th><th>Estado</th></tr>';
  list.forEach(function(t){
    var dlStyle=(typeof isOverdue==='function'&&isOverdue(t.deadline))?'color:var(--red);font-weight:700':'';
    h+='<tr>'
      +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate((t.created_at||'').slice(0,10))+'</td>'
      +'<td style="font-size:12px;font-weight:600">'+(t.titulo||'—').slice(0,60)+'</td>'
      +'<td>'+deptBadge(t.dept_destino||'—')+'</td>'
      +'<td style="font-family:var(--font-mono);font-size:11px;'+dlStyle+'">'+(t.deadline?fmtDate(t.deadline):'—')+'</td>'
      +'<td>'+(typeof bGestionEstado==='function'?bGestionEstado(t.estado):bEstado(t.estado))+'</td>'
      +'</tr>';
  });
  tarEl.innerHTML=h+'</table>';
}
function valTaskFilterBy(state, el){
  _valTaskFilter = (_valTaskFilter===state) ? '' : state;
  var k=document.getElementById('val-op-tar-kpis');
  if(k){ var cs=k.querySelectorAll('.kpi'); for(var j=0;j<cs.length;j++){ cs[j].style.outline=''; } }
  if(el && _valTaskFilter){ el.style.outline='2px solid currentColor'; el.style.outlineOffset='-1px'; }
  valTaskRenderTable();
}
window.valTaskFilterBy = valTaskFilterBy;
window.valTaskRenderTable = valTaskRenderTable;

async function renderFollowUpExtras(dept){
  var incis=[]; var gests=[]; var tasks=[]; var shifts=[];
  try{ incis=await getDB('incidencias'); }catch(e){}
  try{ gests=await getDB('gestiones'); }catch(e){}
  try{ tasks=await getDB('tareas'); }catch(e){}
  try{ shifts=await getDB('shifts'); }catch(e){}

  // Construir shiftMap para resolver área de incidencias que solo tienen shift_id
  var shiftMap={};
  shifts.forEach(function(s){ if(s.id) shiftMap[s.id]=s; });
  _valShiftMap = shiftMap;  // compartir con valInciRenderTable

  // Función normalizada para resolver el dept de un registro
  var nd=normalizeDeptName;
  var ndept=nd(dept);
  function recDept(r){ return getRecordDepartment(r,shiftMap); }
  function matchesDept(r){ return !dept || nd(recDept(r))===ndept; }

  var openIncis=incis.filter(function(i){
    var s=(i.estado||'').toLowerCase();
    return s!=='cerrada'&&s!=='cerrado'&&s!=='closed';
  }).filter(matchesDept)
    .sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});

  var pendGests=gests.filter(function(g){
    var s=(g.estado||'').toLowerCase();
    return s!=='cerrada'&&s!=='cerrado'&&s!=='closed';
  }).filter(matchesDept)
    .sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});

  var pendTasks=tasks.filter(function(t){
    return typeof isTaskOpen==='function'?isTaskOpen(t):(function(){var s=(t.estado||'').toLowerCase();return s!=='cerrada'&&s!=='completada'&&s!=='closed';})();
  }).filter(matchesDept)
    .sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});

  // Incidencias
  // ── KPIs de incidencias ──
  var _allIncis=incis.filter(matchesDept);
  var _inciAb=_allIncis.filter(function(i){var s=(i.estado||'').toLowerCase();return s==='abierta'||s==='abierto';}).length;
  var _inciPr=_allIncis.filter(function(i){var s=(i.estado||'').toLowerCase();return s==='en proceso';}).length;
  var _inciCe=_allIncis.filter(function(i){var s=(i.estado||'').toLowerCase();return s==='cerrada'||s==='cerrado';}).length;
  // Contadores clicables = filtro (Abiertas / En proceso / Cerradas / Total)
  _valInciCache = _allIncis.slice().sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
  var _vkInci=function(lbl,val,col,filt){
    var act=(_valInciFilter===filt);
    return '<div class="kpi" onclick="valInciFilterBy(\''+filt+'\',this)" title="Clic para filtrar" '
      +'style="cursor:pointer;border-top:3px solid '+col+';'+(act?'outline:2px solid '+col+';outline-offset:-1px;':'')+'">'
      +'<div class="kpi-lbl">'+lbl+'</div><div class="kpi-val" style="color:'+col+'">'+val+'</div></div>';
  };
  var inciKpiEl=document.getElementById('val-op-inci-kpis');
  if(inciKpiEl) inciKpiEl.innerHTML='<div class="kpi-grid" style="margin-bottom:0;">'
    +_vkInci('Abiertas',_inciAb,'var(--red)','abierta')
    +_vkInci('En proceso',_inciPr,'var(--amber)','en proceso')
    +_vkInci('Cerradas',_inciCe,'var(--green)','cerrada')
    +_vkInci('Total',_allIncis.length,'var(--text3)','')
    +'</div>';
  valInciRenderTable();

  // Gestiones
  // ── KPIs de gestiones ──
  var _allGests=gests.filter(matchesDept);
  var _gestAb=_allGests.filter(function(g){var s=(g.estado||'').toLowerCase();return s==='abierta'||s==='abierto'||!s;}).length;
  var _gestPr=_allGests.filter(function(g){var s=(g.estado||'').toLowerCase();return s==='en proceso';}).length;
  var _gestCe=_allGests.filter(function(g){var s=(g.estado||'').toLowerCase();return s==='cerrada'||s==='cerrado';}).length;
  // Contadores clicables = filtro
  _valGestCache = _allGests.slice().sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
  var _vkGest=function(lbl,val,col,filt){
    var act=(_valGestFilter===filt);
    return '<div class="kpi" onclick="valGestFilterBy(\''+filt+'\',this)" title="Clic para filtrar" '
      +'style="cursor:pointer;border-top:3px solid '+col+';'+(act?'outline:2px solid '+col+';outline-offset:-1px;':'')+'">'
      +'<div class="kpi-lbl">'+lbl+'</div><div class="kpi-val" style="color:'+col+'">'+val+'</div></div>';
  };
  var gestKpiEl=document.getElementById('val-op-gest-kpis');
  if(gestKpiEl) gestKpiEl.innerHTML='<div class="kpi-grid" style="margin-bottom:0;">'
    +_vkGest('Abiertas',_gestAb,'var(--red)','abierta')
    +_vkGest('En proceso',_gestPr,'var(--amber)','en proceso')
    +_vkGest('Cerradas',_gestCe,'var(--green)','cerrada')
    +_vkGest('Total',_allGests.length,'var(--text3)','')
    +'</div>';
  valGestRenderTable();

  // Tareas
  // ── KPIs de tareas ──
  var _allTasks=tasks.filter(matchesDept);
  var _taskAb=_allTasks.filter(function(t){var s=(t.estado||'').toLowerCase();return s==='abierta'||s==='abierto'||!s;}).length;
  var _taskPr=_allTasks.filter(function(t){var s=(t.estado||'').toLowerCase();return s==='en proceso';}).length;
  var _taskCe=_allTasks.filter(function(t){var s=(t.estado||'').toLowerCase();return s==='cerrada'||s==='cerrado'||s==='completada';}).length;
  // Contadores clicables = filtro
  _valTaskCache = _allTasks.slice().sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
  var _vkTask=function(lbl,val,col,filt){
    var act=(_valTaskFilter===filt);
    return '<div class="kpi" onclick="valTaskFilterBy(\''+filt+'\',this)" title="Clic para filtrar" '
      +'style="cursor:pointer;border-top:3px solid '+col+';'+(act?'outline:2px solid '+col+';outline-offset:-1px;':'')+'">'
      +'<div class="kpi-lbl">'+lbl+'</div><div class="kpi-val" style="color:'+col+'">'+val+'</div></div>';
  };
  var tarKpiEl=document.getElementById('val-op-tar-kpis');
  if(tarKpiEl) tarKpiEl.innerHTML='<div class="kpi-grid" style="margin-bottom:0;">'
    +_vkTask('Abiertas',_taskAb,'var(--red)','abierta')
    +_vkTask('En proceso',_taskPr,'var(--amber)','en proceso')
    +_vkTask('Cerradas',_taskCe,'var(--green)','cerrada')
    +_vkTask('Total',_allTasks.length,'var(--text3)','')
    +'</div>';
  valTaskRenderTable();

  // ── C7: Notas del empleado (bloque Operativo) ──
  var notasEl = document.getElementById('val-op-notas-list');
  if(notasEl){
    var notes = [];
    try { notes = await getDB('employee_notes'); } catch(e){}
    // Filtrar por dept
    if(dept){
      var nDeptLow = dept.toLowerCase().trim();
      notes = notes.filter(function(n){ return (n.area||'').toLowerCase().trim() === nDeptLow; });
    } else if(!(typeof isAdmin==='function' && isAdmin(currentUser)) && !(typeof isAdjuntoDirectivo==='function' && isAdjuntoDirectivo(currentUser))){
      var _notaDepts = typeof getSupervisorDepartments==='function' ? getSupervisorDepartments(currentUser) : [currentUser.area||''];
      notes = notes.filter(function(n){ return _notaDepts.some(function(d){ return (n.area||'').toLowerCase() === d.toLowerCase(); }); });
    }
    notes.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
    notes = notes.slice(0,30);
    var isAdmN = typeof canActAsAdmin==='function' && canActAsAdmin(currentUser);
    if(!notes.length){
      notasEl.innerHTML = '<div class="empty" style="padding:16px;"><div class="empty-text" style="font-size:12px;">Sin notas</div></div>';
    } else {
      notasEl.innerHTML = notes.map(function(n){
        var hora = n.created_at ? new Date(n.created_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
        var catColor = n.categoria==='Queja' ? '#ef4444' : n.categoria==='Mejora' ? '#10b981' : '#8b5cf6';
        var leidaTag = (!n.leida && n.employee_id!==currentUser.id)
          ? '<span style="font-size:10px;background:rgba(239,68,68,.15);color:#ef4444;padding:2px 7px;border-radius:6px;margin-left:6px;">Nueva</span>'
          : '';
        var markBtn = (isAdmN && !n.leida && n.employee_id!==currentUser.id)
          ? ' <button class="btn btn-secondary btn-sm" style="font-size:10px;" onclick="markNotaLeida(\''+n.id+'\')">✓ Leída</button>'
          : '';
        return '<div class="task-card" style="'+(n.leida?'opacity:.7;':'')+'border-left:3px solid '+catColor+';padding:10px 14px;margin-bottom:6px;">'
          +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
          +'<span class="badge" style="background:rgba(139,92,246,.15);color:'+catColor+';border:1px solid '+catColor+';font-size:10px;">'+n.categoria+'</span>'
          +'<span style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">'+hora+'</span>'
          +'<span style="font-size:11px;font-weight:600;color:var(--text2);">'+formatDisplayValue(n.nombre)+'</span>'
          +'<span class="dept-badge" style="font-size:10px;">'+formatDisplayValue(n.area||'—')+'</span>'
          +leidaTag+markBtn
          +'</div>'
          +'<div style="font-size:13px;color:var(--text);margin-top:6px;line-height:1.4;">'+formatDisplayValue(n.texto)+'</div>'
          +'</div>';
      }).join('');
    }
  }
}
window.renderFollowUpExtras = renderFollowUpExtras;


// ── Modal de gestión de incidencia (Operativo / Validación) ────────────
var _inciOpData = {};
var _inciOpEstado = null;

function openInciOpModal(inciId){
  _inciOpData = {}; _inciOpEstado = null;
  getDB('incidencias').then(function(all){
    var inci = (all||[]).find(function(x){ return x.id===inciId; });
    if(!inci){ toast('Incidencia no encontrada','err'); return; }
    _inciOpData = inci;
    var infoEl = document.getElementById('modal-inci-op-info');
    var errEl  = document.getElementById('modal-inci-op-err');
    var comentEl = document.getElementById('modal-inci-op-comment');
    var accionBlock = document.getElementById('modal-inci-op-accion-block');
    var accionEl = document.getElementById('modal-inci-op-accion');
    var delBtn = document.getElementById('modal-inci-op-delete-btn');
    var m = document.getElementById('modal-inci-op');
    if(!m) return;
    if(errEl) errEl.textContent='';
    if(comentEl) comentEl.value='';
    if(accionEl) accionEl.value='';
    if(accionBlock) accionBlock.style.display='none';
    // Reset botones de estado
    ['inci-op-btn-proceso','inci-op-btn-cerrada'].forEach(function(id){
      var b=document.getElementById(id);
      if(b){ b.style.background='var(--bg2)'; b.style.fontWeight='700'; }
    });
    if(infoEl){
      var estadoBadge = typeof bIncidentEstado==='function'?bIncidentEstado(inci.estado):'<span class="badge">'+inci.estado+'</span>';
      infoEl.innerHTML = '<div style="font-size:15px;font-weight:700;margin-bottom:6px;">'+formatDisplayValue(inci.descripcion)+'</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">'
        +'<div><span style="color:var(--text3)">Área: </span>'+(inci.area||'—')+'</div>'
        +'<div><span style="color:var(--text3)">Estado: </span>'+estadoBadge+'</div>'
        +'<div><span style="color:var(--text3)">Empleado: </span>'+(inci.nombre_empleado||inci.nombre||'—')+'</div>'
        +'<div><span style="color:var(--text3)">Fecha: </span>'+fmtDate((inci.fecha||(inci.created_at||'').slice(0,10)))+'</div>'
        +(inci.accion_inmediata?'<div style="grid-column:span 2"><span style="color:var(--text3)">Acción previa: </span>'+formatDisplayValue(inci.accion_inmediata)+'</div>':'')
        +'</div>';
    }
    // Admin: mostrar botón eliminar
    var isAdmU = currentUser && currentUser.rol==='admin';
    if(delBtn) delBtn.style.display = isAdmU ? '' : 'none';
    // Si incidencia ya cerrada: mostrar solo info
    if((inci.estado||'').toLowerCase()==='cerrada'){
      ['inci-op-btn-proceso','inci-op-btn-cerrada'].forEach(function(id){
        var b=document.getElementById(id); if(b){ b.disabled=true; b.style.opacity='0.4'; }
      });
    } else {
      ['inci-op-btn-proceso','inci-op-btn-cerrada'].forEach(function(id){
        var b=document.getElementById(id); if(b){ b.disabled=false; b.style.opacity=''; }
      });
    }
    m.style.display='flex';
  }).catch(function(e){ toast('Error: '+e.message,'err'); });
}
window.openInciOpModal = openInciOpModal;

function selectInciOpEstado(estado){
  _inciOpEstado = estado;
  var btnPr = document.getElementById('inci-op-btn-proceso');
  var btnCe = document.getElementById('inci-op-btn-cerrada');
  var accionBlock = document.getElementById('modal-inci-op-accion-block');
  if(btnPr){ btnPr.style.background = estado==='En proceso'?'rgba(245,158,11,.2)':'var(--bg2)'; }
  if(btnCe){ btnCe.style.background = estado==='Cerrada'?'rgba(22,163,74,.2)':'var(--bg2)'; }
  if(accionBlock) accionBlock.style.display = estado==='Cerrada' ? '' : 'none';
}
window.selectInciOpEstado = selectInciOpEstado;

async function saveInciOpEstado(){
  var errEl = document.getElementById('modal-inci-op-err');
  if(errEl) errEl.textContent='';
  if(!_inciOpEstado){ if(errEl) errEl.textContent='Selecciona un estado.'; return; }
  var comment = (document.getElementById('modal-inci-op-comment')||{}).value||'';
  var accion  = (document.getElementById('modal-inci-op-accion')||{}).value||'';
  if(_inciOpEstado==='Cerrada' && !accion.trim()){ if(errEl) errEl.textContent='Acción tomada obligatoria al cerrar.'; return; }
  var canChange = typeof canValidateDepartment==='function' && canValidateDepartment(currentUser, _inciOpData.area||'');
  if(!canChange){ if(errEl) errEl.textContent='Sin permisos para este departamento.'; return; }
  try{
    var ts = localTs();
    var patch = { estado: _inciOpEstado, updated_at: ts };
    if(comment.trim()) patch.comentario_supervisor = comment.trim();
    if(_inciOpEstado==='Cerrada'){
      patch.accion_inmediata = accion.trim();
      patch.cerrado_ts = ts;
      patch.tiempo_gestion = Math.round((Date.now()-new Date(_inciOpData.created_at||ts).getTime())/60000);
    }
    await dbUpdate('incidencias', _inciOpData.id, patch);
    await auditLog('INCIDENCIA_ESTADO', currentUser.nombre+' → '+_inciOpEstado+' | incidencia '+_inciOpData.id+(comment?' | '+comment:''));
    invalidateCache('incidencias');
    toast('Estado actualizado','ok');
    closeInciOpModal();
    var opDept = (document.getElementById('v-dept')||{}).value||'';
    if(typeof renderFollowUpExtras==='function') renderFollowUpExtras(opDept);
  }catch(e){ if(errEl) errEl.textContent='Error: '+e.message; }
}
window.saveInciOpEstado = saveInciOpEstado;

function closeInciOpModal(){
  var m=document.getElementById('modal-inci-op'); if(m) m.style.display='none';
}
window.closeInciOpModal = closeInciOpModal;

async function deleteInciOp(){
  if(currentUser.rol!=='admin'){ toast('Solo admin puede eliminar incidencias','err'); return; }
  if(!confirm('¿Eliminar esta incidencia? No se puede deshacer.')) return;
  try{
    await auditLog('INCIDENCIA_DELETE', currentUser.nombre+' eliminó incidencia '+_inciOpData.id+' — '+(_inciOpData.descripcion||''));
    await dbDelete('incidencias', _inciOpData.id);
    invalidateCache('incidencias');
    toast('Incidencia eliminada','ok');
    closeInciOpModal();
    var opDept = (document.getElementById('v-dept')||{}).value||'';
    if(typeof renderFollowUpExtras==='function') renderFollowUpExtras(opDept);
  }catch(e){ toast('Error: '+e.message,'err'); }
}
window.deleteInciOp = deleteInciOp;

// ── Cambio de estado de incidencia desde tab Operativo (obsoleto — ahora vía modal) ────────────
async function cambiarEstadoIncidenciaOp(inciId, nuevoEstado, selectEl){
  if(!nuevoEstado) return;
  var canChange = typeof canValidateDepartment === 'function';
  if(!canChange){ toast('Sin permisos','err'); if(selectEl) selectEl.value=''; return; }
  try{
    var all = await getDB('incidencias');
    var inci = (all||[]).find(function(x){ return x.id===inciId; });
    if(!inci){ toast('Incidencia no encontrada','err'); return; }
    if(!canValidateDepartment(currentUser, inci.area||'')){ toast('Sin permisos para este departamento','err'); if(selectEl) selectEl.value=''; return; }
    var patch = { estado: nuevoEstado, updated_at: localTs() };
    if(nuevoEstado === 'Cerrada') patch.closed_at = localTs();
    await dbUpdate('incidencias', inciId, patch);
    await auditLog('INCIDENCIA_ESTADO', (currentUser.nombre||'—')+' cambió incidencia '+inciId+' a '+nuevoEstado);
    invalidateCache('incidencias');
    toast('Estado actualizado','ok');
    // Refrescar tabla operativo si está visible
    var opDept = (document.getElementById('v-dept')||{}).value||'';
    if(typeof renderFollowUpExtras === 'function') renderFollowUpExtras(opDept);
  }catch(e){ toast('Error: '+e.message,'err'); if(selectEl) selectEl.value=''; }
}
window.cambiarEstadoIncidenciaOp = cambiarEstadoIncidenciaOp;

// buildInciObj → incidencias.js
async function renderMisTurnos(){
  const shifts=(await getDB('shifts')).filter(s=>s.employee_id===currentUser.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,12);
  const el=document.getElementById('mis-turnos-table');
  if(!shifts.length){el.innerHTML='<div class="empty"><div class="empty-icon">📂</div><div class="empty-text">Sin registros</div></div>';return;}
  const mermas=await getDB('merma');
  const incidencias=await getDB('incidencias');
  var ajustesAll = []; try { ajustesAll = await getDB('ajustes'); } catch(e){}
  var isSalaDept = currentUser && (currentUser.area === 'Sala' || currentUser.area === 'Recepción');
  // Build per-shift maps for gestión y incidencia
  var gestionMap={}, inciMap={};
  incidencias.forEach(function(i){
    if(!i.shift_id) return;
    if(i.categoria==='Gestión pendiente') gestionMap[i.shift_id]=true;
    else inciMap[i.shift_id]=true;
  });
  el.innerHTML='<table><tr><th>Fecha</th><th>Servicio</th><th>Horas</th>'+(isSalaDept?'<th>Ajustes de Caja</th>':'<th>Mermas</th>')+'<th>Gestión</th><th>Incid.</th><th>Estado</th></tr>'
  +shifts.map(function(s){
    const mc=mermas.filter(m=>m.shift_id===s.id).length;
    var ajustesS = ajustesAll.filter(function(a){ return a.shift_id===s.id; });
    var ajustesCell;
    if(ajustesS.length>0){
      var totAj = 0; ajustesS.forEach(function(a){ totAj += parseFloat(a.importe)||0; });
      var col = totAj < 0 ? 'b-red' : 'b-blue';
      ajustesCell = '<span class="badge '+col+'" title="'+ajustesS.length+' ajuste(s)">'+totAj.toFixed(2)+' €</span>';
    } else {
      ajustesCell = '—';
    }
    return '<tr>'
      +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(s.fecha)+'</td>'
      +'<td style="font-size:13px;">'+displayServicio(s.servicio)+'</td>'
      +'<td style="font-family:var(--font-mono)">'+s.horas+'h</td>'
      +'<td style="text-align:center">'+(isSalaDept?ajustesCell:(mc>0?'<span class="badge b-yellow">'+mc+'</span>':'—'))+'</td>'
      +'<td style="text-align:center">'+(gestionMap[s.id]?'<span class="badge b-yellow">Sí</span>':'—')+'</td>'
      +'<td style="text-align:center">'+(inciMap[s.id]?'<span class="badge b-red">Sí</span>':'—')+'</td>'
      +'<td>'+bEstado(s.estado)+'</td>'
      +'</tr>';
  }).join('') + '</table>';
}

// ═══════════════════════════════════════════════════════════════════════
// BADGE HELPERS
function bFU(v){if(v==='si')return'<span class="badge b-green">SÍ</span>';if(v==='no')return'<span class="badge b-red">NO</span>';if(v==='na')return'<span class="badge b-blue">N/A</span>';return'<span class="badge b-gray">—</span>';}
function renderTurnosKpis(shifts){
  var el=document.getElementById('val-turnos-kpis');
  if(!el) return;
  var pend=shifts.filter(function(s){return s.estado==='Pendiente';}).length;
  var valid=shifts.filter(function(s){return s.estado==='Validado'||s.estado==='Validado con FIO';}).length;
  var corr=shifts.filter(function(s){return s.estado==='En corrección';}).length;
  el.innerHTML='<div class="kpi-grid" style="margin-bottom:0;">'
    +'<div class="kpi" style="border-top:3px solid var(--red)"><div class="kpi-lbl">Pendientes</div><div class="kpi-val" style="color:var(--red)">'+pend+'</div></div>'
    +'<div class="kpi" style="border-top:3px solid var(--green)"><div class="kpi-lbl">Validados</div><div class="kpi-val" style="color:var(--green)">'+valid+'</div></div>'
    +'<div class="kpi" style="border-top:3px solid var(--amber)"><div class="kpi-lbl">Corrección</div><div class="kpi-val" style="color:var(--amber)">'+corr+'</div></div>'
    +'<div class="kpi" style="border-top:3px solid var(--text3)"><div class="kpi-lbl">Total</div><div class="kpi-val">'+shifts.length+'</div></div>'
    +'</div>';
}
function bEstado(e){const m={'Validado':'b-green ✓ Validado','Pendiente':'b-red ● Pendiente','En corrección':'b-orange ↩ Corrección','Rechazado':'b-gray ✗ Rechazado'};const[cls,...r]=(m[e]||'b-gray '+e).split(' ');return`<span class="badge ${cls}">${r.join(' ')}</span>`;}
function bSev(s){if(s==='Crítica')return'<span class="badge b-red">⛔ CRÍTICA</span>';if(s==='Alta')return'<span class="badge b-red">🔴 Alta</span>';if(s==='Media')return'<span class="badge b-orange">🟠 Media</span>';return'<span class="badge b-blue">🟡 Baja</span>';}
function bPrio(p){if(p==='Alta')return'<span class="badge b-red">Alta</span>';if(p==='Media')return'<span class="badge b-orange">Media</span>';return'<span class="badge b-blue">Baja</span>';}
// bTaskEstado → tareas.js
// bIncidentEstado → incidencias.js

// ═══════════════════════════════════════════════════════════════════════
// TASKS (createTask, openTaskModal, saveTask, renderTareas, deleteTask,
//        canProgressTask, advanceTask) → tareas.js
// bGestionEstado → gestiones.js

// ═══════════════════════════════════════════════════════════════════════
// VALIDACIÓN
function onValDeptChange(){
  var dept=(document.getElementById('v-dept')||{}).value||'';
  var label=document.getElementById('v-servicio-label');
  var sel=document.getElementById('v-servicio');
  if(!sel) return;
  var cocSala='<option value="">Todos</option><option>Desayuno</option><option>Comida</option><option>Cena</option><option>Evento</option><option>Otro</option>';
  var rec='<option value="">Todos</option><option>Mañana</option><option>Tarde</option><option>Noche</option>';
  var all='<option value="">Todos</option><option>Desayuno</option><option>Comida</option><option>Cena</option><option>Evento</option><option>Otro</option><option>Mañana</option><option>Tarde</option><option>Noche</option>';
  if(dept==='Recepción'){ if(label) label.textContent='Turno'; sel.innerHTML=rec; }
  else if(dept==='Cocina'||dept==='Sala'){ if(label) label.textContent='Servicio'; sel.innerHTML=cocSala; }
  else { if(label) label.textContent='Servicio'; sel.innerHTML=all; }
  // CAJA-V2: si la pestaña CIERRE CAJA está activa, refrescar al cambiar dept
  var cajaTab = document.getElementById('val-content-caja');
  if(cajaTab && cajaTab.style.display !== 'none' && typeof renderValCajaList === 'function'){
    renderValCajaList();
  }
  // MERMA: mostrar/ocultar pestaña según dept y rol
  if(typeof _updateMermaTabVisibility === 'function') _updateMermaTabVisibility();
  // FIO tab visibility (C6)
  if(typeof _updateFIOTabVisibility === 'function') _updateFIOTabVisibility();
}

// Departamentos (valores de v-dept) que corresponden al área de un jefe
function _jefeDeptOptions(user){
  var a = (user && user.area) || '';
  if(a.indexOf('SYNCROLAB')>=0 || a.indexOf('Syncrolab')>=0) return ['Recepción SYNCROLAB'];
  if(a.indexOf('Recepción')>=0 || a.indexOf('Recepcion')>=0)  return ['Recepción'];
  if(a==='Sala')                       return ['Sala'];
  if(a==='Cocina' || a==='Friegue')    return ['Cocina'];
  if(a==='F&B' || a==='Food & Beverage' || a==='Restaurante') return ['Sala','Cocina'];
  return a ? [a] : [];
}
function initValDeptFilter(){
  var sel=document.getElementById('v-dept');
  if(!sel||!currentUser) return;
  var allDepts=['Cocina','Sala','Recepción','Housekeeping','SYNCROLAB','Recepción SYNCROLAB','Mantenimiento','Economato','Administración','RRHH'];
  var fullOpts='<option value="">Todos</option>'+allDepts.map(function(d){return '<option>'+d+'</option>';}).join('');
  if(typeof isAdmin==='function' && isAdmin(currentUser)){
    sel.innerHTML=fullOpts; sel.value=''; sel.disabled=false; onValDeptChange(); return;
  }
  // adjunto_directivo: ve TODOS los departamentos (solo lectura en turnos)
  if(typeof isAdjuntoDirectivo==='function' && isAdjuntoDirectivo(currentUser)){
    sel.innerHTML=fullOpts; sel.value=''; sel.disabled=false; onValDeptChange(); return;
  }
  // Contable: acceso a las 3 cajas (Sala, Recepción, Recepción SYNCROLAB), read-only
  if(typeof isContable==='function' && isContable(currentUser)){
    var cajaDepts=['Sala','Recepción','Recepción SYNCROLAB'];
    sel.innerHTML='<option value="">Todas las cajas</option>'+cajaDepts.map(function(d){return '<option>'+d+'</option>';}).join('');
    sel.value=''; sel.disabled=false; onValDeptChange(); return;
  }
  // Jefe / coordinador: el selector SOLO ofrece sus departamentos (sin "Todos"); bloqueado si es uno.
  var opts=_jefeDeptOptions(currentUser);
  if(opts.length){
    sel.innerHTML = opts.map(function(d){return '<option>'+d+'</option>';}).join('');
    sel.value = opts[0];
    sel.disabled = (opts.length===1);
  } else {
    sel.disabled=false;
  }
  onValDeptChange();
  if(typeof _updateMermaTabVisibility === 'function') _updateMermaTabVisibility();
  if(typeof _updateNotasTabVisibility === 'function') _updateNotasTabVisibility();
  if(typeof _updateFIOTabVisibility === 'function') _updateFIOTabVisibility();
}

function filtrarValidacion(){
  var _opDiv  = document.getElementById('val-content-operativo');
  var _dept   = (document.getElementById('v-dept')||{}).value||'';
  if(_opDiv && _opDiv.style.display !== 'none'){
    // Tab OPERATIVO activo — refrescar incidencias/gestiones/tareas
    if(typeof renderFollowUpExtras === 'function') renderFollowUpExtras(_dept);
  } else {
    // Tab TURNOS u otro activo — refrescar tabla de turnos
    renderValidacion();
  }
}
window.filtrarValidacion = filtrarValidacion;

async function renderValidacion(){
  let shifts=await getDB('shifts');
  // jefe_recepcion: only see Recepción shifts
  if(currentUser && currentUser.rol==='jefe_recepcion'){
    shifts = shifts.filter(function(s){ return s.area==='Recepción'; });
  }
  // Fix: empleado recepción solo ve sus propios turnos
  if(currentUser && currentUser.area==='Recepción' && currentUser.rol==='empleado'){
    shifts = shifts.filter(function(s){ return s.employee_id===currentUser.id; });
  }
  const desde=document.getElementById('v-desde').value;
  const hasta=document.getElementById('v-hasta').value;
  const estado=document.getElementById('v-estado').value;
  const serv=document.getElementById('v-servicio').value;
  const dept=(document.getElementById('v-dept')||{}).value||'';
  if(desde) shifts=shifts.filter(s=>s.fecha>=desde);
  if(hasta) shifts=shifts.filter(s=>s.fecha<=hasta);
  if(estado) shifts=shifts.filter(s=>s.estado===estado);
  if(dept){
    // Fix Jun 2026: "SYNCROLAB" como filtro = todos los del laboratorio
    // (incluye 'Recepción SYNCROLAB', 'SyncroLab', 'Entrenadores', etc.).
    // "Recepción SYNCROLAB" filtra solo a esa área concreta.
    var _nDept = normalizeDeptName(dept);
    if(_nDept === 'syncrolab'){
      shifts = shifts.filter(function(s){ return /syncrolab|syncro lab/i.test(s.area||''); });
    } else {
      shifts = shifts.filter(function(s){ return normalizeDeptName(s.area) === _nDept; });
    }
  }
  // Fix permisos Jun 2026: el coordinador de Entrenadores (no admin) solo debe
  // ver los turnos de SU equipo (entrenadores), no todos los de SYNCROLAB
  // (que incluiría Recepción SYNCROLAB y Fisioterapeutas). Se filtra por puesto.
  if(currentUser && currentUser.rol === 'coord_entrenadores' && !(typeof isAdmin==='function' && isAdmin(currentUser))){
    var _puestosEntr = (typeof _PUESTOS_ENTRENADOR !== 'undefined') ? _PUESTOS_ENTRENADOR : ['Entrenador(a)','Coordinador(a) de Entrenadores'];
    shifts = shifts.filter(function(s){
      // turnos cuya área NO es SYNCROLAB pasan tal cual (no aplica); los de
      // SYNCROLAB solo si el puesto del turno es de entrenador
      if(!/syncrolab|syncro lab/i.test(s.area||'')) return true;
      return _puestosEntr.indexOf(s.puesto||'') !== -1;
    });
  }
  if(serv) shifts=shifts.filter(function(s){
    if(!s.servicio) return false;
    if(s.area==='Recepción') return s.servicio===serv;
    try{ var arr=Array.isArray(s.servicio)?s.servicio:JSON.parse(s.servicio); return Array.isArray(arr)?arr.includes(serv):s.servicio===serv; }catch(e){ return s.servicio===serv; }
  });
  shifts.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const pend=shifts.filter(s=>s.estado==='Pendiente').length;
  var ajustesAll = []; try { ajustesAll = await getDB('ajustes'); } catch(e){}
  const _shiftIds = shifts.map(function(s){ return s.id; });
  const _ajF = ajustesAll.filter(function(a){ return _shiftIds.indexOf(a.shift_id) >= 0; });
  const _totAj = _ajF.reduce(function(acc,a){ return acc + (parseFloat(a.importe)||0); }, 0);
  var _alertsHtml = '';
  if(pend > 0) _alertsHtml += '<div class="alert a-warn">⚠ '+pend+' registro(s) pendiente(s)</div>';
  _alertsHtml += '<div class="kpi-grid" style="margin-bottom:12px;">'
    + '<div class="kpi k-blue"><div class="kpi-lbl">Total ajustes</div><div class="kpi-val">'+_totAj.toFixed(2)+' €</div><div class="kpi-sub">'+_ajF.length+' línea(s)</div></div>'
    + '</div>';
  document.getElementById('val-alerts').innerHTML = _alertsHtml;
  const mermas=await getDB('merma'); const incis=await getDB('incidencias');
  // FIO nuevo: cargar y mapear por shift_id (Fase 2)
  var fiosAll = [];
  try { fiosAll = await getDB('fio'); } catch(e){ fiosAll = []; }
  var fiosByShift = {};
  fiosAll.forEach(function(f){
    if(f.shift_id){
      if(!fiosByShift[f.shift_id]) fiosByShift[f.shift_id] = [];
      fiosByShift[f.shift_id].push(f);
    }
  });
  const el=document.getElementById('validacion-table');
  if(!shifts.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin registros</div></div>';
    // Fix Jun 2026: resetear KPIs a 0 cuando el filtro no devuelve resultados
    if(typeof renderTurnosKpis==='function') renderTurnosKpis(shifts);
    return;
  }
  // Build validation table without nested template literals
  var valRows="";
  shifts.forEach(function(s){
    var sm=mermas.filter(function(m){return recordMatchesShift(m,s);});
    var si=incis.filter(function(i){return recordMatchesShift(i,s);});
    var sa=ajustesAll.filter(function(a){return a.shift_id===s.id;});
    var mCP=sm.some(function(m){return !m.coste_unitario||m.coste_unitario===0;});
    // For Sala/Recepción: show ajustes total. For Cocina/etc: show merma count
    var isSalaShift = s.area === 'Sala' || s.area === 'Recepción';
    var mCell;
    if(isSalaShift){
      if(sa.length>0){
        var totAj = 0; sa.forEach(function(a){ totAj += parseFloat(a.importe)||0; });
        var col = totAj < 0 ? 'b-red' : 'b-blue';
        mCell = '<span class="badge '+col+'" title="'+sa.length+' ajuste(s)">'+totAj.toFixed(2)+' €</span>';
      } else {
        mCell = '<span class="badge b-gray">—</span>';
      }
    } else {
      mCell=sm.length>0?'<span class="badge b-yellow">'+sm.length+'</span>'+(mCP?'<span class="badge b-orange" style="margin-left:4px">€?</span>':''):'<span class="badge b-gray">—</span>';
    }
    var iCell=si.length>0?'<span class="badge b-red">SÍ</span>':'<span class="badge b-gray">—</span>';
    var mermaCell;
    if(sm.length>0){
      var smSinCoste=sm.some(function(m){return !(parseFloat(m.coste_total)>0);});
      if(smSinCoste){ mermaCell='<span class="badge b-red">⚠️ S/C</span>'; }
      else{ var smTotal=sm.reduce(function(acc,m){return acc+parseFloat(m.coste_total);},0); mermaCell='<span class="badge b-green">€'+smTotal.toFixed(2)+'</span>'; }
    } else {
      mermaCell='<span style="color:var(--text3)">—</span>';
    }
    var aCell='';
    var sid=s.id;
    // All action buttons in one nowrap flex row
    var isReadOnly = s.estado==='Validado'||s.estado==='Validado con FIO'||s.estado==='Rechazado';
    var canSupervise = canValidateShift(currentUser,s);
    var isAdjAdm = isAdjuntoDirectivo(currentUser) && currentUser.area==='Administración';
    var btnRevisar = (!isReadOnly && canSupervise && !isAdjAdm)
      ? '<button class="vbtn vbtn-primary" onclick="openValidarModal(\''+sid+'\')">Revisar</button>' : '';
    // BUG-50: turno validado también abre openValidarModal; adjunto Administración siempre Ve
    var btnVer = ((isReadOnly && canSupervise) || isAdjAdm)
      ? '<button class="vbtn vbtn-sec" onclick="openValidarModal(\''+sid+'\')">📋 Ver</button>' : '';
    var btnArevisar = '';  // Botón post-error eliminado en Fase 1 (función openPostErrorModal no implementada)
                            // Para revisar errores post-validación usar el módulo FIO
    var canReopen = isAdmin(currentUser)
      && (s.estado==='Validado'||s.estado==='Validado con FIO');
    var btnReabrir = canReopen
      ? '<button class="vbtn vbtn-sec" onclick="openReopenModal(\''+sid+'\')" title="Reabrir informe">↩</button>' : '';
    var btnDel = isAdmin(currentUser)
      ? '<button class="vbtn vbtn-del" onclick="deleteShift(\''+sid+'\')">🗑</button>' : '';
    aCell = '<div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;">'+btnRevisar+btnVer+btnArevisar+btnReabrir+btnDel+'</div>';
    valRows+='<tr><td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">'+fmtDateTs(s.fecha,s.hora_registro||s.created_at)+'</td>'
      +'<td><div style="font-weight:600">'+s.nombre+'</div><div style="font-size:10px;color:var(--text3)">'+s.puesto+'</div></td>'
      +'<td>'+displayServicio(s.servicio)+'</td><td style="font-family:var(--font-mono)">'+s.horas+'h</td>'
      +'<td>'+mCell+'</td><td>'+iCell+'</td>'
      +'<td style="text-align:center;">'+mermaCell+'</td>'
      +'<td style="text-align:center;">'+(function(){
        var sfios = fiosByShift[s.id] || [];
        if(sfios.length){
          var maxPts = Math.max.apply(null, sfios.map(function(f){ return parseFloat(f.applied_points)||0; }));
          return '<span class="badge b-red" title="'+sfios.length+' FIO ('+maxPts+'p máx)">'+sfios.length+'</span>';
        }
        return s.estado!=='Pendiente'?'<span style="color:var(--green);">✓</span>':'<span style="color:var(--text3);">—</span>';
      })()+'</td>'
      +'<td>'+bEstado(s.estado)+'</td><td>'+aCell+'</td></tr>';
  });
  el.innerHTML='<table><tr><th>Fecha</th><th>Empleado</th><th>Servicio</th><th>Horas</th><th>Ajustes de Caja</th><th>Incid.</th><th>Merma</th><th>FIO</th><th>Estado</th><th>Acción</th></tr>'+valRows+'</table>';
  if(typeof renderTurnosKpis==='function') renderTurnosKpis(shifts);
  // Sync tab visibility after every render (dept filter may have changed)
  if(typeof _updateMermaTabVisibility==='function') _updateMermaTabVisibility();
  if(typeof _updateNotasTabVisibility==='function') _updateNotasTabVisibility();
  if(typeof _updateFIOTabVisibility==='function') _updateFIOTabVisibility();
  // Si tab OPERATIVO está visible, refrescarlo también con el mismo filtro de dept
  var _opDiv = document.getElementById('val-content-operativo');
  if(_opDiv && _opDiv.style.display !== 'none' && typeof renderFollowUpExtras === 'function'){
    var _opDept = (document.getElementById('v-dept')||{}).value||'';
    renderFollowUpExtras(_opDept);
  }
}
// valAdvanceGestion, valShowCloseGestionForm, valSaveCloseGestion,
// valAdvanceGestionNew, valShowCloseGestionNewForm, valSaveCloseGestionNew → gestiones.js

// valAdvanceInci, valShowCloseInciForm, valSaveCloseInci → incidencias.js

async function openValidarModal(shiftId){
  validatingShiftId=shiftId;
  // Force fresh data — never use stale cache for validation review
  invalidateCache('incidencias'); invalidateCache('tareas'); invalidateCache('merma');
  const s=(await getDB('shifts')).find(x=>x.id===shiftId); if(!s) return;
  if(!canValidateShift(currentUser,s)){ toast('No tienes permiso para validar registros de este departamento.','err'); return; }
  const allMerma=await dbGetAll('merma');
  const mermas=allMerma.filter(m=>recordMatchesShift(m,s));
  _validatingMermas=mermas;
  const allIncis=await getDB('incidencias');
  const incis=allIncis.filter(function(i){return recordMatchesShift(i,s);});
  const allTareas=await getDB('tareas');
  const shiftTareas=allTareas.filter(function(t){return recordMatchesShift(t,s);});
  const allGestiones=await getDB('gestiones');
  const shiftGestiones=allGestiones.filter(function(g){
    return (g.shift_id===shiftId || g.employee_id===s.employee_id)
      && g.estado !== 'Cerrada';  // BUG-47b: no mostrar cerradas
  });
  // Legacy: carga recepcion_cash (ya no se usa para KPIs — ahora en shifts.kpi_recepcion)
  var recKpiRow = null;
  if(s.area === 'Recepción'){
    try {
      var allRecCash = await getDB('recepcion_cash');
      // Normalizar servicio del shift para matching
      var _sServ = (typeof formatServiceOrTurn==='function') ? formatServiceOrTurn(s.servicio) : (s.servicio||'');
      recKpiRow = allRecCash.find(function(r){
        return r.employee_id === s.employee_id
          && (r.fecha||'').slice(0,10) === (s.fecha||'').slice(0,10);
      }) || null;
    } catch(e){ recKpiRow = null; }
  }
  // Cross-selling: líneas de recepcion_ventas de este turno (detalle + incentivo)
  var recVentas = [];
  try { recVentas = (await getDB('recepcion_ventas')).filter(function(v){ return v.shift_id===shiftId; }); } catch(e){ recVentas = []; }
  document.getElementById('mv-title').textContent=`${formatDisplayValue(s.nombre)} — ${fmtDateTs(s.fecha,s.created_at)} — ${formatServiceOrTurn(s.servicio)}`;
  // ── BUILD FULL SHIFT DETAIL FOR SUPERVISOR ──
  var info = '';

  // Block 1: Datos generales
  info += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;">';
  info += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:8px;">DATOS DEL TURNO</div>';
  info += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">';
  info += '<div><span style="color:var(--text3)">Empleado: </span><strong>'+formatDisplayValue(s.nombre)+'</strong></div>';
  info += '<div><span style="color:var(--text3)">Puesto: </span>'+formatDisplayValue(s.puesto)+'</div>';
  info += '<div><span style="color:var(--text3)">Fecha: </span><strong>'+fmtDate(s.fecha)+'</strong></div>';
  info += '<div><span style="color:var(--text3)">'+(s.area==='Recepción'?'Turno':'Servicio')+': </span><strong>'+formatServiceOrTurn(s.servicio)+'</strong></div>';
  info += '<div><span style="color:var(--text3)">Horas: </span><strong>'+s.horas+'h</strong></div>';
  if(s.area!=='Recepción') info += '<div><span style="color:var(--text3)">Responsable: </span>'+formatDisplayValue(s.responsable_nombre)+'</div>';
  if(s.observacion) info += '<div style="grid-column:span 2"><span style="color:var(--text3)">Observación: </span>'+formatDisplayValue(s.observacion)+'</div>';
  info += '</div></div>';

  // Block 1.5: KPI declarados por el empleado (por departamento)
  (function(){
    var _area = s.area || '';
    var kpiHtml = '';

    // ── SALA: ajustes_sala (JSON array de líneas) ──
    if(_area === 'Sala' || _area === 'F&B'){
      var ajLines = [];
      try { ajLines = s.ajustes_sala ? JSON.parse(s.ajustes_sala) : []; } catch(e){ ajLines = []; }
      if(ajLines.length > 0){
        var totalAj = ajLines.reduce(function(a,l){ return a+(parseFloat(l.importe)||0); },0);
        kpiHtml += '<table style="font-size:12px;width:100%;border-collapse:collapse;">'
          +'<tr><th style="text-align:left;padding:4px 8px;color:var(--text3);font-weight:600;border-bottom:1px solid var(--border);">Tipo</th>'
          +'<th style="text-align:center;padding:4px 8px;color:var(--text3);font-weight:600;border-bottom:1px solid var(--border);">Nº</th>'
          +'<th style="text-align:right;padding:4px 8px;color:var(--text3);font-weight:600;border-bottom:1px solid var(--border);">Importe</th>'
          +'<th style="text-align:center;padding:4px 8px;color:var(--text3);font-weight:600;border-bottom:1px solid var(--border);">Comunicado</th>'
          +'<th style="text-align:left;padding:4px 8px;color:var(--text3);font-weight:600;border-bottom:1px solid var(--border);">Motivo</th></tr>';
        ajLines.forEach(function(l){
          var imp = parseFloat(l.importe)||0;
          var impCol = imp < 0 ? 'var(--red)' : imp > 0 ? 'var(--amber)' : 'var(--text3)';
          var comBadge = l.comunicado_responsable === 'si'
            ? '<span class="badge b-green">✓ Sí</span>'
            : '<span class="badge b-gray">✗ No</span>';
          kpiHtml += '<tr>'
            +'<td style="padding:4px 8px;"><span class="badge b-yellow">'+formatDisplayValue(l.tipo)+'</span></td>'
            +'<td style="padding:4px 8px;text-align:center;font-family:var(--font-mono);">'+(l.num||1)+'</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-weight:600;color:'+impCol+';">'+(imp!==0?(imp>0?'+':'')+imp.toFixed(2)+' €':'—')+'</td>'
            +'<td style="padding:4px 8px;text-align:center;">'+comBadge+'</td>'
            +'<td style="padding:4px 8px;color:var(--text3);">'+formatDisplayValue(l.motivo||'—')+'</td>'
            +'</tr>';
        });
        kpiHtml += '</table>'
          +'<div style="text-align:right;padding:4px 8px;font-size:11px;font-family:var(--font-mono);color:var(--amber);">Total declarado: '+(totalAj!==0?(totalAj>0?'+':'')+totalAj.toFixed(2)+' €':'—')+'</div>';
      } else {
        kpiHtml += '<div style="font-size:12px;color:var(--text3);">Sin ajustes declarados</div>';
      }
      info += '<div style="background:var(--bg);border:1px solid #3b82f6;border-radius:8px;padding:12px;margin-bottom:10px;">'
        +'<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.15em;margin-bottom:8px;">KPI · AJUSTES DECLARADOS POR EMPLEADO</div>'
        +kpiHtml+'</div>';
    }

    // ── RECEPCIÓN: KPIs operativos desde shifts.kpi_recepcion (JSON) ──
    if(_area === 'Recepción'){
      var _kpiRec = null;
      if(s.kpi_recepcion){
        try{ _kpiRec = typeof s.kpi_recepcion === 'string' ? JSON.parse(s.kpi_recepcion) : s.kpi_recepcion; }catch(e){ _kpiRec = null; }
      }
      if(_kpiRec){
        var kRow = function(lbl, val, mono, col){
          if(val === null || val === undefined || val === '') return '';
          return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:12px;">'
            +'<span style="color:var(--text3);">'+lbl+'</span>'
            +'<span style="'+(mono?'font-family:var(--font-mono);':'')+' '+(col?'color:'+col+';font-weight:600;':'')+'">'+(typeof val==='number'?(val%1===0?val:val.toFixed(2)):val)+'</span>'
            +'</div>';
        };
        // Operación
        kpiHtml  = kRow('Check-ins', parseInt(_kpiRec.checkins)||0, true);
        kpiHtml += kRow('Check-outs', parseInt(_kpiRec.checkouts)||0, true);
        kpiHtml += kRow('Reservas gestionadas', parseInt(_kpiRec.reservas)||0, true);
        // Upsell desayuno
        var _upsDes = (_kpiRec.upsell_desayuno||'na').toLowerCase();
        if(_upsDes === 'si'){
          kpiHtml += kRow('Desayunos ofertados', parseInt(_kpiRec.desal_ofertados)||0, true);
          kpiHtml += kRow('Desayunos vendidos', parseInt(_kpiRec.desal_vendidos)||0, true, 'var(--green)');
        } else if(_upsDes === 'no'){
          kpiHtml += kRow('Upsell desayuno', 'No ofertó', false);
        }
        // Clientes insatisfechos
        var _cliInsat = (_kpiRec.clientes_insatisfechos||'no').toLowerCase();
        if(_cliInsat === 'si'){
          kpiHtml += kRow('Clientes insatisfechos', parseInt(_kpiRec.clientes_num)||0, true, 'var(--amber)');
        } else {
          kpiHtml += kRow('Clientes insatisfechos', 'No', false);
        }
        // Lead Bitrix24
        var _leadPR = (_kpiRec.lead_pendiente||'no').toLowerCase();
        if(_leadPR === 'si'){
          kpiHtml += kRow('Lead pendiente', _kpiRec.lead_desc||'Sí', false, 'var(--amber)');
          if(_kpiRec.lead_resp) kpiHtml += kRow('Lead responsable', _kpiRec.lead_resp, false);
          if(_kpiRec.lead_fecha) kpiHtml += kRow('Lead seguimiento', _kpiRec.lead_fecha, false);
        } else {
          kpiHtml += kRow('Lead Bitrix24', 'No', false);
        }
        info += '<div style="background:var(--bg);border:1px solid #0ea5e9;border-radius:8px;padding:12px;margin-bottom:10px;">'
          +'<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#0ea5e9;letter-spacing:.15em;margin-bottom:8px;">KPI · DATOS OPERATIVOS RECEPCIÓN</div>'
          +kpiHtml+'</div>';
      } else {
        info += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--text3);">KPI Recepción: el empleado no declaró KPIs operativos en este turno</div>';
      }
    }

    // ── HOUSEKEEPING: campos propios (si existen en el shift) ──
    if(_area === 'Housekeeping'){
      var hkFields = [];
      if(s.habitaciones_limpiadas) hkFields.push({lbl:'Habitaciones limpiadas', val: s.habitaciones_limpiadas});
      if(s.habitaciones_repasos)   hkFields.push({lbl:'Repasos', val: s.habitaciones_repasos});
      if(s.habitaciones_salida)    hkFields.push({lbl:'Salidas', val: s.habitaciones_salida});
      if(hkFields.length > 0){
        var hkHtml = hkFields.map(function(f){
          return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:12px;">'
            +'<span style="color:var(--text3);">'+f.lbl+'</span>'
            +'<span style="font-family:var(--font-mono);font-weight:600;">'+f.val+'</span>'
            +'</div>';
        }).join('');
        info += '<div style="background:var(--bg);border:1px solid var(--green);border-radius:8px;padding:12px;margin-bottom:10px;">'
          +'<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--green);letter-spacing:.15em;margin-bottom:8px;">KPI · HOUSEKEEPING</div>'
          +hkHtml+'</div>';
      }
    }

    // ── ENTRENADORES: shifts.kpi_entrenador (JSON autodeclarado por el empleado) ──
    // Se pinta siempre que el turno tenga kpi_entrenador, sin depender de area/puesto
    // (los entrenadores comparten area='SYNCROLAB' con Recepción SYNCROLAB).
    if(s.kpi_entrenador){
      var _kEntr = null;
      try { _kEntr = JSON.parse(s.kpi_entrenador); } catch(e){ _kEntr = null; }
      if(_kEntr){
        var CAMPOS_ENTR = [
          ['dir_efectiva','📢 Clases dirigidas efectivas'],
          ['dir_no_efectiva','📢 Clases dirigidas NO efectivas'],
          ['pt','🏋 PT individuales'],
          ['pt_duo','🏋 PT DUO'],
          ['pt_30','🏋 PT 30 min'],
          ['val_funcional','📊 Valoraciones funcionales'],
          ['visbody','📊 Valoraciones Visbody'],
          ['banera_hielo','🧊 Bañeras de hielo']
        ];
        var _entrHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;">';
        var _totEntr = 0;
        CAMPOS_ENTR.forEach(function(p){
          var v = parseInt(_kEntr[p[0]])||0; _totEntr += v;
          var col = v>0 ? 'var(--text)' : 'var(--text3)';
          _entrHtml += '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--border);">'
            +'<span style="color:'+col+';">'+p[1]+'</span>'
            +'<strong style="font-family:var(--font-mono);color:'+col+';">'+v+'</strong></div>';
        });
        _entrHtml += '</div><div style="margin-top:8px;font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:6px;">'
          +'Total autodeclarado: <strong style="color:var(--text);font-family:var(--font-mono);">'+_totEntr+'</strong> '
          +'· <em>El incentivo oficial se calcula con VirtuGym (Informes → Entrenadores).</em></div>';
        info += '<div style="background:var(--bg);border:1px solid #8b5cf6;border-radius:8px;padding:12px;margin-bottom:10px;">'
          +'<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#8b5cf6;letter-spacing:.15em;margin-bottom:8px;">KPI · ENTRENADORES · autocontrol de actividad</div>'
          +_entrHtml+'</div>';
      }
    }

    // ── CROSS-SELLING (Recepción): detalle línea a línea de recepcion_ventas ──
    if(/recep/i.test(_area)){
      var TIPO_LABEL_RV = {desayuno:'🌅 Desayuno', comida_cena:'🍽️ Comida/Cena', syncrolab:'💪 SYNCROLAB'};
      var _ivaRV = function(t){ return t==='syncrolab' ? 1.21 : 1.10; };
      if(recVentas && recVentas.length>0){
        var _totIncRV = 0;
        recVentas.forEach(function(v){ _totIncRV += (parseFloat(v.importe||0)) / _ivaRV(v.tipo_venta) * 0.10; });
        var _rvHtml = '<div class="tbl-wrap"><table style="font-size:12px;width:100%;">'
          +'<tr style="color:var(--text3);"><th style="text-align:left;padding:4px 8px;">Tipo</th><th style="text-align:right;padding:4px 8px;">Bruto</th><th style="text-align:right;padding:4px 8px;">Neto</th><th style="text-align:right;padding:4px 8px;">Incentivo</th><th style="text-align:left;padding:4px 8px;">MEWS ref</th></tr>';
        recVentas.forEach(function(v){
          var b = parseFloat(v.importe||0); var n = b / _ivaRV(v.tipo_venta); var inc = n * 0.10;
          _rvHtml += '<tr style="border-top:1px solid var(--border);">'
            +'<td style="padding:4px 8px;">'+(TIPO_LABEL_RV[v.tipo_venta]||v.tipo_venta)+(v.servicio_detalle?' · <span style="color:var(--text3);">'+v.servicio_detalle+'</span>':'')+'</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);">'+b.toFixed(2)+'€</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--text2);">'+n.toFixed(2)+'€</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--green);">+'+inc.toFixed(2)+'€</td>'
            +'<td style="padding:4px 8px;color:var(--text3);">'+(v.reserva_mews||'—')+'</td></tr>';
        });
        _rvHtml += '</table></div>';
        info += '<div style="background:var(--bg);border:1px solid var(--green);border-radius:8px;padding:12px;margin-bottom:10px;">'
          +'<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--green);letter-spacing:.15em;margin-bottom:8px;">CROSS-SELLING ('+recVentas.length+' venta(s) · incentivo estimado '+_totIncRV.toFixed(2)+'€)</div>'
          +_rvHtml+'</div>';
      } else {
        info += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--text3);">Cross-selling: sin ventas registradas en este turno</div>';
      }
    }
  })();

  // Block 2: Checklist
  if(s.checklist_items){
    try{
      var chk=JSON.parse(s.checklist_items);
      // ── Seleccionar checklist correcto según departamento y turno ──
      var _sa=s.area||''; var _ss=(s.servicio||'').toLowerCase();
      var chkItems=(function(){
        if(_sa==='Friegue'||s.puesto==='Friegue') return typeof CHK_FRIEGUE_ITEMS!=='undefined'?CHK_FRIEGUE_ITEMS:null;
        if(_sa==='Sala') return typeof CHK_SALA_ITEMS!=='undefined'?CHK_SALA_ITEMS:null;
        if(_sa==='F&B') return typeof CHK_FNB_ITEMS!=='undefined'?CHK_FNB_ITEMS:null;
        if(_sa==='Recepción'){
          if(_ss.indexOf('noche')>=0) return typeof CHK_REC_NOCHE_ITEMS!=='undefined'?CHK_REC_NOCHE_ITEMS:null;
          if(_ss.indexOf('tarde')>=0) return typeof CHK_REC_TARDE_ITEMS!=='undefined'?CHK_REC_TARDE_ITEMS:null;
          return typeof CHK_REC_MANANA_ITEMS!=='undefined'?CHK_REC_MANANA_ITEMS:null;
        }
        if(/syncrolab/i.test(_sa)){
          if(_ss.indexOf('tarde')>=0) return typeof CHK_LAB_TARDE_ITEMS!=='undefined'?CHK_LAB_TARDE_ITEMS:null;
          return typeof CHK_LAB_MANANA_ITEMS!=='undefined'?CHK_LAB_MANANA_ITEMS:null;
        }
        return typeof CHK_COCINA_ITEMS!=='undefined'?CHK_COCINA_ITEMS:null;
      })();
      var chkDone=chk.filter(Boolean).length;
      info += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;">';
      info += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:8px;">CHECKLIST ('+chkDone+'/'+chk.length+')</div>';
      if(!chkItems){
        info += '<div style="color:var(--text3);font-style:italic;font-size:12px;">No hay checklist configurado para este departamento.</div>';
      } else {
        chk.forEach(function(c,i){
          if(i<chkItems.length){
            info += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;">'
              +'<span style="color:'+(c?'var(--green)':'var(--red)')+';font-size:14px;">'+(c?'✓':'✗')+'</span>'
              +'<span style="color:'+(c?'var(--text)':'var(--text3)')+'">'+chkItems[i]+'</span>'
              +'</div>';
          }
        });
      }
      info += '</div>';
    }catch(e){}
  }

  // Block 3: Gestiones pendientes — tabla gestiones (BUG-27b fix)
  var canActOnStates = isSupervisor(currentUser) || isAdmin(currentUser);
  if(shiftGestiones.length>0){
    info += '<div style="background:var(--bg);border:1px solid var(--amber);border-radius:8px;padding:12px;margin-bottom:10px;">';
    info += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.15em;margin-bottom:8px;">GESTIONES PENDIENTES ('+shiftGestiones.length+')</div>';
    shiftGestiones.forEach(function(g){
      var gState = g.estado || 'Abierta';
      info += '<div style="border-top:1px solid var(--border);padding:10px 0;">';
      info += '<div style="font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
      if(g.tipo_gestion) info += '<div><span style="color:var(--text3)">Tipo: </span><span class="badge b-yellow">'+formatDisplayValue(g.tipo_gestion)+'</span></div>';
      info += '<div><span style="color:var(--text3)">Estado: </span>'+bGestionEstado(gState)+'</div>';
      info += '<div style="grid-column:span 2"><span style="color:var(--text3)">Descripción: </span><strong>'+formatDisplayValue(g.descripcion)+'</strong></div>';
      if(g.accion_tomada) info += '<div style="grid-column:span 2"><span style="color:var(--text3)">Acción tomada: </span>'+formatDisplayValue(g.accion_tomada)+'</div>';
      info += '</div>';
      var isClosed = gState==='Cerrada';
      if(isClosed){
        info += '<div style="margin-top:6px;font-size:11px;color:var(--text3);">'
          +(g.cerrado_ts?'Cerrado: <strong>'+fmtTs(g.cerrado_ts)+'</strong>':'')
          +(g.tiempo_gestion?' · Tiempo: <strong>'+fmtTiempoGestion(g.tiempo_gestion)+'</strong>':'')
          +(g.cerrado_por?' · Por: <strong>'+formatDisplayValue(g.cerrado_por)+'</strong>':'')
          +'</div>';
      } else if(canActOnStates){
        var gBtn = gState==='Abierta'
          ? '<button class="vbtn vbtn-primary" onclick="valAdvanceGestionNew(\''+g.id+'\',\'En proceso\')">▶ En proceso</button>'
          : '<button class="vbtn vbtn-warn" onclick="valShowCloseGestionNewForm(\''+g.id+'\',\''+shiftId+'\')">✓ Cerrar gestión</button>';
        info += '<div id="g-btn-'+g.id+'" style="margin-top:8px;">'+gBtn+'</div>';
      }
      info += '</div>';
    });
    info += '</div>';
  } else {
    info += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--text3);">Sin gestiones pendientes declaradas</div>';
  }

  // Block 4: Incidencia operativa
  var incisList = incis.filter(function(i){ return i.categoria !== 'Gestión pendiente'; });
  if(incisList.length>0){
    incisList.forEach(function(inci){
      var iState = normalizeIncidentState(inci.estado);
      info += '<div style="background:var(--bg);border:1px solid var(--red);border-radius:8px;padding:12px;margin-bottom:10px;">';
      info += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--red);letter-spacing:.15em;margin-bottom:8px;">INCIDENCIA OPERATIVA</div>';
      info += '<div style="font-size:13px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
      if(inci.tipo_incidencia) info += '<div><span style="color:var(--text3)">Tipo: </span><span class="badge b-red">'+formatDisplayValue(inci.tipo_incidencia)+'</span></div>';
      var informadoTxt = inci.informado_responsable === 'si' ? '✓ Sí' : '✗ No';
      info += '<div><span style="color:var(--text3)">Informado responsable: </span>'+informadoTxt+'</div>';
      info += '<div><span style="color:var(--text3)">Estado: </span>'+bIncidentEstado(inci.estado)+'</div>';
      info += '<div style="grid-column:span 2"><span style="color:var(--text3)">Descripción: </span><strong>'+formatDisplayValue(inci.descripcion)+'</strong></div>';
      if(inci.accion_inmediata) info += '<div style="grid-column:span 2"><span style="color:var(--text3)">Acción tomada: </span>'+formatDisplayValue(inci.accion_inmediata)+'</div>';
      if(inci.staff_implicado_nombres){
        try{
          var staffTxt=formatStaffList(inci.staff_implicado_nombres);
          if(staffTxt!=='—'){
            info += '<div style="grid-column:span 2"><span style="color:var(--text3)">Personas involucradas: </span>';
            info += staffTxt.split(',').map(function(n){return '<span class="badge b-yellow" style="margin-right:4px;">'+formatDisplayValue(n)+'</span>';}).join('');
            info += '</div>';
          }
        }catch(e){}
      }
      info += '</div>';
      var iClosedNow = iState===INCIDENT_STATES.CERRADA;
      if(iClosedNow){
        info += '<div style="margin-top:6px;font-size:11px;color:var(--text3);">'
          +(inci.cerrado_ts?'Cerrado: <strong>'+fmtTs(inci.cerrado_ts)+'</strong>':'')
          +(inci.tiempo_gestion?' · Tiempo de gestión: <strong>'+fmtTiempoGestion(inci.tiempo_gestion)+'</strong>':'')
          +'</div>';
      } else if(canActOnStates){
        var iBtn = iState===INCIDENT_STATES.ABIERTA
          ? '<button class="vbtn vbtn-primary" onclick="valAdvanceInci(\''+inci.id+'\')">▶ En proceso</button>'
          : '<button class="vbtn vbtn-warn" onclick="valShowCloseInciForm(\''+inci.id+'\')">✓ Cerrar incidencia</button>';
        info += '<div id="i-btn-'+inci.id+'" style="margin-top:8px;">'+iBtn+'</div>';
      }
      info += '</div>';
    });
  } else {
    info += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--text3);">Sin incidencias operativas declaradas</div>';
  }

  // Block 5: Merma (editable) — solo dptos que generan merma
  var _deptMerma = (s.area||'').toLowerCase().trim();
  var _aplicaMerma = ['cocina','friegue','fnb','food & beverage'].indexOf(_deptMerma) !== -1;
  if(_aplicaMerma){
  info += '<div id="mv-merma-block" style="background:var(--bg);border:1px solid var(--amber);border-radius:8px;padding:12px;margin-bottom:10px;">';
  info += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--amber);letter-spacing:.15em;margin-bottom:10px;">MERMA</div>';
  if(mermas.length>0){
    mermas.forEach(function(m){
      var cu=parseFloat(m.coste_unitario)||0;
      var initTot=cu>0?(cu*parseFloat(m.cantidad)).toFixed(2)+'€':'—';
      info += '<div class="mcoste-row '+(cu>0?'filled':'')+'" style="margin-bottom:8px;">';
      info += '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;align-items:center;">';
      info += '<div><div style="font-weight:600;font-size:13px;">'+formatDisplayValue(m.producto)+'</div>'
        +'<div style="font-size:11px;color:var(--text3)">'+m.cantidad+' '+formatDisplayValue(m.unidad)+' · '+formatDisplayValue(m.causa)+'</div></div>';
      info += '<div><label style="font-size:9px;display:block;color:var(--text3);margin-bottom:2px;">€/unidad</label>'
        +'<input type="number" id="mcoste-'+m.id+'" value="'+(cu||'')+'" min="0" step="0.01" placeholder="0.00"'
        +' oninput="updMcoste(\''+m.id+'\',\''+m.cantidad+'\')"'
        +' style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px;padding:5px 7px;width:100%;outline:none;box-sizing:border-box;"></div>';
      info += '<div><label style="font-size:9px;display:block;color:var(--text3);margin-bottom:2px;">Total €</label>'
        +'<div id="mtot-'+m.id+'" style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--orange);padding:5px 0;">'+initTot+'</div></div>';
      info += '</div></div>';
    });
    var initTotal=mermas.reduce(function(a,m){return a+(parseFloat(m.coste_unitario)||0)*parseFloat(m.cantidad);},0);
    info += '<div class="mcoste-total" style="margin-top:8px;"><span>TOTAL MERMA</span><span id="mtot-gen">'+(initTotal>0?initTotal.toFixed(2)+'€':'Pendiente')+'</span></div>';
  } else {
    var sinMermaMsg=s.sinmerma===true
      ? 'Sin merma declarada <em>(confirmado por empleado)</em>'
      : 'Sin merma declarada';
    info += '<div style="font-size:12px;color:var(--text3);">'+sinMermaMsg+'</div>';
  }
  info += '</div>';
  } // end _aplicaMerma

  document.getElementById('mv-info').innerHTML=info;
  // mv-costes is now unused for merma — clear it
  var mvCostes=document.getElementById('mv-costes');
  mvCostes.style.border=''; mvCostes.style.borderRadius=''; mvCostes.style.padding='';
  mvCostes.innerHTML='';
  document.getElementById('val-comentario').value='';
  // Restore action buttons (may have been hidden by detail view)
  document.querySelectorAll('.modal-footer .btn-warn, .modal-footer .btn-danger, .modal-footer .btn-success').forEach(function(b){
    b.style.display='';
  });
  // Guarda shift actual para que el botón "Registrar FIO" pueda usarlo
  window._currentValidatingShift = s;
  // Reset de selects del bloque FIO viejo (si aún existen en el DOM, se ignoran si no)
  ['val-gravedad','val-tipo-error','val-impacto-bonus','val-num-errores'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value=(id==='val-num-errores'?'0':'');
  });
  document.getElementById('modal-validar').classList.add('open');
}

// Apertura del modal FIO desde el modal de validación de turno
function openFIOFromValidar(){
  var s = window._currentValidatingShift;
  if(!s){ toast('No hay turno activo','err'); return; }
  if(typeof openNewFIOModal !== 'function'){ toast('Módulo FIO no cargado','err'); return; }
  openNewFIOModal({
    shiftId: s.id,
    departamento: s.area || '',
    empleadoId: s.employee_id || '',
    empleadoNombre: s.nombre || '',
    fecha: s.fecha || today()
  });
}
window.openFIOFromValidar = openFIOFromValidar;
function updMcoste(mid,cant){ var v=parseFloat(document.getElementById('mcoste-'+mid).value)||0; var t=v*parseFloat(cant); document.getElementById('mtot-'+mid).textContent=t>0?t.toFixed(2)+'€':'—'; var total=0; _validatingMermas.forEach(function(x){ var inp=document.getElementById('mcoste-'+x.id); total+=(inp?parseFloat(inp.value)||0:parseFloat(x.coste_unitario)||0)*parseFloat(x.cantidad); }); var el=document.getElementById('mtot-gen'); if(el) el.textContent=total>0?total.toFixed(2)+'€':'Pendiente'; }
async function doValidacion(newEstado){
  if(!validatingShiftId) return;
  const comentario=document.getElementById('val-comentario').value.trim();
  if(newEstado==='En corrección'&&!comentario){toast('Escribe qué debe corregir el empleado','err');return;}
  // ── Merma cost check — block validation if any merma line has no cost ──
  if(newEstado==='Validado' && _validatingMermas.length>0){
    var sinCoste=_validatingMermas.filter(function(m){
      var inp=document.getElementById('mcoste-'+m.id);
      return !inp || !(parseFloat(inp.value)>0);
    });
    if(sinCoste.length>0){
      sinCoste.forEach(function(m){
        var inp=document.getElementById('mcoste-'+m.id);
        if(inp) inp.style.border='2px solid var(--red)';
      });
      var mermaBlock=document.getElementById('mv-merma-block');
      if(mermaBlock) mermaBlock.scrollIntoView({behavior:'smooth',block:'nearest'});
      toast('⚠️ Completa el coste de todas las líneas de merma antes de validar.','err');
      return;
    }
  }
  // Guardar costes merma
  var _mermaTotalGuardado=0;
  for(var _mi=0;_mi<_validatingMermas.length;_mi++){
    var _m=_validatingMermas[_mi];
    var _inp=document.getElementById('mcoste-'+_m.id);
    if(_inp){
      var _cu=parseFloat(_inp.value)||0;
      var _ct=_cu*parseFloat(_m.cantidad);
      await dbUpdate('merma',_m.id,{coste_unitario:_cu,coste_total:_ct});
      _mermaTotalGuardado+=_ct;
    }
  }
  if(_validatingMermas.length>0) await auditLog('MERMA_VALORADA','shift_id: '+validatingShiftId+', total: '+_mermaTotalGuardado.toFixed(2)+'€');
  invalidateCache('merma');
  // Actualizar shift
  const shifts=await getDB('shifts');
  const idx=shifts.findIndex(s=>s.id===validatingShiftId); if(idx===-1) return;

  // CRITICAL: save all validation fields to Supabase
  // FIO antiguo ELIMINADO en Fase 1 — ahora los FIO se registran en tabla `fio` vía módulo FIO
  var valCosteMerma = parseFloat((document.getElementById('val-coste-total')||{}).value)||0;
  var updatePayload = {
    estado: newEstado,
    validado_por: currentUser.nombre,
    validado_ts: localTs(),
    comentario_validador: comentario,
    coste_merma_supervisor: valCosteMerma,
  };

  console.log('[VALIDACION] Saving:', updatePayload);
  var saveResult = await dbUpdate('shifts', validatingShiftId, updatePayload);
  console.log('[VALIDACION] Result:', saveResult);
  invalidateCache('shifts');
  auditLog('VALIDACION',`${currentUser.nombre} → ${newEstado}`);
  closeModal('modal-validar'); renderValidacion();
  toast(`Registro: ${newEstado}`,newEstado==='Validado'?'ok':'warn');
}

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD
async function renderDashboard(){
  const periodo=document.getElementById('dash-periodo').value;
  const servFilt=document.getElementById('dash-serv').value;
  const empFilt=document.getElementById('dash-emp').value;
  const tipoErrorFilt=(document.getElementById('dash-tipo-error')||{}).value||'';
  const sevFilt=(document.getElementById('dash-sev')||{}).value||'';
  const diCat=document.getElementById('di-cat').value;
  const diSev=document.getElementById('di-sev').value;
  const diEstado=document.getElementById('di-estado').value;
  const dmCausa=document.getElementById('dm-causa').value;
  const dmEmp=document.getElementById('dm-emp').value;

  let desde=null;
  if(periodo==='hoy') desde=today();
  if(periodo==='semana') desde=startOfWeek();
  if(periodo==='mes') desde=startOfMonth();

  let shifts=await getDB('shifts');
  // Admin dept filter
  var deptFilter=(document.getElementById('dash-dept')||{}).value||'';
  if(deptFilter){
    shifts = shifts.filter(function(s){ return s.area===deptFilter; });
  } else if(currentUser.rol==='jefe_recepcion'){
    shifts = shifts.filter(function(s){ return s.area==='Recepción'; });
  }
  let mermas=await getDB('merma');
  let incis=await getDB('incidencias');
  const tareas=await getDB('tareas');
  // FIO nuevo (tabla `fio`) — Fase 2
  let fios = [];
  try { fios = await getDB('fio'); } catch(e){ fios = []; }

  if(desde){shifts=shifts.filter(s=>s.fecha>=desde);mermas=mermas.filter(m=>m.fecha>=desde);incis=incis.filter(i=>i.fecha>=desde);fios=fios.filter(f=>f.fecha>=desde);}
  if(servFilt){shifts=shifts.filter(s=>s.servicio===servFilt);mermas=mermas.filter(m=>m.servicio===servFilt);incis=incis.filter(i=>i.servicio===servFilt);}
  if(empFilt) { shifts=shifts.filter(s=>s.nombre===empFilt); fios=fios.filter(f=>f.employee_name===empFilt); }
  if(deptFilter) fios = fios.filter(function(f){ return f.departamento === deptFilter; });
  if(currentUser.rol==='jefe_recepcion') fios = fios.filter(function(f){ return f.departamento==='Recepción' || f.departamento==='Recepción SFERA'; });
  // Filtros viejos tipo_error / gravedad_error eliminados en Fase 2 (no se escriben más datos a esas columnas)

  const pl={hoy:'Hoy',semana:'Esta semana',mes:'Este mes',todo:'Total'};
  document.getElementById('dash-sub').textContent=`${pl[periodo]} ${servFilt?'· '+servFilt:''} ${empFilt?'· '+empFilt:''}`;

  // Global KPIs
  const totalH=shifts.length;
  const valH=shifts.filter(s=>s.estado==='Validado').length;
  const pendH=shifts.filter(s=>s.estado==='Pendiente').length;
  const totalHoras=shifts.reduce((a,s)=>a+(parseFloat(s.horas)||0),0);
  const costeMerma=mermas.reduce((a,m)=>a+(m.coste_total||0),0);
  const inciAb=incis.filter(i=>i.estado==='Abierta').length;
  const pctFU=0; // follow-up field removed
  const tasksPend=tareas.filter(t=>t.estado==='Pendiente').length;
  // ── FIO KPIs (Fase 2 — leen de tabla `fio` nueva) ──
  const fiosVal = fios.filter(function(f){ return f.status==='Validado' || f.status==='Cerrado'; });
  const fiosPend = fios.filter(function(f){ return f.status==='Registrado'; });
  const fiosCrit = fios.filter(function(f){ return ['L3','L4','L5'].indexOf(f.level_code) >= 0 && (f.status==='Validado'||f.status==='Cerrado'); });
  const fiosToday = fios.filter(function(f){ return f.fecha === today(); });
  const puntosTot = fiosVal.reduce(function(a,f){ return a + (parseFloat(f.applied_points)||0); }, 0);
  var fioByEmpMap = {};
  fiosVal.forEach(function(f){ if(f.employee_name){ fioByEmpMap[f.employee_name] = (fioByEmpMap[f.employee_name]||0) + 1; } });
  const topFioEmp = Object.keys(fioByEmpMap).sort(function(a,b){ return fioByEmpMap[b]-fioByEmpMap[a]; })[0] || '—';
  const totalFIO = fios.length;
  document.getElementById('kpi-grid').innerHTML=
    '<div class="kpi k-amber"><div class="kpi-lbl">Turnos</div><div class="kpi-val">'+totalH+'</div><div class="kpi-sub">'+valH+' validados · '+pendH+' pendientes</div></div>'+
    '<div class="kpi k-green"><div class="kpi-lbl">Horas</div><div class="kpi-val">'+totalHoras.toFixed(1)+'h</div><div class="kpi-sub">Prom. '+(totalH?(totalHoras/totalH).toFixed(1):0)+'h/turno</div></div>'+
    '<div class="kpi k-orange"><div class="kpi-lbl">Coste merma</div><div class="kpi-val">'+costeMerma.toFixed(0)+'€</div><div class="kpi-sub">'+mermas.length+' líneas totales</div></div>'+
    '<div class="kpi k-red"><div class="kpi-lbl">Incidencias</div><div class="kpi-val">'+inciAb+'</div><div class="kpi-sub">'+incis.length+' total · '+inciAb+' abiertas</div></div>'+
    (function(){
      var fioEl=document.getElementById('dash-fio-count');
      if(fioEl) fioEl.textContent='('+totalFIO+' registros)';
      return '<div class="kpi k-red"><div class="kpi-lbl">FIO total</div><div class="kpi-val">'+totalFIO+'</div><div class="kpi-sub">'+fiosToday.length+' hoy</div></div>'
        +'<div class="kpi k-red"><div class="kpi-lbl">FIO Grave (L3+)</div><div class="kpi-val">'+fiosCrit.length+'</div><div class="kpi-sub">L3/L4/L5</div></div>'
        +'<div class="kpi k-orange"><div class="kpi-lbl">FIO Pendiente</div><div class="kpi-val">'+fiosPend.length+'</div><div class="kpi-sub">Sin validar</div></div>'
        +'<div class="kpi k-amber"><div class="kpi-lbl">Puntos negativos</div><div class="kpi-val">'+puntosTot+'</div><div class="kpi-sub">Top: '+(topFioEmp.length>14?topFioEmp.slice(0,14)+'…':topFioEmp)+'</div></div>';
    })()+
    '<div class="kpi k-purple"><div class="kpi-lbl">Tareas pend.</div><div class="kpi-val">'+tasksPend+'</div><div class="kpi-sub">'+tareas.filter(function(t){return t.estado==='Verificada';}).length+' verificadas</div></div>';

  // Empleados
  const eMap={};
  shifts.forEach(s=>{ if(!eMap[s.nombre]) eMap[s.nombre]={nombre:s.nombre,puesto:s.puesto,turnos:0,horas:0,mermas:0,incis:0}; eMap[s.nombre].turnos++;eMap[s.nombre].horas+=parseFloat(s.horas)||0;if(s.merma_declarada==='si')eMap[s.nombre].mermas++;if(s.incidencia_declarada==='si')eMap[s.nombre].incis++; });
  const eRows=Object.values(eMap).sort((a,b)=>b.horas-a.horas);
  const empEl=document.getElementById('dash-emp-table');
  // FIO contado por empleado RESPONSABLE (leer de tabla `fio` nueva)
  var fioMap={};
  fios.forEach(function(f){
    var key = f.employee_name;
    if(!key) return;
    fioMap[key] = (fioMap[key]||0) + 1;
    // Asegurar que aparece en empMap aunque no tenga turnos en el periodo
    if(!eMap[key]) eMap[key]={nombre:key,puesto:'—',turnos:0,horas:0,mermas:0,incis:0};
  });
  Object.keys(eMap).forEach(function(k){ eMap[k].fio_count = fioMap[eMap[k].nombre]||0; });
  const eRows2=Object.values(eMap).sort((a,b)=>b.horas-a.horas);
  empEl.innerHTML=eRows2.length?'<table><tr><th>Empleado</th><th>Turnos</th><th>Horas</th><th>Incid.</th><th>FIO</th></tr>'+eRows2.map(function(e){
    return '<tr><td><div style="font-weight:600">'+e.nombre+'</div><div style="font-size:11px;color:var(--text3)">'+e.puesto+'</div></td><td style="font-family:var(--font-mono)">'+e.turnos+'</td><td style="font-family:var(--font-mono)">'+e.horas.toFixed(1)+'h</td><td>'+( e.incis>0?'<span class="badge b-red">'+e.incis+'</span>':'—')+'</td><td>'+(e.fio_count>0?'<span class="badge b-red">'+e.fio_count+'</span>':'—')+'</td></tr>';
  }).join('')+'</table>':'<div class="empty"><div class="empty-icon">👥</div><div class="empty-text">Sin datos</div></div>';

  // Alertas
  const msgs=[];
  if(pendH>0) msgs.push({t:'warn',m:`${pendH} turno(s) pendiente(s) de validación`});
  const sinCoste=mermas.filter(m=>!m.coste_unitario||m.coste_unitario===0).length;
  if(sinCoste>0) msgs.push({t:'warn',m:`${sinCoste} línea(s) de merma sin coste`});
  if(shifts.filter(s=>s.follow_up==='no').length) msgs.push({t:'err',m:`${shifts.filter(s=>s.follow_up==='no').length} turno(s) con follow-up NO`});
  const crit=incis.filter(i=>i.severidad==='Crítica'&&i.estado==='Abierta');
  if(crit.length) msgs.push({t:'err',m:`⛔ ${crit.length} incidencia(s) CRÍTICA(s) sin cerrar`});
  const overdueT=tareas.filter(t=>isOverdue(t.deadline)&&t.estado!=='Verificada').length;
  if(overdueT>0) msgs.push({t:'err',m:`${overdueT} tarea(s) vencida(s) sin cerrar`});
  if(!msgs.length) msgs.push({t:'ok',m:'Sin alertas activas en el periodo'});
  document.getElementById('dash-alertas').innerHTML=msgs.map(x=>`<div class="alert a-${x.t==='ok'?'ok':x.t==='err'?'err':'warn'}">${x.m}</div>`).join('');

  // INCIDENCIAS filtradas
  let inciF=[...incis];
  if(diCat) inciF=inciF.filter(i=>i.categoria===diCat);
  if(diSev) inciF=inciF.filter(i=>i.severidad===diSev);
  if(diEstado) inciF=inciF.filter(i=>i.estado===diEstado);

  const inciKpiEl=document.getElementById('kpi-incis');
  const iAb=inciF.filter(i=>i.estado==='Abierta').length;
  const iCrit=inciF.filter(i=>i.severidad==='Crítica').length;
  const iForm=inciF.filter(i=>i.requiere_formacion==='Sí').length;
  const iDisc=inciF.filter(i=>i.requiere_disciplina==='Sí').length;
  inciKpiEl.innerHTML=`<div class="kpi k-red"><div class="kpi-lbl">Total (filtro)</div><div class="kpi-val">${inciF.length}</div></div><div class="kpi k-red"><div class="kpi-lbl">Abiertas</div><div class="kpi-val">${iAb}</div></div><div class="kpi k-red"><div class="kpi-lbl">Críticas</div><div class="kpi-val">${iCrit}</div></div><div class="kpi k-orange"><div class="kpi-lbl">Req. Formación</div><div class="kpi-val">${iForm}</div></div><div class="kpi k-orange"><div class="kpi-lbl">Req. Disciplina</div><div class="kpi-val">${iDisc}</div></div>`;

  const inciTbl=document.getElementById('dash-inci-table');
  inciTbl.innerHTML=inciF.length?`<table><tr><th>Fecha</th><th>Declarante</th><th>Servicio</th><th>Categoría</th><th>Sev.</th><th>Descripción</th><th>Estado</th><th>Form.</th><th>Disc.</th></tr>
  ${inciF.sort((a,b)=>{const s={Crítica:4,Alta:3,Media:2,Baja:1};return(s[b.severidad]||0)-(s[a.severidad]||0);}).map(i=>`<tr><td style="font-family:var(--font-mono);font-size:10px">${fmtDate(i.fecha)}</td><td>${i.nombre}</td><td>${i.servicio}</td><td style="font-size:11px">${i.categoria}</td><td>${bSev(i.severidad)}</td><td style="font-size:11px;color:var(--text2);max-width:200px">${i.descripcion}</td><td>${i.estado==='Abierta'?'<span class="badge b-red">Abierta</span>':'<span class="badge b-green">Gestionada</span>'}</td><td>${i.requiere_formacion==='Sí'?'<span class="badge b-yellow">SÍ</span>':'—'}</td><td>${i.requiere_disciplina==='Sí'?'<span class="badge b-red">SÍ</span>':'—'}</td></tr>`).join('')}</table>`:'<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin incidencias con este filtro</div></div>';

  // MERMA filtrada
  let mermaF=[...mermas];
  if(dmCausa) mermaF=mermaF.filter(m=>m.causa===dmCausa);
  if(dmEmp) mermaF=mermaF.filter(m=>m.nombre===dmEmp);

  const mKpi=document.getElementById('kpi-merma');
  const totalMermaLineas=mermaF.length;
  const totalMermaCosto=mermaF.reduce((a,m)=>a+(m.coste_total||0),0);
  const sinCosto=mermaF.filter(m=>!m.coste_unitario||m.coste_unitario===0).length;
  const causaMap={};
  mermaF.forEach(m=>{if(!causaMap[m.causa])causaMap[m.causa]={causa:m.causa,lineas:0,coste:0};causaMap[m.causa].lineas++;causaMap[m.causa].coste+=(m.coste_total||0);});
  const topCausa=Object.values(causaMap).sort((a,b)=>b.coste-a.coste)[0];
  mKpi.innerHTML=`<div class="kpi k-orange"><div class="kpi-lbl">Líneas merma</div><div class="kpi-val">${totalMermaLineas}</div></div><div class="kpi k-orange"><div class="kpi-lbl">Coste total</div><div class="kpi-val">${totalMermaCosto.toFixed(0)}€</div></div><div class="kpi k-red"><div class="kpi-lbl">Sin coste</div><div class="kpi-val">${sinCosto}</div><div class="kpi-sub">Líneas pendientes de valorar</div></div><div class="kpi k-amber"><div class="kpi-lbl">Top causa</div><div class="kpi-val" style="font-size:15px;">${topCausa?.causa||'—'}</div><div class="kpi-sub">${topCausa?topCausa.coste.toFixed(2)+'€':''}</div></div>`;

  const mTbl=document.getElementById('dash-merma-table');
  mTbl.innerHTML=mermaF.length?`<table><tr><th>Fecha</th><th>Declarante</th><th>Servicio</th><th>Producto</th><th>Cantidad</th><th>Causa</th><th>€/u</th><th>Total €</th></tr>
  ${mermaF.map(m=>`<tr><td style="font-family:var(--font-mono);font-size:10px">${fmtDate(m.fecha)}</td><td>${m.nombre}</td><td>${m.servicio}</td><td style="font-weight:600">${m.producto}</td><td style="font-family:var(--font-mono)">${m.cantidad} ${m.unidad}</td><td style="font-size:11px">${m.causa}</td><td style="font-family:var(--font-mono)">${m.coste_unitario>0?m.coste_unitario+'€':'<span style="color:var(--text3)">—</span>'}</td><td style="font-family:var(--font-mono);color:var(--orange)">${m.coste_total>0?m.coste_total.toFixed(2)+'€':'<span style="color:var(--text3)">—</span>'}</td></tr>`).join('')}</table>`:'<div class="empty"><div class="empty-icon">🗑</div><div class="empty-text">Sin merma con este filtro</div></div>';

  // TAREAS POR DPTO
  const deptGrid=document.getElementById('dept-task-grid');
  deptGrid.innerHTML=DEPTS.map(d=>{
    const dt=tareas.filter(t=>t.dept_destino===d);
    const dp=dt.filter(t=>t.estado==='Pendiente').length;
    const de=dt.filter(t=>t.estado==='En proceso').length;
    const dc=dt.filter(t=>t.estado==='Completada').length;
    const dv=dt.filter(t=>t.estado==='Verificada').length;
    const c=DEPT_COLORS[d];
    return `<div class="dept-kpi" style="border-color:${c}44"><div class="dept-kpi-name" style="color:${c}">${DEPT_ICONS[d]} ${d}</div><div class="dept-kpi-val" style="color:${c}">${dt.length}</div><div class="dept-kpi-sub">${dp} pend. · ${de} proceso · ${dc} comp. · ${dv} verif.</div></div>`;
  }).join('');

  const tasksTbl=document.getElementById('dash-tasks-table');
  const openTasks=tareas.filter(t=>t.estado!=='Verificada').sort((a,b)=>{ const ps={Alta:3,Media:2,Baja:1}; return (ps[b.prioridad]||0)-(ps[a.prioridad]||0); });
  tasksTbl.innerHTML=openTasks.length?`<table><tr><th>Dpto.</th><th>Prioridad</th><th>Tarea</th><th>Origen</th><th>Deadline</th><th>Estado</th><th>Creada por</th></tr>
  ${openTasks.map(t=>`<tr><td>${deptBadge(t.dept_destino)}</td><td>${bPrio(t.prioridad)}</td><td style="font-weight:600;font-size:12px">${t.titulo}</td><td><span class="task-origin">${t.origen}</span></td><td style="font-family:var(--font-mono);font-size:10px;${isOverdue(t.deadline)?'color:var(--red);font-weight:700':''}">${fmtDate(t.deadline)}${isOverdue(t.deadline)?' ⚠':''}</td><td>${bTaskEstado(t.estado)}</td><td style="font-size:11px;color:var(--text3)">${t.creado_por}</td></tr>`).join('')}</table>`:'<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin tareas abiertas</div></div>';
  // ── FIO Table (Fase 2 — leen de tabla `fio` nueva) ──────────
  var fioEl2=document.getElementById('dash-fio-table');
  if(fioEl2){
    var fioKpiEl=document.getElementById('dash-fio-count');
    if(fioKpiEl) fioKpiEl.textContent='('+fios.length+' registros)';
    if(!fios.length){
      fioEl2.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin FIO en el periodo</div></div>';
    } else {
      var levelBadge = function(code, applied){
        var L = (typeof FIO_LEVELS !== 'undefined') ? FIO_LEVELS[code] : null;
        var pts = (applied!==undefined && applied!==null && !isNaN(parseFloat(applied))) ? parseFloat(applied) : (L?L.points:0);
        if(!L) return '<span class="badge b-gray">'+(code||'—')+'</span>';
        return '<span class="badge" style="background:'+L.color+'22;color:'+L.color+';border:1px solid '+L.color+'66;">'+L.name+' · '+pts+'p</span>';
      };
      var statusBadge = function(st){
        if(st==='Validado'||st==='Cerrado') return '<span class="badge b-green">'+st+'</span>';
        if(st==='Rechazado') return '<span class="badge b-gray">'+st+'</span>';
        if(st==='Disputado') return '<span class="badge b-yellow">'+st+'</span>';
        return '<span class="badge b-red">'+(st||'Registrado')+'</span>';
      };
      var fioRows2='';
      fios.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); }).forEach(function(f){
        fioRows2+='<tr>'
          +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(f.fecha)+'</td>'
          +'<td style="font-weight:600">'+formatDisplayValue(f.employee_name)+'</td>'
          +'<td>'+deptBadge(f.departamento)+'</td>'
          +'<td style="font-size:12px;max-width:240px">'+formatDisplayValue(f.fault_name)+'</td>'
          +'<td>'+levelBadge(f.level_code, f.applied_points)+'</td>'
          +'<td style="font-size:11px">'+formatDisplayValue(f.impact_area)+'</td>'
          +'<td style="font-size:11px;color:var(--text2);max-width:200px">'+formatDisplayValue(f.description)+'</td>'
          +'<td>'+statusBadge(f.status)+'</td>'
          +'<td style="font-size:11px;color:var(--text3)">'+formatDisplayValue(f.validated_by||'—')+'</td>'
          +'</tr>';
      });
      fioEl2.innerHTML='<div style="overflow-x:auto"><table><tr>'
        +'<th>Fecha</th><th>Empleado</th><th>Dept</th><th>Fallo</th>'
        +'<th>Nivel · Puntos</th><th>Impacto</th><th>Descripción</th><th>Estado</th><th>Validado por</th>'
        +'</tr>'+fioRows2+'</table></div>';
    }
  }

  // ── Incidencias table ──────────────────────────────────
  var inciEl2=document.getElementById('dash-inci-table');
  if(inciEl2){
    if(!incis.length){
      inciEl2.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin incidencias en el periodo</div></div>';
    } else {
      var iRows2='';
      incis.forEach(function(i){
        var sn='—'; try{if(i.staff_implicado_nombres){var ar=JSON.parse(i.staff_implicado_nombres);if(ar.length)sn=ar.join(', ');}}catch(e){}
        var infR2=i.informado_responsable==='si'?'<span class="badge b-green">✓ Sí</span>':'<span class="badge b-gray">No</span>';
        iRows2+='<tr>'
          +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(i.fecha)+'</td>'
          +'<td style="font-weight:600">'+i.nombre+'</td>'
          +'<td style="font-size:11px">'+sn+'</td>'
          +'<td>'+displayServicio(i.servicio||'—')+'</td>'
          +'<td style="max-width:180px;font-size:12px">'+i.descripcion+'</td>'
          +'<td style="font-size:11px">'+(i.accion_inmediata||'—')+'</td>'
          +'<td>'+infR2+'</td>'
          +'<td>'+bEstado(i.estado)+'</td>'
          +'</tr>';
      });
      inciEl2.innerHTML='<div style="overflow-x:auto"><table><tr>'
        +'<th>Fecha</th><th>Reporta</th><th>Staff implicado</th><th>Servicio</th><th>Descripción</th><th>Acción</th><th>Informado resp.</th><th>Estado</th>'
        +'</tr>'+iRows2+'</table></div>';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAESTRO
// Mapeo optgroup del select puesto → área canónica
var PUESTO_AREA_MAP = {
  'Cocina':['Jefe de Cocina','Segundo Jefe de Cocina','Cocinero','Cocinera','Ayudante de cocina','Friegue'],
  'Sala':['Jefe de Sala','Jefe de Sector','Camarero','Camarera','Ayudante camarero','Ayudante camarera'],
  'Recepción':['Jefe de Recepción','Subjefe de Recepción','Recepcionista','Ayudante de Recepción','Auditor de Noche'],
  'Housekeeping':['Gobernanta','Subgobernanta','Camarero de pisos','Camarera de pisos','Ayudante camarero de pisos','Ayudante camarera de pisos','Lavandería'],
  'Mantenimiento':['Jefe de Mantenimiento','Técnico'],
  'SYNCROLAB':['Club Manager','Coordinador(a) de Atención al Cliente','Coordinador(a) de Entrenadores','Coordinador(a) de Fisioterapeutas','Atención al Cliente','Entrenador(a)','Fisioterapeuta'],
  'F&B':['F&B Manager'],
  'Administración':['Administrador','Adjunto Directivo','Contable']
};
function _getAreaFromPuesto(puesto){
  var p=(puesto||'').trim();
  for(var area in PUESTO_AREA_MAP){
    if(PUESTO_AREA_MAP[area].indexOf(p)!==-1) return area;
  }
  return p; // fallback: usar el puesto como área
}
function _syncAreaFromPuesto(){
  var puestoEl=document.getElementById('emp-puesto');
  var areaEl=document.getElementById('emp-area');
  if(!puestoEl||!areaEl) return;
  areaEl.value=_getAreaFromPuesto(puestoEl.value);
}

async function renderMaestro(){
  var estadoFilt = (document.getElementById('maestro-estado-filter')||{value:'Activo'}).value;
  // Si el select aún no existe en DOM (primera carga), defecto = Activo
  if(estadoFilt === undefined) estadoFilt = 'Activo';

  // ── Ámbito de departamento ──────────────────────────────────────────
  // Admin / adjunto_directivo: ven todos. Jefe / coordinador / fb: solo su(s) depto(s).
  var seeAll  = canActAsAdmin(currentUser);
  var myDepts = seeAll ? ['*'] : getSupervisorDepartments(currentUser);
  function inMyScope(e){
    if(seeAll) return true;
    var ea = normalizeDeptName(e.area);
    return myDepts.some(function(d){ return normalizeDeptName(d) === ea; });
  }
  // Cabecera + botón CSV dinámicos según rol
  var ttlEl = document.getElementById('maestro-title');
  var subEl = document.getElementById('maestro-sub');
  if(ttlEl) ttlEl.textContent = '👥 Maestro';
  if(subEl) subEl.textContent = seeAll
    ? 'Gestión de empleados — todos los departamentos'
    : ('Tu departamento: ' + (myDepts.filter(function(d){return d!=='*';}).join(' / ') || '—'));
  var csvBtn = document.getElementById('maestro-csv-btn');
  if(csvBtn) csvBtn.style.display = isAdmin(currentUser) ? '' : 'none';

  var allEmps = (await getDB('employees'))
    .filter(inMyScope);
  var employees = estadoFilt === '' ? allEmps : allEmps.filter(function(e){ return e.estado === estadoFilt; });

  // Permisos de fila:
  //  - adjunto_directivo NO toca fila con rol=admin
  //  - admin/adjunto: todo · fb: todo salvo admin
  //  - jefe/coordinador (supervisor): solo empleados (rol=empleado) de SU ámbito
  function canEditRow(e){
    if(isAdjuntoDirectivo(currentUser) && e.rol === 'admin') return false;
    if(canActAsAdmin(currentUser)) return true;
    if(currentUser.rol === 'fb') return e.rol !== 'admin';
    if(isSupervisor(currentUser)) return e.rol === 'empleado' && inMyScope(e);
    return false;
  }
  function pinCell(e){
    // PIN visible SOLO para admin. Jefes y adjunto_directivo nunca lo ven.
    if(isAdmin(currentUser)) return '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">'+e.pin+'</span>';
    return '<span style="color:var(--text3)">●●●●</span>';
  }
  function accionesCell(e){
    if(!canEditRow(e)) return '<span style="font-size:11px;color:var(--text3);">🔒 Protegido</span>';
    var canToggle = canEditRow(e);  // quien puede editar puede dar baja/activar
    var html = '<button class="btn btn-secondary btn-sm" onclick="openEmpModal(\''+e.id+'\')">Editar</button> ';
    // Botón Restablecer PIN: admin siempre; jefe/supervisor solo para empleados de su ámbito
    var canResetPin = isAdmin(currentUser) || (isSupervisor(currentUser) && e.rol === 'empleado' && inMyScope(e)) || (currentUser.rol === 'fb' && e.rol !== 'admin');
    if(canResetPin){
      html += '<button class="btn btn-secondary btn-sm" onclick="openResetPinModalDirect(\''+e.id+'\',\''+e.nombre.replace(/'/g,"\\'")+'\',\''+(e.email||'')+'\')" title="Restablecer PIN" style="font-size:11px;">🔑 PIN</button> ';
    }
    // Botón Reenviar invitación: solo si tiene email
    if(e.email && (isAdmin(currentUser) || canActAsAdmin(currentUser) || (isSupervisor(currentUser) && inMyScope(e)))){
      html += '<button class="btn btn-secondary btn-sm" onclick="reenviarInvitacionDirect(\''+e.id+'\',\''+e.nombre.replace(/'/g,"\\'")+'\',\''+e.email+'\')" title="Reenviar invitación" style="font-size:11px;">📧</button> ';
    }
    if(canToggle){
      if(e.estado === 'Activo'){
        html += '<button class="btn btn-danger btn-sm" onclick="toggleEmp(\''+e.id+'\',\'Baja\')">Baja</button>';
      } else {
        html += '<button class="btn btn-success btn-sm" onclick="toggleEmp(\''+e.id+'\',\'Activo\')">Activar</button>';
        if(isAdmin(currentUser)){
          html += ' <button class="btn btn-sm" style="background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;" onclick="deleteEmp(\''+e.id+'\',\''+e.nombre.replace(/'/g,"\\'")+'\')" title="Eliminar definitivamente">🗑 Eliminar</button>';
        }
      }
    } else {
      html += '<span style="font-size:11px;color:var(--text3);">—</span>';
    }
    return html;
  }

  var rows = employees.length === 0
    ? '<tr><td colspan="11" style="text-align:center;color:var(--text3);padding:20px;">Sin empleados con este filtro</td></tr>'
    : employees.map(function(e){
        var emailCell = e.email
          ? '<span style="font-size:10px;color:var(--text3);">'+e.email+'</span>'
          : '<span style="font-size:10px;color:#f59e0b;">⚠ sin correo</span>';
        return '<tr>'
          +'<td><strong>'+e.nombre+'</strong></td>'
          +'<td>'+deptBadge(e.area)+'</td>'
          +'<td style="font-size:11px">'+e.puesto+'</td>'
          +'<td>'+(e.estado==='Activo'?'<span class="badge b-green">Activo</span>':e.estado==='Baja'?'<span class="badge b-red">Baja</span>':'<span class="badge b-yellow">'+e.estado+'</span>')+'</td>'
          +'<td>'+(e.responsable==1?'<span class="badge b-blue">SÍ</span>':'—')+'</td>'
          +'<td>'+(e.validador==1?'<span class="badge b-yellow">SÍ</span>':'—')+'</td>'
          +'<td style="font-family:var(--font-mono);font-size:10px">'+e.rol+'</td>'
          +'<td style="font-family:var(--font-mono)">'+(parseFloat(e.coste)>0?parseFloat(e.coste).toFixed(2)+'€':'—')+'</td>'
          +'<td>'+pinCell(e)+'</td>'
          +'<td>'+emailCell+'</td>'
          +'<td style="white-space:nowrap">'+accionesCell(e)+'</td>'
          +'</tr>';
      }).join('');

  document.getElementById('maestro-table').innerHTML = '<table><tr><th>Nombre</th><th>Área</th><th>Puesto</th><th>Estado</th><th>Resp.</th><th>Val.</th><th>Rol</th><th>€/h</th><th>PIN</th><th>Correo</th><th>Acciones</th></tr>'+rows+'</table>';
}
async function openEmpModal(empId){
  _editEmpId=empId||null;
  var isEdit = !!empId;
  var createDiv = document.getElementById('emp-pin-create');
  var statusDiv = document.getElementById('emp-pin-status');
  if(empId){
    const e=(await getDB('employees')).find(x=>x.id===empId); if(!e) return;
    document.getElementById('me-title').textContent='Editar: '+e.nombre;
    document.getElementById('emp-nombre').value=e.nombre;
    var emEl=document.getElementById('emp-email'); if(emEl) emEl.value=e.email||'';
    document.getElementById('emp-area').value=e.area;
    document.getElementById('emp-puesto').value=e.puesto;
    var pinIn = document.getElementById('emp-pin'); if(pinIn) pinIn.value='';
    document.getElementById('emp-coste').value=(e.coste&&parseFloat(e.coste)>0)?parseFloat(e.coste):'';
    document.getElementById('emp-estado').value=e.estado;
    document.getElementById('emp-resp').value=(e.responsable==1||e.responsable===true||e.responsable==='1'||e.responsable==='true')?'1':'0';
    document.getElementById('emp-val').value=(e.validador==1||e.validador===true||e.validador==='1'||e.validador==='true')?'1':'0';
    document.getElementById('emp-rol').value=e.rol;
    document.getElementById('emp-obs').value=e.obs||'';
    if(createDiv) createDiv.style.display='none';
    if(statusDiv) statusDiv.style.display='';
    var badge=document.getElementById('emp-pin-badge');
    if(badge){
      badge.className='badge '+(e.pin?'b-green':'b-yellow');
      badge.textContent=e.pin?'PIN configurado':'PIN pendiente';
    }
    var canReset = isAdmin(currentUser) ||
      (isSupervisor(currentUser) && e.rol==='empleado') ||
      (currentUser.rol==='fb' && e.rol!=='admin');
    var resetBtn=document.getElementById('emp-pin-reset-btn');
    if(resetBtn) resetBtn.style.display = canReset ? '' : 'none';
    var reinvBtn=document.getElementById('emp-reinvite-btn');
    if(reinvBtn){
      reinvBtn.style.display = e.email ? '' : 'none';
      reinvBtn.onclick = function(){ reenviarInvitacionDirect(empId, e.nombre, e.email); };
    }
    window._resetPinEmpId   = empId;
    window._resetPinEmpName = e.nombre;
    window._resetPinEmpEmail= e.email||'';
    _renderEmpIpPanel(e);
  } else {
    document.getElementById('me-title').textContent='Nuevo Empleado';
    ['emp-nombre','emp-email','emp-pin','emp-coste','emp-obs'].forEach(function(id){var el=document.getElementById(id); if(el) el.value='';});
    ['emp-puesto','emp-estado'].forEach(function(id){ var el=document.getElementById(id); if(el) el.selectedIndex=0; });
    document.getElementById('emp-area').value='';
    document.getElementById('emp-resp').value='0';
    document.getElementById('emp-val').value='0';
    document.getElementById('emp-rol').value='empleado';
    if(createDiv) createDiv.style.display='';
    if(statusDiv) statusDiv.style.display='none';
    window._resetPinEmpId=null; window._resetPinEmpName=''; window._resetPinEmpEmail='';
    _renderEmpIpPanel(null);
  }
  _syncAreaFromPuesto();

  // ── Restricciones UI según rol del usuario actual ─────────────────────
  // Para jefes/supervisores: filtrar puestos por su departamento, ocultar
  // roles superiores, y bloquear "Puede validar"
  _aplicarRestriccionesModalEmp();

  document.getElementById('modal-empleado').classList.add('open');
}

// ── IP AUTORIZADA (employee_ips) — solo admin/adjunto ──────────────────
async function _renderEmpIpPanel(emp){
  var modal = document.getElementById('modal-empleado');
  if(!modal) return;
  var panel = document.getElementById('emp-ip-panel');
  if(!emp || !canActAsAdmin(currentUser)){ if(panel) panel.style.display='none'; return; }
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'emp-ip-panel';
    panel.className = 'fg sp2';
    var grid = modal.querySelector('.grid2');
    if(grid) grid.appendChild(panel); else modal.querySelector('.modal').appendChild(panel);
  }
  panel.style.display='';
  panel.innerHTML = '<label>IP AUTORIZADA <span style="font-size:11px;color:var(--text3);font-weight:400;text-transform:none;letter-spacing:0;">— máx. 2 IPs · acceso al portal desde fuera del recinto</span></label>'
    + '<div id="emp-ip-list" style="margin:6px 0;">Cargando…</div>'
    + '<div style="display:flex;gap:8px;">'
    +   '<input type="text" id="emp-ip-input" placeholder="Ej. 45.153.97.234" autocomplete="off" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text1);font-size:13px;">'
    +   '<button type="button" class="btn btn-secondary btn-sm" onclick="addEmpIp(\''+emp.id+'\',\''+String(emp.nombre||'').replace(/'/g,"\\'")+'\')">➕ Añadir IP</button>'
    + '</div>';
  _loadEmpIpList(emp.id);
}
async function _loadEmpIpList(empId){
  var box = document.getElementById('emp-ip-list');
  if(!box) return;
  var rows = [];
  try { rows = (await getDB('employee_ips')).filter(function(r){ return r.employee_id===empId && r.active!==false; }); } catch(e){}
  if(!rows.length){ box.innerHTML = '<span style="font-size:12px;color:var(--text3);">Sin IP autorizada. Solo entra desde la red del recinto.</span>'; return; }
  box.innerHTML = rows.map(function(r){
    return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">'
      + '<span style="font-family:var(--font-mono);font-size:12px;color:var(--text1);">'+r.ip+'</span>'
      + (r.label?'<span style="font-size:11px;color:var(--text3);">'+r.label+'</span>':'')
      + '<button type="button" class="btn btn-danger btn-sm" style="font-size:11px;margin-left:auto;" onclick="removeEmpIp(\''+r.id+'\',\''+empId+'\',\''+String(r.ip).replace(/'/g,"\\'")+'\')">Quitar</button>'
      + '</div>';
  }).join('');
}
async function addEmpIp(empId, empNombre){
  if(!canActAsAdmin(currentUser)){ toast('Solo admin/adjunto gestiona IPs','err'); return; }
  var inp = document.getElementById('emp-ip-input');
  var ip = ((inp&&inp.value)||'').trim();
  var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if(!m || m.slice(1).some(function(o){ return +o>255; })){ toast('IP no válida (formato x.x.x.x)','err'); return; }
  // Máximo 2 IPs activas por empleado
  var existing = (await getDB('employee_ips')).filter(function(r){ return r.employee_id===empId && r.active!==false; });
  if(existing.length >= 2){ toast('Máximo 2 IPs por empleado. Quita una antes de añadir otra.','err'); return; }
  var dup = existing.some(function(r){ return r.ip===ip; });
  if(dup){ toast('Esa IP ya está autorizada','err'); return; }
  var row = { id:genId(), employee_id:empId, nombre:empNombre||'', ip:ip, label:'', active:true, ts:localTs() };
  var res = await dbInsert('employee_ips', row);
  if(!res){ toast('Error al guardar IP — revisa el esquema de employee_ips','err'); return; }
  await auditLog('EMP_IP_ADD', (empNombre||empId)+' → '+ip);
  invalidateCache('employee_ips');
  if(inp) inp.value='';
  await _loadEmpIpList(empId);
  toast('IP autorizada: '+ip,'ok');
}
async function removeEmpIp(rowId, empId, ip){
  if(!canActAsAdmin(currentUser)){ toast('Solo admin/adjunto gestiona IPs','err'); return; }
  if(!confirm('¿Quitar la IP '+ip+'? Dejará de poder entrar desde fuera del recinto con esa IP.')) return;
  await auditLog('EMP_IP_REMOVE', empId+' → '+ip);
  var res = await dbUpdate('employee_ips', rowId, { active:false });
  if(!res){ toast('Error al quitar IP','err'); return; }
  invalidateCache('employee_ips');
  await _loadEmpIpList(empId);
  toast('IP retirada','ok');
}

// Aplica restricciones visuales al modal según el rol del usuario actual
function _aplicarRestriccionesModalEmp(){
  var esJefe = isSupervisor(currentUser) && !isAdjuntoDirectivo(currentUser) && !isAdmin(currentUser) && currentUser.rol !== 'fb';

  // ── 1. PUESTO: filtrar optgroups por departamento del jefe ───────────
  var puestoSel = document.getElementById('emp-puesto');
  if(puestoSel){
    var grupos = puestoSel.querySelectorAll('optgroup');
    if(esJefe){
      var misDeptos = getSupervisorDepartments(currentUser).map(function(d){ return d.toLowerCase(); });
      // Mapa optgroup label → área normalizada
      var labelAreaMap = {
        'cocina':             'cocina',
        'sala':               'sala',
        'recepción / hotel':  'recepción',
        'recepcion / hotel':  'recepción',
        'housekeeping':       'housekeeping',
        'mantenimiento':      'mantenimiento',
        'syncrolab':          'syncrolab',
        'dirección':          'administración',
        'direccion':          'administración',
        'f&b (superior de cocina y sala)': 'f&b'
      };
      grupos.forEach(function(og){
        var lbl = (og.getAttribute('label')||'').toLowerCase();
        var area = labelAreaMap[lbl] || lbl;
        var visible = misDeptos.some(function(d){ return d === area || area.indexOf(d) !== -1 || d.indexOf(area) !== -1; });
        og.style.display = visible ? '' : 'none';
        og.querySelectorAll('option').forEach(function(o){ o.disabled = !visible; });
      });
      // Si el puesto seleccionado actualmente no pertenece al depto del jefe, resetear al primer puesto visible
      var currentOpt = puestoSel.options[puestoSel.selectedIndex];
      if(currentOpt && currentOpt.disabled){
        var firstVisible = Array.from(puestoSel.options).find(function(o){ return !o.disabled && o.value; });
        if(firstVisible) puestoSel.value = firstVisible.value;
        _syncAreaFromPuesto();
      }
    } else {
      // admin/adjunto: mostrar todo
      grupos.forEach(function(og){
        og.style.display = '';
        og.querySelectorAll('option').forEach(function(o){ o.disabled = false; });
      });
    }
  }

  // ── 2. ROL SISTEMA: ocultar roles superiores a jefes ────────────────
  var rolSel = document.getElementById('emp-rol');
  if(rolSel){
    var rolesPermitidos = esJefe ? ['empleado'] :
      (currentUser.rol === 'fb') ? ['empleado','jefe'] :
      isAdjuntoDirectivo(currentUser) ? ['empleado','jefe','adjunto'] :
      null; // admin: todos visibles
    Array.from(rolSel.options).forEach(function(opt){
      if(rolesPermitidos){
        opt.style.display = rolesPermitidos.indexOf(opt.value) !== -1 ? '' : 'none';
        opt.disabled      = rolesPermitidos.indexOf(opt.value) === -1;
      } else {
        opt.style.display = '';
        opt.disabled = false;
      }
    });
    // Si el rol seleccionado quedó deshabilitado, forzar al primero permitido
    if(rolSel.options[rolSel.selectedIndex] && rolSel.options[rolSel.selectedIndex].disabled){
      var firstOk = Array.from(rolSel.options).find(function(o){ return !o.disabled; });
      if(firstOk) rolSel.value = firstOk.value;
    }
    // Bloquear el select si solo hay una opción visible
    rolSel.disabled = esJefe;
  }

  // ── 3. PUEDE VALIDAR: solo adjunto_directivo y admin pueden cambiarlo ─
  var valSel = document.getElementById('emp-val');
  if(valSel){
    var puedeEditarValidador = isAdmin(currentUser) || isAdjuntoDirectivo(currentUser);
    valSel.disabled = !puedeEditarValidador;
    valSel.title = puedeEditarValidador ? '' : 'Solo Adjunto Directivo o Administrador pueden modificar este campo';
    // Estilo visual para indicar que está bloqueado
    valSel.style.opacity = puedeEditarValidador ? '' : '0.5';
    valSel.style.cursor  = puedeEditarValidador ? '' : 'not-allowed';
  }
}

async function enviarInvitacionEmpleado(emp){
  // emp: {nombre, email, pin, esReenvio?}
  if(!emp || !emp.email) return;
  var esReenvio = !!emp.esReenvio;
  if(!SYNCRO_EMAIL_ENDPOINT){
    var msg = esReenvio ? 'Invitación NO reenviada: configura el webhook n8n' : 'Empleado creado. Invitación pendiente: configura el webhook n8n';
    toast(msg,'err');
    await auditLog('INVITE_EMP_PENDING','Invitación NO enviada (webhook sin configurar) — '+emp.nombre+' <'+emp.email+'>');
    return;
  }
  try{
    var res = await fetch(SYNCRO_EMAIL_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        tipo: esReenvio ? 'reenvio_invitacion' : 'nueva_invitacion',
        nombre: emp.nombre,
        email: emp.email,
        pin: emp.pin,
        url: 'https://syncro-shift.vercel.app',
        enviado_por: (currentUser&&currentUser.nombre)||'?',
        ts: localTs()
      })
    });
    if(!res.ok){
      toast('Falló el envío de la invitación ('+res.status+')','err');
      await auditLog('INVITE_EMP_FAIL',emp.nombre+' <'+emp.email+'> status '+res.status);
      return;
    }
    toast((esReenvio?'Invitación reenviada':'Invitación enviada')+' a '+emp.email,'ok');
    await auditLog('INVITE_EMP',(esReenvio?'Reinvitación':'Invitación')+' enviada a '+emp.nombre+' <'+emp.email+'>');
  }catch(err){
    toast('Error de red al enviar la invitación','err');
    await auditLog('INVITE_EMP_ERR',emp.nombre+' <'+emp.email+'> '+((err&&err.message)||err));
  }
}

// ── Abrir modal de reset PIN desde tabla (botón 🔑 PIN) ─────────────────
function openResetPinModalDirect(empId, empNombre, empEmail){
  window._resetPinEmpId   = empId;
  window._resetPinEmpName = empNombre;
  window._resetPinEmpEmail= empEmail||'';
  openResetPinModal();
}
function openResetPinModal(){
  var empId    = window._resetPinEmpId;
  var empName  = window._resetPinEmpName;
  var empEmail = window._resetPinEmpEmail;
  if(!empId){ toast('Sin empleado seleccionado','err'); return; }
  if(!isAdmin(currentUser) && !isSupervisor(currentUser) && currentUser.rol!=='fb'){
    toast('Sin permisos para restablecer PIN','err'); return;
  }
  document.getElementById('reset-pin-emp-nombre').textContent = 'Empleado: '+empName;
  document.getElementById('reset-pin-value').value='';
  document.getElementById('reset-pin-confirm').value='';
  var emailRow   = document.getElementById('reset-pin-email-row');
  var noEmailRow = document.getElementById('reset-pin-noemail-row');
  var emailAddr  = document.getElementById('reset-pin-email-addr');
  if(empEmail){
    if(emailAddr)  emailAddr.textContent=empEmail;
    if(emailRow)   emailRow.style.display='';
    if(noEmailRow) noEmailRow.style.display='none';
  } else {
    if(emailRow)   emailRow.style.display='none';
    if(noEmailRow) noEmailRow.style.display='';
  }
  document.getElementById('modal-reset-pin').classList.add('open');
}
async function confirmarResetPin(){
  var empId    = window._resetPinEmpId;
  var empName  = window._resetPinEmpName||'?';
  var empEmail = window._resetPinEmpEmail||'';
  var newPin   = (document.getElementById('reset-pin-value').value||'').trim();
  var confPin  = (document.getElementById('reset-pin-confirm').value||'').trim();
  if(!newPin || newPin.length<4){ toast('PIN mínimo 4 dígitos','err'); return; }
  if(newPin !== confPin){ toast('Los PIN no coinciden','err'); return; }
  var employees = await getDB('employees');
  if(employees.find(function(e){ return e.pin===newPin && e.id!==empId; })){
    toast('PIN ya en uso por otro empleado','err'); return;
  }
  var patchPayload = {
    pin: newPin,
    pin_updated_at: localTs(),
    pin_updated_by: (currentUser&&currentUser.nombre)||'?'
  };
  var patchRes = await fetch(
    SUPABASE_URL+'/rest/v1/employees?id=eq.'+encodeURIComponent(empId),
    { method:'PATCH',
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
               'Content-Type':'application/json','Prefer':'return=minimal'},
      body: JSON.stringify(patchPayload) }
  );
  if(!patchRes.ok){
    var errTxt=await patchRes.text();
    toast('Error al guardar el nuevo PIN','err');
    console.error('[RESET PIN ERROR]',patchRes.status,errTxt);
    return;
  }
  invalidateCache('employees');
  await auditLog('RESET_PIN',((currentUser&&currentUser.nombre)||'?')+' restablecio PIN de '+empName+' (id:'+empId+')');
  closeModal('modal-reset-pin');
  if(empEmail){ await enviarNotificacionCambioPin({nombre:empName,email:empEmail,pin:newPin}); }
  else { toast('PIN actualizado. Sin correo registrado — comunica el nuevo PIN presencialmente','err'); }
  toast('PIN de '+empName+' actualizado correctamente','ok');
  await renderMaestro();
}
async function enviarNotificacionCambioPin(emp){
  if(!emp.email) return;
  if(!SYNCRO_EMAIL_ENDPOINT){
    await auditLog('NOTIFY_PIN_PENDING','Notificación cambio PIN NO enviada (webhook sin configurar) — '+emp.nombre);
    return;
  }
  try{
    var res = await fetch(SYNCRO_EMAIL_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        tipo: 'pin_cambiado',
        nombre: emp.nombre,
        email: emp.email,
        pin: emp.pin,
        url: 'https://syncro-shift.vercel.app',
        enviado_por: (currentUser&&currentUser.nombre)||'?',
        ts: localTs()
      })
    });
    if(!res.ok){ await auditLog('NOTIFY_PIN_FAIL','email:'+emp.email+' status:'+res.status); }
    else { await auditLog('NOTIFY_PIN_SENT','Notificación cambio PIN enviada a '+emp.nombre+' <'+emp.email+'>'); }
  }catch(err){ await auditLog('NOTIFY_PIN_ERR',emp.email+' '+((err&&err.message)||err)); }
}
async function reenviarInvitacion(){
  var empId    = window._resetPinEmpId;
  var empName  = window._resetPinEmpName||'?';
  var empEmail = window._resetPinEmpEmail||'';
  if(!empEmail){ toast('Este empleado no tiene correo registrado','err'); return; }
  var emps = await getDB('employees');
  var emp  = emps.find(function(e){ return e.id===empId; });
  if(!emp){ toast('Empleado no encontrado','err'); return; }
  await enviarInvitacionEmpleado({nombre:emp.nombre, email:emp.email, pin:emp.pin, esReenvio:true});
}
async function reenviarInvitacionDirect(empId, empNombre, empEmail){
  if(!empEmail){ toast('Este empleado no tiene correo registrado','err'); return; }
  var emps = await getDB('employees');
  var emp  = emps.find(function(e){ return e.id===empId; });
  if(!emp){ toast('Empleado no encontrado','err'); return; }
  await enviarInvitacionEmpleado({nombre:emp.nombre, email:emp.email, pin:emp.pin, esReenvio:true});
}

async function saveEmpleado(){
  const nombre=document.getElementById('emp-nombre').value.trim();
  // PIN solo se lee en creación; en edición se gestiona desde el modal de reset
  const isEdit = !!_editEmpId;
  const pin = isEdit ? '' : ((document.getElementById('emp-pin')||{}).value||'').trim();
  const email=((document.getElementById('emp-email')||{}).value||'').trim();
  if(!nombre){toast('Nombre obligatorio','err');return;}
  if(!isEdit){
    // PIN obligatorio en creación; correo es opcional
    if(!pin||pin.length<4){toast('PIN mínimo 4 dígitos','err');return;}
  }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Correo electrónico no válido','err');return;}
  const employees=await getDB('employees');
  if(!isEdit && employees.find(function(e){return e.pin===pin&&e.id!==_editEmpId;})){toast('PIN ya en uso','err');return;}
  if(email && employees.find(function(e){return e.email&&e.email.toLowerCase()===email.toLowerCase()&&e.id!==_editEmpId;})){toast('Correo ya en uso','err');return;}
  // Guardar email anterior (para detectar cambio en edición)
  var emailAnterior = '';
  if(isEdit){
    var empActual = employees.find(function(e){ return e.id===_editEmpId; });
    emailAnterior = (empActual&&empActual.email)||'';
  }
  // Derivar área del puesto (siempre — así puesto y área son siempre coherentes)
  _syncAreaFromPuesto();
  var selectedArea = document.getElementById('emp-area').value || _getAreaFromPuesto(document.getElementById('emp-puesto').value);
  var selectedRol  = document.getElementById('emp-rol').value;

  // ─── Validación de ámbito de creación/edición según rol del usuario actual ───
  // Admin: sin restricciones
  // Adjunto Directivo: todo excepto tocar admin
  // F&B Manager: solo crea/edita en Sala / Cocina / Friegue, rol ≤ supervisor
  // Coord_*, chef, jefe_recepcion, gobernante, jefe_departamento, supervisor, mantenimiento:
  //   solo crea/edita en SU dept (según SUPERVISOR_DEPT_MAP), rol = empleado
  if(!isAdmin(currentUser)){
    if(selectedRol === 'admin'){
      toast('Solo un Administrador puede crear/modificar usuarios admin','err'); return;
    }
    if(isAdjuntoDirectivo(currentUser)){
      // todo permitido excepto admin (validado arriba)
    } else if(currentUser.rol === 'fb'){
      var fbAreas = ['Sala','Cocina','Friegue'];
      if(fbAreas.indexOf(selectedArea) === -1){
        toast('F&B Manager solo puede gestionar empleados de Sala / Cocina / Friegue','err'); return;
      }
      if(['adjunto_directivo','admin','fb','chef','jefe_recepcion','gobernante','subgobernante','jefe_mantenimiento','coord_recepcion_syncrolab','coord_entrenadores','coord_fisioterapeutas','mantenimiento'].indexOf(selectedRol) !== -1){
        toast('F&B Manager solo puede asignar roles base/supervisor/jefe_departamento','err'); return;
      }
    } else if(isSupervisor(currentUser)){
      var allowedAreas = getSupervisorDepartments(currentUser);
      var sa = String(selectedArea||'').trim().toLowerCase();
      var ok = allowedAreas.some(function(d){ return String(d||'').trim().toLowerCase() === sa; });
      if(!ok){
        toast('Solo puedes gestionar empleados de tu departamento ('+(allowedAreas.join(' / ')||'sin dept')+')','err'); return;
      }
      if(selectedRol !== 'empleado'){
        toast('Como jefe de departamento solo puedes crear/editar empleados con rol Empleado','err'); return;
      }
    } else {
      toast('No tienes permisos para gestionar empleados','err'); return;
    }
  }

  if(_editEmpId){
    var origEmp = employees.find(e=>e.id===_editEmpId);
    if(origEmp && origEmp.rol==='admin' && !canManageAdminUsers(currentUser)){
      toast('Solo un admin puede modificar a otro admin','err'); return;
    }
  }
  var costeVal = parseFloat(document.getElementById('emp-coste').value)||0;
  // Explicit payload - ensure coste is always sent as number
  var empPayload = {
    nombre: nombre, area: document.getElementById('emp-area').value,
    puesto: document.getElementById('emp-puesto').value,
    coste: isNaN(costeVal)?0:parseFloat(costeVal)||0,
    estado: document.getElementById('emp-estado').value,
    responsable: parseInt(document.getElementById('emp-resp').value)||0,
    validador: parseInt(document.getElementById('emp-val').value)||0,
    rol: document.getElementById('emp-rol').value,
    obs: (document.getElementById('emp-obs')||{value:''}).value.trim(),
    email: email
    // PIN no se incluye en PATCH — se cambia solo desde confirmarResetPin()
  };
  if(!isEdit) empPayload.pin = pin;  // solo en creación
  if(_editEmpId){
    // Direct fetch PATCH — bypasses sbRequest abstraction for reliability
    var patchRes = await fetch(
      SUPABASE_URL + '/rest/v1/employees?id=eq.' + encodeURIComponent(_editEmpId),
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(empPayload)
      }
    );
    console.log('[EMP PATCH] id:', _editEmpId, 'coste:', empPayload.coste, 'status:', patchRes.status);
    if(!patchRes.ok){
      var errTxt = await patchRes.text();
      console.error('[EMP PATCH ERROR]', patchRes.status, errTxt);
      toast('Error Supabase: ' + patchRes.status + ' — ' + errTxt.substring(0,60), 'err');
      return;
    }
  } else {
    empPayload.id = 'E' + Date.now();
    empPayload.fecha_alta = today();
    empPayload.created_at = localTs();
    var insRes = await dbInsert('employees', empPayload);
    if(insRes === null){ toast('Error al crear el empleado (revisa columna email en Supabase)','err'); return; }
    // Invitación en alta solo si hay correo (correo es opcional)
    if(email){ enviarInvitacionEmpleado({nombre:nombre, email:email, pin:pin}); }
  }
  invalidateCache('employees');
  var auditAction = isEdit ? 'EDIT_EMP' : 'CREATE_EMP';
  var auditDetail = nombre + (isEdit?' — editado':' — creado') + ' coste:'+costeVal+'€/h por '+(currentUser&&currentUser.nombre||'?');
  auditLog(auditAction, auditDetail);

  // ── Lógica de correo en edición ─────────────────────────────────────────
  // Caso A: se añadió correo por primera vez → enviar invitación con PIN actual
  // Caso B: se cambió el correo → enviar invitación al nuevo correo con PIN actual
  // En ambos casos necesitamos el PIN actual del empleado (no viaja en el payload de edición)
  if(isEdit && email && email.toLowerCase() !== emailAnterior.toLowerCase()){
    // Correo nuevo o cambiado — leer PIN actual de Supabase
    var empsActualizados = await getDB('employees');
    invalidateCache('employees'); // forzar recarga
    empsActualizados = await getDB('employees');
    var empActualizado = empsActualizados.find(function(e){ return e.id===_editEmpId; });
    var pinActual = (empActualizado&&empActualizado.pin)||'';
    if(pinActual){
      var esCorreoNuevo = !emailAnterior;
      enviarInvitacionEmpleado({
        nombre: nombre,
        email: email,
        pin: pinActual,
        esReenvio: !esCorreoNuevo  // false = nueva invitación, true = correo cambiado
      });
      auditLog('EMAIL_CHANGED', nombre+' — correo '+(esCorreoNuevo?'añadido':'cambiado')+' → '+email);
    }
  }

  closeModal('modal-empleado');
  var sinCorreo = !email && isEdit;
  setTimeout(async function(){
    invalidateCache('employees');
    await renderMaestro();
    var msg = isEdit ? 'Empleado actualizado correctamente' : 'Empleado creado correctamente';
    toast(msg,'ok');
    if(sinCorreo){
      setTimeout(function(){ toast('⚠ Este empleado no tiene correo — no podrás enviarle la invitación','err'); }, 1200);
    }
  }, 200);
}
function filterMaestro(){
  var query = ((document.getElementById('maestro-search')||{}).value||'').toLowerCase();
  var estadoFilt = (document.getElementById('maestro-estado-filter')||{}).value||'';
  var table = document.getElementById('maestro-table');
  if(!table) return;
  // Si hay filtro de estado, re-renderizar (los datos cambian en DB); si solo texto, filtrar DOM
  var hasEstadoChange = estadoFilt !== undefined;
  if(hasEstadoChange && query === ''){
    // Re-render completo para respetar filtro de estado desde DB
    renderMaestro(); return;
  }
  // Filtro DOM rápido (búsqueda de texto — la tabla ya tiene el estado correcto)
  table.querySelectorAll('tbody tr, tr').forEach(function(row, i){
    if(i === 0) return; // header
    var txt = (row.textContent||'').toLowerCase();
    row.style.display = (query === '' || txt.indexOf(query) !== -1) ? '' : 'none';
  });
}
async function toggleEmp(empId, newEstado){
  // BUG-EMP-01 fix: usar dbUpdate puntual en lugar de setDB (bulk upsert)
  var res = await fetch(
    SUPABASE_URL + '/rest/v1/employees?id=eq.' + encodeURIComponent(empId),
    { method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
                 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ estado: newEstado }) }
  );
  if(!res.ok){ toast('Error al actualizar estado', 'err'); return; }
  await auditLog('EMP_ESTADO', currentUser.nombre + ' cambió estado de ' + empId + ' → ' + newEstado);
  invalidateCache('employees');
  // Si ponemos en Baja → cambiar filtro a "Solo Baja" para que aparezca el botón Eliminar
  // Si activamos → volver a "Solo Activos"
  var fEl = document.getElementById('maestro-estado-filter');
  if(fEl) fEl.value = (newEstado === 'Baja') ? 'Baja' : 'Activo';
  await renderMaestro();
  toast('Estado: ' + newEstado, 'ok');
}

async function deleteEmp(empId, empNombre){
  if(!isAdmin(currentUser)){ toast('Solo admin puede eliminar empleados', 'err'); return; }
  var ok = confirm('¿Eliminar definitivamente a "' + empNombre + '"?\nEsta acción no se puede deshacer.\nSolo es posible si el empleado está en Baja.');
  if(!ok) return;
  // Verificar que sigue en Baja antes de borrar
  var emps = await getDB('employees');
  var emp = emps.find(function(e){ return e.id === empId; });
  if(!emp){ toast('Empleado no encontrado', 'err'); return; }
  if(emp.estado !== 'Baja'){ toast('Solo se pueden eliminar empleados en estado Baja', 'err'); return; }
  // Audit log ANTES del delete (regla: audit_log antes de DELETE)
  await auditLog('DELETE_EMP', currentUser.nombre + ' eliminó empleado: ' + empNombre + ' (id:' + empId + ', área:' + emp.area + ', puesto:' + emp.puesto + ')');
  var delRes = await sbRequest('DELETE', 'employees', null, 'id=eq.' + encodeURIComponent(empId));
  if(delRes === null){ toast('Error al eliminar empleado', 'err'); return; }
  invalidateCache('employees');
  await renderMaestro();
  toast(empNombre + ' eliminado definitivamente', 'ok');
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORT
function toCSV(rows,cols){ const h=cols.join(';'); const b=rows.map(r=>cols.map(c=>{ const v=r[c]??''; return typeof v==='string'&&(v.includes(';')||v.includes('\n'))?`"${v}"`:v; }).join(';')); return [h,...b].join('\n'); }
function dl(content,filename){ const blob=new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); }
async function exportCSV(type){
  if(type==='employees') { var _empCols = isAdmin(currentUser) ? ['id','nombre','email','area','puesto','pin','estado','responsable','validador','rol','coste','fecha_alta'] : ['id','nombre','email','area','puesto','estado','responsable','validador','rol','coste','fecha_alta']; dl(toCSV(await getDB('employees'),_empCols),'BDS_Maestro.csv'); }
  if(type==='shifts') { dl(toCSV(await getDB('shifts'),['id','fecha','servicio','nombre','area','puesto','horas','responsable_nombre','follow_up','merma_declarada','incidencia_declarada','observacion','estado','validado_por','validado_ts','comentario_validador','created_at']),'BDS_Input.csv'); }
  if(type==='incidencias') { dl(toCSV(await getDB('incidencias'),['id','fecha','servicio','nombre','categoria','severidad','descripcion','accion_inmediata','requiere_formacion','requiere_disciplina','estado','created_at']),'BDS_Incidencias.csv'); }
  if(type==='merma') { dl(toCSV(await getDB('merma'),['id','fecha','servicio','nombre','producto','cantidad','unidad','causa','obs','coste_unitario','coste_total','created_at']),'BDS_Merma.csv'); }
  if(type==='tareas') { const tareas=(await getDB('tareas')).map(function(t){return {...t,estado:normalizeTaskState(t.estado),descripcion:formatDisplayValue(t.descripcion)};}); dl(toCSV(tareas,['id','titulo','dept_destino','dept_origen','prioridad','deadline','descripcion','origen','estado','creado_por','completada_por','completada_ts','verificada_por','verificada_ts','created_at']),'BDS_Tareas.csv'); }
  if(type==='horas') { const shifts=await getDB('shifts'); const employees=await getDB('employees'); const map={}; shifts.forEach(s=>{ if(!map[s.employee_id]){ const e=employees.find(x=>x.id===s.employee_id)||{}; map[s.employee_id]={nombre:s.nombre,puesto:s.puesto,horas:0,turnos:0,coste_hora:e.coste||0}; } map[s.employee_id].horas+=parseFloat(s.horas)||0; map[s.employee_id].turnos++; }); const rows=Object.values(map).map(r=>({...r,coste_total:(r.horas*r.coste_hora).toFixed(2)})); dl(toCSV(rows,['nombre','puesto','turnos','horas','coste_hora','coste_total']),'BDS_Horas.csv'); }
  toast('CSV descargado','ok');
}
async function exportFiltered(){ const desde=document.getElementById('exp-desde').value; const hasta=document.getElementById('exp-hasta').value; let shifts=await getDB('shifts'); if(desde) shifts=shifts.filter(s=>s.fecha>=desde); if(hasta) shifts=shifts.filter(s=>s.fecha<=hasta); dl(toCSV(shifts,['id','fecha','servicio','nombre','area','puesto','horas','responsable_nombre','follow_up','merma_declarada','incidencia_declarada','observacion','estado','validado_por','validado_ts','created_at']),`BDS_Export_${desde||'inicio'}_${hasta||'hoy'}.csv`); toast('CSV filtrado descargado','ok'); }
async function exportBackup(){
  const tables={
    employees: await getDB('employees'),
    shifts: await getDB('shifts'),
    merma: await getDB('merma'),
    incidencias: await getDB('incidencias'),
    tareas: await getDB('tareas')
  };
  const backup={schema_version:SCHEMA_VERSION,exported_at:new Date().toISOString(),tables};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='BDS_Backup_v'+SCHEMA_VERSION+'_'+today()+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('Backup JSON exportado','ok');
}
async function importBackup(event){
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async function(e){
    try{
      const backup=JSON.parse(e.target.result);
      if(!backup.tables) throw new Error('Formato invalido');
      for(const [table,rows] of Object.entries(backup.tables)){
        if(!Array.isArray(rows)) continue;
        for(const row of rows){ try{ await dbInsert(table,row); }catch(e2){} }
        invalidateCache(table);
      }
      toast('Backup importado','ok');
    }catch(err){ toast('Error: '+err.message,'err'); }
    event.target.value='';
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL HELPERS
function closeModal(id){ var m=document.getElementById(id); if(!m) return; m.classList.remove('open'); if(id==='modal-caja'){ m.querySelectorAll('input,textarea,select').forEach(function(el){ el.readOnly=false; el.style.pointerEvents=''; }); var btn=document.getElementById('caja-btn-guardar'); if(btn) btn.style.display=''; } if(id==='modal-validar') validatingShiftId=null; if(id==='modal-empleado') _editEmpId=null; }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal(e.currentTarget.id); }));
function toast(msg,type='ok'){ const c=document.getElementById('toast-c'); const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg; c.appendChild(t); setTimeout(()=>{ t.style.animation='toastOut .3s ease forwards'; setTimeout(()=>{ if(c.contains(t)) c.removeChild(t); },300); },3200); }

// ═══════════════════════════════════════════════════════════════════════
// MODAL UNIFICADO ITEMS (gestión / incidencia) — empleado vs jefe/admin
// Abierto desde badge clicable (.estado-clickable con data-itemtype + data-itemid)
// ═══════════════════════════════════════════════════════════════════════
var _itemModalCtx = null;

function _itemEnsureOverlay(){
  var ov = document.getElementById('modal-item');
  if(ov) return ov;
  ov = document.createElement('div');
  ov.id = 'modal-item';
  ov.className = 'modal-overlay';
  ov.innerHTML = '<div class="modal" style="max-width:560px;">'
    + '<div class="modal-h"><h3 id="mi-title">—</h3>'
    + '<button class="modal-x" onclick="closeModal(\'modal-item\')">✕</button></div>'
    + '<div class="modal-b" id="mi-body"></div>'
    + '<div class="modal-f" id="mi-foot"></div>'
    + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-item'); });
  return ov;
}

// ── Filas extra de gestión (prioridad, habitación, nº reserva, leído por) ──
function _gestionExtraRows(rec){
  var prioMap = {alta:'🔴 Alta', media:'🟡 Media', baja:'🟢 Baja'};
  var prio = prioMap[(rec.prioridad||'').toLowerCase()] || formatDisplayValue(rec.prioridad||'media');
  var out = '<div><b>Prioridad:</b><br>'+prio+'</div>';
  if(rec.habitacion) out += '<div><b>Habitación:</b><br>🛏 '+formatDisplayValue(rec.habitacion)+'</div>';
  if(rec.num_reserva) out += '<div><b>Nº reserva:</b><br><span style="font-family:var(--font-mono);font-size:11px;">'+formatDisplayValue(rec.num_reserva)+'</span></div>';
  var leido = Array.isArray(rec.leido_por) ? rec.leido_por : [];
  if(leido.length){
    var nombres = leido.map(function(l){ return (l && l.nombre) ? l.nombre : (typeof l==='string'?l:''); }).filter(Boolean).join(', ');
    out += '<div style="grid-column:1 / -1;"><b>Leído por ('+leido.length+'):</b><br><span style="font-size:11px;color:var(--text2);">'+formatDisplayValue(nombres)+'</span></div>';
  }
  return out;
}

// Añade al usuario actual al array leido_por si no estaba ya (PATCH jsonb)
async function registrarLecturaGestion(rec){
  if(!rec || !currentUser) return;
  var leido = Array.isArray(rec.leido_por) ? rec.leido_por.slice() : [];
  var ya = leido.some(function(l){ return l && l.id === currentUser.id; });
  if(ya) return;
  leido.push({id: currentUser.id, nombre: currentUser.nombre, ts: localTs()});
  try {
    var res = await fetch(
      SUPABASE_URL + '/rest/v1/gestiones?id=eq.' + encodeURIComponent(rec.id),
      { method:'PATCH',
        headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
        body: JSON.stringify({leido_por: leido})
      }
    );
    if(res.ok){ rec.leido_por = leido; invalidateCache('gestiones'); }
  } catch(e){ /* nunca bloquear el modal por un fallo de registro */ }
}
window.registrarLecturaGestion = registrarLecturaGestion;

// ── Poblar un <select> con habitaciones activas desde housekeeping_rooms ──
async function poblarSelectorHabitacion(selectEl, valorActual){
  if(!selectEl) return;
  selectEl.innerHTML = '<option value="">— Sin habitación —</option>';
  var rooms = [];
  try { rooms = await getDB('housekeeping_rooms'); } catch(e){}
  rooms = (rooms||[]).filter(function(r){ return r.activa !== false; })
    .sort(function(a,b){ return (parseInt(a.numero,10)||0) - (parseInt(b.numero,10)||0); });
  rooms.forEach(function(r){
    var o = document.createElement('option');
    o.value = r.numero; o.textContent = r.numero;
    if(String(valorActual||'')===String(r.numero)) o.selected = true;
    selectEl.appendChild(o);
  });
}
window.poblarSelectorHabitacion = poblarSelectorHabitacion;

async function openItemModal(type, id){
  var ov = _itemEnsureOverlay();
  var table = (type==='gestion') ? 'gestiones' : 'incidencias';
  // Forzar lectura fresca
  invalidateCache(table);
  invalidateCache('item_comentarios');
  var list = await getDB(table);
  var rec = (list||[]).find(function(r){ return r.id===id; });
  if(!rec){ toast('Registro no encontrado','err'); return; }

  // Cargar histórico de comentarios para este item
  var allCom = [];
  try { allCom = await getDB('item_comentarios'); } catch(e){}
  var historico = (allCom||[]).filter(function(c){
    return c.item_type===type && c.item_id===id;
  }).sort(function(a,b){
    return (b.created_at||'').localeCompare(a.created_at||'');  // reciente arriba
  });

  _itemModalCtx = {type:type, id:id, record:rec, historico:historico};

  var isAdminU = isAdmin(currentUser);
  var isSup    = typeof isSupervisor === 'function' && isSupervisor(currentUser);
  var isJefe   = isAdminU || isSup;

  var estado = (type==='gestion')
    ? (rec.estado || 'Abierta')
    : normalizeIncidentState(rec.estado);

  var badge = (type==='gestion') ? bGestionEstado(estado) : bIncidentEstado(estado);
  var descripcion = rec.descripcion || rec.titulo || '—';
  var tipo = rec.tipo_gestion || rec.tipo_incidencia || rec.categoria || '—';
  var creador = rec.creado_por || rec.nombre || '—';
  var fechaCre = rec.created_at ? new Date(rec.created_at).toLocaleString('es-ES') : '—';
  var dpto = rec.departamento || rec.area || '—';
  var accionPrev = rec.accion_tomada || rec.accion_inmediata || '';

  document.getElementById('mi-title').textContent =
    (type==='gestion' ? 'Gestión' : 'Incidencia') + ' · ' + tipo;

  var body = ''
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:10px;">'
    + '<div><b>Estado:</b><br>'+badge+'</div>'
    + '<div><b>Departamento:</b><br>'+formatDisplayValue(dpto)+'</div>'
    + '<div><b>Creado por:</b><br>'+formatDisplayValue(creador)+'</div>'
    + '<div><b>Fecha:</b><br><span style="font-family:var(--font-mono);font-size:11px;">'+fechaCre+'</span></div>'
    + (type==='gestion' ? _gestionExtraRows(rec) : '')
    + '</div>'
    + '<div style="margin-bottom:10px;"><b style="font-size:12px;">Descripción</b>'
    + '<div style="background:var(--bg2);padding:8px;border-radius:6px;font-size:12px;margin-top:4px;">'+formatDisplayValue(descripcion)+'</div></div>';

  if(accionPrev){
    body += '<div style="margin-bottom:10px;"><b style="font-size:12px;color:var(--green);">Acción al cerrar</b>'
      + '<div style="background:var(--bg2);padding:8px;border-radius:6px;font-size:12px;margin-top:4px;">'+formatDisplayValue(accionPrev)+'</div></div>';
  }

  // ── HISTÓRICO DE COMENTARIOS ──────────────────────────────────────
  body += '<div style="margin-bottom:10px;"><b style="font-size:12px;">Historial de comentarios ('+historico.length+')</b>';
  if(historico.length === 0){
    body += '<div style="background:var(--bg2);padding:8px;border-radius:6px;font-size:11px;color:var(--text3);margin-top:4px;">Sin comentarios aún.</div>';
  } else {
    body += '<div style="max-height:200px;overflow-y:auto;margin-top:4px;">';
    historico.forEach(function(c){
      var fc = c.created_at ? new Date(c.created_at).toLocaleString('es-ES') : '—';
      var delBtn = isAdminU
        ? ' <button style="font-size:10px;background:none;border:none;color:var(--red);cursor:pointer;padding:0 4px;" onclick="itemDeleteComentario(\''+c.id+'\')" title="Eliminar (admin)">🗑</button>'
        : '';
      body += '<div style="background:var(--bg2);padding:6px 8px;border-radius:6px;font-size:12px;margin-bottom:4px;border-left:2px solid var(--amber);">'
        + '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-bottom:2px;">'
        +   '👤 '+formatDisplayValue(c.autor)+' · '+fc + delBtn
        + '</div>'
        + '<div>'+formatDisplayValue(c.texto)+'</div>'
        + '</div>';
    });
    body += '</div>';
  }
  body += '</div>';

  // ── TEXTAREA NUEVO COMENTARIO ─────────────────────────────────────
  var estadoCerrado = (estado === 'Cerrada') || (estado === INCIDENT_STATES.CERRADA);
  var puedeEditar = !estadoCerrado;
  if(puedeEditar){
    body += '<div style="margin-bottom:6px;"><b style="font-size:12px;">Añadir comentario nuevo</b>'
      + '<textarea id="mi-comentario" rows="3" style="width:100%;margin-top:4px;font-size:12px;" '
      + 'placeholder="Escribe un nuevo comentario..."></textarea></div>';
  }

  document.getElementById('mi-body').innerHTML = body;

  // Botones según tipo + rol + dpto
  // Reglas operativas:
  //   - Gestión: cualquier miembro del dpto + admin/jefe pueden actuar
  //   - Incidencia: SOLO jefe del dpto + admin pueden actuar
  var btns = [];
  var sameDept = normalizeDeptName(dpto) === normalizeDeptName(currentUser.area||'');
  var canActOnDept = isAdminU || (isJefe && canViewDepartment(currentUser, dpto));
  var canActEmp;
  if(type==='gestion'){
    canActEmp = canActOnDept || sameDept;
  } else {
    // incidencia: solo jefe del dpto correspondiente + admin
    canActEmp = canActOnDept;
  }

  if(puedeEditar && canActEmp){
    btns.push('<button class="btn btn-secondary" onclick="itemSaveComentario()">💬 Añadir comentario</button>');
    if(type==='gestion'){
      if(estado==='Abierta')
        btns.push('<button class="btn btn-secondary" onclick="itemAdvance(\'En proceso\')">▶ En proceso</button>');
      btns.push('<button class="btn btn-primary" style="margin-left:auto" onclick="itemClose()">✓ Cerrar (con acción tomada)</button>');
    } else {
      if(estado===INCIDENT_STATES.ABIERTA)
        btns.push('<button class="btn btn-secondary" onclick="itemAdvance(\'En proceso\')">▶ En proceso</button>');
      btns.push('<button class="btn btn-primary" style="margin-left:auto" onclick="itemClose()">✓ Cerrar (con acción tomada)</button>');
    }
  }

  if(isAdminU){
    btns.push('<button class="btn btn-danger" onclick="itemDelete()">🗑️ Eliminar</button>');
  }
  btns.push('<button class="btn btn-secondary" onclick="closeModal(\'modal-item\')">Cancelar</button>');
  var foot = document.getElementById('mi-foot');
  foot.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;';
  foot.innerHTML = btns.join(' ');

  ov.classList.add('open');

  // Registrar lectura (solo gestiones; idempotente; nunca bloquea el render)
  if(type==='gestion'){ registrarLecturaGestion(rec); }
}
window.openItemModal = openItemModal;

async function itemSaveComentario(){
  if(!_itemModalCtx) return;
  var txt = ((document.getElementById('mi-comentario')||{}).value || '').trim();
  if(!txt){ toast('Comentario vacío','err'); return; }

  var rec = {
    id: genId(),
    item_type: _itemModalCtx.type,
    item_id: _itemModalCtx.id,
    autor: currentUser.nombre,
    texto: txt,
    created_at: localTs()
  };
  var result = await dbInsert('item_comentarios', rec);
  if(result === null){
    toast('Error: comentario NO guardado (ver consola)','err');
    return;
  }
  invalidateCache('item_comentarios');
  auditLog('COMENTARIO_NEW', _itemModalCtx.type+':'+_itemModalCtx.id+' por '+currentUser.nombre+': '+txt.slice(0,80));
  toast('Comentario añadido','ok');
  // Refrescar modal en vez de cerrarlo, para ver el comentario nuevo
  await openItemModal(_itemModalCtx.type, _itemModalCtx.id);
}
window.itemSaveComentario = itemSaveComentario;

// Eliminar comentario individual (solo admin)
async function itemDeleteComentario(comId){
  if(!isAdmin(currentUser)){ toast('Solo admin','err'); return; }
  if(!confirm('¿Eliminar este comentario?\n\nNo se puede deshacer.')) return;
  var all = await getDB('item_comentarios');
  var com = (all||[]).find(function(c){ return c.id===comId; });
  await auditLog('COMENTARIO_DELETE', comId+' | '+JSON.stringify(com||{}).slice(0,200));
  await dbDelete('item_comentarios', comId);
  invalidateCache('item_comentarios');
  toast('Comentario eliminado','ok');
  if(_itemModalCtx){
    await openItemModal(_itemModalCtx.type, _itemModalCtx.id);
  }
}
window.itemDeleteComentario = itemDeleteComentario;

async function itemAdvance(newState){
  if(!_itemModalCtx) return;
  // Si hay texto sin guardar en el textarea de comentario nuevo, guardarlo primero
  var txt = ((document.getElementById('mi-comentario')||{}).value || '').trim();
  if(txt){
    await dbInsert('item_comentarios', {
      id: genId(),
      item_type: _itemModalCtx.type,
      item_id: _itemModalCtx.id,
      autor: currentUser.nombre,
      texto: txt,
      created_at: localTs()
    });
    invalidateCache('item_comentarios');
  }
  var table = _itemModalCtx.type==='gestion' ? 'gestiones' : 'incidencias';
  await dbUpdate(table, _itemModalCtx.id, {estado: newState});
  invalidateCache(table);
  auditLog(table.toUpperCase()+'_ADVANCE', currentUser.nombre+' → '+newState+': '+_itemModalCtx.id);
  toast('Estado actualizado','ok');
  closeModal('modal-item');
  if(typeof rerenderActiveScreen==='function') rerenderActiveScreen();
}
window.itemAdvance = itemAdvance;

async function itemClose(){
  if(!_itemModalCtx) return;
  var pendiente = ((document.getElementById('mi-comentario')||{}).value || '').trim();
  var accion = prompt('Acción tomada (qué se hizo para resolver):', pendiente || '');
  if(!accion || !accion.trim()){ toast('Acción tomada obligatoria','err'); return; }
  // Si había texto en el textarea de comentario nuevo, guardarlo como comentario
  if(pendiente){
    await dbInsert('item_comentarios', {
      id: genId(),
      item_type: _itemModalCtx.type,
      item_id: _itemModalCtx.id,
      autor: currentUser.nombre,
      texto: pendiente,
      created_at: localTs()
    });
    invalidateCache('item_comentarios');
  }
  var ts = localTs();
  var inicio = _itemModalCtx.record.created_at ? new Date(_itemModalCtx.record.created_at).getTime() : Date.now();
  var tgMins = Math.round((Date.now()-inicio)/60000);

  if(_itemModalCtx.type==='gestion'){
    await dbUpdate('gestiones', _itemModalCtx.id, {
      estado:'Cerrada', accion_tomada:accion.trim(),
      cerrado_por:currentUser.nombre, cerrado_ts:ts,
      tiempo_gestion:tgMins
    });
    invalidateCache('gestiones');
    auditLog('GESTION_CERRADA', _itemModalCtx.id+' | '+tgMins+'min | '+accion.slice(0,80));
  } else {
    await dbUpdate('incidencias', _itemModalCtx.id, {
      estado:INCIDENT_STATES.CERRADA, accion_inmediata:accion.trim(),
      cerrado_ts:ts, tiempo_gestion:tgMins
    });
    invalidateCache('incidencias');
    auditLog('INCIDENCIA_CERRADA', _itemModalCtx.id+' | '+tgMins+'min | '+accion.slice(0,80));
  }
  toast('Cerrada','ok');
  closeModal('modal-item');
  if(typeof rerenderActiveScreen==='function') rerenderActiveScreen();
}
window.itemClose = itemClose;

async function itemValidate(){
  if(!_itemModalCtx) return;
  var table = _itemModalCtx.type==='gestion' ? 'gestiones' : 'incidencias';
  await dbUpdate(table, _itemModalCtx.id, {validado_por: currentUser.nombre, validado_ts: localTs()});
  invalidateCache(table);
  auditLog(table.toUpperCase()+'_VALIDADA', _itemModalCtx.id+' por '+currentUser.nombre);
  toast('Validado','ok');
  closeModal('modal-item');
  if(typeof rerenderActiveScreen==='function') rerenderActiveScreen();
}
window.itemValidate = itemValidate;

async function itemUnvalidate(){
  if(!_itemModalCtx) return;
  if(!confirm('¿Quitar validación?')) return;
  var table = _itemModalCtx.type==='gestion' ? 'gestiones' : 'incidencias';
  await dbUpdate(table, _itemModalCtx.id, {validado_por:null, validado_ts:null});
  invalidateCache(table);
  auditLog(table.toUpperCase()+'_UNVALIDADA', _itemModalCtx.id+' por '+currentUser.nombre);
  toast('Validación retirada','ok');
  closeModal('modal-item');
  if(typeof rerenderActiveScreen==='function') rerenderActiveScreen();
}
window.itemUnvalidate = itemUnvalidate;

async function itemDelete(){
  if(!_itemModalCtx) return;
  if(!isAdmin(currentUser)){ toast('Solo admin','err'); return; }
  var table = _itemModalCtx.type==='gestion' ? 'gestiones' : 'incidencias';
  var label = _itemModalCtx.type==='gestion' ? 'gestión' : 'incidencia';
  if(!confirm('Eliminar '+label+' definitivamente?\n\nEsta acción no se puede deshacer.')) return;
  await auditLog(table.toUpperCase()+'_DELETE', _itemModalCtx.id+' | '+JSON.stringify(_itemModalCtx.record).slice(0,200));
  await dbDelete(table, _itemModalCtx.id);
  invalidateCache(table);
  toast(label.charAt(0).toUpperCase()+label.slice(1)+' eliminada','ok');
  closeModal('modal-item');
  if(typeof rerenderActiveScreen==='function') rerenderActiveScreen();
}
window.itemDelete = itemDelete;

function rerenderActiveScreen(){
  try{
    var fns = ['renderFollowupList','renderMisTurnos','renderValidacion','renderDashboard','renderRecepcionDashboard','renderGestionesScreen','renderIncidenciasScreen'];
    for(var i=0;i<fns.length;i++){
      var f = window[fns[i]];
      if(typeof f === 'function'){ try{ f(); }catch(_){} }
    }
    // Tab Operativo de Validación: re-pintar incidencias/gestiones/tareas con su dept (preserva filtro)
    var _opDiv = document.getElementById('val-content-operativo');
    if(typeof renderFollowUpExtras === 'function' && _opDiv && _opDiv.style.display !== 'none'){
      var _vd = (document.getElementById('v-dept')||{}).value||'';
      try{ renderFollowUpExtras(_vd); }catch(_){}
    }
  }catch(_){}
}
window.rerenderActiveScreen = rerenderActiveScreen;

// Listener delegado global para badges clicables
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('.estado-clickable');
  if(!el) return;
  var type = el.getAttribute('data-itemtype');
  var id   = el.getAttribute('data-itemid');
  if(!type || !id) return;
  e.preventDefault();
  e.stopPropagation();
  openItemModal(type, id);
});

// ═══════════════════════════════════════════════════════════════════════
// PANTALLAS DEDICADAS — Gestiones e Incidencias (Paso 1 nav)
// ═══════════════════════════════════════════════════════════════════════
async function renderGestionesScreen(){
  var el = document.getElementById('screen-gestiones');
  if(!el) return;
  var dept = currentUser ? (currentUser.area||'—') : '—';
  var isAdminU = isAdmin(currentUser);
  var isSup    = typeof isSupervisor === 'function' && isSupervisor(currentUser);
  var verTodos = isAdminU;
  var all = [];
  try { all = await getDB('gestiones'); } catch(e){}
  var list = verTodos ? all : all.filter(function(g){
    return normalizeDeptName(g.departamento||g.area||'') === normalizeDeptName(dept);
  });
  list = list.filter(function(g){ return (g.estado||'Abierta') !== 'Cerrada'; });
  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  var cards;
  if(!list.length){
    cards = '<div class="empty"><div class="empty-icon">📌</div><div class="empty-text">Sin gestiones pendientes</div></div>';
  } else {
    cards = list.map(function(g){
      var st = g.estado || 'Abierta';
      var fecha = g.created_at ? new Date(g.created_at) : null;
      var fechaStr = fecha ? fecha.toLocaleDateString('es-ES')+' · '+fecha.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
      var prioMap = {alta:{t:'🔴 ALTA',c:'var(--red)'}, media:{t:'🟡 MEDIA',c:'var(--amber,#f59e0b)'}, baja:{t:'🟢 BAJA',c:'var(--green)'}};
      var p = prioMap[(g.prioridad||'media').toLowerCase()] || prioMap.media;
      var colRight = '<div style="font-size:11px;font-weight:700;color:'+p.c+';">'+p.t+'</div>';
      if(g.habitacion)  colRight += '<div style="font-size:11px;color:var(--text2);margin-top:4px;">🛏 '+formatDisplayValue(g.habitacion)+'</div>';
      if(g.num_reserva) colRight += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-top:4px;">#'+formatDisplayValue(g.num_reserva)+'</div>';
      return '<div class="task-card" style="display:flex;gap:10px;align-items:stretch;">'
        + '<div style="flex:1;min-width:0;">'
        +   '<div class="task-meta">'
        +     '<span class="dept-badge">'+formatDisplayValue(g.departamento||g.area)+'</span>'
        +     '<span class="task-origin">tipo: '+formatDisplayValue(g.tipo_gestion)+'</span>'
        +     bGestionEstadoClick(st, g.id)
        +   '</div>'
        +   '<div class="task-title">'+formatDisplayValue(g.descripcion)+'</div>'
        +   '<div class="task-footer">'
        +     '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">'
        +       '📅 '+fechaStr+' &nbsp;·&nbsp; creada por '+formatDisplayValue(g.creado_por||g.nombre)
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<div style="border-left:1px solid var(--border,#2a2a2a);padding-left:10px;min-width:80px;text-align:left;">'+colRight+'</div>'
        + '</div>';
    }).join('');
  }

  el.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<div><div class="page-title">📌 Gestiones pendientes</div>'
    + '<div class="page-sub">'+(verTodos?'Todos los departamentos':'Departamento: '+dept)+' · '+list.length+' activas</div></div>'
    + '<button class="btn btn-primary" onclick="openNewGestionStandalone()">+ Nueva gestión</button>'
    + '</div>'
    + '<div>'+cards+'</div>';
}
window.renderGestionesScreen = renderGestionesScreen;

// ── Modal independiente para crear gestión fuera del flujo Mi Turno ──
function openNewGestionStandalone(){
  var ov = document.getElementById('modal-new-gestion');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-new-gestion';
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal" style="max-width:520px;">'
      + '<div class="modal-h"><h3>📌 Nueva gestión</h3>'
      + '<button class="modal-x" onclick="closeModal(\'modal-new-gestion\')">✕</button></div>'
      + '<div class="modal-b">'
      + '<div class="fg"><label>Tipo</label><select id="ng-tipo"></select></div>'
      + '<div class="fg"><label>Prioridad</label><select id="ng-prioridad"><option value="alta">🔴 Alta</option><option value="media" selected>🟡 Media</option><option value="baja">🟢 Baja</option></select></div>'
      + '<div class="fg"><label>Habitación</label><select id="ng-habitacion"><option value="">— Sin habitación —</option></select></div>'
      + '<div class="fg"><label>Nº reserva (opcional)</label><input id="ng-reserva" type="text" placeholder="Ej. 123456"></div>'
      + '<div class="fg"><label>Descripción</label><textarea id="ng-desc" rows="3" placeholder="Detalle de la gestión..."></textarea></div>'
      + '</div>'
      + '<div class="modal-f">'
      + '<button class="btn btn-secondary" onclick="closeModal(\'modal-new-gestion\')">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="saveNewGestionStandalone()">💾 Guardar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-new-gestion'); });
  }
  // Poblar selector de tipos según dpto
  var sel = ov.querySelector('#ng-tipo');
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  var dept = (typeof _deptCatalogo === 'function') ? _deptCatalogo(currentUser) : (currentUser && currentUser.area || '');
  if(typeof populateGestionTipoSelector === 'function'){
    populateGestionTipoSelector('ng-tipo', dept);
  } else {
    ['Reposición / pedido de material','Reserva / grupo / evento pendiente','Otro'].forEach(function(t){
      var o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
    });
  }
  ov.querySelector('#ng-desc').value = '';
  var pr = ov.querySelector('#ng-prioridad'); if(pr) pr.value = 'media';
  var rs = ov.querySelector('#ng-reserva'); if(rs) rs.value = '';
  poblarSelectorHabitacion(ov.querySelector('#ng-habitacion'), '');
  ov.classList.add('open');
}
window.openNewGestionStandalone = openNewGestionStandalone;

async function saveNewGestionStandalone(){
  var tipo = (document.getElementById('ng-tipo')||{}).value || '';
  var desc = ((document.getElementById('ng-desc')||{}).value || '').trim();
  if(!desc){ toast('Descripción obligatoria','err'); return; }
  var prio = (document.getElementById('ng-prioridad')||{}).value || 'media';
  var hab  = ((document.getElementById('ng-habitacion')||{}).value || '').trim();
  var res  = ((document.getElementById('ng-reserva')||{}).value || '').trim();
  var rec = {
    id: genId(),
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: currentUser.area||'',
    departamento: currentUser.area||'',
    fecha: today(),
    tipo_gestion: tipo || 'Otro',
    descripcion: desc,
    prioridad: prio,
    habitacion: hab || null,
    num_reserva: res || null,
    leido_por: [],
    accion_tomada: '',
    estado: 'Abierta',
    informado_responsable: 'no',
    created_at: localTs()
  };
  try {
    await dbInsert('gestiones', rec);
    invalidateCache('gestiones');
    auditLog('GESTION_CREATE', rec.id+' | '+tipo+' | '+desc.slice(0,80));
    toast('Gestión creada','ok');
    closeModal('modal-new-gestion');
    renderGestionesScreen();
  } catch(e){
    toast('Error: '+e.message,'err');
  }
}
window.saveNewGestionStandalone = saveNewGestionStandalone;

async function renderIncidenciasScreen(){
  var el = document.getElementById('screen-incidencias');
  if(!el) return;
  var dept = currentUser ? (currentUser.area||'—') : '—';
  var isAdminU = isAdmin(currentUser);
  var isSup    = typeof isSupervisor === 'function' && isSupervisor(currentUser);
  var canSeeList = isAdminU || isSup;

  // ── Empleado: solo crear, sin lista ────────────────────────────────
  if(!canSeeList){
    el.innerHTML = '<div class="page-header"><div class="page-title">⚠ Incidencias</div>'
      + '<div class="page-sub">Reporta una incidencia del turno. Tu jefe la revisará.</div></div>'
      + '<div class="card" style="text-align:center;padding:32px;">'
      + '<p style="color:var(--text2);font-size:13px;margin-bottom:18px;">'
      + 'Las incidencias que reportes serán visibles solo por tu jefe de departamento.'
      + '</p>'
      + '<button class="btn btn-primary" style="font-size:14px;padding:12px 24px;" onclick="openNewIncidenciaStandalone()">+ Nueva incidencia</button>'
      + '</div>';
    return;
  }

  // ── Jefe / Admin: lista completa ───────────────────────────────────
  var verTodos = isAdminU;
  var all = [];
  try { all = await getDB('incidencias'); } catch(e){}
  var list = verTodos ? all : all.filter(function(i){
    return normalizeDeptName(i.departamento||i.area||'') === normalizeDeptName(dept);
  });
  list = list.filter(function(i){
    var s = normalizeIncidentState(i.estado);
    return s !== INCIDENT_STATES.CERRADA;
  });
  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  var cards;
  if(!list.length){
    cards = '<div class="empty"><div class="empty-icon">⚠</div><div class="empty-text">Sin incidencias pendientes</div></div>';
  } else {
    cards = list.map(function(i){
      var fecha = i.created_at ? new Date(i.created_at) : null;
      var fechaStr = fecha ? fecha.toLocaleDateString('es-ES')+' · '+fecha.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
      return '<div class="task-card">'
        + '<div class="task-meta">'
        +   '<span class="dept-badge">'+formatDisplayValue(i.departamento||i.area)+'</span>'
        +   '<span class="task-origin">tipo: '+formatDisplayValue(i.tipo_incidencia||i.categoria)+'</span>'
        +   bIncidentEstadoClick(i.estado, i.id)
        + '</div>'
        + '<div class="task-title">'+formatDisplayValue(i.descripcion)+'</div>'
        + '<div class="task-footer">'
        +   '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">'
        +     '📅 '+fechaStr+' &nbsp;·&nbsp; reportada por '+formatDisplayValue(i.nombre)
        +   '</div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  el.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<div><div class="page-title">⚠ Incidencias pendientes</div>'
    + '<div class="page-sub">'+(verTodos?'Todos los departamentos':'Departamento: '+dept)+' · '+list.length+' activas</div></div>'
    + '<button class="btn btn-primary" onclick="openNewIncidenciaStandalone()">+ Nueva incidencia</button>'
    + '</div>'
    + '<div>'+cards+'</div>';
}
window.renderIncidenciasScreen = renderIncidenciasScreen;

// ═══════════════════════════════════════════════════════════════════════
// MERMA — módulo Cocina desde sidebar
// ═══════════════════════════════════════════════════════════════════════
async function renderMermaMod(){
  // Delega en renderMermaScreen de merma.js (módulo unificado)
  if(typeof renderMermaScreen === 'function'){ await renderMermaScreen(); return; }
  var el=document.getElementById('screen-merma-mod');
  if(el) el.innerHTML='<div class="empty"><div class="empty-text">Cargando módulo merma...</div></div>';
}
window.renderMermaMod = renderMermaMod;

// ── Modal nueva merma standalone — delega en merma.js ──────────────
function openNewMermaMod(){
  if(typeof openMermaModal === 'function'){ openMermaModal(); return; }
  // merma.js no cargado — fallback sin buscador
  var ov=document.getElementById('modal-new-merma');
  if(!ov){
    ov=document.createElement('div'); ov.id='modal-new-merma'; ov.className='modal-overlay';
    ov.innerHTML='<div class="modal" style="max-width:520px;">'      +'<div class="modal-h"><h3>📦 Nueva línea de merma</h3>'      +'<button class="modal-x" onclick="closeModal(\'modal-new-merma\')">✕</button></div>'      +'<div class="modal-b">'      +'<div class="fg"><label>Producto <span class="req">*</span></label><input type="text" id="nm-producto" placeholder="ej: Salmón"></div>'      +'<div class="fg"><label>Cantidad <span class="req">*</span></label><input type="number" id="nm-cantidad" min="0" step="0.01" placeholder="0"></div>'      +'<div class="fg"><label>Causa <span class="req">*</span></label><select id="nm-causa"><option value="">— Seleccionar —</option><option>Caducidad / fecha vencida</option><option>Mal almacenamiento</option><option>Error de producción</option><option>Exceso de producción</option><option>Rotura / accidente</option><option>Deterioro por temperatura</option><option>Devolución cliente</option><option>Control de calidad</option><option>Otra causa</option></select></div>'      +'</div>'      +'<div class="modal-f">'      +'<button class="btn btn-secondary" onclick="closeModal(\'modal-new-merma\')">Cancelar</button>'      +'<button class="btn btn-primary" onclick="saveNewMermaMod()">💾 Guardar</button>'      +'</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){if(e.target===ov)closeModal('modal-new-merma');});
  }
  ['nm-producto','nm-cantidad'].forEach(function(id){var x=document.getElementById(id);if(x)x.value='';});
  var c=document.getElementById('nm-causa');if(c)c.value='';
  ov.classList.add('open');
}
window.openNewMermaMod = openNewMermaMod;

async function saveNewMermaMod(){
  var producto = ((document.getElementById('nm-producto')||{}).value || '').trim();
  var cantidad = parseFloat((document.getElementById('nm-cantidad')||{}).value) || 0;
  var unidad   = (document.getElementById('nm-unidad')||{}).value || 'uds';
  var causa    = (document.getElementById('nm-causa')||{}).value || '';
  var obs      = ((document.getElementById('nm-obs')||{}).value || '').trim();

  if(!producto){ toast('Producto obligatorio','err'); return; }
  if(!cantidad || cantidad<=0){ toast('Cantidad obligatoria (> 0)','err'); return; }
  if(!causa){ toast('Causa obligatoria','err'); return; }

  var rec = {
    id: genId(),
    shift_id: null,  // sin turno (independiente)
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: currentUser.area||'',
    fecha: today(),
    servicio: '',
    producto: producto,
    cantidad: cantidad,
    unidad: unidad,
    causa: causa,
    obs: obs,
    coste_unitario: 0,
    coste_total: 0,
    created_at: localTs()
  };
  var result = await dbInsert('merma', rec);
  if(result === null){
    toast('Error: merma NO guardada (ver consola)','err');
    return;
  }
  invalidateCache('merma');
  auditLog('MERMA_NEW', producto+' '+cantidad+unidad+' / '+causa);
  toast('Merma registrada','ok');
  closeModal('modal-new-merma');
  renderMermaMod();
}
window.saveNewMermaMod = saveNewMermaMod;

async function deleteMermaItem(mid){
  if(!isAdmin(currentUser)){ toast('Solo admin','err'); return; }
  if(!confirm('¿Eliminar esta línea de merma?\n\nNo se puede deshacer.')) return;
  var all = await getDB('merma');
  var m = (all||[]).find(function(x){ return x.id===mid; });
  await auditLog('MERMA_DELETE', mid+' | '+JSON.stringify(m||{}).slice(0,200));
  await dbDelete('merma', mid);
  invalidateCache('merma');
  toast('Merma eliminada','ok');
  renderMermaMod();
}
window.deleteMermaItem = deleteMermaItem;

// ═══════════════════════════════════════════════════════════════════════
// NOTAS / SUGERENCIAS — módulo empleado (MI DÍA) + tab Validación
// Visible: autor + jefe de departamento + adjunto directivo + admin
// Tabla: employee_notes (id, employee_id, nombre, area, categoria, texto,
//        leida, created_at)
// ═══════════════════════════════════════════════════════════════════════

var _NOTA_CATS = ['Sugerencia','Queja','Mejora'];

function _canSeeNotasTab(user){
  if(!user) return false;
  if(typeof isAdmin==='function' && isAdmin(user)) return true;
  if(typeof isAdjuntoDirectivo==='function' && isAdjuntoDirectivo(user)) return true;
  if(typeof isSupervisor==='function' && isSupervisor(user)) return true;
  if(user.rol === 'jefe') return true;
  return false;
}

async function renderNotasMod(){
  var el = document.getElementById('screen-notas-mod');
  if(!el) return;

  var isAdminU = typeof isAdmin==='function' && isAdmin(currentUser);
  var canSeeAll = _canSeeNotasTab(currentUser);
  var todayStr = today();

  invalidateCache('employee_notes');
  var all = [];
  try { all = await getDB('employee_notes'); } catch(e){ console.error('employee_notes load error',e); }

  // Filtrar: empleado normal solo ve las suyas
  var list = canSeeAll
    ? all.slice()
    : all.filter(function(n){ return n.employee_id === currentUser.id; });

  // Jefe ve solo su dpto
  if(canSeeAll && !isAdminU && !(typeof isAdjuntoDirectivo==='function' && isAdjuntoDirectivo(currentUser))){
    var myDepts = typeof getSupervisorDepartments==='function'
      ? getSupervisorDepartments(currentUser)
      : [currentUser.area||''];
    list = list.filter(function(n){
      return myDepts.indexOf(n.area) >= 0 || n.employee_id === currentUser.id;
    });
  }

  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  // KPIs
  var catCount = {};
  _NOTA_CATS.forEach(function(c){ catCount[c]=0; });
  list.forEach(function(n){ if(catCount[n.categoria]!==undefined) catCount[n.categoria]++; });
  var noLeidas = list.filter(function(n){ return !n.leida && n.employee_id !== currentUser.id; }).length;

  var kpiHtml = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">'
    +'<div class="kpi k-purple"><div class="kpi-lbl">Total</div><div class="kpi-val">'+list.length+'</div></div>'
    +_NOTA_CATS.map(function(c){
      return '<div class="kpi k-purple"><div class="kpi-lbl">'+c+'</div><div class="kpi-val">'+catCount[c]+'</div></div>';
    }).join('')
    +(canSeeAll && noLeidas>0 ? '<div class="kpi k-red"><div class="kpi-lbl">Sin leer</div><div class="kpi-val">'+noLeidas+'</div></div>' : '')
    +'</div>';

  // Tarjetas
  var cards;
  if(!list.length){
    cards = '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Sin notas registradas</div></div>';
  } else {
    cards = list.map(function(n){
      var hora = n.created_at ? new Date(n.created_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
      var catColor = n.categoria==='Queja' ? '#ef4444' : n.categoria==='Mejora' ? '#10b981' : '#8b5cf6';
      var leidaTag = (!n.leida && canSeeAll && n.employee_id!==currentUser.id)
        ? '<span style="font-size:10px;background:rgba(239,68,68,.15);color:#ef4444;padding:2px 7px;border-radius:6px;margin-left:6px;">Nueva</span>'
        : '';
      var markBtn = (canSeeAll && !n.leida && n.employee_id!==currentUser.id)
        ? '<button class="btn btn-secondary btn-sm" style="margin-left:auto;font-size:11px;" onclick="markNotaLeida(\''+n.id+'\')">✓ Marcar leída</button>'
        : '';
      var delBtn = (isAdminU || n.employee_id===currentUser.id)
        ? ' <button class="btn btn-danger btn-sm" onclick="deleteNota(\''+n.id+'\')" title="Eliminar">🗑</button>'
        : '';
      return '<div class="task-card" style="'+(n.leida?'opacity:.75;':'')+'border-left:3px solid '+catColor+';">'
        +'<div class="task-meta" style="align-items:flex-start;gap:10px;">'
        +'<span class="badge" style="background:rgba(139,92,246,.15);color:'+catColor+';border:1px solid '+catColor+';">'+n.categoria+'</span>'
        +'<span style="font-size:11px;color:var(--text3);font-family:var(--font-mono);">'+hora+'</span>'
        +leidaTag
        +(canSeeAll?'<span class="dept-badge">'+formatDisplayValue(n.area||'—')+'</span>':'')
        +markBtn+delBtn
        +'</div>'
        +'<div style="font-size:14px;color:var(--text);margin-top:8px;line-height:1.5;">'+formatDisplayValue(n.texto)+'</div>'
        +'<div class="task-footer" style="margin-top:6px;">'
        +'<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">👤 '+formatDisplayValue(n.nombre)+'</div>'
        +'</div>'
        +'</div>';
    }).join('');
  }

  var totalSinLeer = list.filter(function(n){ return !n.leida && n.employee_id!==currentUser.id; }).length;
  var subText = list.length+' nota(s)' + (totalSinLeer>0?' · <b style="color:#ef4444;">'+totalSinLeer+' sin leer</b>':'');

  el.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">'
    +'<div><div class="page-title">💬 Notas y Sugerencias</div>'
    +'<div class="page-sub">'+subText+'</div></div>'
    +'<button class="btn btn-primary" onclick="openNewNotaMod()">+ Nueva nota</button>'
    +'</div>'
    +kpiHtml
    +'<div>'+cards+'</div>';
}
window.renderNotasMod = renderNotasMod;

function openNewNotaMod(){
  var ov = document.getElementById('modal-new-nota');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-new-nota';
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal" style="max-width:520px;">'
      +'<div class="modal-h"><h3>💬 Nueva nota</h3>'
      +'<button class="modal-x" onclick="closeModal(\'modal-new-nota\')">✕</button></div>'
      +'<div class="modal-b">'
      +'<div class="fg"><label>Categoría <span class="req">*</span></label>'
      +'<select id="nn-cat"><option value="">— Seleccionar —</option>'
      +_NOTA_CATS.map(function(c){return '<option>'+c+'</option>';}).join('')
      +'</select></div>'
      +'<div class="fg"><label>Texto <span class="req">*</span></label>'
      +'<textarea id="nn-texto" rows="5" placeholder="Describe tu sugerencia, queja o propuesta de mejora..." style="resize:vertical;"></textarea></div>'
      +'</div>'
      +'<div class="modal-f">'
      +'<button class="btn btn-secondary" onclick="closeModal(\'modal-new-nota\')">Cancelar</button>'
      +'<button class="btn btn-primary" onclick="saveNewNotaMod()">💾 Enviar nota</button>'
      +'</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){ if(e.target===ov) closeModal('modal-new-nota'); });
  }
  var catEl = document.getElementById('nn-cat'); if(catEl) catEl.value='';
  var txtEl = document.getElementById('nn-texto'); if(txtEl) txtEl.value='';
  ov.classList.add('open');
}
window.openNewNotaMod = openNewNotaMod;

async function saveNewNotaMod(){
  var categoria = ((document.getElementById('nn-cat')||{}).value||'').trim();
  var texto     = ((document.getElementById('nn-texto')||{}).value||'').trim();
  if(!categoria){ toast('Selecciona una categoría','err'); return; }
  if(!texto || texto.length < 5){ toast('Escribe al menos 5 caracteres','err'); return; }

  var rec = {
    id: genId(),
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: currentUser.area||'',
    categoria: categoria,
    texto: texto,
    leida: false,
    created_at: localTs()
  };
  var result = await dbInsert('employee_notes', rec);
  if(result === null){
    toast('Error al guardar la nota (ver consola)','err');
    return;
  }
  invalidateCache('employee_notes');
  await auditLog('NOTA_NEW', currentUser.nombre+' · '+categoria+' · '+texto.slice(0,80));
  toast('Nota enviada','ok');
  closeModal('modal-new-nota');
  renderNotasMod();
}
window.saveNewNotaMod = saveNewNotaMod;

async function markNotaLeida(nid){
  await dbUpdate('employee_notes', nid, { leida: true });
  invalidateCache('employee_notes');
  // Refrescar según pantalla activa
  var screen = document.getElementById('screen-notas-mod');
  if(screen && screen.classList.contains('active')) renderNotasMod();
  if(typeof renderValNotasList==='function'){
    var tab = document.getElementById('val-content-notas');
    if(tab && tab.style.display!=='none') renderValNotasList();
  }
}
window.markNotaLeida = markNotaLeida;

async function deleteNota(nid){
  if(!confirm('¿Eliminar esta nota?\n\nNo se puede deshacer.')) return;
  var all = await getDB('employee_notes');
  var n = (all||[]).find(function(x){ return x.id===nid; });
  if(n && n.employee_id !== currentUser.id && !(typeof isAdmin==='function' && isAdmin(currentUser))){
    toast('Solo puedes eliminar tus propias notas','err'); return;
  }
  await auditLog('NOTA_DELETE', nid+' | '+(n?n.texto.slice(0,60):''));
  await dbDelete('employee_notes', nid);
  invalidateCache('employee_notes');
  toast('Nota eliminada','ok');
  var screen = document.getElementById('screen-notas-mod');
  if(screen && screen.classList.contains('active')) renderNotasMod();
  if(typeof renderValNotasList==='function'){
    var tab = document.getElementById('val-content-notas');
    if(tab && tab.style.display!=='none') renderValNotasList();
  }
}
window.deleteNota = deleteNota;

// ═══════════════════════════════════════════════════════════════════════
// AJUSTES — módulo Sala desde sidebar (descuentos, errores, invitaciones)
// Privado: empleado ve solo los suyos del día. Jefe/Admin ven todo del dpto.
// ═══════════════════════════════════════════════════════════════════════
async function renderAjustesMod(){
  var el = document.getElementById('screen-ajustes-mod');
  if(!el) return;
  var isAdminU = isAdmin(currentUser);
  var isSup    = typeof isSupervisor === 'function' && isSupervisor(currentUser);
  var todayStr = today();
  invalidateCache('ajustes');
  var all = [];
  try { all = await getDB('ajustes'); } catch(e){}

  // Filtrado por rol:
  //  - empleado: SOLO los suyos del día
  //  - jefe/admin: todos del día del dpto (o todos si admin)
  var list = (all||[]).filter(function(a){
    return (a.fecha||'').slice(0,10) === todayStr;
  });
  if(isAdminU){
    // ve todo (sin filtro adicional)
  } else if(isSup){
    var allowed = SUPERVISOR_DEPT_MAP[currentUser.rol] || [currentUser.area];
    list = list.filter(function(a){ return allowed.indexOf(a.area||'') >= 0; });
  } else {
    list = list.filter(function(a){ return a.employee_id === currentUser.id; });
  }
  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  var totalImp = 0;
  var pendientes = 0;
  list.forEach(function(a){
    totalImp += parseFloat(a.importe)||0;
    if(!a.shift_id) pendientes++;
  });

  var cards;
  if(!list.length){
    cards = '<div class="empty"><div class="empty-icon">⚙</div><div class="empty-text">Sin ajustes hoy</div></div>';
  } else {
    cards = list.map(function(a){
      var hora = a.created_at ? new Date(a.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
      var importeFmt = (parseFloat(a.importe)||0).toFixed(2)+' €';
      var importeColor = (parseFloat(a.importe)||0) < 0 ? 'var(--red)' : 'var(--text)';
      var statusTag = a.shift_id
        ? '<span style="font-size:10px;background:var(--green-dim);color:var(--green);padding:2px 6px;border-radius:6px;margin-left:6px;">en turno</span>'
        : '<span style="font-size:10px;background:var(--amber-dim);color:var(--amber);padding:2px 6px;border-radius:6px;margin-left:6px;">pendiente</span>';
      var obs = a.obs ? '<div style="font-size:11px;color:var(--text3);margin-top:4px;">📝 '+formatDisplayValue(a.obs)+'</div>' : '';
      var motivo = a.motivo ? '<div style="font-size:12px;margin-top:4px;">'+formatDisplayValue(a.motivo)+'</div>' : '';
      var delBtn = isAdminU ? ' <button class="btn btn-danger btn-sm" style="margin-left:auto;" onclick="deleteAjusteItem(\''+a.id+'\')">🗑</button>' : '';
      return '<div class="task-card">'
        + '<div class="task-meta" style="align-items:center;">'
        +   '<span class="dept-badge">'+formatDisplayValue(a.area)+'</span>'
        +   '<span class="task-origin">'+hora+'</span>'
        +   '<span style="font-weight:600;font-size:13px;">'+formatDisplayValue(a.tipo)+'</span>'
        +   '<span class="badge" style="background:transparent;border:1px solid var(--border);color:'+importeColor+';font-weight:600;">'+importeFmt+'</span>'
        +   statusTag
        +   delBtn
        + '</div>'
        + motivo
        + obs
        + '<div class="task-footer">'
        +   '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">👤 '+formatDisplayValue(a.nombre)+'</div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  var subText = list.length+' ajuste(s) hoy — total <b>'+totalImp.toFixed(2)+' €</b>';
  if(pendientes > 0){
    subText += ' · <b style="color:var(--amber);">'+pendientes+' pendiente(s) de asociar a turno</b>';
  }

  el.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<div><div class="page-title">⚙ Ajustes — hoy</div>'
    + '<div class="page-sub">'+subText+'</div></div>'
    + '<button class="btn btn-primary" onclick="openNewAjusteMod()">+ Nuevo ajuste</button>'
    + '</div>'
    + '<div>'+cards+'</div>';
}
window.renderAjustesMod = renderAjustesMod;

// ── Modal nuevo ajuste ────────────────────────────────────────────────
function openNewAjusteMod(){
  var ov = document.getElementById('modal-new-ajuste');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-new-ajuste';
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal" style="max-width:520px;">'
      + '<div class="modal-h"><h3>⚙ Nuevo ajuste</h3>'
      + '<button class="modal-x" onclick="closeModal(\'modal-new-ajuste\')">✕</button></div>'
      + '<div class="modal-b">'
      + '<div class="grid2">'
      +   '<div class="fg"><label>Tipo <span class="req">*</span></label><select id="na-tipo" onchange="onAjusteTipoChange()">'
      +     '<option value="">— Seleccionar —</option>'
      +     '<option>Anulación</option>'
      +     '<option>Devolución</option>'
      +     '<option>Invitación</option>'
      +     '<option>Error TPV</option>'
      +     '<option>Error cobro</option>'
      +     '<option>Cargo incorrecto</option>'
      +     '<option>Otro</option>'
      +   '</select>'
      +   '<div id="na-tipo-hint" style="font-size:11px;color:var(--text3);margin-top:4px;min-height:14px;"></div>'
      +   '</div>'
      +   '<div class="fg"><label>Importe (€) <span class="req">*</span></label><input type="number" id="na-importe" step="0.01" placeholder="0.00"></div>'
      + '</div>'
      + '<div class="fg"><label>Motivo</label><input type="text" id="na-motivo" placeholder="ej: mesa 12, cliente insatisfecho"></div>'
      + '<div class="fg"><label>Observación</label><input type="text" id="na-obs" placeholder="Nota opcional"></div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:6px;line-height:1.5;">'
      +   '<b>Regla:</b> Importe = (lo que hay en caja) − (lo que marca el TPV).<br>'
      +   'Anulación / Devolución / Invitación → se guarda automáticamente como <b>negativo</b>.<br>'
      +   'Error TPV / Error cobro / Cargo incorrecto / Otro → manual: <b>+</b> si sobra en caja, <b>−</b> si falta.'
      + '</div>'
      + '</div>'
      + '<div class="modal-f">'
      + '<button class="btn btn-secondary" onclick="closeModal(\'modal-new-ajuste\')">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="saveNewAjusteMod()">💾 Guardar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-new-ajuste'); });
  }
  ['na-importe','na-motivo','na-obs'].forEach(function(id){
    var x=document.getElementById(id); if(x) x.value='';
  });
  var t = document.getElementById('na-tipo'); if(t) t.value='';
  var h = document.getElementById('na-tipo-hint'); if(h) h.innerHTML='';
  ov.classList.add('open');
}
window.openNewAjusteMod = openNewAjusteMod;

// Tipos que fuerzan signo negativo (sale dinero de caja)
var AJUSTE_TIPOS_NEGATIVOS = ['Anulación','Devolución','Invitación'];

function onAjusteTipoChange(){
  var tipo = (document.getElementById('na-tipo')||{}).value || '';
  var h = document.getElementById('na-tipo-hint');
  if(!h) return;
  if(AJUSTE_TIPOS_NEGATIVOS.indexOf(tipo) >= 0){
    h.innerHTML = '<span style="color:var(--red);">→ se guardará como <b>negativo</b> (–)</span>';
  } else if(tipo){
    h.innerHTML = '<span style="color:var(--text3);">signo manual: + si sobra, − si falta</span>';
  } else {
    h.innerHTML = '';
  }
}
window.onAjusteTipoChange = onAjusteTipoChange;

async function saveNewAjusteMod(){
  var tipo    = (document.getElementById('na-tipo')||{}).value || '';
  var importe = parseFloat((document.getElementById('na-importe')||{}).value);
  var motivo  = ((document.getElementById('na-motivo')||{}).value || '').trim();
  var obs     = ((document.getElementById('na-obs')||{}).value || '').trim();

  if(!tipo){ toast('Tipo obligatorio','err'); return; }
  if(isNaN(importe)){ toast('Importe obligatorio (puede ser negativo)','err'); return; }

  // Auto-signo: tipos de salida de caja siempre negativos
  if(AJUSTE_TIPOS_NEGATIVOS.indexOf(tipo) >= 0){
    importe = -Math.abs(importe);
  }

  var rec = {
    id: genId(),
    shift_id: null,
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: currentUser.area||'',
    fecha: today(),
    tipo: tipo,
    importe: importe,
    motivo: motivo,
    obs: obs,
    created_at: localTs()
  };
  var result = await dbInsert('ajustes', rec);
  if(result === null){
    toast('Error: ajuste NO guardado (ver consola)','err');
    return;
  }
  invalidateCache('ajustes');
  auditLog('AJUSTE_NEW', tipo+' '+importe+'€ / '+motivo);
  toast('Ajuste registrado','ok');
  closeModal('modal-new-ajuste');
  renderAjustesMod();
}
window.saveNewAjusteMod = saveNewAjusteMod;

async function deleteAjusteItem(aid){
  if(!isAdmin(currentUser)){ toast('Solo admin','err'); return; }
  if(!confirm('¿Eliminar este ajuste?\n\nNo se puede deshacer.')) return;
  var all = await getDB('ajustes');
  var a = (all||[]).find(function(x){ return x.id===aid; });
  await auditLog('AJUSTE_DELETE', aid+' | '+JSON.stringify(a||{}).slice(0,200));
  await dbDelete('ajustes', aid);
  invalidateCache('ajustes');
  toast('Ajuste eliminado','ok');
  renderAjustesMod();
}
window.deleteAjusteItem = deleteAjusteItem;


function openNewIncidenciaStandalone(){
  var ov = document.getElementById('modal-new-inci');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-new-inci';
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal" style="max-width:520px;">'
      + '<div class="modal-h"><h3>⚠ Nueva incidencia</h3>'
      + '<button class="modal-x" onclick="closeModal(\'modal-new-inci\')">✕</button></div>'
      + '<div class="modal-b">'
      + '<div class="fg"><label>Tipo</label><select id="ni-tipo"></select></div>'
      + '<div class="fg"><label>Descripción</label><textarea id="ni-desc" rows="3" placeholder="Detalle de la incidencia..."></textarea></div>'
      + '<div class="fg"><label>Acción inmediata (opcional)</label><textarea id="ni-accion" rows="2" placeholder="¿Se hizo algo de inmediato?"></textarea></div>'
      + '</div>'
      + '<div class="modal-f">'
      + '<button class="btn btn-secondary" onclick="closeModal(\'modal-new-inci\')">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="saveNewIncidenciaStandalone()">💾 Guardar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-new-inci'); });
  }
  var sel = ov.querySelector('#ni-tipo');
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  var dept = (typeof _deptCatalogo === 'function') ? _deptCatalogo(currentUser) : (currentUser && currentUser.area || '');
  if(typeof populateInciTipoSelector === 'function'){
    populateInciTipoSelector('ni-tipo', dept);
  } else {
    ['Operativa','Cliente','Material','Otro'].forEach(function(t){
      var o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
    });
  }
  ov.querySelector('#ni-desc').value = '';
  ov.querySelector('#ni-accion').value = '';
  ov.classList.add('open');
}
window.openNewIncidenciaStandalone = openNewIncidenciaStandalone;

async function saveNewIncidenciaStandalone(){
  var tipo = (document.getElementById('ni-tipo')||{}).value || '';
  var desc = ((document.getElementById('ni-desc')||{}).value || '').trim();
  var accion = ((document.getElementById('ni-accion')||{}).value || '').trim();
  if(!desc){ toast('Descripción obligatoria','err'); return; }
  var rec = {
    id: genId(),
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: currentUser.area||'',
    departamento: currentUser.area||'',
    fecha: today(),
    tipo_incidencia: tipo || 'Otro',
    categoria: tipo || 'Otro',
    descripcion: desc,
    accion_inmediata: accion,
    estado: INCIDENT_STATES.ABIERTA,
    created_at: localTs()
  };
  try {
    await dbInsert('incidencias', rec);
    invalidateCache('incidencias');
    auditLog('INCIDENCIA_CREATE', rec.id+' | '+tipo+' | '+desc.slice(0,80));
    toast('Incidencia creada','ok');
    closeModal('modal-new-inci');
    renderIncidenciasScreen();
  } catch(e){
    toast('Error: '+e.message,'err');
  }
}
window.saveNewIncidenciaStandalone = saveNewIncidenciaStandalone;

// Encadenar al helper de rerender existente
(function(){
  var prev = window.rerenderActiveScreen;
  window.rerenderActiveScreen = function(){
    try { if(typeof prev==='function') prev(); } catch(_){}
    try { renderGestionesScreen(); } catch(_){}
    try { renderIncidenciasScreen(); } catch(_){}
  };
})();

// ═══════════════════════════════════════════════════════════════════════
// INIT — portal controls display, NOT this script
runMigrations();
seedEmployees();
mermaRows=[];
document.addEventListener('DOMContentLoaded', function() {
  var ls = document.getElementById('login-screen');
  var ap = document.getElementById('app');
  if(ls) ls.style.display='none';
  if(ap) ap.style.display='none';
});


/* ===== Bug 6 (corrección de caja en sitio) + Bug 7 (formato €) — helpers globales ===== */
window._cajaCorrectMode = false;
window._cajaCorrectNote = '';
window._recCorrectPrevEstado = '';
function fmtEur(v){
  var n = (typeof v === 'number') ? v : parseFloat(v);
  if(!isFinite(n)) n = 0;
  return n.toFixed(2).replace('.', ',') + ' €';
}
function canCorrectCaja(dept){
  if(!currentUser) return false;
  if(typeof canActAsAdmin === 'function' && canActAsAdmin()) return true;
  if(currentUser.rol === 'admin') return true;
  var d = (dept || '').toString();
  if(currentUser.rol === 'jefe_recepcion') return d === 'Recepción' || d === 'Recepcion' || d === 'Recepción SFERA';
  if(currentUser.rol === 'coord_recepcion_syncrolab') return d === 'SYNCROLAB' || d === 'SyncroLab' || d === 'Recepción SYNCROLAB';
  if(currentUser.rol === 'jefe' && currentUser.area === 'Sala') return d === 'Sala';
  return false;
}
function correctedBadge(row){
  if(!row || !row.corregida) return '';
  var by = row.corrected_by || '';
  var at = '';
  try { if(row.corrected_at) at = new Date(row.corrected_at).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}); } catch(e){ at = row.corrected_at || ''; }
  var note = row.correction_note ? (' — ' + row.correction_note) : '';
  return ' <span class="badge b-blue" title="Corregida por ' + by + ' · ' + at + note + '">✎ Corregida</span>';
}
window.fmtEur = fmtEur;
window.canCorrectCaja = canCorrectCaja;
window.correctedBadge = correctedBadge;
