import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import { createInicioFederado } from '../../src/modules/identidad-federada/application/inicio-federado.js';
import { createMemoryTransactions, createOidcClient } from '../../src/modules/identidad-federada/adapters/outbound/oidc-client.js';
import { decidirCuenta, perfilDesdeClaims } from '../../src/modules/identidad-federada/domain/federacion.js';

const ISSUER_TEMPLATE = 'https://login.example.test/{tenantid}/v2.0';
const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = 'client-greenalert';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: attackerKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };

// Proveedor OIDC simulado: descubrimiento, JWKS y token endpoint que comprueba PKCE.
const fakeProvider = ({ claims = {}, key = privateKey, kid = 'k1' } = {}) => {
  const authRequests = new Map();
  const fetcher = async (url, init = {}) => {
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url.endsWith('/.well-known/openid-configuration')) return json({
      issuer: ISSUER_TEMPLATE, authorization_endpoint: 'https://login.example.test/authorize',
      token_endpoint: 'https://login.example.test/token', jwks_uri: 'https://login.example.test/keys' });
    if (url === 'https://login.example.test/keys') return json({ keys: [jwk] });
    if (url === 'https://login.example.test/token') {
      const form = new URLSearchParams(init.body);
      const pending = authRequests.get(form.get('code'));
      if (!pending) return json({ error: 'invalid_grant' }, 400);
      const challenge = createHash('sha256').update(form.get('code_verifier')).digest('base64url');
      if (challenge !== pending.challenge) return json({ error: 'invalid_grant' }, 400);
      const idToken = jwt.sign({ iss: ISSUER_TEMPLATE.replace('{tenantid}', TENANT), aud: CLIENT, sub: 'ms-sub-1', tid: TENANT,
        nonce: pending.nonce, email: 'ana@contoso.test', given_name: 'Ana', family_name: 'Ríos', ...claims }, key,
      { algorithm: 'RS256', keyid: kid, expiresIn: 300 });
      return json({ id_token: idToken, token_type: 'Bearer' });
    }
    return json({}, 404);
  };
  // Simula que el usuario autorizó en el proveedor: devuelve el code asociado a la URL generada.
  const authorize = (authUrl) => {
    const params = new URL(authUrl).searchParams;
    const code = `code-${authRequests.size + 1}`;
    authRequests.set(code, { nonce: params.get('nonce'), challenge: params.get('code_challenge') });
    return { code, state: params.get('state'), params };
  };
  return { fetcher, authorize };
};

const memoryAccounts = (seed = []) => {
  const users = [...seed], links = [];
  return {
    users, links,
    findLinked: async (p, s) => users.find((u) => links.some((l) => l.p === p && l.s === s && l.id === u.id_usuario)) ?? null,
    findByEmail: async (email) => users.find((u) => u.email === email) ?? null,
    link: async (p, s, id) => { links.push({ p, s, id }); },
    createFederated: async (perfil) => { const u = { id_usuario: users.length + 100, rol: 'ciudadano', activo: 1, ...perfil }; users.push(u); return u; },
    touch: async () => {},
  };
};

const setup = (providerOptions, seed) => {
  const provider = fakeProvider(providerOptions);
  const client = createOidcClient({ issuer: 'https://login.example.test/common/v2.0', clientId: CLIENT, clientSecret: 'secreto', redirectUri: 'https://localhost:8443/api/auth/microsoft/callback', fetcher: provider.fetcher });
  const cuentas = memoryAccounts(seed);
  const casos = createInicioFederado({ proveedores: new Map([['microsoft', client]]), transacciones: createMemoryTransactions(), cuentas });
  return { provider, casos, cuentas };
};

test('OIDC: la URL usa Authorization Code + PKCE S256, state y nonce aleatorios', async () => {
  const { casos } = setup();
  const { url } = await casos.iniciar('microsoft');
  const params = new URL(url).searchParams;
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.match(params.get('scope'), /openid/);
  assert.ok(params.get('state').length >= 40 && params.get('nonce').length >= 40);
  assert.equal(params.get('client_secret'), null);
});

