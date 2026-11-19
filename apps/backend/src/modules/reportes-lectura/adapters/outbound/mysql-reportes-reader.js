import { normalizeReporteIA, normalizeReporteEstado } from '../../domain/reportes.js';

const buildReportesFilter = ({
  estado,
  tipo_contaminacion,
  nivel_severidad,
  municipio,
} = {}) => {
  const conditions = ['r.deleted_at IS NULL'];
  const params = [];

  if (estado) {
    conditions.push('r.estado = ?');
    params.push(normalizeReporteEstado(estado));
  }
  if (tipo_contaminacion) {
    conditions.push('r.tipo_contaminacion = ?');
    params.push(tipo_contaminacion);
  }
  if (nivel_severidad) {
    conditions.push('r.nivel_severidad = ?');
    params.push(nivel_severidad);
  }
  if (municipio) {
    conditions.push('r.municipio = ?');
    params.push(municipio);
  }

  return {
    where: conditions.join(' AND '),
    params,
  };
};

const ESTADO_ATENCION_RESPONSABLE_SQL = `
              (
                SELECT CASE
                  WHEN SUM(CASE WHEN re.estado_atencion = 'en_atencion' THEN 1 ELSE 0 END) > 0 THEN 'en_atencion'
                  WHEN SUM(CASE WHEN re.estado_atencion = 'atendido' THEN 1 ELSE 0 END) > 0 THEN 'atendido'
                  WHEN SUM(CASE WHEN re.estado_atencion = 'cerrado' THEN 1 ELSE 0 END) > 0 THEN 'cerrado'
                  ELSE NULL
                END
                FROM reporte_entidades re
                WHERE re.id_reporte = r.id_reporte
              ) AS estado_atencion_responsable`;


export const createMysqlReportesReader = ({ pool }) => ({
  findAll: async ({
    estado,
    tipo_contaminacion,
    nivel_severidad,
    municipio,
    limit = 20,
    offset = 0,
  } = {}) => {
    const { where, params } = buildReportesFilter({
      estado,
      tipo_contaminacion,
      nivel_severidad,
      municipio,
    });
    const safeLimit  = Math.max(1, Math.min(100, parseInt(limit,  10) || 20));
    const safeOffset = Math.max(0,               parseInt(offset, 10) || 0);

    const [rows] = await pool.execute(
      `SELECT r.id_reporte, r.uuid, r.id_usuario,
              r.tipo_contaminacion, r.subcategoria, r.estado, r.nivel_severidad,
              r.titulo, r.descripcion,
              r.latitud, r.longitud, r.direccion, r.municipio, r.departamento,
              ${ESTADO_ATENCION_RESPONSABLE_SQL},
              r.ia_etiquetas, r.ia_confianza, r.ia_procesado, r.confianza_evidencia,
              r.votos_relevancia, r.vistas,
              r.created_at, r.updated_at,
              u.nombre AS autor_nombre, u.apellido AS autor_apellido, u.rol AS autor_rol
       FROM reportes r
       LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );
    return rows.map(normalizeReporteIA);
  },

  countAll: async ({
    estado,
    tipo_contaminacion,
    nivel_severidad,
    municipio,
  } = {}) => {
    const { where, params } = buildReportesFilter({
      estado,
      tipo_contaminacion,
      nivel_severidad,
      municipio,
    });

    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM reportes r
       WHERE ${where}`,
      params
    );

    return Number(row?.total) || 0;
  },

  findById: async (id_reporte) => {
    const [rows] = await pool.execute(
      `SELECT r.id_reporte, r.uuid, r.id_usuario,
              r.tipo_contaminacion, r.subcategoria, r.estado, r.nivel_severidad,
              r.titulo, r.descripcion,
              r.latitud, r.longitud, r.direccion, r.municipio, r.departamento,
              ${ESTADO_ATENCION_RESPONSABLE_SQL},
              r.ia_etiquetas, r.ia_confianza, r.ia_procesado, r.confianza_evidencia,
              r.votos_relevancia, r.vistas,
              r.comentario_moderacion,
              r.created_at, r.updated_at
       FROM reportes r
       WHERE r.id_reporte = ? AND r.deleted_at IS NULL
       LIMIT 1`,
      [id_reporte]
    );
    return normalizeReporteIA(rows[0] ?? null);
  },

  findByUsuario: async (id_usuario, { limit = 20, offset = 0, estado = null, nivel_severidad = null } = {}) => {
    const safeLimit  = Math.max(1, Math.min(100, parseInt(limit,  10) || 20));
    const safeOffset = Math.max(0,               parseInt(offset, 10) || 0);
    const conditions = ['r.id_usuario = ?', 'r.deleted_at IS NULL'];
    const params = [id_usuario];
    if (estado)           { conditions.push('r.estado = ?');           params.push(estado); }
    if (nivel_severidad)  { conditions.push('r.nivel_severidad = ?');  params.push(nivel_severidad); }
    const where = conditions.join(' AND ');
    const [rows] = await pool.execute(
      `SELECT r.id_reporte, r.uuid, r.tipo_contaminacion, r.subcategoria, r.estado, r.nivel_severidad,
              r.titulo, r.descripcion, r.municipio, r.departamento,
              ${ESTADO_ATENCION_RESPONSABLE_SQL},
              r.ia_etiquetas, r.ia_confianza, r.ia_procesado, r.confianza_evidencia,
              r.votos_relevancia, r.vistas,
              r.created_at, r.updated_at,
              (SELECT e.url_archivo FROM evidencias e
               WHERE e.id_reporte = r.id_reporte AND e.tipo_archivo = 'imagen'
               ORDER BY e.orden ASC, e.created_at ASC LIMIT 1) AS primera_imagen
       FROM reportes r
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );
    return rows.map(normalizeReporteIA);
  },

  countByUsuario: async (id_usuario, { estado = null, nivel_severidad = null } = {}) => {
    const conditions = ['id_usuario = ?', 'deleted_at IS NULL'];
    const params = [id_usuario];
    if (estado)           { conditions.push('estado = ?');           params.push(estado); }
    if (nivel_severidad)  { conditions.push('nivel_severidad = ?');  params.push(nivel_severidad); }
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM reportes WHERE ${conditions.join(' AND ')}`,
      params
    );
    return row?.total ?? 0;
  },

  findTrending: async ({ limit = 12 } = {}) => {
    const safeLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 12));
    const [rows] = await pool.execute(
      `SELECT r.id_reporte, r.uuid, r.id_usuario,
              r.tipo_contaminacion, r.subcategoria, r.estado, r.nivel_severidad,
              r.titulo, r.descripcion,
              r.latitud, r.longitud, r.direccion, r.municipio, r.departamento,
              r.ia_etiquetas, r.ia_confianza, r.ia_procesado, r.confianza_evidencia,
              r.votos_relevancia, r.vistas,
              r.created_at, r.updated_at,
              (r.votos_relevancia * 3 + r.vistas + GREATEST(0, 30 - TIMESTAMPDIFF(DAY, r.created_at, NOW()))) AS trending_score
       FROM reportes r
       WHERE r.deleted_at IS NULL
       ORDER BY trending_score DESC, r.created_at DESC
       LIMIT ${safeLimit}`
    );

    return rows.map((row) => ({
      ...row,
      trending_score: Number(row.trending_score) || 0,
    }));
  },
});
