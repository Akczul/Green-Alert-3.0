// Los contratos de módulos ajenos inyectan autenticación. La sesión real se verifica
// en seguridad-caso.test.js y validate-security.mjs, sin bypass de NODE_ENV productivo.
import jwt from 'jsonwebtoken';
import { seguridad } from '../../src/bootstrap/seguridad.js';
import { CredencialRechazada } from '../../src/modules/identidad/domain/seguridad.js';
export const mockAuthContract = (t) => t.mock.method(seguridad, 'verificarAcceso', async (token) => {
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { throw new CredencialRechazada('token inválido o expirado.'); }
});
