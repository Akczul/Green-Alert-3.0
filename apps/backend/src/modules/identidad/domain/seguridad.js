export class CredencialRechazada extends Error {}
export class PasswordPolicyError extends Error {}

export const validarLongitudPassword = (password) => {
  if (typeof password !== 'string' || !password.trim() || [...password].length < 15) {
    throw new PasswordPolicyError('La contrasena debe tener al menos 15 caracteres.');
  }
};

export const normalizarParaLista = (password) => password.normalize('NFKC').trim().toLowerCase();

export const validarSesion = (claims, state) => {
  if (!claims?.sid || !Number.isInteger(claims.ver) || !state ||
      Number(state.activo) !== 1 || state.deleted_at ||
      Number(state.id_usuario) !== Number(claims.sub) ||
      Number(state.auth_version) !== claims.ver ||
      Number(state.session_auth_version) !== claims.ver ||
      state.rol !== claims.rol ||
      Number(state.id_entidad || 0) !== Number(claims.id_entidad || 0)) {
    throw new CredencialRechazada('token inválido o expirado.');
  }
  return claims;
};
