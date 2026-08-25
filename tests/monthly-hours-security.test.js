import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import backfillHandler from '../api/bitrix-backfill-hours.js';

function responseRecorder() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('historical hours backfill accepts POST only before any external request', async () => {
  const res = responseRecorder();
  await backfillHandler({ method: 'GET', headers: {}, url: '/api/bitrix-backfill-hours' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
  assert.deepEqual(res.body, { error: 'method_not_allowed' });
});

test('historical backfill binds admin access to the current authorization version', async () => {
  const source = await readFile(new URL('../api/bitrix-backfill-hours.js', import.meta.url), 'utf8');
  assert.match(source, /force_pin_change,authz_version/);
  assert.match(source, /authzVersionFromAccessToken\(bearerToken\)/);
  assert.match(source, /tokenVersion !== ident\.authz_version/);
  assert.match(source, /emp\.estado !== 'Activo'/);
});
