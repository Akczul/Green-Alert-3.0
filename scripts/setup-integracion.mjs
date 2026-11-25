import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const file = new URL('.env.integracion', root);
let previous = '';
try { previous = await readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const defaults = { GREENALERT_NETWORK: 'greenalert-final', COMPOSE_PROJECT_NAME: 'greenalert-final',
  FRONTEND_PORT: '8080', WEB_BIND: '127.0.0.1' };
for (const key of ['MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD','MONGO_ROOT_PASSWORD','MONGO_APP_PASSWORD',
  'REDIS_PASSWORD','ANALYTICS_INTERNAL_TOKEN','EVENTS_SERVICE_TOKEN','EVENTS_RECONCILE_TOKEN',
  'DRUID_METADATA_PASSWORD','DRUID_METADATA_ROOT_PASSWORD','JWT_SECRET','MFA_ENCRYPTION_KEY']) defaults[key] = randomBytes(32).toString('hex');
for (const [key, value] of Object.entries(defaults)) {
  if (!new RegExp(`^${key}=`, 'm').test(previous)) previous += `\n${key}=${value}`;
}
await writeFile(file, previous.trim() + '\n', { mode: 0o600 });
await mkdir(new URL('.local/integracion', root), { recursive: true });
console.log(`Configuración conservada en ${fileURLToPath(file)}. No se imprimen secretos.`);
