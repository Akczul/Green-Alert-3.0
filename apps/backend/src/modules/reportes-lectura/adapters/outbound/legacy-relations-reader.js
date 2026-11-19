// Reutiliza lecturas existentes sin migrar instituciones, usuarios o evidencias.
export const createLegacyRelationsReader = ({ entidades, asignaciones, evidencias, usuarios, likes }) => ({
  findActiveEntity: (query) => entidades.findActiveAllowedByIdOrCodigo(query),
  findAssignedReports: (id, filters) => asignaciones.findByEntidad(id, filters),
  findAssignment: (id, entity) => asignaciones.findOneByReporteAndEntidad(id, entity),
  findEvidence: (id) => evidencias.findByReporte(id),
  findAuthor: (id) => usuarios.findById(id),
  likedSet: (ids, user) => likes.likedSet(ids, user),
});
