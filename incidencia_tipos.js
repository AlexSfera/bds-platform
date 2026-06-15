// ═══════════════════════════════════════════════════════════════
// INCIDENCIA_TIPOS — Tipos de incidencia por departamento
// GESTION_TIPOS   — Tipos de gestión pendiente por departamento
// Usado por: formulario de turno, dashboard, filtros
// ═══════════════════════════════════════════════════════════════

// ── INCIDENCIAS ───────────────────────────────────────────────
var INCIDENCIA_TIPOS = {

  'Cocina': [
    'Queja / cliente insatisfecho',
    'Error de comanda / servicio',
    'Error de cobro / TPV',
    'Ajuste operativo / invitación / anulación',
    'Devolución de producto / plato',
    'Problema cocina-sala',
    'Problema recepción / PMS',
    'Falta de producto / rotura de stock',
    'Calidad de producto',
    'APPCC / limpieza / orden / seguridad alimentaria',
    'Incumplimiento de procedimiento',
    'Retraso / disciplina',
    'Accidente / seguridad laboral',
    'Otro'
  ],

  'Sala': [
    'Queja / cliente insatisfecho',
    'Error de comanda / servicio',
    'Error de cobro / TPV',
    'Problema cocina-sala',
    'Problema recepción / PMS',
    'Falta de producto / rotura de stock',
    'Calidad de producto',
    'Limpieza / orden / APPCC / seguridad alimentaria',
    'Incumplimiento de procedimiento',
    'Retraso / disciplina',
    'Accidente / seguridad',
    'Otro'
  ],

  'Recepción': [
    'Cliente insatisfecho / queja',
    'Error en reserva / MEWS',
    'Error en check-in / check-out',
    'Error de cobro / caja / factura',
    'Problema con habitación',
    'Problema con housekeeping / mantenimiento',
    'Problema con restaurante / room charge / régimen',
    'Problema de acceso / llaves / pulsera',
    'Comunicación interna / procedimiento incumplido',
    'Seguridad / accidente / conducta conflictiva',
    'Problema laboral / clima de equipo',
    'Otro'
  ],

  'Friegue': [
    'Limpieza / orden',
    'Falta de producto / material',
    'APPCC / seguridad alimentaria',
    'Incumplimiento de procedimiento',
    'Retraso / disciplina',
    'Accidente / seguridad',
    'Otro'
  ],

  'Recepción SYNCROLAB': [
    'Cliente insatisfecho / queja',
    'Error de reserva',
    'Reserva / lead pendiente',
    'Comunicación pendiente',
    'Error de cobro / TPV',
    'Venta pendiente',
    'Problema con acceso / pulsera',
    'Problema con fisioterapia',
    'Problema con entrenadores',
    'Problema con hotel',
    'Problema con Nubimed / Bitrix24',
    'Documentación pendiente',
    'Incumplimiento de procedimiento',
    'Retraso / disciplina',
    'Accidente / seguridad',
    'Otro'
  ],

  'Entrenadores': [
    'Cliente no presentado / cancelación',
    'Sesión pendiente de registrar',
    'Queja / cliente insatisfecho',
    'Petición de cliente',
    'Problema con reserva',
    'Problema con material / instalación',
    'Problema de seguridad / lesión',
    'Derivación a fisioterapia',
    'Seguimiento cliente pendiente',
    'Evaluación pendiente',
    'Problema con recepción / sistema',
    'Incumplimiento de procedimiento',
    'Retraso / disciplina',
    'Otro'
  ],

  'Fisioterapeutas': [
    'Paciente no presentado / cancelación',
    'Tratamiento pendiente de registrar',
    'Queja / paciente insatisfecho',
    'Petición de paciente',
    'Error en Nubimed / reserva',
    'Seguimiento clínico pendiente',
    'Derivación médica / interna',
    'Problema con sala / equipo técnico',
    'Problema con recepción',
    'Documentación pendiente',
    'Problema de seguridad',
    'Incumplimiento de procedimiento',
    'Retraso / disciplina',
    'Otro'
  ],

  'Housekeeping': [
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
  ],

  'Mantenimiento': [
    'Avería crítica',
    'Avería habitación',
    'Avería restaurante',
    'Avería hotel / zonas comunes',
    'Avería SYNCROLAB',
    'Climatización / electricidad / fontanería',
    'Cerrajería / accesos',
    'Piscina / SPA',
    'Equipamiento gimnasio',
    'Tarea preventiva / correctiva',
    'Proveedor externo pendiente',
    'Material / repuesto pendiente',
    'Reincidencia',
    'Seguridad / riesgo',
    'Retraso / comunicación interna',
    'Otro'
  ],

  'Economato': [
    'Pedido no recibido / incompleto',
    'Producto incorrecto',
    'Producto en mal estado / rechazado',
    'Diferencia de albarán',
    'Falta de stock / stock bajo',
    'Error de inventario',
    'Error de almacenamiento / conservación',
    'Problema con proveedor',
    'Pedido urgente',
    'Compra no autorizada',
    'Incumplimiento de procedimiento',
    'Retraso',
    'Otro'
  ],

  'RRHH': [
    'Documentación pendiente',
    'Alta / baja pendiente',
    'Vacaciones pendiente',
    'Ausencia no justificada',
    'Incidencia de fichaje',
    'Horas no cuadran',
    'Cambio de horario pendiente',
    'Incidencia disciplinaria / conflicto interno',
    'Comunicación pendiente',
    'Revisión de desempeño',
    'Formación pendiente',
    'Acceso sistema pendiente',
    'Error de datos empleado',
    'Nómina / variable pendiente',
    'Retraso',
    'Otro'
  ],

  'Administración': [
    'Documentación / contrato pendiente',
    'Factura / pago pendiente',
    'Nómina / variable pendiente',
    'Alta / baja / gestión RRSS',
    'Incidencia de fichaje',
    'Error de datos empleado',
    'Incidencia disciplinaria / conflicto interno',
    'Proveedor / presupuesto pendiente',
    'Comunicación interna pendiente',
    'Revisión de desempeño',
    'Formación pendiente',
    'Acceso / sistema pendiente',
    'Retraso',
    'Otro'
  ]

};

