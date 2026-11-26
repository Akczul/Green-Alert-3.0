// Reglas puras de la jerarquía administrativa. Sin Express, SQL ni entorno.
//
// El rol 'admin' existente se divide en dos niveles para no romper contratos:
//   - nivel 'global'  → superadministrador: control global, administradores, parámetros y auditoría.
//   - nivel 'ambito'  → administrador de segundo nivel: solo usuarios comunes de su ámbito.
// Ámbito de un administrador de segundo nivel:
//   - ambito_entidad = NULL → comunidad: ciudadanos y moderadores.
//   - ambito_entidad = N    → organización N: usuarios con rol 'entidad' de esa entidad.
// Un 'admin' sin nivel (datos anteriores a la migración 024) se trata como 'ambito' (mínimo privilegio).

export class PermisoDenegado extends Error {
  constructor(message) { super(message); this.statusCode = 403; }
}
export class SolicitudInvalida extends Error {
  constructor(message) { super(message); this.statusCode = 400; }
}
export class Conflicto extends Error {
  constructor(message) { super(message); this.statusCode = 409; }
}

export const ROLES = Object.freeze(['ciudadano', 'moderador', 'admin', 'entidad']);
export const NIVELES = Object.freeze(['global', 'ambito']);
const COMUNIDAD = Object.freeze(['ciudadano', 'moderador']);

const id = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

export const esAdministrador = (user) => user?.rol === 'admin';
export const esSuperadmin = (user) => esAdministrador(user) && user?.nivel_admin === 'global';

export const ambitoDe = (actor) => {
  if (esSuperadmin(actor)) return { tipo: 'global' };
  if (!esAdministrador(actor)) return { tipo: 'ninguno' };
  const entidad = id(actor.ambito_entidad);
  return entidad ? { tipo: 'organizacion', id_entidad: entidad } : { tipo: 'comunidad' };
};

/** Restricción de listado aplicada en el motor: null significa sin restricción. */
export const alcanceListado = (actor) => {
  const ambito = ambitoDe(actor);
  if (ambito.tipo === 'global') return null;
  if (ambito.tipo === 'organizacion') return { roles: ['entidad'], id_entidad: ambito.id_entidad };
  if (ambito.tipo === 'comunidad') return { roles: [...COMUNIDAD], id_entidad: null };
  throw new PermisoDenegado('acceso denegado. rol no autorizado.');
};

/** ¿Puede el actor ver o modificar a este usuario? Se evalúa por objeto, no por menú. */
export const puedeGestionar = (actor, target) => {
  if (!target) return false;
  const ambito = ambitoDe(actor);
  if (ambito.tipo === 'global') return true;
  if (ambito.tipo === 'ninguno' || esAdministrador(target)) return false;
  if (ambito.tipo === 'organizacion') return target.rol === 'entidad' && id(target.id_entidad) === ambito.id_entidad;
  return COMUNIDAD.includes(target.rol);
};

export const estadoRol = (user) => ({
  rol: user.rol,
  id_entidad: user.rol === 'entidad' ? id(user.id_entidad) : null,
  nivel_admin: user.rol === 'admin' ? (user.nivel_admin || 'ambito') : null,
  ambito_entidad: user.rol === 'admin' && user.nivel_admin !== 'global' ? id(user.ambito_entidad) : null,
});

const mismoEstado = (a, b) => a.rol === b.rol && a.id_entidad === b.id_entidad &&
  a.nivel_admin === b.nivel_admin && a.ambito_entidad === b.ambito_entidad;

/**
 * Calcula el nuevo estado de rol. Devuelve { siguiente, sinCambios, entidadesAValidar, degradaSuperadmin }.
 * La existencia de entidades y el último superadministrador se comprueban en la aplicación con puertos.
 */
