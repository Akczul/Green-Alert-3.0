import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { freePort } from './mysql-sandbox.mjs';
import { runZonasRiesgoIntegration } from './zonas-riesgo-integration.mjs';

export async function runIntegration({ root, admin, config, database, directory, result }) {
  const password = randomBytes(24).toString('hex');
  const user = 'greenalert_validation';
  await admin.query(`CREATE USER '${user}'@'%' IDENTIFIED BY ?`, [password]);
  await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${user}'@'%'`);
  const port = await freePort();
  const uploads = path.join(directory, 'uploads');
  await mkdir(uploads);
  const backend = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(root, 'apps/backend'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env,
      NODE_ENV: 'production', PORT: String(port), API_PREFIX: '/api',
      DB_HOST: '127.0.0.1', DB_PORT: String(config.port), DB_NAME: database,
      DB_USER: user, DB_PASSWORD: password, DB_SSL: 'false',
      JWT_SECRET: randomBytes(32).toString('hex'), JWT_EXPIRES_IN: '15m', UPLOAD_DIR: uploads,
      EMAIL_TRANSPORT: 'json', EMAIL_HOST: 'localhost', EMAIL_PORT: '587', EMAIL_USER: 'validation',
      EMAIL_PASS: password, EMAIL_FROM: 'validation@example.test',
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', FACEBOOK_APP_ID: '', FACEBOOK_APP_SECRET: '',
      HF_API_KEY: '', GROQ_API_KEY: '', GEMINI_API_KEY: '',
      CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '',
      FIREBASE_SERVICE_ACCOUNT_JSON: '', FIREBASE_PROJECT_ID: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '',
      RATE_LIMIT_AUTH_MAX: '1000', RATE_LIMIT_LOGIN_MAX: '1000', RATE_LIMIT_PASSWORD_RESET_MAX: '1000',
    },
  });
  const backendExit = once(backend, 'exit');
  let backendLog = '';
  for (const stream of [backend.stdout, backend.stderr]) stream.on('data', (chunk) => { backendLog += chunk; });
  const previousCwd = process.cwd();
  let vite;
  const state = {};
  async function check(name, fn) {
    try { await fn(); result.checks.push({ name, status: 'passed' }); console.log(`OK: ${name}`); }
    catch (error) {
      result.checks.push({ name, status: 'failed', code: error.code || error.name, message: error.message.slice(0, 700) });
      console.error(`FALLO: ${name}: ${error.message.slice(0, 350)}`);
    }
  }
  try {
    const target = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (backend.exitCode !== null) throw new Error(`Backend terminó con código ${backend.exitCode}.`);
      try { const response = await fetch(`${target}/api/health`); if (response.ok) { ready = true; break; } } catch { /* esperar arranque */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Backend no alcanzó health 200 con MySQL real.');
    const { createServer } = await import('../apps/frontend/node_modules/vite/dist/node/index.js');
    process.chdir(path.join(root, 'apps/frontend'));
    vite = await createServer({
      root: process.cwd(), configFile: path.join(process.cwd(), 'vite.config.js'),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, open: false,
        proxy: { '/api': { target, changeOrigin: true }, '/uploads': { target, changeOrigin: true } },
      },
    });
    await vite.listen();
    const frontend = `http://127.0.0.1:${vite.httpServer.address().port}`;
    async function request(method, route, { body, token, expected = 200 } = {}) {
      const response = await fetch(`${frontend}/api${route}`, {
        method, headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      assert.equal(response.status, expected, `${method} ${route}: HTTP ${response.status}; ${data.message || ''}`);
      return data.data ?? data;
    }
    const profile = (label) => ({ nombre: 'Prueba', apellido: label, email: `${label.toLowerCase()}@example.test`, password: 'PruebaSegura2026!' });
    await check('SPA y health real a través del proxy Vite', async () => {
      assert.equal((await fetch(frontend)).status, 200);
      assert.equal((await request('GET', '/health')).database, 'conectada');
    });
    await check('Registro ciudadano y hash scrypt persistidos', async () => {
      state.citizen = await request('POST', '/auth/register', { body: profile('Ciudadano'), expected: 201 });
      assert.ok(state.citizen.accessToken && state.citizen.refreshToken);
      const [[stored]] = await admin.query('SELECT password_hash, rol FROM usuarios WHERE id_usuario=?', [state.citizen.user.id_usuario]);
      assert.ok(stored.password_hash.includes(':') && stored.password_hash !== profile('Ciudadano').password);
      assert.equal(stored.rol, 'ciudadano');
    });
    await check('Registro duplicado rechazado sin duplicar usuario', async () => {
      await request('POST', '/auth/register', { body: profile('Ciudadano'), expected: 409 });
      const [[row]] = await admin.query('SELECT COUNT(*) AS total FROM usuarios WHERE email=?', [profile('Ciudadano').email]);
      assert.equal(row.total, 1);
    });
    await check('Login real y contraseña incorrecta', async () => {
      state.citizen = await request('POST', '/auth/login', { body: profile('Ciudadano') });
      await request('POST', '/auth/login', { body: { ...profile('Ciudadano'), password: 'Incorrecta123!' }, expected: 401 });
    });
    await check('Perfil y actualización persistida', async () => {
      await request('GET', '/auth/perfil', { expected: 401 });
      await request('PATCH', '/auth/perfil', { token: state.citizen.token, body: { nombre: 'Ciudadano', apellido: 'Prueba', telefono: '3101234567' } });
      const data = await request('GET', '/auth/perfil', { token: state.citizen.token });
      assert.equal(data.user.nombre, 'Ciudadano');
    });
    await check('Rotación de refresh y rechazo de reutilización', async () => {
      const old = state.citizen.refreshToken;
      const next = await request('POST', '/auth/refresh', { body: { refreshToken: old } });
      assert.ok(next.refreshToken !== old);
      await request('POST', '/auth/refresh', { body: { refreshToken: old }, expected: 401 });
      state.citizen = { ...state.citizen, ...next };
    });
    await check('Administración: fixture de admin, login y lista de usuarios', async () => {
      state.admin = await request('POST', '/auth/register', { body: profile('Administrador'), expected: 201 });
      await admin.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=?", [state.admin.user.id_usuario]);
      state.admin = await request('POST', '/auth/login', { body: profile('Administrador') });
      const data = await request('GET', '/admin/usuarios?limit=1&offset=0', { token: state.admin.token });
      assert.equal(data.usuarios.length, 1);
      assert.equal(data.total, 2);
      await request('GET', '/admin/usuarios', { token: state.citizen.token, expected: 403 });
    });
    await check('Catálogo inicial compatible con las categorías de la interfaz', async () => {
      const source = await readFile(path.join(root, 'apps/frontend/src/constants/categorias.js'), 'utf8');
      const codes = [...source.slice(source.indexOf('TIPOS_CONTAMINACION'), source.indexOf('export const NIVELES_SEVERIDAD')).matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
      const [rows] = await admin.query('SELECT codigo FROM categorias_riesgo WHERE activo=1');
      const missing = codes.filter((code) => !rows.some((row) => row.codigo === code));
      assert.deepEqual(missing, [], 'Hay categorías ofrecidas por React que MySQL no acepta.');
    });
    await check('Alta de reporte con ubicación y persistencia MySQL', async () => {
      state.report = (await request('POST', '/reportes', { token: state.citizen.token, expected: 201, body: {
        tipo_contaminacion: 'deforestacion', subcategoria: 'tala_ilegal', nivel_severidad: 'alto',
        titulo: 'Tala ilegal de prueba', descripcion: 'Prueba sintética de tala de árboles',
        direccion: 'Sector de prueba 123', municipio: 'Mocoa', departamento: 'Putumayo', latitud: 1.15, longitud: -76.65,
      } })).reporte;
      assert.equal(state.report.estado, 'pendiente');
      const [[row]] = await admin.query('SELECT COUNT(*) AS total FROM reportes WHERE id_reporte=?', [state.report.id_reporte]);
      assert.equal(row.total, 1);
    });
    await check('Coordenadas geográficas POINT conservan latitud y longitud', async () => {
      const [[point]] = await admin.query('SELECT ST_Latitude(punto_geo) AS lat, ST_Longitude(punto_geo) AS lng FROM reportes WHERE id_reporte=?', [state.report.id_reporte]);
      assert.ok(Math.abs(point.lat - 1.15) < 0.00001 && Math.abs(point.lng + 76.65) < 0.00001, 'POINT y columnas latitud/longitud difieren: revisar orden de ejes SRID 4326.');
    });
    await check('Procedimiento de radio geográfico encuentra el reporte en su ubicación', async () => {
      const [sets] = await admin.query('CALL sp_reportes_por_radio(?, ?, ?)', [1.15, -76.65, 1]);
      assert.ok(sets[0].some((row) => row.id_reporte === state.report.id_reporte));
    });
    await check('Alta sin coordenadas conserva ubicación opcional', async () => {
      state.noCoords = (await request('POST', '/reportes', { token: state.citizen.token, expected: 201, body: {
        tipo_contaminacion: 'deforestacion', nivel_severidad: 'bajo', titulo: 'Reporte sin ubicación', direccion: 'Sector sintético 456',
      } })).reporte;
      assert.equal(state.noCoords.latitud, null);
    });
    await check('Listado, detalle y paginación con total real', async () => {
      const data = await request('GET', '/reportes?limit=1&offset=0');
      assert.equal(data.reportes.length, 1); assert.equal(data.total, 2);
      const detail = await request('GET', `/reportes/${state.report.id_reporte}?skip_view=true`);
      assert.equal(detail.reporte.id_reporte, state.report.id_reporte);
      assert.ok(!('password_hash' in detail.autor));
    });
    await check('Edición del propietario y rechazo de otro ciudadano', async () => {
      await request('PATCH', `/reportes/${state.report.id_reporte}`, { token: state.citizen.token, body: { titulo: 'Tala de prueba actualizada' } });
      state.other = await request('POST', '/auth/register', { body: profile('Segundo'), expected: 201 });
      await request('PATCH', `/reportes/${state.report.id_reporte}`, { token: state.other.token, body: { titulo: 'No autorizado' }, expected: 403 });
    });
    await check('Asignaciones y alertas institucionales persistidas', async () => {
      const [rows] = await admin.query('SELECT id_entidad FROM reporte_entidades WHERE id_reporte=?', [state.report.id_reporte]);
      assert.ok(rows.length > 0, 'La asignación automática no persistió responsables.');
      const [[alerts]] = await admin.query('SELECT COUNT(*) AS total FROM alertas_entidad WHERE id_reporte=?', [state.report.id_reporte]);
      assert.ok(alerts.total > 0);
      state.entityId = rows[0].id_entidad;
      state.entity = await request('POST', '/auth/register', { body: profile('Institucion'), expected: 201 });
      await request('PATCH', `/admin/usuarios/${state.entity.user.id_usuario}/rol`, { token: state.admin.token, body: { rol: 'entidad', id_entidad: state.entityId } });
      state.entity = await request('POST', '/auth/login', { body: profile('Institucion') });
      const reports = await request('GET', '/entidades/mis-reportes', { token: state.entity.token });
      assert.ok(reports.reportes.some((row) => row.id_reporte === state.report.id_reporte));
      await request('PATCH', `/entidades/mis-reportes/${state.report.id_reporte}/atencion`, { token: state.entity.token, body: { estado_atencion: 'en_atencion', comentario: 'Prueba de atención' } });
    });
    await check('Moderación, cambio de estado y notificación persistida', async () => {
      await request('PATCH', `/reportes/${state.report.id_reporte}`, { token: state.admin.token, body: { estado: 'en_proceso' } });
      const notifications = await request('GET', '/notificaciones', { token: state.citizen.token });
      assert.ok(notifications.items.length > 0);
      await request('PATCH', `/notificaciones/${notifications.items[0].uuid}/leida`, { token: state.citizen.token });
    });
    await check('Estadísticas SQL, categorías y tendencias con datos reales', async () => {
      for (const route of ['/reportes/stats', '/reportes/stats/categoria', '/reportes/stats/timeline', '/reportes/stats/heatmap', '/categorias', '/categorias/estadisticas/resumen', '/categorias/estadisticas/por-severidad', '/reportes/trending']) await request('GET', route);
      await request('GET', '/reportes/stats/ia', { token: state.admin.token });
    });
    await check('Likes y vistas únicas persistidos', async () => {
      await request('POST', `/reportes/${state.report.id_reporte}/like`, { token: state.other.token });
      await request('GET', `/reportes/${state.report.id_reporte}`, { token: state.other.token });
      await request('GET', `/reportes/${state.report.id_reporte}`, { token: state.other.token });
      const [[likes]] = await admin.query('SELECT COUNT(*) AS total FROM reporte_likes WHERE id_reporte=?', [state.report.id_reporte]);
      const [[views]] = await admin.query('SELECT COUNT(*) AS total FROM reporte_vistas WHERE id_reporte=? AND id_usuario=?', [state.report.id_reporte, state.other.user.id_usuario]);
      assert.equal(likes.total, 1); assert.equal(views.total, 1);
    });
    await check('Zonas de riesgo reales y permisos', async () => {
      const data = await request('GET', '/reportes/zonas-riesgo?min_score=0', { token: state.admin.token });
      assert.ok(data.zonas.some((row) => row.n_reportes > 0));
      await request('GET', '/reportes/zonas-riesgo', { token: state.citizen.token, expected: 403 });
      const alerts = await request('GET', '/reportes/alertas-predictivas?min_score=0&nivel_min=bajo&lat=1.15&lng=-76.65&radio_km=20');
      assert.ok(alerts.alertas.length > 0);
    });
    await runZonasRiesgoIntegration({ check, request, admin, state });
    await check('Evidencia local: fixture SQL, lectura HTTP y borrado lógico', async () => {
      const filename = 'evidencia-sintetica.png';
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
      await writeFile(path.join(uploads, filename), png);
      const [insert] = await admin.query("INSERT INTO evidencias (uuid,id_reporte,id_usuario,tipo_archivo,url_archivo,nombre_original,mime_type,tamano_bytes,storage_provider) VALUES (?,?,?,'imagen',?,?,'image/png',?,'local')", [randomUUID(), state.report.id_reporte, state.citizen.user.id_usuario, `/uploads/${filename}`, filename, png.length]);
      const evidence = await request('GET', `/reportes/${state.report.id_reporte}/evidencias`, { token: state.citizen.token });
      assert.ok(evidence.evidencias.some((row) => row.id_evidencia === insert.insertId));
      const asset = await fetch(`${frontend}/uploads/${filename}`);
      assert.equal(asset.status, 200); assert.deepEqual(Buffer.from(await asset.arrayBuffer()), png);
      await request('DELETE', `/reportes/${state.report.id_reporte}/evidencias/${insert.insertId}`, { token: state.citizen.token });
      const [[deleted]] = await admin.query('SELECT deleted_at FROM evidencias WHERE id_evidencia=?', [insert.insertId]);
      assert.ok(deleted.deleted_at);
    });
    await check('Upload sin Cloudinary falla explícitamente y no deja evidencia SQL', async () => {
      const [[before]] = await admin.query('SELECT COUNT(*) AS total FROM evidencias');
      const form = new FormData();
      form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'prueba.png');
      await request('POST', `/reportes/${state.report.id_reporte}/evidencias`, { token: state.citizen.token, body: form, expected: 500 });
      const [[after]] = await admin.query('SELECT COUNT(*) AS total FROM evidencias');
      assert.equal(after.total, before.total);
    });
    await check('Claves foráneas rechazan evidencia huérfana', async () => {
      await assert.rejects(admin.query("INSERT INTO evidencias (uuid,id_reporte,id_usuario,url_archivo) VALUES (?,999999999,?,'/uploads/no-existe.png')", [randomUUID(), state.citizen.user.id_usuario]), (error) => error.code === 'ER_NO_REFERENCED_ROW_2');
    });
    await check('Categoría agua y longitud fuera de +/-90 funcionan en MySQL', async () => {
      const report = (await request('POST', '/reportes', { token: state.citizen.token, expected: 201, body: {
        tipo_contaminacion: 'agua', nivel_severidad: 'medio', titulo: 'Agua de prueba geográfica',
        direccion: 'Ubicación sintética de prueba', latitud: 35, longitud: -120,
      } })).reporte;
      const [[point]] = await admin.query('SELECT ST_Latitude(punto_geo) AS lat, ST_Longitude(punto_geo) AS lng FROM reportes WHERE id_reporte=?', [report.id_reporte]);
      assert.equal(point.lat, 35); assert.equal(point.lng, -120);
      await request('DELETE', `/reportes/${report.id_reporte}`, { token: state.citizen.token });
    });
    await check('Exportación JSON y archivo XLSX reales', async () => {
      const data = await request('GET', '/reportes/export?format=json', { token: state.admin.token });
      assert.ok(data.reportes.length >= 2);
      const response = await fetch(`${frontend}/api/reportes/export`, { headers: { Authorization: `Bearer ${state.admin.token}` } });
      assert.equal(response.status, 200);
      assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    });
    await check('Borrado lógico de reporte conserva fila y oculta consulta', async () => {
      await request('DELETE', `/reportes/${state.noCoords.id_reporte}`, { token: state.citizen.token });
      await request('GET', `/reportes/${state.noCoords.id_reporte}`, { expected: 404 });
      const [[row]] = await admin.query('SELECT deleted_at FROM reportes WHERE id_reporte=?', [state.noCoords.id_reporte]);
      assert.ok(row.deleted_at);
    });
    await check('Logout revoca refresh persistido', async () => {
      const token = state.citizen.refreshToken;
      await request('POST', '/auth/logout', { body: { refreshToken: token } });
      await request('POST', '/auth/refresh', { body: { refreshToken: token }, expected: 401 });
    });
    await check('Administración desactiva y borra lógicamente usuarios', async () => {
      const id = state.other.user.id_usuario;
      await request('PATCH', `/admin/usuarios/${id}/estado`, { token: state.admin.token, body: { activo: false } });
      await request('POST', '/auth/login', { body: profile('Segundo'), expected: 403 });
      await request('PATCH', `/admin/usuarios/${id}/estado`, { token: state.admin.token, body: { activo: true } });
      await request('DELETE', `/admin/usuarios/${id}`, { token: state.admin.token });
      const [[stored]] = await admin.query('SELECT deleted_at FROM usuarios WHERE id_usuario=?', [id]);
      assert.ok(stored.deleted_at);
      await request('POST', '/auth/login', { body: profile('Segundo'), expected: 401 });
    });
  } finally {
    console.log('Cerrando servidores HTTP de validación...');
    if (backend.exitCode === null) backend.kill();
    await backendExit;
    vite?.httpServer?.closeAllConnections();
    if (vite) await Promise.race([vite.close(), new Promise((resolve) => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    process.chdir(previousCwd);
    await writeFile(path.join(directory, 'backend.log'), backendLog);
  }
}
