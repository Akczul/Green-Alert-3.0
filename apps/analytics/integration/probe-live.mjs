// Verificación del adaptador Node contra FastAPI/Mongo reales del runner.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAnalyticsClient } from './express-client.mjs';

const baseUrl = process.argv[2];
const client = createAnalyticsClient({ baseUrl, token: process.env.ANALYTICS_INTERNAL_TOKEN });
const context = { scope: 'node-live' };
const payload = {
  run_id: randomUUID(), source_revision: 'node-live-synthetic-v1', source_kind: 'synthetic',
  period: { start: '2026-11-01T00:00:00Z', end: '2026-11-24T00:00:00Z' }, min_score: 0,
  reports: [{ report_uuid: randomUUID(), tipo_contaminacion: 'agua', nivel_severidad: 'alto',
    latitud: 1.151, longitud: -76.651, created_at: '2026-11-20T00:00:00Z' }],
};
const created = await client.analyzeRisk(payload, context);
assert.equal(created.results.zonas[0].n_reportes, 1);
assert.deepEqual(await client.getRun(payload.run_id, context), created);
assert.deepEqual(await client.analyzeRisk(payload, context), created);
const wrong = createAnalyticsClient({ baseUrl, token: 'invalid'.repeat(8) });
await assert.rejects(wrong.getRun(payload.run_id, context), { status: 401 });
await assert.rejects(client.getRun(payload.run_id, { scope: 'another-scope' }), { status: 404 });
console.log(JSON.stringify({ node_http_mongo_roundtrip: true, replay: true, unauthorized: 401, scope_denied: 404 }));
