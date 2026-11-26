// Composition root del inicio federado OpenID Connect.
// Microsoft Entra ID se activa solo si sus variables están definidas (ver docs/variables-entorno.md):
//   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI, MICROSOFT_TENANT (por defecto common).
import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { UsuarioModel } from '../models/usuario.model.js';
import { createInicioFederado } from '../modules/identidad-federada/application/inicio-federado.js';
import { createMemoryTransactions, createOidcClient } from '../modules/identidad-federada/adapters/outbound/oidc-client.js';
import { createMysqlCuentasFederadas } from '../modules/identidad-federada/adapters/outbound/mysql-cuentas-federadas.js';

const proveedores = new Map();
const { MICROSOFT_CLIENT_ID: clientId, MICROSOFT_CLIENT_SECRET: clientSecret, MICROSOFT_REDIRECT_URI: redirectUri } = process.env;
if (clientId && clientSecret && redirectUri) {
  const tenant = /^[\w.-]+$/.test(process.env.MICROSOFT_TENANT ?? '') ? process.env.MICROSOFT_TENANT : 'common';
  proveedores.set('microsoft', createOidcClient({
    issuer: `https://login.microsoftonline.com/${tenant}/v2.0`, clientId, clientSecret, redirectUri,
  }));
}

export const inicioFederado = createInicioFederado({
  proveedores,
  transacciones: createMemoryTransactions(),
  cuentas: createMysqlCuentasFederadas({ pool, uuid: randomUUID, usuarioModel: UsuarioModel }),
});
