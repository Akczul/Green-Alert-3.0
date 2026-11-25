import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createMysqlReporteWriter } from '../../src/modules/reportes-creacion/adapters/outbound/mysql-reporte-writer.js';
import { createEvidenceStorage } from '../../src/modules/reportes-creacion/adapters/outbound/cloudinary-evidence-storage.js';
import { createPostReporte } from '../../src/modules/reportes-creacion/adapters/inbound/express-controller.js';
import { CrearReporteError } from '../../src/modules/reportes-creacion/domain/validaciones.js';

test('writer mantiene SRID/ejes, SQL parametrizado, UUID y estado pendiente', async () => {
  let call;
  const writer = createMysqlReporteWriter({ randomUUID: () => 'uuid-controlado', pool: { execute: async (sql, params) => { call = { sql, params }; return [{ insertId: 15 }]; } } });
  const id = await writer.create({ id_usuario: 1, tipo_contaminacion: 'agua', titulo: "x'); DROP TABLE reportes; --", latitud: 1.15, longitud: -120.25 });
  assert.equal(id, 15); assert.equal(call.params[0], 'uuid-controlado'); assert.equal(call.params[4], 'pendiente');
  assert.match(call.sql, /4326, 'axis-order=long-lat'/);
  assert.deepEqual(call.params.slice(-2), [-120.25, 1.15]);
  assert.equal(call.sql.includes('DROP TABLE'), false); assert.equal(call.params[6], "x'); DROP TABLE reportes; --");
});

test('writer conserva ambas coordenadas null cuando falta una, y UPDATE IA original', async () => {
  const calls = [];
  const writer = createMysqlReporteWriter({ randomUUID: () => 'uuid', pool: { execute: async (...args) => { calls.push(args); return [{ insertId: 1, affectedRows: 1 }]; } } });
  await writer.create({ id_usuario: 1, tipo_contaminacion: 'agua', titulo: 'Prueba', latitud: 1.15 });
  assert.equal(calls[0][0].includes('ST_GeomFromText'), false);
  assert.deepEqual(calls[0][1].slice(9, 11), [null, null]);
  assert.equal(await writer.updateIaAnalysis(1, { etiquetas: ['agua'], confianza: 75, procesado: false }), true);
  assert.deepEqual(calls[1][1], ['["agua"]', 75, 0, 1]);
  assert.match(calls[1][0], /WHERE id_reporte = \? AND deleted_at IS NULL/);
});

test('storage conserva metadata, orden y limpieza best effort aunque falle destroy', async () => {
  const deleted = [];
  const result = { secure_url: 'https://example.test/video', public_id: 'public', resource_type: 'video', bytes: 123 };
  const storage = createEvidenceStorage({ uploadFileBuffer: async () => result, deleteFileByPublicId: async (...args) => { deleted.push(args); throw new Error('remoto inaccesible'); }, validateUploadedFilesContent: () => null });
  const { evidencia, uploadResult } = await storage.upload({ mimetype: 'video/mp4', originalname: 'video.mp4', size: 123 }, { idReporte: 1, idUsuario: 2, orden: 3, hashSha256: 'hash' });
  assert.equal(uploadResult, result); assert.equal(evidencia.tipo_archivo, 'video');
  assert.equal(evidencia.orden, 3); assert.equal(evidencia.hash_sha256, 'hash');
  assert.equal(evidencia.cloudinary_resource_type, 'video'); assert.equal(evidencia.cloudinary_metadata.bytes, 123);
  await storage.cleanup([result, {}, { public_id: 'imagen' }]);
  assert.deepEqual(deleted, [['public', { resourceType: 'video' }], ['imagen', { resourceType: 'image' }]]);
});

test('entrada Express conserva combinación/orden de archivos, envelope 201 y errores', async () => {
  let input;
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const controller = createPostReporte({ crearReporte: async (data) => { input = data; return { reporte: { id_reporte: 1 } }; } });
  await controller({ body: { titulo: 'prueba' }, user: { sub: 1 }, file: 'single', files: { file: ['file'], files: ['files'] } }, response, () => assert.fail());
  assert.deepEqual(input.files, ['single','file','files']);
  assert.equal(response.code, 201); assert.deepEqual(response.body, { status: 'success', message: 'Reporte creado correctamente.', data: { reporte: { id_reporte: 1 } } });
  await createPostReporte({ crearReporte: async () => { throw new CrearReporteError('inválido'); } })({}, response, () => assert.fail());
  assert.equal(response.code, 400); assert.deepEqual(response.body, { status: 'error', message: 'inválido' });
  const failure = new Error('SQL falló'); let propagated;
  await createPostReporte({ crearReporte: async () => { throw failure; } })({}, response, (error) => { propagated = error; });
  assert.equal(propagated, failure);
});

test('dominio/aplicacion de creación solo importan capas internas y no entorno/infraestructura', async () => {
  const root = new URL('../../src/modules/reportes-creacion/', import.meta.url);
  for (const layer of ['domain','application']) for (const file of await readdir(new URL(`${layer}/`, root))) {
    const source = await readFile(new URL(`${layer}/${file}`, root), 'utf8');
    assert.doesNotMatch(source, /process\.env|Date\.now\(|from\s+['"](?:express|mysql2)|models\/|config\/|bootstrap\/|adapters\//);
    for (const match of source.matchAll(/from\s*['"]([^'"]+)['"]/g)) {
      const target = new URL(match[1], new URL(`${layer}/${file}`, root));
      assert.ok(target.href.startsWith(new URL('domain/', root).href) || target.href.startsWith(new URL('application/', root).href));
    }
  }
});
