import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  calculateHousekeepingAward,
  isTenureEligible,
  parseSemesterPeriod
} from '../api/housekeeping-semester-incentives.js';

test('identifica períodos semestrales válidos', () => {
  assert.deepEqual(parseSemesterPeriod('2026-S1'), {
    id: '2026-S1', year: 2026, semester: 1,
    start: '2026-01-01', end: '2026-06-30', label: '1.º semestre 2026'
  });
  assert.equal(parseSemesterPeriod('2026-01'), null);
});

test('exige más de seis meses al inicio del semestre', () => {
  assert.equal(isTenureEligible('2025-06-30', '2026-S1'), true);
  assert.equal(isTenureEligible('2025-07-01', '2026-S1'), false);
  assert.equal(isTenureEligible('', '2026-S1'), false);
});

test('calcula el tercer nivel con diez días o menos de baja', () => {
  assert.deepEqual(calculateHousekeepingAward({
    period: '2026-S1', fechaAlta: '2025-01-01', absenceDays: 10, previousAwardLevel: 2
  }), { tenureEligible: true, absenceEligible: true, level: 3, amount: 400 });
});

test('reinicia el premio cuando se supera el máximo de bajas', () => {
  assert.deepEqual(calculateHousekeepingAward({
    period: '2026-S1', fechaAlta: '2025-01-01', absenceDays: 11, previousAwardLevel: 3
  }), { tenureEligible: true, absenceEligible: false, level: 0, amount: 0 });
  assert.deepEqual(calculateHousekeepingAward({
    period: '2026-S2', fechaAlta: '2025-01-01', absenceDays: 0, previousAwardLevel: 0
  }), { tenureEligible: true, absenceEligible: true, level: 1, amount: 250 });
});

test('la interfaz presenta la entrada de bajas y la liquidación semestral', async () => {
  const source = await readFile(new URL('../housekeeping_incentivos.js', import.meta.url), 'utf8');
  const context = vm.createContext({ window: {}, document: {}, console, Date, JSON, Math, Number, String, Array });
  vm.runInContext(source, context);
  context._hkSemesterState.period = '2026-S1';
  const data = {
    employees: [{ id: 'HK-1', nombre: 'Ana', puesto: 'Camarera de pisos', fecha_alta: '2025-01-01', estado: 'Activo' }],
    records: [{
      employee_id: 'HK-1', employee_nombre: 'Ana', periodo: '2026-S1', dias_baja: 0,
      elegible_antiguedad: true, elegible_baja: true, nivel_premio: 3,
      importe_premio: 400, estado: 'pendiente'
    }],
    permissions: { can_record: true, can_liquidate: true }
  };

  const report = context._hkReportHtml(data);
  const liquidation = context._hkLiquidationHtml(data);
  assert.match(report, /Premio semestral/);
  assert.match(report, /Días de baja/);
  assert.match(report, /400,00 €/);
  assert.match(liquidation, /Liquidación semestral/);
  assert.match(liquidation, /Liquidar/);
});