export const decidirCambioRol = (actor, target, solicitud = {}) => {
  if (!target) throw Object.assign(new SolicitudInvalida('Usuario no encontrado.'), { statusCode: 404 });
  const rol = solicitud.rol;
  if (!rol || !ROLES.includes(rol)) throw new SolicitudInvalida('Rol invalido.');
  const ambito = ambitoDe(actor);
  const actual = estadoRol(target);

  let siguiente;
  if (rol === 'admin') {
    const nivel = solicitud.nivel_admin ?? (target.rol === 'admin' ? actual.nivel_admin : 'ambito');
    if (!NIVELES.includes(nivel)) throw new SolicitudInvalida('nivel_admin invalido.');
    const pedido = solicitud.ambito_entidad === undefined
      ? (target.rol === 'admin' ? actual.ambito_entidad : null) : id(solicitud.ambito_entidad);
    if (pedido !== null && !Number.isInteger(pedido)) throw new SolicitudInvalida('ambito_entidad invalido.');
    if (nivel === 'global' && pedido !== null) throw new SolicitudInvalida('Un superadministrador no tiene ámbito restringido.');
    siguiente = { rol, id_entidad: null, nivel_admin: nivel, ambito_entidad: nivel === 'global' ? null : pedido };
  } else {
    let entidad = null;
    if (rol === 'entidad') {
      entidad = id(solicitud.id_entidad ?? (ambito.tipo === 'organizacion' ? ambito.id_entidad : null));
      if (!entidad || !Number.isInteger(entidad)) throw new SolicitudInvalida('id_entidad es obligatorio para usuarios entidad.');
    }
    siguiente = { rol, id_entidad: entidad, nivel_admin: null, ambito_entidad: null };
  }

  const sinCambios = mismoEstado(actual, siguiente);
  if (rol === 'admin' && ambito.tipo !== 'global' && !sinCambios) {
    throw new PermisoDenegado('Solo un superadministrador puede asignar administradores.');
  }
  const self = Number(actor.sub ?? actor.id_usuario) === Number(target.id_usuario);
  // Guardar el mismo rol es inocuo; cualquier cambio propio permitiría elevarse o bloquearse.
  if (self && !sinCambios) throw new PermisoDenegado('No puedes cambiar tu propio rol.');
  if (!self && !puedeGestionar(actor, target)) throw new PermisoDenegado('El usuario está fuera de tu ámbito administrativo.');
  // El resultado también debe quedar dentro del ámbito: no se puede mover a alguien a otro ámbito.
  if (!sinCambios && ambito.tipo !== 'global' && !puedeGestionar(actor, siguiente)) {
    throw new PermisoDenegado('El rol solicitado está fuera de tu ámbito administrativo.');
  }

  return {
    anterior: actual,
    siguiente,
    sinCambios,
    entidadesAValidar: [siguiente.id_entidad, siguiente.ambito_entidad].filter((value) => value !== null),
    degradaSuperadmin: esSuperadmin(target) && !(siguiente.rol === 'admin' && siguiente.nivel_admin === 'global'),
  };
};

/** Activar, desactivar o eliminar: mismo control por objeto y nunca sobre uno mismo. */
export const autorizarGestion = (actor, target, accion) => {
  if (!target) throw Object.assign(new SolicitudInvalida('Usuario no encontrado.'), { statusCode: 404 });
  const self = Number(actor.sub ?? actor.id_usuario) === Number(target.id_usuario);
  if (self && accion === 'desactivar') throw new PermisoDenegado('No puedes desactivar tu propia cuenta.');
  if (self && accion === 'eliminar') throw new PermisoDenegado('No puedes eliminar tu propia cuenta.');
  if (!self && !puedeGestionar(actor, target)) throw new PermisoDenegado('El usuario está fuera de tu ámbito administrativo.');
  return { degradaSuperadmin: esSuperadmin(target) && accion !== 'activar' };
};

export const exigirSuperadmin = (actor) => {
  if (!esSuperadmin(actor)) throw new PermisoDenegado('Acción reservada al superadministrador.');
};
