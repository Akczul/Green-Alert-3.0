// Solo fixtures aislados de los runners: no se usa en producción ni cambia expectativas históricas.
import { randomUUID, createHash } from 'node:crypto';
export const seedSessionClaims = async (connection, subject) => {
  const [[user]] = await connection.execute('SELECT auth_version, id_entidad FROM usuarios WHERE id_usuario = ?', [subject.sub]);
  const sid = randomUUID(), ver = Number(user?.auth_version || 0);
  if (user) await connection.execute(
    'INSERT INTO refresh_tokens (id_usuario, token_hash, session_id, auth_version, expires_at) VALUES (?, ?, ?, ?, ?)',
    [subject.sub, createHash('sha256').update(sid).digest('hex'), sid, ver, '2030-01-01 00:00:00']);
  return { ...subject, id_entidad: user?.id_entidad ?? null, sid, ver };
};
