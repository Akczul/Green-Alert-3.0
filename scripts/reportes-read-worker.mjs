// Servidor de contratos: app/rutas reales con reloj y sesión SQL controlados.
import http from 'node:http';
const fixed = Date.parse('2026-11-18T12:00:00Z');
Date.now = () => fixed;
const { default: pool } = await import('../apps/backend/src/config/database.js');
pool.on('connection', (connection) => { connection.query(`SET timestamp=${fixed / 1000}`); });
const { ReporteModel } = await import('../apps/backend/src/models/reporte.model.js');
const { EntidadModel } = await import('../apps/backend/src/models/entidad.model.js');
const { ReporteEntidadModel } = await import('../apps/backend/src/models/reporte-entidad.model.js');
const { EvidenciaModel } = await import('../apps/backend/src/models/evidencia.model.js');
const { UsuarioModel } = await import('../apps/backend/src/models/usuario.model.js');
const { LikeModel } = await import('../apps/backend/src/models/like.model.js');
const { default: app } = await import('../apps/backend/src/app.js');
let trace = [];
const encode = (value) => value instanceof Set ? { __set: [...value] } : JSON.parse(JSON.stringify(value ?? null));
for (const [port, model, methods] of [
  ['reportes', ReporteModel, ['findAll','countAll','findById','findByUsuario','countByUsuario','findTrending']],
  ['relations', EntidadModel, ['findActiveAllowedByIdOrCodigo']],
  ['relations', ReporteEntidadModel, ['findByEntidad','findOneByReporteAndEntidad']],
  ['relations', EvidenciaModel, ['findByReporte']],
  ['relations', UsuarioModel, ['findById']],
  ['relations', LikeModel, ['likedSet']],
]) for (const method of methods) {
  const original = model[method];
  model[method] = async (...args) => {
    const call = { port, method, args: encode(args) }; trace.push(call);
    try { const result = await original(...args); call.result = encode(result); return result; }
    catch (error) { call.error = error.message; throw error; }
  };
}
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.send({ type: 'ready', port: server.address().port });
process.on('message', async (message) => {
  if (message.type === 'reset') { trace = []; process.send({ type: 'reset' }); }
  if (message.type === 'trace') process.send({ type: 'trace', trace });
  if (message.type === 'stop') {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await pool.end(); process.exit(0);
  }
});
