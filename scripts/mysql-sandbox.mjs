import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, access } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import mysql from '../apps/backend/node_modules/mysql2/promise.js';
import { fileURLToPath } from 'node:url';

export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function executeSqlFile(connection, sql) {
  // DELIMITER es una directiva del cliente, no SQL enviado al servidor.
  let delimiter = ';';
  let statement = '';
  let count = 0;
  for (const line of sql.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/)) {
    const command = line.trim().match(/^DELIMITER\s+(\S+)$/i);
    if (command) { delimiter = command[1]; continue; }
    if (line.trim().startsWith('--')) continue;
    statement += `${line}\n`;
    if (statement.trimEnd().endsWith(delimiter)) {
      const query = statement.trimEnd().slice(0, -delimiter.length).trim();
      statement = '';
      if (query) { await connection.query(query); count++; }
    }
  }
  if (statement.replace(/\/\*[\s\S]*?\*\//g, '').trim()) throw new Error('SQL incompleto al finalizar el archivo.');
  return count;
}

export async function startNativeMysql() {
  const executable = process.env.MYSQLD_PATH || 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe';
  try { await access(executable); } catch {
    throw new Error('No se encontró mysqld. Define MYSQLD_PATH o utiliza el Compose de validación documentado.');
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'greenalert-mysql-'));
  const data = path.join(directory, 'data');
  await mkdir(data);
  const basedir = path.dirname(path.dirname(executable));
  console.log('Inicializando MySQL temporal independiente; no se usa el servicio MySQL80.');
  const init = spawn(executable, ['--no-defaults', '--initialize-insecure', `--basedir=${basedir}`, `--datadir=${data}`, `--log-error=${path.join(directory, 'initialize.log')}`], { windowsHide: true, stdio: 'ignore' });
  const [initCode] = await once(init, 'exit');
  if (initCode !== 0) throw new Error(`Falló la inicialización MySQL (${initCode}); revisar ${directory}/initialize.log`);
  const port = await freePort();
  const child = spawn(executable, ['--no-defaults', `--basedir=${basedir}`, `--datadir=${data}`, `--port=${port}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', '--skip-log-bin', `--log-error=${path.join(directory, 'server.log')}`], { windowsHide: true, stdio: 'ignore' });
  const exited = once(child, 'exit');
  const config = { host: '127.0.0.1', port, user: 'root', password: '', connectTimeout: 1000 };
  let admin;
  try {
    for (let attempt = 0; attempt < 90; attempt++) {
      if (child.exitCode !== null) throw new Error(`MySQL temporal terminó; revisar ${directory}/server.log`);
      try { admin = await mysql.createConnection(config); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
    }
    if (!admin) throw new Error(`MySQL temporal no respondió; revisar ${directory}/server.log`);
    const password = randomBytes(32).toString('hex');
    await admin.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [password]);
    config.password = password;
    await admin.changeUser({ password });
    console.log(`MySQL temporal preparado en loopback:${port}; datos aislados en ${directory}`);
    return {
      admin, config, directory,
      async stop() {
        try { await admin.query('SHUTDOWN'); } catch { /* SHUTDOWN puede cerrar el socket antes de responder. */ }
        await admin.end().catch(() => {});
        const finished = await Promise.race([exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 10000))]);
        if (!finished && child.exitCode === null) { child.kill(); await exited; }
        console.log('MySQL temporal detenido; el servicio y los datos existentes no se modificaron.');
      },
    };
  } catch (error) {
    await admin?.end().catch(() => {});
    child.kill();
    await exited;
    throw error;
  }
}

export async function startDockerMysql({ configOnly = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'greenalert-mysql-docker-'));
  const config = { host: '127.0.0.1', port: await freePort(), user: 'root', password: randomBytes(32).toString('hex'), connectTimeout: 2000 };
  const project = `ga-validation-${randomBytes(6).toString('hex')}`;
  const compose = fileURLToPath(new URL('../infra/compose.validation.yml', import.meta.url));
  async function command(args) {
    const child = spawn('docker', ['compose', '--project-name', project, '--file', compose, ...args], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GREENALERT_TEST_ROOT_PASSWORD: config.password, GREENALERT_TEST_PORT: String(config.port) },
    });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk; });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error(`Docker Compose: ${output.slice(-1500)}`);
    return output;
  }
  if (configOnly) { await command(['config', '--quiet']); console.log('Compose de validación correcto; sin iniciar servicios.'); return; }
  console.log('Iniciando MySQL Docker aislado para validación...');
  try {
    await command(['up', '-d', '--wait', '--wait-timeout', '150', 'mysql']);
    const admin = await mysql.createConnection(config);
    return {
      admin, config, directory,
      async stop() { await admin.end(); await command(['down', '--timeout', '10']); console.log('Contenedor de validación propio eliminado; sin volúmenes persistentes.'); },
    };
  } catch (error) {
    const logs = await command(['logs', '--no-color', 'mysql']).catch(() => 'No fue posible obtener logs de MySQL.');
    await command(['down', '--timeout', '10']).catch(() => {});
    throw new Error(`${error.message}\n${logs.slice(-2500)}`);
  }
}
