import pool from '../config/database.js';
import { ReporteModel } from '../models/reporte.model.js';
import { EntidadModel } from '../models/entidad.model.js';
import { ReporteEntidadModel } from '../models/reporte-entidad.model.js';
import { EvidenciaModel } from '../models/evidencia.model.js';
import { UsuarioModel } from '../models/usuario.model.js';
import { LikeModel } from '../models/like.model.js';
import { createConsultasReportes } from '../modules/reportes-lectura/application/consultar-reportes.js';
import { createMysqlReportesReader } from '../modules/reportes-lectura/adapters/outbound/mysql-reportes-reader.js';
import { createLegacyRelationsReader } from '../modules/reportes-lectura/adapters/outbound/legacy-relations-reader.js';
import { createLegacyViewRecorder } from '../modules/reportes-lectura/adapters/outbound/legacy-view-recorder.js';
import { createReportesControllers } from '../modules/reportes-lectura/adapters/inbound/express-controller.js';

const consultas = createConsultasReportes({
  reportes: createMysqlReportesReader({ pool }),
  relations: createLegacyRelationsReader({ entidades: EntidadModel, asignaciones: ReporteEntidadModel, evidencias: EvidenciaModel, usuarios: UsuarioModel, likes: LikeModel }),
  views: createLegacyViewRecorder({ reportes: ReporteModel, clock: { now: () => Date.now() } }),
});
export const { getReportes, getMisReportes, getReporteById, getTrendingReportes } = createReportesControllers({ consultas });
