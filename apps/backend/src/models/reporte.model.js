import { createMysqlReportesReader } from '../modules/reportes-lectura/adapters/outbound/mysql-reportes-reader.js';
import { normalizeReporteIA, normalizeReporteEstado } from '../modules/reportes-lectura/domain/reportes.js';
export { normalizeReporteIA, normalizeReporteEstado };
import { createMysqlReporteReader } from '../modules/zonas-riesgo/adapters/outbound/mysql-reporte-reader.js';
import pool from '../config/database.js';
import { tableExists } from '../config/schema-compat.js';
import { CATEGORIAS_FALLBACK } from './categoria-riesgo.model.js';
import { randomUUID } from 'crypto';

const reportesReadAdapter = createMysqlReportesReader({ pool });
const reporteAnaliticaReader = createMysqlReporteReader({ pool });

export const ESTADO_INICIAL_REPORTE = 'pendiente';
export const ESTADOS_REPORTE_PERMITIDOS = [
  'pendiente',
  'en_proceso',
  'resuelto',
  'rechazado',
];
export const ESTADOS_REPORTE_LABELS = [
  'pendiente',
  'en proceso',
  'resuelto',
  'rechazado',
];
export const NIVELES_SEVERIDAD_PERMITIDOS = [
  'bajo',
  'medio',
  'alto',
  'critico',
];

