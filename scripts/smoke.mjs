// Prueba HTTP real del proxy y la API, sin credenciales ni datos externos.
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

Object.assign(process.env, {
  NODE_ENV: 'test', API_PREFIX: '/api', DB_HOST: '127.0.0.1', DB_PORT: '1',
  DB_USER: 'smoke', DB_PASSWORD: randomBytes(16).toString('hex'), DB_NAME: 'smoke',
  DB_SSL: 'false', JWT_SECRET: randomBytes(32).toString('hex'),
});
const { default: app } = await import('../apps/backend/src/app.js');
const { default: pool } = await import('../apps/backend/src/config/database.js');
const { createServer } = await import('../apps/frontend/node_modules/vite/dist/node/index.js');
const api = http.createServer(app);
const previousCwd = process.cwd();
let vite;
try {
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const apiUrl = `http://127.0.0.1:${api.address().port}`;
  const frontend = fileURLToPath(new URL('../apps/frontend/', import.meta.url));
  process.chdir(frontend);
  vite = await createServer({
    root: frontend, configFile: `${frontend}vite.config.js`,
    server: { host: '127.0.0.1', port: 0, strictPort: false, open: false,
      proxy: { '/api': { target: apiUrl, changeOrigin: true }, '/uploads': { target: apiUrl } },
    },
  });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const index = await fetch(url);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /<div id="root"><\/div>/);
  const health = await fetch(`${url}/api/health`);
  assert.equal(health.status, 503);
  assert.equal((await health.json()).database, 'desconectada');
  const login = await fetch(`${url}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(login.status, 400);
  assert.equal((await fetch(`${url}/api/auth/perfil`)).status, 401);
  assert.equal((await fetch(`${apiUrl}/api/ruta-inexistente`)).status, 404);
  console.log('Smoke: SPA 200, proxy /api correcto, health 503 sin MySQL, login inválido 400, perfil 401 y ruta inexistente 404.');
  console.log('No acredita operaciones con MySQL, Cloudinary, OAuth, correo o proveedores de IA.');
} finally {
  await vite?.close();
  await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
  await pool.end();
  process.chdir(previousCwd);
}
