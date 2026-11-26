// Reglas puras del inicio de sesión federado con OpenID Connect (sin red, SQL ni entorno).
// OIDC identifica al usuario (id_token firmado); el ROL siempre se asigna en GreenAlert.

export class FederacionRechazada extends Error {
  constructor(message, statusCode = 401) { super(message); this.statusCode = statusCode; }
}

const SKEW_SECONDS = 120;

/** Valida claims de un id_token ya verificado criptográficamente. */
export const validarClaims = (claims, { issuer, audience, nonce, nowSeconds }) => {
  if (!claims || typeof claims !== 'object') throw new FederacionRechazada('id_token inválido.');
  if (claims.iss !== issuer) throw new FederacionRechazada('Emisor OIDC no esperado.');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(audience)) throw new FederacionRechazada('Audiencia OIDC no esperada.');
  if (aud.length > 1 && claims.azp !== audience) throw new FederacionRechazada('Parte autorizada OIDC no esperada.');
  if (!Number.isFinite(claims.exp) || claims.exp + SKEW_SECONDS < nowSeconds) throw new FederacionRechazada('id_token expirado.');
  if (Number.isFinite(claims.iat) && claims.iat - SKEW_SECONDS > nowSeconds) throw new FederacionRechazada('id_token emitido en el futuro.');
  if (!nonce || claims.nonce !== nonce) throw new FederacionRechazada('nonce OIDC inválido (posible repetición).');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new FederacionRechazada('id_token sin sujeto.');
  return claims;
};

/** Normaliza el perfil mínimo que GreenAlert necesita a partir de los claims estándar. */
export const perfilDesdeClaims = (claims) => {
  const email = String(claims.email || claims.preferred_username || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FederacionRechazada('El proveedor no entregó un correo válido.', 400);
  const nombre = String(claims.given_name || String(claims.name || '').split(' ')[0] || 'Usuario').trim().slice(0, 100);
  const apellido = String(claims.family_name || String(claims.name || '').split(' ').slice(1).join(' ') || '').trim().slice(0, 100);
  return { subject: claims.sub, email, nombre, apellido, emailVerificado: claims.email_verified === true };
};

/**
 * Decide cómo resolver la cuenta local.
 *  - Vínculo existente (proveedor + sub): esa cuenta.
 *  - Sin vínculo y sin cuenta con ese correo: crear ciudadano (el rol nunca viene del proveedor).
 *  - Sin vínculo y correo ya registrado: solo se vincula si el proveedor afirma email_verified;
 *    si no, se rechaza para evitar tomar el control de una cuenta ajena.
 */
export const decidirCuenta = ({ vinculada, porCorreo, perfil }) => {
  if (vinculada) return { accion: 'usar', cuenta: vinculada };
  if (!porCorreo) return { accion: 'crear' };
  if (perfil.emailVerificado) return { accion: 'vincular', cuenta: porCorreo };
  throw new FederacionRechazada('Ya existe una cuenta con ese correo. Inicia sesión con tu método habitual.', 409);
};

export const exigirCuentaActiva = (cuenta) => {
  if (!cuenta || Number(cuenta.activo) !== 1 || cuenta.deleted_at) {
    throw new FederacionRechazada('Cuenta desactivada. Contacta al administrador.', 403);
  }
  return cuenta;
};
