import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMysqlReporteReader } from '../apps/backend/src/modules/zonas-riesgo/adapters/outbound/mysql-reporte-reader.js';
import { createConsultarZonasRiesgo } from '../apps/backend/src/modules/zonas-riesgo/application/consultar-zonas-riesgo.js';
import { createPredictionCache } from '../apps/backend/src/modules/zonas-riesgo/adapters/outbound/prediction-cache.js';
import { parseZonasParams } from '../apps/backend/src/modules/zonas-riesgo/adapters/inbound/zonas-params.js';

// Se ejecuta únicamente dentro del runner aislado, con su conexión y fixtures.
export async function runZonasRiesgoIntegration({ check, request, admin, state }) {
  const now = Date.now();
  const clock = { now: () => now };
  const ids = [];
  const reader = createMysqlReporteReader({ pool: admin });
  const route = '/reportes/zonas-riesgo?tipo=aire&min_score=0';
  let before;
  let zoneId;
  await check('Piloto: adaptador MySQL filtra estados, borrado, coordenadas, fecha y categoría', async () => {
    const fixtures = [
      [2, 'alto', -0.011, -120.011, 'en_proceso'],
      [35, 'medio', -0.011, -120.011, 'resuelto'],
      [3, 'bajo', 20.111, 30.111, 'resuelto'],
      [40, 'bajo', 20.111, 30.111, 'en_proceso'],
      [61, 'alto', -0.011, -120.011, 'en_proceso'],
      [1, 'alto', 50, 50, 'pendiente'],
      [1, 'alto', 51, 51, 'rechazado'],
      [1, 'alto', 52, 52, 'en_proceso', true],
      [1, 'alto', null, 53, 'en_proceso'],
      [1, 'alto', 54, null, 'en_proceso'],
      [1, 'alto', 55, 55, 'en_proceso', false, 'agua'],
    ];
    for (const [days, severity, lat, lng, status, deleted = false, tipo = 'aire'] of fixtures) {
      const [insert] = await admin.execute(`INSERT INTO reportes
        (uuid,id_usuario,tipo_contaminacion,nivel_severidad,latitud,longitud,estado,deleted_at,created_at,titulo,municipio,departamento)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [randomUUID(), state.citizen.user.id_usuario, tipo, severity, lat, lng, status, deleted ? new Date(now) : null, new Date(now - days * 86400000), 'Fixture de zonas piloto', 'Mocoa', 'Putumayo']);
      ids.push(insert.insertId);
    }
    const desde = new Date(now); desde.setDate(desde.getDate() - 60);
    const rows = await reader.findParaPrediccion({ desde, tipo: 'aire' });
    assert.deepEqual(rows.map((row) => row.id_reporte), [ids[0], ids[2], ids[1], ids[3]]);
    assert.equal(typeof rows[0].latitud, 'string');
    assert.ok(rows[0].created_at instanceof Date);
    assert.equal(Object.hasOwn(rows[0], 'id_usuario'), false);
    assert.deepEqual(await reader.findParaPrediccion({ desde, tipo: "aire' OR 1=1 --" }), []);
  });
  await check('Piloto: caso con reader real y endpoint por Vite producen las mismas zonas', async () => {
    const consultar = createConsultarZonasRiesgo({ reporteReader: reader, clock, cache: createPredictionCache({ clock }) });
    const expected = await consultar(parseZonasParams({ tipo: 'aire', min_score: '0' }, clock));
    before = await request('GET', route, { token: state.admin.token });
    assert.deepEqual(before.zonas, JSON.parse(JSON.stringify(expected.zonas)));
    assert.equal(before.zonas.length, 2);
    assert.ok(before.zonas.every((zone) => zone.n_reportes === 1 && zone.n_reportes_previo === 1));
    zoneId = before.zonas.find((zone) => zone.centro.lat < 0).id;
    assert.deepEqual(await request('GET', route, { token: state.admin.token }), before);
  });
  await check('Piloto: filtros y normalización de categoría mantienen el contrato geográfico', async () => {
    const normalized = await request('GET', '/reportes/zonas-riesgo?tipo=%20AIRE%20&min_score=0', { token: state.admin.token });
    assert.deepEqual(normalized, before);
    const score = await request('GET', '/reportes/zonas-riesgo?tipo=aire&min_score=60', { token: state.admin.token });
    assert.equal(score.zonas.length, 1); assert.equal(score.zonas[0].id, zoneId);
    const days = await request('GET', '/reportes/zonas-riesgo?tipo=aire&dias=1&min_score=0', { token: state.admin.token });
    assert.deepEqual(days.zonas, []);
  });
  await check('Piloto: cambiar severidad invalida zonas y alertas heredadas', async () => {
    const alertRoute = '/reportes/alertas-predictivas?tipo=aire&min_score=0&nivel_min=bajo';
    const oldAlerts = await request('GET', alertRoute);
    await request('PATCH', `/reportes/${ids[0]}`, { token: state.admin.token, body: { nivel_severidad: 'bajo' } });
    const zones = await request('GET', route, { token: state.admin.token });
    const alerts = await request('GET', alertRoute);
    const score = (items) => items.find((item) => item.id === zoneId).score;
    assert.ok(score(zones.zonas) < score(before.zonas));
    assert.ok(score(alerts.alertas) < score(oldAlerts.alertas));
  });
  await check('Piloto: moderación y borrado refrescan resultados geográficos cacheados', async () => {
    const { reporte } = await request('POST', '/reportes', { token: state.citizen.token, expected: 201, body: {
      tipo_contaminacion: 'aire', nivel_severidad: 'bajo', titulo: 'Reporte piloto de invalidación',
      direccion: 'Dirección sintética', latitud: -0.011, longitud: -120.011,
    } });
    const count = async () => (await request('GET', route, { token: state.admin.token })).zonas.find((item) => item.id === zoneId).n_reportes;
    assert.equal(await count(), 1); // pendiente no alimenta zonas.
    await request('PATCH', `/reportes/${reporte.id_reporte}`, { token: state.admin.token, body: { estado: 'en_proceso' } });
    assert.equal(await count(), 2);
    await request('DELETE', `/reportes/${reporte.id_reporte}`, { token: state.admin.token });
    assert.equal(await count(), 1);
  });
  await check('Piloto: roles y errores de query en la ruta real de Express', async () => {
    await request('GET', route, { expected: 401 });
    await request('GET', route, { token: 'token-invalido', expected: 403 });
    await request('GET', route, { token: state.citizen.token, expected: 403 });
    await request('GET', route, { token: state.entity.token, expected: 403 });
    const credentials = { nombre: 'Moderador', apellido: 'Piloto', email: 'moderador-piloto@example.test', password: 'PilotoSeguro2026!' };
    const registered = await request('POST', '/auth/register', { expected: 201, body: credentials });
    await request('PATCH', `/admin/usuarios/${registered.user.id_usuario}/rol`, { token: state.admin.token, body: { rol: 'moderador' } });
    const moderator = await request('POST', '/auth/login', { body: credentials });
    assert.ok((await request('GET', route, { token: moderator.token })).zonas.length > 0);
    const invalidDays = await request('GET', '/reportes/zonas-riesgo?dias=invalido', { token: moderator.token, expected: 400 });
    assert.equal(invalidDays.message, 'El parametro debe ser un entero entre 1 y 365.');
    const invalidScore = await request('GET', '/reportes/zonas-riesgo?min_score=101', { token: moderator.token, expected: 400 });
    assert.equal(invalidScore.message, 'min_score debe ser un numero entre 0 y 100.');
    assert.deepEqual((await request('GET', '/reportes/zonas-riesgo?tipo=sin-resultados', { token: moderator.token })).zonas, []);
  });
}
