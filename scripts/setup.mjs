import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const secret = () => randomBytes(32).toString('hex');
async function create(file, text) {
  try { await access(file); console.log(`Conservado: ${path.relative(root, file)}`); }
  catch { await writeFile(file, text, { flag: 'wx', mode: 0o600 }); console.log(`Creado: ${path.relative(root, file)}`); }
}
let infra = await readFile(path.join(root, '.env.example'), 'utf8');
infra = infra.replace('MYSQL_PASSWORD=GENERATE_WITH_NPM_RUN_SETUP', `MYSQL_PASSWORD=${secret()}`)
  .replace('MYSQL_ROOT_PASSWORD=GENERATE_WITH_NPM_RUN_SETUP', `MYSQL_ROOT_PASSWORD=${secret()}`);
await create(path.join(root, '.env'), infra);
const existing = await readFile(path.join(root, '.env'), 'utf8');
const vars = Object.fromEntries(existing.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim()];
}));
let backend = await readFile(path.join(root, 'apps/backend/.env.example'), 'utf8');
for (const [key, value] of Object.entries({
  DB_PORT: vars.MYSQL_PORT || '3307', DB_USER: vars.MYSQL_USER || 'greenalert',
  DB_NAME: vars.MYSQL_DATABASE || 'green-alert', DB_PASSWORD: vars.MYSQL_PASSWORD,
  JWT_SECRET: secret(),
})) {
  if (!value) throw new Error(`Falta ${key} en la configuración local.`);
  backend = backend.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
}
await create(path.join(root, 'apps/backend/.env'), backend);
await create(path.join(root, 'apps/frontend/.env'), await readFile(path.join(root, 'apps/frontend/.env.example'), 'utf8'));
console.log('Configuración local preparada. Los secretos no se imprimen. Revisa los puertos y servicios opcionales antes de ejecutar.');
