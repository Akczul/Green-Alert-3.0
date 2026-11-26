import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mobileTree, validateApk } from './apk-provenance.mjs';

test('Entrega rechaza APK alterada, fuentes distintas, cambios locales y procedencia heredada', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ga-apk-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, text) => writeFileSync(path.join(root, file), text);
  const commit = () => { git('add', '.'); git('-c', 'user.name=Prueba', '-c', 'user.email=prueba@example.test', 'commit', '-m', 'Fixture sintético'); };
  try {
    git('init');
    mkdirSync(path.join(root, 'apps/mobile'), { recursive: true });
    mkdirSync(path.join(root, '.local/apk'), { recursive: true });
    write('.gitignore', '.local/\n');
    write('apps/mobile/app.js', 'fuente original');
    commit();
    write('.local/apk/greenalert.apk', 'artefacto sintético para probar procedencia, no una APK real');
    const sha256 = createHash('sha256').update('artefacto sintético para probar procedencia, no una APK real').digest('hex');
    write('.local/apk/greenalert.apk.sha256', `${sha256}  /out/greenalert.apk\n`);
    write('.local/apk/firma.txt', 'Signer #1 certificate SHA-256 digest: prueba\n');
    write('.local/apk/contenido.txt', "package: name='co.greenalert.mobile'\nassets/index.android.bundle\n");
    const manifest = { exists: true, path: '.local/apk/greenalert.apk', sha256,
      commit: git('rev-parse', 'HEAD'), mobileSourcesDirty: false, mobileSourceTree: mobileTree(root) };
    assert.equal(validateApk(root, manifest).sha256, sha256);
    write('continuidad.md', 'Commit exclusivamente documental'); commit();
    assert.equal(validateApk(root, manifest).sha256, sha256);
    mkdirSync(path.join(root, 'apps/mobile/docs'), { recursive: true });
    write('apps/mobile/docs/verificacion.md', 'Evidencia documental posterior a la compilación'); commit();
    assert.equal(validateApk(root, manifest).sha256, sha256);
    assert.throws(() => validateApk(root, { ...manifest, mobileSourceTree: undefined }), /procedencia/);
    assert.throws(() => validateApk(root, { ...manifest, path: 'C:/otro/antigua.apk' }), /portable/);
    write('apps/mobile/app.js', 'cambio local');
    assert.throws(() => validateApk(root, manifest), /Confirma/);
    commit();
    assert.throws(() => validateApk(root, manifest), /fuentes móviles actuales/);
    const current = { ...manifest, commit: git('rev-parse', 'HEAD'), mobileSourceTree: mobileTree(root) };
    write('.local/apk/firma.txt', '');
    assert.throws(() => validateApk(root, current), /Falta evidencia/);
    write('.local/apk/firma.txt', 'Signer #1 certificate SHA-256 digest: prueba\n');
    write('.local/apk/contenido.txt', "package: name='co.greenalert.mobile'\n");
    assert.throws(() => validateApk(root, current), /Falta evidencia/);
    write('.local/apk/contenido.txt', "package: name='co.greenalert.mobile'\nassets/index.android.bundle\n");
    write('.local/apk/greenalert.apk.sha256', 'hash incorrecto');
    assert.throws(() => validateApk(root, current), /cambió/);
    write('.local/apk/greenalert.apk.sha256', `${sha256}  greenalert.apk\n`);
    write('.local/apk/greenalert.apk', 'alterada');
    assert.throws(() => validateApk(root, current), /cambió/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
