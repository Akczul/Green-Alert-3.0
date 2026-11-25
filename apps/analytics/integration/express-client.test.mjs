import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnalyticsClient } from './express-client.mjs';

const config = { baseUrl: 'http://analytics:8000', token: 't'.repeat(40) };
test('cliente propaga autenticación, ámbito y errores sin reintentos automáticos', async () => {
  let calls = 0;
  const client = createAnalyticsClient({ ...config, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url.pathname, '/internal/v1/risk-runs');
    assert.equal(options.headers['X-Analytics-Scope'], 'global');
    assert.equal(options.headers.Authorization, `Bearer ${config.token}`);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ code: 'COMPUTE_BUSY', message: 'Ocupado' }), { status: 429 });
  } });
  await assert.rejects(client.analyzeRisk({}, { scope: 'global' }), { status: 429, code: 'COMPUTE_BUSY' });
  assert.equal(calls, 1);
});
test('cliente clasifica timeout y rechaza ámbito no confiable', async () => {
  const client = createAnalyticsClient({ ...config, fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
  await assert.rejects(client.analyzeRisk({}, { scope: 'global' }), { status: 504, code: 'ANALYTICS_TIMEOUT' });
  await assert.rejects(client.analyzeRisk({}, { scope: 'mal ámbito' }), TypeError);
});
test('cliente entrega resultado del servicio', async () => {
  const client = createAnalyticsClient({ ...config, fetchImpl: async () => new Response(JSON.stringify({ status: 'success', data: { run_id: 'ok' } })) });
  assert.deepEqual(await client.analyzeRisk({}, { scope: 'global' }), { run_id: 'ok' });
});
