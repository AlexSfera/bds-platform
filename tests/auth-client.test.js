import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

test('legacy transport remains available if the cutover flag is rolled back', async () => {
  const productionSource = await readFile(new URL('../auth-client.js', import.meta.url), 'utf8');
  assert.match(productionSource, /var AUTH_ENABLED = true;/);
  const source = productionSource.replace(
    'var AUTH_ENABLED = true;',
    'var AUTH_ENABLED = false;'
  );
  const calls = [];
  const expected = { ok: true, status: 200 };
  const window = {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return expected;
    }
  };
  vm.runInNewContext(source, { window });

  assert.equal(window.SyncroAuth.enabled, false);
  const init = { headers: { Authorization: 'Bearer publishable-key' } };
  const result = await window.syncroSupabaseFetch('https://project.supabase.co/rest/v1/test', init);
  assert.equal(result, expected);
  assert.deepEqual(calls, [{
    input: 'https://project.supabase.co/rest/v1/test',
    init
  }]);
});

test('all audited browser Supabase fetches use the central authenticated transport', async () => {
  const files = [
    'adjuntos.js', 'caja.js', 'dashboard.js', 'faults.js', 'incentivos.js',
    'informes.js', 'mantenimiento.js', 'merma.js', 'mi_rendimiento.js',
    'posmews_ventas.js', 'recepcion.js', 'syncrolab.js', 'tareas.js',
    'validacion.js'
  ];
  for (const file of files) {
    const source = await readFile(new URL('../' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(^|[^A-Za-z0-9_])fetch\s*\(/, file);
    assert.match(source, /syncroSupabaseFetch\s*\(/, file);
  }

  const shared = await readFile(new URL('../shared.js', import.meta.url), 'utf8');
  const directFetches = shared.match(/(^|[^A-Za-z0-9_])fetch\s*\(/gm) || [];
  assert.equal(directFetches.length, 2, 'shared.js sólo conserva los dos POST internos de correo');
  assert.match(shared, /syncroSupabaseFetch\s*\(/);
  assert.match(shared, /table === 'employees'.*SyncroAuth\.enabled/s);
  assert.match(shared, /SyncroAuth\.employees\(\)/);
});
