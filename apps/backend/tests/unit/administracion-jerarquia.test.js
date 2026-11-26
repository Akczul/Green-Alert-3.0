import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  alcanceListado, decidirCambioRol, autorizarGestion, puedeGestionar, exigirSuperadmin,
} from '../../src/modules/administracion/domain/jerarquia.js';
import { createAdministracion } from '../../src/modules/administracion/application/administrar-usuarios.js';

const superadmin = { sub: 1, id_usuario: 1, rol: 'admin', nivel_admin: 'global', ambito_entidad: null };
const adminComunidad = { sub: 2, id_usuario: 2, rol: 'admin', nivel_admin: 'ambito', ambito_entidad: null };
const adminOrg = { sub: 3, id_usuario: 3, rol: 'admin', nivel_admin: 'ambito', ambito_entidad: 7 };
const ciudadano = { id_usuario: 10, rol: 'ciudadano', id_entidad: null, activo: 1 };
const entidad7 = { id_usuario: 11, rol: 'entidad', id_entidad: 7, activo: 1 };
const entidad8 = { id_usuario: 12, rol: 'entidad', id_entidad: 8, activo: 1 };
const otroAdmin = { id_usuario: 13, rol: 'admin', nivel_admin: 'ambito', ambito_entidad: null, activo: 1 };

test('el alcance de listado depende del nivel y ámbito del administrador', () => {
  assert.equal(alcanceListado(superadmin), null);
  assert.deepEqual(alcanceListado(adminComunidad), { roles: ['ciudadano', 'moderador'], id_entidad: null });
  assert.deepEqual(alcanceListado(adminOrg), { roles: ['entidad'], id_entidad: 7 });
  assert.throws(() => alcanceListado({ rol: 'moderador' }), /no autorizado/);
});

test('un administrador sin nivel se trata como administrador de ámbito (mínimo privilegio)', () => {
  assert.equal(puedeGestionar({ rol: 'admin' }, otroAdmin), false);
  assert.equal(puedeGestionar({ rol: 'admin' }, ciudadano), true);
});

test('administrador de segundo nivel no puede elevarse ni elevar a otros', () => {
  assert.throws(() => decidirCambioRol(adminComunidad, ciudadano, { rol: 'admin' }), (e) => e.statusCode === 403);
  assert.throws(() => decidirCambioRol(adminComunidad, adminComunidad, { rol: 'admin', nivel_admin: 'global' }), (e) => e.statusCode === 403);
  assert.throws(() => decidirCambioRol(adminOrg, otroAdmin, { rol: 'ciudadano' }), (e) => e.statusCode === 403);
});

test('administrador de segundo nivel no modifica otro ámbito ni mueve usuarios fuera del suyo', () => {
  assert.throws(() => decidirCambioRol(adminOrg, entidad8, { rol: 'entidad', id_entidad: 8 }), /fuera de tu ámbito/);
  assert.throws(() => decidirCambioRol(adminOrg, ciudadano, { rol: 'moderador' }), /fuera de tu ámbito/);
  assert.throws(() => decidirCambioRol(adminComunidad, ciudadano, { rol: 'entidad', id_entidad: 7 }), /fuera de tu ámbito/);
  assert.throws(() => decidirCambioRol(adminOrg, entidad7, { rol: 'entidad', id_entidad: 8 }), /fuera de tu ámbito/);
  assert.throws(() => autorizarGestion(adminOrg, entidad8, 'desactivar'), (e) => e.statusCode === 403);
});

test('cambios válidos dentro del ámbito', () => {
  const comunidad = decidirCambioRol(adminComunidad, ciudadano, { rol: 'moderador' });
  assert.deepEqual(comunidad.siguiente, { rol: 'moderador', id_entidad: null, nivel_admin: null, ambito_entidad: null });
  assert.equal(comunidad.sinCambios, false);
  assert.doesNotThrow(() => autorizarGestion(adminOrg, entidad7, 'desactivar'));
});

