export function createSnapshots({ pool }) {
  return {
    async risk(from, to) {
      const [rows] = await pool.execute(`SELECT uuid AS report_uuid, tipo_contaminacion, subcategoria,
        nivel_severidad, latitud, longitud, municipio, departamento, created_at FROM reportes
        WHERE deleted_at IS NULL AND estado IN ('en_proceso','resuelto')
        AND latitud IS NOT NULL AND longitud IS NOT NULL AND created_at >= ? AND created_at <= ?
        ORDER BY id_reporte LIMIT 20001`, [from, to]);
      return rows.map(row => ({ ...row, latitud: Number(row.latitud), longitud: Number(row.longitud),
        created_at: new Date(row.created_at).toISOString() }));
    },
    async authorizedReport(user, id) {
      const clauses = ['r.id_reporte = ?', 'r.deleted_at IS NULL'];
      const values = [id];
      if (user.rol === 'entidad') {
        clauses.push('EXISTS (SELECT 1 FROM reporte_entidades re WHERE re.id_reporte=r.id_reporte AND re.id_entidad=?)');
        values.push(user.id_entidad ?? 0);
      } else if (!['admin', 'moderador'].includes(user.rol)) {
        clauses.push('r.id_usuario = ?'); values.push(user.sub);
      }
      const [rows] = await pool.execute(`SELECT r.uuid FROM reportes r WHERE ${clauses.join(' AND ')} LIMIT 1`, values);
      return rows[0] ?? null;
    },
  };
}
