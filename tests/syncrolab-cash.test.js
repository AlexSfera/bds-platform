import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadCashRules() {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function _labFondoFinal');
  const fundHelper = source.indexOf('function _labFondoInicialCierre');
  const end = source.indexOf('\n}\n', fundHelper) + 2;
  assert.ok(start >= 0 && end > start, 'helper de fondo no encontrado');
  const context = vm.createContext({ isFinite, parseFloat });
  vm.runInContext(
    'var LAB_FONDOS_FINALES = { nubimed:120, virtugym:215 };\n'
      + source.slice(start, end)
      + '\nthis.pickFund = _labUltimoFondoTraspasado; this.closingFund = _labFondoInicialCierre; this.cashClose = _labResumenCierreEfectivo;',
    context
  );
  return { pickFund: context.pickFund, closingFund: context.closingFund, cashClose: context.cashClose };
}

function loadOperationRule() {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function _labEsDomingo');
  const end = source.indexOf('\n}\n', source.indexOf('function _labOperacionRequerida')) + 2;
  assert.ok(start >= 0 && end > start, 'regla de operación por turno no encontrada');
  const context = vm.createContext({ Date, currentUser: { rol: 'empleado' } });
  vm.runInContext(
    source.slice(start, end) + '\nthis.requiredOperation = _labOperacionRequerida; this.canClose = _labPuedeCerrar;',
    context
  );
  return { requiredOperation: context.requiredOperation, canClose: context.canClose };
}

function loadChargeRules() {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function _labCargoPerteneceAOperacion');
  const end = source.indexOf('\n}\n', source.indexOf('function _labCargosTraspasoDeFecha')) + 2;
  assert.ok(start >= 0 && end > start, 'reglas de cargos no encontradas');
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end) + '\nthis.transferCharges = _labCargosTraspasoDeFecha;', context);
  return context.transferCharges;
}

function loadTodayOperation(rows, date) {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function _labEsDomingo');
  const end = source.indexOf('\n}\n', source.indexOf('async function getLabOpToday')) + 2;
  assert.ok(start >= 0 && end > start, 'búsqueda de operación diaria no encontrada');
  const context = vm.createContext({
    Date,
    LAB_TABLE: 'syncrolab_cash_closures',
    currentUser: { rol: 'empleado' },
    dbGetAll: async () => rows,
    today: () => date
  });
  vm.runInContext(source.slice(start, end) + '\nthis.getTodayOperation = getLabOpToday;', context);
  return context.getTodayOperation;
}

test('SYNCROLAB uses the latest actual transfer for each separate cash register', () => {
  const { pickFund } = loadCashRules();
  const rows = [
    { fecha: '2026-08-20', created_at: '2026-08-20T20:00:00Z', efectivo_traspasado_nubimed: 50, efectivo_traspasado_virtugym: 30 },
    { fecha: '2026-08-21', created_at: '2026-08-21T20:00:00Z', fondo_recibido_nubimed: 999, fondo_recibido_virtugym: 999 },
    { fecha: '2026-08-22', created_at: '2026-08-22T20:00:00Z', efectivo_traspasado_nubimed: '0', efectivo_traspasado_virtugym: 45 }
  ];
  assert.equal(pickFund(rows, 'nubimed'), 0);
  assert.equal(pickFund(rows, 'virtugym'), 45);
});

test('SYNCROLAB reports missing transfer history instead of using a received-fund field', () => {
  const { pickFund } = loadCashRules();
  assert.equal(pickFund([
    { fecha: '2026-08-22', fondo_recibido_nubimed: 100, fondo_recibido_virtugym: 100 }
  ], 'nubimed'), null);
});

