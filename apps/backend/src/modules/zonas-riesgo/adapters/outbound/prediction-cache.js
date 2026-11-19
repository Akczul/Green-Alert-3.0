export const PREDICCION_CACHE_TTL_MS = 5 * 60 * 1000;

/** @returns {import('../../application/ports.js').PredictionCache} */
export const createPredictionCache = ({ clock, ttlMs = PREDICCION_CACHE_TTL_MS }) => {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= clock.now()) { entries.delete(key); return null; }
      return entry.value;
    },
    set(key, value) { entries.set(key, { value, expiresAt: clock.now() + ttlMs }); return value; },
    clear() { entries.clear(); },
    size() { return entries.size; },
  };
};
