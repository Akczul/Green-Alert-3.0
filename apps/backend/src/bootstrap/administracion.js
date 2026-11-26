// Composition root del módulo administrativo (jerarquía superadministrador / administrador de ámbito).
import pool from '../config/database.js';
import { columnExists, tableExists } from '../config/schema-compat.js';
import { UsuarioModel } from '../models/usuario.model.js';
import { EntidadModel } from '../models/entidad.model.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { createAdministracion } from '../modules/administracion/application/administrar-usuarios.js';
import { createMysqlAdministracion } from '../modules/administracion/adapters/outbound/mysql-administracion.js';
import { createAdminHttp } from '../modules/administracion/adapters/inbound/http-admin.js';

const jerarquiaDisponible = async () =>
  await columnExists('usuarios', 'nivel_admin') && await tableExists('admin_audit');

const puertos = createMysqlAdministracion({ pool, jerarquiaDisponible, usuarioModel: UsuarioModel, entidadModel: EntidadModel });
export const administracion = createAdministracion(puertos);

// El actor se recarga desde MySQL en cada operación administrativa: nivel y ámbito vigentes.
const actorDe = async (req) => {
  if (!req.user?.sub) return null;
  const state = await puertos.usuarios.findState(req.user.sub);
  return state && Number(state.activo) === 1 ? { ...state, sub: Number(state.id_usuario) } : null;
};

export const adminHttp = createAdminHttp({ administracion, actorDe, successResponse, errorResponse });
