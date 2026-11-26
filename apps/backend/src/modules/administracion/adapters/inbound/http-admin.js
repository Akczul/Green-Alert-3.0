// Adaptador HTTP: traduce Express ↔ casos de uso y conserva el formato {status, message, data}.
const parseLimit = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
};
const parseOffset = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, parsed);
};
export const parseActivo = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 1 ? 1 : value === 0 ? 0 : null;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return 1;
    if (normalized === 'false' || normalized === '0') return 0;
  }
  return null;
};

export const createAdminHttp = ({ administracion, actorDe, successResponse, errorResponse }) => {
  const handle = (fn) => async (req, res, next) => {
    try {
      const actor = await actorDe(req);
      if (!actor) return errorResponse(res, 'acceso denegado. rol no autorizado.', 403);
      return await fn(req, res, actor);
    } catch (error) {
      if ([400, 403, 404, 409].includes(error.statusCode)) return errorResponse(res, error.message, error.statusCode);
      return next(error);
    }
  };
  const idDe = (req) => Number(req.params.id);

  return {
    listarUsuarios: handle(async (req, res, actor) => {
      const { rol, activo, search } = req.query ?? {};
      const data = await administracion.listar(actor, {
        rol, activo: parseActivo(activo), search,
        limit: parseLimit(req.query?.limit, 20), offset: parseOffset(req.query?.offset, 0),
      });
      return successResponse(res, data, 'Usuarios obtenidos correctamente.');
    }),
    obtenerUsuario: handle(async (req, res, actor) => {
      if (!idDe(req)) return errorResponse(res, 'Id de usuario invalido.', 400);
      const usuario = await administracion.obtener(actor, idDe(req));
      if (!usuario) return errorResponse(res, 'Usuario no encontrado.', 404);
      return successResponse(res, { usuario }, 'Usuario obtenido correctamente.');
    }),
    cambiarRol: handle(async (req, res, actor) => {
      if (!idDe(req)) return errorResponse(res, 'Id de usuario invalido.', 400);
      const { rol, id_entidad, nivel_admin, ambito_entidad } = req.body ?? {};
      const usuario = await administracion.cambiarRol(actor, idDe(req), { rol, id_entidad, nivel_admin, ambito_entidad });
      if (!usuario) return errorResponse(res, 'Usuario no encontrado.', 404);
      return successResponse(res, { usuario }, 'Rol actualizado correctamente.');
    }),
    cambiarEstado: handle(async (req, res, actor) => {
      if (!idDe(req)) return errorResponse(res, 'Id de usuario invalido.', 400);
      const activo = parseActivo(req.body?.activo);
      if (activo === null) return errorResponse(res, 'Estado activo invalido.', 400);
      const usuario = await administracion.cambiarEstado(actor, idDe(req), activo);
      if (!usuario) return errorResponse(res, 'Usuario no encontrado.', 404);
      return successResponse(res, { usuario }, 'Estado actualizado correctamente.');
    }),
    eliminarUsuario: handle(async (req, res, actor) => {
      if (!idDe(req)) return errorResponse(res, 'Id de usuario invalido.', 400);
      const removed = await administracion.eliminar(actor, idDe(req));
      if (!removed) return errorResponse(res, 'Usuario no encontrado.', 404);
      return successResponse(res, null, 'Usuario eliminado correctamente.');
    }),
    listarAuditoria: handle(async (req, res, actor) => {
      const data = await administracion.auditoria(actor, {
        limit: parseLimit(req.query?.limit, 50), offset: parseOffset(req.query?.offset, 0),
        actorId: Number(req.query?.actor) || null, targetId: Number(req.query?.usuario) || null,
      });
      return successResponse(res, data, 'Auditoria obtenida correctamente.');
    }),
    // Para rutas de parámetros y operaciones globales (categorías, eventos, caché).
    // Usar después de verifyToken; consulta el nivel vigente en MySQL, no el del JWT.
    async requireSuperadmin(req, res, next) {
      try {
        const actor = await actorDe(req);
        if (actor?.rol !== 'admin' || actor.nivel_admin !== 'global') {
          return errorResponse(res, 'Acción reservada al superadministrador.', 403);
        }
        return next();
      } catch (error) {
        return next(error);
      }
    },
  };
};
