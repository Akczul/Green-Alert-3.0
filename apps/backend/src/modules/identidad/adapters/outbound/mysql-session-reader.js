// La autoridad de sesión se consulta sin caché para aplicar revocaciones en la siguiente petición.
export const createMysqlSessionReader = ({ pool }) => ({
  async findState(id) {
    const [rows] = await pool.execute('SELECT id_usuario, rol, id_entidad, activo, deleted_at, auth_version FROM usuarios WHERE id_usuario = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  },
  async findActive(sid, userId) {
    const [rows] = await pool.execute(
      `SELECT u.id_usuario, u.rol, u.id_entidad, u.activo, u.deleted_at, u.auth_version,
              rt.auth_version AS session_auth_version
       FROM refresh_tokens rt INNER JOIN usuarios u ON u.id_usuario = rt.id_usuario
       WHERE rt.session_id = ? AND rt.id_usuario = ?
         AND rt.revoked_at IS NULL AND rt.expires_at > NOW() LIMIT 1`, [sid, userId]);
    return rows[0] ?? null;
  },
});
