import {
  getBearerToken,
  sessionProfile
} from './auth-server.js';

const SUPERVISOR_DEPT_MAP = Object.freeze({
  chef: ['Cocina', 'Friegue'],
  fb: ['Sala', 'Cocina', 'Friegue', 'FnB', 'Food & Beverage'],
  jefe_recepcion: ['Recepción', 'Recepción SFERA'],
  gobernante: ['Housekeeping', 'Limpieza'],
  subgobernante: ['Housekeeping', 'Limpieza'],
  jefe_mantenimiento: ['Mantenimiento'],
  coord_recepcion_syncrolab: ['Recepción SYNCROLAB'],
  coord_entrenadores: ['Entrenadores'],
  coord_fisioterapeutas: ['Fisioterapeutas', 'Clínica'],
  adjunto_directivo: ['*'],
  adjunto: ['*']
});

const AREA_GROUPS = Object.freeze({
  'F&B': ['Sala', 'Cocina', 'Friegue', 'FnB', 'Food & Beverage'],
  'Food & Beverage': ['Sala', 'Cocina', 'Friegue', 'FnB', 'Food & Beverage'],
  Cocina: ['Cocina', 'Friegue'],
  Sala: ['Sala'],
  'Recepción': ['Recepción', 'Recepción SFERA'],
  Housekeeping: ['Housekeeping', 'Limpieza'],
  Limpieza: ['Housekeeping', 'Limpieza'],
  SYNCROLAB: ['SYNCROLAB', 'SyncroLab', 'Recepción SYNCROLAB', 'Entrenadores', 'Fisioterapeutas', 'Clínica'],
  'Recepción SYNCROLAB': ['SYNCROLAB', 'SyncroLab', 'Recepción SYNCROLAB', 'Entrenadores', 'Fisioterapeutas', 'Clínica'],
  Mantenimiento: ['Mantenimiento'],
  Economato: ['Economato'],
  'Administración': ['Administración']
});

const SYNCROLAB_TRAINER_POSITIONS = new Set([
  'Entrenador(a)', 'Coordinador(a) de Entrenadores'
]);

const SYNCROLAB_PHYSIO_POSITIONS = new Set([
  'Fisioterapeuta', 'Coordinador(a) de Fisioterapeutas'
]);

const POSITION_AREAS = Object.freeze({
  'F&B Manager': 'F&B',
  'Jefe de Cocina': 'Cocina',
  'Segundo Jefe de Cocina': 'Cocina',
  Cocinero: 'Cocina',
  Cocinera: 'Cocina',
  'Ayudante de cocina': 'Cocina',
  Friegue: 'Cocina',
  'Jefe de Sala': 'Sala',
  'Jefe de Sector': 'Sala',
  Camarero: 'Sala',
  Camarera: 'Sala',
  'Ayudante camarero': 'Sala',
  'Ayudante camarera': 'Sala',
  'Jefe de Recepción': 'Recepción',
  'Subjefe de Recepción': 'Recepción',
  Recepcionista: 'Recepción',
  'Ayudante de Recepción': 'Recepción',
  'Auditor de Noche': 'Recepción',
  Gobernanta: 'Housekeeping',
  Subgobernanta: 'Housekeeping',
  'Camarero de pisos': 'Housekeeping',
  'Camarera de pisos': 'Housekeeping',
  'Ayudante camarero de pisos': 'Housekeeping',
  'Ayudante camarera de pisos': 'Housekeeping',
  'Lavandería': 'Housekeeping',
  'Jefe de Mantenimiento': 'Mantenimiento',
  'Técnico': 'Mantenimiento',
  'Club Manager': 'SYNCROLAB',
  'Coordinador(a) de Atención al Cliente': 'SYNCROLAB',
  'Coordinador(a) de Entrenadores': 'SYNCROLAB',
  'Coordinador(a) de Fisioterapeutas': 'SYNCROLAB',
  'Atención al Cliente': 'SYNCROLAB',
  'Entrenador(a)': 'SYNCROLAB',
  Fisioterapeuta: 'SYNCROLAB',
  Administrador: 'Administración',
  'Adjunto Directivo': 'Administración',
  Contable: 'Administración'
});

const CREATABLE_ROLES = new Set(['empleado', 'jefe', 'adjunto', 'admin', 'contable']);

function cleanText(value, maxLength, required = false) {
  if (typeof value !== 'string') return required ? null : '';
  const clean = value.trim();
  if ((required && !clean) || clean.length > maxLength) return null;
  return clean;
}

