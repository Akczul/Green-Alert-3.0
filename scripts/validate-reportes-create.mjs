import { seedSessionClaims } from './test-session-fixtures.mjs';
import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import jwt from '../apps/backend/node_modules/jsonwebtoken/index.js';
import { startDockerMysql, startNativeMysql, executeSqlFile } from './mysql-sandbox.mjs';

process.env.TZ = 'UTC';
const root = fileURLToPath(new URL('../', import.meta.url));
const capture = process.argv.includes('--capture');
if (capture) execFileSync('git', ['diff', '--exit-code', '2a4946b', '--', 'apps/backend/src'], { cwd: root, stdio: 'pipe' });
const fixtureFile = path.join(root, 'apps/backend/tests/fixtures/reportes-creacion/contrato.json');
const expected = capture ? null : JSON.parse(await readFile(fixtureFile, 'utf8'));
const canonical = (value) => JSON.parse(JSON.stringify(value).replace(/greenalert_validation_create_[0-9a-f]+/g, '<database>').replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '<uuid>'));
const sandbox = await (process.argv.includes('--native') ? startNativeMysql() : startDockerMysql());
let child;
try {
  const admin = sandbox.admin;
  const database = `greenalert_validation_create_${randomBytes(5).toString('hex')}`;
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.changeUser({ database });
  await executeSqlFile(admin, await readFile(path.join(root, 'apps/backend/DATABASE_SCHEMA_COMPLETE.sql'), 'utf8'));
  for (const [id, role] of [[1,'ciudadano'],[2,'admin'],[3,'moderador'],[4,'entidad']]) await admin.execute(
    'INSERT INTO usuarios (id_usuario,uuid,nombre,apellido,email,password_hash,rol,id_entidad) VALUES (?,?,?,?,?,?,?,?)',
    [id,`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`,'Persona','Sintetica',`create${id}@example.test`,'sin-login',role,id===4?1:null]);
  const password = randomBytes(24).toString('hex');
  await admin.query("CREATE USER 'ga_create'@'%' IDENTIFIED BY ?", [password]);
  await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO 'ga_create'@'%'`);
  const secret = randomBytes(32).toString('hex');
  child = fork(path.join(root,'scripts/reportes-create-worker.mjs'), [], { cwd:path.join(root,'apps/backend'), stdio:['ignore','pipe','pipe','ipc'], env:{
    ...process.env, TZ:'UTC', NODE_ENV:'test', API_PREFIX:'/api', JWT_SECRET:secret,
    DB_HOST:'127.0.0.1', DB_PORT:String(sandbox.config.port), DB_NAME:database, DB_USER:'ga_create', DB_PASSWORD:password, DB_SSL:'false',
    HF_API_KEY:'',GROQ_API_KEY:'',GEMINI_API_KEY:'',CLOUDINARY_CLOUD_NAME:'',CLOUDINARY_API_KEY:'',CLOUDINARY_API_SECRET:'',FIREBASE_SERVICE_ACCOUNT_JSON:'',FIREBASE_PRIVATE_KEY:'',
  } });
  child.stdout.resume(); child.stderr.resume();
  const ready = await new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); };
    const onMessage = (message) => { cleanup(); resolve(message); };
    const onExit = (code) => { cleanup(); reject(new Error(`Servidor terminó durante el arranque (${code}).`)); };
    const onError = (error) => { cleanup(); reject(error); };
    const timer = setTimeout(() => { cleanup(); child.kill(); reject(new Error('Servidor no inició en 30 segundos.')); }, 30000);
    child.once('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
  const ask = async (message) => { const promise=once(child,'message'); child.send(message); return (await promise)[0]; };
  const base = { tipo_contaminacion:' Agua ',nivel_severidad:' ALTO ',titulo:' Reporte sintético ',direccion:' Calle 10 ',descripcion:' Agua contaminada ',subcategoria:' rio_contaminado ',municipio:' Mocoa ',departamento:' Putumayo ' };
  const scenarios = [
    {name:'anonymous',subject:null}, {name:'invalid-jwt',subject:'invalid'},
    {name:'minimal'}, {name:'coordinates',body:{latitud:'1.15',longitud:'-120.25'}},
    {name:'partial-coordinates',body:{latitud:'1.15'}}, {name:'zero-coordinates',body:{latitud:0,longitud:0}},
    {name:'accepted-ia',body:{ia_procesado:'1',ia_etiquetas:'["aceptado"]',ia_confianza:'99.5'}},
    {name:'invalid-ia-json',body:{ia_procesado:true,ia_etiquetas:'{',ia_confianza:20}},
    {name:'invalid-ia-confidence',body:{ia_procesado:true,ia_etiquetas:[],ia_confianza:101}},
    {name:'ignored-ia',body:{ia_etiquetas:'{',ia_confianza:999}},
    {name:'missing-category',body:{tipo_contaminacion:''}}, {name:'unknown-category',body:{tipo_contaminacion:'inexistente'}},
    {name:'missing-severity',body:{nivel_severidad:''}}, {name:'invalid-severity',body:{nivel_severidad:'grave'}},
    {name:'short-title',body:{titulo:'abcd'}}, {name:'short-address',body:{direccion:'ab'}},
    {name:'invalid-latitude',body:{latitud:91}}, {name:'invalid-longitude',body:{longitud:-181}},
    {name:'non-numeric-coordinate',body:{latitud:'norte'}},
    {name:'entity',subject:4}, {name:'admin',subject:2}, {name:'moderator',subject:3}, {name:'missing-author',subject:999},
    {name:'insert-fail',mode:'insert-fail'}, {name:'ia-fail',mode:'ia-fail'},
    {name:'images',files:['image/png','image/png']}, {name:'image-video',files:['image/png','video/mp4']},
    {name:'ten-images',files:Array(10).fill('image/png')}, {name:'eleven-files',files:Array(11).fill('image/png')},
    {name:'two-videos',files:['video/mp4','video/mp4']}, {name:'corrupt-file',files:['image/png'],corrupt:true},
    {name:'invalid-mime',files:['application/pdf']},
    {name:'upload-fail',files:['image/png'],mode:'upload-fail'},
    {name:'second-upload-fail',files:['image/png','image/png'],mode:'second-upload-fail'},
    {name:'evidence-fail',files:['image/png'],mode:'evidence-fail'},
    {name:'second-evidence-fail',files:['image/png','image/png'],mode:'second-evidence-fail'},
    {name:'cleanup-fail',files:['image/png'],mode:'cleanup-fail'}, {name:'assignment-fail',mode:'assignment-fail'},
  ];
  const cases=[];
  for (const scenario of scenarios) {
    const [[previous]] = await admin.query('SELECT COALESCE(MAX(id_reporte), 0) AS id FROM reportes');
    await ask({type:'reset',mode:scenario.mode});
    const subject = Object.hasOwn(scenario,'subject')?scenario.subject:1;
    const token=subject==='invalid'?'invalid':subject?jwt.sign({...await seedSessionClaims(admin,{sub:subject,rol:({2:'admin',3:'moderador',4:'entidad'})[subject]||'ciudadano'}),exp:Date.parse('2026-11-18T13:00:00Z')/1000},secret,{noTimestamp:true}):null;
    const headers=token?{Authorization:`Bearer ${token}`}:{}, data={...base,...scenario.body};
    let body;
    if(scenario.files){
      body=new FormData();for(const [key,value]of Object.entries(data))body.append(key,String(value));
      for(const [index,mime]of scenario.files.entries()){
        const buffer=scenario.corrupt?Buffer.from('corrupto'):mime==='video/mp4'?Buffer.from('000000186674797069736f6d0000000069736f6d69736f32','hex'):Buffer.from('89504e470d0a1a0a01020304','hex');
        body.append(scenario.files.length===11&&index===0?'file':'files',new Blob([buffer],{type:mime}),`evidencia-${index}.png`);
      }
    }else{headers['Content-Type']='application/json';body=JSON.stringify(data);}
    const response=await fetch(`http://127.0.0.1:${ready.port}/api/reportes`,{method:'POST',headers,body,signal:AbortSignal.timeout(20000)});
    const [reports]=await admin.query("SELECT *, ST_Longitude(punto_geo) AS geo_longitude, ST_Latitude(punto_geo) AS geo_latitude FROM reportes ORDER BY id_reporte");
    const tables={reportes:reports};for(const table of ['evidencias','reporte_entidades','notificaciones','alertas_entidad']){
      const [rows]=await admin.query(`SELECT * FROM ${table} ORDER BY 1`);tables[table]=rows;
    }
    const entry=canonical({name:scenario.name,status:response.status,body:await response.json(),tables,effects:await ask({type:'effects'})});
    const created = reports.filter((row) => row.id_reporte > previous.id);
    if (response.status >= 400) {
      assert.ok(created.every((row) => row.deleted_at !== null), `${scenario.name}: no debe quedar un reporte activo tras el fallo`);
      assert.equal(entry.effects.cacheSize, 1, 'Los fallos conservan la caché anterior.');
    } else {
      assert.equal(response.status, 201); assert.equal(created.length, 1);
      assert.equal(created[0].estado, 'pendiente'); assert.equal(created[0].deleted_at, null);
      assert.equal(entry.effects.cacheSize, 0, 'La creación invalida la caché compartida.');
    }
    if (scenario.name === 'coordinates') {
      // Las funciones geográficas devuelven DOUBLE (la comparación con el fixture sigue siendo exacta).
      assert.ok(Math.abs(Number(created[0].geo_longitude) - (-120.25)) < 1e-10);
      assert.ok(Math.abs(Number(created[0].geo_latitude) - 1.15) < 1e-10);
    }
    if(!capture){
      const old = expected.cases.find(item=>item.name===scenario.name);
      // Cambio de seguridad deliberado: autor inexistente se rechaza en autenticación antes de INSERT.
      const contract = scenario.name==='missing-author' ? { ...old, status:403, body:{status:'error',message:'token inválido o expirado.'} } : old;
      assert.deepEqual(entry,contract,scenario.name);
    }
    if(scenario.name==='missing-author'){
      // Preservar solo la numeración histórica sintética: el INSERT fallido antiguo reservaba un ID.
      assert.ok(Number.isSafeInteger(Number(previous.id)));
      await admin.query('ALTER TABLE reportes AUTO_INCREMENT = '+(Number(previous.id)+2));
    }
    cases.push(entry);console.log(`OK: ${scenario.name}`);
  }
  if(capture){await mkdir(path.dirname(fixtureFile),{recursive:true});await writeFile(fixtureFile,JSON.stringify({reference:'2a4946b',cases},null,2)+'\n',{flag:'wx'});}
  await mkdir(path.join(root,'.local/mysql-validation'),{recursive:true});
  await writeFile(path.join(root,'.local/mysql-validation/reportes-creacion.json'),JSON.stringify({capture,passed:cases.length,reference:'2a4946b'},null,2)+'\n');
  console.log(`${cases.length} contratos de creación: ${capture?'capturados antes del refactor':'37 equivalentes y 1 rechazo anticipado documentado por seguridad'}.`);
}finally{
  if(child?.connected){child.send({type:'stop'});await once(child,'exit');}
  await sandbox.stop();
}
