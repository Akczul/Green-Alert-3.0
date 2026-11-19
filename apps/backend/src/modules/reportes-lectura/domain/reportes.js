export const normalizeReporteEstado = (estado) => (
  typeof estado === 'string' ? estado.trim().toLowerCase().replace(/\s+/g, '_') : ''
);
export const normalizeReporteIA = (reporte) => {
  if (!reporte) return reporte;

  let etiquetas = [];
  if (Array.isArray(reporte.ia_etiquetas)) {
    etiquetas = reporte.ia_etiquetas;
  } else if (typeof reporte.ia_etiquetas === 'string' && reporte.ia_etiquetas.trim()) {
    try {
      const parsed = JSON.parse(reporte.ia_etiquetas);
      etiquetas = Array.isArray(parsed) ? parsed : [];
    } catch {
      etiquetas = [];
    }
  }
  const confianza = Number(reporte.ia_confianza);

  return {
    ...reporte,
    ia_etiquetas: etiquetas,
    ia_confianza: reporte.ia_confianza === null || reporte.ia_confianza === undefined
      ? null
      : (Number.isFinite(confianza) ? confianza : null),
    confianza_evidencia: reporte.confianza_evidencia === null || reporte.confianza_evidencia === undefined
      ? null
      : Number(reporte.confianza_evidencia),
    ia_procesado: reporte.ia_procesado === true ||
      reporte.ia_procesado === 'true' ||
      Boolean(Number(reporte.ia_procesado)),
  };
};


export const withLikedByMe = (items, likedSet) => {
  const list = Array.isArray(items) ? items : [items].filter(Boolean);
  const enriched = list.map((row) => ({ ...row, liked_by_me: likedSet.has(Number(row.id_reporte)) }));
  return Array.isArray(items) ? enriched : enriched[0];
};
export const publicAuthor = (user) => user ? { nombre: user.nombre, apellido: user.apellido, rol: user.rol, avatar_url: user.avatar_url ?? null } : null;
