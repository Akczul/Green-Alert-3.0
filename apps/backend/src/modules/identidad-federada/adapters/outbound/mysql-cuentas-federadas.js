import { FederacionRechazada } from '../../domain/federacion.js';

// MySQL es la fuente de verdad de cuentas y vínculos federados (proveedor + sub únicos).
export const createMysqlCuentasFederadas = ({ pool, uuid, usuarioModel }) => ({
  async findLinked(provider, subject) {
    const [rows] = await pool.execute(
      `SELECT u.* FROM federated_identities f JOIN usuarios u ON u.id_usuario = f.id_usuario
       WHERE f.provider = ? AND f.subject = ? AND u.deleted_at IS NULL LIMIT 1`, [provider, subject]);
    return rows[0] ?? null;
  },
  findByEmail: (email) => usuarioModel.findByEmail(email),
  async link(provider, subject, idUsuario, email) {
    try {
      await pool.execute('INSERT INTO federated_identities (provider, subject, id_usuario, email) VALUES (?, ?, ?, ?)',
        [provider, subject, idUsuario, email]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new FederacionRechazada('Esta identidad ya está vinculada a otra cuenta.', 409);
      throw error;
    }
  },
  async createFederated(perfil, provider) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO usuarios (uuid, nombre, apellido, email, password_hash, rol, email_verificado)
         VALUES (?, ?, ?, ?, ?, 'ciudadano', ?)`,
        [uuid(), perfil.nombre, perfil.apellido, perfil.email, `oauth:${provider}`, perfil.emailVerificado ? 1 : 0]);
      return usuarioModel.findById(result.insertId);
    } catch (error) {
      // Dos altas simultáneas con el mismo correo: el índice UNIQUE decide y se informa un conflicto.
      if (error.code === 'ER_DUP_ENTRY') throw new FederacionRechazada('Ya existe una cuenta con ese correo.', 409);
      throw error;
    }
  },
  touch: (idUsuario) => usuarioModel.updateUltimoAcceso(idUsuario),
});
