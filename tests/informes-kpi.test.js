import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadInformes(overrides = {}) {
  const context = vm.createContext({
    window: {},
    document: { querySelectorAll: () => [], getElementById: () => null },
    console,
    URL,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'publishable-test-key',
    ...overrides
  });
  vm.runInContext(fs.readFileSync(new URL('../informes.js', import.meta.url), 'utf8'), context);
  return context;
}

test('Sala labor cost requests Bitrix hours for the selected week and joins by employee id', async () => {
  let requestedUrl = '';
  const context = loadInformes({
    syncroSupabaseFetch: async url => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ rows: [
        { employee_id: 'emp-1', nombre: 'Nombre actual', horas: 14, coste_hora: 20, coste_total: 280 }
      ] }) };
    }
  });
  const result = await vm.runInContext("_infSalaCostLaboral('2026-05-03','2026-05-09')", context);
  assert.match(requestedUrl, /^\/api\/kpi-sala-labor\?/);
  assert.match(requestedUrl, /desde=2026-05-03/);
  assert.match(requestedUrl, /hasta=2026-05-09/);
  assert.equal(result.byId['emp-1'].horas, 14);
  assert.equal(result.byId['emp-1'].coste_total, 280);
});

test('Sala labor matches safe abbreviated and extended employee names', () => {
  const context = loadInformes();
  const costData = {
    byId: {}, byNombre: {}, rows: [
      { employee_id: 'kevin', nombre: 'Kevin Fuster', horas: 32 },
      { employee_id: 'sharon', nombre: 'Sharon Arenas Garcia', horas: 28 }
    ]
  };
  const kevin = context._infSalaCosteUsuario(
    costData, { employee_id: null, csvNombre: 'Kevin Fuster Matias' }, 'Kevin Fuster Matias'
  );
  const sharon = context._infSalaCosteUsuario(
    costData, { employee_id: null, csvNombre: 'Sharon Garcia' }, 'Sharon Garcia'
  );
  assert.equal(kevin.employee_id, 'kevin');
  assert.equal(sharon.employee_id, 'sharon');
  assert.equal(context._infNombreCompatible('Kevin Aman', 'Kevin Fuster'), false);
});

test('duplicate normalized names are not joined as an exact match', () => {
  const context = loadInformes();
  const result = context._infSalaCosteUsuario({
    byId: {}, byNombre: { 'ana sala': null }, rows: [
      { employee_id: 'ana-1', nombre: 'Ana Sala' },
      { employee_id: 'ana-2', nombre: 'Ana Sala' }
    ]
  }, { employee_id: null, csvNombre: 'Ana Sala' }, 'Ana Sala');
  assert.equal(result, null);
});

test('saved KPI weeks request labor using the selected ISO week, not legacy detail keys', async () => {
  let requestedUrl = '';
  const result = { innerHTML: '' };
  const actions = { innerHTML: '' };
  const context = loadInformes({
    currentUser: { nombre: 'BOSS' },
    isAdmin: () => false,
    getDB: async () => [{
      periodo: '2026-05-03_2026-05-09', nombre: 'Mey Redondo', csv_nombre: 'Mey Redondo',
      employee_id: 'mey', produccion_bruta: 100, facturas: 1,
      detalle_diario: { '03/05/2026': 100 }
    }],
    syncroSupabaseFetch: async url => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ rows: [] }) };
    },
    document: {
      querySelectorAll: () => [],
      getElementById: id => id === 'inf-sala-result' ? result : id === 'inf-kpi-actions' ? actions : null
    }
  });
  context._infControlWeek = { inicio: '2026-05-03', fin: '2026-05-09' };
  context._renderSalaTabla = () => {};
  await context._infLoadSalaFromDB();
  assert.match(requestedUrl, /desde=2026-05-03/);
  assert.match(requestedUrl, /hasta=2026-05-09/);
  assert.doesNotMatch(requestedUrl, /03%2F05%2F2026/);
});
