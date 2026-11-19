import { withLikedByMe, publicAuthor } from '../domain/reportes.js';

export class ConsultaReportesError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** @param {{reportes: import('./ports.js').ReportesReader, relations: import('./ports.js').ReporteRelationsReader, views: import('./ports.js').ReporteViewRecorder}} dependencies */
export const createConsultasReportes = ({ reportes, relations, views }) => {
  const entityId = async (user) => {
    const id = Number(user?.id_entidad ?? user?.entidad_id);
    if (id) {
      const entity = await relations.findActiveEntity({ id_entidad: id });
      if (entity?.id_entidad) return entity.id_entidad;
    }
    throw new ConsultaReportesError('ENTITY_UNAVAILABLE', 'Usuario entidad sin entidad asignada.');
  };
  const enrich = async (items, userId) => {
    const list = Array.isArray(items) ? items : [items].filter(Boolean);
    if (!userId || list.length === 0) return items;
    return withLikedByMe(items, await relations.likedSet(list.map((row) => row.id_reporte), userId));
  };
  return {
    async listar({ query = {}, user } = {}) {
      const { estado, tipo_contaminacion, nivel_severidad, municipio, limit = 20, offset = 0 } = query;
      if (user?.rol === 'entidad') {
        const id = await entityId(user);
        const data = await relations.findAssignedReports(id, { categoria: tipo_contaminacion, severidad: nivel_severidad, limit, offset });
        return { reportes: data.reportes, total: data.total, limit: data.limit, offset: data.offset };
      }
      const filters = { estado, tipo_contaminacion, nivel_severidad, municipio, limit: Number(limit), offset: Number(offset) };
      const [items, total] = await Promise.all([
        reportes.findAll(filters), reportes.countAll({ estado, tipo_contaminacion, nivel_severidad, municipio }),
      ]);
      return { reportes: await enrich(items, user?.sub), total,
        limit: Math.max(1, Math.min(100, parseInt(limit, 10) || 20)), offset: Math.max(0, parseInt(offset, 10) || 0) };
    },
    async propios({ query = {}, user } = {}) {
      if (!user?.sub) throw new ConsultaReportesError('AUTH_REQUIRED', 'No autorizado.');
      const { limit = 20, offset = 0, estado, nivel_severidad } = query;
      const filters = { limit: Number(limit), offset: Number(offset), estado: estado?.trim() || null, nivel_severidad: nivel_severidad?.trim() || null };
      const [items, total] = await Promise.all([
        reportes.findByUsuario(user.sub, filters), reportes.countByUsuario(user.sub, { estado: filters.estado, nivel_severidad: filters.nivel_severidad }),
      ]);
      return { reportes: items, total };
    },
    async detalle({ id, user, skipView = false, anonymousKey }) {
      if (user?.rol === 'entidad') {
        const entity = await entityId(user);
        if (!await relations.findAssignment(id, entity)) throw new ConsultaReportesError('REPORT_FORBIDDEN', 'No tienes permiso para ver este reporte.');
      }
      const item = await reportes.findById(id);
      if (!item) throw new ConsultaReportesError('REPORT_NOT_FOUND', 'Reporte no encontrado.');
      // Conservar el snapshot anterior al incremento y el orden de efectos.
      await views.record({ reportId: id, userId: user?.sub, skip: skipView, anonymousKey });
      const enriched = await enrich(item, user?.sub);
      const [evidencias, author] = await Promise.all([relations.findEvidence(id), relations.findAuthor(item.id_usuario)]);
      return { reporte: enriched, evidencias, autor: publicAuthor(author) };
    },
    async tendencias({ query = {}, user } = {}) {
      const items = await reportes.findTrending({ limit: query?.limit });
      return { reportes: await enrich(items, user?.sub), total: items.length };
    },
  };
};
