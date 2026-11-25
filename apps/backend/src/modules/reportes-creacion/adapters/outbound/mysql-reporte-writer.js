import { ESTADO_INICIAL_REPORTE } from '../../domain/validaciones.js';

// SQL original, pool y generador UUID inyectados. Cada sentencia conserva autocommit.
export const createMysqlReporteWriter = ({ pool, randomUUID }) => ({
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

});
