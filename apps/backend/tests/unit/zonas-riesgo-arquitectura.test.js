import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

test('dominio/aplicación solo importan capas internas y no leen entorno ni infraestructura', async () => {
  const root = new URL('../../src/modules/zonas-riesgo/', import.meta.url);
  for (const layer of ['domain', 'application']) {
    const directory = new URL(`${layer}/`, root);
    for (const file of await readdir(directory)) {
      const source = await readFile(new URL(file, directory), 'utf8');
      assert.doesNotMatch(source, /process\.env|Date\.now\(|express|mysql2|models\/|config\/|bootstrap\/|adapters\//, `${layer}/${file}`);
      for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
        const dependency = new URL(match[1], new URL(file, directory));
        assert.ok(dependency.href.startsWith(new URL('domain/', root).href) || dependency.href.startsWith(new URL('application/', root).href), `${file} -> ${match[1]}`);
      }
    }
  }
});
