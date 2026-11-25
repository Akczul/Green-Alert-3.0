// Los secretos viven exclusivamente en el composition root del backend.
export function createInternalClient({ baseUrl, token, timeoutMs = 35000, scopeHeader = false, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || !token || token.length < 32) {
    throw new Error('Configuración interna inválida');
  }
  async function request(path, { body, scope, correlationId, credential = token, timeout = timeoutMs } = {}) {
    try {
      const response = await fetchImpl(new URL(path, base), {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${credential}`,
          ...(scopeHeader ? { 'X-Analytics-Scope': scope } : {}),
          ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') throw new Error('Respuesta interna rechazada');
      return result.data;
    } catch (cause) {
      throw Object.assign(new Error('Servicio interno temporalmente no disponible.'), {
        statusCode: ['TimeoutError', 'AbortError'].includes(cause.name) ? 504 : 503 });
    }
  }
  return { request };
}
