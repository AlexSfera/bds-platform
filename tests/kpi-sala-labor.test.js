import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateSalaLabor,
  canReadSalaLabor,
  validDateRange
} from '../api/kpi-sala-labor.js';

test('KPI Sala aggregates raw Bitrix time without creating shifts', () => {
  const employees = [
    { id: 'sala-1', nombre: 'Ana Sala', area: 'Sala', coste: 20 },
    { id: 'cocina-1', nombre: 'Luis Cocina', area: 'Cocina', coste: 30 }
  ];
  const records = [
    { employee_id: 'sala-1', duration_seconds: 7.5 * 3600 },
    { employee_id: 'sala-1', duration_seconds: 6.5 * 3600 },
    { employee_id: 'cocina-1', duration_seconds: 8 * 3600 },
    { employee_id: 'sala-1', duration_seconds: 0 }
  ];

  const rows = aggregateSalaLabor(records, employees);

  assert.deepEqual(rows, [{
    employee_id: 'sala-1',
    nombre: 'Ana Sala',
    horas: 14,
    coste_hora: 20,
    coste_total: 280
  }]);
  assert.equal('shift_id' in rows[0], false);
});

test('KPI Sala labor access is limited to admin and Sala supervisors', () => {
  assert.equal(canReadSalaLabor({ rol: 'admin' }), true);
  assert.equal(canReadSalaLabor({ rol: 'fb' }), true);
  assert.equal(canReadSalaLabor({ rol: 'jefe', area: 'Sala' }), true);
  assert.equal(canReadSalaLabor({ rol: 'chef', area: 'Cocina' }), false);
  assert.equal(canReadSalaLabor({ rol: 'empleado', area: 'Sala' }), false);
});

test('KPI Sala accepts at most 31 calendar dates and rejects invalid ranges', () => {
  assert.equal(validDateRange('2026-05-03', '2026-05-09'), true);
  assert.equal(validDateRange('2026-05-01', '2026-05-31'), true);
  assert.equal(validDateRange('2026-05-01', '2026-06-01'), false);
  assert.equal(validDateRange('2026-05-09', '2026-05-03'), false);
  assert.equal(validDateRange('2026-02-30', '2026-03-02'), false);
  assert.equal(validDateRange('03/05/2026', '09/05/2026'), false);
});
