import test from 'node:test';
import assert from 'node:assert/strict';
import { COOKIE, createWebSession, parseCookies } from '../../src/modules/identidad/adapters/inbound/web-session.js';

const jwt = (exp) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
const NOW = Date.parse('2026-11-25T12:00:00Z');

// Como Express: originalUrl conserva la ruta completa; path se reescribe dentro del router montado.
const fakeReq = ({ method = 'GET', path = '/api/reportes', headers = {}, body } = {}) => {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, originalUrl: `${path}?x=1`, path: `/${path.split('/').pop()}`, headers: lower, body, get: (name) => lower[name.toLowerCase()] };
};
const fakeRes = () => {
  const res = { statusCode: 200, cookies: [], body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.append = (name, value) => { if (name === 'Set-Cookie') res.cookies.push(value); return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};
const run = (session, req, res) => new Promise((resolve) => {
  let called = false;
  const done = session.middleware(req, res, () => { called = true; resolve(called); });
  if (done) resolve(called);
});

test('web: el login mueve tokens del cuerpo a cookies __Host- HttpOnly, Secure y SameSite=Strict', async () => {
  const session = createWebSession({ now: () => NOW });
  const req = fakeReq({ method: 'POST', path: '/api/auth/login', headers: { 'X-GreenAlert-Client': 'web' }, body: {} });
  const res = fakeRes();
  assert.equal(await run(session, req, res), true);
  res.json({ status: 'success', message: 'ok', data: { token: jwt(NOW / 1000 + 900), accessToken: jwt(NOW / 1000 + 900), refreshToken: 'r'.repeat(64), refreshTokenExpiresAt: new Date(NOW + 86400000).toISOString(), user: { rol: 'ciudadano' } } });
  assert.equal(res.body.data.token, undefined);
  assert.equal(res.body.data.refreshToken, undefined);
  assert.equal(res.body.data.session, 'cookie');
  assert.equal(res.body.data.user.rol, 'ciudadano');
  const access = res.cookies.find((c) => c.startsWith(`${COOKIE.access}=`));
  const refresh = res.cookies.find((c) => c.startsWith(`${COOKIE.refresh}=`));
  const csrf = res.cookies.find((c) => c.startsWith(`${COOKIE.csrf}=`));
  for (const cookie of [access, refresh]) assert.match(cookie, /Path=\/; Secure; SameSite=Strict; HttpOnly; Max-Age=\d+/);
  assert.match(access, /Max-Age=900/);
  assert.match(refresh, /Max-Age=86400/);
  assert.doesNotMatch(csrf, /HttpOnly/);
  assert.match(csrf, /Secure; SameSite=Strict/);
});

test('móvil/Bearer: sin cabecera web el contrato de tokens en el cuerpo no cambia', async () => {
  const session = createWebSession({ now: () => NOW });
  const res = fakeRes();
  await run(session, fakeReq({ method: 'POST', path: '/api/auth/login', body: {} }), res);
  const data = { token: jwt(1), refreshToken: 'r', user: {} };
  res.json({ status: 'success', data });
  assert.equal(res.body.data, data);
  assert.equal(res.cookies.length, 0);
});

test('cookie de acceso autentica lecturas sin exponer el token a JavaScript', async () => {
  const session = createWebSession();
  const req = fakeReq({ headers: { cookie: `${COOKIE.access}=abc.def.ghi` } });
  assert.equal(await run(session, req, fakeRes()), true);
  assert.equal(req.headers.authorization, 'Bearer abc.def.ghi');
});

test('CSRF: escritura con cookie sin cabecera o con cabecera distinta se rechaza con 403', async () => {
  const session = createWebSession();
  for (const headers of [{}, { 'X-CSRF-Token': 'otro' }]) {
    const res = fakeRes();
    const req = fakeReq({ method: 'POST', path: '/api/reportes', headers: { cookie: `${COOKIE.access}=a; ${COOKIE.csrf}=secreto`, ...headers } });
    assert.equal(await run(session, req, res), false);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /CSRF/);
  }
});

test('CSRF: doble envío correcto permite la escritura; Bearer explícito no requiere CSRF', async () => {
  const session = createWebSession();
  const ok = fakeReq({ method: 'PATCH', path: '/api/auth/perfil', headers: { cookie: `${COOKIE.access}=a; ${COOKIE.csrf}=secreto`, 'X-CSRF-Token': 'secreto' } });
  assert.equal(await run(session, ok, fakeRes()), true);
  const mobile = fakeReq({ method: 'POST', path: '/api/reportes', headers: { authorization: 'Bearer m' } });
  assert.equal(await run(session, mobile, fakeRes()), true);
  assert.equal(mobile.headers.authorization, 'Bearer m');
});

test('renovación y cierre toman el refresh de la cookie y el cierre web borra las cookies', async () => {
  const session = createWebSession();
  const body = {};
  const req = fakeReq({ method: 'POST', path: '/api/auth/logout', body,
    headers: { cookie: `${COOKIE.refresh}=rt; ${COOKIE.csrf}=c`, 'X-CSRF-Token': 'c', 'X-GreenAlert-Client': 'web' } });
  const res = fakeRes();
  assert.equal(await run(session, req, res), true);
  assert.equal(body.refreshToken, 'rt');
  res.json({ status: 'success', message: 'ok' });
  assert.equal(res.cookies.length, 3);
  assert.ok(res.cookies.every((c) => /Max-Age=0/.test(c)));
});

test('parseCookies tolera valores mal codificados', () => {
  assert.deepEqual(parseCookies('a=1; b=%E0%A4%A; c'), { a: '1', b: '', c: '' });
});
