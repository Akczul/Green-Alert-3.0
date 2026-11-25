import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrearReporte } from '../../src/modules/reportes-creacion/application/crear-reporte.js';
import { CrearReporteError } from '../../src/modules/reportes-creacion/domain/validaciones.js';

const body = { tipo_contaminacion: ' Agua ', nivel_severidad: ' ALTO ', titulo: ' Reporte de agua ', direccion: ' Calle 10 ', latitud: '1.15', longitud: '-120.25', subcategoria: ' rio ' };
const image = { mimetype: 'image/png', originalname: 'foto.png' };

function harness(failAt, { assignmentFails = false, removeFails = false, cleanupFails = false } = {}) {
  const state = { active: false, uploads: [], cleanup: [], evidences: [], trace: [], errors: [], created: null, ia: null };
  const failure = new Error(`fallo ${failAt}`);
  const step = (name) => { state.trace.push(name); if (name === failAt) throw failure; };
  let reads = 0, uploadCount = 0, evidenceCount = 0;
  const dependencies = {
    reportes: {
      async create(data) { step('create'); state.created = data; state.active = true; return 10; },
      async findById() { step(`read${++reads}`); return { id_reporte: 10, ...state.created, estado: 'pendiente', ...(state.ia || {}) }; },
      async updateIaAnalysis(_id, ia) { step('updateIa'); state.ia = ia; },
      async remove(id) { assert.equal(id, 10); step('remove'); if (removeFails) throw new Error('remove falló'); state.active = false; },
    },
    categorias: { async esValido(value) { assert.equal(value, 'agua'); step('category'); return true; } },
    evidencias: { async create(data) { step(`evidence${++evidenceCount}`); state.evidences.push(data); } },
    archivos: {
      validateContent() { step('content'); return null; },
      async upload(_file, data) {
        step(`upload${++uploadCount}`);
        const uploadResult = { public_id: `asset-${uploadCount}` }; state.uploads.push(uploadResult);
        return { uploadResult, evidencia: data };
      },
      async cleanup(uploads) { step('cleanup'); state.cleanup = [...uploads]; if (cleanupFails) throw new Error('cleanup falló'); },
    },
    analisis: {
      async score(files) { step('score'); return { score: files.length ? 65 : null, evidencias: files.map((_file, index) => ({ hash_sha256: `hash-${index}` })) }; },
      analizar() { step('analysis'); return { etiquetas: ['agua'], confianza: 0.8, procesado: true }; },
    },
    efectos: {
      async asignar() { step('assign'); if (assignmentFails) throw new Error('asignacion falló'); },
      invalidateCache() { step('invalidate'); },
    },
    logger: { error: (...args) => state.errors.push(args) },
  };
  return { run: createCrearReporte(dependencies), dependencies, state, failure };
}

test('crear sin MySQL normaliza campos, conserva autor y orden de efectos', async () => {
  const { run, state } = harness();
  const result = await run({ body: { ...body, id_usuario: 999 }, user: { sub: 1 }, files: [image, image] });
  assert.equal(state.created.id_usuario, 1);
  assert.equal(state.created.longitud, -120.25);
  assert.equal(state.created.latitud, 1.15);
  assert.equal(state.created.titulo, 'Reporte de agua');
  assert.equal(state.created.subcategoria, 'rio');
  assert.equal(state.created.confianza_evidencia, 65);
  assert.equal(result.reporte.estado, 'pendiente');
  assert.deepEqual(state.evidences, [
    { idReporte: 10, idUsuario: 1, hashSha256: 'hash-0', orden: 0 },
    { idReporte: 10, idUsuario: 1, hashSha256: 'hash-1', orden: 1 },
  ]);
  assert.deepEqual(state.trace, ['content','category','score','create','read1','analysis','updateIa','read2','upload1','evidence1','upload2','evidence2','assign','invalidate']);
});

test('IA aceptada omite análisis y ausencia de evidencias mantiene score null', async () => {
  const { run, state } = harness();
  await run({ body: { ...body, ia_procesado: 'true', ia_etiquetas: '["aceptado"]', ia_confianza: '99.5' }, user: { sub: 1 } });
  assert.deepEqual(state.ia, { etiquetas: ['aceptado'], confianza: 99.5, procesado: true });
  assert.equal(state.created.confianza_evidencia, null);
  assert.equal(state.trace.includes('analysis'), false);
});

