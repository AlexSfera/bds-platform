// ═══════════════════════════════════════════════════════════════
// SUPABASE CONFIG — replace localStorage with Supabase REST API
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://tsfhrpdpbkciofvejrao.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3GWGNkIs6byRG1F1BIxlkg_qhiRUgBt';

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
  coord_recepcion_syncrolab: ['Recepción SYNCROLAB', 'SyncroLab', 'SYNCROLAB'],
  coord_entrenadores: ['Entrenadores', 'SYNCROLAB', 'SyncroLab'],
  coord_fisioterapeutas: ['Fisioterapeutas', 'Clínica', 'SYNCROLAB', 'SyncroLab']
};

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
let _fioSelectedEmps = []; // [{id, nombre, puesto, area}] — autocomplete multi-select
let _fioAllEmps = [];      // full active employee list for search
let _peFioSelectedEmps = []; // same for post-error modal (pe- prefix)
let _peFioAllEmps = [];
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
function localTs(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0'); }
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
function startOfWeek(){ var d=new Date(); d.setHours(0,0,0,0); var day=d.getDay(), diff=d.getDate()-day+(day===0?-6:1); d.setDate(diff); return d.toISOString().split('T')[0]; }
function startOfMonth(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01'; }
function isOverdue(dl){ return dl && dl < today(); }
function getDateOnly(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function toYMD(date){
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function getMinTaskDeadline(){ var d=getDateOnly(new Date()); d.setDate(d.getDate()+1); return toYMD(d); }
function getMaxTaskDeadline(){ var d=getDateOnly(new Date()); d.setDate(d.getDate()+7); return toYMD(d); }
function validateTaskDeadline(deadline){
  if(!deadline) return {ok:false,msg:'El deadline es obligatorio.'};
  if(deadline<getMinTaskDeadline() || deadline>getMaxTaskDeadline()){
    return {ok:false,msg:'El deadline debe estar entre mañana y los próximos 7 días.'};
  }
  return {ok:true};
}
function normalizeTaskState(state){
  if(state==='Pendiente') return TASK_STATES.ABIERTA;
  if(state==='Completada') return TASK_STATES.CERRADA;
  if(state==='Verificada') return TASK_STATES.VALIDADA;
  if(state===TASK_STATES.EN_PROCESO) return TASK_STATES.EN_PROCESO;
  if(state===TASK_STATES.CERRADA) return TASK_STATES.CERRADA;
  if(state===TASK_STATES.VALIDADA) return TASK_STATES.VALIDADA;
  return TASK_STATES.ABIERTA;
}
function normalizeIncidentState(state){
  if(state==='Pendiente' || state==='Gestionada') return state==='Gestionada'?INCIDENT_STATES.CERRADA:INCIDENT_STATES.ABIERTA;
  if(state===INCIDENT_STATES.ABIERTA || state==='abierta') return INCIDENT_STATES.ABIERTA;
  if(state===INCIDENT_STATES.EN_PROCESO || state==='en proceso') return INCIDENT_STATES.EN_PROCESO;
  if(state===INCIDENT_STATES.CERRADA) return INCIDENT_STATES.CERRADA;
  if(state===INCIDENT_STATES.VALIDADA) return INCIDENT_STATES.VALIDADA;
  return INCIDENT_STATES.ABIERTA;
}
function isTaskOpen(t){ var s=normalizeTaskState(t&&t.estado); return s===TASK_STATES.ABIERTA||s===TASK_STATES.EN_PROCESO; }
function isIncidentOpen(i){ var s=normalizeIncidentState(i&&i.estado); return s===INCIDENT_STATES.ABIERTA||s===INCIDENT_STATES.EN_PROCESO; }
function normalizeDeptName(dept){ return String(dept||'').trim().toLowerCase(); }
function isAdmin(user){ return !!user && user.rol==='admin'; }
function isSupervisor(user){ return !!user && Object.prototype.hasOwnProperty.call(SUPERVISOR_DEPT_MAP,user.rol); }
function getSupervisorDepartments(user){
  if(!user) return [];
  if(isAdmin(user)) return ['*'];
  return SUPERVISOR_DEPT_MAP[user.rol] || (user.area?[user.area]:[]);
}
function canViewDepartment(user,dept){
  if(isAdmin(user)) return true;
  var d=normalizeDeptName(dept);
  if(!d) return false;
  return getSupervisorDepartments(user).map(normalizeDeptName).indexOf(d)!==-1;
}
function canValidateDepartment(user,dept){ return isAdmin(user) || (isSupervisor(user)&&canViewDepartment(user,dept)); }
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
function canValidateTask(user,task){ return isAdmin(user) && normalizeTaskState(task&&task.estado)===TASK_STATES.CERRADA; }
function canCloseTask(user,task){
  if(isAdmin(user)) return true;
  if(isSupervisor(user)) return canViewDepartment(user,task&&task.dept_destino);
  return false;
}
function canValidateShift(user,shift){ return canValidateDepartment(user,getRecordDepartment(shift)); }
function canEditCashClosing(user,closing){ return isAdmin(user) || (isSupervisor(user)&&canViewDepartment(user,getRecordDepartment(closing))) || (!!user&&(closing.responsable_id===user.id||closing.usuario_id===user.id)); }
function canCloseIncident(user,incident){ return isAdmin(user) || (isSupervisor(user)&&canViewDepartment(user,getRecordDepartment(incident))); }
function canValidateIncident(user,incident){ return isAdmin(user) && normalizeIncidentState(incident&&incident.estado)===INCIDENT_STATES.CERRADA; }
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
async function advanceIncident(incidentId,newEstado){
  var rows=await getDB('incidencias');
  var inci=rows.find(function(i){return i.id===incidentId;});
  if(!inci){ toast('No se encontró la incidencia.','err'); return; }
  var target=normalizeIncidentState(newEstado);
  if(target===INCIDENT_STATES.EN_PROCESO && !canCloseIncident(currentUser,inci)){ toast('No tienes permiso para gestionar incidencias de este departamento.','err'); return; }
  if(target===INCIDENT_STATES.VALIDADA && !canValidateIncident(currentUser,inci)){ toast('Solo Admin puede validar incidencias.','err'); return; }
  const saved=await dbUpdate('incidencias',incidentId,{estado: target});
  if(!saved){ toast('No se pudo actualizar la incidencia. Inténtalo de nuevo.','err'); return; }
  invalidateCache('incidencias');
  toast('Incidencia: '+target,'ok');
  if(typeof renderFollowupList==='function') renderFollowupList();
  if(typeof renderDashboard==='function' && document.getElementById('screen-dashboard')?.classList.contains('active')) renderDashboard();
}
async function auditLog(action,detail){
  const row={
    id:genId(),
    ts:new Date().toISOString(),
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
  var ls2=document.getElementById('login-screen'); if(ls2) ls2.style.display='none';
  // Ensure portal is completely out of the way
  var _portal=document.getElementById('portal-screen');
  if(_portal){ _portal.style.display='none'; _portal.style.pointerEvents='none'; _portal.style.visibility='hidden'; }
  document.getElementById('app').style.display='block';
  var unTop=document.getElementById('user-name-top'); if(unTop) unTop.textContent=currentUser.nombre;
  const rl={admin:'ADMIN',chef:'CHEF',fb:'F&B',jefe_recepcion:'JEF.REC',supervisor:'SUPERV.',mantenimiento:'MANT.',empleado:currentUser.area?currentUser.area.toUpperCase():'EMPLEADO'};
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
  var isSala = currentUser && currentUser.area === 'Sala';
  var isRecepcion = currentUser && currentUser.area === 'Recepción';
  const base=[
    {id:'readme',    label:'📋 Info'},
    {id:'turno',     label:'🕐 Mi Turno'},
    {id:'caja',      label:'💰 Cierre Caja'},
    {id:'tareas',    label:'🔗 Tareas'},
    {id:'validacion',label:'✅ Validación'},
    {id:'dashboard', label:'📊 Dashboard'},
    {id:'maestro',   label:'👥 Maestro'},
    {id:'export',    label:'⬇ Exportar'},
    {id:'rec-caja',  label:'🏦 Caja Recepción'},
  ];
  if(rol==='admin'){
    // Admin siempre ve todo, incluyendo Caja Recepción y Cierre Caja
    return [base[0],base[1],base[2],base[3],base[4],base[5],base[6],base[7],base[8]];
  }
  if(rol==='chef')  return [base[0],base[1],base[3],base[4],base[5],base[7]];
  if(rol==='fb')    return [base[0],base[1],base[2],base[3],base[4],base[5],base[7]];
  if(rol==='jefe_recepcion') return [base[0],base[1],base[3],base[4],base[5],base[8]];
  if(rol==='supervisor') return [base[0],base[1],base[3],base[4],base[5],base[7]];
  if(rol==='mantenimiento') return [base[0],base[1],base[3]];
  if(isSupervisor(currentUser)) return [base[0],base[1],base[3],base[4],base[5],base[7]];
  if(isSala)        return [base[0],base[1],base[2],base[3]];
  if(isRecepcion)   return [base[0],base[1],base[3],base[8]];
  return [base[0],base[1],base[3]];
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
    'validacion':_svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    'dashboard': _svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
    'maestro':   _svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    'export':    _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>')
  };
  const SHORT={'readme':'Info','turno':'Turno','tareas':'Tareas','validacion':'Valid.','dashboard':'Panel','maestro':'Equipo','export':'Export'};
  screens.forEach(s=>{
    // Desktop topbar
    const b=document.createElement('button');
    b.className='nav-btn'; b.id='nav-'+s.id;
    b.innerHTML=s.label+'<span class="alert-dot" id="dot-'+s.id+'"></span>';
    b.onclick=function(){showScreen(s.id);}; nav.appendChild(b);
    // Mobile bottom nav
    if(bnav){
      const bb=document.createElement('button');
      bb.className='bnav-btn'; bb.id='bnav-'+s.id;
      bb.innerHTML='<span class="bnav-icon">'+(ICONS[s.id]||'●')+'</span><span class="bnav-label">'+(SHORT[s.id]||s.id)+'</span><span class="bnav-dot" id="bdot-'+s.id+'"></span>';
      bb.onclick=function(){showScreen(s.id);}; bnav.appendChild(bb);
    }
  });
  // Show bottom nav
  var bn=document.getElementById('bottom-nav');
  if(bn) bn.style.display='block';
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
  const s=document.getElementById('screen-'+id); if(s) s.classList.add('active');
  const nb=document.getElementById('nav-'+id); if(nb) nb.classList.add('active');
  const bb=document.getElementById('bnav-'+id); if(bb) bb.classList.add('active');
  window.scrollTo(0,0);
  if(id==='turno'){ initTurnoForm(); }
  if(id==='tareas'){ renderTareas(); }
  if(id==='validacion'){ initValDeptFilter(); switchValTab('followup'); }
  if(id==='dashboard'){
    // Show dept filter for admin/fb
    var dw=document.getElementById('dash-dept-wrapper');
    if(dw) dw.style.display=(currentUser.rol==='admin'||currentUser.rol==='fb')?'block':'none';
    renderDashboard(); renderCostTable();
  }
  if(id==='rec-caja'){ renderRecepcionCajaList(); }
  if(id==='maestro'){ renderMaestro(); }
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
// TOGGLES
function onFioNingunoToggle(){
  if((document.getElementById('val-emp-ninguno')||{}).checked){
    _fioSelectedEmps=[];
    var tagsEl=document.getElementById('val-fio-tags');
    if(tagsEl) tagsEl.innerHTML='';
    var srch=document.getElementById('val-fio-search');
    if(srch) srch.value='';
    var dd=document.getElementById('val-fio-dropdown');
    if(dd) dd.style.display='none';
  }
}
function onFioSearch(q){
  q=(q||'').toLowerCase().trim();
  var dd=document.getElementById('val-fio-dropdown');
  if(!dd) return;
  var filtered=_fioAllEmps.filter(function(e){
    if(_fioSelectedEmps.some(function(s){return s.id===e.id;})) return false;
    if(!q) return true;
    return (e.nombre+' '+e.puesto+' '+(e.area||'')).toLowerCase().indexOf(q)!==-1;
  });
  if(!filtered.length){ dd.style.display='none'; return; }
  dd.innerHTML=filtered.slice(0,10).map(function(e){
    var esc=function(s){return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");};
    return '<div onclick="onFioSelectEmp(\''+esc(e.id)+'\',\''+esc(e.nombre)+'\',\''+esc(e.puesto)+'\',\''+esc(e.area||'')+'\',this)"'
      +' style="padding:7px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);"'
      +' onmouseover="this.style.background=\'var(--bg2)\'" onmouseout="this.style.background=\'\'">'
      +'<strong>'+formatDisplayValue(e.nombre)+'</strong>'
      +' <span style="font-size:11px;color:var(--text3)">'+e.puesto+(e.area?' · '+e.area:'')+'</span>'
      +'</div>';
  }).join('');
  dd.style.display='block';
}
function onFioSelectEmp(id,nombre,puesto,area){
  if(_fioSelectedEmps.some(function(s){return s.id===id;})) return;
  _fioSelectedEmps.push({id:id,nombre:nombre,puesto:puesto,area:area});
  var ninguno=document.getElementById('val-emp-ninguno');
  if(ninguno) ninguno.checked=false;
  var tagsEl=document.getElementById('val-fio-tags');
  if(tagsEl){
    var chip=document.createElement('span');
    chip.dataset.empId=id;
    chip.style.cssText='display:inline-flex;align-items:center;gap:4px;background:var(--bg2);border:1px solid #8b5cf6;border-radius:4px;padding:3px 8px;font-size:12px;';
    chip.innerHTML='<span>'+formatDisplayValue(nombre)+'</span>'
      +'<button onclick="onFioRemoveEmp(\''+id.replace(/'/g,"\\'")+'\')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;padding:0 0 0 2px;">×</button>';
    tagsEl.appendChild(chip);
  }
  var srch=document.getElementById('val-fio-search');
  if(srch) srch.value='';
  var dd=document.getElementById('val-fio-dropdown');
  if(dd) dd.style.display='none';
}
function onFioRemoveEmp(id){
  _fioSelectedEmps=_fioSelectedEmps.filter(function(s){return s.id!==id;});
  var tagsEl=document.getElementById('val-fio-tags');
  if(tagsEl){
    var chip=tagsEl.querySelector('[data-emp-id="'+id+'"]');
    if(chip) chip.remove();
  }
}
// ── Post-error modal FIO autocomplete (pe- prefix) ──
function onPeFioNingunoToggle(){
  if((document.getElementById('pe-emp-ninguno')||{}).checked){
    _peFioSelectedEmps=[];
    var t=document.getElementById('pe-fio-tags'); if(t) t.innerHTML='';
    var s=document.getElementById('pe-fio-search'); if(s) s.value='';
    var d=document.getElementById('pe-fio-dropdown'); if(d) d.style.display='none';
  }
}
function onPeFioSearch(q){
  q=(q||'').toLowerCase().trim();
  var dd=document.getElementById('pe-fio-dropdown'); if(!dd) return;
  var filtered=_peFioAllEmps.filter(function(e){
    if(_peFioSelectedEmps.some(function(s){return s.id===e.id;})) return false;
    if(!q) return true;
    return (e.nombre+' '+e.puesto+' '+(e.area||'')).toLowerCase().indexOf(q)!==-1;
  });
  if(!filtered.length){ dd.style.display='none'; return; }
  var esc=function(s){return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");};
  dd.innerHTML=filtered.slice(0,10).map(function(e){
    return '<div onclick="onPeFioSelectEmp(\''+esc(e.id)+'\',\''+esc(e.nombre)+'\',\''+esc(e.puesto)+'\',\''+esc(e.area||'')+'\',this)"'
      +' style="padding:7px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border);"'
      +' onmouseover="this.style.background=\'var(--bg2)\'" onmouseout="this.style.background=\'\'">'
      +'<strong>'+formatDisplayValue(e.nombre)+'</strong>'
      +' <span style="font-size:11px;color:var(--text3)">'+e.puesto+(e.area?' · '+e.area:'')+'</span>'
      +'</div>';
  }).join('');
  dd.style.display='block';
}
function onPeFioSelectEmp(id,nombre,puesto,area){
  if(_peFioSelectedEmps.some(function(s){return s.id===id;})) return;
  _peFioSelectedEmps.push({id:id,nombre:nombre,puesto:puesto,area:area});
  var ninguno=document.getElementById('pe-emp-ninguno'); if(ninguno) ninguno.checked=false;
  var tagsEl=document.getElementById('pe-fio-tags');
  if(tagsEl){
    var chip=document.createElement('span');
    chip.dataset.empId=id;
    chip.style.cssText='display:inline-flex;align-items:center;gap:4px;background:var(--bg2);border:1px solid #8b5cf6;border-radius:4px;padding:3px 8px;font-size:12px;';
    chip.innerHTML='<span>'+formatDisplayValue(nombre)+'</span>'
      +'<button onclick="onPeFioRemoveEmp(\''+id.replace(/'/g,"\\'")+'\')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;padding:0 0 0 2px;">×</button>';
    tagsEl.appendChild(chip);
  }
  var srch=document.getElementById('pe-fio-search'); if(srch) srch.value='';
  var dd=document.getElementById('pe-fio-dropdown'); if(dd) dd.style.display='none';
}
function onPeFioRemoveEmp(id){
  _peFioSelectedEmps=_peFioSelectedEmps.filter(function(s){return s.id!==id;});
  var tagsEl=document.getElementById('pe-fio-tags');
  if(tagsEl){
    var chip=tagsEl.querySelector('[data-emp-id="'+id+'"]');
    if(chip) chip.remove();
  }
}
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
    fio:{si:'fio-si',no:'fio-no'},
    posterr_fio:{si:'posterr-fio-si',no:'posterr-fio-no'},
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
function showTaskGen(type){ const el=document.getElementById('task-gen-'+type); if(!el) return; el.classList.add('visible'); setDeadlineLimits(); }
function hideTaskGen(type){ const el=document.getElementById('task-gen-'+type); if(!el) return; el.classList.remove('visible'); }

// ═══════════════════════════════════════════════════════════════════════
// MERMA ROWS
function addMermaRow(data={}){
  sinMermaFlag=false;
  document.getElementById('sinmerma-btn').className='tbtn';
  const rowId=genId(); mermaRows.push({rowId,...data}); renderMermaRows();
}
function removeMermaRow(rowId){ mermaRows=mermaRows.filter(r=>r.rowId!==rowId); renderMermaRows(); updMermaStatus(); }
function renderMermaRows(){
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
  setDeadlineLimits();
  editingShiftId=null;
  document.getElementById('turno-form-mode').textContent='NUEVO';
  document.getElementById('btn-save-turno').textContent='💾 Guardar Turno';
  const fechaInput = document.getElementById('t-fecha');
  fechaInput.value=today();
  // Employees can only register today (unless shift is being corrected)
  if(currentUser.rol==='empleado' && !editingShiftId){
    fechaInput.min = today();
    fechaInput.max = today();
    fechaInput.setAttribute('readonly','readonly');
  } else {
    fechaInput.removeAttribute('min');
    fechaInput.removeAttribute('max');
    fechaInput.removeAttribute('readonly');
  }
  const employees=await getDB('employees');
  const sel=document.getElementById('t-responsable');
  sel.innerHTML='<option value="">— Seleccionar —</option>';
  // Responsable filter: Sala sees Sala responsables, Cocina sees Cocina responsables
  var isSalaUser = currentUser && currentUser.area === 'Sala';
  var responsables = employees.filter(function(e) {
    var r = e.responsable;
    var isResp = r === 1 || r === true || r === '1' || r === 'true';
    var isActive = e.estado === 'Activo' || e.estado === 'activo';
    if(!isResp || !isActive) return false;
    // Sala users: ONLY Sala area responsables
    if(isSalaUser) return e.area === 'Sala';
    // Cocina/Friegue users: ONLY non-Sala responsables
    return e.area !== 'Sala';
  });
  responsables.forEach(function(e) {
    var o = document.createElement('option');
    o.value = e.id; o.textContent = e.nombre + ' — ' + e.puesto;
    o.style.background='#ffffff'; o.style.color='#111827';
    sel.appendChild(o);
  });
  if(responsables.length === 0) {
    // Fallback: all active
    employees.filter(function(e){return e.estado==='Activo';}).forEach(function(e){
      var o=document.createElement('option'); o.value=e.id; o.textContent=e.nombre;
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
    // Reset turno radios
    document.querySelectorAll('input[name="rec-turno"]').forEach(function(r){ r.checked=false; });
    updateRecTurnoStyle();
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
    document.querySelectorAll('input[name="servicio-sala"]').forEach(function(cb){ cb.checked=false; });
  document.querySelectorAll('input[name="servicio-cocina"]').forEach(function(cb){ cb.checked=false; });
    // Default gestion/incidencia to 'no' for clean start
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
  ['t-fecha','t-servicio','t-horas','t-obs','i-desc','i-accion','g-desc','g-tipo','i-tipo-incidencia','it-dept','it-prio','it-titulo','it-deadline','it-desc','mt-dept','mt-prio','mt-titulo','mt-deadline','mt-desc'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    if(el.tagName==='SELECT') el.value=''; else el.value=el.type==='date'?today():'';
  });
  const fechaInput = document.getElementById('t-fecha');
  if(fechaInput) fechaInput.value=today();
  // Employees can only register today (unless shift is being corrected)
  if(fechaInput && currentUser.rol==='empleado' && !editingShiftId){
    fechaInput.min = today();
    fechaInput.max = today();
    fechaInput.setAttribute('readonly','readonly');
  } else if(fechaInput) {
    fechaInput.removeAttribute('min');
    fechaInput.removeAttribute('max');
    fechaInput.removeAttribute('readonly');
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
  document.getElementById('t-fecha').value=s.fecha;
  document.getElementById('t-servicio').value=s.servicio;
  document.getElementById('t-horas').value=s.horas;
  document.getElementById('t-responsable').value=s.responsable_id||'';
  document.getElementById('t-obs').value=s.observacion||'';
  setT('incidencia',s.incidencia_declarada);
  sinMermaFlag=s.merma_declarada==='no';
  if(sinMermaFlag) document.getElementById('sinmerma-btn').className='tbtn t-si';
  const mermas=(await getDB('merma')).filter(m=>m.shift_id===shiftId);
  mermaRows=[]; mermas.forEach(m=>mermaRows.push({rowId:genId(),producto:m.producto,cantidad:m.cantidad,unidad:m.unidad||'uds',causa:m.causa,obs:m.observacion||''}));
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
  const fecha    = document.getElementById('t-fecha').value;
  var _isRecSave = currentUser && currentUser.area === 'Recepción';
  const servicio = _isRecSave ? getRecTurnoValue() : getServicioValue();
  const horas    = parseFloat(document.getElementById('t-horas').value)||0;
  const resp     = _isRecSave ? null : document.getElementById('t-responsable').value;
  const obs      = (document.getElementById('t-obs')||{value:''}).value.trim();
  const ts       = localTs();
  const shiftId  = editingShiftId || genId();

  const employees = await getDB('employees');
  const respEmp   = employees.find(e=>e.id===resp);

  // ── Merma data ──
  const mermaData = collectMerma();

  // ── Build shift object ──
  // Sala data now collected via ajustes popup (_ajustesLines)
  var salaData = {};

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
    checklist_items: JSON.stringify(_chkSavedState),
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
    invalidateCache('merma'); invalidateCache('incidencias');
    auditLog('CORRECTION_RESEND', currentUser.nombre+' — '+fecha+' — '+servicio);
    toast('Turno corregido y reenviado','ok');

  // ── NEW SHIFT ──
  } else {
    const savedShift=await dbInsert('shifts', shift);
    if(!savedShift){
      console.error('Shift insert failed',shift);
      const alertArea=document.getElementById('turno-alert-area');
      if(alertArea) alertArea.innerHTML='<div class="alert a-err">No se pudo guardar el turno. Inténtalo de nuevo.</div>';
      return;
    }
    invalidateCache('shifts');
    auditLog('SAVE_SHIFT', currentUser.nombre+' — '+fecha+' — '+servicio);
    toast('Turno guardado','ok');
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
      departamento: currentUser.area||'',
      fecha, servicio,
      producto:m.producto, cantidad:m.cantidad, unidad:m.unidad,
      causa:m.causa, obs:m.obs||'',
      coste_unitario:0, coste_total:0,
      created_at:ts
    });
  }
  if(!skipMerma && mermaData.length) invalidateCache('merma');

  // ── Save gestión pendiente → tabla gestiones ──
  if(toggleState.gestion==='si'){
    const gTipoEl = document.getElementById('g-tipo');
    const gDescEl = document.getElementById('g-desc');
    const gDesc   = gDescEl ? gDescEl.value.trim() : '';
    const gTipo   = gTipoEl ? gTipoEl.value : '';
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
  console.log('SYNCROSFERA QA tareas guardadas',tareasCreadas);
  console.log('SYNCROSFERA QA incidencias guardadas',incidenciasCreadas);
}


function saveTurno(){
  // Step 1: validate the form first (reuse validation logic)
  const alertArea=document.getElementById('turno-alert-area'); alertArea.innerHTML='';
  const errs=[];
  const fecha=document.getElementById('t-fecha').value;
  var _isRecepcion = currentUser && currentUser.area === 'Recepción';
  // Date lock: employees can only register today (unless correcting)
  if(currentUser.rol==='empleado' && !editingShiftId && fecha !== today()){
    alertArea.innerHTML='<div class="alert a-err">⚠ Solo puedes registrar el turno de hoy.</div>';
    return;
  }
  const servicio=getServicioValue();
  const horas=parseFloat(document.getElementById('t-horas').value);
  const resp=_isRecepcion ? 'ok' : document.getElementById('t-responsable').value;
  if(!fecha) errs.push('Fecha obligatoria');
  // Servicio/Turno validation — Recepción uses rec-turno radio, not servicio
  if(_isRecepcion){
    if(!servicio) errs.push('Selecciona turno: Mañana, Tarde o Noche');
  } else {
    if(!servicio||servicio==='[]'||servicio==='') errs.push('Servicio obligatorio');
  }
  if(!horas||horas<=0) errs.push('Horas obligatorias');
  // Responsable: only required for Sala and Cocina, NOT Recepción
  if(!_isRecepcion && !resp){
    var _isSala2 = currentUser && currentUser.area === 'Sala';
    errs.push(_isSala2 ? 'Responsable de turno obligatorio — configura responsables de Sala en Maestro' : 'Responsable obligatorio');
  }
  if(!toggleState.gestion) errs.push('Indica si queda alguna gestión pendiente');
  if(!toggleState.incidencia) errs.push('Indica si hubo incidencia operativa');
  // Merma validation — ONLY for Cocina/Friegue. Sala and Recepción exempt.
  var _isSalaUser = currentUser && currentUser.area === 'Sala';
  if(!_isSalaUser && !_isRecepcion){
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
function buildInciObj(shiftId,fecha,servicio,ts){
  var descEl=document.getElementById('i-desc');
  var accionEl=document.getElementById('i-accion');
  var staff=getStaffImplicado();
  return {
    id:genId(),shift_id:shiftId,employee_id:currentUser.id,nombre:currentUser.nombre,
    fecha,servicio,
    categoria:'Reportada por empleado',
    severidad:'Pendiente revision',
    descripcion:descEl?descEl.value.trim():'',
    accion_inmediata:accionEl?accionEl.value.trim():'',
    staff_implicado_ids:JSON.stringify(staff.ids),
    staff_implicado_nombres:JSON.stringify(staff.nombres),
    tipo_incidencia: (document.getElementById('i-tipo-incidencia')||{}).value||'',
    requiere_formacion:'No',
    requiere_disciplina:'No',
    estado:INCIDENT_STATES.ABIERTA,
    created_at:ts
  };
}
async function renderMisTurnos(){
  const shifts=(await getDB('shifts')).filter(s=>s.employee_id===currentUser.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,12);
  const el=document.getElementById('mis-turnos-table');
  if(!shifts.length){el.innerHTML='<div class="empty"><div class="empty-icon">📂</div><div class="empty-text">Sin registros</div></div>';return;}
  const mermas=await getDB('merma');
  const incidencias=await getDB('incidencias');
  var isSalaDept = currentUser && currentUser.area === 'Sala';
  // Build per-shift maps for gestión and incidencia
  var gestionMap={}, inciMap={};
  incidencias.forEach(function(i){
    if(!i.shift_id) return;
    if(i.categoria==='Gestión pendiente') gestionMap[i.shift_id]=true;
    else inciMap[i.shift_id]=true;
  });
  el.innerHTML='<table><tr><th>Fecha</th><th>Servicio</th><th>Horas</th>'+(isSalaDept?'<th>Ajustes</th>':'<th>Mermas</th>')+'<th>Gestión</th><th>Incid.</th><th>Estado</th></tr>'
  +shifts.map(function(s){
    const mc=mermas.filter(m=>m.shift_id===s.id).length;
    return '<tr>'
      +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(s.fecha)+'</td>'
      +'<td style="font-size:13px;">'+displayServicio(s.servicio)+'</td>'
      +'<td style="font-family:var(--font-mono)">'+s.horas+'h</td>'
      +'<td style="text-align:center">'+(isSalaDept?(function(){try{var aj=JSON.parse(s.ajustes_sala||'[]');return aj.length>0?'<span class="badge b-blue">'+aj.length+'</span>':'—';}catch(e){return '—';}})():(mc>0?'<span class="badge b-yellow">'+mc+'</span>':'—'))+'</td>'
      +'<td style="text-align:center">'+(gestionMap[s.id]?'<span class="badge b-yellow">Sí</span>':'—')+'</td>'
      +'<td style="text-align:center">'+(inciMap[s.id]?'<span class="badge b-red">Sí</span>':'—')+'</td>'
      +'<td>'+bEstado(s.estado)+'</td>'
      +'</tr>';
  }).join('') + '</table>';
}

// ═══════════════════════════════════════════════════════════════════════
// BADGE HELPERS
function bFU(v){if(v==='si')return'<span class="badge b-green">SÍ</span>';if(v==='no')return'<span class="badge b-red">NO</span>';if(v==='na')return'<span class="badge b-blue">N/A</span>';return'<span class="badge b-gray">—</span>';}
function bEstado(e){const m={'Validado':'b-green ✓ Validado','Pendiente':'b-red ● Pendiente','En corrección':'b-orange ↩ Corrección','Rechazado':'b-gray ✗ Rechazado'};const[cls,...r]=(m[e]||'b-gray '+e).split(' ');return`<span class="badge ${cls}">${r.join(' ')}</span>`;}
function bSev(s){if(s==='Crítica')return'<span class="badge b-red">⛔ CRÍTICA</span>';if(s==='Alta')return'<span class="badge b-red">🔴 Alta</span>';if(s==='Media')return'<span class="badge b-orange">🟠 Media</span>';return'<span class="badge b-blue">🟡 Baja</span>';}
function bPrio(p){if(p==='Alta')return'<span class="badge b-red">Alta</span>';if(p==='Media')return'<span class="badge b-orange">Media</span>';return'<span class="badge b-blue">Baja</span>';}
function bTaskEstado(e){var s=normalizeTaskState(e);if(s===TASK_STATES.VALIDADA)return'<span class="badge b-green">✓ Validada</span>';if(s===TASK_STATES.CERRADA)return'<span class="badge b-orange">Cerrada</span>';if(s===TASK_STATES.EN_PROCESO)return'<span class="badge b-blue">En proceso</span>';return'<span class="badge b-red">Abierta</span>';}
function bIncidentEstado(e){var s=normalizeIncidentState(e);if(s===INCIDENT_STATES.VALIDADA)return'<span class="badge b-green">✓ Validada</span>';if(s===INCIDENT_STATES.CERRADA)return'<span class="badge b-orange">Cerrada</span>';if(s===INCIDENT_STATES.EN_PROCESO)return'<span class="badge b-blue">En proceso</span>';return'<span class="badge b-red">Abierta</span>';}

// ═══════════════════════════════════════════════════════════════════════
// TASKS — CREATE
async function createTask(data){
  const ts=localTs();
  if(data.origen && data.origen!=='manual' && !data.shift_id){ toast('No se pudo crear la tarea asociada al turno. Inténtalo de nuevo.','err'); return null; }
  var dlCheck=validateTaskDeadline(data.deadline);
  if(!dlCheck.ok){ toast(dlCheck.msg,'err'); return null; }
  const task={id:genId(),titulo:data.titulo,dept_destino:data.dept_destino,dept_origen:data.dept_origen||currentUser.area||'Cocina',prioridad:data.prioridad,deadline:data.deadline,descripcion:data.descripcion||'',origen:data.origen||'manual',shift_id:data.shift_id||null,creado_por:data.creado_por||currentUser.nombre,estado:TASK_STATES.ABIERTA,completada_por:null,completada_ts:null,verificada_por:null,verificada_ts:null,notas_cierre:'',created_at:ts,updated_at:ts};
  const saved=await dbInsert('tareas', task);
  if(!saved){ console.error('Tarea insert failed',task); toast('No se pudo guardar la tarea. Inténtalo de nuevo.','err'); return null; }
  invalidateCache('tareas');
  auditLog('CREATE_TASK',`→ ${task.dept_destino}: ${task.titulo}`);
  toast(`Tarea creada → ${task.dept_destino}`,'ok');
  return task;
}
function bGestionEstado(st){
  if(!st||st==='Abierta') return '<span class="badge b-red">Abierta</span>';
  if(st==='En proceso') return '<span class="badge b-yellow">En proceso</span>';
  if(st==='Cerrada') return '<span class="badge b-green">Cerrada</span>';
  return '<span class="badge b-gray">'+st+'</span>';
}
function openTaskModal(){
  setDeadlineLimits();
  document.getElementById('mt-title').textContent='Nueva Tarea Manual';
  ['task-desc','task-deadline'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var deptEl=document.getElementById('task-dept'); if(deptEl) deptEl.value='';
  var prioEl=document.getElementById('task-prio'); if(prioEl) prioEl.value='';
  var origenEl=document.getElementById('task-dept-origen'); if(origenEl) origenEl.value=currentUser.area||'Cocina';
  document.getElementById('modal-tarea').classList.add('open');
}
async function saveTask(){
  const dept=document.getElementById('task-dept').value;
  const prio=document.getElementById('task-prio').value;
  const dead=document.getElementById('task-deadline').value;
  const desc=(document.getElementById('task-desc')||{}).value||'';
  if(!dept||!prio){toast('Departamento y prioridad son obligatorios','err');return;}
  var dlCheck=validateTaskDeadline(dead);
  if(!dlCheck.ok){toast(dlCheck.msg,'err');return;}
  const titulo='Tarea Manual — '+new Date().toLocaleDateString('es-ES')+' — '+dept;
  var created=await createTask({titulo,dept_destino:dept,dept_origen:(document.getElementById('task-dept-origen')||{}).value||currentUser.area||'Cocina',prioridad:prio,deadline:dead,descripcion:desc,origen:'manual',creado_por:currentUser.nombre});
  if(!created) return;
  await renderTareas();
  closeModal('modal-tarea'); renderTareas(); updateDots();
}

// ═══════════════════════════════════════════════════════════════════════
// TASKS — RENDER
async function renderTareas(){
  let tareas=await getDB('tareas');
  const estado=document.getElementById('tk-estado').value;
  const dept=document.getElementById('tk-dept').value;
  const prio=document.getElementById('tk-prio').value;
  const origen=document.getElementById('tk-origen').value;
  const desde=document.getElementById('tk-desde').value;
  const hasta=document.getElementById('tk-hasta').value;
  if(estado) tareas=tareas.filter(t=>normalizeTaskState(t.estado)===estado);
  if(dept) tareas=tareas.filter(t=>t.dept_destino===dept);
  if(prio) tareas=tareas.filter(t=>t.prioridad===prio);
  if(origen) tareas=tareas.filter(t=>t.origen===origen);
  if(desde) tareas=tareas.filter(t=>t.created_at.slice(0,10)>=desde);
  if(hasta) tareas=tareas.filter(t=>t.created_at.slice(0,10)<=hasta);
  tareas.sort((a,b)=>{ const ps={Alta:3,Media:2,Baja:1}; if(isTaskOpen(a)&&!isTaskOpen(b)) return -1; if(isTaskOpen(b)&&!isTaskOpen(a)) return 1; return (ps[b.prioridad]||0)-(ps[a.prioridad]||0); });

  // KPIs tareas
  const all=await getDB('tareas');
  const kpiEl=document.getElementById('tareas-kpi');
  const pend=all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.ABIERTA).length;
  const enProc=all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.EN_PROCESO).length;
  const comp=all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.CERRADA).length;
  const verif=all.filter(t=>normalizeTaskState(t.estado)===TASK_STATES.VALIDADA).length;
  const overdue=all.filter(t=>isOverdue(t.deadline)&&normalizeTaskState(t.estado)!==TASK_STATES.VALIDADA).length;
  kpiEl.innerHTML=`<div class="kpi-grid">
    <div class="kpi k-red"><div class="kpi-lbl">Abiertas</div><div class="kpi-val">${pend}</div></div>
    <div class="kpi k-blue"><div class="kpi-lbl">En proceso</div><div class="kpi-val">${enProc}</div></div>
    <div class="kpi k-orange"><div class="kpi-lbl">Cerradas</div><div class="kpi-val">${comp}</div><div class="kpi-sub">Pendientes de validar</div></div>
    <div class="kpi k-green"><div class="kpi-lbl">Validadas</div><div class="kpi-val">${verif}</div></div>
    <div class="kpi k-red"><div class="kpi-lbl">Vencidas</div><div class="kpi-val">${overdue}</div><div class="kpi-sub">Sin cerrar y deadline pasado</div></div>
  </div>`;

  const listEl=document.getElementById('tareas-list');
  if(!tareas.length){listEl.innerHTML='<div class="empty"><div class="empty-icon">🔗</div><div class="empty-text">Sin tareas con este filtro</div></div>';return;}
  listEl.innerHTML=tareas.map(t=>{
    const normState=normalizeTaskState(t.estado);
    const overdue=isOverdue(t.deadline)&&normState!==TASK_STATES.VALIDADA;
    const prioClass=t.prioridad==='Alta'?'t-alta':t.prioridad==='Media'?'t-media':'t-baja';
    const stateClass=normState===TASK_STATES.VALIDADA?'t-verificada':normState===TASK_STATES.CERRADA?'t-completada':'';
    const canProgress=canProgressTask(t);
    const canVerify=canValidateTask(currentUser,t);
    const canClose=canCloseTask(currentUser,t);
    return `<div class="task-card ${prioClass} ${stateClass}">
      <div class="task-meta">
        ${bPrio(t.prioridad)} ${deptBadge(t.dept_destino)}
        <span class="task-origin">origen: ${t.origen}</span>
        ${t.dept_origen?`<span class="task-origin">de: ${deptIcon(t.dept_origen)} ${t.dept_origen}</span>`:''}
        ${overdue?'<span class="badge b-red">⚠ VENCIDA</span>':''}
        ${bTaskEstado(t.estado)}
      </div>
      <div class="task-title">${t.titulo}</div>
      ${t.descripcion?`<div class="task-desc">${t.descripcion}</div>`:''}
      <div class="task-footer">
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">
          📅 ${fmtDate(t.deadline)} &nbsp;·&nbsp; creada por ${t.creado_por} &nbsp;·&nbsp; ${fmtDate(t.created_at.slice(0,10))}
          ${t.completada_por?`<br>✓ Cerrada por ${t.completada_por} · ${fmtTs(t.completada_ts)}`:''}
          ${t.verificada_por?`<br>✅ Validada por ${t.verificada_por} · ${fmtTs(t.verificada_ts)}`:''}
        </div>
        <div class="task-actions">
          ${canProgress&&normState===TASK_STATES.ABIERTA?`<button class="btn btn-blue-outline btn-sm" style="background:var(--blue-dim);border:1px solid var(--blue);color:var(--blue);" onclick="advanceTask('${t.id}','En proceso')">▶ Iniciar</button>`:''}
          ${canClose&&normState===TASK_STATES.EN_PROCESO?`<button class="btn btn-success btn-sm" onclick="advanceTask('${t.id}','Cerrada')">✓ Cerrar</button>`:''}
          ${canVerify?`<button class="btn btn-primary btn-sm" onclick="advanceTask('${t.id}','Validada')">✅ Validar</button>`:''}
          ${currentUser.rol==='admin'?`<button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="deleteTask('${t.id}')" title="Solo Admin">🗑 Eliminar</button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function deleteTask(taskId){
  if(!currentUser || currentUser.rol !== 'admin'){
    toast('Solo el Administrador puede eliminar tareas','err');
    return;
  }
  if(!confirm('¿Eliminar esta tarea permanentemente?\nEsta acción no se puede deshacer.')) return;
  try {
    var delRes = await fetch(
      SUPABASE_URL + '/rest/v1/tareas?id=eq.' + encodeURIComponent(taskId),
      { method:'DELETE', headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Prefer':'return=minimal'} }
    );
    if(delRes.ok){
      await auditLog('DELETE_TASK', 'Tarea '+taskId+' eliminada por '+currentUser.nombre);
      invalidateCache('tareas');
      toast('Tarea eliminada','ok');
      await renderTareas();
    } else {
      toast('Error al eliminar: '+delRes.status,'err');
    }
  } catch(e){ toast('Error: '+e.message,'err'); }
}

function canProgressTask(t){
  var state=normalizeTaskState(t&&t.estado);
  if(state===TASK_STATES.VALIDADA || state===TASK_STATES.CERRADA) return false;
  if(isAdmin(currentUser)) return true;
  if(isSupervisor(currentUser)) return canViewDepartment(currentUser,t&&t.dept_destino);
  return currentUser.area===t.dept_destino; // Empleado puede avanzar tarea de su dpto
}

async function advanceTask(taskId,newEstado){
  const tareas=await getDB('tareas');
  const idx=tareas.findIndex(t=>t.id===taskId); if(idx===-1) return;
  var targetState=normalizeTaskState(newEstado);
  if(targetState===TASK_STATES.VALIDADA && !canValidateTask(currentUser,tareas[idx])){toast('Solo Admin puede validar esta tarea.','err');return;}
  if(targetState===TASK_STATES.CERRADA && !canCloseTask(currentUser,tareas[idx])){toast('No tienes permiso para cerrar esta tarea.','err');return;}
  if(targetState===TASK_STATES.EN_PROCESO && !canProgressTask(tareas[idx])){toast('Solo el departamento destinatario puede avanzar esta tarea','err');return;}
  const ts=localTs();
  const tUpdate = {estado:targetState, updated_at:ts};
  if(targetState===TASK_STATES.CERRADA){tUpdate.completada_por=currentUser.nombre;tUpdate.completada_ts=ts;}
  if(targetState===TASK_STATES.VALIDADA){tUpdate.verificada_por=currentUser.nombre;tUpdate.verificada_ts=ts;}
  await dbUpdate('tareas', taskId, tUpdate);
  invalidateCache('tareas');
  auditLog('TASK_ADVANCE',`${currentUser.nombre} → ${newEstado}: ${tareas[idx].titulo}`);
  toast(`Tarea: ${newEstado}`,'ok');
  // BUG-51: refresh context — modal validación o Mi Turno
  if(typeof validatingShiftId !== 'undefined' && validatingShiftId){
    openValidarModal(validatingShiftId);
  } else {
    try{ renderTareas(); updateDots(); } catch(e){}
  }
}

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
}

function initValDeptFilter(){
  var sel=document.getElementById('v-dept');
  if(!sel||!currentUser) return;
  if(currentUser.rol==='chef'){
    sel.value='Cocina'; sel.disabled=true;
  } else if(currentUser.rol==='jefe_recepcion'){
    sel.value='Recepción'; sel.disabled=true;
  } else {
    sel.disabled=false;
  }
  onValDeptChange();
}

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
  if(dept) shifts=shifts.filter(s=>s.area===dept);
  if(serv) shifts=shifts.filter(function(s){
    if(!s.servicio) return false;
    if(s.area==='Recepción') return s.servicio===serv;
    try{ var arr=Array.isArray(s.servicio)?s.servicio:JSON.parse(s.servicio); return Array.isArray(arr)?arr.includes(serv):s.servicio===serv; }catch(e){ return s.servicio===serv; }
  });
  shifts.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const pend=shifts.filter(s=>s.estado==='Pendiente').length;
  document.getElementById('val-alerts').innerHTML=pend>0?`<div class="alert a-warn">⚠ ${pend} registro(s) pendiente(s)</div>`:'';
  const mermas=await getDB('merma'); const incis=await getDB('incidencias');
  const el=document.getElementById('validacion-table');
  if(!shifts.length){el.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin registros</div></div>';return;}
  // Build validation table without nested template literals
  var valRows="";
  shifts.forEach(function(s){
    var sm=mermas.filter(function(m){return recordMatchesShift(m,s);});
    var si=incis.filter(function(i){return recordMatchesShift(i,s);});
    var mCP=sm.some(function(m){return !m.coste_unitario||m.coste_unitario===0;});
    // For Sala: show ajustes count. For Cocina: show merma count
    var isSalaShift = s.area === 'Sala';
    var mCell;
    if(isSalaShift){
      try{ var aj=JSON.parse(s.ajustes_sala||'[]'); mCell=aj.length>0?'<span class="badge b-blue">'+aj.length+'</span>':'<span class="badge b-gray">—</span>'; }catch(e){ mCell='<span class="badge b-gray">—</span>'; }
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
    var btnRevisar = (!isReadOnly && canSupervise)
      ? '<button class="vbtn vbtn-primary" onclick="openValidarModal(\''+sid+'\')">Revisar</button>' : '';
    // BUG-50: turno validado también abre openValidarModal para permitir gestionar gestiones/incidencias
    var btnVer = (isReadOnly && canSupervise)
      ? '<button class="vbtn vbtn-sec" onclick="openValidarModal(\''+sid+'\')">📋 Ver</button>' : '';
    var btnArevisar = ((isAdmin(currentUser)||currentUser.rol==='fb')&&s.estado==='Validado')
      ? '<button class="vbtn vbtn-warn" onclick="openPostErrorModal(\''+sid+'\')">🔍</button>' : '';
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
      +'<td style="text-align:center;">'+(s.fio===true?'<span class="badge b-red">FIO</span>':s.estado!=='Pendiente'?'<span style="color:var(--green);">✓</span>':'<span style="color:var(--text3);">—</span>')+'</td>'
      +'<td>'+bEstado(s.estado)+'</td><td>'+aCell+'</td></tr>';
  });
  el.innerHTML='<table><tr><th>Fecha</th><th>Empleado</th><th>Servicio</th><th>Horas</th><th>Ajustes</th><th>Incid.</th><th>Merma</th><th>FIO</th><th>Estado</th><th>Acción</th></tr>'+valRows+'</table>';
}
async function valAdvanceGestion(gid,isTask,newState){
  if(isTask){
    var tt=await getDB('tareas'); var t=tt.find(function(x){return x.id===gid;}); if(!t) return;
    await dbUpdate('tareas',gid,{estado:TASK_STATES.EN_PROCESO,updated_at:localTs()});
    invalidateCache('tareas');
    auditLog('VAL_GESTION_ADVANCE',currentUser.nombre+' → En proceso: '+t.titulo+' (shift '+validatingShiftId+')');
  } else {
    await dbUpdate('incidencias',gid,{estado:INCIDENT_STATES.EN_PROCESO});
    invalidateCache('incidencias');
    auditLog('VAL_GESTION_ADVANCE',currentUser.nombre+' → En proceso (gestión-inci '+gid+', shift '+validatingShiftId+')');
  }
  toast('En proceso','ok'); await openValidarModal(validatingShiftId);
}
function valShowCloseGestionForm(gid,isTask){
  var c=document.getElementById('g-btn-'+gid); if(!c) return;
  var sid=validatingShiftId;
  c.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;width:100%;">'
    +'<label style="font-size:11px;color:var(--text3);">Acción para cerrar <span style="color:var(--red)">*</span></label>'
    +'<textarea id="gclose-text-'+gid+'" rows="2" placeholder="Describe la acción tomada..." style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;padding:6px 8px;resize:vertical;outline:none;width:100%;box-sizing:border-box;"></textarea>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="vbtn vbtn-warn" onclick="valSaveCloseGestion(\''+gid+'\','+isTask+')">💾 Guardar cierre</button>'
    +'<button class="vbtn" onclick="openValidarModal(\''+sid+'\')">Cancelar</button>'
    +'</div></div>';
}
async function valSaveCloseGestion(gid,isTask){
  var txt=((document.getElementById('gclose-text-'+gid)||{}).value||'').trim();
  if(!txt){toast('El campo "Acción para cerrar" es obligatorio','err');return;}
  var ts=localTs();
  if(isTask){
    var tt=await getDB('tareas'); var t=tt.find(function(x){return x.id===gid;}); if(!t) return;
    var tgMins=Math.round((Date.now()-new Date(t.created_at).getTime())/60000);
    await dbUpdate('tareas',gid,{estado:TASK_STATES.CERRADA,notas_cierre:txt,completado_por:currentUser.nombre,completado_ts:ts,tiempo_gestion:tgMins,updated_at:ts});
    invalidateCache('tareas');
    auditLog('GESTION_CERRADA','id: '+gid+' | tiempo: '+tgMins+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  } else {
    var ii=await getDB('incidencias'); var inc=ii.find(function(x){return x.id===gid;}); if(!inc) return;
    var tgMinsI=Math.round((Date.now()-new Date(inc.created_at).getTime())/60000);
    await dbUpdate('incidencias',gid,{estado:INCIDENT_STATES.CERRADA,accion_inmediata:txt,cerrado_ts:ts,tiempo_gestion:tgMinsI});
    invalidateCache('incidencias');
    auditLog('GESTION_CERRADA','id: '+gid+' | tiempo: '+tgMinsI+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  }
  toast('Gestión cerrada','ok'); await openValidarModal(validatingShiftId);
}

async function valAdvanceGestionNew(gid, newState){
  var gg=await getDB('gestiones'); var g=gg.find(function(x){return x.id===gid;}); if(!g) return;
  await dbUpdate('gestiones',gid,{estado:newState});
  invalidateCache('gestiones');
  auditLog('VAL_GESTION_ADVANCE',currentUser.nombre+' → '+newState+': gestión '+gid+' (shift '+validatingShiftId+')');
  toast('Estado actualizado','ok'); await openValidarModal(validatingShiftId);
}
function valShowCloseGestionNewForm(gid, shiftId){
  var c=document.getElementById('g-btn-'+gid); if(!c) return;
  c.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;width:100%;">'
    +'<label style="font-size:11px;color:var(--text3);">Acción tomada para cerrar <span style="color:var(--red)">*</span></label>'
    +'<textarea id="gnew-close-'+gid+'" rows="2" placeholder="Describe la acción tomada..." style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;padding:6px 8px;resize:vertical;width:100%;box-sizing:border-box;"></textarea>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="vbtn vbtn-warn" onclick="valSaveCloseGestionNew(\''+gid+'\')">💾 Guardar cierre</button>'
    +'<button class="vbtn" onclick="openValidarModal(\''+shiftId+'\')">Cancelar</button>'
    +'</div></div>';
}
async function valSaveCloseGestionNew(gid){
  var txt=((document.getElementById('gnew-close-'+gid)||{}).value||'').trim();
  if(!txt){toast('Acción tomada obligatoria','err');return;}
  var gg=await getDB('gestiones'); var g=gg.find(function(x){return x.id===gid;}); if(!g) return;
  var tgMins=Math.round((Date.now()-new Date(g.created_at).getTime())/60000);
  var ts=localTs();
  await dbUpdate('gestiones',gid,{estado:'Cerrada',accion_tomada:txt,cerrado_por:currentUser.nombre,cerrado_ts:ts,tiempo_gestion:tgMins,updated_at:ts});
  invalidateCache('gestiones');
  auditLog('GESTION_CERRADA','id: '+gid+' | tiempo: '+tgMins+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  toast('Gestión cerrada','ok'); await openValidarModal(validatingShiftId);
}

async function valAdvanceInci(iid){
  await dbUpdate('incidencias',iid,{estado:INCIDENT_STATES.EN_PROCESO});
  invalidateCache('incidencias');
  auditLog('VAL_INCI_ADVANCE',currentUser.nombre+' → En proceso: incidencia '+iid+' (shift '+validatingShiftId+')');
  toast('En proceso','ok'); await openValidarModal(validatingShiftId);
}
function valShowCloseInciForm(iid){
  var c=document.getElementById('i-btn-'+iid); if(!c) return;
  var sid=validatingShiftId;
  c.innerHTML='<div style="display:flex;flex-direction:column;gap:6px;width:100%;">'
    +'<label style="font-size:11px;color:var(--text3);">Acción para cerrar <span style="color:var(--red)">*</span></label>'
    +'<textarea id="iclose-text-'+iid+'" rows="2" placeholder="Describe la acción tomada..." style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;padding:6px 8px;resize:vertical;outline:none;width:100%;box-sizing:border-box;"></textarea>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="vbtn vbtn-warn" onclick="valSaveCloseInci(\''+iid+'\')">💾 Guardar cierre</button>'
    +'<button class="vbtn" onclick="openValidarModal(\''+sid+'\')">Cancelar</button>'
    +'</div></div>';
}
async function valSaveCloseInci(iid){
  var txt=((document.getElementById('iclose-text-'+iid)||{}).value||'').trim();
  if(!txt){toast('El campo "Acción para cerrar" es obligatorio','err');return;}
  var ii=await getDB('incidencias'); var inc=ii.find(function(x){return x.id===iid;}); if(!inc) return;
  var ts=localTs();
  var tgMins=Math.round((Date.now()-new Date(inc.created_at).getTime())/60000);
  await dbUpdate('incidencias',iid,{estado:INCIDENT_STATES.CERRADA,accion_inmediata:txt,cerrado_ts:ts,tiempo_gestion:tgMins});
  invalidateCache('incidencias');
  auditLog('INCIDENCIA_CERRADA','id: '+iid+' | tiempo: '+tgMins+' min | accion: '+txt+' (shift '+validatingShiftId+')');
  toast('Incidencia cerrada','ok'); await openValidarModal(validatingShiftId);
}

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

  // Block 2: Checklist
  if(s.checklist_items){
    try{
      var chk=JSON.parse(s.checklist_items);
      var isFriegueS=s.area==='Friegue'||s.puesto==='Friegue';
      var chkItems=isFriegueS?CHK_FRIEGUE_ITEMS:CHK_COCINA_ITEMS;
      var chkDone=chk.filter(Boolean).length;
      info += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;">';
      info += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#2ec4b6;letter-spacing:.15em;margin-bottom:8px;">CHECKLIST ('+chkDone+'/'+chk.length+')</div>';
      chk.forEach(function(c,i){
        if(i<chkItems.length){
          info += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;">'
            +'<span style="color:'+(c?'var(--green)':'var(--red)')+';font-size:14px;">'+(c?'✓':'✗')+'</span>'
            +'<span style="color:'+(c?'var(--text)':'var(--text3)')+'">'+chkItems[i]+'</span>'
            +'</div>';
        }
      });
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
      var iClosedNow = iState===INCIDENT_STATES.CERRADA||iState===INCIDENT_STATES.VALIDADA;
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

  // Block 5: Merma (editable)
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
  // Init FIO autocomplete
  _fioSelectedEmps=[];
  var tagsEl=document.getElementById('val-fio-tags');
  if(tagsEl) tagsEl.innerHTML='';
  var srchEl=document.getElementById('val-fio-search');
  if(srchEl) srchEl.value='';
  var ddEl=document.getElementById('val-fio-dropdown');
  if(ddEl) ddEl.style.display='none';
  var ningunoEl=document.getElementById('val-emp-ninguno');
  if(ningunoEl) ningunoEl.checked=false;
  getDB('employees').then(function(emps){
    _fioAllEmps=emps.filter(function(e){return e.estado==='Activo';});
  });
  // Reset FIO toggles
  ['fio-si','fio-no'].forEach(function(id){var el=document.getElementById(id);if(el)el.className='tbtn';});
  toggleState.fio=null;
  document.getElementById('val-gravedad').value='';
  document.getElementById('val-tipo-error').value='';
  if(document.getElementById('val-impacto-bonus')) document.getElementById('val-impacto-bonus').value='';
  if(document.getElementById('val-num-errores')) document.getElementById('val-num-errores').value='0';
  document.getElementById('modal-validar').classList.add('open');
}
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
  var fio = toggleState.fio === 'si';
  var valGravedad = (document.getElementById('val-gravedad')||{}).value || '';
  var valTipoError = (document.getElementById('val-tipo-error')||{}).value || '';
  var errorEmpId=_fioSelectedEmps.length>0?JSON.stringify(_fioSelectedEmps.map(function(e){return e.id;})):'';
  var errorEmpNombre=_fioSelectedEmps.length>0?JSON.stringify(_fioSelectedEmps.map(function(e){return e.nombre;})):'';
  var valNumErrores=_fioSelectedEmps.length;

  // CRITICAL: save all validation fields to Supabase
  var valCosteMerma = parseFloat((document.getElementById('val-coste-total')||{}).value)||0;
  var updatePayload = {
    estado: newEstado,
    validado_por: currentUser.nombre,
    validado_ts: localTs(),
    comentario_validador: comentario,
    fio: fio,
    gravedad_error: valGravedad,
    tipo_error: valTipoError,
    impacto_bonus: (document.getElementById('val-impacto-bonus')||{}).value||'',
    num_errores: valNumErrores,
    error_employee_id: errorEmpId,
    error_employee_nombre: errorEmpNombre,
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

  if(desde){shifts=shifts.filter(s=>s.fecha>=desde);mermas=mermas.filter(m=>m.fecha>=desde);incis=incis.filter(i=>i.fecha>=desde);}
  if(servFilt){shifts=shifts.filter(s=>s.servicio===servFilt);mermas=mermas.filter(m=>m.servicio===servFilt);incis=incis.filter(i=>i.servicio===servFilt);}
  if(empFilt) shifts=shifts.filter(s=>s.nombre===empFilt);
  if(tipoErrorFilt) shifts=shifts.filter(s=>s.tipo_error===tipoErrorFilt);
  if(sevFilt) shifts=shifts.filter(s=>s.gravedad_error===sevFilt);

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
  const totalFIO=shifts.filter(s=>s.fio===true).length;
  const totalErrores=shifts.reduce((a,s)=>a+(parseInt(s.num_errores)||0),0);
  document.getElementById('kpi-grid').innerHTML=
    '<div class="kpi k-amber"><div class="kpi-lbl">Turnos</div><div class="kpi-val">'+totalH+'</div><div class="kpi-sub">'+valH+' validados · '+pendH+' pendientes</div></div>'+
    '<div class="kpi k-green"><div class="kpi-lbl">Horas</div><div class="kpi-val">'+totalHoras.toFixed(1)+'h</div><div class="kpi-sub">Prom. '+(totalH?(totalHoras/totalH).toFixed(1):0)+'h/turno</div></div>'+
    '<div class="kpi k-orange"><div class="kpi-lbl">Coste merma</div><div class="kpi-val">'+costeMerma.toFixed(0)+'€</div><div class="kpi-sub">'+mermas.length+' líneas totales</div></div>'+
    '<div class="kpi k-red"><div class="kpi-lbl">Incidencias</div><div class="kpi-val">'+inciAb+'</div><div class="kpi-sub">'+incis.length+' total · '+inciAb+' abiertas</div></div>'+
    (function(){
    var fioEl=document.getElementById('dash-fio-count');
    if(fioEl) fioEl.textContent='('+totalFIO+' registros)';
    return (function(){
    var fioToday=shifts.filter(function(s){return (s.fio===true||s.fio===1||s.fio==='true')&&s.fecha===today();}).length;
    var fioCrit=shifts.filter(function(s){return s.fio===true&&(s.gravedad_error==='Alta'||s.gravedad_error==='Crítica');}).length;
    var fioPend=shifts.filter(function(s){return s.fio===true&&(!s.validado_por);}).length;
    var fioByEmp={};
    shifts.filter(function(s){return s.fio===true&&s.error_employee_nombre;}).forEach(function(s){
      fioByEmp[s.error_employee_nombre]=(fioByEmp[s.error_employee_nombre]||0)+1;
    });
    var topEmp=Object.keys(fioByEmp).sort(function(a,b){return fioByEmp[b]-fioByEmp[a];})[0]||'—';
    return '<div class="kpi k-red"><div class="kpi-lbl">FIO total</div><div class="kpi-val">'+totalFIO+'</div><div class="kpi-sub">'+fioToday+' hoy</div></div>'
      +'<div class="kpi k-red"><div class="kpi-lbl">FIO Alta/Crítica</div><div class="kpi-val">'+fioCrit+'</div><div class="kpi-sub">Máx. severidad</div></div>'
      +'<div class="kpi k-orange"><div class="kpi-lbl">FIO Pendiente</div><div class="kpi-val">'+fioPend+'</div><div class="kpi-sub">Sin validar</div></div>'
      +'<div class="kpi k-amber"><div class="kpi-lbl">+ FIO empleado</div><div class="kpi-val" style="font-size:13px;font-weight:700;">'+topEmp+'</div><div class="kpi-sub">'+(fioByEmp[topEmp]||0)+' FIO</div></div>';
  })();
  })()+

    '<div class="kpi k-purple"><div class="kpi-lbl">Tareas pend.</div><div class="kpi-val">'+tasksPend+'</div><div class="kpi-sub">'+tareas.filter(function(t){return t.estado==='Verificada';}).length+' verificadas</div></div>';

  // Empleados
  const eMap={};
  shifts.forEach(s=>{ if(!eMap[s.nombre]) eMap[s.nombre]={nombre:s.nombre,puesto:s.puesto,turnos:0,horas:0,mermas:0,incis:0}; eMap[s.nombre].turnos++;eMap[s.nombre].horas+=parseFloat(s.horas)||0;if(s.merma_declarada==='si')eMap[s.nombre].mermas++;if(s.incidencia_declarada==='si')eMap[s.nombre].incis++; });
  const eRows=Object.values(eMap).sort((a,b)=>b.horas-a.horas);
  const empEl=document.getElementById('dash-emp-table');
  // FIO counted by RESPONSIBLE (error_employee_id/nombre)
  var fioMap={};
  shifts.filter(function(s){return s.fio===true||s.fio===1||s.fio==='true';}).forEach(function(s){
    // Count FIO to the person responsible (error_employee), not the reporter
    var respKey = s.error_employee_nombre || s.nombre;
    if(!fioMap[respKey]) fioMap[respKey] = 0;
    fioMap[respKey]++;
    // Also ensure that person appears in empMap (they may not have filed shifts in filter)
    if(!eMap[respKey]) eMap[respKey]={nombre:respKey,puesto:s.error_employee_nombre?s.puesto:'—',turnos:0,horas:0,mermas:0,incis:0};
  });
  Object.keys(eMap).forEach(function(k){ eMap[k].fio_count = fioMap[eMap[k].nombre]||0; });
  const eRows2=Object.values(eMap).sort((a,b)=>b.horas-a.horas);
  empEl.innerHTML=eRows2.length?'<table><tr><th>Empleado</th><th>Turnos</th><th>Horas</th><th>Incid.</th><th>FIO</th></tr>'+eRows2.map(function(e){
    return '<tr><td><div style="font-weight:600">'+e.nombre+'</div><div style="font-size:11px;color:var(--text3)">'+e.puesto+'</div></td><td style="font-family:var(--font-mono)">'+e.turnos+'</td><td style="font-family:var(--font-mono)">'+e.horas.toFixed(1)+'h</td><td>'+( e.incis>0?'<span class="badge b-red">'+e.incis+'</span>':'—')+'</td><td>'+(e.fio_count>0?'<span class="badge b-red">'+e.fio_count+'</span>':'—')+'</td><td style="font-family:var(--font-mono);color:'+(e.error_count>0?'var(--red)':'var(--text3)')+'">'+( e.error_count>0?e.error_count:'—')+'</td></tr>';
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
  // ── FIO Table ──────────────────────────────────────────
  var fioEl2=document.getElementById('dash-fio-table');
  if(fioEl2){
    var fioShifts2=shifts.filter(function(s){return s.fio===true||s.fio===1||s.fio==='true'||s.fio==='1';});
    var fioKpiEl=document.getElementById('dash-fio-count');
    if(fioKpiEl) fioKpiEl.textContent='('+fioShifts2.length+' registros)';
    if(!fioShifts2.length){
      fioEl2.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin FIO en el periodo</div></div>';
    } else {
      var fioRows2='';
      fioShifts2.forEach(function(s){
        var staffI=incis.filter(function(i){return i.shift_id===s.id;});
        var sn='—'; try{if(staffI.length&&staffI[0].staff_implicado_nombres){var ar=JSON.parse(staffI[0].staff_implicado_nombres);sn=ar.join(', ');}}catch(e){}
        var infR=staffI.length?(staffI[0].informado_responsable==='si'?'<span class="badge b-green">✓ Sí</span>':'<span class="badge b-gray">No</span>'):'—';
        fioRows2+='<tr>'
          +'<td style="font-family:var(--font-mono);font-size:11px">'+fmtDate(s.fecha)+'</td>'
          +'<td style="font-weight:600">'+s.nombre+'</td>'
          +'<td>'+(s.error_employee_nombre||'—')+'</td>'
          +'<td style="font-size:11px">'+sn+'</td>'
          +'<td style="font-size:13px;">'+displayServicio(s.servicio)+'</td>'
          +'<td>'+(s.tipo_error?'<span class="badge b-orange">'+s.tipo_error+'</span>':'—')+'</td>'
          +'<td>'+(s.gravedad_error==='Alta'?'<span class="badge b-red">Alta</span>':s.gravedad_error==='Media'?'<span class="badge b-orange">Media</span>':s.gravedad_error?'<span class="badge b-blue">Baja</span>':'—')+'</td>'
          +'<td style="font-size:11px;color:var(--text2)">'+(s.comentario_validador||'—')+'</td>'
          +'<td>'+infR+'</td>'
          +'<td>'+bEstado(s.estado)+'</td>'
          +'</tr>';
      });
      fioEl2.innerHTML='<div style="overflow-x:auto"><table><tr>'
        +'<th>Fecha</th><th>Reporta</th><th>Responsable error</th><th>Staff implicado</th>'
        +'<th>Servicio</th><th>Tipo</th><th>Gravedad</th><th>Comentario</th><th>Informado resp.</th><th>Estado</th>'
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
async function renderMaestro(){
  const employees=(await getDB('employees')).filter(e=>e.id!=='E13');
  document.getElementById('maestro-table').innerHTML=`<table><tr><th>Nombre</th><th>Área</th><th>Puesto</th><th>Estado</th><th>Resp.</th><th>Val.</th><th>Rol</th><th>€/h</th><th>PIN</th><th>Acciones</th></tr>
  ${employees.map(e=>`<tr><td><strong>${e.nombre}</strong></td><td>${deptBadge(e.area)}</td><td style="font-size:11px">${e.puesto}</td><td>${e.estado==='Activo'?'<span class="badge b-green">Activo</span>':e.estado==='Baja'?'<span class="badge b-red">Baja</span>':'<span class="badge b-yellow">'+e.estado+'</span>'}</td><td>${e.responsable==1?'<span class="badge b-blue">SÍ</span>':'—'}</td><td>${e.validador==1?'<span class="badge b-yellow">SÍ</span>':'—'}</td><td style="font-family:var(--font-mono);font-size:10px">${e.rol}</td><td style="font-family:var(--font-mono)">${parseFloat(e.coste)>0?parseFloat(e.coste).toFixed(2)+'€':'—'}</td><td style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">${e.pin}</td><td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" onclick="openEmpModal('${e.id}')">Editar</button> ${(currentUser.rol==='admin'||(currentUser.rol==='fb'&&e.rol!=='admin'))?
              (e.estado==='Activo'?
                `<button class="btn btn-danger btn-sm" onclick="toggleEmp('${e.id}','Baja')">Baja</button>`:
                `<button class="btn btn-success btn-sm" onclick="toggleEmp('${e.id}','Activo')">Activar</button>`
              ):
              '<span style="font-size:11px;color:var(--text3);">—</span>'
            }</td></tr>`).join('')}</table>`;
}
async function openEmpModal(empId){
  _editEmpId=empId||null;
  if(empId){ const e=(await getDB('employees')).find(x=>x.id===empId); if(!e) return; document.getElementById('me-title').textContent='Editar: '+e.nombre; document.getElementById('emp-nombre').value=e.nombre; document.getElementById('emp-area').value=e.area; document.getElementById('emp-puesto').value=e.puesto; document.getElementById('emp-pin').value=e.pin; document.getElementById('emp-coste').value=(e.coste&&parseFloat(e.coste)>0)?parseFloat(e.coste):''; document.getElementById('emp-estado').value=e.estado; document.getElementById('emp-resp').value=(e.responsable==1||e.responsable===true||e.responsable==='1'||e.responsable==='true')?'1':'0'; document.getElementById('emp-val').value=(e.validador==1||e.validador===true||e.validador==='1'||e.validador==='true')?'1':'0'; document.getElementById('emp-rol').value=e.rol; document.getElementById('emp-obs').value=e.obs||'';
  } else { document.getElementById('me-title').textContent='Nuevo Empleado'; ['emp-nombre','emp-pin','emp-coste','emp-obs'].forEach(id=>document.getElementById(id).value=''); ['emp-area','emp-puesto','emp-estado'].forEach(id=>{ const el=document.getElementById(id); if(el) el.selectedIndex=0; }); document.getElementById('emp-resp').value='0'; document.getElementById('emp-val').value='0'; document.getElementById('emp-rol').value='empleado'; }
  document.getElementById('modal-empleado').classList.add('open');
}
async function saveEmpleado(){
  const nombre=document.getElementById('emp-nombre').value.trim();
  const pin=document.getElementById('emp-pin').value.trim();
  if(!nombre){toast('Nombre obligatorio','err');return;}
  if(!pin||pin.length<4){toast('PIN mínimo 4 dígitos','err');return;}
  const employees=await getDB('employees');
  if(employees.find(e=>e.pin===pin&&e.id!==_editEmpId)){toast('PIN ya en uso','err');return;}
  var costeVal = parseFloat(document.getElementById('emp-coste').value)||0;
  const emp={
    nombre, pin,
    area: document.getElementById('emp-area').value,
    puesto: document.getElementById('emp-puesto').value,
    coste: isNaN(costeVal) ? 0 : costeVal,
    estado: document.getElementById('emp-estado').value,
    responsable: parseInt(document.getElementById('emp-resp').value)||0,
    validador: parseInt(document.getElementById('emp-val').value)||0,
    rol: document.getElementById('emp-rol').value,
    obs: (document.getElementById('emp-obs')||{value:''}).value.trim(),
    updated_at: localTs()
  };
  // Explicit payload - ensure coste is always sent as number
  var empPayload = {
    nombre: emp.nombre, pin: emp.pin, area: emp.area, puesto: emp.puesto,
    coste: parseFloat(emp.coste)||0, estado: emp.estado,
    responsable: emp.responsable, validador: emp.validador,
    rol: emp.rol, obs: emp.obs||''
  };
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
    await dbInsert('employees', empPayload);
  }
  invalidateCache('employees');
  auditLog('SAVE_EMP', nombre+' — coste:'+costeVal+'€/h');
  closeModal('modal-empleado');
  setTimeout(async function(){
    invalidateCache('employees');
    await renderMaestro();
    toast((_editEmpId?'Empleado actualizado':'Empleado creado')+' — coste: '+costeVal+'€/h','ok');
  }, 200);
}
async function toggleEmp(empId,newEstado){ const employees=await getDB('employees'); const idx=employees.findIndex(e=>e.id===empId); if(idx===-1) return; employees[idx].estado=newEstado; await setDB('employees',employees); renderMaestro(); toast('Estado: '+newEstado,'ok'); }

// ═══════════════════════════════════════════════════════════════════════
// EXPORT
function toCSV(rows,cols){ const h=cols.join(';'); const b=rows.map(r=>cols.map(c=>{ const v=r[c]??''; return typeof v==='string'&&(v.includes(';')||v.includes('\n'))?`"${v}"`:v; }).join(';')); return [h,...b].join('\n'); }
function dl(content,filename){ const blob=new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url); }
async function exportCSV(type){
  if(type==='employees') { dl(toCSV(await getDB('employees'),['id','nombre','area','puesto','pin','estado','responsable','validador','rol','coste','fecha_alta']),'BDS_Maestro.csv'); }
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
function closeModal(id){ document.getElementById(id).classList.remove('open'); if(id==='modal-validar') validatingShiftId=null; if(id==='modal-empleado') _editEmpId=null; }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal(e.currentTarget.id); }));
function toast(msg,type='ok'){ const c=document.getElementById('toast-c'); const t=document.createElement('div'); t.className=`toast ${type}`; t.textContent=msg; c.appendChild(t); setTimeout(()=>{ t.style.animation='toastOut .3s ease forwards'; setTimeout(()=>{ if(c.contains(t)) c.removeChild(t); },300); },3200); }

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
