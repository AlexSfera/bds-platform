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
  const rl={admin:'ADMIN',adjunto:'ADJ.DIR/RRHH',adjunto_directivo:'ADJ.DIR',jefe:(currentUser.area?'JEFE · '+currentUser.area.toUpperCase():'JEFE'),chef:'CHEF',fb:'F&B',jefe_recepcion:'JEF.REC',supervisor:'SUPERV.',mantenimiento:'MANT.',empleado:currentUser.area?currentUser.area.toUpperCase():'EMPLEADO'};
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
  var isSala       = currentUser && (currentUser.area === 'Sala' || currentUser.area === 'Jefe de Sala');
  var isRecepcion  = currentUser && currentUser.area === 'Recepción';
  var isCocina     = currentUser && currentUser.area === 'Cocina';
  var isHK         = currentUser && (currentUser.area === 'HK' || currentUser.area === 'Housekeeping' || currentUser.area === 'Limpieza');
  var isMant       = currentUser && currentUser.area === 'Mantenimiento';
  var isSyncrolab  = currentUser && /syncrolab|syncro lab/i.test((currentUser.area||'') + ' ' + (currentUser.puesto||''));
  var isAdminU     = (rol === 'admin');
  var isAdjDir     = typeof isAdjuntoDirectivo === 'function' && isAdjuntoDirectivo(currentUser);
  var isJefe       = isAdminU || isAdjDir || (typeof isSupervisor === 'function' && isSupervisor(currentUser))
    || ['chef','fb','jefe_recepcion','supervisor','jefe'].indexOf(rol) >= 0;

  // ── Definiciones de pantallas ─────────────────────────────────────
  var ITEMS = {
    readme:      {id:'readme',      label:'📋 Info'},
    turno:       {id:'turno',       label:'🕐 Mi Turno'},
    gestiones:   {id:'gestiones',   label:'📌 Gestiones'},
    tareas:      {id:'tareas',      label:'🔗 Tareas'},
    incidencias: {id:'incidencias', label:'⚠ Incidencias'},
    hypoxic:     {id:'hypoxic',     label:'🫁 Hypoxic Room'},
    validacion:  {id:'validacion',  label:'✅ Validación'},
    dashboard:   {id:'dashboard',   label:'📊 Dashboard'},
    maestro:     {id:'maestro',     label:'👥 Maestro'},
    export:      {id:'export',      label:'⬇ Exportar'},
    fio:         {id:'fio',         label:'⚖ FIO'},
    misfio:      {id:'mis-fio',     label:'⚖ Mis FIO'},
    // Módulos por dpto (placeholders)
    merma:       {id:'merma-mod',   label:'📦 Merma'},
    ajustes:     {id:'ajustes-mod', label:'⚙ Ajustes de Caja'},
    ruta:        {id:'ruta-mod',    label:'🧹 Mi Ruta'},
    cajaRec:     {id:'rec-caja-op', label:'💰 Caja', action:'openRecCajaChoice'},
    cajaLab:     {id:'lab-caja-op', label:'💰 Caja', action:'openLabCajaChoice'},
    recmod:      {id:'rec-mod',     label:'🏨 Recepción',      pending:true},
    mantmod:     {id:'mant-mod',    label:'🔧 Mantenimiento',  pending:true},
    // ── HOUSEKEEPING ─────────────────────────────────────────────────
    hkPlan:      {id:'hk-plan',     label:'📅 Planificación'},
    hkZonas:     {id:'hk-zonas',    label:'🧽 Zonas públicas'},
    hkConfig:    {id:'hk-config',   label:'⚙ Configuración HK'},
    hkRevision:  {id:'hk-revision', label:'✅ Revisión HK'},
    hkDash:      {id:'hk-dash',     label:'📊 Dashboard HK'},
    fichaje:     {id:'fichaje',     label:'📋 Alertas Fichaje'},
    incentivos:  {id:'incentivos',  label:'💰 Incentivos'},
    checklist:   {id:'chk-mod',     label:'✅ Checklist', action:'openChkMidDay'}
  };

  // ── ZONA 1: Navegación común (todos) ──────────────────────────────
  var isAdminArea = currentUser && currentUser.area === 'Administración';
  var navComun = isAdminU
    ? [ITEMS.gestiones, ITEMS.tareas, ITEMS.incidencias]      // admin no tiene Mi Turno
    : (isAdjDir && isAdminArea)
      ? [ITEMS.turno, ITEMS.gestiones, ITEMS.tareas, ITEMS.incidencias, ITEMS.misfio]  // adjunto Administración: sin checklist
      : [ITEMS.turno, ITEMS.gestiones, ITEMS.tareas, ITEMS.incidencias, ITEMS.misfio, ITEMS.checklist];

  // Hypoxic Room: admin (vista global) + usuarios SYNCROLAB + Recepción
  if(isAdminU || isRecepcion) navComun.push(ITEMS.hypoxic);

  // Alertas Fichaje: todos los empleados ven sus propias; admin/adjunto ven todos
  navComun.push(ITEMS.fichaje);

  // ── ZONA 2: Módulo de departamento (varía) ────────────────────────
  var dptoMod = [];
  if(isCocina)    dptoMod.push(ITEMS.merma);
  if(isSala)      dptoMod.push(ITEMS.ajustes);
  if(isSala)      dptoMod.push(ITEMS.incentivos); // empleados Sala ven su bonus
  if(isHK)        {
    dptoMod.push(ITEMS.ruta);
    // Gobernanta/Subgobernanta ven planificación + zonas + revisión + dashboard + config
    var _isGob = typeof hkIsGobernanta === 'function' && hkIsGobernanta(currentUser);
    if(_isGob){
      dptoMod.push(ITEMS.hkPlan);
      dptoMod.push(ITEMS.hkZonas);
      dptoMod.push(ITEMS.hkRevision);
      dptoMod.push(ITEMS.hkDash);
      dptoMod.push(ITEMS.hkConfig);
    }
  }
  if(isRecepcion) { dptoMod.push(ITEMS.cajaRec); dptoMod.push(ITEMS.recmod); }
  if(isSyncrolab) { dptoMod.push(ITEMS.cajaLab); }
  if(isMant)      dptoMod.push(ITEMS.mantmod);
  // Admin ve también todas las pantallas HK
  if(isAdminU && !isHK){
    dptoMod.push({sep:true,label:'HOUSEKEEPING'});
    dptoMod.push(ITEMS.hkPlan);
    dptoMod.push(ITEMS.hkZonas);
    dptoMod.push(ITEMS.hkRevision);
    dptoMod.push(ITEMS.hkDash);
    dptoMod.push(ITEMS.hkConfig);
  }

  // ── ZONA 3: Gestión (solo jefe/admin) ─────────────────────────────
  var gestion = [];
  if(isJefe){
    gestion.push(ITEMS.validacion);
    gestion.push(ITEMS.dashboard);
  }
  if(isAdminU){
    gestion.push(ITEMS.maestro);
    gestion.push(ITEMS.export);
  }
  if(isJefe) gestion.push(ITEMS.fio);
  if(isJefe && !(isAdjDir && isAdminArea)) gestion.push(ITEMS.incentivos);

  // Devolvemos array plano con separadores marcados para buildNav
  var out = [].concat(navComun);
  if(dptoMod.length){ out.push({sep:true,label:'MI DEPARTAMENTO'}); out = out.concat(dptoMod); }
  if(gestion.length){ out.push({sep:true,label:'GESTIÓN'});         out = out.concat(gestion); }
  // Info siempre primero
  out.unshift(ITEMS.readme);
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
    'validacion':_svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    'dashboard': _svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
    'maestro':   _svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    'export':    _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    'gestiones': _svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    'incidencias': _svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    'hypoxic':   _svg('<path d="M12 2a3 3 0 0 0-3 3c0 1.5 1 2.5 1 4v3a4 4 0 0 1-2 3.5L7 16a3 3 0 0 0 0 4.5 3 3 0 0 0 4 0l1-1 1 1a3 3 0 0 0 4 0 3 3 0 0 0 0-4.5l-1-.5a4 4 0 0 1-2-3.5V9c0-1.5 1-2.5 1-4a3 3 0 0 0-3-3z"/>'),
    'rec-caja-op': _svg('<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 10h.01"/><path d="M2 10h20"/>')
  };
  const SHORT={'readme':'Info','turno':'Turno','tareas':'Tareas','validacion':'Valid.','dashboard':'Panel','maestro':'Equipo','export':'Export','gestiones':'Gestiones','incidencias':'Incid.','hypoxic':'Hypoxic','caja':'Caja','rec-caja':'Caja Rec.','rec-caja-op':'Caja','merma-mod':'Merma','ajustes-mod':'Aj.Caja','ruta-mod':'Ruta','rec-mod':'Recep.','mant-mod':'Mant.'};

  // Pintar sidebar (escritorio) + bottom nav (móvil) + topbar legacy oculto
  const sideb = document.getElementById('sidebar-nav');
  if(sideb) sideb.innerHTML = '';

  screens.forEach(s=>{
    if(s.sep){
      // Separador de grupo
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

    // Topbar legacy (lo dejamos oculto vía CSS pero seguimos poblándolo por compatibilidad de IDs)
    const b=document.createElement('button');
    b.className='nav-btn'; b.id='nav-'+s.id;
    b.innerHTML=s.label+'<span class="alert-dot" id="dot-'+s.id+'"></span>';
    b.onclick=function(){
      if(isPending){ toast('Módulo en desarrollo','info'); return; }
      if(s.action){ if(typeof window[s.action] === 'function') window[s.action](); return; }
      showScreen(s.id);
    };
    nav.appendChild(b);

    // Bottom nav (móvil)
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
  // Show bottom nav
  var bn=document.getElementById('bottom-nav');
  if(bn) bn.style.display='block';

  // Rellenar bloque usuario topbar (dpto · nombre)
  var deptEl = document.getElementById('topbar-dept');
  var nameEl = document.getElementById('topbar-name');
  if(deptEl) deptEl.textContent = currentUser && currentUser.area ? ('🏢 ' + currentUser.area) : '';
  if(nameEl) nameEl.textContent = currentUser && currentUser.nombre ? ('👤 ' + currentUser.nombre) : '';
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
    var _startTab = (currentUser && currentUser.rol==='coord_recepcion_syncrolab') ? 'caja' : 'followup';
    switchValTab(_startTab);
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
  // ── Housekeeping ──
  if(id==='ruta-mod'    && typeof renderHKMiRuta==='function')         renderHKMiRuta();
  if(id==='hk-plan'     && typeof renderHKPlanificacion==='function')  renderHKPlanificacion();
  if(id==='hk-zonas'    && typeof renderHKZonasPublicas==='function')  renderHKZonasPublicas();
  if(id==='hk-config'   && typeof renderHKConfig==='function')         renderHKConfig();
  if(id==='hk-revision' && typeof renderHKRevision==='function')       renderHKRevision();
  if(id==='hk-dash'     && typeof renderHKDashboard==='function')      renderHKDashboard();
  if(id==='fichaje'     && typeof renderFichaje==='function')          { _fichajeFilterPeriodo=''; renderFichaje(); }
  if(id==='incentivos'  && typeof renderIncentivos==='function')        renderIncentivos();
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
  var isSalaUser = currentUser && currentUser.area === 'Sala';
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
    // GUARD: 1 turno pendiente activo por empleado/día (BUG-TURNO-03)
    // Si ya hay un turno con estado 'Pendiente' o 'En corrección' del mismo
    // empleado/fecha, no permitimos crear otro. Si están todos validados o
    // rechazados (o han sido eliminados), sí se puede crear uno nuevo.
    try {
      var allShifts = await getDB('shifts');
      var bloqueante = (allShifts||[]).find(function(s){
        return s.employee_id === currentUser.id
          && (s.fecha||'').slice(0,10) === (fecha||'').slice(0,10)
          && (s.estado === 'Pendiente' || s.estado === 'En corrección');
      });
      if(bloqueante){
        const alertArea = document.getElementById('turno-alert-area');
        if(alertArea){
          alertArea.innerHTML = '<div class="alert a-err">Ya tienes un turno PENDIENTE de hoy ('+formatDisplayValue(bloqueante.servicio)+'). '
            + 'Espera a que tu jefe lo valide o pídele que lo rechace antes de crear otro.</div>';
        }
        toast('Ya hay turno pendiente hoy','err');
        return;
      }
    } catch(eGuard){
      console.error('Guard turno fallo, continuando', eGuard);
    }

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
    if(!servicio||servicio==='[]'||servicio==='') errs.push('Turno obligatorio');
  }
  if(!horas||horas<=0) errs.push('Horas obligatorias');
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
  if(!_isSalaUser && !_isRecepcion && !_isHKUser && !_isLabUser){
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
  var allDepts=['Cocina','Sala','Recepción','Housekeeping','SYNCROLAB','Mantenimiento','Economato','Administración','RRHH'];
  var fullOpts='<option value="">Todos</option>'+allDepts.map(function(d){return '<option>'+d+'</option>';}).join('');
  if(typeof isAdmin==='function' && isAdmin(currentUser)){
    sel.innerHTML=fullOpts; sel.value=''; sel.disabled=false; onValDeptChange(); return;
  }
  // adjunto_directivo: ve TODOS los departamentos (solo lectura en turnos)
  if(typeof isAdjuntoDirectivo==='function' && isAdjuntoDirectivo(currentUser)){
    sel.innerHTML=fullOpts; sel.value=''; sel.disabled=false; onValDeptChange(); return;
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
  if(dept) shifts=shifts.filter(s=>normalizeDeptName(s.area)===normalizeDeptName(dept));
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
  if(!shifts.length){el.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Sin registros</div></div>';return;}
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
async function renderMaestro(){
  const employees=(await getDB('employees')).filter(e=>e.id!=='E13');
  // Permisos: adjunto_directivo NO puede modificar/eliminar/ver-PIN de fila con rol=admin
  function canEditRow(e){
    if(isAdjuntoDirectivo(currentUser) && e.rol === 'admin') return false;
    return canActAsAdmin(currentUser) || (currentUser.rol === 'fb' && e.rol !== 'admin');
  }
  function pinCell(e){
    if(isAdjuntoDirectivo(currentUser) && e.rol === 'admin') return '<span style="color:var(--text3)">●●●●</span>';
    return '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">'+e.pin+'</span>';
  }
  document.getElementById('maestro-table').innerHTML=`<table><tr><th>Nombre</th><th>Área</th><th>Puesto</th><th>Estado</th><th>Resp.</th><th>Val.</th><th>Rol</th><th>€/h</th><th>PIN</th><th>Acciones</th></tr>
  ${employees.map(e=>`<tr><td><strong>${e.nombre}</strong></td><td>${deptBadge(e.area)}</td><td style="font-size:11px">${e.puesto}</td><td>${e.estado==='Activo'?'<span class="badge b-green">Activo</span>':e.estado==='Baja'?'<span class="badge b-red">Baja</span>':'<span class="badge b-yellow">'+e.estado+'</span>'}</td><td>${e.responsable==1?'<span class="badge b-blue">SÍ</span>':'—'}</td><td>${e.validador==1?'<span class="badge b-yellow">SÍ</span>':'—'}</td><td style="font-family:var(--font-mono);font-size:10px">${e.rol}</td><td style="font-family:var(--font-mono)">${parseFloat(e.coste)>0?parseFloat(e.coste).toFixed(2)+'€':'—'}</td><td>${pinCell(e)}</td><td style="white-space:nowrap">${canEditRow(e) ? `<button class="btn btn-secondary btn-sm" onclick="openEmpModal('${e.id}')">Editar</button> ${(canActAsAdmin(currentUser)||(currentUser.rol==='fb'&&e.rol!=='admin'))?
              (e.estado==='Activo'?
                `<button class="btn btn-danger btn-sm" onclick="toggleEmp('${e.id}','Baja')">Baja</button>`:
                `<button class="btn btn-success btn-sm" onclick="toggleEmp('${e.id}','Activo')">Activar</button>`
              ):
              '<span style="font-size:11px;color:var(--text3);">—</span>'
            }` : '<span style="font-size:11px;color:var(--text3);">🔒 Protegido</span>'}</td></tr>`).join('')}</table>`;
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
  var selectedArea = document.getElementById('emp-area').value;
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
      if(['adjunto_directivo','admin','fb','chef','jefe_recepcion','gobernante','coord_recepcion_syncrolab','coord_entrenadores','coord_fisioterapeutas','mantenimiento'].indexOf(selectedRol) !== -1){
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
function filterMaestro(q){
  var query=(q||'').toLowerCase();
  var table=document.getElementById('maestro-table');
  if(!table) return;
  table.querySelectorAll('tbody tr, tr').forEach(function(row,i){
    if(i===0) return; // header
    var txt=(row.textContent||'').toLowerCase();
    row.style.display=(query===''||txt.indexOf(query)!==-1)?'':'none';
  });
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
      return '<div class="task-card">'
        + '<div class="task-meta">'
        +   '<span class="dept-badge">'+formatDisplayValue(g.departamento||g.area)+'</span>'
        +   '<span class="task-origin">tipo: '+formatDisplayValue(g.tipo_gestion)+'</span>'
        +   bGestionEstadoClick(st, g.id)
        + '</div>'
        + '<div class="task-title">'+formatDisplayValue(g.descripcion)+'</div>'
        + '<div class="task-footer">'
        +   '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">'
        +     '📅 '+fechaStr+' &nbsp;·&nbsp; creada por '+formatDisplayValue(g.creado_por||g.nombre)
        +   '</div>'
        + '</div>'
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
  var dept = currentUser && currentUser.area || '';
  if(typeof populateGestionTipoSelector === 'function'){
    populateGestionTipoSelector('ng-tipo', dept);
  } else {
    ['Reposición / pedido de material','Reserva / grupo / evento pendiente','Otro'].forEach(function(t){
      var o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
    });
  }
  ov.querySelector('#ng-desc').value = '';
  ov.classList.add('open');
}
window.openNewGestionStandalone = openNewGestionStandalone;

async function saveNewGestionStandalone(){
  var tipo = (document.getElementById('ng-tipo')||{}).value || '';
  var desc = ((document.getElementById('ng-desc')||{}).value || '').trim();
  if(!desc){ toast('Descripción obligatoria','err'); return; }
  var rec = {
    id: genId(),
    employee_id: currentUser.id,
    nombre: currentUser.nombre,
    area: currentUser.area||'',
    departamento: currentUser.area||'',
    fecha: today(),
    tipo_gestion: tipo || 'Otro',
    descripcion: desc,
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
  var el = document.getElementById('screen-merma-mod');
  if(!el) return;
  var dept = currentUser ? (currentUser.area||'—') : '—';
  var isAdminU = isAdmin(currentUser);
  var isSup    = typeof isSupervisor === 'function' && isSupervisor(currentUser);

  // Cocina/Friegue ven Cocina+Friegue. Admin ve todas. Jefe ve sus dptos.
  var todayStr = today();
  invalidateCache('merma');
  var all = [];
  try { all = await getDB('merma'); } catch(e){}
  var list = (all||[]).filter(function(m){
    return (m.fecha||'').slice(0,10) === todayStr;
  });
  if(!isAdminU){
    var allowed = isSup
      ? (SUPERVISOR_DEPT_MAP[currentUser.rol] || [])
      : ['Cocina','Friegue'];
    if(['Cocina','Friegue'].indexOf(currentUser.area)>=0){ allowed = ['Cocina','Friegue']; }
    list = list.filter(function(m){
      var d = m.area || m.departamento || '';
      return allowed.indexOf(d) >= 0;
    });
  }
  list.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });

  var totalQty = 0;
  var pendientes = 0;
  list.forEach(function(m){
    totalQty += parseFloat(m.cantidad)||0;
    if(!m.shift_id) pendientes++;
  });

  var cards;
  if(!list.length){
    cards = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">Sin merma registrada hoy</div></div>';
  } else {
    cards = list.map(function(m){
      var hora = m.created_at ? new Date(m.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—';
      var obs = m.obs ? '<div style="font-size:11px;color:var(--text3);margin-top:4px;">📝 '+formatDisplayValue(m.obs)+'</div>' : '';
      var statusTag = m.shift_id
        ? '<span style="font-size:10px;background:var(--green-dim);color:var(--green);padding:2px 6px;border-radius:6px;margin-left:6px;">en turno</span>'
        : '<span style="font-size:10px;background:var(--amber-dim);color:var(--amber);padding:2px 6px;border-radius:6px;margin-left:6px;">pendiente</span>';
      var delBtn = isAdminU ? ' <button class="btn btn-danger btn-sm" style="margin-left:auto;" onclick="deleteMermaItem(\''+m.id+'\')">🗑</button>' : '';
      return '<div class="task-card">'
        + '<div class="task-meta" style="align-items:center;">'
        +   '<span class="dept-badge">'+formatDisplayValue(m.area||m.departamento)+'</span>'
        +   '<span class="task-origin">'+hora+'</span>'
        +   '<span style="font-weight:600;font-size:13px;">'+formatDisplayValue(m.producto)+'</span>'
        +   '<span class="badge b-orange">'+(m.cantidad||0)+' '+formatDisplayValue(m.unidad||'uds')+'</span>'
        +   '<span class="badge b-gray">'+formatDisplayValue(m.causa)+'</span>'
        +   statusTag
        +   delBtn
        + '</div>'
        + obs
        + '<div class="task-footer">'
        +   '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);">👤 '+formatDisplayValue(m.nombre)+'</div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  var subText = list.length+' línea(s) hoy — total '+totalQty.toFixed(2)+' uds';
  if(pendientes > 0){
    subText += ' · <b style="color:var(--amber);">'+pendientes+' pendiente(s) de asociar a turno</b>';
  }

  el.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<div><div class="page-title">📦 Merma — hoy</div>'
    + '<div class="page-sub">'+subText+'</div></div>'
    + '<button class="btn btn-primary" onclick="openNewMermaMod()">+ Nueva línea</button>'
    + '</div>'
    + '<div>'+cards+'</div>';
}
window.renderMermaMod = renderMermaMod;

// ── Modal nueva merma standalone ──────────────────────────────────────
function openNewMermaMod(){
  var ov = document.getElementById('modal-new-merma');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'modal-new-merma';
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal" style="max-width:520px;">'
      + '<div class="modal-h"><h3>📦 Nueva línea de merma</h3>'
      + '<button class="modal-x" onclick="closeModal(\'modal-new-merma\')">✕</button></div>'
      + '<div class="modal-b">'
      + '<div class="grid2">'
      +   '<div class="fg"><label>Producto <span class="req">*</span></label><input type="text" id="nm-producto" placeholder="ej: Salmón"></div>'
      +   '<div class="fg"><label>Cantidad <span class="req">*</span></label><input type="number" id="nm-cantidad" min="0" step="0.01" placeholder="0.00"></div>'
      + '</div>'
      + '<div class="grid2">'
      +   '<div class="fg"><label>Unidad</label><select id="nm-unidad">'
      +     '<option value="kg">kg</option><option value="g">g</option><option value="L">L</option>'
      +     '<option value="uds" selected>uds</option><option value="raciones">raciones</option>'
      +   '</select></div>'
      +   '<div class="fg"><label>Causa <span class="req">*</span></label><select id="nm-causa">'
      +     '<option value="">— Seleccionar —</option>'
      +     '<option>Caducidad</option><option>Error de preparación</option><option>Accidente</option>'
      +     '<option>Devolución sala</option><option>Exceso de producción</option><option>Otro</option>'
      +   '</select></div>'
      + '</div>'
      + '<div class="fg"><label>Observación</label><input type="text" id="nm-obs" placeholder="Nota opcional"></div>'
      + '</div>'
      + '<div class="modal-f">'
      + '<button class="btn btn-secondary" onclick="closeModal(\'modal-new-merma\')">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="saveNewMermaMod()">💾 Guardar</button>'
      + '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeModal('modal-new-merma'); });
  }
  // Limpiar campos
  ['nm-producto','nm-cantidad','nm-obs'].forEach(function(id){
    var x=document.getElementById(id); if(x) x.value='';
  });
  var u = document.getElementById('nm-unidad'); if(u) u.value='uds';
  var c = document.getElementById('nm-causa'); if(c) c.value='';
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
  var dept = currentUser && currentUser.area || '';
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
