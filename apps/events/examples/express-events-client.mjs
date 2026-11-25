import { randomUUID } from 'node:crypto';

// Referencia para el futuro adaptador del principal. El llamador autoriza usuario/objeto/ámbito.
// No registra una outbox ni cambia las transacciones MySQL de GreenAlert.
export function createEventsClient({ baseUrl, serviceToken, timeoutMs = 10000, attempts = 3 }) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || !serviceToken || attempts < 1 || attempts > 3) {
    throw new Error('Configuración de Events inválida');
  }

  async function request(path, { body, correlationId = randomUUID(), budget = timeoutMs } = {}) {
    // Se serializa una vez: cada reintento conserva exactamente los mismos eventId y contenido.
    const payload = body === undefined ? undefined : JSON.stringify(body);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let response;
      try {
        response = await fetch(new URL(path, base), {
          method: payload === undefined ? 'GET' : 'POST',
          headers: {
            Authorization: `Bearer ${serviceToken}`,
            'X-Correlation-ID': correlationId,
            ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: payload,
          signal: AbortSignal.timeout(budget),
          redirect: 'error',
        });
      } catch (error) {
        if (attempt + 1 === attempts) {
          throw new Error('Events no disponible; conservar entrega pendiente e IDs originales', { cause: error });
        }
      }
      if (response?.ok) return response.json();
      if (response && ![429, 503].includes(response.status)) {
        const error = new Error(`Events HTTP ${response.status}; revisar contrato o credencial`);
        error.status = response.status;
        await response.body?.cancel();
        throw error;
      }
      const retryAfter = Number(response?.headers.get('Retry-After') || 0);
      await response?.body?.cancel();
      if (attempt + 1 === attempts) throw new Error('Entrega Events pendiente; resultado parcial posible');
      const delay = Math.max(200 * 2 ** attempt + Math.random() * 200, Math.min(retryAfter * 1000, 30000));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    publish: (event, correlationId) => request('/api/v1/events', { body: event, correlationId }),
    publishBatch: (events, correlationId) => request('/api/v1/events/batches', {
      body: { events }, correlationId, budget: Math.max(timeoutMs, 35000),
    }),
    history: (reportId, { from, to, limit = 100 }, correlationId) => request(
      `/api/v1/reports/${encodeURIComponent(reportId)}/events?${new URLSearchParams({ from, to, limit })}`,
      { correlationId },
    ),
    indicators: (filters, correlationId) => request(
      `/api/v1/indicators?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value != null))}`,
      { correlationId },
    ),
  };
}
