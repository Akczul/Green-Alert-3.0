// Solo pruebas: app real, fallos SQL controlados y cliente Cloudinary simulado.
import http from 'node:http';
const fixed = Date.parse('2026-11-18T12:00:00Z');
Date.now = () => fixed;
const { default: pool } = await import('../apps/backend/src/config/database.js');
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
  connection.query(`SET timestamp=${fixed / 1000}`);
});
let mode = '', uploads = [], deletes = [], evidenceWrites = 0, uploadCalls = 0;
const execute = pool.execute.bind(pool);
pool.execute = async (sql, params) => {
  if (mode === 'insert-fail' && /INSERT INTO reportes\s/.test(sql)) throw new Error('fallo insert reporte');
  if (mode === 'ia-fail' && /SET ia_etiquetas/.test(sql)) throw new Error('fallo update IA');
  if (/INSERT INTO evidencias\s/.test(sql)) {
    evidenceWrites++;
    if (mode === 'evidence-fail' || (mode === 'second-evidence-fail' && evidenceWrites === 2)) throw new Error('fallo insert evidencia');
  }
  return execute(sql, params);
};
const { setCloudinaryClientForTest } = await import('../apps/backend/src/services/cloudinary.service.js');
setCloudinaryClientForTest({ uploader: {
  upload_stream(options, callback) { return { end() {
    uploadCalls++;
    if (mode === 'upload-fail' || (mode === 'second-upload-fail' && uploadCalls === 2)) return callback(new Error('fallo upload'));
    const result = { public_id: `fixture/${uploadCalls}`, asset_id: `asset-${uploadCalls}`, secure_url: `https://example.test/${uploadCalls}`, resource_type: options.resource_type, bytes: 24, format: 'png' };
    uploads.push(result); callback(null, result);
  } }; },
  async destroy(id, options) { deletes.push({ id, options }); if (mode === 'cleanup-fail') throw new Error('fallo cleanup'); return { result: 'ok' }; },
} });
const { AsignacionEntidadesService } = await import('../apps/backend/src/services/asignacion-entidades.service.js');
const assign = AsignacionEntidadesService.asignarEntidadesAReporte;
AsignacionEntidadesService.asignarEntidadesAReporte = async (...args) => {
  if (mode === 'assignment-fail') throw new Error('fallo asignacion');
  return assign(...args);
};
// cleanup-fail también falla el INSERT para activar compensación.
const { EvidenciaModel } = await import('../apps/backend/src/models/evidencia.model.js');
const evidenceCreate = EvidenciaModel.create;
EvidenciaModel.create = async (...args) => {
  if (mode === 'cleanup-fail') throw new Error('fallo insert evidencia');
  return evidenceCreate(...args);
};
const { prediccionCache } = await import('../apps/backend/src/bootstrap/zonas-riesgo.js');
const { default: app } = await import('../apps/backend/src/app.js');
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.send({ port: server.address().port });
process.on('message', async (message) => {
  if (message.type === 'reset') {
    mode = message.mode || ''; uploads = []; deletes = []; evidenceWrites = 0; uploadCalls = 0;
    prediccionCache.clear(); prediccionCache.set('sentinel', { before: true }); process.send({ ok: true });
  }
  if (message.type === 'effects') process.send({ uploads, deletes, cacheSize: prediccionCache.size() });
  if (message.type === 'stop') {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await pool.end(); process.exit(0);
  }
});