// Alias
INCIDENCIA_TIPOS['FnB']                  = INCIDENCIA_TIPOS['Cocina'];
INCIDENCIA_TIPOS['RecepcionSyncrolab']   = INCIDENCIA_TIPOS['Recepción SYNCROLAB'];

// ── GESTIONES PENDIENTES ──────────────────────────────────────
var GESTION_TIPOS = {

  'Cocina': [
    'Producción / mise en place pendiente',
    'Stock / material pendiente',
    'Reservas / grupos / eventos',
    'Cliente / huésped pendiente',
    'Pedido específico',
    'Otro'
  ],

  'Sala': [
    'Cliente / huésped — petición especial',
    'Reserva / grupo / evento pendiente',
    'Reposición / pedido de material',
    'Información a confirmar',
    'Otro'
  ],

  'Recepción': [
    'Check-in / llegada pendiente',
    'Check-out / salida pendiente',
    'Cobro / factura pendiente',
    'Reserva MEWS pendiente de revisar',
    'Comunicación con cliente pendiente',
    'Habitación / housekeeping pendiente',
    'Solicitud especial de cliente',
    'Gestión con otro departamento',
    'Grupo / evento pendiente',
    'Otro'
  ],

  'Friegue': [
    'Material / producto pendiente',
    'Tarea de limpieza pendiente',
    'Comunicación con cocina pendiente',
    'Otro'
  ],

  'Recepción SYNCROLAB': [
    'Cliente / lead pendiente',
    'Reserva pendiente de confirmar',
    'Cobro / factura pendiente',
    'Comunicación pendiente',
    'Documentación pendiente',
    'Coordinación con hotel pendiente',
    'Otro'
  ],

  'Entrenadores': [
    'Sesión pendiente de planificar',
    'Seguimiento cliente pendiente',
    'Evaluación pendiente',
    'Material / instalación pendiente',
    'Comunicación interna pendiente',
    'Otro'
  ],

  'Fisioterapeutas': [
    'Tratamiento pendiente de registrar',
    'Seguimiento clínico pendiente',
    'Derivación pendiente',
    'Documentación pendiente',
    'Comunicación interna pendiente',
    'Otro'
  ],

  'Housekeeping': [
    'Habitación pendiente de revisar',
    'Reposición de amenities / lencería',
    'Coordinación con recepción pendiente',
    'Coordinación con mantenimiento pendiente',
    'Otro'
  ],

  'Mantenimiento': [
    'Avería pendiente de reparar',
    'Revisión preventiva pendiente',
    'Proveedor / presupuesto pendiente',
    'Material / repuesto pendiente',
    'Comunicación interna pendiente',
    'Otro'
  ],

  'Economato': [
    'Pedido pendiente de tramitar',
    'Albarán pendiente de revisar',
    'Stock pendiente de reponer',
    'Comunicación con proveedor pendiente',
    'Otro'
  ],

  'RRHH': [
    'Documentación pendiente',
    'Comunicación pendiente',
    'Gestión administrativa pendiente',
    'Otro'
  ],

  'Administración': [
    'Documentación / contrato pendiente',
    'Factura / pago pendiente',
    'Nómina / variable pendiente',
    'Gestión con proveedor pendiente',
    'Gestión RRSS / alta / baja pendiente',
    'Comunicación pendiente',
    'Seguimiento de incidencia disciplinaria',
    'Otro'
  ]

};

