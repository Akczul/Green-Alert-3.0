// Relaciona el artefacto con el árbol móvil confirmado, incluso tras commits documentales.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const gitAt = (root, args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();

export function readApkManifest(root) {
  const manifests = ['.local/integracion/apk.json', '.local/apk/apk.json'].map(file => {
    try { return JSON.parse(readFileSync(path.join(root, file), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }).filter(Boolean);
  if (manifests.length === 2 && ['exists', 'path', 'sha256', 'commit', 'mobileSourceTree']
    .some(key => manifests[0][key] !== manifests[1][key]))
    throw new Error('Los manifiestos locales de APK se contradicen.');
  return manifests[0] ?? null;
}

export function mobileTree(root, ref = 'HEAD') {
  return gitAt(root, ['rev-parse', `${ref}:apps/mobile`]);
}

export function signingCertificateSha256(signature) {
  // Build Tools 37 usa «V2 Signer»; versiones previas imprimen «Signer #1».
  return signature.match(/(?:Signer #\d+|V\d(?:\.\d)? Signer):? certificate SHA-256 digest: ([a-f0-9]{64})/i)?.[1];
}

export function assertCleanMobile(root) {
  if (gitAt(root, ['status', '--porcelain', '--untracked-files=all', '--', 'apps/mobile']))
    throw new Error('Confirma las fuentes móviles antes de compilar o empaquetar.');
}

function sameMobileInputs(root, commit) {
  try {
    execFileSync('git', ['diff', '--quiet', commit, 'HEAD', '--', 'apps/mobile', ':(exclude)apps/mobile/docs'],
      { cwd: root, windowsHide: true, stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export function validateApk(root, manifest) {
  assertCleanMobile(root);
  if (!manifest?.exists || manifest.mobileSourcesDirty !== false || !manifest.mobileSourceTree || !manifest.commit)
    throw new Error('APK sin procedencia limpia acreditada; recompilar con apk:docker.');
  // Solo la documentación móvil puede evolucionar sin recompilar; código, pruebas,
  // assets, lockfile y receta Docker deben conservarse exactamente.
  if (mobileTree(root, manifest.commit) !== manifest.mobileSourceTree || !sameMobileInputs(root, manifest.commit))
    throw new Error('La APK no corresponde a las fuentes móviles actuales.');
  if (manifest.path !== '.local/apk/greenalert.apk')
    throw new Error('Ruta de APK no portable; se requiere .local/apk/greenalert.apk.');
  const source = path.join(root, manifest.path);
  const bytes = readFileSync(source);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== manifest.sha256 || !readFileSync(`${source}.sha256`, 'utf8').startsWith(`${sha256} `))
    throw new Error('La APK cambió después de validarse.');
  const signature = readFileSync(path.join(root, '.local/apk/firma.txt'), 'utf8');
  const inspection = readFileSync(path.join(root, '.local/apk/contenido.txt'), 'utf8');
  if (!signingCertificateSha256(signature) ||
      !inspection.includes('assets/index.android.bundle') || !inspection.includes("package: name='co.greenalert.mobile'"))
    throw new Error('Falta evidencia de firma, paquete Android o bundle integrado.');
  return { source, bytes: bytes.length, sha256 };
}
