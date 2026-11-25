import { consultarZonasRiesgo as calcularZonasRiesgo, prediccionCache } from '../bootstrap/zonas-riesgo.js';
import { parseZonasParams } from '../modules/zonas-riesgo/adapters/inbound/zonas-params.js';
export { calcularZonasRiesgo, parseZonasParams };
export { DEFAULT_CELDA_GRADOS } from '../modules/zonas-riesgo/domain/zonas-riesgo.js';
export { PREDICCION_CACHE_TTL_MS } from '../modules/zonas-riesgo/adapters/outbound/prediction-cache.js';

// Alertas permanece heredado. Reutiliza el piloto y la misma caché/invalidation.
const NIVEL_RANK = { bajo: 1, medio: 2, alto: 3, critico: 4 };
const cacheKey = (name, params) => `${name}:${JSON.stringify(params)}`;
const getCached = prediccionCache.get;
const setCached = prediccionCache.set;
export const invalidatePrediccionCache = () => prediccionCache.clear();
export const getPrediccionCacheSize = () => prediccionCache.size();

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const validationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const clampInt = (value, { fallback, min, max }) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw validationError(`El parametro debe ser un entero entre ${min} y ${max}.`);
  }
  return Math.max(min, Math.min(max, parsed));
};

export const parseAlertasParams = (query = {}) => {
  const zonasParams = parseZonasParams(query);
  const limite = clampInt(query.limite, { fallback: 10, min: 1, max: 50 });
  const nivel_min = query.nivel_min === undefined || query.nivel_min === ''
    ? 'medio'
    : String(query.nivel_min).toLowerCase();
  if (!NIVEL_RANK[nivel_min]) {
    throw validationError('nivel_min debe ser uno de: bajo, medio, alto, critico.');
  }
  const lat = toNumber(query.lat);
  const lng = toNumber(query.lng);
  const radio_km = toNumber(query.radio_km);

  if (query.lat !== undefined && (lat === null || lat < -90 || lat > 90)) {
    throw validationError('lat debe ser un numero entre -90 y 90.');
  }
  if (query.lng !== undefined && (lng === null || lng < -180 || lng > 180)) {
    throw validationError('lng debe ser un numero entre -180 y 180.');
  }
  if (query.radio_km !== undefined && (radio_km === null || radio_km <= 0 || radio_km > 500)) {
    throw validationError('radio_km debe ser un numero mayor a 0 y menor o igual a 500.');
  }
  const hasLat = query.lat !== undefined && query.lat !== null && query.lat !== '';
  const hasLng = query.lng !== undefined && query.lng !== null && query.lng !== '';
  if (hasLat !== hasLng) {
    throw validationError('lat y lng deben enviarse juntos.');
  }
  if (query.radio_km !== undefined && (!hasLat || !hasLng)) {
    throw validationError('radio_km requiere lat y lng.');
  }

  return {
    ...zonasParams,
    limite,
    nivel_min,
    lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    lng: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
    radio_km: radio_km !== null && radio_km > 0 ? Math.min(radio_km, 500) : null,
  };
};

const distanceKm = (a, b) => {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
};

export const calcularAlertasPredictivas = async (params) => {
  const key = cacheKey('alertas', {
    dias: params.dias,
    tipo: params.tipo,
    min_score: params.min_score,
    limite: params.limite,
    nivel_min: params.nivel_min,
    lat: params.lat,
    lng: params.lng,
    radio_km: params.radio_km,
  });
  const revision = await prediccionCache.getRevision?.();
  const cached = await getCached(key, revision);
  if (cached) return cached;

  const zonasPayload = await calcularZonasRiesgo({ ...params, min_score: params.min_score ?? 0 });
  const minRank = NIVEL_RANK[params.nivel_min] || NIVEL_RANK.medio;
  const origin = params.lat !== null && params.lng !== null ? { lat: params.lat, lng: params.lng } : null;

  const alertas = zonasPayload.zonas
    .filter((zona) => (NIVEL_RANK[zona.nivel] || 1) >= minRank)
    .filter((zona) => !params.tipo || zona.tipo_dominante === params.tipo)
    .map((zona) => ({
      id: zona.id,
      zona_id: zona.zona_id,
      centro: zona.centro,
      tipo_dominante: zona.tipo_dominante,
      subcategoria_dominante: zona.subcategoria_dominante,
      municipio: zona.municipio,
      departamento: zona.departamento,
      n_reportes: zona.n_reportes,
      n_reportes_previo: zona.n_reportes_previo,
      tendencia: zona.tendencia,
      score: zona.score,
      nivel: zona.nivel,
      ultimo_reporte: zona.ultimo_reporte,
      distancia_km: origin ? Number(distanceKm(origin, zona.centro).toFixed(2)) : null,
    }))
    .filter((alerta) => !origin || !params.radio_km || alerta.distancia_km <= params.radio_km)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limite);

  const payload = {
    generado_en: new Date().toISOString(),
    alertas,
  };

  return setCached(key, payload, revision);
};
