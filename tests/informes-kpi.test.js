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

test('POSMEWS persists production under the validated filename week before KPI reads it', async () => {
  const requests = [];
  const context = loadInformes({
    currentUser: { nombre: 'BOSS' },
    localTs: () => '2026-09-03T10:00:00+02:00',
    invalidateCache: () => {},
    syncroSupabaseFetch: async (url, init = {}) => {
      requests.push({ url, init });
      if ((init.method || 'GET') === 'GET') return { ok: true, json: async () => [] };
      return { ok: true, text: async () => '' };
    }
  });
  const data = {
    fechas: ['05/07/2026', '06/07/2026'],
    usuarios: ['Mey Redondo'],
    porUsuario: {
      'Mey Redondo': {
        employee_id: 'mey', csvNombre: 'Mey Redondo', totalBruto: 3250.5,
        facturas: 18, fechas: { '05/07/2026': 1500, '06/07/2026': 1750.5 }
      }
    }
  };
  const result = await context.window._infPersistSalaSemana(data, {
    inicio: '2026-07-05', fin: '2026-07-11'
  });

  assert.equal(result.ok, true);
  assert.equal(result.periodo, '2026-07-05_2026-07-11');
  const insert = requests.find(request => request.init.method === 'POST');
  assert.ok(insert);
  const rows = JSON.parse(insert.init.body);
  assert.equal(rows[0].periodo, '2026-07-05_2026-07-11');
  assert.equal(rows[0].semana_inicio, '2026-07-05');
  assert.equal(rows[0].semana_fin, '2026-07-11');
  assert.equal(rows[0].produccion_bruta, 3250.5);
});

test('automatic POSMEWS persistence preserves an existing saved week', async () => {
  const requests = [];
  const context = loadInformes({
    currentUser: { nombre: 'BOSS' },
    localTs: () => '2026-09-03T10:00:00+02:00',
    invalidateCache: () => {},
    syncroSupabaseFetch: async (url, init = {}) => {
      requests.push({ url, init });
      return { ok: true, json: async () => [{ id: 'saved-week' }] };
    }
  });
  const data = {
    fechas: ['05/07/2026'], usuarios: ['Mey Redondo'],
    porUsuario: { 'Mey Redondo': { totalBruto: 100, facturas: 1, fechas: {} } }
  };
  const result = await context.window._infPersistSalaSemana(data, {
    inicio: '2026-07-05', fin: '2026-07-11'
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadySaved, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.method || 'GET', 'GET');
});

test('Sala aggregates imported weeks for monthly and multi-month performance', () => {
  const context = loadInformes();
  const data = context._infSalaDataFromRows([
    {
      periodo: '2026-08-02_2026-08-08', nombre: 'Mey Redondo', employee_id: 'mey',
      produccion_bruta: 1200, facturas: 8, detalle_diario: { '2026-08-02': 500, '2026-08-03': 700 }
    },
    {
      periodo: '2026-08-09_2026-08-15', nombre: 'Mey Redondo', employee_id: 'mey',
      produccion_bruta: 1800, facturas: 10, detalle_diario: { '2026-08-09': 800, '2026-08-10': 1000 }
    }
  ]);

  assert.deepEqual(Array.from(data.usuarios), ['Mey Redondo']);
  assert.equal(data.porUsuario['Mey Redondo'].totalBruto, 3000);
  assert.equal(data.porUsuario['Mey Redondo'].facturas, 18);
  assert.equal(data.porUsuario['Mey Redondo'].fechas['2026-08-10'], 1000);
  assert.equal(data.tipo, 'mensual');
});

test('POSMEWS waits for employee production persistence before recording Facturas as valid', () => {
  const source = fs.readFileSync(new URL('../posmews_ventas.js', import.meta.url), 'utf8');
  const persistAt = source.indexOf('persisted=await window._infPersistSalaSemana');
  const fileOkAt = source.indexOf("await _pvSaveFile(type.key,file.name,'ok',null,parsed?parsed.usuarios.length:null)");
  assert.ok(persistAt >= 0);
  assert.ok(fileOkAt > persistAt);
});

test('Sala keeps POSMEWS upload in Informes and exposes waiter performance in Dashboard', () => {
  const informesSource = fs.readFileSync(new URL('../informes.js', import.meta.url), 'utf8');
  const dashboardSource = fs.readFileSync(new URL('../dashboard.js', import.meta.url), 'utf8');
  assert.match(informesSource, /key:'Sala'.*subtabs:\['ventas','incentivos','informe-jefe'\]/);
  assert.match(dashboardSource, /RENDIMIENTO POR CAMARERO/);
  assert.match(dashboardSource, /getDB\('sala_produccion_semanal'\)/);
  assert.match(dashboardSource, /Semana importada/);
  assert.match(dashboardSource, /Varios meses/);
  assert.match(dashboardSource, /_dashSalaRendimientoRequest/);
  assert.match(dashboardSource, /data-layout="compact-period-controls"/);
  assert.match(dashboardSource, /width:auto;max-width:100%;min-width:160px/);
  assert.match(dashboardSource, /compact:compact,dense:true/);
  assert.match(informesSource, /data-layout="compact-kpis"/);
  assert.match(informesSource, /repeat\(auto-fit,minmax\(135px,1fr\)\)/);
  assert.doesNotMatch(dashboardSource, /\+\s*\+\(typeof isAdmin/);
});
