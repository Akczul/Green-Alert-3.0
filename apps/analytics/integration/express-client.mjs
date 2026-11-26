// Adaptador opt-in para el principal; no registra rutas ni cambia autenticación.
// Node 24: fetch nativo; el composition root entrega URL, secreto y ámbito confiable.
export class AnalyticsError extends Error {
  constructor(message, { status = 502, code = 'ANALYTICS_UNAVAILABLE' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createAnalyticsClient({ baseUrl, token, timeoutMs = 35000, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new TypeError('URL interna inválida');
  }
  if (!token || token.length < 32 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Credencial o timeout inválido');
  }
  async function request(method, path, { scope, body, signal } = {}) {
    if (!/^[A-Za-z0-9:_-]{1,100}$/.test(scope ?? '')) throw new TypeError('Ámbito confiable requerido');
    try {
      const response = await fetchImpl(new URL(path, base), {
        method,
        headers: { Authorization: `Bearer ${token}`, 'X-Analytics-Scope': scope, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      const payload = await response.json();
      if (!response.ok) throw new AnalyticsError(payload.message || 'Error de analítica', { status: response.status, code: payload.code });
      if (payload.status !== 'success' || !payload.data) throw new AnalyticsError('Respuesta analítica inválida');
      return payload.data;
    } catch (error) {
      if (error instanceof AnalyticsError) throw error;
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new AnalyticsError('Tiempo de espera analítica agotado', { status: 504, code: 'ANALYTICS_TIMEOUT' });
      }
      throw new AnalyticsError('Servicio analítico no disponible');
    }
  }
  const uuid = (id) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new TypeError('UUID inválido');
    return id;
  };
  return {
    analyzeRisk: (body, context) => request('POST', '/internal/v1/risk-runs', { ...context, body }),
    trainModel: (body, context) => request('POST', '/internal/v1/training-runs', { ...context, body }),
    forecast: (body, context) => request('POST', '/internal/v1/forecast-runs', { ...context, body }),
    getRun: (id, context) => request('GET', `/internal/v1/runs/${uuid(id)}`, context),
  };
}
