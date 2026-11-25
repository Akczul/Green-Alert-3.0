import { Router } from 'express';
import { verifyToken, requireRoles } from '../middlewares/auth.middleware.js';
import { operaciones, outbox, reconcile } from '../src/bootstrap/integracion.js';
import { prediccionCache } from '../src/bootstrap/zonas-riesgo.js';

const router = Router();
router.use(verifyToken);
const wrap = fn => async (req, res, next) => {
  try { res.json({ status: 'success', message: 'Operación completada', data: await fn(req) }); }
  catch (error) { next(error); }
};
const range = (query, hours = false) => {
  const now = Date.now();
  const to = new Date(query.to ?? (hours ? Math.ceil(now / 3600000) * 3600000 : now));
  const from = new Date(query.from ?? to.getTime() - 30 * 86400000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to ||
      to - from > 366 * 86400000 || (hours && (from.getTime() % 3600000 || to.getTime() % 3600000))) {
    throw Object.assign(new Error('Rango inválido; máximo 366 días, indicadores en horas UTC completas.'), { statusCode: 400 });
  }
  return { from: from.toISOString(), to: to.toISOString() };
};
router.post('/analisis/riesgo', requireRoles('admin', 'moderador'), wrap(req => operaciones.risk(req.user, req.body)));
router.get('/reportes/:id/historial', wrap(req => {
  if (!/^[1-9]\d{0,14}$/.test(req.params.id)) throw Object.assign(new Error('ID inválido.'), { statusCode: 400 });
  return operaciones.history(req.user, req.params.id, { ...range(req.query), limit: 100 });
}));
router.get('/indicadores', requireRoles('admin', 'moderador'), wrap(req => operaciones.indicators(req.user, range(req.query, true))));
router.get('/cache/metricas', requireRoles('admin'), wrap(() => prediccionCache.metrics?.() ?? { mode: 'memory' }));
router.post('/eventos/reenviar', requireRoles('admin'), wrap(() => outbox.drain()));
router.post('/eventos/reconciliar/:day', requireRoles('admin'), wrap(req => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.day) || !Number.isFinite(Date.parse(req.params.day))) {
    throw Object.assign(new Error('Día UTC inválido.'), { statusCode: 400 });
  }
  return reconcile(req.params.day);
}));
export default router;
