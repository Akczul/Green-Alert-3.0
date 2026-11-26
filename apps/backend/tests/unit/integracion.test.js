import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperaciones } from '../../src/modules/integracion/application/operaciones.js';
import { createInternalClient } from '../../src/modules/integracion/adapters/outbound/http-clients.js';
import { createRedisCache } from '../../src/modules/zonas-riesgo/adapters/outbound/redis-cache.js';

test('analítica autoriza antes de leer SQL o llamar al proveedor y minimiza el snapshot', async () => {
  let body;
  const usecase = createOperaciones({ snapshots: { risk: async () => [] }, analytics: {
    analyzeRisk: async (data, context) => { body = data; assert.equal(context.scope, 'user:7'); return data; } },
    uuid: () => 'run', clock: { now: () => 1780000000000 } });
  await assert.rejects(usecase.risk({ rol: 'ciudadano' }), { statusCode: 403 });
  await assert.rejects(usecase.risk({ rol: 'admin' }, { dias: -1 }), { statusCode: 400 });
  await usecase.risk({ rol: 'admin', sub: 7 });
  assert.equal(body.source_kind, 'mysql'); assert.deepEqual(body.reports, []);
  assert.equal(body.period.end, '2026-05-28T20:26:40.000Z');
});
test('historial oculta objeto fuera de propiedad o ámbito institucional', async () => {
  const usecase = createOperaciones({ snapshots: { authorizedReport: async () => null },
    events: { history: () => assert.fail('No debe llamar Events') } });
  await assert.rejects(usecase.history({ rol: 'entidad', id_entidad: 9 }, 1, {}), { statusCode: 404 });
});
test('HTTP interno limita espera y oculta errores y credenciales', async () => {
  const client = createInternalClient({ baseUrl: 'http://analytics:8000', token: 's'.repeat(32),
    fetchImpl: async () => { throw new Error('secreto'); } });
  await assert.rejects(client.request('/x'), e => e.statusCode === 503 && !e.message.includes('secreto'));
});
test('Redis usa generación durable, TTL y métricas; falla hacia MySQL sin reutilizar caché obsoleta', async () => {
  const values = new Map(); let revision = 1; let ttl;
  const client = { isReady: true, on() {}, async get(k) { return values.get(k); },
    async set(k, v, options) { values.set(k, v); ttl = options.EX; } };
  const cache = createRedisCache({ client, pool: { execute: async () => [[{ revision }]] } });
  const generation = await cache.getRevision();
  assert.equal(await cache.get('zonas', generation), null);
  await cache.set('zonas', { value: 1 }, generation);
  assert.deepEqual(await cache.get('zonas', generation), { value: 1 }); assert.equal(ttl, 300);
  revision++;
  assert.equal(await cache.get('zonas', await cache.getRevision()), null);
  client.isReady = false;
  assert.equal(await cache.get('zonas', generation), null);
  assert.deepEqual(await cache.set('zonas', { value: 2 }, revision), { value: 2 });
  assert.equal(cache.metrics().hits, 1);
});
