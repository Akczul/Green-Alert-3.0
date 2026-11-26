import { createClient } from 'redis';
import { createHash } from 'node:crypto';

// MySQL conserva la generación: una caída de Redis no resucita entradas invalidadas.
// Las claves solo contienen agregados de reportes validados, nunca datos de usuarios.
export function createRedisCache({ url, pool, ttlSeconds = 300, prefix = 'greenalert:zonas:public:v1', client }) {
  const redis = client ?? createClient({ url, disableOfflineQueue: true,
    socket: { connectTimeout: 500, reconnectStrategy: retries => Math.min(100 * (retries + 1), 2000) } });
  const metrics = { hits: 0, misses: 0, errors: 0, operations: 0, latencyMs: 0, invalidations: 0 };
  redis.on('error', () => { metrics.errors++; });
  if (!client) void redis.connect().catch(() => { metrics.errors++; });
  const key = (name, revision) => `${prefix}:${revision}:${createHash('sha256').update(name).digest('hex')}`;
  async function operation(fn, fallback) {
    const start = performance.now();
    try {
      if (!redis.isReady) return fallback;
      return await Promise.race([fn(), new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Tiempo de caché agotado')), 600);
        timer.unref?.();
      })]);
    } catch { metrics.errors++; return fallback; }
    finally { metrics.operations++; metrics.latencyMs += performance.now() - start; }
  }
  return {
    async getRevision() {
      const [rows] = await pool.execute('SELECT revision FROM cache_generation WHERE id = 1');
      return String(rows[0].revision);
    },
    async get(name, revision) {
      const raw = await operation(() => redis.get(key(name, revision)), null);
      if (raw) {
        try { const value = JSON.parse(raw); metrics.hits++; return value; }
        catch { metrics.errors++; }
      }
      metrics.misses++; return null;
    },
    async set(name, value, revision) {
      await operation(() => redis.set(key(name, revision), JSON.stringify(value), { EX: ttlSeconds }), null);
      return value;
    },
    // Los triggers invalidan incluso cambios realizados por consumidores heredados.
    clear() { metrics.invalidations++; },
    size() { return 0; },
    metrics() { return { ...metrics, ready: redis.isReady, ttlSeconds,
      averageLatencyMs: metrics.operations ? metrics.latencyMs / metrics.operations : 0 }; },
    async close() { if (redis.isOpen) redis.destroy(); },
  };
}
