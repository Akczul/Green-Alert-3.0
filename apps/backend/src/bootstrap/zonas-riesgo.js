import pool from '../config/database.js';
import { createConsultarZonasRiesgo } from '../modules/zonas-riesgo/application/consultar-zonas-riesgo.js';
import { createMysqlReporteReader } from '../modules/zonas-riesgo/adapters/outbound/mysql-reporte-reader.js';
import { createPredictionCache } from '../modules/zonas-riesgo/adapters/outbound/prediction-cache.js';
import { createGetZonasRiesgo } from '../modules/zonas-riesgo/adapters/inbound/express-controller.js';

// Único ensamblaje productivo del piloto. El pool ya existente sigue siendo
// propiedad del arranque de la aplicación; el adaptador no abre otro pool.
export const systemClock = { now: () => Date.now() };
export const prediccionCache = createPredictionCache({ clock: systemClock });
export const consultarZonasRiesgo = createConsultarZonasRiesgo({
  reporteReader: createMysqlReporteReader({ pool }), clock: systemClock, cache: prediccionCache,
});
export const getZonasRiesgo = createGetZonasRiesgo({ consultarZonasRiesgo, clock: systemClock });
