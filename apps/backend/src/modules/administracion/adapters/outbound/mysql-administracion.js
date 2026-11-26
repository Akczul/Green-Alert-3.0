import { Conflicto } from '../../domain/jerarquia.js';

// Adaptador MySQL del módulo administrativo. MySQL es la fuente de verdad de usuarios, roles y auditoría.
// Recibe pool y funciones de compatibilidad por fábrica; no lee entorno ni conoce Express.
const ACCIONES = {
  cambiar_rol: (cambio) => [
    `UPDATE usuarios SET rol = ?, id_entidad = ?, nivel_admin = ?, ambito_entidad = ?,
       auth_version = auth_version + 1, updated_at = NOW()
     WHERE id_usuario = ? AND deleted_at IS NULL`,
    [cambio.rol, cambio.id_entidad, cambio.nivel_admin, cambio.ambito_entidad],
  ],
  activar: () => ['UPDATE usuarios SET activo = 1, auth_version = auth_version + 1, updated_at = NOW() WHERE id_usuario = ? AND deleted_at IS NULL', []],
  desactivar: () => ['UPDATE usuarios SET activo = 0, auth_version = auth_version + 1, updated_at = NOW() WHERE id_usuario = ? AND deleted_at IS NULL', []],
  eliminar: () => ['UPDATE usuarios SET deleted_at = NOW(), auth_version = auth_version + 1 WHERE id_usuario = ? AND deleted_at IS NULL', []],
};
// Sin la migración 024 el rol se actualiza como antes (sin nivel ni ámbito).
const LEGACY_ROL = (cambio) => [
  `UPDATE usuarios SET auth_version = auth_version + IF(rol <> ? OR NOT (id_entidad <=> ?), 1, 0), rol = ?, id_entidad = ?, updated_at = NOW()
   WHERE id_usuario = ? AND deleted_at IS NULL`,
  [cambio.rol, cambio.id_entidad, cambio.rol, cambio.id_entidad],
];

export const createMysqlAdministracion = ({ pool, jerarquiaDisponible, usuarioModel, entidadModel, correlationId = () => null }) => {
  const scopeSql = (alcance) => {
    if (!alcance) return { where: [], params: [] };
    const where = [`rol IN (${alcance.roles.map(() => '?').join(', ')})`];
    const params = [...alcance.roles];
    if (alcance.id_entidad !== null) { where.push('id_entidad = ?'); params.push(alcance.id_entidad); }
    return { where, params };
  };
  const filtrosSql = ({ rol, activo, search }, alcance) => {
    const where = ['deleted_at IS NULL'], params = [];
    if (rol) { where.push('rol = ?'); params.push(rol); }
    if (activo !== undefined && activo !== null) { where.push('activo = ?'); params.push(activo); }
    if (search) { const like = `%${search}%`; where.push('(nombre LIKE ? OR apellido LIKE ? OR email LIKE ?)'); params.push(like, like, like); }
    const scope = scopeSql(alcance);
    return { where: [...where, ...scope.where].join(' AND '), params: [...params, ...scope.params] };
  };

  const usuarios = {
    async findState(id) {
      const enabled = await jerarquiaDisponible();
      const [rows] = await pool.execute(
        enabled
          ? 'SELECT id_usuario, rol, id_entidad, nivel_admin, ambito_entidad, activo FROM usuarios WHERE id_usuario = ? AND deleted_at IS NULL LIMIT 1'
          : 'SELECT id_usuario, rol, id_entidad, activo FROM usuarios WHERE id_usuario = ? AND deleted_at IS NULL LIMIT 1',
        [id]);
      const row = rows[0];
      if (!row) return null;
      // Compatibilidad: sin migración 024 todos los administradores mantienen el control global previo.
      return enabled ? row : { ...row, nivel_admin: row.rol === 'admin' ? 'global' : null, ambito_entidad: null };
    },
    findDetails: (id) => usuarioModel.findByIdWithDetails(id),
    async list({ limit, offset, ...filtros }, alcance) {
      if (!alcance) return usuarioModel.findAll({ ...filtros, limit, offset });
      const { where, params } = filtrosSql(filtros, alcance);
      const select = await usuarioModel._publicUserSelect();
      const [rows] = await pool.execute(
        `SELECT ${select} FROM usuarios WHERE ${where} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, params);
      return rows;
    },
    async count(filtros, alcance) {
      if (!alcance) return usuarioModel.countAll(filtros);
      const { where, params } = filtrosSql(filtros, alcance);
      const [rows] = await pool.execute(`SELECT COUNT(*) AS total FROM usuarios WHERE ${where}`, params);
      return rows[0]?.total ?? 0;
    },
  };

  const cambios = {
    // Cambio, comprobación del último superadministrador y auditoría en una sola transacción.
    async aplicar({ actorId, targetId, accion, cambio, anterior, protegerUltimoSuperadmin }) {
      const enabled = await jerarquiaDisponible();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        if (enabled && protegerUltimoSuperadmin) {
          // FOR UPDATE serializa degradaciones simultáneas entre superadministradores.
          const [rows] = await conn.execute(
            "SELECT id_usuario FROM usuarios WHERE rol = 'admin' AND nivel_admin = 'global' AND activo = 1 AND deleted_at IS NULL FOR UPDATE");
          if (!rows.some((row) => Number(row.id_usuario) !== Number(targetId))) {
            throw new Conflicto('Debe existir al menos otro superadministrador activo.');
          }
        }
        const [sql, values] = accion === 'cambiar_rol' && !enabled ? LEGACY_ROL(cambio) : ACCIONES[accion](cambio);
        const [result] = await conn.execute(sql, [...values, targetId]);
        if (result.affectedRows === 0) { await conn.rollback(); return false; }
        if (enabled) {
          await conn.execute(
            'INSERT INTO admin_audit (actor_id, action, target_id, before_state, after_state, correlation_id) VALUES (?, ?, ?, ?, ?, ?)',
            [actorId, accion, targetId, JSON.stringify(anterior ?? null), JSON.stringify(cambio ?? null), correlationId()]);
        }
        await conn.commit();
        return true;
      } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
      } finally {
        conn.release();
      }
    },
  };

  const entidades = {
    async isActive(id) {
      const entidad = await entidadModel.findById(id);
      return Boolean(entidad && entidad.activo);
    },
  };

  const auditoria = {
    async list({ limit, offset, actorId, targetId }) {
      const where = [], params = [];
      if (actorId) { where.push('actor_id = ?'); params.push(actorId); }
      if (targetId) { where.push('target_id = ?'); params.push(targetId); }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [items] = await pool.execute(
        `SELECT id, occurred_at, actor_id, action, target_id, before_state, after_state, correlation_id
         FROM admin_audit ${clause} ORDER BY id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, params);
      const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM admin_audit ${clause}`, params);
      return { items, total, limit, offset };
    },
  };

  return { usuarios, cambios, entidades, auditoria };
};
