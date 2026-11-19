import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFile(path.join(root, file), 'utf8');
const modules = {
  health: 'health', auth: 'auth', reportes: 'reporte', categorias: 'categoria-riesgo',
  admin: 'admin', chatbot: 'chatbot', notificaciones: 'notificacion', entidades: 'entidad',
};
let routes = '# Inventario de endpoints HTTP\n\nGenerado desde `apps/backend/routes/*.routes.js` con `npm run docs:inventory`. Se conserva el orden de registro. En la configuración local, anteponer `/api`; sin `API_PREFIX` el backend monta rutas sin prefijo.\n\n';
routes += 'Acceso expresa los middlewares declarados. Las comprobaciones de propiedad, estado y entidad también se ejecutan en los controladores; no sustituye su revisión. Respuesta habitual: `{status, message, data}`; errores `{status, message}`. `/health` tiene formato propio y devuelve 503 si MySQL no responde.\n\n';
let total = 0;
for (const [prefix, file] of Object.entries(modules)) {
  const source = await read(`apps/backend/routes/${file}.routes.js`);
  routes += `## ${prefix}\n\n| Método | Ruta sin prefijo | Acceso declarado | Controlador |\n| --- | --- | --- | --- |\n`;
  const pattern = /\w+Router\.(get|post|patch|delete)\(\s*['"]([^'"]+)['"],\s*([\s\S]*?)\);/g;
  for (const match of source.matchAll(pattern)) {
    const [, method, route, handlers] = match;
    let access = 'Público';
    if (prefix === 'admin') access = 'JWT; admin';
    else if (prefix === 'notificaciones') access = 'JWT';
    else if (handlers.includes('verifyTokenWhenAllDevicesLogout')) access = 'JWT si allDevices=true';
    else if (handlers.includes('verifyToken')) access = 'JWT';
    else if (handlers.includes('optionalAuth')) access = 'JWT opcional';
    const roles = handlers.match(/requireRoles\(([^)]+)\)/)?.[1];
    if (roles) access += `; ${roles.replace(/'/g, '')}`;
    const handler = handlers.trim().replace(/,\s*$/, '').match(/(\w+)$/)?.[1] || 'ver fuente';
    routes += `| ${method.toUpperCase()} | \`/${prefix}${route === '/' ? '' : route}\` | ${access} | \`${handler}\` |\n`;
    total++;
  }
  routes += '\n';
}
routes += `Total: **${total} registros HTTP**, además de archivos estáticos en \`/uploads\` y Socket.IO en \`/socket.io/\`.\n\n`;
routes += 'Socket.IO: autenticación JWT en `handshake.auth.token` o Authorization Bearer; sala `entidad:<id>`; evento `reporte:critico_asignado`. El frontend actual consulta alertas mediante polling y no incluye un cliente Socket.IO.\n\n';
routes += 'Uploads: `POST /reportes` usa multipart con `file` y `files`; análisis usa `imagen`; evidencia individual usa `file`; avatar usa `avatar`. Para filtros, formatos completos y ejemplos: [OpenAPI conservado](../apps/backend/docs/openapi.yaml) y [contrato institucional](../apps/backend/docs/integracion-frontend-entidades.md). El OpenAPI histórico debe cotejarse con este inventario y el código.\n';
await writeFile(path.join(root, 'docs/endpoints.md'), routes);

let dependencies = '# Tecnologías y dependencias\n\nDeclaraciones y resoluciones de los lockfiles. No se actualizaron los rangos de las bibliotecas originales. El backend original no tenía lockfile: sus resoluciones corresponden a esta consolidación.\n\n';
for (const app of ['backend', 'frontend']) {
  const pkg = JSON.parse(await read(`apps/${app}/package.json`));
  const lock = JSON.parse(await read(`apps/${app}/package-lock.json`));
  dependencies += `## ${app}: ${pkg.name} ${pkg.version}\n\n| Dependencia | Rango original | Resolución | Tipo |\n| --- | --- | --- | --- |\n`;
  for (const kind of ['dependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(pkg[kind] || {})) {
      const resolved = lock.packages?.[`node_modules/${name}`]?.version || 'ver lockfile';
      dependencies += `| \`${name}\` | \`${range}\` | ${resolved} | ${kind} |\n`;
    }
  }
  dependencies += '\n';
}
dependencies += 'Herramientas: JavaScript ESM en ambos proyectos; React JSX; Vite; Tailwind y PostCSS; node:test en backend; Vitest y Testing Library en frontend; ESLint en frontend. Backend ejecutado directamente por Node, sin TypeScript ni compilador. MySQL real: versión del servidor original no determinada; el entorno local propuesto usa MySQL 8.4.\n\n';
dependencies += 'Runtime original de Docker/CI: Node 20. Runtime consolidado de referencia: Node 24; `.nvmrc`, Docker y CI alineados. Node 20 está fuera de soporte según [Node.js Releases](https://nodejs.org/en/about/previous-releases). Validación local realizada en Node 26.13.0/npm 11.20.0; la fase SQL construyó y ejecutó el stack Docker con imágenes Node 24. La CI remota sigue sin ejecutarse. `apps/frontend/.npmrc` conserva `legacy-peer-deps=true` por la resolución existente de ESLint/plugins.\n';
await writeFile(path.join(root, 'docs/dependencias.md'), dependencies);

const skipped = new Set(['node_modules', '.git', '.npm-cache', 'dist', 'uploads', 'certs']);
async function envNames(dir) {
  const names = new Set();
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory() && !skipped.has(entry.name)) await walk(file);
      else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
        for (const match of (await readFile(file, 'utf8')).matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g)) names.add(match[1]);
      }
    }
  }
  await walk(path.join(root, dir));
  return [...names].sort();
}
let environment = '# Variables de entorno detectadas\n\nGeneradas desde referencias literales en código; incluye variables exclusivas de pruebas. Se omiten los valores. Los ejemplos de configuración están en `.env.example` y en cada aplicación.\n\n';
for (const app of ['backend', 'frontend']) environment += `## ${app}\n\n${(await envNames(`apps/${app}`)).map((name) => `- \`${name}\``).join('\n')}\n\n`;
environment += 'Arranque backend: configurar MySQL y JWT; la validación de correo exige EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS y EMAIL_FROM incluso con transporte JSON. `npm run setup` prepara valores locales de prueba. `API_PREFIX=/api` coincide con el proxy conservado. Variables VITE_* se incorporan al compilar; no se modifican en runtime Nginx. `VITE_API_URL` aparece en documentación histórica, pero Axios usa `/api` de manera fija.\n\n';
environment += 'Servicios opcionales: Cloudinary para crear evidencias/avatar; OAuth Google/Facebook con credenciales y redirects propios; HF/Groq/Gemini para inferencia remota; Firebase para push. El service worker conserva configuración pública histórica y necesita alineación manual al cambiar de proyecto Firebase. Nunca copiar claves privadas al frontend.\n';
await writeFile(path.join(root, 'docs/variables-entorno.md'), environment);
console.log(`Inventario actualizado: ${total} endpoints, dependencias y nombres de variables (sin secretos).`);
