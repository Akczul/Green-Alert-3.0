// Composición explícita de pruebas legacy; producción usa el writer MySQL directo.
import { ReporteModel } from '../../src/models/reporte.model.js';
import { CategoriaRiesgoModel } from '../../src/models/categoria-riesgo.model.js';
import { EvidenciaModel } from '../../src/models/evidencia.model.js';
import { AsignacionEntidadesService } from '../../src/services/asignacion-entidades.service.js';
import { analyzeReporte } from '../../src/services/ia.service.js';
import { calcularScoreEvidencias } from '../../src/services/evidencia-score.service.js';
import { invalidatePrediccionCache } from '../../src/services/prediccion.service.js';
import { evidenceStorage } from '../../src/bootstrap/reportes-creacion.js';
import { createCrearReporte } from '../../src/modules/reportes-creacion/application/crear-reporte.js';
import { createPostReporte } from '../../src/modules/reportes-creacion/adapters/inbound/express-controller.js';

export const createReporte = createPostReporte({ crearReporte: createCrearReporte({
  reportes: {
    create: (...args) => ReporteModel.create(...args), findById: (...args) => ReporteModel.findById(...args),
    updateIaAnalysis: (...args) => ReporteModel.updateIaAnalysis(...args), remove: (...args) => ReporteModel.remove(...args),
  },
  categorias: { esValido: (...args) => CategoriaRiesgoModel.esValido(...args) },
  evidencias: { create: (...args) => EvidenciaModel.create(...args) },
  archivos: evidenceStorage,
  analisis: { score: calcularScoreEvidencias, analizar: analyzeReporte },
  efectos: { asignar: (...args) => AsignacionEntidadesService.asignarEntidadesAReporte(...args), invalidateCache: invalidatePrediccionCache },
  logger: console,
}) });
