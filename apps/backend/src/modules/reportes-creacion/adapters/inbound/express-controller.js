import { CrearReporteError } from '../../domain/validaciones.js';
import { errorResponse, successResponse } from '../../../../utils/response.js';

export const createPostReporte = ({ crearReporte }) => async (req, res, next) => {
  try {
    const files = [
      ...(req.file ? [req.file] : []),
      ...(Array.isArray(req.files) ? req.files : []),
      ...(Array.isArray(req.files?.file) ? req.files.file : []),
      ...(Array.isArray(req.files?.files) ? req.files.files : []),
    ];
    const data = await crearReporte({ body: req.body, user: req.user, files });
    return successResponse(res, data, 'Reporte creado correctamente.', 201);
  } catch (error) {
    if (error instanceof CrearReporteError) return errorResponse(res, error.message, 400);
    return next(error);
  }
};
