import { buildZonas, DEFAULT_CELDA_GRADOS } from '../domain/zonas-riesgo.js';

/**
 * @param {{reporteReader: import('./ports.js').ReporteAnaliticaReader,
 * clock: import('./ports.js').Clock, cache: import('./ports.js').PredictionCache}} dependencies
 * @returns {import('./ports.js').ConsultarZonasRiesgo}
 */
export const createConsultarZonasRiesgo = ({ reporteReader, clock, cache }) => async (params) => {
  // Mantener orden y contenido: desde no formaba parte de la clave pública.
  const key = `zonas:${JSON.stringify({ dias: params.dias, tipo: params.tipo, min_score: params.min_score })}`;
  const revision = await cache.getRevision?.();
  const cached = await cache.get(key, revision);
  if (cached) return cached;

  const desdeDoble = new Date(params.desde);
  desdeDoble.setDate(desdeDoble.getDate() - params.dias);
  const reportes = await reporteReader.findParaPrediccion({ desde: desdeDoble, tipo: params.tipo });
  const payload = {
    actualizado_en: new Date(clock.now()).toISOString(),
    celda_grados: DEFAULT_CELDA_GRADOS,
    zonas: buildZonas(reportes, { min_score: params.min_score, cutoffDate: params.desde, now: () => clock.now() }),
  };
  return cache.set(key, payload, revision);
};
