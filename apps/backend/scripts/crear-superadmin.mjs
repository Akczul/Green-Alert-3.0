// Inicialización controlada del PRIMER superadministrador (no existe ruta pública para hacerlo).
// Uso (operador con acceso al servidor):  node scripts/crear-superadmin.mjs correo@dominio
// Requisitos: la cuenta ya existe (registro normal con contraseña robusta), está activa y la
// migración 024 está aplicada. Si ya hay un superadministrador activo, se rechaza: los siguientes
// se asignan desde el panel por un superadministrador, con auditoría.
// Después de promoverla, enrolar MFA:  node scripts/provision-admin-mfa.mjs ID
import pool from '../src/config/database.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Uso: node scripts/crear-superadmin.mjs correo@dominio');

const conn = await pool.getConnection();
try {
  const [[column]] = await conn.query(
    "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'nivel_admin'");
  if (!Number(column.n)) throw new Error('Falta la migración 024_admin_hierarchy.sql.');
  await conn.beginTransaction();
  const [existing] = await conn.execute(
    "SELECT id_usuario FROM usuarios WHERE rol = 'admin' AND nivel_admin = 'global' AND deleted_at IS NULL FOR UPDATE");
  if (existing.length) throw new Error('Ya existe un superadministrador. Asigna otros desde el panel de control global.');
  const [users] = await conn.execute(
    'SELECT id_usuario, rol, id_entidad, nivel_admin, ambito_entidad FROM usuarios WHERE email = ? AND activo = 1 AND deleted_at IS NULL FOR UPDATE', [email]);
  if (!users.length) throw new Error('No existe una cuenta activa con ese correo. Regístrala primero.');
  const [user] = users;
  await conn.execute(
    "UPDATE usuarios SET rol = 'admin', nivel_admin = 'global', ambito_entidad = NULL, id_entidad = NULL, auth_version = auth_version + 1 WHERE id_usuario = ?",
    [user.id_usuario]);
  await conn.execute(
    "INSERT INTO admin_audit (actor_id, action, target_id, before_state, after_state) VALUES (NULL, 'inicializar_superadmin', ?, ?, ?)",
    [user.id_usuario, JSON.stringify(user), JSON.stringify({ rol: 'admin', nivel_admin: 'global' })]);
  await conn.commit();
  console.log(`Superadministrador inicial: usuario ${user.id_usuario}. Enrola MFA con: node scripts/provision-admin-mfa.mjs ${user.id_usuario}`);
} catch (error) {
  await conn.rollback().catch(() => {});
  throw error;
} finally {
  conn.release();
  await pool.end();
}
