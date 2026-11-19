import test from 'node:test';
import assert from 'node:assert/strict';
import { createMysqlReporteReader } from '../../src/modules/zonas-riesgo/adapters/outbound/mysql-reporte-reader.js';
import { createPredictionCache, PREDICCION_CACHE_TTL_MS } from '../../src/modules/zonas-riesgo/adapters/outbound/prediction-cache.js';
import { parseZonasParams } from '../../src/modules/zonas-riesgo/adapters/inbound/zonas-params.js';

test('reader parametriza categoría y fecha y conserva decimales/Date de mysql2', async () => {
  const date = new Date('2026-11-18T12:00:00Z');
  const rows = [{ latitud: '1.15000000', longitud: '-76.65000000', created_at: date }];
  let call;
  const reader = createMysqlReporteReader({ pool: { async execute(sql, params) { call = { sql, params }; return [rows]; } } });
  const tipo = "agua' OR 1=1 --";
  assert.strictEqual(await reader.findParaPrediccion({ desde: date, tipo }), rows);
  assert.deepEqual(call.params, [date, tipo]);
  assert.equal(call.sql.includes(tipo), false);
  assert.match(call.sql, /ORDER BY r.created_at DESC/);
});

test('cache vence exactamente a cinco minutos y comparte invalidación entre namespaces', () => {
  let now = 1000;
  const cache = createPredictionCache({ clock: { now: () => now } });
  const value = { zonas: [] };
  cache.set('zonas:caso', value); cache.set('alertas:caso', {});
  now += PREDICCION_CACHE_TTL_MS - 1;
  assert.strictEqual(cache.get('zonas:caso'), value);
  now++;
  assert.equal(cache.get('zonas:caso'), null);
  cache.clear(); assert.equal(cache.size(), 0);
  assert.equal(cache.get('alertas:caso'), null);
});

test('query HTTP mantiene límites, coerciones y mensajes existentes', () => {
  const clock = { now: () => Date.parse('2026-11-18T12:00:00Z') };
  assert.equal(parseZonasParams({ dias: '0' }, clock).dias, 1);
  assert.equal(parseZonasParams({ dias: '999' }, clock).dias, 365);
  assert.equal(parseZonasParams({ dias: '7.9dias', tipo: ' AGUA ', min_score: ' ' }, clock).min_score, 0);
  assert.equal(parseZonasParams({ tipo: [] }, clock).tipo, null);
  assert.throws(() => parseZonasParams({ dias: 'invalido' }, clock), { statusCode: 400, message: 'El parametro debe ser un entero entre 1 y 365.' });
  assert.throws(() => parseZonasParams({ min_score: '101' }, clock), { statusCode: 400, message: 'min_score debe ser un numero entre 0 y 100.' });
});
