import { parseZonasParams } from './zonas-params.js';
import { successResponse } from '../../../../utils/response.js';

/** @param {{consultarZonasRiesgo: import('../../application/ports.js').ConsultarZonasRiesgo, clock: import('../../application/ports.js').Clock}} dependencies */
export const createGetZonasRiesgo = ({ consultarZonasRiesgo, clock }) => async (req, res, next) => {
  try {
    const payload = await consultarZonasRiesgo(parseZonasParams(req.query, clock));
    return successResponse(res, payload, 'Zonas de riesgo obtenidas correctamente.');
  } catch (error) {
    return next(error);
  }
};