test('SYNCROLAB starts after a closure with the fixed fund, not the cash withdrawal', () => {
  const { pickFund } = loadCashRules();
  const rows = [
    { fecha: '2026-08-27', created_at: '2026-08-27T08:00:00Z', tipo: 'traspaso', efectivo_traspasado_nubimed: 620, efectivo_traspasado_virtugym: 173 },
    { fecha: '2026-08-27', created_at: '2026-08-27T21:00:00Z', tipo: 'cierre', efectivo_traspasado_nubimed: 500, efectivo_traspasado_virtugym: 0 }
  ];
  assert.equal(pickFund(rows, 'nubimed'), 120);
  assert.equal(pickFund(rows, 'virtugym'), 215);
});

test('SYNCROLAB passes the counted physical cash to the next shift after a recorded shortage', () => {
  const { pickFund } = loadCashRules();
  const rows = [{
    fecha: '2026-08-31', created_at: '2026-08-31T21:00:00Z', tipo: 'cierre',
    fondo_recibido_nubimed: 120,
    efectivo_nubimed_sistema: 60,
    efectivo_nubimed_real: 60,
    total_sistema_nubimed: 180,
    efectivo_traspasado_nubimed: 0
  }];
  assert.equal(pickFund(rows, 'nubimed'), 60);
});

test('SYNCROLAB calculates end-of-day cash withdrawal after retaining each fixed fund', () => {
  const { cashClose } = loadCashRules();
  assert.deepEqual(
    { ...cashClose(335, 285, 620, 120) },
    { esperado: 620, diferencia: 0, retiro: 500, fondo_final: 120 }
  );
  assert.deepEqual(
    { ...cashClose(173, 0, 173, 215) },
    { esperado: 173, diferencia: 0, retiro: -42, fondo_final: 215 }
  );
});

test('SYNCROLAB closes Tarde with the opening fund, not the total delivered in Mañana transfer', () => {
  const { closingFund, cashClose } = loadCashRules();
  const rows = [
    { fecha: '2026-08-30', created_at: '2026-08-30T21:00:00Z', tipo: 'cierre', fondo_recibido_nubimed: 120, efectivo_nubimed_sistema: 0, total_sistema_nubimed: 120, efectivo_nubimed_real: 120 },
    { fecha: '2026-08-31', created_at: '2026-08-31T13:00:00Z', tipo: 'traspaso', fondo_recibido_nubimed: 120, efectivo_traspasado_nubimed: 450 }
  ];
  assert.equal(closingFund(rows, 'nubimed'), 120);
  assert.deepEqual(
    { ...cashClose(200, 470, 670, 200) },
    { esperado: 670, diferencia: 0, retiro: 470, fondo_final: 200 }
  );
});

test('SYNCROLAB shows charges from Mañana transfer in Tarde closure without taking closure charges', () => {
  const transferCharges = loadChargeRules();
  const rows = [
    { id: 'morning-transfer', fecha: '2026-08-31', tipo: 'traspaso' },
    { id: 'afternoon-close', fecha: '2026-08-31', tipo: 'cierre' }
  ];
  const charges = [
    { id: 'one', syncrolab_cash_id: 'morning-transfer', importe: 20 },
    { id: 'two', syncrolab_cash_closure_id: 'morning-transfer', importe: 30 },
    { id: 'three', cash_closure_id: 'afternoon-close', importe: 40 }
  ];
  assert.deepEqual(
    transferCharges(rows, charges, '2026-08-31').map((charge) => charge.id),
    ['one', 'two']
  );
});

test('SYNCROLAB assigns transfer/closure by weekday and a direct closure on Sunday', () => {
  const { requiredOperation, canClose } = loadOperationRule();
  assert.equal(requiredOperation('Mañana', '2026-08-31'), 'traspaso');
  assert.equal(requiredOperation('Tarde', '2026-08-31'), 'cierre');
  assert.equal(requiredOperation('Mañana', '2026-09-06'), 'cierre');
  assert.equal(requiredOperation('Tarde', '2026-09-06'), 'cierre');
  assert.equal(canClose('Mañana', '2026-09-06'), true);
  assert.equal(canClose('Mañana', '2026-09-07'), false);
  assert.equal(canClose('Tarde', '2026-09-07'), true);
  assert.equal(requiredOperation('Noche', '2026-08-31'), null);
});