test('superadministrador asigna niveles y ámbitos; un global no tiene ámbito', () => {
  const ambito = decidirCambioRol(superadmin, ciudadano, { rol: 'admin', ambito_entidad: 7 });
  assert.deepEqual(ambito.siguiente, { rol: 'admin', id_entidad: null, nivel_admin: 'ambito', ambito_entidad: 7 });
  assert.deepEqual(ambito.entidadesAValidar, [7]);
  const global = decidirCambioRol(superadmin, otroAdmin, { rol: 'admin', nivel_admin: 'global' });
  assert.equal(global.siguiente.nivel_admin, 'global');
  assert.throws(() => decidirCambioRol(superadmin, otroAdmin, { rol: 'admin', nivel_admin: 'global', ambito_entidad: 3 }), /ámbito/);
  assert.throws(() => decidirCambioRol(superadmin, ciudadano, { rol: 'admin', nivel_admin: 'root' }), /nivel_admin/);
});

test('nadie cambia su propio rol, pero guardar el mismo rol es inocuo', () => {
  assert.throws(() => decidirCambioRol(superadmin, superadmin, { rol: 'ciudadano' }), /propio rol/);
  assert.equal(decidirCambioRol(superadmin, superadmin, { rol: 'admin' }).sinCambios, true);
  assert.equal(decidirCambioRol(adminComunidad, adminComunidad, { rol: 'admin' }).sinCambios, true);
  assert.throws(() => autorizarGestion(superadmin, superadmin, 'eliminar'), /propia cuenta/);
});

test('degradar o desactivar un superadministrador activa la protección del último', () => {
  const otroSuper = { ...superadmin, sub: 5, id_usuario: 5, activo: 1 };
  assert.equal(decidirCambioRol(superadmin, otroSuper, { rol: 'admin', nivel_admin: 'ambito' }).degradaSuperadmin, true);
  assert.equal(autorizarGestion(superadmin, otroSuper, 'desactivar').degradaSuperadmin, true);
  assert.equal(autorizarGestion(superadmin, otroSuper, 'activar').degradaSuperadmin, false);
});

test('la auditoría solo la consulta el superadministrador', () => {
  assert.doesNotThrow(() => exigirSuperadmin(superadmin));
  assert.throws(() => exigirSuperadmin(adminComunidad), (e) => e.statusCode === 403);
});

const fakePorts = (users) => {
  const aplicados = [];
  return {
    aplicados,
    usuarios: {
      findState: async (id) => users[id] ?? null,
      findDetails: async (id) => ({ id_usuario: id, ...users[id] }),
      list: async (filtros, alcance) => [{ filtros, alcance }],
      count: async () => 1,
    },
    cambios: { aplicar: async (cambio) => { aplicados.push(cambio); return true; } },
    entidades: { isActive: async (id) => id === 7 },
    auditoria: { list: async () => ({ items: [], total: 0 }) },
  };
};

test('caso de uso: aplica cambio auditado y valida entidades por puerto', async () => {
  const ports = fakePorts({ 10: ciudadano });
  const casos = createAdministracion(ports);
  await casos.cambiarRol(superadmin, 10, { rol: 'admin', ambito_entidad: 7 });
  assert.equal(ports.aplicados.length, 1);
  assert.equal(ports.aplicados[0].actorId, 1);
  assert.equal(ports.aplicados[0].accion, 'cambiar_rol');
  await assert.rejects(casos.cambiarRol(superadmin, 10, { rol: 'admin', ambito_entidad: 9 }), /entidad no existe/);
  assert.equal(ports.aplicados.length, 1);
});

test('caso de uso: guardar sin cambios no escribe ni audita', async () => {
  const ports = fakePorts({ 1: superadmin });
  await createAdministracion(ports).cambiarRol(superadmin, 1, { rol: 'admin' });
  assert.equal(ports.aplicados.length, 0);
});

test('caso de uso: obtener fuera del ámbito responde como inexistente', async () => {
  const ports = fakePorts({ 12: entidad8 });
  assert.equal(await createAdministracion(ports).obtener(adminOrg, 12), null);
});

test('caso de uso: listar pasa el alcance del ámbito al puerto', async () => {
  const ports = fakePorts({});
  const data = await createAdministracion(ports).listar(adminOrg, { limit: 20, offset: 0 });
  assert.deepEqual(data.usuarios[0].alcance, { roles: ['entidad'], id_entidad: 7 });
});

test('dominio y aplicación del módulo administrativo no dependen de infraestructura', async () => {
  for (const file of ['domain/jerarquia.js', 'application/administrar-usuarios.js']) {
    const source = await readFile(new URL(`../../src/modules/administracion/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"](express|mysql2|jsonwebtoken)|process\.env|models\/|config\/database/);
  }
});
