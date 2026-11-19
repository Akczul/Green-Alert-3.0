import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createConsultarZonasRiesgo } from '../../src/modules/zonas-riesgo/application/consultar-zonas-riesgo.js';

// Este archivo no importa modelos, mysql2, Express, bootstrap ni .env.
const fixture = JSON.parse(await readFile(new URL('../fixtures/zonas-riesgo/contrato.json', import.meta.url)));
const memoryCache = () => {
  const values = new Map();
  return { get: (key) => values.get(key) ?? null, set: (key, value) => { values.set(key, value); return value; }, clear: () => values.clear(), size: () => values.size };
};
for (const entry of fixture.cases) {
  test(`caso de uso sin infraestructura conserva caracterización previa: ${entry.name}`, async () => {
    const calls = [];
    const consultar = createConsultarZonasRiesgo({
      reporteReader: { async findParaPrediccion(params) { calls.push(params); return structuredClone(entry.rows); } },
      clock: { now: () => fixture.now }, cache: memoryCache(),
    });
    const params = { ...entry.params, desde: new Date(entry.params.desde) };
    const actual = await consultar(params);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), entry.expected);
    assert.equal(calls.length, 1);
    const doubled = new Date(params.desde); doubled.setDate(doubled.getDate() - params.dias);
    assert.equal(calls[0].desde.getTime(), doubled.getTime());
    assert.equal(calls[0].tipo, params.tipo);
  });
}

test('caso de uso conserva clave de cache y no vuelve a leer ni altera timestamp en un hit', async () => {
  const entry = fixture.cases[1];
  const cache = memoryCache();
  let calls = 0;
  let now = fixture.now;
  const consultar = createConsultarZonasRiesgo({
    reporteReader: { async findParaPrediccion() { calls++; return entry.rows; } },
    clock: { now: () => now }, cache,
  });
  const params = { ...entry.params, desde: new Date(entry.params.desde) };
  const first = await consultar(params);
  now += 1000;
  const second = await consultar({ ...params, desde: new Date(now) });
  assert.strictEqual(second, first);
  assert.strictEqual(cache.get('zonas:{"dias":30,"tipo":null,"min_score":0}'), first);
  assert.equal(calls, 1);
  cache.clear();
  assert.notEqual((await consultar(params)).actualizado_en, first.actualizado_en);
  assert.equal(calls, 2);
});

test('caso de uso propaga el error del reader sin cachear una respuesta vacía', async () => {
  const failure = new Error('Fallo simulado del puerto de lectura');
  const cache = memoryCache();
  const consultar = createConsultarZonasRiesgo({
    reporteReader: { findParaPrediccion: async () => { throw failure; } }, clock: { now: () => fixture.now }, cache,
  });
  await assert.rejects(consultar({ dias: 30, desde: new Date(fixture.now), tipo: null, min_score: 0 }), (error) => error === failure);
  assert.equal(cache.size(), 0);
});