export function normalizeDepartment(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

export function isAdminProfile(profile) {
  return !!profile && profile.rol === 'admin';
}

export function isAdjuntoProfile(profile) {
  return !!profile && (profile.rol === 'adjunto' || profile.rol === 'adjunto_directivo');
}

export function effectiveDepartment(profile) {
  if (!profile) return '';
  const area = String(profile.area || '').trim();
  if (!/^syncro\s*lab$/i.test(area)) return area;
  if (profile.rol === 'coord_entrenadores'
      || SYNCROLAB_TRAINER_POSITIONS.has(profile.puesto)) {
    return 'Entrenadores';
  }
  if (profile.rol === 'coord_fisioterapeutas'
      || SYNCROLAB_PHYSIO_POSITIONS.has(profile.puesto)) {
    return 'Fisioterapeutas';
  }
  return 'Recepción SYNCROLAB';
}

export function supervisorDepartments(profile) {
  if (!profile) return [];
  if (isAdminProfile(profile)) return ['*'];
  if (profile.rol === 'jefe') {
    const department = effectiveDepartment(profile);
    if (department === 'Entrenadores') {
      return SUPERVISOR_DEPT_MAP.coord_entrenadores;
    }
    if (department === 'Recepción SYNCROLAB') {
      return SUPERVISOR_DEPT_MAP.coord_recepcion_syncrolab;
    }
    if (department === 'Fisioterapeutas') {
      return SUPERVISOR_DEPT_MAP.coord_fisioterapeutas;
    }
    return AREA_GROUPS[department] || (department ? [department] : []);
  }
  return SUPERVISOR_DEPT_MAP[profile.rol] || [];
}

export function targetIsInScope(actor, target) {
  const departments = supervisorDepartments(actor);
  if (departments.includes('*')) return true;
  const targetDepartment = normalizeDepartment(effectiveDepartment(target));
  return !!targetDepartment
    && departments.some(dept => normalizeDepartment(dept) === targetDepartment);
}

export function canCreateEmployee(actor, target) {
  if (!actor || !target || !CREATABLE_ROLES.has(target.rol)) return false;
  if (isAdminProfile(actor)) return true;
  if (target.rol === 'admin') return false;
  if (isAdjuntoProfile(actor)) {
    return new Set(['empleado', 'jefe', 'adjunto']).has(target.rol);
  }
  if (actor.rol === 'fb') {
    return new Set(['Sala', 'Cocina', 'Friegue']).has(target.area)
      && new Set(['empleado', 'jefe']).has(target.rol);
  }
  return target.rol === 'empleado' && targetIsInScope(actor, target);
}

export function canResetEmployeePin(actor, target) {
  if (!actor || !target) return false;
  if (isAdminProfile(actor)) return true;
  if (target.rol === 'admin') return false;
  if (isAdjuntoProfile(actor)) return target.rol === 'empleado';
  if (actor.rol === 'fb') return target.rol !== 'admin' && targetIsInScope(actor, target);
  return target.rol === 'empleado' && targetIsInScope(actor, target);
}

export function canEditEmployee(actor, target) {
  if (!actor || !target) return false;
  if (isAdminProfile(actor)) return true;
  if (target.rol === 'admin') return false;
  if (isAdjuntoProfile(actor)) return true;
  if (actor.rol === 'fb') return target.rol !== 'admin' && targetIsInScope(actor, target);
  return target.rol === 'empleado' && targetIsInScope(actor, target);
}

export function canUpdateEmployee(actor, currentTarget, proposedTarget) {
  if (!canEditEmployee(actor, currentTarget)) return false;
  if (!canCreateEmployee(actor, proposedTarget)) return false;
  if (!isAdminProfile(actor) && !isAdjuntoProfile(actor)
      && Number(proposedTarget.validador) !== Number(currentTarget.validador)) {
    return false;
  }
  return true;
}

export function canDeleteEmployee(actor, target) {
  return isAdminProfile(actor) && !!target
    && target.estado === 'Baja' && actor.id !== target.id;
}

export function normalizeEmployeeDraft(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const nombre = cleanText(body.nombre, 160, true);
  const puesto = cleanText(body.puesto, 120, true);
  const area = POSITION_AREAS[puesto];
  const rol = cleanText(body.rol, 40, true);
  const email = cleanText(body.email, 320, false);
  const obs = cleanText(body.obs, 2000, false);
  const estado = cleanText(body.estado, 20, true);
  const coste = Number(body.coste);
  if (!nombre || !puesto || !area || !rol || !CREATABLE_ROLES.has(rol)) return null;
  if (email === null || obs === null || !new Set(['Activo', 'Baja', 'Vacaciones']).has(estado)) return null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!Number.isFinite(coste) || coste < 0 || coste > 10000) return null;
  return {
    nombre,
    puesto,
    area,
    rol,
    email,
    obs,
    estado,
    coste,
    responsable: body.responsable === 1 || body.responsable === true ? 1 : 0,
    validador: body.validador === 1 || body.validador === true ? 1 : 0
  };
}

export async function loadManagementActor(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const session = await sessionProfile(token);
  if (!session || session.forcePinChange) return null;
  return { token, profile: session.profile };
}
