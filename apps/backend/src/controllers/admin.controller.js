import { UsuarioModel } from '../models/usuario.model.js';
import { ReporteModel } from '../models/reporte.model.js';
import { successResponse } from '../utils/response.js';

// La gestión de usuarios (listar, obtener, rol, estado, eliminar y auditoría) vive en el módulo
// hexagonal src/modules/administracion, ensamblado en src/bootstrap/administracion.js.
// Aquí solo quedan las estadísticas agregadas, comunes a ambos niveles administrativos.
export const statsUsuarios = async (req, res, next) => {
  try {
    const [usuarios, reportes] = await Promise.all([
      UsuarioModel.getStats(),
      ReporteModel.getStats(),
    ]);

    return successResponse(
      res,
      { usuarios, reportes },
      'Estadisticas obtenidas correctamente.'
    );
  } catch (error) {
    return next(error);
  }
};
