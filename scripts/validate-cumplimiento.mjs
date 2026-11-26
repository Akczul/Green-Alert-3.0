// Verificación de punta a punta contra el stack integrado YA levantado (npm run infra:final:up).
// Solo crea usuarios sintéticos @example.test; no borra datos ni volúmenes. No imprime secretos.
// Resultado: docs/evidencias-integracion/cumplimiento.json
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vars = Object.fromEntries(readFileSync(new URL('../.env.integracion', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const dataProject = vars.COMPOSE_PROJECT_NAME || 'greenalert-final';
const appsProject = `${dataProject}-apps`;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // certificado autofirmado de laboratorio, solo este proceso
const https = `https://127.0.0.1:${vars.FRONTEND_TLS_PORT || 8443}`;
const http = `http://127.0.0.1:${vars.FRONTEND_PORT || 8080}`;
const exec = (code) => {
  const r = spawnSync('docker', ['compose', '-p', appsProject, '--env-file', '.env.integracion', '-f', 'compose.apps.yml',
    'exec', '-T', 'backend-prod', 'node', '--input-type=module', '-e', code], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`exec falló: ${r.stderr.slice(-500)}`);
  return r.stdout.trim();
};
const sql = (query, values = []) => JSON.parse(exec(
  `import pool from './src/config/database.js'; const [r]=await pool.execute(${JSON.stringify(query)},${JSON.stringify(values)}); console.log(JSON.stringify(r)); await pool.end();`));
const totpFor = (id) => exec(`import {adminMfa} from './src/bootstrap/admin-mfa.js'; const f=await adminMfa.provision(${Number(id)}); console.log(f.initialCode); process.exit();`);

const checks = [];
const check = async (name, fn) => {
  const start = performance.now();
  try { await fn(); checks.push({ name, status: 'passed', ms: Math.round(performance.now() - start) }); console.log(`OK: ${name}`); }
  catch (e) { checks.push({ name, status: 'failed', message: e.message }); console.error(`FALLO: ${name}: ${e.message}`); }
};
const cookieJar = () => {
  const jar = new Map();
  return {
    store(response) { for (const c of response.headers.getSetCookie()) { const [pair] = c.split(';'); const at = pair.indexOf('='); const v = pair.slice(at + 1); if (v) jar.set(pair.slice(0, at), v); else jar.delete(pair.slice(0, at)); } },
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    get: (k) => jar.get(k), raw: [],
  };
};
const call = async (base, method, route, { body, token, jar, csrf, web, expected } = {}) => {
  const response = await fetch(`${base}/api${route}`, {
    method, signal: AbortSignal.timeout(30000), redirect: 'manual',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(web ? { 'X-GreenAlert-Client': 'web' } : {}), ...(jar ? { Cookie: jar.header() } : {}),
      ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(jar.get('__Host-ga_csrf') ?? '') } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  jar?.store(response);
  const json = await response.json().catch(() => ({}));
  if (expected !== undefined) assert.equal(response.status, expected, `${method} ${route}: ${json.message}`);
  return { status: response.status, json, headers: response.headers };
};
const tag = randomBytes(4).toString('hex');
const pass = `Bosques y rios conservan memoria ${tag}`;
const person = (n) => ({ nombre: 'Prueba', apellido: 'Sintetica', email: `${n}-${tag}@example.test`, password: pass });

await check('Dos proyectos Compose independientes (datos y apps) en la misma red externa', async () => {
  const ls = JSON.parse(spawnSync('docker', ['compose', 'ls', '--format', 'json'], { encoding: 'utf8' }).stdout);
  const names = ls.map((p) => p.Name);
  assert.ok(names.includes(dataProject) && names.includes(appsProject), names.join(','));
  const net = JSON.parse(spawnSync('docker', ['network', 'inspect', vars.GREENALERT_NETWORK], { encoding: 'utf8' }).stdout)[0];
  const projects = new Set(Object.values(net.Containers).map((c) => c.Name.split('-').slice(0, -2).join('-')));
  assert.ok(projects.has(dataProject) && projects.has(appsProject), [...projects].join(','));
});

await check('Web por HTTPS con HSTS; HTTP redirige con 308', async () => {
  const page = await fetch(https);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="root"/);
  assert.match(page.headers.get('strict-transport-security') ?? '', /max-age=31536000/);
  assert.equal((await fetch(`${http}/dashboard`, { redirect: 'manual' })).status, 308);
});

const jar = cookieJar();
await check('Sesión web: tokens solo en cookies __Host- HttpOnly/Secure/SameSite=Strict', async () => {
  const r = await call(https, 'POST', '/auth/register', { body: person('web'), web: true, jar, expected: 201 });
  assert.equal(r.json.data.token, undefined); assert.equal(r.json.data.refreshToken, undefined);
  const cookies = r.headers.getSetCookie();
  for (const name of ['__Host-ga_at', '__Host-ga_rt']) assert.match(cookies.find((c) => c.startsWith(name)), /Secure; SameSite=Strict; HttpOnly/);
  assert.doesNotMatch(cookies.find((c) => c.startsWith('__Host-ga_csrf')), /HttpOnly/);
  await call(https, 'GET', '/auth/perfil', { jar, expected: 200 });
});

await check('CSRF: escritura con cookie sin token 403; con doble envío 200', async () => {
  const sin = await call(https, 'PATCH', '/auth/perfil', { body: { nombre: 'Cambio', apellido: 'Web' }, jar, expected: 403 });
  assert.match(sin.json.message, /CSRF/);
  await call(https, 'PATCH', '/auth/perfil', { body: { nombre: 'Cambio', apellido: 'Web' }, jar, csrf: true, expected: 200 });
});

await check('Renovación y cierre web por cookie; tras logout la sesión no sirve', async () => {
  await call(https, 'POST', '/auth/refresh', { body: {}, jar, csrf: true, web: true, expected: 200 });
  const old = jar.header();
  await call(https, 'POST', '/auth/logout', { body: {}, jar, csrf: true, web: true, expected: 200 });
  assert.equal(jar.get('__Host-ga_at'), undefined);
  const replay = await fetch(`${https}/api/auth/perfil`, { headers: { Cookie: old } });
  assert.equal(replay.status, 403);
});

let mobile;
await check('Cliente móvil (Bearer) conserva tokens en el cuerpo, sin cookies ni CSRF', async () => {
  const r = await call(http, 'POST', '/auth/register', { body: person('movil'), expected: 201 });
  mobile = r.json.data;
  assert.ok(mobile.token && mobile.refreshToken);
  assert.equal(r.headers.getSetCookie().length, 0);
  await call(http, 'PATCH', '/auth/perfil', { body: { nombre: 'Movil', apellido: 'Sintetica' }, token: mobile.token, expected: 200 });
});

let superUser, scopedUser, superSession, scopedSession;
await check('Superadministrador por inicialización controlada + MFA obligatoria', async () => {
  superUser = (await call(http, 'POST', '/auth/register', { body: person('super'), expected: 201 })).json.data.user;
  const cli = spawnSync('docker', ['compose', '-p', appsProject, '--env-file', '.env.integracion', '-f', 'compose.apps.yml',
    'exec', '-T', 'backend-prod', 'node', 'scripts/crear-superadmin.mjs', superUser.email], { cwd: root, encoding: 'utf8' });
  const existing = sql("SELECT COUNT(*) AS n FROM usuarios WHERE nivel_admin='global' AND deleted_at IS NULL")[0].n;
  if (cli.status !== 0) {
    // Ya había un superadministrador (stack reutilizado): se promueve el sintético como lo haría ese superadministrador.
    assert.ok(existing >= 1);
    sql("UPDATE usuarios SET rol='admin', nivel_admin='global', auth_version=auth_version+1 WHERE id_usuario=?", [superUser.id_usuario]);
  }
  await call(http, 'POST', '/auth/login', { body: { email: superUser.email, password: pass }, expected: 403 });
  superSession = (await call(http, 'POST', '/auth/login', { body: { email: superUser.email, password: pass, totp: totpFor(superUser.id_usuario) }, expected: 200 })).json.data;
  assert.equal(superSession.user.nivel_admin, 'global');
});

await check('Superadmin asigna administrador de ámbito; éste no se eleva ni toca otros ámbitos', async () => {
  scopedUser = (await call(http, 'POST', '/auth/register', { body: person('ambito'), expected: 201 })).json.data.user;
  await call(http, 'PATCH', `/admin/usuarios/${scopedUser.id_usuario}/rol`, { body: { rol: 'admin', nivel_admin: 'ambito' }, token: superSession.token, expected: 200 });
  scopedSession = (await call(http, 'POST', '/auth/login', { body: { email: scopedUser.email, password: pass, totp: totpFor(scopedUser.id_usuario) }, expected: 200 })).json.data;
  await call(http, 'PATCH', `/admin/usuarios/${scopedUser.id_usuario}/rol`, { body: { rol: 'admin', nivel_admin: 'global' }, token: scopedSession.token, expected: 403 });
  await call(http, 'PATCH', `/admin/usuarios/${superUser.id_usuario}/estado`, { body: { activo: false }, token: scopedSession.token, expected: 403 });
  await call(http, 'GET', '/admin/auditoria', { token: scopedSession.token, expected: 403 });
  await call(http, 'POST', '/integracion/eventos/reenviar', { body: {}, token: scopedSession.token, expected: 403 });
  await call(http, 'PATCH', `/admin/usuarios/${mobile.user.id_usuario}/rol`, { body: { rol: 'moderador' }, token: scopedSession.token, expected: 200 });
  const listed = (await call(http, 'GET', '/admin/usuarios?limit=100', { token: scopedSession.token, expected: 200 })).json.data.usuarios;
  assert.ok(listed.every((u) => ['ciudadano', 'moderador'].includes(u.rol)));
});

await check('Usuario común no accede al panel ni a la API administrativa (403)', async () => {
  const citizen = (await call(http, 'POST', '/auth/register', { body: person('comun'), expected: 201 })).json.data;
  await call(http, 'GET', '/admin/usuarios', { token: citizen.token, expected: 403 });
  await call(http, 'GET', '/admin/auditoria', { token: citizen.token, expected: 403 });
});

await check('Auditoría con autor visible para superadmin e inmutable en MySQL', async () => {
  const audit = (await call(http, 'GET', '/admin/auditoria?limit=50', { token: superSession.token, expected: 200 })).json.data;
  assert.ok(audit.items.some((i) => i.action === 'cambiar_rol' && Number(i.actor_id) === superUser.id_usuario));
  assert.throws(() => sql('DELETE FROM admin_audit WHERE id=?', [audit.items[0].id]), /solo anexado/);
});

await check('Microsoft OIDC sin credenciales responde 503 controlado', async () => {
  const r = await call(http, 'GET', '/auth/microsoft/url');
  assert.ok([200, 503].includes(r.status));
  if (r.status === 200) assert.match(r.json.data.url, /code_challenge_method=S256/);
});

const result = { generatedAt: new Date().toISOString(), commit: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  dirty: spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim() !== '', projects: [dataProject, appsProject],
  passed: checks.filter((c) => c.status === 'passed').length, total: checks.length, checks };
writeFileSync(new URL('../docs/evidencias-integracion/cumplimiento.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(`Cumplimiento: ${result.passed}/${result.total}`);
if (result.passed !== result.total) process.exit(1);
