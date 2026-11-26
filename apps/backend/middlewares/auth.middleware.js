import { verifyToken } from '../src/bootstrap/seguridad.js';
export { verifyToken, optionalAuth } from '../src/bootstrap/seguridad.js';

export const verifyTokenWhenAllDevicesLogout = (req, res, next) => {
  if (req.body?.allDevices === true) {
    return verifyToken(req, res, next);
  }

  return next();
};

// Debe usarse despues de verifyToken para asegurar req.user.
export const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'acceso denegado. usuario no autenticado.',
    });
  }

  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({
      status: 'error',
      message: 'acceso denegado. rol no autorizado.',
    });
  }

  return next();
};
