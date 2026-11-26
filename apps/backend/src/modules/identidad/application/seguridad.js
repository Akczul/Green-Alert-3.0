import { CredencialRechazada, PasswordPolicyError, normalizarParaLista, validarLongitudPassword, validarSesion } from '../domain/seguridad.js';

/** Puertos: tokens.verify; sesiones.findActive/create; usuarios.findState;
 * identificadores.next; passwords.isBlocked. Sin framework, SQL ni entorno. */
export const createSeguridad = ({ tokens, sesiones, usuarios, identificadores, passwords }) => ({
  revocarSesion: (hash) => sesiones.revokeByHash(hash),
  revocarTodas: (userId) => sesiones.revokeAllForUser(userId),
  async verificarAcceso(token) {
    let claims;
    try { claims = tokens.verify(token); }
    catch { throw new CredencialRechazada('token inválido o expirado.'); }
    if (!claims.sid || !Number.isInteger(claims.ver)) throw new CredencialRechazada('token inválido o expirado.');
    return validarSesion(claims, await sesiones.findActive(claims.sid, claims.sub));
  },
  async iniciarSesion(userId, metadata) {
    const state = await usuarios.findState(userId);
    if (!state || Number(state.activo) !== 1 || state.deleted_at) throw new CredencialRechazada('Cuenta desactivada. Contacta al administrador.');
    const sessionId = identificadores.next();
    await sesiones.create({ ...metadata, id_usuario: userId, session_id: sessionId, auth_version: Number(state.auth_version) });
    return { sid: sessionId, ver: Number(state.auth_version), rol: state.rol, id_entidad: state.id_entidad ?? null };
  },
  async validarNuevaPassword(password) {
    validarLongitudPassword(password);
    if (await passwords.isBlocked(normalizarParaLista(password))) {
      throw new PasswordPolicyError('La contrasena es comun o conocida como insegura. Elige una frase diferente.');
    }
  },
});
