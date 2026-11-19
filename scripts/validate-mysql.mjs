import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startNativeMysql, startDockerMysql, executeSqlFile } from './mysql-sandbox.mjs';
import { runIntegration } from './mysql-integration.mjs';
import { validateMigrations } from './mysql-migrations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.includes('--docker-config')) { await startDockerMysql({ configOnly: true }); process.exit(0); }
const dockerMode = process.argv.includes('--docker');
const result = { mode: dockerMode ? 'docker' : 'native', engine: '', checks: [], limitations: ['Sin Cloudinary, SMTP, OAuth o inferencia externos.'] };
const sandbox = process.argv.includes('--docker') ? await startDockerMysql() : await startNativeMysql();
const { admin } = sandbox;
const database = `greenalert_validation_${randomBytes(8).toString('hex')}`;
try {
  const [[version]] = await admin.query('SELECT VERSION() AS version');
  result.engine = version.version;
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.changeUser({ database });
  const statements = await executeSqlFile(admin, await readFile(path.join(root, 'apps/backend/DATABASE_SCHEMA_COMPLETE.sql'), 'utf8'));
  result.checks.push({ name: 'Inicialización del esquema completo', status: 'passed', statements });
  const [tables] = await admin.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE' ORDER BY table_name", [database]);
  assert.equal(tables.length, 12);
  const [relations] = await admin.query('SELECT table_name AS source, column_name AS columnName, referenced_table_name AS target FROM information_schema.key_column_usage WHERE table_schema=? AND referenced_table_name IS NOT NULL', [database]);
  result.tables = tables.map((row) => row.name);
  result.relations = relations;
  console.log(`Esquema real creado: ${tables.length} tablas, ${relations.length} relaciones.`);
  result.checks.push({ name: 'Tablas y relaciones reales', status: 'passed' });
  await runIntegration({ root, admin, config: sandbox.config, database, directory: sandbox.directory, result });
  await validateMigrations({ admin, root, database, result });
} catch (error) {
  result.checks.push({ name: 'Validación SQL', status: 'failed', code: error.code || error.name, message: error.message });
  console.error(`Fallo de validación: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sandbox.stop();
  if (result.checks.some((check) => check.status === 'failed')) process.exitCode = 1;
  await mkdir(path.join(root, '.local/mysql-validation'), { recursive: true });
  await writeFile(path.join(root, `.local/mysql-validation/${dockerMode ? 'latest-docker' : 'latest'}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Resultado: ${result.checks.filter((check) => check.status === 'passed').length} correctas, ${result.checks.filter((check) => check.status === 'failed').length} fallidas.`);
}
// Todos los procesos y conexiones propios ya se han cerrado en finally.
process.exit(process.exitCode || 0);
