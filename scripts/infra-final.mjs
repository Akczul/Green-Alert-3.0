import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const vars = Object.fromEntries(readFileSync(new URL('../.env.integracion', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
  }));
const run = args => {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
if (process.argv[2] === 'up') {
  const network = spawnSync('docker', ['network','inspect',vars.GREENALERT_NETWORK], { stdio: 'ignore', windowsHide: true });
  if (network.status !== 0) run(['network','create',vars.GREENALERT_NETWORK]);
}
const args = ['compose','--env-file','.env.integracion','-f','compose.datos.yml','-f','compose.apps.yml'];
if (process.argv[2] === 'up') run([...args,'up','--build','-d','--wait','--wait-timeout','600']);
else if (process.argv[2] === 'down') run([...args,'down']); // Conserva todos los volúmenes.
else throw new Error('Uso: node scripts/infra-final.mjs up|down');
