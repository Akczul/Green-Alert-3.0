import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const file = new URL('.env.integracion', root);
let previous = '';
try { previous = await readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const defaults = { GREENALERT_NETWORK: 'greenalert-final', COMPOSE_PROJECT_NAME: 'greenalert-final',
  FRONTEND_PORT: '8080', FRONTEND_TLS_PORT: '8443', WEB_BIND: '127.0.0.1' };
for (const key of ['MYSQL_PASSWORD','MYSQL_ROOT_PASSWORD','MONGO_ROOT_PASSWORD','MONGO_APP_PASSWORD',
  'REDIS_PASSWORD','ANALYTICS_INTERNAL_TOKEN','EVENTS_SERVICE_TOKEN','EVENTS_RECONCILE_TOKEN',
  'DRUID_METADATA_PASSWORD','DRUID_METADATA_ROOT_PASSWORD','JWT_SECRET','MFA_ENCRYPTION_KEY']) defaults[key] = randomBytes(32).toString('hex');
for (const [key, value] of Object.entries(defaults)) {
  if (!new RegExp(`^${key}=`, 'm').test(previous)) previous += `\n${key}=${value}`;
}
await writeFile(file, previous.trim() + '\n', { mode: 0o600 });
await mkdir(new URL('.local/integracion', root), { recursive: true });
console.log(`Configuración conservada en ${fileURLToPath(file)}. No se imprimen secretos.`);

// Certificado TLS autofirmado SOLO para laboratorio (localhost, 127.0.0.1 y la IP LAN opcional
// GREENALERT_TLS_IP). Clave privada en .local/tls: no se versiona ni se empaqueta.
const tlsDir = fileURLToPath(new URL('.local/tls/', root));
const hasCert = await access(`${tlsDir}tls.crt`).then(() => true, () => false);
if (!hasCert) {
  await mkdir(tlsDir, { recursive: true });
  const gitOpenssl = 'C:/Program Files/Git/usr/bin/openssl.exe';
  const openssl = spawnSync('openssl', ['version'], { stdio: 'ignore' }).status === 0 ? 'openssl'
    : existsSync(gitOpenssl) ? gitOpenssl : null;
  const lanIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(process.env.GREENALERT_TLS_IP ?? '') ? `,IP:${process.env.GREENALERT_TLS_IP}` : '';
  const args = ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-subj', '/CN=localhost',
    '-addext', `subjectAltName=DNS:localhost,IP:127.0.0.1${lanIp}`, '-keyout', 'tls.key', '-out', 'tls.crt'];
  const result = openssl
    ? spawnSync(openssl, args, { cwd: tlsDir, stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } })
    : spawnSync('docker', ['run', '--rm', '-v', `${tlsDir}:/out`, '-w', '/out', 'alpine/openssl:3.5.4', ...args], { stdio: 'ignore' });
  if (result.status !== 0) throw new Error('No se pudo generar el certificado TLS local (.local/tls).');
  console.log('Certificado TLS de laboratorio generado en .local/tls (autofirmado; aceptar la advertencia del navegador).');
}
