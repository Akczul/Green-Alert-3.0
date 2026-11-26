import { seedSessionClaims } from './test-session-fixtures.mjs';
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import jwt from '../apps/backend/node_modules/jsonwebtoken/index.js';
import { startDockerMysql, executeSqlFile } from './mysql-sandbox.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const capture = process.argv.includes('--capture');
const fixtureFile = path.join(root, 'apps/backend/tests/fixtures/reportes-lectura/contrato.json');
if (capture) execFileSync('git', ['diff', '--exit-code', '6e6f5d1', '--', 'apps/backend/src'], { cwd: root, stdio: 'pipe' });
const expected = capture ? null : JSON.parse(await readFile(fixtureFile, 'utf8'));
const sandbox = await startDockerMysql();
let child;
const cases = [];
try {
  const admin = sandbox.admin;
  const database = `greenalert_validation_read_${randomBytes(5).toString('hex')}`;
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.changeUser({ database });
  await executeSqlFile(admin, await readFile(path.join(root, 'apps/backend/DATABASE_SCHEMA_COMPLETE.sql'), 'utf8'));
  const ids = [1,2,3,4,5];
  for (const id of ids) await admin.execute('INSERT INTO usuarios (id_usuario,uuid,nombre,apellido,email,password_hash,rol,id_entidad) VALUES (?,?,?,?,?,?,?,?)',
    [id, `00000000-0000-4000-8000-${String(id).padStart(12,'0')}`, `Persona ${id}`, 'Sintetica', `persona${id}@example.test`, 'fixture-no-login', ['ciudadano','admin','moderador','entidad','ciudadano'][id-1], id===4 ? 1 : null]);
  const reports = [
    [10,1,'agua','en_proceso','alto','Mocoa',5,2], [11,1,'aire','pendiente','medio','Pasto',2,1],
    [12,5,'agua','resuelto','bajo','Mocoa',1,10], [13,5,'residuos','rechazado','critico','Pasto',0,0],
    [14,1,'suelo','pendiente','alto','Mocoa',20,0],
  ];
  for (const [id,author,tipo,status,severity,city,votes,views] of reports) await admin.execute(`INSERT INTO reportes
    (id_reporte,uuid,id_usuario,tipo_contaminacion,estado,nivel_severidad,titulo,descripcion,municipio,departamento,latitud,longitud,ia_etiquetas,ia_confianza,ia_procesado,confianza_evidencia,votos_relevancia,vistas,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  [id,`10000000-0000-4000-8000-${String(id).padStart(12,'0')}`,author,tipo,status,severity,`Reporte ${id}`,'Contenido sintético',city,'Putumayo',id===11?null:1.15,id===11?null:-120.25,JSON.stringify(['agua','prueba']), '75.50',1,64,votes,views,`2026-11-${String(id).padStart(2,'0')} 11:00:00`,`2026-11-${String(id).padStart(2,'0')} 11:00:00`,id===14?'2026-11-15 11:00:00':null]);
  await admin.query("INSERT INTO reporte_entidades (id_reporte,id_entidad,prioridad,estado_atencion,asignado_at) VALUES (10,1,'alta','en_atencion','2026-11-12 10:00:00'),(10,2,'media','atendido','2026-11-11 10:00:00'),(12,1,'critica','pendiente','2026-11-11 09:00:00')");
  for (const [id,deleted] of [[1,true],[2,false]]) await admin.execute("INSERT INTO evidencias (id_evidencia,uuid,id_reporte,id_usuario,tipo_archivo,url_archivo,orden,created_at,deleted_at) VALUES (?,?,10,1,'imagen',?,?,?,?)",
    [id,`20000000-0000-4000-8000-${String(id).padStart(12,'0')}`,`/uploads/imagen-${id}.png`,id-1,'2026-11-15 12:00:00',deleted?'2026-11-16 12:00:00':null]);
  await admin.query('INSERT INTO reporte_likes (id_reporte,id_usuario) VALUES (10,1),(12,1)');
  const password = randomBytes(24).toString('hex');
  await admin.query("CREATE USER 'ga_read'@'%' IDENTIFIED BY ?", [password]);
  await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO 'ga_read'@'%'`);
  const secret = randomBytes(32).toString('hex');
  child = fork(path.join(root, 'scripts/reportes-read-worker.mjs'), [], { cwd: path.join(root,'apps/backend'), stdio: ['ignore','pipe','pipe','ipc'], env: {
    ...process.env, TZ:'UTC', NODE_ENV:'production', API_PREFIX:'/api', JWT_SECRET:secret,
    DB_HOST:'127.0.0.1', DB_PORT:String(sandbox.config.port), DB_NAME:database, DB_USER:'ga_read', DB_PASSWORD:password, DB_SSL:'false',
    HF_API_KEY:'',GROQ_API_KEY:'',GEMINI_API_KEY:'',CLOUDINARY_CLOUD_NAME:'',CLOUDINARY_API_KEY:'',CLOUDINARY_API_SECRET:'',FIREBASE_SERVICE_ACCOUNT_JSON:'',FIREBASE_PRIVATE_KEY:'',
  } });
  let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',(chunk)=>{logs+=chunk;});
  const ready = await new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); };
    const onMessage = (message) => { cleanup(); resolve(message); };
    const onExit = (code) => { cleanup(); reject(new Error(`Servidor de contratos terminó durante el arranque (${code}).`)); };
    const onError = (error) => { cleanup(); reject(error); };
    const timer = setTimeout(() => { cleanup(); child.kill(); reject(new Error('Servidor de contratos no inició en 30 segundos.')); }, 30000);
    child.once('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
  const ask = async(type)=>{const promise=once(child,'message');child.send({type});return (await promise)[0];};
  const subjects = { citizen:{sub:1,rol:'ciudadano'},admin:{sub:2,rol:'admin'},moderator:{sub:3,rol:'moderador'},entity:{sub:4,rol:'entidad',id_entidad:1},entity_missing:{sub:4,rol:'entidad'},entity_outside:{sub:4,rol:'entidad',id_entidad:9999} };
  const scenarios = [
    ['list-anonymous','/reportes'], ['list-citizen','/reportes','citizen'], ['list-invalid-jwt','/reportes','invalid'],
    ['list-filter','/reportes?estado=en%20proceso&tipo_contaminacion=agua&municipio=Mocoa&nivel_severidad=alto','admin'],
    ['list-page','/reportes?limit=1&offset=1'], ['list-empty-page','/reportes?limit=1&offset=99'], ['list-q-ignored','/reportes?q=no-coincide'],
    ['list-scientific-limit','/reportes?limit=1e2'], ['list-zero','/reportes?limit=0&offset=-4'],
    ['list-entity','/reportes?estado=pendiente&municipio=NoCoincide','entity'], ['list-entity-filter','/reportes?tipo_contaminacion=agua&nivel_severidad=alto&limit=0','entity'],
    ['list-entity-missing','/reportes','entity_missing'],['list-entity-outside','/reportes','entity_outside'],
    ['own','/reportes/mis-reportes','citizen'],['own-filter','/reportes/mis-reportes?estado=%20pendiente%20&nivel_severidad=%20medio%20&limit=1','citizen'],
    ['own-no-normalize','/reportes/mis-reportes?estado=en%20proceso','citizen'],['own-offset','/reportes/mis-reportes?limit=1&offset=1','citizen'],['own-anonymous','/reportes/mis-reportes'],['own-invalid','/reportes/mis-reportes','invalid'],
    ['trending-anonymous','/reportes/trending?limit=2'],['trending-citizen','/reportes/trending?limit=3','citizen'],['trending-entity','/reportes/trending?tipo_contaminacion=aire&limit=3','entity'],
    ['detail-skip','/reportes/10?skip_view=true','citizen'],['detail-entity-assigned','/reportes/10?skip_view=true','entity'],['detail-entity-forbidden','/reportes/11?skip_view=true','entity'],
    ['detail-entity-absent','/reportes/9999?skip_view=true','entity'],['detail-not-found','/reportes/9999?skip_view=true'],['detail-deleted','/reportes/14?skip_view=true'],['detail-invalid-id','/reportes/no-id'],
    ['detail-anonymous-first','/reportes/10'],['detail-anonymous-repeat','/reportes/10'],['detail-citizen-first','/reportes/10','citizen'],['detail-citizen-repeat','/reportes/10','citizen'],
  ];
  for (const [name,url,subject] of scenarios) {
    await ask('reset');
    // Las negativas institucionales siguen siendo usuarios/sesiones reales, sin falsificar ámbito en el JWT.
    await admin.execute('UPDATE usuarios SET id_entidad=? WHERE id_usuario=4', [name==='list-entity-missing'?null:1]);
    await admin.execute('UPDATE entidades SET activo=? WHERE id_entidad=1', [name==='list-entity-outside'?0:1]);
    const token = subject==='invalid'?'invalid':subject?jwt.sign({...await seedSessionClaims(admin,subjects[subject]),exp:Date.parse('2026-11-18T13:00:00Z')/1000},secret,{noTimestamp:true}):null;
    const response=await fetch(`http://127.0.0.1:${ready.port}/api${url}`,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'greenalert-read-contract',...(token?{Authorization:`Bearer ${token}`}:{})}});
    const entry={name,url,subject:subject??null,status:response.status,body:await response.json(),trace:(await ask('trace')).trace};
    const [[views]]=await admin.query('SELECT vistas FROM reportes WHERE id_reporte=10');entry.persistedViews=views.vistas;
    if(!capture){const old=expected.cases.find(c=>c.name===name);assert.ok(old,`Falta caracterización: ${name}`);assert.deepEqual({status:entry.status,body:entry.body,persistedViews:entry.persistedViews},{status:old.status,body:old.body,persistedViews:old.persistedViews},name);}
    cases.push(entry); console.log(`OK: ${name}`);
  }
  if(capture){await mkdir(path.dirname(fixtureFile),{recursive:true});await writeFile(fixtureFile,JSON.stringify({reference:'6e6f5d1',now:Date.parse('2026-11-18T12:00:00Z'),cases},null,2)+'\n',{flag:'wx'});}
  await mkdir(path.join(root,'.local/mysql-validation'),{recursive:true});
  await writeFile(path.join(root,'.local/mysql-validation/reportes-lectura.json'),JSON.stringify({capture,passed:cases.length,reference:'6e6f5d1'},null,2)+'\n');
  console.log(`${cases.length} contratos HTTP/MySQL ${capture?'capturados antes del refactor':'equivalentes al original'}.`);
} finally {
  if(child?.connected){child.send({type:'stop'});await once(child,'exit');}
  await sandbox.stop();
}
