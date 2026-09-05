import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  calculateHousekeepingAward,
  isSemesterCompleted,
  isTenureEligible,
  normalizeAbsencePeriods,
  parseSemesterPeriod,
  singleRpcRecord
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

test('solo permite liquidar semestres finalizados', () => {
  const now = new Date('2026-09-05T08:00:00Z');
  assert.equal(isSemesterCompleted('2026-S1', now), true);
  assert.equal(isSemesterCompleted('2026-S2', now), false);
  assert.equal(isSemesterCompleted('2025-S2', now), true);
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

test('acepta la respuesta única de las funciones de guardado', () => {
  assert.deepEqual(singleRpcRecord([{ id: 'premio-1' }]), { id: 'premio-1' });
  assert.deepEqual(singleRpcRecord({ id: 'premio-1' }), { id: 'premio-1' });
  assert.equal(singleRpcRecord([]), null);
});

test('valida rangos de baja completos y elimina duplicados exactos', () => {
  assert.deepEqual(normalizeAbsencePeriods([
    { employee_id: 'HK-1', fecha_inicio: '2026-06-29', fecha_fin: '2026-07-02' },
    { employee_id: 'HK-1', fecha_inicio: '2026-06-29', fecha_fin: '2026-07-02' },
    { employee_id: 'HK-1', fecha_inicio: '2026-08-10', fecha_fin: '2026-08-10' }
  ]), [
    { employee_id: 'HK-1', fecha_inicio: '2026-06-29', fecha_fin: '2026-07-02' },
    { employee_id: 'HK-1', fecha_inicio: '2026-08-10', fecha_fin: '2026-08-10' }
  ]);
  assert.equal(normalizeAbsencePeriods([
    { employee_id: 'HK-1', fecha_inicio: '2026-07-02', fecha_fin: '2026-06-29' }
  ]), null);
  assert.equal(normalizeAbsencePeriods([
    { employee_id: '', fecha_inicio: '2026-07-02', fecha_fin: '2026-07-03' }
  ]), null);
});

test('la liquidación de Housekeeping muestra datos calculados sin entrada manual', async () => {
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

  const liquidation = context._hkLiquidationHtml(data);
  assert.match(liquidation, /Liquidación semestral/);
  assert.match(liquidation, /Días baja/);
  assert.match(liquidation, /400,00 €/);
  assert.match(liquidation, /Marcar liquidado/);
  assert.doesNotMatch(liquidation, /type="number"/);
});

test('hay una sola pantalla de Liquidación con Entrenadores y Housekeeping', async () => {
  const source = await readFile(new URL('../housekeeping_incentivos.js', import.meta.url), 'utf8');
  const shared = await readFile(new URL('../shared.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const informes = await readFile(new URL('../informes.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20260904084500_unify_housekeeping_absence_periods.sql', import.meta.url), 'utf8');
  assert.match(source, /renderLiquidacionesPorDepartamento/);
  assert.match(source, /Entrenadores se liquida por mes; Housekeeping, por semestre/);
  assert.match(source, /department: 'Entrenadores'/);
  assert.match(shared, /id:'liquidaciones', label:'💳 Liquidación'/);
  assert.doesNotMatch(shared, /liquidacionEntr/);
  assert.match(html, /screen-liquidaciones/);
  assert.doesNotMatch(html, /screen-liquidacion-entr/);
  assert.match(informes, /\+ Añadir otra baja de esta empleada/);
  assert.match(informes, /hkSyncReportAbsences/);
  assert.match(migration, /count\(distinct day_value\)/);
  assert.match(migration, /set estado = 'publicado', ts = now\(\)/);
  assert.match(migration, /incentive\.origen = 'informe_junio_2026'/);
});

test('Informe de Jefe de Housekeeping muestra la plantilla y captura bajas por fechas', async () => {
  const informes = await readFile(new URL('../informes.js', import.meta.url), 'utf8');
  const elements = {
    'inf-rrhh-rows': { innerHTML: '' },
    'inf-f-dept': { value: 'Housekeeping' }
  };
  const context = vm.createContext({
    window: {
      _infRrhhRows: [],
      _infEmpDept: [
        { id: 'HK-1', nombre: 'Empleada Uno', area: 'Limpieza', estado: 'Activo' },
        { id: 'HK-2', nombre: 'Empleada Dos', area: 'HK', estado: 'Activo' }
      ]
    },
    document: { getElementById: id => elements[id] || null },
    _escHtml: value => String(value ?? ''),
    toast: () => {},
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Array
  });
  vm.runInContext(informes, context);
  context.window._infRrhhRows = [];
  context.window._infEmpDept = [
    { id: 'HK-1', nombre: 'Empleada Uno', area: 'Limpieza', estado: 'Activo' },
    { id: 'HK-2', nombre: 'Empleada Dos', area: 'HK', estado: 'Activo' }
  ];
  context._infRenderRrhhRows();
  assert.match(elements['inf-rrhh-rows'].innerHTML, /Empleada Uno/);
  assert.match(elements['inf-rrhh-rows'].innerHTML, /Empleada Dos/);
  assert.match(elements['inf-rrhh-rows'].innerHTML, /\+ Añadir baja/);
  context.window._infAddHkAbsence('HK-1');
  assert.match(elements['inf-rrhh-rows'].innerHTML, /Inicio de baja 1/);
  assert.match(elements['inf-rrhh-rows'].innerHTML, /Fin de baja 1/);
  assert.match(elements['inf-rrhh-rows'].innerHTML, /type="date"/);
  assert.match(informes, /Registrar bajas laborales/);
  assert.match(informes, /emps\.forEach\(function\(employee\)/);
  assert.match(informes, /window\._infAddHkAbsence/);
  assert.match(informes, /Inicio de baja/);
  assert.match(informes, /Fin de baja/);
  assert.match(informes, /Días calculados:/);
  assert.match(informes, /\+ Añadir otra baja/);
  assert.match(informes, /_infIsHousekeeping\(e\.area\)/);
  assert.match(informes, /rol==='gobernante'/);
});
