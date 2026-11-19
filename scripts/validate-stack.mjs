import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { freePort } from './mysql-sandbox.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.local/mysql-validation');
await mkdir(output, { recursive: true });
const project = `ga-stack-${randomBytes(6).toString('hex')}`;
const frontendPort = await freePort();
const env = { ...process.env,
  MYSQL_DATABASE: 'greenalert_stack_validation', MYSQL_USER: 'greenalert_validation',
  MYSQL_PASSWORD: randomBytes(24).toString('hex'), MYSQL_ROOT_PASSWORD: randomBytes(24).toString('hex'),
  GREENALERT_STACK_JWT: randomBytes(32).toString('hex'),
  MYSQL_PORT: String(await freePort()), FRONTEND_PORT: String(frontendPort),
  GREENALERT_BACKEND_TEST_PORT: String(await freePort()),
  VITE_GOOGLE_CLIENT_ID: '', VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '',
};
let log = '';
const checks = [];
async function docker(args) {
  const child = spawn('docker', ['compose', '--project-name', project, '--file', path.join(root, 'docker-compose.yml'), '--file', path.join(root, 'infra/compose.stack-validation.yml'), ...args], { env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { out += chunk; });
  const [code] = await once(child, 'exit');
  log += out;
  if (code !== 0) throw new Error(`Docker Compose (${code}): ${out.slice(-2500)}`);
  return out;
}
async function check(name, fn) { await fn(); checks.push({ name, status: 'passed' }); console.log(`OK: ${name}`); }
try {
  await docker(['config', '--quiet']);
  console.log('Construyendo e iniciando MySQL + Express + React/Nginx en un proyecto Docker aislado...');
  await docker(['up', '--build', '-d', '--wait', '--wait-timeout', '180']);
  checks.push({ name: 'Tres servicios del Compose real alcanzan healthy/running', status: 'passed' });
  const origin = `http://127.0.0.1:${frontendPort}`;
  const api = async (method, route, body, token, expected = 200) => {
    const response = await fetch(`${origin}/api${route}`, { method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    assert.equal(response.status, expected, `${route}: HTTP ${response.status}; ${json.message || ''}`);
    return json.data ?? json;
  };
  await check('SPA compilada y fallback React Router servidos por Nginx', async () => {
    for (const route of ['/', '/reports/123']) {
      const response = await fetch(`${origin}${route}`);
      assert.equal(response.status, 200); assert.match(await response.text(), /<div id="root"><\/div>/);
    }
  });
  await check('Nginx comunica /api/health con Express y MySQL real', async () => {
    assert.equal((await api('GET', '/health')).database, 'conectada');
  });
  let auth;
  let pilotReport;
  const profile = { nombre: 'Docker', apellido: 'Prueba', email: 'docker@example.test', password: 'PruebaDocker2026!' };
  await check('Registro y login a través del frontend Docker', async () => {
    await api('POST', '/auth/register', profile, null, 201);
    auth = await api('POST', '/auth/login', profile);
    assert.ok(auth.token);
    assert.equal((await api('GET', '/auth/perfil', null, auth.token)).user.email, profile.email);
  });
  await check('Crear y consultar reporte usando categoría canónica', async () => {
    const { reporte } = await api('POST', '/reportes', {
      tipo_contaminacion: 'agua', nivel_severidad: 'alto', titulo: 'Reporte Docker sintético',
      direccion: 'Dirección de prueba', latitud: 1.15, longitud: -76.65,
    }, auth.token, 201);
    const detail = await api('GET', `/reportes/${reporte.id_reporte}`, null, auth.token);
    assert.equal(detail.reporte.titulo, 'Reporte Docker sintético');
    pilotReport = reporte;
  });
  await check('Piloto hexagonal: consulta geográfica y alertas por Nginx con Node 24', async () => {
    // Fixture exclusivamente dentro del contenedor/base sintéticos de este proyecto.
    await docker(['exec', '-T', 'backend-prod', 'node', '--input-type=module', '-e', "import pool from './src/config/database.js'; await pool.execute('UPDATE usuarios SET rol=? WHERE email=?',['admin','docker@example.test']); await pool.end();"]);
    auth = await api('POST', '/auth/login', profile);
    await api('PATCH', `/reportes/${pilotReport.id_reporte}`, { estado: 'en_proceso' }, auth.token);
    const zones = await api('GET', '/reportes/zonas-riesgo?min_score=0', null, auth.token);
    assert.equal(zones.zonas.length, 1);
    assert.equal(zones.zonas[0].n_reportes, 1);
    assert.equal(zones.zonas[0].tipo_dominante, 'agua');
    const alerts = await api('GET', '/reportes/alertas-predictivas?min_score=0&nivel_min=bajo');
    assert.equal(alerts.alertas[0].zona_id, zones.zonas[0].zona_id);
    await api('DELETE', `/reportes/${pilotReport.id_reporte}`, null, auth.token);
    await api('GET', `/reportes/${pilotReport.id_reporte}`, null, null, 404);
    assert.deepEqual((await api('GET', '/reportes/zonas-riesgo?min_score=0', null, auth.token)).zonas, []);
  });
  await check('Nginx reenvía imágenes /uploads sin interceptarlas como assets estáticos', async () => {
    const encoded = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
    await docker(['exec', '-T', 'backend-prod', 'node', '--input-type=module', '-e', `import fs from 'node:fs/promises'; await fs.writeFile('/app/uploads/proxy-probe.png', Buffer.from('${encoded}','base64'));`]);
    const response = await fetch(`${origin}/uploads/proxy-probe.png`);
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(encoded, 'base64'));
  });
  await check('Las rutas de API inexistentes conservan error JSON 404', async () => { await api('GET', '/ruta-inexistente', null, null, 404); });
} catch (error) {
  process.exitCode = 1;
  checks.push({ name: 'Validación del stack', status: 'failed', message: error.message });
  console.error(error.message);
  log += await docker(['logs', '--no-color', '--tail', '100']).catch(() => 'Sin logs adicionales.');
} finally {
  // Se destruyen solo contenedores y volúmenes sintéticos del proyecto único propio.
  let cleaned = true;
  await docker(['down', '--volumes', '--timeout', '10']).catch((error) => {
    cleaned = false; process.exitCode = 1;
    checks.push({ name: 'Retirar recursos propios', status: 'failed', message: error.message });
    console.error(error.message);
  });
  await writeFile(path.join(output, 'stack.log'), log);
  await writeFile(path.join(output, 'stack.json'), `${JSON.stringify({ checks, limitations: ['Sin navegador interactivo ni proveedores externos.'] }, null, 2)}\n`);
  console.log(`Stack: ${checks.filter((item) => item.status === 'passed').length} correctas, ${checks.filter((item) => item.status === 'failed').length} fallidas; ${cleaned ? 'recursos propios retirados' : 'limpieza incompleta'}.`);
}
