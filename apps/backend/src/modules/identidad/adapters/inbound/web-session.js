import { randomBytes, timingSafeEqual } from 'node:crypto';

// Sesión web por cookies (OWASP Session Management): el navegador nunca recibe tokens legibles por JS.
//  - __Host-ga_at   JWT de acceso breve      HttpOnly; Secure; SameSite=Strict; Path=/
//  - __Host-ga_rt   refresh rotativo opaco   HttpOnly; Secure; SameSite=Strict; Path=/
//  - __Host-ga_csrf token anti-CSRF          Secure; SameSite=Strict; Path=/ (legible para doble envío)
// Solo se activa cuando el cliente envía `X-GreenAlert-Client: web`. La app móvil conserva el contrato
// de tokens en el cuerpo y los guarda en SecureStore; los clientes Bearer no usan cookies ni CSRF.
export const COOKIE = Object.freeze({ access: '__Host-ga_at', refresh: '__Host-ga_rt', csrf: '__Host-ga_csrf' });
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export const parseCookies = (header = '') => Object.fromEntries(String(header).split(';')
  .map((part) => part.trim()).filter(Boolean)
  .map((part) => {
    const at = part.indexOf('=');
    if (at < 1) return [part, ''];
    try { return [part.slice(0, at), decodeURIComponent(part.slice(at + 1))]; } catch { return [part.slice(0, at), '']; }
  }));

const serialize = (name, value, { maxAge, httpOnly = true }) => [
  `${name}=${encodeURIComponent(value)}`, 'Path=/', 'Secure', 'SameSite=Strict',
  ...(httpOnly ? ['HttpOnly'] : []), `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
].join('; ');

const sameToken = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const jwtExp = (token) => {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).exp ?? null; } catch { return null; }
};

export const createWebSession = ({ now = Date.now, accessSeconds = 900, refreshSeconds = 7 * 86400 } = {}) => {
  const isWeb = (req) => String(req.get?.('x-greenalert-client') ?? req.headers?.['x-greenalert-client'] ?? '').toLowerCase() === 'web';

  const issue = (res, data) => {
    const access = data.accessToken || data.token;
    const exp = jwtExp(access);
    const accessAge = exp ? exp - Math.floor(now() / 1000) : accessSeconds;
    const refreshAge = data.refreshTokenExpiresAt
      ? (new Date(data.refreshTokenExpiresAt).getTime() - now()) / 1000 : refreshSeconds;
    const csrf = randomBytes(32).toString('base64url');
    res.append('Set-Cookie', serialize(COOKIE.access, access, { maxAge: accessAge }));
    res.append('Set-Cookie', serialize(COOKIE.refresh, data.refreshToken, { maxAge: refreshAge }));
    res.append('Set-Cookie', serialize(COOKIE.csrf, csrf, { maxAge: refreshAge, httpOnly: false }));
    // El cuerpo conserva el usuario y la expiración (no secreta) para la renovación proactiva.
    const { token: _t, accessToken: _a, refreshToken: _r, ...rest } = data;
    return { ...rest, session: 'cookie', accessTokenExpiresAt: exp ? new Date(exp * 1000).toISOString() : null };
  };

  const clear = (res) => {
    for (const name of Object.values(COOKIE)) {
      res.append('Set-Cookie', serialize(name, '', { maxAge: 0, httpOnly: name !== COOKIE.csrf }));
    }
  };

  const middleware = (req, res, next) => {
    // Ruta original: dentro de un router montado Express reescribe req.path ('/logout').
    const route = String(req.originalUrl ?? req.url ?? req.path ?? '').split('?')[0];
    const isRefresh = /\/auth\/refresh$/.test(route), isLogout = /\/auth\/logout$/.test(route);
    const cookies = parseCookies(req.headers.cookie);
    const hasSession = Boolean(cookies[COOKIE.access] || cookies[COOKIE.refresh]);
    const bearer = typeof req.headers.authorization === 'string' && req.headers.authorization.trim() !== '';

    // CSRF de doble envío: toda escritura autenticada por cookie exige la cabecera igual a la cookie.
    if (hasSession && !bearer && !SAFE.has(req.method)) {
      if (!sameToken(req.get('x-csrf-token'), cookies[COOKIE.csrf])) {
        return res.status(403).json({ status: 'error', message: 'Solicitud rechazada: token CSRF inválido o ausente.' });
      }
    }
    if (!bearer && cookies[COOKIE.access]) {
      req.headers.authorization = `Bearer ${cookies[COOKIE.access]}`;
      req.sessionTransport = 'cookie';
    }
    // Renovación y cierre leen el refresh desde la cookie cuando el cuerpo no lo trae.
    if (cookies[COOKIE.refresh] && req.body && typeof req.body === 'object' && !req.body.refreshToken &&
        (isRefresh || isLogout)) {
      req.body.refreshToken = cookies[COOKIE.refresh];
    }

    if (!isWeb(req)) return next();
    // Respuestas de autenticación: mover tokens del cuerpo a cookies antes de enviarlas.
    const json = res.json.bind(res);
    res.json = (payload) => {
      const data = payload?.data;
      if (res.statusCode < 400 && data && typeof data === 'object' && (data.accessToken || data.token) && data.refreshToken) {
        return json({ ...payload, data: issue(res, data) });
      }
      if (isLogout && res.statusCode < 400) clear(res);
      if (isRefresh && [400, 401, 403].includes(res.statusCode)) clear(res);
      return json(payload);
    };
    return next();
  };

  return { middleware, issue, clear, isWeb };
};
