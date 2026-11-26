import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { executeSqlFile } from './mysql-sandbox.mjs';

export async function validateMigrations({ admin, root, database, result }) {
  const legacy = `${database}_legacy`;
  await admin.query(`CREATE DATABASE \`${legacy}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.changeUser({ database: legacy });
  const full = await readFile(path.join(root, 'apps/backend/DATABASE_SCHEMA_COMPLETE.sql'), 'utf8');
  // Base sintética reconstruida a partir de las precondiciones de 001-018.
  // No representa un dump histórico o una base productiva conocida.
  const removed = {
    usuarios: ['google_id', 'facebook_id', 'id_entidad', 'notification_preferences', 'email_verification_token', 'email_verification_exp', 'otp_code_hash', 'otp_exp', 'otp_attempts', 'otp_last_request'],
    reportes: ['comentario_moderacion', 'confianza_evidencia'],
    evidencias: ['storage_provider', 'cloudinary_public_id', 'cloudinary_asset_id', 'cloudinary_resource_type', 'cloudinary_metadata'],
    categorias_riesgo: [],
  };
  for (const table of ['usuarios', 'categorias_riesgo', 'reportes', 'evidencias']) {
    let ddl = full.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\) ENGINE[^;]*;`))[0];
    if (table === 'usuarios') ddl = ddl.replace(/,?\s*CONSTRAINT fk_usuarios_entidad[\s\S]*?ON UPDATE CASCADE/, '');
    ddl = ddl.split(/\r?\n/).filter((line) => {
      const text = line.trim();
      if (text.startsWith('--')) return false;
      return !removed[table].some((column) => text.startsWith(`${column} `) || (/^INDEX /.test(text) && (text.includes(`(${column})`) || text.includes(`idx_${column} `))));
    }).join('\n').replace(/,\s*\) ENGINE/, '\n) ENGINE');
    if (table === 'evidencias') ddl = ddl.replace('url_archivo VARCHAR(512)', 'url_archivo VARCHAR(255)');
    await admin.query(ddl);
  }
  await admin.query("INSERT INTO usuarios (uuid,nombre,apellido,email,password_hash) VALUES ('00000000-0000-4000-8000-000000000001','Base','Sintetica','legacy@example.test','fixture')");
  await admin.query("INSERT INTO categorias_riesgo (codigo,nombre,activo) VALUES ('personalizada','Categoria anterior conservada',FALSE)");
  const files = (await readdir(path.join(root, 'apps/backend/migrations'))).filter((name) => /^\d{3}_.*\.sql$/.test(name)).sort();
  for (const file of files) {
    try {
      await executeSqlFile(admin, await readFile(path.join(root, 'apps/backend/migrations', file), 'utf8'));
      if (file.startsWith('007_')) await admin.query("INSERT INTO reportes (uuid,id_usuario,tipo_contaminacion,estado,titulo) VALUES ('00000000-0000-4000-8000-000000000002',1,'deforestacion','en_revision','Reporte anterior sintetico')");
      result.checks.push({ name: `Migración ${file}`, status: 'passed' });
      console.log(`OK: Migración ${file}`);
    } catch (error) {
      result.checks.push({ name: `Migración ${file}`, status: 'failed', code: error.code, message: error.message });
      console.error(`FALLO: Migración ${file}: ${error.code}`);
    }
  }
  const [expected] = await admin.query("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema=? AND table_name NOT LIKE 'v_%'", [database]);
  const [actual] = await admin.query("SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema=? AND table_name NOT LIKE 'v_%'", [legacy]);
  const missing = expected.filter((item) => !actual.some((candidate) => candidate.t === item.t && candidate.c === item.c));
  result.migrationMissingColumns = missing;
  result.checks.push({ name: 'Columnas requeridas tras migraciones sobre base sintética', status: missing.length ? 'failed' : 'passed', missing });
  const [[row]] = await admin.query('SELECT COUNT(*) AS total FROM usuarios WHERE email=?', ['legacy@example.test']);
  assert.equal(row.total, 1, 'Las migraciones deben conservar la fila sintética anterior.');
  const [[report]] = await admin.query('SELECT estado FROM reportes WHERE uuid=?', ['00000000-0000-4000-8000-000000000002']);
  assert.equal(report.estado, 'en_proceso');
  const [[category]] = await admin.query("SELECT id_categoria, nombre, activo FROM categorias_riesgo WHERE codigo='personalizada'");
  assert.equal(category.id_categoria, 1); assert.equal(category.activo, 0);
  assert.equal(category.nombre, 'Categoria anterior conservada');
  const [snapshot] = await admin.query('SELECT id_categoria,codigo,nombre,activo FROM categorias_riesgo ORDER BY id_categoria');
  for (const file of files.filter((name) => /^(003|004|019)_/.test(name))) await executeSqlFile(admin, await readFile(path.join(root, 'apps/backend/migrations', file), 'utf8'));
  const [repeated] = await admin.query('SELECT id_categoria,codigo,nombre,activo FROM categorias_riesgo ORDER BY id_categoria');
  assert.deepEqual(repeated, snapshot);
  result.checks.push({ name: 'Migraciones conservan filas anteriores y 003/004/019 admiten repetición', status: 'passed' });
  const [keys] = await admin.query('SELECT constraint_name FROM information_schema.referential_constraints WHERE constraint_schema=?', [legacy]);
  assert.equal(keys.length, 19);
  result.checks.push({ name: '19 relaciones instaladas por las migraciones', status: 'passed' });
  await admin.changeUser({ database });
}