test('OIDC: callback válido crea ciudadano; el rol no proviene del proveedor', async () => {
  const { casos, provider, cuentas } = setup({ claims: { roles: ['admin'], rol: 'admin' } });
  const { code, state } = provider.authorize((await casos.iniciar('microsoft')).url);
  const user = await casos.completar('microsoft', { code, state });
  assert.equal(user.rol, 'ciudadano');
  assert.equal(user.email, 'ana@contoso.test');
  assert.deepEqual(cuentas.links, [{ p: 'microsoft', s: 'ms-sub-1', id: user.id_usuario }]);
});

test('OIDC: el state es de un solo uso (repetir el callback falla)', async () => {
  const { casos, provider } = setup();
  const { code, state } = provider.authorize((await casos.iniciar('microsoft')).url);
  await casos.completar('microsoft', { code, state });
  await assert.rejects(casos.completar('microsoft', { code, state }), /Estado OIDC inválido/);
});

test('OIDC: firma de otra clave, audiencia ajena o nonce distinto se rechazan', async () => {
  for (const [options, message] of [
    [{ key: attackerKey }, /Firma del id_token inválida/],
    [{ claims: { aud: 'otra-app' } }, /Audiencia OIDC/],
    [{ claims: { nonce: 'repetido' } }, /nonce OIDC/],
    [{ claims: { iss: 'https://evil.test/v2.0' } }, /Emisor OIDC/],
  ]) {
    const { casos, provider } = setup(options);
    const { code, state } = provider.authorize((await casos.iniciar('microsoft')).url);
    await assert.rejects(casos.completar('microsoft', { code, state }), message);
  }
});

test('OIDC: correo existente sin email_verified no se vincula; verificado sí', async () => {
  const existente = { id_usuario: 7, email: 'ana@contoso.test', rol: 'moderador', activo: 1 };
  const a = setup({}, [existente]);
  let r = a.provider.authorize((await a.casos.iniciar('microsoft')).url);
  await assert.rejects(a.casos.completar('microsoft', r), (e) => e.statusCode === 409);
  const b = setup({ claims: { email_verified: true } }, [{ ...existente }]);
  r = b.provider.authorize((await b.casos.iniciar('microsoft')).url);
  const user = await b.casos.completar('microsoft', r);
  assert.equal(user.id_usuario, 7);
  assert.equal(user.rol, 'moderador');
});

test('OIDC: cuenta vinculada desactivada no inicia sesión', async () => {
  const { casos, provider, cuentas } = setup({}, [{ id_usuario: 9, email: 'x@contoso.test', activo: 0 }]);
  cuentas.links.push({ p: 'microsoft', s: 'ms-sub-1', id: 9 });
  const r = provider.authorize((await casos.iniciar('microsoft')).url);
  await assert.rejects(casos.completar('microsoft', r), (e) => e.statusCode === 403);
});

test('OIDC: proveedor no configurado responde 503 sin romper el inicio local', async () => {
  const casos = createInicioFederado({ proveedores: new Map(), transacciones: createMemoryTransactions(), cuentas: memoryAccounts() });
  await assert.rejects(casos.iniciar('microsoft'), (e) => e.statusCode === 503);
});

test('dominio OIDC: perfil y decisión de cuenta', () => {
  assert.equal(perfilDesdeClaims({ sub: 's', preferred_username: 'A@B.CO', name: 'Ana María Ríos' }).email, 'a@b.co');
  assert.throws(() => perfilDesdeClaims({ sub: 's' }), /correo válido/);
  assert.equal(decidirCuenta({ vinculada: null, porCorreo: null, perfil: {} }).accion, 'crear');
});

test('dominio y aplicación federados no dependen de infraestructura', async () => {
  for (const file of ['domain/federacion.js', 'application/inicio-federado.js']) {
    const source = await readFile(new URL(`../../src/modules/identidad-federada/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"](express|mysql2|jsonwebtoken|node:crypto)|process\.env|models\/|config\/database/);
  }
});
