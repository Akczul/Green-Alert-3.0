import { validarLongitudPassword } from '../modules/identidad/domain/seguridad.js';

/**
 * VALIDACIONES USADAS EN PERFIL Y SEGURIDAD.
 */

/**
 * Valida el nombre de usuario para operaciones de perfil.
 * Reglas:
 * - Debe ser string no vacio (null, undefined y solo espacios -> false)
 * - Debe tener entre 2 y 50 caracteres (sin contar espacios al inicio/fin)
 * - Rechaza caracteres peligrosos como < > ; ` " \ / { } [ ]
 *
 * @param {string} nombre
 * @returns {boolean}
 */
export const validarNombreUsuario = (nombre) => {
  if (typeof nombre !== 'string') return false;

  const valor = nombre.trim();
  if (!valor) return false;
  if (valor.length < 2 || valor.length > 50) return false;

  const caracteresPeligrosos = /[<>;`"\\/{}\[\]]/;
  if (caracteresPeligrosos.test(valor)) return false;

  return true;
};

/**
 * Valida telefono para perfil (campo opcional).
 * Reglas:
 * - null, undefined, cadena vacia o solo espacios -> true
 * - Si trae valor, debe ser telefono valido (7 a 15 digitos, permite prefijo +)
 * - Se aceptan separadores comunes: espacio, guion y parentesis
 *
 * @param {string|null|undefined} telefono
 * @returns {boolean}
 */
export const validarTelefono = (telefono) => {
  if (telefono === null || telefono === undefined) return true;
  if (typeof telefono !== 'string') return false;

  const valor = telefono.trim();
  if (!valor) return true;

  const normalizado = valor.replace(/[\s()-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(normalizado);
};

/**
 * Valida password para cambio de clave.
 * Reglas:
 * - Debe ser string no vacio (null, undefined y solo espacios -> false)
 * - Minimo 15 caracteres, sin imponer composición a frases largas.
 * Solo comprueba formato; alta/cambio/reset usan seguridad.validarNuevaPassword
 * y la lista local de contraseñas comunes.
 *
 * @param {string} password
 * @returns {boolean}
 */
export const validarPassword = (password) => {
  try { validarLongitudPassword(password); return true; }
  catch { return false; }
};

