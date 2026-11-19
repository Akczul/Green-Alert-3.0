import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npm)) throw new Error('Ejecuta este comando mediante npm run.');
const task = process.argv[2];
const children = new Set();
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* proceso ya cerrado */ }
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);

function run(app, args) {
  return new Promise((resolve) => {
    console.log(`[${app}] npm ${args.join(' ')}`);
    const child = spawn(process.execPath, [npm, ...args], {
      cwd: path.join(root, 'apps', app), stdio: 'inherit',
      detached: process.platform !== 'win32', windowsHide: true,
    });
    children.add(child);
    child.on('error', (error) => { console.error(error.message); children.delete(child); resolve(1); });
    child.on('exit', (code) => { children.delete(child); resolve(code ?? 1); });
  });
}

if (task === 'dev') {
  const processes = ['backend', 'frontend'].map((app) => run(app, ['run', 'dev']));
  const firstCode = await Promise.race(processes);
  const interrupted = stopping;
  stop();
  await Promise.all(processes);
  process.exitCode = interrupted ? 0 : firstCode;
} else {
  const tasks = {
    install: [['backend', ['ci', '--no-audit', '--no-fund']], ['frontend', ['ci', '--no-audit', '--no-fund']]],
    test: [['backend', ['test']], ['frontend', ['test']]],
    build: [['frontend', ['run', 'build']]],
  };
  if (!tasks[task]) throw new Error(`Tarea desconocida: ${task}`);
  if (task === 'build') await import('./check-backend.mjs');
  const results = [];
  for (const [app, args] of tasks[task]) results.push(await run(app, args));
  process.exitCode = results.some(Boolean) ? 1 : 0;
}
