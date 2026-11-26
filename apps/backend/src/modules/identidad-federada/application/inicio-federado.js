import { FederacionRechazada, decidirCuenta, exigirCuentaActiva, perfilDesdeClaims } from '../domain/federacion.js';

/**
 * Casos de uso del inicio federado OIDC.
 * Puertos:
 *  - proveedores: Map id → { authorizationUrl({state, nonce, codeChallenge}), exchangeCode({code, codeVerifier}), verifyIdToken(idToken, nonce) }
 *  - transacciones: { crear(provider) → { state, nonce, codeChallenge }, consumir(provider, state) → { nonce, codeVerifier } | null }
 *  - cuentas: { findLinked(provider, subject), findByEmail(email), link(provider, subject, idUsuario, email),
 *               createFederated(perfil, provider) → cuenta, touch(idUsuario) }
 */
export const createInicioFederado = ({ proveedores, transacciones, cuentas }) => {
  const proveedor = (id) => {
    const found = proveedores.get(id);
    if (!found) throw new FederacionRechazada('Proveedor de identidad no configurado.', 503);
    return found;
  };

  return {
    disponibles: () => [...proveedores.keys()],

    async iniciar(providerId) {
      const p = proveedor(providerId);
      const tx = await transacciones.crear(providerId);
      return { url: await p.authorizationUrl(tx) };
    },

    async completar(providerId, { code, state }) {
      const p = proveedor(providerId);
      if (typeof code !== 'string' || !code || typeof state !== 'string' || !state) {
        throw new FederacionRechazada('Respuesta del proveedor incompleta.', 400);
      }
      // Un solo uso: protege contra CSRF de inicio de sesión y repetición del callback.
      const tx = await transacciones.consumir(providerId, state);
      if (!tx) throw new FederacionRechazada('Estado OIDC inválido o expirado. Inicia de nuevo.', 400);
      const { idToken } = await p.exchangeCode({ code, codeVerifier: tx.codeVerifier });
      const claims = await p.verifyIdToken(idToken, tx.nonce);
      const perfil = perfilDesdeClaims(claims);

      const [vinculada, porCorreo] = await Promise.all([
        cuentas.findLinked(providerId, perfil.subject),
        cuentas.findByEmail(perfil.email),
      ]);
      const decision = decidirCuenta({ vinculada, porCorreo, perfil });
      let cuenta = decision.cuenta;
      if (decision.accion === 'crear') cuenta = await cuentas.createFederated(perfil, providerId);
      exigirCuentaActiva(cuenta);
      if (decision.accion !== 'usar') await cuentas.link(providerId, perfil.subject, cuenta.id_usuario, perfil.email);
      await cuentas.touch(cuenta.id_usuario);
      return cuenta;
    },
  };
};
