import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backend = fileURLToPath(new URL('../apps/backend/', import.meta.url));
const ignored = new Set(['node_modules', '.git', '.npm-cache', 'uploads', 'certs']);
let count = 0;
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) await check(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', windowsHide: true });
      if (result.status !== 0) throw new Error(`Sintaxis inválida: ${path.relative(backend, file)}`);
      count++;
    }
  }
}
await check(backend);
console.log(`Backend: ${count} archivos JavaScript válidos; se ejecuta directamente, sin transpilar.`);
