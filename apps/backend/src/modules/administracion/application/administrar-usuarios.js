import {
  Conflicto, PermisoDenegado, ROLES, SolicitudInvalida,
  alcanceListado, autorizarGestion, decidirCambioRol, exigirSuperadmin, puedeGestionar,
} from '../domain/jerarquia.js';

/**
 * Casos de uso del panel administrativo.
 * Puertos:
 *  - usuarios.findState(id) → { id_usuario, rol, id_entidad, nivel_admin, ambito_entidad, activo } | null
 *  - usuarios.findDetails(id), usuarios.list(filtros, alcance), usuarios.count(filtros, alcance)
 *  - cambios.aplicar({ actorId, targetId, accion, cambio, anterior, protegerUltimoSuperadmin })
 *      Ejecuta en una transacción: bloqueo, comprobación del último superadministrador,
 *      actualización (con auth_version) y registro en auditoría. Devuelve false si el usuario no existe.
 *  - entidades.isActive(id) → boolean
 *  - auditoria.list({ limit, offset, actorId, targetId }) → { items, total }
 */
export const createAdministracion = ({ usuarios, cambios, entidades, auditoria }) => {
  const cargar = async (id) => usuarios.findState(id);

  return {
    async listar(actor, { rol, activo, search, limit, offset }) {
      if (rol && !ROLES.includes(rol)) throw new SolicitudInvalida('Rol invalido.');
      const alcance = alcanceListado(actor);
      const filtros = { rol, activo, search };
      const [lista, total] = await Promise.all([
        usuarios.list({ ...filtros, limit, offset }, alcance),
        usuarios.count(filtros, alcance),
      ]);
      return { usuarios: lista, total, limit, offset };
    },

    async obtener(actor, id) {
      const target = await cargar(id);
      // 404 también fuera del ámbito: no revelar la existencia de cuentas ajenas.
      if (!target || (!puedeGestionar(actor, target) && Number(actor.sub) !== Number(id))) return null;
      return usuarios.findDetails(id);
    },

    async cambiarRol(actor, id, solicitud) {
      const target = await cargar(id);
      if (!target) return null;
      const decision = decidirCambioRol(actor, target, solicitud);
      for (const entidad of decision.entidadesAValidar) {
        if (!await entidades.isActive(entidad)) throw new SolicitudInvalida('La entidad no existe o esta inactiva.');
      }
      if (!decision.sinCambios) {
        const ok = await cambios.aplicar({
          actorId: actor.sub, targetId: id, accion: 'cambiar_rol',
          anterior: decision.anterior, cambio: decision.siguiente,
          protegerUltimoSuperadmin: decision.degradaSuperadmin,
        });
        if (!ok) return null;
      }
      return usuarios.findDetails(id);
    },

    async cambiarEstado(actor, id, activo) {
      const target = await cargar(id);
      if (!target) return null;
      const { degradaSuperadmin } = autorizarGestion(actor, target, activo ? 'activar' : 'desactivar');
      if (Number(target.activo) !== activo) {
        const ok = await cambios.aplicar({
          actorId: actor.sub, targetId: id, accion: activo ? 'activar' : 'desactivar',
          anterior: { activo: Number(target.activo) }, cambio: { activo },
          protegerUltimoSuperadmin: degradaSuperadmin,
        });
        if (!ok) return null;
      }
      return usuarios.findDetails(id);
    },

    async eliminar(actor, id) {
      const target = await cargar(id);
      if (!target) return false;
      const { degradaSuperadmin } = autorizarGestion(actor, target, 'eliminar');
      return cambios.aplicar({
        actorId: actor.sub, targetId: id, accion: 'eliminar',
        anterior: { eliminado: false }, cambio: { eliminado: true },
        protegerUltimoSuperadmin: degradaSuperadmin,
      });
    },

    async auditoria(actor, { limit, offset, actorId, targetId }) {
      exigirSuperadmin(actor);
      return auditoria.list({ limit, offset, actorId, targetId });
    },
  };
};

export { Conflicto, PermisoDenegado, SolicitudInvalida };
