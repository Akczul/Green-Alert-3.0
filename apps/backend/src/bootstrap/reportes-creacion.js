import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { ReporteModel } from '../models/reporte.model.js';
import { CategoriaRiesgoModel } from '../models/categoria-riesgo.model.js';
import { EvidenciaModel } from '../models/evidencia.model.js';
import { analyzeReporte } from '../services/ia.service.js';
import { calcularScoreEvidencias } from '../services/evidencia-score.service.js';
import { uploadFileBuffer, deleteFileByPublicId } from '../services/cloudinary.service.js';
import { AsignacionEntidadesService } from '../services/asignacion-entidades.service.js';
import { invalidatePrediccionCache } from '../services/prediccion.service.js';
import { validateUploadedFilesContent } from '../../middlewares/upload.middleware.js';
import { createCrearReporte } from '../modules/reportes-creacion/application/crear-reporte.js';
import { createMysqlReporteWriter } from '../modules/reportes-creacion/adapters/outbound/mysql-reporte-writer.js';
import { createEvidenceStorage } from '../modules/reportes-creacion/adapters/outbound/cloudinary-evidence-storage.js';
import { createPostReporte } from '../modules/reportes-creacion/adapters/inbound/express-controller.js';

// Compartido con la gestión heredada de evidencias para mantener un solo payload.
export const evidenceStorage = createEvidenceStorage({ uploadFileBuffer, deleteFileByPublicId, validateUploadedFilesContent });
const writer = createMysqlReporteWriter({ pool, randomUUID });
export const crearReporte = createCrearReporte({
  reportes: {
    ...writer,
    findById: (id) => ReporteModel.findById(id),
    remove: (id) => ReporteModel.remove(id),
  },
  categorias: { esValido: (codigo) => CategoriaRiesgoModel.esValido(codigo) },
  evidencias: { create: (data) => EvidenciaModel.create(data) },
  archivos: evidenceStorage,
  analisis: { score: calcularScoreEvidencias, analizar: analyzeReporte },
  efectos: {
    asignar: (reporte) => AsignacionEntidadesService.asignarEntidadesAReporte(reporte),
    invalidateCache: invalidatePrediccionCache,
  },
  logger: console,
});
export const createReporte = createPostReporte({ crearReporte });