// Alias
GESTION_TIPOS['FnB']                = GESTION_TIPOS['Cocina'];
GESTION_TIPOS['RecepcionSyncrolab'] = GESTION_TIPOS['Recepción SYNCROLAB'];

// ── FUNCIONES ─────────────────────────────────────────────────

function getInciTipos(dept) {
  return INCIDENCIA_TIPOS[dept] || INCIDENCIA_TIPOS['Cocina'];
}

function getGestionTipos(dept) {
  return GESTION_TIPOS[dept] || ['Otro'];
}

function populateInciTipoSelector(selectId, dept) {
  var el = document.getElementById(selectId);
  if (!el) return;
  var tipos = getInciTipos(dept);
  var currentVal = el.value;
  el.innerHTML = '<option value="">— Seleccionar tipo —</option>'
    + tipos.map(function(t) {
      return '<option value="' + t + '"' + (t === currentVal ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
}

function populateGestionTipoSelector(selectId, dept) {
  var el = document.getElementById(selectId);
  if (!el) return;
  var tipos = getGestionTipos(dept);
  var currentVal = el.value;
  el.innerHTML = '<option value="">— Seleccionar tipo —</option>'
    + tipos.map(function(t) {
      return '<option value="' + t + '"' + (t === currentVal ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
}

function populateDashInciFilter(dept) {
  ['di-cat', 'it-tipo'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var tipos = getInciTipos(dept);
    var currentVal = el.value;
    el.innerHTML = '<option value="">Todas</option>'
      + tipos.map(function(t) {
        return '<option value="' + t + '"' + (t === currentVal ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
  });
}

function populateDashGestionFilter(dept) {
  var el = document.getElementById('dg-tipo');
  if (!el) return;
  var tipos = getGestionTipos(dept);
  var currentVal = el.value;
  el.innerHTML = '<option value="">Todas</option>'
    + tipos.map(function(t) {
      return '<option value="' + t + '"' + (t === currentVal ? ' selected' : '') + '>' + t + '</option>';
    }).join('');
}

// Auto-init al cargar
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.area) {
      populateInciTipoSelector('i-tipo-incidencia', currentUser.area);
      populateGestionTipoSelector('g-tipo', currentUser.area);
      populateInciTipoSelector('it-tipo', currentUser.area);
      populateDashInciFilter(currentUser.area);
      populateDashGestionFilter(currentUser.area);
    }
  }, 800);
});