export const ReporteModel = {
  
    // Lista reportes con filtros opcionales y paginación
   
  findAll: async (arg) => reportesReadAdapter.findAll(arg),

  countAll: async (arg) => reportesReadAdapter.countAll(arg),

  // Exporta reportes con filtros opcionales (para CSV/JSON)
  findForExport: async ({
    estado,
    tipo_contaminacion,
    nivel_severidad,
    municipio,
    desde,
    hasta,
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
    if (desde) {
      conditions.push('r.created_at >= ?');
      params.push(desde);
    }
    if (hasta) {
      conditions.push('r.created_at <= ?');
      params.push(hasta);
    }

    const where = conditions.join(' AND ');

    const [rows] = await pool.execute(
      `SELECT r.titulo,
              r.tipo_contaminacion,
              r.subcategoria,
              r.nivel_severidad,
              r.estado,
              r.municipio,
              r.created_at,
              u.nombre AS autor_nombre,
              u.apellido AS autor_apellido
       FROM reportes r
       LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
       WHERE ${where}
       ORDER BY r.created_at DESC`,
      params
    );

    return rows.map(normalizeReporteIA);
  },

  
    // Busca un reporte por id_reporte 
   
  findById: async (arg) => reportesReadAdapter.findById(arg),

  
    //Busca los reportes creados por un usuario específico
   
  findByUsuario: async (...args) => reportesReadAdapter.findByUsuario(...args),

  
    // Crea un nuevo reporte, genera punto_geo automáticamente a partir de lat/lon
    
  create: async ({
    id_usuario,
    tipo_contaminacion,
    subcategoria = null,
    nivel_severidad = 'medio',
    titulo,
    descripcion = null,
    latitud,
    longitud,
    direccion = null,
    municipio = null,
    departamento = null,
    confianza_evidencia = null,
  }) => {
    const uuid = randomUUID();
    // Orden base esperado: tipo_contaminacion, estado, nivel_severidad.
    const hasCoords = latitud !== null && latitud !== undefined &&
                      longitud !== null && longitud !== undefined;

    if (hasCoords) {
      const [result] = await pool.execute(
        `INSERT INTO reportes
           (uuid, id_usuario, tipo_contaminacion, subcategoria, estado, nivel_severidad, titulo, descripcion,
            confianza_evidencia,
            latitud, longitud, direccion, municipio, departamento, punto_geo)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?,
            ?,
            ?, ?, ?, ?, ?,
            ST_GeomFromText(CONCAT('POINT(', ?, ' ', ?, ')'), 4326, 'axis-order=long-lat'))`,
        [
          uuid,
          id_usuario, tipo_contaminacion, subcategoria, ESTADO_INICIAL_REPORTE, nivel_severidad, titulo, descripcion,
          confianza_evidencia,
          latitud, longitud, direccion, municipio, departamento,
          longitud, latitud,
        ]
      );
      return result.insertId;
    } else {
      const [result] = await pool.execute(
        `INSERT INTO reportes
           (uuid, id_usuario, tipo_contaminacion, subcategoria, estado, nivel_severidad, titulo, descripcion,
            confianza_evidencia,
            latitud, longitud, direccion, municipio, departamento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid,
         id_usuario, tipo_contaminacion, subcategoria, ESTADO_INICIAL_REPORTE, nivel_severidad, titulo, descripcion,
         confianza_evidencia,
         null, null, direccion, municipio, departamento]
      );
      return result.insertId;
    }
  },

  
    //Actualiza campos permitidos de un reporte
  
  update: async (id_reporte, campos) => {
    const permitidos = [
      'estado', 'nivel_severidad', 'titulo', 'descripcion', 'subcategoria',
      'direccion', 'municipio', 'departamento', 'comentario_moderacion',
    ];

    const sets = [];
    const params = [];

    for (const key of permitidos) {
      if (Object.prototype.hasOwnProperty.call(campos, key)) {
        sets.push(`${key} = ?`);
        params.push(campos[key]);
      }
    }

    if (sets.length === 0) return false;

    params.push(id_reporte);

    const [result] = await pool.execute(
      `UPDATE reportes SET ${sets.join(', ')} WHERE id_reporte = ? AND deleted_at IS NULL`,
      params
    );
    return result.affectedRows > 0;
  },

  updateIaAnalysis: async (id_reporte, { etiquetas, confianza, procesado = true }) => {
    const [result] = await pool.execute(
      `UPDATE reportes
       SET ia_etiquetas = ?, ia_confianza = ?, ia_procesado = ?, updated_at = NOW()
       WHERE id_reporte = ? AND deleted_at IS NULL`,
      [
        JSON.stringify(etiquetas ?? []),
        confianza,
        procesado ? 1 : 0,
        id_reporte,
      ]
    );

    return result.affectedRows > 0;
  },

  updateConfianzaEvidencia: async (id_reporte, confianza_evidencia) => {
    const [result] = await pool.execute(
      `UPDATE reportes
       SET confianza_evidencia = ?, updated_at = NOW()
       WHERE id_reporte = ? AND deleted_at IS NULL`,
      [confianza_evidencia, id_reporte]
    );

    return result.affectedRows > 0;
  },

  
    // Incrementa el contador de vistas en 1
   
  incrementarVistas: async (id_reporte) => {
    await pool.execute(
      `UPDATE reportes SET vistas = vistas + 1 WHERE id_reporte = ? AND deleted_at IS NULL`,
      [id_reporte]
    );
  },

  registrarVistaUsuario: async (id_reporte, id_usuario) => {
    if (!id_usuario || !await tableExists('reporte_vistas')) {
      await ReporteModel.incrementarVistas(id_reporte);
      return true;
    }

    const [result] = await pool.execute(
      `INSERT IGNORE INTO reporte_vistas (id_reporte, id_usuario)
       VALUES (?, ?)`,
      [id_reporte, id_usuario]
    );

    if (result.affectedRows === 0) {
      return false;
    }

    await ReporteModel.incrementarVistas(id_reporte);
    return true;
  },

  
    // Soft-delete de un reporte
  
  remove: async (id_reporte) => {
    const [result] = await pool.execute(
      `UPDATE reportes SET deleted_at = NOW() WHERE id_reporte = ? AND deleted_at IS NULL`,
      [id_reporte]
    );
    return result.affectedRows > 0;
  },

  // Cuenta total de reportes de un usuario específico
  countByUsuario: async (...args) => reportesReadAdapter.countByUsuario(...args),

  // Estadísticas globales para Dashboard y Home
  getStats: async () => {
    const [[r]] = await pool.execute(
      `SELECT
         COUNT(*)                                                                          AS total_reportes,
         SUM(CASE WHEN MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW()) THEN 1 ELSE 0 END) AS reportes_este_mes,
         SUM(CASE WHEN estado='pendiente'    THEN 1 ELSE 0 END)                          AS pendientes,
         SUM(CASE WHEN estado='en_proceso'   THEN 1 ELSE 0 END)                          AS en_proceso,
         SUM(CASE WHEN estado='resuelto'     THEN 1 ELSE 0 END)                          AS resueltos,
         COUNT(DISTINCT CASE WHEN municipio IS NOT NULL AND municipio!='' THEN municipio END) AS municipios_activos,
         SUM(CASE WHEN estado = 'en_proceso' THEN 1 ELSE 0 END) AS con_seguimiento
       FROM reportes WHERE deleted_at IS NULL`
    );
    const [[u]] = await pool.execute(
      `SELECT COUNT(*) AS total_usuarios FROM usuarios WHERE activo=1 AND deleted_at IS NULL`
    );
    return { ...r, ...u };
  },

  // Conteos de reportes agrupados por categoria para analitica publica
  getStatsByCategoria: async () => {
    if (!await tableExists('categorias_riesgo')) {
      const [rows] = await pool.execute(
        `SELECT
           tipo_contaminacion AS codigo,
           COUNT(*) AS total_reportes,
           SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
           SUM(CASE WHEN estado = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso,
           SUM(CASE WHEN estado = 'resuelto' THEN 1 ELSE 0 END) AS resueltos,
           SUM(CASE WHEN estado = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
           SUM(CASE WHEN nivel_severidad = 'bajo' THEN 1 ELSE 0 END) AS bajo,
           SUM(CASE WHEN nivel_severidad = 'medio' THEN 1 ELSE 0 END) AS medio,
           SUM(CASE WHEN nivel_severidad = 'alto' THEN 1 ELSE 0 END) AS alto,
           SUM(CASE WHEN nivel_severidad = 'critico' THEN 1 ELSE 0 END) AS critico
         FROM reportes
         WHERE deleted_at IS NULL
         GROUP BY tipo_contaminacion`
      );
      const statsByCodigo = new Map(rows.map((row) => [row.codigo, row]));

      return CATEGORIAS_FALLBACK
        .filter((categoria) => categoria.activo)
        .map((categoria) => ({
          ...categoria,
          total_reportes: 0,
          pendientes: 0,
          en_proceso: 0,
          resueltos: 0,
          rechazados: 0,
          bajo: 0,
          medio: 0,
          alto: 0,
          critico: 0,
          ...(statsByCodigo.get(categoria.codigo) ?? {}),
        }))
        .sort((a, b) => Number(b.total_reportes) - Number(a.total_reportes) || a.nombre.localeCompare(b.nombre));
    }

    const [rows] = await pool.execute(
      `SELECT
         cr.codigo,
         cr.nombre,
         cr.icono,
         cr.color_hex,
         COUNT(r.id_reporte) AS total_reportes,
         SUM(CASE WHEN r.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
         SUM(CASE WHEN r.estado = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso,
         SUM(CASE WHEN r.estado = 'resuelto' THEN 1 ELSE 0 END) AS resueltos,
         SUM(CASE WHEN r.estado = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
         SUM(CASE WHEN r.nivel_severidad = 'bajo' THEN 1 ELSE 0 END) AS bajo,
         SUM(CASE WHEN r.nivel_severidad = 'medio' THEN 1 ELSE 0 END) AS medio,
         SUM(CASE WHEN r.nivel_severidad = 'alto' THEN 1 ELSE 0 END) AS alto,
         SUM(CASE WHEN r.nivel_severidad = 'critico' THEN 1 ELSE 0 END) AS critico
       FROM categorias_riesgo cr
       LEFT JOIN reportes r ON r.tipo_contaminacion = cr.codigo
        AND r.deleted_at IS NULL
       WHERE cr.activo = 1
       GROUP BY cr.id_categoria, cr.codigo, cr.nombre, cr.icono, cr.color_hex
       ORDER BY total_reportes DESC, cr.nombre ASC`
    );

    return rows;
  },

  // Timeline de reportes agrupado por semana o mes
  getStatsTimeline: async ({ bucket = 'week', limit = 12 } = {}) => {
    const safeLimit = Math.max(1, Math.min(60, parseInt(limit, 10) || 12));
    const isMonth = bucket === 'month';

    const periodKey = isMonth
      ? "DATE_FORMAT(r.created_at, '%Y-%m')"
      : "CONCAT(YEARWEEK(r.created_at, 3), '')";
    const periodLabel = isMonth
      ? "DATE_FORMAT(r.created_at, '%Y-%m')"
      : "CONCAT(YEAR(DATE_SUB(DATE(r.created_at), INTERVAL WEEKDAY(r.created_at) DAY)), '-W', LPAD(WEEK(r.created_at, 3), 2, '0'))";
    const periodStart = isMonth
      ? "DATE_FORMAT(r.created_at, '%Y-%m-01')"
      : "DATE_FORMAT(DATE_SUB(DATE(r.created_at), INTERVAL WEEKDAY(r.created_at) DAY), '%Y-%m-%d')";

    const [rows] = await pool.execute(
      `SELECT *
       FROM (
         SELECT
           ${periodKey} AS periodo_key,
           ${periodLabel} AS periodo,
           ${periodStart} AS periodo_inicio,
           COUNT(*) AS total_reportes,
           SUM(CASE WHEN r.nivel_severidad = 'bajo' THEN 1 ELSE 0 END) AS bajo,
           SUM(CASE WHEN r.nivel_severidad = 'medio' THEN 1 ELSE 0 END) AS medio,
           SUM(CASE WHEN r.nivel_severidad = 'alto' THEN 1 ELSE 0 END) AS alto,
           SUM(CASE WHEN r.nivel_severidad = 'critico' THEN 1 ELSE 0 END) AS critico,
           SUM(CASE WHEN r.estado = 'resuelto' THEN 1 ELSE 0 END) AS resueltos
         FROM reportes r
         WHERE r.deleted_at IS NULL
         GROUP BY periodo_key, periodo, periodo_inicio
         ORDER BY periodo_key DESC
         LIMIT ${safeLimit}
       ) timeline
       ORDER BY periodo_key ASC`
    );

    return rows;
  },

  // Puntos georreferenciados para heatmap con intensidad derivada de severidad
  getHeatmapPoints: async () => {
    const [rows] = await pool.execute(
      `SELECT
         r.id_reporte,
         r.tipo_contaminacion,
         r.nivel_severidad,
         r.estado,
         r.municipio,
         r.latitud,
         r.longitud,
         CASE r.nivel_severidad
           WHEN 'critico' THEN 1.0
           WHEN 'alto' THEN 0.75
           WHEN 'medio' THEN 0.5
           WHEN 'bajo' THEN 0.25
           ELSE 0.25
         END AS intensidad,
         r.created_at
       FROM reportes r
       WHERE r.deleted_at IS NULL
        AND r.latitud IS NOT NULL
        AND r.longitud IS NOT NULL
       ORDER BY r.created_at DESC`
    );

    return rows;
  },

  // Compatibilidad con consumidores heredados; el SQL vive en el adaptador.
  findParaPrediccion: async (params) => reporteAnaliticaReader.findParaPrediccion(params),

  findTrending: async (arg) => reportesReadAdapter.findTrending(arg),

  getStatsIA: async ({ dias = 30 } = {}) => {
    const safeDias = Math.max(1, Math.min(365, parseInt(dias, 10) || 30));

    const [[summary]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_procesados,
         ROUND(AVG(COALESCE(ia_confianza, 0)), 0) AS confianza_promedio,
         SUM(CASE WHEN ia_confianza >= 75 THEN 1 ELSE 0 END) AS confianza_alta,
         SUM(CASE WHEN ia_confianza >= 50 AND ia_confianza < 75 THEN 1 ELSE 0 END) AS confianza_media,
         SUM(CASE WHEN ia_confianza < 50 THEN 1 ELSE 0 END) AS confianza_baja
       FROM reportes
       WHERE deleted_at IS NULL
         AND ia_procesado = 1
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDias} DAY)`
    );

    const [topEtiquetas] = await pool.execute(
      `SELECT tipo_contaminacion AS label,
              tipo_contaminacion AS nombre,
              COUNT(*) AS count
       FROM reportes
       WHERE deleted_at IS NULL
         AND ia_procesado = 1
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDias} DAY)
       GROUP BY tipo_contaminacion
       ORDER BY count DESC
       LIMIT 8`
    );

    const [timeline] = await pool.execute(
      `SELECT DATE(created_at) AS fecha,
              COUNT(*) AS procesados
       FROM reportes
       WHERE deleted_at IS NULL
         AND ia_procesado = 1
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDias} DAY)
       GROUP BY DATE(created_at)
       ORDER BY fecha ASC`
    );

    const totalProcesados = Number(summary?.total_procesados) || 0;
    return {
      total_procesados: totalProcesados,
      accuracy: {
        aceptadas: totalProcesados,
        modificadas: 0,
        porcentaje: totalProcesados > 0 ? 100 : 0,
      },
      confianza: {
        promedio: Number(summary?.confianza_promedio) || 0,
        distribucion: {
          baja: Number(summary?.confianza_baja) || 0,
          media: Number(summary?.confianza_media) || 0,
          alta: Number(summary?.confianza_alta) || 0,
        },
      },
      top_etiquetas: topEtiquetas,
      timeline: timeline.map((row) => ({
        ...row,
        fecha: row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : row.fecha,
      })),
    };
  },

  getZonasRiesgo: async ({ dias = 30, min_score = 30 } = {}) => {
    const safeDias = Math.max(1, Math.min(365, parseInt(dias, 10) || 30));
    const safeMinScore = Math.max(0, Math.min(100, Number(min_score) || 0));

    const [rows] = await pool.execute(
      `SELECT
         MIN(id_reporte) AS id,
         municipio,
         departamento,
         tipo_contaminacion AS tipo_dominante,
         subcategoria AS subcategoria_dominante,
         AVG(latitud) AS lat,
         AVG(longitud) AS lng,
         COUNT(*) AS n_reportes,
         AVG(CASE nivel_severidad
           WHEN 'critico' THEN 4
           WHEN 'alto' THEN 3
           WHEN 'medio' THEN 2
           WHEN 'bajo' THEN 1
           ELSE 1
         END) AS severidad_promedio,
         MAX(created_at) AS ultimo_reporte
       FROM reportes
       WHERE deleted_at IS NULL
         AND latitud IS NOT NULL
         AND longitud IS NOT NULL
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${safeDias} DAY)
       GROUP BY municipio, departamento, tipo_contaminacion, subcategoria
       HAVING n_reportes > 0
       ORDER BY n_reportes DESC, severidad_promedio DESC
       LIMIT 30`
    );

    return rows
      .map((row) => {
        const score = Math.min(100, Math.round((Number(row.n_reportes) * 18) + (Number(row.severidad_promedio) * 14)));
        const nivel = score >= 80 ? 'critico' : score >= 60 ? 'alto' : score >= 35 ? 'medio' : 'bajo';
        return {
          id: `${row.id}-${row.tipo_dominante}`,
          zona_id: `${row.id}-${row.tipo_dominante}`,
          municipio: row.municipio,
          departamento: row.departamento,
          tipo_dominante: row.tipo_dominante,
          subcategoria_dominante: row.subcategoria_dominante,
          centro: {
            lat: Number(row.lat),
            lng: Number(row.lng),
          },
          n_reportes: Number(row.n_reportes),
          severidad_promedio: Number(row.severidad_promedio),
          ultimo_reporte: row.ultimo_reporte,
          score,
          nivel,
        };
      })
      .filter((zona) => zona.score >= safeMinScore);
  },

  getAlertasPredictivas: async ({ nivel_min = 'medio', tipo, limite = 10, ...params } = {}) => {
    const nivelRank = { bajo: 1, medio: 2, alto: 3, critico: 4 };
    const minRank = nivelRank[nivel_min] || 2;
    const zonas = await ReporteModel.getZonasRiesgo({
      dias: params.dias || 30,
      min_score: 0,
    });
    const safeLimit = Math.max(1, Math.min(50, parseInt(limite, 10) || 10));

    return zonas
      .filter((zona) => (nivelRank[zona.nivel] || 1) >= minRank)
      .filter((zona) => !tipo || zona.tipo_dominante === tipo)
      .slice(0, safeLimit);
  },

};
