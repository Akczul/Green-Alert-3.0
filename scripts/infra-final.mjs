// Despliegue integrado en DOS proyectos Compose independientes unidos por una red externa:
//   1. datos  (compose.datos.yml, proyecto COMPOSE_PROJECT_NAME): cinco motores, espera healthchecks.
//   2. apps   (compose.apps.yml, proyecto <datos>-apps): tres backends y web.
// Uso: node scripts/infra-final.mjs up|down|status|migrar-024. `down` conserva todos los volúmenes.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const vars = Object.fromEntries(readFileSync(new URL('../.env.integracion', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
  }));
const run = (args, options = {}) => {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
};
const dataProject = vars.COMPOSE_PROJECT_NAME || 'greenalert-final';
const appsProject = `${dataProject}-apps`;
const env = { ...process.env, GREENALERT_DATA_PROJECT: dataProject };
const datos = ['compose', '-p', dataProject, '--env-file', '.env.integracion', '-f', 'compose.datos.yml'];
const apps = ['compose', '-p', appsProject, '--env-file', '.env.integracion', '-f', 'compose.apps.yml'];
const command = process.argv[2];
if (command === 'up') {
  const network = spawnSync('docker', ['network', 'inspect', vars.GREENALERT_NETWORK], { stdio: 'ignore', windowsHide: true });
  if (network.status !== 0) run(['network', 'create', vars.GREENALERT_NETWORK]);
  // --remove-orphans retira solo contenedores de aplicaciones creados por el esquema anterior de un
  // único proyecto (mismo nombre); nunca elimina volúmenes.
  run([...datos, 'up', '-d', '--wait', '--wait-timeout', '600', '--remove-orphans'], { env });
  run([...apps, 'up', '--build', '-d', '--wait', '--wait-timeout', '600'], { env });
} else if (command === 'down') {
  run([...apps, 'down'], { env });
  run([...datos, 'down'], { env }); // Conserva todos los volúmenes.
} else if (command === 'status') {
  run([...datos, 'ps'], { env });
  run([...apps, 'ps'], { env });
} else if (command === 'migrar-024') {
  // Solo para un volumen MySQL creado antes de la jerarquía administrativa. Comprueba antes de aplicar.
  const probe = spawnSync('docker', [...datos, 'exec', '-T', 'mysql', 'sh', '-c',
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N greenalert -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=\'usuarios\' AND COLUMN_NAME=\'nivel_admin\'"'],
    { cwd: root, env, encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) process.exit(probe.status ?? 1);
  if (probe.stdout.trim() === '1') { console.log('La migración 024 ya está aplicada.'); process.exit(0); }
  run([...datos, 'exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot greenalert'],
    { env, input: readFileSync(new URL('../apps/backend/migrations/024_admin_hierarchy.sql', import.meta.url)), stdio: ['pipe', 'inherit', 'inherit'] });
  console.log('Migración 024 aplicada. Inicializa el superadministrador con npm run infra:final:superadmin -- correo');
} else {
  throw new Error('Uso: node scripts/infra-final.mjs up|down|status|migrar-024');
}
