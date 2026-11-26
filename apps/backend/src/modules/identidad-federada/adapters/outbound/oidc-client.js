import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { FederacionRechazada, validarClaims } from '../../domain/federacion.js';

// Cliente OpenID Connect genérico: descubrimiento, Authorization Code + PKCE (S256) y verificación del
// id_token con las claves JWKS publicadas por el proveedor. Sirve para Microsoft Entra ID y otros.
const b64url = (buffer) => Buffer.from(buffer).toString('base64url');
export const pkcePair = () => {
  const codeVerifier = b64url(randomBytes(48));
  return { codeVerifier, codeChallenge: b64url(createHash('sha256').update(codeVerifier).digest()) };
};

export const createOidcClient = ({
  issuer, clientId, clientSecret, redirectUri, scopes = 'openid email profile',
  fetcher = fetch, now = Date.now, timeoutMs = 10000,
  // Entra ID multi-inquilino publica issuer con {tenantid}; se resuelve con el claim tid.
  resolveIssuer = (template, claims) => template.replace('{tenantid}', claims?.tid ?? '{tenantid}'),
}) => {
  if (!issuer || !clientId || !clientSecret || !redirectUri) throw new Error('Configuración OIDC incompleta.');
  let discovery = null, jwks = null, jwksAt = 0;
  const getJson = async (url, init) => {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new FederacionRechazada(`El proveedor OIDC respondió ${response.status}.`, 502);
    return response.json();
  };
  const config = async () => {
    discovery ??= await getJson(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
    return discovery;
  };
  const keyFor = async (kid) => {
    const { jwks_uri: uri } = await config();
    const fresh = () => now() - jwksAt < 3600000;
    if (!jwks || !fresh() || !jwks.keys?.some((k) => k.kid === kid)) {
      jwks = await getJson(uri); jwksAt = now();
    }
    const jwk = jwks.keys?.find((k) => k.kid === kid && (!k.use || k.use === 'sig'));
    if (!jwk) throw new FederacionRechazada('Clave de firma OIDC desconocida.');
    return createPublicKey({ key: jwk, format: 'jwk' });
  };

  return {
    async authorizationUrl({ state, nonce, codeChallenge }) {
      const url = new URL((await config()).authorization_endpoint);
      url.search = new URLSearchParams({
        client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: scopes,
        state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256', response_mode: 'query',
      }).toString();
      return url.toString();
    },
    async exchangeCode({ code, codeVerifier }) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri,
        client_id: clientId, client_secret: clientSecret, code_verifier: codeVerifier,
      });
      const tokens = await getJson((await config()).token_endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      });
      if (typeof tokens.id_token !== 'string') throw new FederacionRechazada('El proveedor no devolvió id_token.', 502);
      return { idToken: tokens.id_token };
    },
    async verifyIdToken(idToken, nonce) {
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded?.header?.kid || decoded.header.alg !== 'RS256') throw new FederacionRechazada('id_token con algoritmo no admitido.');
      const key = await keyFor(decoded.header.kid);
      let claims;
      try { claims = jwt.verify(idToken, key, { algorithms: ['RS256'], clockTolerance: 120, clockTimestamp: Math.floor(now() / 1000) }); }
      catch { throw new FederacionRechazada('Firma del id_token inválida.'); }
      const expectedIssuer = resolveIssuer((await config()).issuer, claims);
      return validarClaims(claims, { issuer: expectedIssuer, audience: clientId, nonce, nowSeconds: Math.floor(now() / 1000) });
    },
  };
};

// Transacciones de autorización (state → nonce + verifier) en memoria con TTL y un solo uso.
export const createMemoryTransactions = ({ ttlMs = 10 * 60 * 1000, now = Date.now } = {}) => {
  const store = new Map();
  const purge = () => { for (const [k, v] of store) if (v.expiresAt <= now()) store.delete(k); };
  return {
    async crear(provider) {
      purge();
      const state = b64url(randomBytes(32)), nonce = b64url(randomBytes(32));
      const { codeVerifier, codeChallenge } = pkcePair();
      store.set(state, { provider, nonce, codeVerifier, expiresAt: now() + ttlMs });
      return { state, nonce, codeChallenge };
    },
    async consumir(provider, state) {
      const entry = store.get(state);
      store.delete(state);
      if (!entry || entry.provider !== provider || entry.expiresAt <= now()) return null;
      return { nonce: entry.nonce, codeVerifier: entry.codeVerifier };
    },
  };
};
