import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadCashRules() {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function _labFondoFinal');
  const fundHelper = source.indexOf('function _labUltimoFondoTraspasado');
  const end = source.indexOf('\n}\n', fundHelper) + 2;
  assert.ok(start >= 0 && end > start, 'helper de fondo no encontrado');
  const context = vm.createContext({ isFinite, parseFloat });
  vm.runInContext(
    'var LAB_FONDOS_FINALES = { nubimed:120, virtugym:215 };\n'
      + source.slice(start, end)
      + '\nthis.pickFund = _labUltimoFondoTraspasado; this.cashClose = _labResumenCierreEfectivo;',
    context
  );
  return { pickFund: context.pickFund, cashClose: context.cashClose };
}

function loadOperationRule() {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function _labEsDomingo');
  const end = source.indexOf('\n}\n', source.indexOf('function _labOperacionRequerida')) + 2;
  assert.ok(start >= 0 && end > start, 'regla de operación por turno no encontrada');
  const context = vm.createContext({ Date });
  vm.runInContext(
    source.slice(start, end) + '\nthis.requiredOperation = _labOperacionRequerida;',
    context
  );
  return context.requiredOperation;
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

test('SYNCROLAB requires exactly one cash operation for each normal shift', () => {
  const requiredOperation = loadOperationRule();
  assert.equal(requiredOperation('Mañana', '2026-08-31'), 'traspaso');
  assert.equal(requiredOperation('Tarde', '2026-08-31'), 'cierre');
  assert.equal(requiredOperation('Mañana', '2026-08-30'), 'cierre');
  assert.equal(requiredOperation('Tarde', '2026-08-30'), 'cierre');
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
  assert.match(source, /No hay efectivo suficiente para dejar el fondo final/);
  assert.match(source, /function _labOperacionRequerida\(turno, fecha\)/);
  assert.match(source, /REGLA OBLIGATORIA/);
  assert.match(source, /Confirmo que he leído la regla de mi turno/);
  assert.match(source, /El turno de .+ debe registrar un cierre, no un traspaso/);
});
