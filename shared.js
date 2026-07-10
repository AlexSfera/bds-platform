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
  let data = await sbRequest('GET', table, null, 'order=created_at.asc');
  if (data === null) data = await sbRequest('GET', table, null, 'order=id.asc');
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
  const data = await dbGetAll(table);
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

// ── MIGRATION from localStorage to Supabase ──
async function migrateFromLocalStorage() {
  const tables = ['employees','shifts','merma','incidencias','gestiones','tareas','cash_closings','rec_shift_data','closing_audit_log'];
  let migrated = 0;
  for (const t of tables) {
    try {
      const local = JSON.parse(localStorage.getItem('syncro_' + t) || '[]');
      if (local.length > 0) {
        for (const row of local) {
          await sbRequest('POST', t, row, 'on_conflict=id&ignore_duplicates=true');
        }
        migrated += local.length;
        console.log('Migrated', local.length, 'rows from', t);
      }
    } catch(e) { console.warn('Migration error for', t, e); }
  }
  return migrated;
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
const ROLE_PINS = {'300415':'admin','0101':'chef','1010':'fb'};

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

var _DEPTS_NOMBRE_CLIENTE = ['Recepción','Recepción SYNCROLAB','Entrenadores','Fisioterapeutas'];
function _showNombreCliente(dept){ return _DEPTS_NOMBRE_CLIENTE.indexOf(dept) !== -1; }
window._showNombreCliente = _showNombreCliente;

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
  if(ROLE_PINS[currentPin]){
    const rol=ROLE_PINS[currentPin];
    found=employees.find(e=>e.rol===rol&&e.estado==='Activo')||{id:'SYS_'+rol,nombre:rol==='admin'?'Administrador':rol==='fb'?'F&B Manager':rol==='jefe_recepcion'?'Jefe Recepción':'Chef',rol,estado:'Activo',pin:currentPin,responsable:1,validador:1,area:rol==='jefe_recepcion'?'Recepción':rol==='fb'?'Sala':'Cocina',puesto:rol};
  } else {
    found=employees.find(e=>e.pin===currentPin&&e.estado==='Activo');
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
    var _fgNc = document.getElementById('fg-nombre-cliente');
    if(_fgNc){
      var _dNc = (typeof _deptCatalogo === 'function') ? _deptCatalogo(currentUser) : (currentUser ? currentUser.area : '');
      _fgNc.style.display = _showNombreCliente(_dNc) ? '' : 'none';
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
async function _doSaveTurno(){
  // ── Read all form values (already validated by saveTurno) ──
  // Fix Jun 2026: si fecha llega vacía (input borrado por jefe/coord, navegador
  // que ignora readonly, etc.) se usa today() como defensa.
  var fecha    = document.getElementById('t-fecha').value;
  if(!fecha){
    // FIX-CENA-MEDIANOCHE: fallback nocturno — Sala < 2h, Recepción < 7h
    fecha = today();
    var _hF = (new Date()).getHours();
    var _aF = currentUser ? String(currentUser.area||'') : '';
    if((_aF === 'Sala' && _hF < 2) || (_aF === 'Recepción' && _hF < 7)){
      var _fd = getDateOnly(new Date()); _fd.setDate(_fd.getDate()-1); fecha = toYMD(_fd);
    }
  }
  var _isRecSave = currentUser && currentUser.area === 'Recepción';
  const servicio = _isRecSave ? getRecTurnoValue() : getServicioValue();
  const horas    = parseFloat((document.getElementById('t-horas')||{value:''}).value)||null;
  const resp     = _isRecSave ? null : document.getElementById('t-responsable').value;
  const obs      = (document.getElementById('t-obs')||{value:''}).value.trim() || null;
  const ts       = localTs();
  const shiftId  = editingShiftId || genId();

  const employees = await getDB('employees');
  const respEmp   = employees.find(e=>e.id===resp);

  // ── Merma data ──
  const mermaData = collectMerma();

  // ── Build shift object ──
  // Sala data now collected via ajustes popup (_ajustesLines)
  var salaData = {};
  const gNomCli = (document.getElementById('g-nombre-cliente')||{value:''}).value.trim();

  const shift = {
    id: shiftId,
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: currentUser.area||'Cocina',
    puesto: currentUser.puesto||'—',
    fecha, servicio, horas,
    responsable_id: resp || null,
    responsable_nombre: _isRecSave ? currentUser.nombre : (respEmp ? respEmp.nombre : '—'),
    merma_declarada: sinMermaFlag ? 'no' : 'si',
    incidencia_declarada: toggleState.incidencia||'no',
    observacion: obs,
    nombre_cliente: gNomCli || null,
    checklist_items: JSON.stringify(_chkSavedState),
    kpi_entrenador: (typeof window._entrKpiState !== 'undefined' && window._entrKpiState) ? JSON.stringify(window._entrKpiState) : null,
    ajustes_sala: JSON.stringify(_ajustesLines||[]),
    // Sala fields
    descuentos_si: salaData.descuentos_si||false,
    descuentos_num: salaData.descuentos_num||0,
    descuentos_motivo: salaData.descuentos_motivo||'',
    anulaciones_si: salaData.anulaciones_si||false,
    anulaciones_num: salaData.anulaciones_num||0,
    anulaciones_motivo: salaData.anulaciones_motivo||'',
    invitaciones_si: salaData.invitaciones_si||false,
    invitaciones_tipo: salaData.invitaciones_tipo||'',
    invitaciones_num: salaData.invitaciones_num||0,
    invitaciones_producto: salaData.invitaciones_producto||'',
    invitaciones_posmews: salaData.invitaciones_posmews||false,
    devoluciones_si: salaData.devoluciones_si||false,
    devoluciones_num: salaData.devoluciones_num||0,
    devoluciones_motivo: salaData.devoluciones_motivo||'',
    devoluciones_cliente: salaData.devoluciones_cliente||false,
    estado: 'Pendiente',
    validado_por: null, validado_ts: null,
    comentario_validador: null,
    correcciones: [],
    hora_registro: ts, created_at: ts, updated_at: ts
  };
  var tareasCreadas = 0;
  var incidenciasCreadas = 0;

  // ── CORRECTION MODE: update existing shift ──
  if(editingShiftId){
    await dbUpdate('shifts', editingShiftId, {
      fecha, servicio, horas,
      responsable_id: resp,
      responsable_nombre: respEmp ? respEmp.nombre : '—',
      merma_declarada: sinMermaFlag ? 'no' : 'si',
      incidencia_declarada: toggleState.incidencia||'no',
      observacion: obs,
      checklist_items: JSON.stringify(_chkSavedState),
      kpi_entrenador: (typeof window._entrKpiState !== 'undefined' && window._entrKpiState) ? JSON.stringify(window._entrKpiState) : undefined,
      estado: 'Pendiente',
      validado_por: null, validado_ts: null,
      comentario_validador: null,
      correcciones: [],
      updated_at: ts
    });
    // Delete old merma + incidencias for this shift, insert new
    const allMerma = await getDB('merma');
    for(const m of allMerma){ if(m.shift_id===editingShiftId) await dbDelete('merma',m.id); }
    const allIncis = await getDB('incidencias');
    for(const i of allIncis){ if(i.shift_id===editingShiftId) await dbDelete('incidencias',i.id); }
    // BUG-REC-VENTAS: borrar ventas cross-sell antiguas del turno para evitar duplicados en reenvio
    const allRecVentas = await getDB('recepcion_ventas');
    for(const v of allRecVentas){ if(v.shift_id===editingShiftId) await dbDelete('recepcion_ventas',v.id); }
    // AJUSTES-TURNO: borrar ajustes viejos del turno (del modal Ajustes) para re-crearlos limpios
    const allAjustesPrev = await getDB('ajustes');
    for(const a of allAjustesPrev){ if(a.shift_id===editingShiftId) await dbDelete('ajustes', a.id); }
    invalidateCache('merma'); invalidateCache('incidencias'); invalidateCache('recepcion_ventas'); invalidateCache('ajustes');
    auditLog('CORRECTION_RESEND', currentUser.nombre+' — '+fecha+' — '+servicio);
    toast('Turno corregido y reenviado','ok');
    window._lastSavedShiftId = editingShiftId; // BUG-REC-VENTAS: necesario para _saveRecepcionVentas en correccion

  // ── NEW SHIFT ──
  } else {
    // GUARD: lógica de turnos por día (BUG-TURNO-03 + regla 2 turnos/día)
    // Reglas:
    //   1) Turno Pendiente/En corrección → NO bloquea (Jun 2026, decisión CEO):
    //      se permite registrar; solo se avisa de cuántos quedan sin validar.
    //   2) Si ya hay 1 turno Validado con horas < 5 → se permite un segundo turno.
    //   3) Si ya hay 1 turno Validado con horas >= 5 → no se permite otro en el mismo día.
    //   4) Si ya hay 2 turnos Validados → bloqueado siempre (tope 2/día).
    var _avisoPendientes = 0;
    try {
      var allShifts = await getDB('shifts');
      var turnosHoy = (allShifts||[]).filter(function(s){
        return s.employee_id === currentUser.id
          && (s.fecha||'').slice(0,10) === (fecha||'').slice(0,10);
      });
      // Regla 1: turnos pendientes → solo informativo, NO bloquea
      _avisoPendientes = turnosHoy.filter(function(s){
        return s.estado === 'Pendiente' || s.estado === 'En corrección';
      }).length;
      // Regla 2-4: el TOPE de 2 turnos/día cuenta TODOS los turnos del día
      // (pendientes + validados), no solo validados, para que no se acumulen
      // registros sin fin mientras el jefe no valida.
      if(turnosHoy.length >= 2){
        const alertArea = document.getElementById('turno-alert-area');
        if(alertArea){
          alertArea.innerHTML = '<div class="alert a-err">Ya tienes 2 turnos registrados hoy. No es posible registrar más.</div>';
        }
        toast('Máximo 2 turnos por día alcanzado','err');
        return;
      }
      var validadosHoy = turnosHoy.filter(function(s){
        return s.estado === 'Validado';
      });
      if(validadosHoy.length === 1){
        var primerTurno = validadosHoy[0];
        var horasPrimer = parseFloat(primerTurno.horas)||0;
        if(horasPrimer >= 5){
          const alertArea = document.getElementById('turno-alert-area');
          if(alertArea){
            alertArea.innerHTML = '<div class="alert a-err">Ya tienes un turno cerrado hoy de '
              + horasPrimer + 'h. Solo se permite un segundo turno si el primero fue inferior a 5 horas.</div>';
          }
          toast('Ya hay turno cerrado hoy (≥5h)','err');
          return;
        }
        // horasPrimer < 5 → se permite el segundo turno (continúa)
      }
    } catch(eGuard){
      console.error('Guard turno fallo, continuando', eGuard);
    }

    const savedShift=await dbInsert('shifts', shift);
    if(!savedShift){
      console.error('Shift insert failed',shift);
      const alertArea=document.getElementById('turno-alert-area');
      if(alertArea) alertArea.innerHTML='<div class="alert a-err">No se pudo guardar el turno. Inténtalo de nuevo.</div>';
      throw new Error('SHIFT_INSERT_FAILED');
    }
    invalidateCache('shifts');
    auditLog('SAVE_SHIFT', currentUser.nombre+' — '+fecha+' — '+servicio);
    toast('Turno guardado','ok');
    if(_avisoPendientes > 0){
      var _aaPend = document.getElementById('turno-alert-area');
      if(_aaPend){
        _aaPend.innerHTML = '<div class="alert a-warn">ℹ Tienes '+_avisoPendientes+' turno(s) de hoy sin validar por tu jefe. '
          + 'Puedes seguir registrando; tu jefe los validará después.</div>';
      }
    }
    window._lastSavedShiftId = shiftId; // for cierre caja link
    console.log('SYNCROSFERA QA shift guardado id',shiftId);
  }

  // ── Save merma lines (Cocina only, not Sala) ──
  var skipMerma = currentUser && (currentUser.area === 'Sala' || currentUser.area === 'Recepción');
  if(!skipMerma) for(const m of mermaData){
    await dbInsert('merma', {
      id:genId(), shift_id:shiftId,
      employee_id:currentUser.id, nombre:currentUser.nombre,
      area: currentUser.area||'',
      fecha, servicio,
      producto:m.producto, cantidad:m.cantidad, unidad:m.unidad,
      causa:m.causa, obs:m.obs||'',
      coste_unitario:0, coste_total:0,
      created_at:ts
    });
  }
  if(!skipMerma && mermaData.length) invalidateCache('merma');

  // ── Asociar mermas pendientes (sin turno) del empleado al turno nuevo ──
  // Solo aplica si Cocina/Friegue (skipMerma=false) y si NO estamos editando un turno existente
  if(!skipMerma && !editingShiftId){
    try {
      var pendientes = (await getDB('merma')).filter(function(m){
        return !m.shift_id && m.employee_id === currentUser.id;
      });
      for(const mp of pendientes){
        await dbUpdate('merma', mp.id, {shift_id: shiftId, servicio: servicio});
      }
      if(pendientes.length){
        invalidateCache('merma');
        await auditLog('MERMA_ASSOC', pendientes.length+' mermas asociadas a turno '+shiftId);
      }
    } catch(eAssoc){
      console.error('No se pudieron asociar mermas pendientes', eAssoc);
    }
  }

  // ── Guardar líneas del modal Ajustes (Sala/Recepción) en tabla `ajustes` ──
  // _ajustesLines viene del modal-ajustes (sala.js/caja.js). Cada línea = un
  // registro en la tabla ajustes, fuente de verdad que el jefe consulta en
  // Validación (bloque 4B). Antes solo iba a shifts.ajustes_sala como JSON
  // y el jefe NO lo veía. Tipos de descuento (Descuento/Anulación/Devolución/
  // Invitación) se guardan con importe negativo automáticamente.
  if(Array.isArray(_ajustesLines) && _ajustesLines.length > 0){
    var TIPOS_NEG_TURNO = ['Descuento','Anulación','Devolución','Invitación'];
    for(const l of _ajustesLines){
      var _impAj = parseFloat(l.importe)||0;
      if(TIPOS_NEG_TURNO.indexOf(l.tipo) >= 0) _impAj = -Math.abs(_impAj);
      await dbInsert('ajustes', {
        id: genId(),
        shift_id: shiftId,
        employee_id: currentUser.id,
        nombre: currentUser.nombre,
        area: currentUser.area||'',
        fecha: fecha,
        tipo: l.tipo,
        num: parseInt(l.num)||1,
        importe: _impAj,
        motivo: l.motivo||'',
        comunicado_responsable: l.comunicado_responsable||'',
        obs: '',
        created_at: ts
      });
    }
    invalidateCache('ajustes');
    await auditLog('AJUSTES_TURNO', _ajustesLines.length+' ajustes desde modal turno '+shiftId);
  }

  // ── Asociar ajustes pendientes (sin turno) del empleado al turno nuevo ──
  // Aplica a TODOS los empleados (no solo Sala). Solo si NO estamos editando.
  if(!editingShiftId){
    try {
      var pendAjustes = (await getDB('ajustes')).filter(function(a){
        return !a.shift_id && a.employee_id === currentUser.id;
      });
      for(const ap of pendAjustes){
        await dbUpdate('ajustes', ap.id, {shift_id: shiftId});
      }
      if(pendAjustes.length){
        invalidateCache('ajustes');
        await auditLog('AJUSTE_ASSOC', pendAjustes.length+' ajustes asociados a turno '+shiftId);
      }
    } catch(eAj){
      console.error('No se pudieron asociar ajustes pendientes', eAj);
    }
  }

  // ── Save gestión pendiente → tabla gestiones ──
  if(toggleState.gestion==='si'){
    const gTipoEl = document.getElementById('g-tipo');
    const gDescEl = document.getElementById('g-desc');
    const gDesc   = gDescEl ? gDescEl.value.trim() : '';
    const gTipo   = gTipoEl ? gTipoEl.value : '';
    const gPrio   = (document.getElementById('g-prioridad')||{}).value || 'media';
    const gHab    = ((document.getElementById('g-habitacion')||{}).value || '').trim();
    const gRes    = ((document.getElementById('g-reserva')||{}).value || '').trim();
    if(gDesc){
      const gRecord = {
        id:           genId(),
        shift_id:     shiftId,
        employee_id:  currentUser.id,
        nombre:       currentUser.nombre,
        area:         currentUser.area||'',
        departamento: currentUser.area||'',
        fecha,
        servicio,
        tipo_gestion: gTipo || 'Otro',
        descripcion:  gDesc,
        prioridad:    gPrio,
        habitacion:   gHab || null,
        num_reserva:  gRes || null,
        leido_por:    [],
        accion_tomada: '',
        estado:       INCIDENT_STATES.ABIERTA,
        informado_responsable: 'no',
        created_at:   ts
      };
      try {
        await dbInsert('gestiones', gRecord);
        invalidateCache('gestiones');
      } catch(eG) {
        const alertArea = document.getElementById('turno-alert-area');
        if(alertArea) alertArea.innerHTML='<div class="alert a-err">Error al guardar gestión: '+eG.message+'</div>';
        return;
      }
    }
  }

  // ── Generate tasks ──
  // Task from incidencia
  if(toggleState.incidencia==='si' && toggleState.inci_task==='si'){
    const dept = (document.getElementById('it-dept')||{}).value||'';
    const prio = (document.getElementById('it-prio')||{}).value||'Media';
    const dead = (document.getElementById('it-deadline')||{}).value||'';
    const desc = (document.getElementById('it-desc-task')||document.getElementById('it-desc')||{}).value||'';
    if(dept){
      var dlCheck=validateTaskDeadline(dead);
      if(!dlCheck.ok){ toast(dlCheck.msg,'err'); return; }
      var createdInciTask = await createTask({
        titulo: 'Tarea operativa — '+servicio+' — '+fecha,
        dept_destino: dept,
        dept_origen: currentUser.area||'Cocina',
        prioridad: prio, deadline: dead,
        descripcion: desc,
        origen: 'incidencia',
        shift_id: shiftId,
        creado_por: currentUser.nombre
      });
      if(!createdInciTask){
        console.error('Tarea de incidencia insert failed',{shift_id:shiftId});
        const alertArea=document.getElementById('turno-alert-area');
        if(alertArea) alertArea.innerHTML='<div class="alert a-err">No se pudo guardar la tarea de la incidencia. Inténtalo de nuevo.</div>';
        return;
      }
      tareasCreadas++;
    }
  }
  // Task from merma
  if(!sinMermaFlag && mermaData.length>0 && toggleState.merma_task==='si'){
    const dept = (document.getElementById('mt-dept')||{}).value||'';
    const prio = (document.getElementById('mt-prio')||{}).value||'Media';
    const dead = (document.getElementById('mt-deadline')||{}).value||'';
    const desc = (document.getElementById('mt-desc')||{}).value||'';
    if(dept){
      var dlCheck2=validateTaskDeadline(dead);
      if(!dlCheck2.ok){ toast(dlCheck2.msg,'err'); return; }
      var createdMermaTask = await createTask({
        titulo: 'Merma — '+servicio+' — '+fecha,
        dept_destino: dept,
        dept_origen: currentUser.area||'Cocina',
        prioridad: prio, deadline: dead,
        descripcion: desc,
        origen: 'merma',
        shift_id: shiftId,
        creado_por: currentUser.nombre
      });
      if(!createdMermaTask){
        console.error('Tarea de merma insert failed',{shift_id:shiftId});
        const alertArea=document.getElementById('turno-alert-area');
        if(alertArea) alertArea.innerHTML='<div class="alert a-err">No se pudo guardar la tarea de merma. Inténtalo de nuevo.</div>';
        return;
      }
      tareasCreadas++;
    }
  }

  // ── Save incidencia operativa → tabla incidencias ──
  if(toggleState.incidencia==='si'){
    const descEl     = document.getElementById('i-desc');
    const accionEl   = document.getElementById('i-accion');
    const staff      = getStaffImplicado();
    const tipoInciEl = document.getElementById('i-tipo-incidencia');
    const inciRecord = {
      id:           genId(),
      shift_id:     shiftId,
      employee_id:  currentUser.id,
      nombre:       currentUser.nombre,
      departamento: currentUser.area||'',
      area:         currentUser.area||'',
      fecha,
      servicio,
      categoria:    'Incidencia operativa',
      tipo_incidencia: tipoInciEl ? tipoInciEl.value : '',
      descripcion:  descEl ? descEl.value.trim() : '',
      accion_inmediata: accionEl ? accionEl.value.trim() : '',
      accion_tomada: '',
      requiere_formacion:  'no',
      requiere_disciplina: 'no',
      informado_responsable: 'no',
      estado:       INCIDENT_STATES.ABIERTA,
      severidad:    'Media',
      staff_implicado_ids:     JSON.stringify(staff.ids),
      staff_implicado_nombres: JSON.stringify(staff.nombres),
      created_at:   ts
    };
    try {
      await dbInsert('incidencias', inciRecord);
      incidenciasCreadas++;
      invalidateCache('incidencias');
    } catch(eI) {
      const alertArea=document.getElementById('turno-alert-area');
      if(alertArea) alertArea.innerHTML='<div class="alert a-err">Error al guardar incidencia: '+eI.message+'</div>';
      return;
    }
  }

  // ── Clean up and show result ──
  clearTurnoForm();
  renderCorrectionsPend();
  await renderMisTurnos();
  updateDots();

  // Show success message
  var alertArea = document.getElementById('turno-alert-area');
  if(alertArea){
    var msg = '✅ Turno guardado correctamente.';
    if(tareasCreadas>0) msg += ' Se crearon '+tareasCreadas+' tarea(s) en la pestaña Tareas.';
    alertArea.innerHTML = '<div class="alert a-ok" style="font-size:14px;padding:16px;line-height:1.6;">'+msg+'</div>';
    alertArea.scrollIntoView({behavior:'smooth', block:'start'});
    setTimeout(function(){ if(alertArea) alertArea.innerHTML=''; }, 6000);
  }

  // If tasks were created, refresh tareas screen too
  if(tareasCreadas>0){
    await renderTareas();
  }
  invalidateCache('shifts');
  invalidateCache('tareas');
  invalidateCache('incidencias');
  // ── Limpiar borrador checklist del localStorage y memoria ──
  // CRÍTICO: sin esto el checklist aparece tachado en el siguiente turno/login.
  if(typeof clearChkLocalStorage === 'function') clearChkLocalStorage();
  if(typeof resetChkState === 'function') resetChkState();
  console.log('SYNCROSFERA QA tareas guardadas',tareasCreadas);
  console.log('SYNCROSFERA QA incidencias guardadas',incidenciasCreadas);
}
