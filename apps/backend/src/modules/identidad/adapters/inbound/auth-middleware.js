import { CredencialRechazada } from '../../domain/seguridad.js';
const bearer = (req) => {
  const [scheme, token] = typeof req.headers.authorization === 'string' ? req.headers.authorization.split(' ') : [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};
export const createAuthMiddleware = ({ verificarAcceso }) => {
  const check = (optional) => async (req, res, next) => {
    const token = bearer(req);
    delete req.user;
    if (!token) return optional ? next() : res.status(401).json({ status: 'error', message: 'acceso denegado. token no proporcionado.' });
    try { req.user = await verificarAcceso(token); return next(); }
    catch (error) {
      if (error instanceof CredencialRechazada) return optional ? next() : res.status(403).json({ status: 'error', message: 'token inválido o expirado.' });
      // No autenticar si el store está caído ni exponer SQL/configuración.
      const unavailable = new Error('No fue posible verificar la sesion. Intenta nuevamente.');
      unavailable.statusCode = 503; return next(unavailable);
    }
  };
  return { verifyToken: check(false), optionalAuth: check(true) };
};
