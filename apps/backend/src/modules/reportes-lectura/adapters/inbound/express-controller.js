import { ConsultaReportesError } from '../../application/consultar-reportes.js';
import { successResponse, errorResponse } from '../../../../utils/response.js';

export const createReportesControllers = ({ consultas }) => {
  const failure = (error, res, next) => {
    if (error instanceof ConsultaReportesError) {
      const codes = { AUTH_REQUIRED: 401, ENTITY_UNAVAILABLE: 403, REPORT_FORBIDDEN: 403, REPORT_NOT_FOUND: 404 };
      return errorResponse(res, error.message, codes[error.code]);
    }
    return next(error);
  };
  return {
    async getReportes(req, res, next) {
      try { return successResponse(res, await consultas.listar({ query: req.query, user: req.user })); }
      catch (error) { return failure(error, res, next); }
    },
    async getMisReportes(req, res, next) {
      try { return successResponse(res, await consultas.propios({ query: req.query, user: req.user }), 'Reportes del usuario obtenidos correctamente.', 200); }
      catch (error) { return failure(error, res, next); }
    },
    async getReporteById(req, res, next) {
      try {
        const id = Number(req.params.id);
        const ip = req.ip || req.socket?.remoteAddress || 'unknown-ip';
        const agent = req.get?.('user-agent') || req.headers?.['user-agent'] || 'unknown-agent';
        return successResponse(res, await consultas.detalle({ id, user: req.user, skipView: req.query?.skip_view === 'true', anonymousKey: `${id}:${ip}:${agent}` }));
      } catch (error) { return failure(error, res, next); }
    },
    async getTrendingReportes(req, res, next) {
      try { return successResponse(res, await consultas.tendencias({ query: req.query, user: req.user }), 'Reportes en tendencia obtenidos correctamente.'); }
      catch (error) { return failure(error, res, next); }
    },
  };
};
