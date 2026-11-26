// Compila la APK de evaluación dentro de Linux (Docker) para evitar el límite Win32 de rutas.
// Uso: EXPO_PUBLIC_API_URL=http://IP_LAN:8080/api EXPO_PUBLIC_ALLOW_HTTP=true node scripts/build-apk-docker.mjs
// La URL es solo el valor inicial: la app permite cambiar el servidor antes de iniciar sesión.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const api = process.env.EXPO_PUBLIC_API_URL;
if (!api) throw new Error('Define EXPO_PUBLIC_API_URL (URL accesible desde el teléfono).');
const allowHttp = process.env.EXPO_PUBLIC_ALLOW_HTTP === 'true' ? 'true' : 'false';
const abis = process.env.GREENALERT_ANDROID_ABIS || 'arm64-v8a';
if (!/^(arm64-v8a|x86_64|armeabi-v7a|x86)(,(arm64-v8a|x86_64|armeabi-v7a|x86))*$/.test(abis)) throw new Error('Arquitecturas Android inválidas.');
// Hash SHA-256 del ZIP oficial commandlinetools-linux-15859902_latest.zip (comprobado al descargarlo).
const toolsSha = '4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583';
const dest = '.local/apk';
const args = ['build', '-f', 'apps/mobile/docker/apk.Dockerfile', '--target', 'apk', '--progress', 'plain',
  '--build-arg', `CMDLINE_TOOLS_SHA256=${toolsSha}`,
  '--build-arg', `EXPO_PUBLIC_API_URL=${api}`,
  '--build-arg', `EXPO_PUBLIC_ALLOW_HTTP=${allowHttp}`,
  '--build-arg', `ANDROID_ABIS=${abis}`,
  '--output', `type=local,dest=${dest}`, 'apps/mobile'];
const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
const apk = new URL(`../${dest}/greenalert.apk`, import.meta.url);
if (!existsSync(apk)) throw new Error('La compilación terminó sin APK.');
const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const dirty = spawnSync('git', ['status', '--porcelain', 'apps/mobile'], { cwd: root, encoding: 'utf8' }).stdout.trim() !== '';
const manifest = JSON.stringify({
  exists: true, path: `${dest}/greenalert.apk`, sha256, commit, mobileSourcesDirty: dirty,
  abis, initialApiUrl: api, allowHttp: allowHttp === 'true', builtAt: new Date().toISOString(),
  signing: 'debug (evaluación, no publicar)', builder: 'apps/mobile/docker/apk.Dockerfile (Linux)',
}, null, 2) + '\n';
writeFileSync(new URL(`../${dest}/apk.json`, import.meta.url), manifest);
// Manifiesto que consumen build-academic.mjs y package-delivery.mjs (verifican el hash antes de copiar).
mkdirSync(new URL('../.local/integracion/', import.meta.url), { recursive: true });
writeFileSync(new URL('../.local/integracion/apk.json', import.meta.url), manifest);
console.log(`APK: ${dest}/greenalert.apk\nSHA-256: ${sha256}`);
