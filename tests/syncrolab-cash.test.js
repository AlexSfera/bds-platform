import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadLastTransferredFund() {
  const source = fs.readFileSync(new URL('../syncrolab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function _labUltimoFondoTraspasado');
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start, 'helper de fondo no encontrado');
  const context = vm.createContext({ isFinite, parseFloat });
  vm.runInContext(source.slice(start, end) + '\nthis.pickFund = _labUltimoFondoTraspasado;', context);
  return context.pickFund;
}

test('SYNCROLAB uses the latest actual transfer for each separate cash register', () => {
  const pickFund = loadLastTransferredFund();
  const rows = [
    { fecha: '2026-08-20', created_at: '2026-08-20T20:00:00Z', efectivo_traspasado_nubimed: 50, efectivo_traspasado_virtugym: 30 },
    { fecha: '2026-08-21', created_at: '2026-08-21T20:00:00Z', fondo_recibido_nubimed: 999, fondo_recibido_virtugym: 999 },
    { fecha: '2026-08-22', created_at: '2026-08-22T20:00:00Z', efectivo_traspasado_nubimed: '0', efectivo_traspasado_virtugym: 45 }
  ];
  assert.equal(pickFund(rows, 'nubimed'), 0);
  assert.equal(pickFund(rows, 'virtugym'), 45);
});

test('SYNCROLAB reports missing transfer history instead of using a received-fund field', () => {
  const pickFund = loadLastTransferredFund();
  assert.equal(pickFund([
    { fecha: '2026-08-22', fondo_recibido_nubimed: 100, fondo_recibido_virtugym: 100 }
  ], 'nubimed'), null);
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
});
