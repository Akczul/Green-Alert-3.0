import { mockAuthContract } from '../helpers/auth-contract.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import { createConsultarZonasRiesgo } from '../../src/modules/zonas-riesgo/application/consultar-zonas-riesgo.js';
import { createGetZonasRiesgo } from '../../src/modules/zonas-riesgo/adapters/inbound/express-controller.js';
import { createPredictionCache } from '../../src/modules/zonas-riesgo/adapters/outbound/prediction-cache.js';
import { verifyToken, requireRoles } from '../../middlewares/auth.middleware.js';
import { errorHandler } from '../../middlewares/errorHandler.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/zonas-riesgo/contrato.json', import.meta.url)));
process.env.JWT_SECRET = 'secreto-sintetico-exclusivo-de-contrato-http';
process.env.NODE_ENV = 'test';

async function start(t, { prefix = '/api', reader = { findParaPrediccion: async () => fixture.cases[1].rows } } = {}) {
  const clock = { now: () => fixture.now };
  const consultar = createConsultarZonasRiesgo({ reporteReader: reader, clock, cache: createPredictionCache({ clock }) });
  const app = express();
  app.get(`${prefix}/reportes/zonas-riesgo`, verifyToken, requireRoles('admin', 'moderador'), createGetZonasRiesgo({ consultarZonasRiesgo: consultar, clock }));
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  return async (query = '', rol) => {
    const token = rol === 'invalid' ? 'invalido' : rol ? jwt.sign({ sub: 1, rol }, process.env.JWT_SECRET) : null;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${prefix}/reportes/zonas-riesgo${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() };
  };
}

for (const prefix of ['/api', '']) {
  test(`contrato HTTP ${prefix || '(sin prefijo)'} conserva JSON exacto y permite admin/moderador`, async (t) => {
    const request = await start(t, { prefix });
    for (const role of ['admin', 'moderador']) {
      const response = await request('?min_score=0', role);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { status: 'success', message: 'Zonas de riesgo obtenidas correctamente.', data: fixture.cases[1].expected });
    }
  });
}

test.beforeEach(mockAuthContract);

test('contrato HTTP deniega sin JWT, JWT inválido, ciudadano y entidad antes de consultar', async (t) => {
  let reads = 0;
  const request = await start(t, { reader: { async findParaPrediccion() { reads++; return []; } } });
  assert.equal((await request()).status, 401);
  for (const role of ['invalid', 'ciudadano', 'entidad']) assert.equal((await request('', role)).status, 403);
  assert.equal(reads, 0);
});

test('contrato HTTP conserva errores 400 y no consulta SQL en query inválido', async (t) => {
  t.mock.method(console, 'error', () => {});
  let reads = 0;
  const request = await start(t, { reader: { async findParaPrediccion() { reads++; return []; } } });
  for (const [query, message] of [['?dias=x', 'El parametro debe ser un entero entre 1 y 365.'], ['?min_score=101', 'min_score debe ser un numero entre 0 y 100.']]) {
    const response = await request(query, 'admin');
    assert.deepEqual(response, { status: 400, body: { status: 'error', message } });
  }
  assert.equal(reads, 0);
});

test('contrato HTTP propaga fallos SQL como error 500, sin resultados simulados', async (t) => {
  t.mock.method(console, 'error', () => {});
  const request = await start(t, { reader: { async findParaPrediccion() { throw new Error('SQL no disponible (simulado)'); } } });
  assert.deepEqual(await request('', 'admin'), { status: 500, body: { status: 'error', message: 'SQL no disponible (simulado)' } });
});
