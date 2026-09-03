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

test('el informe de Mantenimiento agrupa por habitación y detecta reincidencias', () => {
  const context = loadScripts();
  context.isTaskOpen = (task) => task.estado !== 'Cerrada';

  const html = context._mantRoomReport(
    [
      { room: '304', tipo: 'Fontanería', titulo: 'Revisar grifo', estado: 'Abierta' },
      { room: '304', tipo: 'Fontanería', titulo: 'Cambiar grifo', estado: 'Cerrada' },
      { room: '305', tipo: 'Electricidad', titulo: 'Revisar luz', estado: 'Abierta' },
    ],
    [
      { room: '304', tipo_incidencia: 'Avería habitación', estado: 'Abierta' },
      { room: '304', tipo_incidencia: 'Avería habitación', estado: 'Cerrada' },
    ],
  );

  assert.match(html, /INFORME POR HABITACIÓN/);
  assert.match(html, /🚪 304/);
  assert.match(html, /🔁 2×.*Fontanería/);
  assert.match(html, /🔁 2×.*Avería habitación/);
  assert.match(html, /🚪 305/);
});
