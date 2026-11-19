// Conserva selección, filtros parametrizados, orden y tipos de mysql2.
// Se leen columnas decimales; no se reinterpretan POINT ni sus ejes.
/** @returns {import('../../application/ports.js').ReporteAnaliticaReader} */
export const createMysqlReporteReader = ({ pool }) => ({
  findParaPrediccion: async ({ desde, tipo } = {}) => {
    const conditions = [
      'r.deleted_at IS NULL',
      'r.latitud IS NOT NULL',
      'r.longitud IS NOT NULL',
      "r.estado IN ('en_proceso', 'resuelto')",
    ];
    const params = [];

    if (desde) {
      conditions.push('r.created_at >= ?');
      params.push(desde);
    }

    if (tipo) {
      conditions.push('r.tipo_contaminacion = ?');
      params.push(tipo);
    }

    const [rows] = await pool.execute(
      `SELECT
         r.id_reporte,
         r.tipo_contaminacion,
         r.subcategoria,
         r.estado,
         r.nivel_severidad,
         r.latitud,
         r.longitud,
         r.municipio,
         r.departamento,
         r.created_at
       FROM reportes r
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC`,
      params
    );

    return rows;
  },
});
