// Composición explícita para las pruebas heredadas que simulan objetos modelo.
// La producción usa el adaptador SQL directo, no este helper.
import { ReporteModel } from '../../src/models/reporte.model.js';
import { EntidadModel } from '../../src/models/entidad.model.js';
import { ReporteEntidadModel } from '../../src/models/reporte-entidad.model.js';
import { EvidenciaModel } from '../../src/models/evidencia.model.js';
import { UsuarioModel } from '../../src/models/usuario.model.js';
import { LikeModel } from '../../src/models/like.model.js';
import { createConsultasReportes } from '../../src/modules/reportes-lectura/application/consultar-reportes.js';
import { createReportesControllers } from '../../src/modules/reportes-lectura/adapters/inbound/express-controller.js';
import { createLegacyRelationsReader } from '../../src/modules/reportes-lectura/adapters/outbound/legacy-relations-reader.js';
import { createLegacyViewRecorder } from '../../src/modules/reportes-lectura/adapters/outbound/legacy-view-recorder.js';
const consultas = createConsultasReportes({
  reportes: ReporteModel,
  relations: createLegacyRelationsReader({ entidades: EntidadModel, asignaciones: ReporteEntidadModel, evidencias: EvidenciaModel, usuarios: UsuarioModel, likes: LikeModel }),
  views: createLegacyViewRecorder({ reportes: ReporteModel, clock: { now: () => Date.now() } }),
});
export const { getReportes, getMisReportes, getReporteById, getTrendingReportes } = createReportesControllers({ consultas });