for (const [name, overrides, message] of [
  ['categoria ausente', { tipo_contaminacion: '' }, 'El tipo de contaminación es requerido.'],
  ['severidad ausente', { nivel_severidad: '' }, 'El nivel de severidad es requerido.'],
  ['titulo corto', { titulo: 'abcd' }, 'El título debe tener al menos 5 caracteres.'],
  ['direccion corta', { direccion: 'a' }, 'La dirección es requerida.'],
  ['severidad invalida', { nivel_severidad: 'grave' }, 'El nivel de severidad debe ser uno de: bajo, medio, alto, critico.'],
  ['latitud invalida', { latitud: 91 }, 'La latitud debe estar entre -90 y 90.'],
  ['longitud invalida', { longitud: -181 }, 'La longitud debe estar entre -180 y 180.'],
  ['IA invalida', { ia_procesado: true, ia_etiquetas: '{', ia_confianza: 10 }, 'ia_etiquetas debe ser un arreglo JSON valido.'],
]) test(`creacion rechaza ${name} sin escribir`, async () => {
  const { run, state } = harness();
  await assert.rejects(run({ body: { ...body, ...overrides }, user: { sub: 1 } }), (error) => error instanceof CrearReporteError && error.message === message);
  assert.equal(state.trace.includes('create'), false); assert.equal(state.active, false);
});

for (const failAt of ['category','score','create','read1','analysis','updateIa','read2','upload1','evidence1','upload2','evidence2']) {
  test(`fallo ${failAt} conserva error, compensacion y ausencia de efectos posteriores`, async () => {
    const { run, state, failure } = harness(failAt);
    await assert.rejects(run({ body, user: { sub: 1 }, files: [image, image] }), (error) => error === failure);
    assert.equal(state.active, false);
    assert.deepEqual(state.cleanup, state.uploads);
    assert.equal(state.trace.includes('assign'), false); assert.equal(state.trace.includes('invalidate'), false);
    assert.equal(state.trace.includes('remove'), !['category','score','create'].includes(failAt));
    if (failAt === 'evidence2') assert.equal(state.evidences.length, 1, 'La compensación heredada no borra físicamente evidencias previas.');
  });
}

test('fallo de asignación es best effort: conserva reporte e invalida caché', async () => {
  const { run, state } = harness(undefined, { assignmentFails: true });
  assert.ok((await run({ body, user: { sub: 1 } })).reporte);
  assert.equal(state.active, true); assert.equal(state.errors.length, 1);
  assert.deepEqual(state.trace.slice(-2), ['assign','invalidate']);
});

test('fallos de compensación no sustituyen el error original y quedan registrados', async () => {
  const { run, state, failure } = harness('evidence1', { removeFails: true, cleanupFails: true });
  await assert.rejects(run({ body, user: { sub: 1 }, files: [image] }), (error) => error === failure);
  assert.equal(state.active, true, 'Se documenta el límite heredado cuando falla el borrado lógico.');
  assert.equal(state.errors.length, 2); assert.equal(state.trace.includes('invalidate'), false);
});

test('errores de contenido preceden al payload IA y no consultan catálogo', async () => {
  const { run, dependencies, state } = harness();
  dependencies.archivos.validateContent = () => 'archivo inválido';
  await assert.rejects(run({ body: { ...body, ia_procesado: true, ia_etiquetas: '{' }, user: { sub: 1 } }), { message: 'archivo inválido' });
  assert.deepEqual(state.trace, []);
});

test('categoría inactiva no escribe ni ejecuta análisis', async () => {
  const { run, dependencies, state } = harness();
  dependencies.categorias.esValido = async () => false;
  await assert.rejects(run({ body, user: { sub: 1 } }), { message: 'La categoría de contaminación no existe o está inactiva.' });
  assert.deepEqual(state.trace, ['content']);
});

for (const [files, message] of [
  [Array(11).fill(image), 'Solo puedes adjuntar hasta 10 evidencias por reporte.'],
  [[{ mimetype: 'video/mp4' }, { mimetype: 'video/mp4' }], 'Solo puedes adjuntar un video por reporte.'],
]) test(`límite de evidencias: ${message}`, async () => {
  const { run, state } = harness();
  await assert.rejects(run({ body, user: { sub: 1 }, files }), { message });
  assert.deepEqual(state.trace, []);
});
