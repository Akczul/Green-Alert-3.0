import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { freePort } from './mysql-sandbox.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../.local/integracion/', import.meta.url);
await mkdir(output, { recursive: true });
const reuse = process.argv.includes('--reuse-session-sandbox');
const config = Object.fromEntries((await readFile(new URL('../.env.integracion', import.meta.url), 'utf8'))
  .split(/\r?\n/).filter(x => /^[A-Z_]+=/.test(x)).map(x => {
    const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1)];
  }));
if (reuse) {
  const marker = JSON.parse(await readFile(new URL('sandbox.json', output), 'utf8'));
  assert.equal(marker.project, config.COMPOSE_PROJECT_NAME);
  assert.equal(marker.synthetic, true);
}
const id = 'ga-final-test-' + randomBytes(5).toString('hex');
const env = { ...process.env, ...config,
  ...(reuse ? {} : { COMPOSE_PROJECT_NAME: id, GREENALERT_NETWORK: id, FRONTEND_PORT: String(await freePort()) }) };
const baseArgs = ['compose','--env-file','.env.integracion','-f','compose.datos.yml','-f','compose.apps.yml'];
const checks = [];
async function docker(args, compose = true) {
  const child = spawn('docker', [...(compose ? baseArgs : []), ...args],
    { cwd: root, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let out=''; let err='';
  child.stdout.on('data', x => { out += x; }); child.stderr.on('data', x => { err += x; });
  const [code] = await once(child,'exit');
  if (code !== 0) throw new Error(`Docker ${args[0]} falló: ${err.slice(-1200)}`);
  return out;
}
async function check(name, fn) {
  const start = performance.now();
  try { await fn(); checks.push({ name, status:'passed', ms: +(performance.now()-start).toFixed(2) }); console.log('OK: '+name); }
  catch (e) { checks.push({ name, status:'failed', message:e.message }); console.error('FALLO: '+name+': '+e.message); }
}
async function eventually(fn, timeoutMs = 120000) {
  const until = Date.now() + timeoutMs;
  let failure;
  do {
    try { return await fn(); } catch (e) { failure = e; }
    await new Promise(resolve => setTimeout(resolve, 1500));
  } while (Date.now() < until);
  throw failure;
}
const origin = 'http://127.0.0.1:'+env.FRONTEND_PORT;
async function api(method, route, body, token, expected=200) {
  const response = await fetch(origin+'/api'+route, { method,
    headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? { Authorization:'Bearer '+token } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(250000) });
  const data = await response.json();
  assert.equal(response.status, expected, route+': '+JSON.stringify(data));
  return data.data ?? data;
}
async function sql(query, values=[]) {
  return JSON.parse(await docker(['exec','-T','backend-prod','node','--input-type=module','-e',
    `import pool from './src/config/database.js'; const [r]=await pool.execute(${JSON.stringify(query)},${JSON.stringify(values)}); console.log(JSON.stringify(r)); await pool.end();`]));
}
let auth; let citizen; let report; let run; let countAfterInvalidation; let readyAdmin=false;
const suffix=randomBytes(5).toString('hex');
const profile={nombre:'Integracion',apellido:'Sintetica',email:suffix+'@example.test',password:'Senderos ambientales conservan agua '+suffix};
try {
  if (!reuse) await docker(['network','create',env.GREENALERT_NETWORK],false);
  await check('Compose global compilado y todos los servicios saludables', () => docker(['up','--build','-d','--wait','--wait-timeout','600']));
  // Cada repetición del sandbox comienza con un proceso limpio, igual que un proyecto nuevo.
  // Evita sumar los intentos del runner anterior al rate limit productivo, que sigue en 5.
  if(reuse) { await docker(['restart','backend-prod']); await eventually(()=>api('GET','/health')); }
  await check('React compilado y proxy HTTP hacia Express/MySQL', async () => {
    assert.match(await (await fetch(origin)).text(), /id="root"/);
    assert.equal((await api('GET','/health')).database,'conectada');
  });
  await check('Registro único ante dos altas simultáneas y sesión revocable', async () => {
    const results = await Promise.all([1,2].map(() => fetch(origin+'/api/auth/register',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile) })));
    assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
    auth=(await results.find(x=>x.status===201).json()).data;
    citizen=auth;
    await api('POST','/integracion/analisis/riesgo',{},auth.token,403);
  });
  if (!auth) throw new Error('No existe sesión de prueba; se omiten recorridos dependientes.');
  await check('Alta real genera hecho y outbox en la misma transacción MySQL',async()=>{
    report=(await api('POST','/reportes',{tipo_contaminacion:'agua',nivel_severidad:'alto',
      titulo:'Integración '+suffix,direccion:'Laboratorio sintético',latitud:1.15,longitud:-76.65},citizen.token,201)).reporte;
    const rows=await sql('SELECT event_id FROM integration_outbox WHERE report_uuid=?',[report.uuid]);
    assert.equal(rows.length,1);
    await sql('UPDATE usuarios SET rol=? WHERE email=?',['admin',profile.email]);
    await api('POST','/auth/login',profile,null,403);
    const adminId=(await sql('SELECT id_usuario FROM usuarios WHERE email=?',[profile.email]))[0].id_usuario;
    const code=(await docker(['exec','-T','backend-prod','node','--input-type=module','-e',
      `import {adminMfa} from './src/bootstrap/admin-mfa.js'; const f=await adminMfa.provision(${Number(adminId)});console.log(f.initialCode);process.exit();`])).trim();
    auth=await api('POST','/auth/login',{...profile,totp:code});
    await api('POST','/auth/login',{...profile,totp:code},null,403);
    readyAdmin=true;
    await api('PATCH','/reportes/'+report.id_reporte,{estado:'en_proceso'},auth.token);
  });
  if (!report || !readyAdmin) throw new Error('No hay reporte/sesión administrativa de prueba; se omiten recorridos dependientes.');
  await check('React/proxy → Express → FastAPI → MongoDB conserva ejecución de snapshot MySQL',async()=>{
    run=await api('POST','/integracion/analisis/riesgo',{dias:30},auth.token);
    assert.equal(run.source_kind,'mysql'); assert.ok(run.results.zonas.length);
    const count=await docker(['exec','-T','analytics','python','-c',
      `import os; from pymongo import MongoClient; c=MongoClient(os.environ['ANALYTICS_MONGO_URI']); print(c.greenalert_analytics.analytics_runs.count_documents({'run_id':'${run.run_id}'}))`]);
    assert.equal(Number(count.trim()),1);
  });
  await check('Express → Spring → Cassandra conserva historial e idempotencia outbox',async()=>{
    await api('POST','/integracion/eventos/reenviar',{},auth.token);
    const history=await api('GET','/integracion/reportes/'+report.id_reporte+'/historial',null,auth.token);
    assert.ok(history.length>=2); assert.equal(history[0].reportId,report.uuid);
    assert.equal(new Set(history.map(x=>x.eventId)).size,history.length);
    const event=history.find(x=>x.type==='REPORT_CREATED');
    const receipts=await docker(['exec','-T','backend-prod','node','--input-type=module','-e',
      `const event=${JSON.stringify(event)}; const r=await Promise.all([1,2].map(()=>fetch(process.env.EVENTS_URL+'/api/v1/events',{method:'POST',headers:{Authorization:'Bearer '+process.env.EVENTS_SERVICE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(event)}).then(r=>r.status))); console.log(JSON.stringify(r));`]);
    assert.deepEqual(JSON.parse(receipts),[200,200]);
  });
  await check('Spring reconcilia Cassandra → Druid y consulta indicadores ambientales',async()=>{
    const day=new Date().toISOString().slice(0,10);
    const projection=await api('POST','/integracion/eventos/reconciliar/'+day,{},auth.token);
    assert.equal(projection.state,'SUCCESS');
    await eventually(async()=>{
      const values=await api('GET','/integracion/indicadores',null,auth.token);
      assert.ok(values.some(x=>x.reportsCreated>=1));
    });
  });
  await check('Redis cache-aside con acierto y métricas de latencia',async()=>{
    await api('GET','/reportes/zonas-riesgo?min_score=0',null,auth.token);
    await api('GET','/reportes/zonas-riesgo?min_score=0',null,auth.token);
    const metrics=await api('GET','/integracion/cache/metricas',null,auth.token);
    assert.ok(metrics.hits>=1); assert.ok(metrics.misses>=1); assert.equal(metrics.ready,true);
  });
  await check('Redis caído → MySQL, invalidación durable y recuperación sin datos obsoletos',async()=>{
    await docker(['stop','redis']);
    try {
      const before=await api('GET','/reportes/zonas-riesgo?min_score=0',null,auth.token); assert.ok(before.zonas.length);
      await api('PATCH','/reportes/'+report.id_reporte,{estado:'rechazado',comentario_moderacion:'Prueba sintética de invalidación'},auth.token);
      const after=await api('GET','/reportes/zonas-riesgo?min_score=0',null,auth.token);
      assert.ok(after.zonas.reduce((sum,x)=>sum+x.n_reportes,0)<before.zonas.reduce((sum,x)=>sum+x.n_reportes,0));
      countAfterInvalidation = after.zonas.reduce((sum,x)=>sum+x.n_reportes,0);
    } finally { await docker(['start','redis']); }
    await eventually(async()=>{
      const recovered=await api('GET','/reportes/zonas-riesgo?min_score=0',null,auth.token);
      assert.equal(recovered.zonas.reduce((sum,x)=>sum+x.n_reportes,0),countAfterInvalidation);
    });
  });
  await check('Permisos de objeto y credenciales internas inaccesibles al navegador',async()=>{
    const outsider={...profile,email:'other-'+profile.email};
    const session=await api('POST','/auth/register',outsider,null,201);
    await api('GET','/integracion/reportes/'+report.id_reporte+'/historial',null,session.token,404);
    await api('GET','/integracion/indicadores',null,session.token,403);
    const r=await docker(['exec','-T','backend-prod','node','--input-type=module','-e',
      "console.log((await fetch(process.env.EVENTS_URL+'/api/v1/indicators')).status)"]);
    assert.equal(Number(r.trim()),401);
    assert.ok(!JSON.stringify(auth).includes(env.EVENTS_SERVICE_TOKEN));
  });
  await check('Outbox sobrevive caída de Spring y entrega tras recuperación',async()=>{
    await docker(['stop','events']);
    let queued;
    try {
      queued=(await api('POST','/reportes',{tipo_contaminacion:'aire',nivel_severidad:'medio',
        titulo:'Entrega pendiente '+suffix,direccion:'Laboratorio de recuperación',latitud:1.16,longitud:-76.66},auth.token,201)).reporte;
      await api('POST','/integracion/eventos/reenviar',{},auth.token);
      const rows=await sql('SELECT COUNT(*) AS n FROM integration_outbox WHERE report_uuid=? AND delivered_at IS NULL',[queued.uuid]);
      assert.ok(Number(rows[0].n)>0);
    } finally { await docker(['start','events']); }
    await docker(['up','-d','--wait','--wait-timeout','120','events']);
    await sql('UPDATE integration_outbox SET available_at=UTC_TIMESTAMP(3) WHERE report_uuid=? AND delivered_at IS NULL',[queued.uuid]);
    await api('POST','/integracion/eventos/reenviar',{},auth.token);
    const rows=await sql('SELECT COUNT(*) AS n FROM integration_outbox WHERE report_uuid=? AND delivered_at IS NULL',[queued.uuid]);
    assert.equal(Number(rows[0].n),0);
  });
  await check('MySQL MongoDB Cassandra Redis conservan datos tras reiniciar contenedores',async()=>{
    await docker(['restart','mysql','mongo','cassandra','redis']);
    await docker(['up','-d','--wait','--wait-timeout','600']);
    await eventually(()=>api('GET','/health'));
    assert.equal((await sql('SELECT COUNT(*) AS n FROM reportes WHERE uuid=?',[report.uuid]))[0].n,1);
    await eventually(async()=>assert.ok((await api('GET','/integracion/reportes/'+report.id_reporte+'/historial',null,auth.token)).length>=3));
    const count=await docker(['exec','-T','analytics','python','-c',
      `import os; from pymongo import MongoClient; c=MongoClient(os.environ['ANALYTICS_MONGO_URI']); print(c.greenalert_analytics.analytics_runs.count_documents({'run_id':'${run.run_id}'}))`]);
    assert.equal(Number(count.trim()),1);
  });
  await check('Concurrencia E/S Express con respuestas consistentes y medición',async()=>{
    const path='/reportes/'+report.id_reporte+'?skip_view=true';
    const start=performance.now();
    for(let i=0;i<12;i++) await api('GET',path,null,auth.token);
    const sequentialMs=performance.now()-start;
    const concurrentStart=performance.now();
    const results=await Promise.all(Array.from({length:12},()=>api('GET',path,null,auth.token)));
    const concurrentMs=performance.now()-concurrentStart;
    assert.ok(results.every(x=>x.reporte.uuid===report.uuid));
    await writeFile(new URL('medicion.json',output),JSON.stringify({requests:12,sequentialMs,concurrentMs,
      scope:'Lecturas reales HTTP proxy, E/S concurrente; muestra exploratoria local, sin promesa de speedup'},null,2));
    const stats=await docker(['stats','--no-stream','--format','{{json .}}'],false);
    await writeFile(new URL('docker-stats.jsonl',output),stats);
  });
  await check('Logout revoca inmediatamente JWT y refresh en API final',async()=>{
    await api('POST','/auth/logout',{refreshToken:auth.refreshToken},auth.token);
    await api('GET','/auth/perfil',null,auth.token,403);
    await api('POST','/auth/refresh',{refreshToken:auth.refreshToken},null,401);
  });
  await check('Auditoría durable identifica al autor de operaciones críticas',async()=>{
    const rows=await sql('SELECT COUNT(*) AS n FROM security_audit WHERE actor_id=?',[auth.user.id_usuario]);
    assert.ok(Number(rows[0].n)>=4);
  });
  await check('Inactividad y duración máxima sobreviven a la rotación de JWT',async()=>{
    const account={...profile,email:'limits-'+profile.email};
    let session=await api('POST','/auth/register',account,null,201);
    await sql("UPDATE session_activity SET last_seen_at=UTC_TIMESTAMP()-INTERVAL 31 MINUTE WHERE id_usuario=?",[session.user.id_usuario]);
    await api('GET','/auth/perfil',null,session.token,403);
    await api('POST','/auth/refresh',{refreshToken:session.refreshToken},null,401);
    session=await api('POST','/auth/login',account);
    await sql("UPDATE session_activity SET started_at=UTC_TIMESTAMP()-INTERVAL 8 DAY WHERE id_usuario=?",[session.user.id_usuario]);
    await api('GET','/auth/perfil',null,session.token,403);
  });
} catch (e) { checks.push({name:'Preparación de integración',status:'failed',message:e.message}); }
finally {
  await writeFile(new URL('resultado.json',output),JSON.stringify({project:env.COMPOSE_PROJECT_NAME,
    checkedAt:new Date().toISOString(),checks,limitations:['Sin navegador interactivo, teléfono físico ni proveedores remotos.']},null,2));
  console.log('Integración: '+checks.filter(x=>x.status==='passed').length+' correctas, '+checks.filter(x=>x.status==='failed').length+' fallidas.');
  if(checks.some(x=>x.status==='failed')) process.exitCode=1;
  // Se conservan contenedores/volúmenes sintéticos para inspección y demostración.
  if(!reuse) console.log('Sandbox conservado: '+env.COMPOSE_PROJECT_NAME+'; red '+env.GREENALERT_NETWORK+'; puerto '+env.FRONTEND_PORT);
}
