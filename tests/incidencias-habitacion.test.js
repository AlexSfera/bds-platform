import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadScripts() {
  const context = {
    INCIDENT_STATES: { ABIERTA: 'Abierta', EN_PROCESO: 'En proceso', CERRADA: 'Cerrada' },
    console,
    window: {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../incidencias.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../mantenimiento.js', import.meta.url), 'utf8'), context);
  return context;
}

test('normaliza la habitación y conserva la visibilidad elegida por el empleado', () => {
  const context = loadScripts();
  const elements = {
    'i-desc': { value: 'Fuga de agua' },
    'i-accion': { value: 'Avisado Mantenimiento' },
    'i-room': { value: 'Habitación 304' },
    'i-visible-companeros': { checked: true },
    'i-tipo-incidencia': { value: 'Problema con habitación' },
  };
  context.document = { getElementById: (id) => elements[id] || null };
  context.currentUser = { id: 'emp-1', nombre: 'Ana', area: 'Recepción' };
  context.genId = () => 'inc-1';
  context.getStaffImplicado = () => ({ ids: [], nombres: [] });

  const incident = context.buildInciObj('shift-1', '2026-09-03', 'Mañana', '2026-09-03T08:00:00Z');

  assert.equal(incident.room, '304');
  assert.equal(incident.visible_companeros, true);
  assert.equal(context.isIncidentVisibleToColleagues(incident), true);
  assert.equal(context.isIncidentVisibleToColleagues({ visible_companeros: false }), false);
});

test('prepara tipos únicos para el filtro de incidencias', () => {
  const context = loadScripts();
  const tipos = context.getIncidentTypesForFilter([
    { tipo_incidencia: 'Queja de cliente' },
    { tipo_incidencia: 'Avería' },
    { tipo_incidencia: 'Queja de cliente' },
    { categoria: 'Otro' },
    {},
  ]);

  assert.deepEqual([...tipos], ['Avería', 'Otro', 'Queja de cliente']);
});

test('el render final de incidencias conserva el filtro por tipo', () => {
  const source = readFileSync(new URL('../adjuntos.js', import.meta.url), 'utf8');

  assert.match(source, /getIncidentTypesForFilter\(list\)/);
  assert.match(source, /Filtrar por tipo de incidencia/);
  assert.match(source, /setIncidenciasScreenTipo\(this\.value\)/);
});

test('la habitación se elige del catálogo y permite dejarla sin asignar', () => {
  const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sharedSource = readFileSync(new URL('../shared.js', import.meta.url), 'utf8');
  const taskSource = readFileSync(new URL('../tareas.js', import.meta.url), 'utf8');

  assert.match(indexSource, /<select id="i-room">\s*<option value="">— Sin habitación —<\/option>/);
  assert.match(indexSource, /<select id="task-room"><option value="">— Sin habitación —<\/option><\/select>/);
  assert.match(sharedSource, /<select id="ni-room"><option value="">— Sin habitación —<\/option><\/select>/);
  assert.match(sharedSource, /poblarSelectorHabitacion\(document\.getElementById\('i-room'\), ''\)/);
  assert.match(sharedSource, /poblarSelectorHabitacion\(ov\.querySelector\('#ni-room'\), ''\)/);
  assert.match(sharedSource, /room:\s*\(document\.getElementById\('i-room'\)/);
  assert.match(taskSource, /poblarSelectorHabitacion\(roomEl,''\)/);
  assert.match(taskSource, /room:typeof normalizeIncidentRoom/);
});

test('Administración conserva el tipo de incidencia de housekeeping y mantenimiento', () => {
  const source = readFileSync(new URL('../incidencia_tipos.js', import.meta.url), 'utf8');
  const start = source.indexOf("'Administración': [");
  const adminCatalog = source.slice(start, source.indexOf('\n  ]\n\n};', start));

  assert.match(adminCatalog, /Problema con housekeeping \/ mantenimiento/);
});

test('el Dashboard de Mantenimiento calcula tareas asignadas y tiempo medio del periodo', () => {
  const context = loadScripts();
  const metrics = context._mantPeriodMetrics([
    { created_at: '2026-09-02T08:00:00Z', completada_ts: '2026-09-02T10:00:00Z' },
    { created_at: '2026-09-03T08:00:00Z', completada_ts: '2026-09-03T09:00:00Z' },
    { created_at: '2026-09-04T08:00:00Z', completada_ts: null },
    { created_at: '2026-08-31T08:00:00Z', completada_ts: '2026-08-31T08:30:00Z' },
    { created_at: '2026-08-31T23:30:00Z', completada_ts: '2026-09-01T00:00:00Z' },
  ], '2026-09-01', '2026-09-03');

  assert.equal(metrics.assigned, 2);
  assert.equal(metrics.solved, 3);
  assert.equal(metrics.avgResolutionMinutes, 70);
  assert.equal(context._mantDurationText(metrics.avgResolutionMinutes), '1 h 10 min');
});

test('el histórico por habitación combina tareas, incidencias e Hypoxic', () => {
  const context = loadScripts();
  const history = context._mantRoomHistory(
    [{ id: 't1', room: '304', titulo: 'Revisar grifo', tipo: 'Fontanería', created_at: '2026-09-01T08:00:00Z', completada_ts: '2026-09-01T10:00:00Z', estado: 'Cerrada' }],
    [{ id: 'i1', room: '304', tipo_incidencia: 'Fuga de agua', descripcion: 'Agua bajo lavabo', created_at: '2026-09-02T08:00:00Z', estado: 'Abierta' }],
    [{ id: 'h1', room_number: '304', incident_types: '["CO2 alto"]', observaciones: 'Revisar sensor', created_at: '2026-09-03T08:00:00Z', estado: 'En proceso' }],
    '304', '2026-09-01', '2026-09-30',
  );

  assert.equal(history.length, 3);
  assert.equal(history.map((row) => row.kind).join(','), 'hypoxic,incidencia,tarea');
  assert.equal(history[0].title, 'CO2 alto');
  assert.equal(history[2].resolutionMinutes, 120);
});

test('el informe de Mantenimiento permite seleccionar habitación y marca reincidencias', () => {
  const context = loadScripts();

  const html = context._mantRoomReport(
    [
      { room: '304', tipo: 'Fontanería', titulo: 'Revisar grifo', estado: 'Abierta', created_at: '2026-09-01T08:00:00Z' },
      { room: '304', tipo: 'Fontanería', titulo: 'Cambiar grifo', estado: 'Cerrada', created_at: '2026-09-02T08:00:00Z' },
    ],
    [
      { room: '304', tipo_incidencia: 'Avería habitación', estado: 'Abierta', created_at: '2026-09-03T08:00:00Z' },
    ],
    [{ room_number: '304', incident_types: '["CO2 alto"]', estado: 'Cerrada', created_at: '2026-09-04T08:00:00Z', resolution_time_minutes: 45 }],
    [{ numero: '304', activa: true }, { numero: '305', activa: true }],
    '304',
    '2026-09-01',
    '2026-09-30',
  );

  assert.match(html, /REPARACIONES POR HABITACIÓN/);
  assert.match(html, /Habitación 304/);
  assert.match(html, /TAREA/);
  assert.match(html, /INCIDENCIA/);
  assert.match(html, /HYPOXIA/);
  assert.match(html, /🔁 2×/);
  assert.match(html, /CO2 alto/);
  assert.match(html, /Solución: 45 min/);
});