test('SYNCROLAB treats Sunday as one cash operation for the whole day', async () => {
  const rows = [{ id: 'sunday-close', fecha: '2026-09-06', turno: 'Tarde', tipo: 'cierre' }];
  const sundayOperation = loadTodayOperation(rows, '2026-09-06');
  assert.equal((await sundayOperation('Mañana')).id, 'sunday-close');

  const mondayOperation = loadTodayOperation(rows, '2026-09-07');
  assert.equal(await mondayOperation('Mañana'), null);
});

test('SYNCROLAB keeps independent guards and blocks duplicate operations for every role', () => {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  assert.match(source, /var _labChargesSaving = false/);
  assert.match(source, /if\(_labChargesSaving\)\{[^}]*return;/);
  assert.match(source, /async function submitLabTraspaso\(\)\{\s*if\(_labSubmitting\) return;/);
  assert.match(source, /async function submitLabCierre\(\)\{\s*if\(_labSubmitting\) return;/);
  assert.match(source, /if\(!_labTraspasoEditId\)\{\s*var dup=await getLabOpToday\(turno\);/);
  assert.match(source, /if\(!_labCierreEditId\)\{\s*var dup=await getLabOpToday\(turno\);/);
  assert.match(source, /var _labMissingTransferHistory = \{ nubimed:false, virtugym:false \}/);
  assert.match(source, /No hay efectivo traspasado anterior para/);
  assert.match(source, /if\(!_labTraspasoEditId && \(_labMissingTransferHistory\.nubimed \|\| _labMissingTransferHistory\.virtugym\)\)/);
  assert.match(source, /if\(!_labCierreEditId && \(_labMissingTransferHistory\.nubimed \|\| _labMissingTransferHistory\.virtugym\)\)/);
  assert.match(source, /lab-tras-aviso/);
  assert.match(source, /lab-c-aviso/);
  assert.match(source, /var LAB_FONDOS_FINALES = \{ nubimed:120, virtugym:215 \}/);
  assert.match(source, /Fondo final que queda en caja/);
  assert.match(source, /rec\.efectivo_traspasado_nubimed=Math\.max\(0,retiros\.nubimed\|\|0\)/);
  assert.match(source, /Efectivo físico esperado/);
  assert.match(source, /Diferencia total de caja/);
  assert.match(source, /Se guardará con retiro 0 € y explicación obligatoria/);
  assert.doesNotMatch(source, /No hay efectivo suficiente para dejar el fondo final/);
  assert.match(source, /function _labOperacionRequerida\(turno, fecha\)/);
  assert.match(source, /if\(_labEsDomingo\(fecha\)\) return 'cierre';/);
  assert.match(source, /if\(turno === 'Tarde'\) return 'cierre';/);
  assert.match(source, /function _labFondoInicialCierre\(rows, sistema\)/);
  assert.match(source, /var _labCierreChargesPrevios = \[\]/);
  assert.match(source, /Cargos registrados en el traspaso de Mañana/);
  assert.match(source, /Añadir nuevos cargos de este cierre/);
  assert.match(source, /syncrolab_cash_id === operacionId/);
  assert.match(source, /_labCargosTraspasoDeFecha\(rows, charges, fecha\)/);
  assert.match(source, /No sumes el traspaso de Mañana otra vez/);
  assert.match(source, /REGLA OBLIGATORIA/);
  assert.match(source, /Domingo:<\/b> el turno único hace cierre directo; no hay traspaso/);
  assert.match(source, /El domingo SYNCROLAB realiza un cierre único; no hay traspaso/);
  assert.match(source, /Confirmo que he leído la regla de mi turno/);
  assert.match(source, /El turno de .+ debe registrar un cierre, no un traspaso/);
});
