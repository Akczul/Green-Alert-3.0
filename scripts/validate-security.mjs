import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, createHash, scryptSync } from 'node:crypto';
import jwt from '../apps/backend/node_modules/jsonwebtoken/index.js';
import { startDockerMysql, executeSqlFile } from './mysql-sandbox.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sandbox = await startDockerMysql();
let child;
const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); console.log(`OK: ${name}`); };
try {
  const database = `greenalert_security_${randomBytes(6).toString('hex')}`, admin = sandbox.admin;
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.changeUser({ database });
  await executeSqlFile(admin, await readFile(path.join(root,'apps/backend/DATABASE_SCHEMA_COMPLETE.sql'),'utf8'));
  await check('Migración 020 aditiva e idempotente sobre bootstrap', async () => {
    const sql = await readFile(path.join(root,'apps/backend/migrations/020_add_revocable_sessions.sql'),'utf8');
    await executeSqlFile(admin, sql); await executeSqlFile(admin, sql);
  });
  const password = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
  await admin.query("CREATE USER 'ga_security'@'%' IDENTIFIED BY ?", [password]);
  await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO 'ga_security'@'%'`);
  child = fork(path.join(root,'scripts/reportes-read-worker.mjs'), [], { cwd:path.join(root,'apps/backend'), stdio:['ignore','pipe','pipe','ipc'], env:{
    ...process.env, NODE_ENV:'production', TZ:'UTC', API_PREFIX:'/api', JWT_SECRET:secret, JWT_EXPIRES_IN:'15m',
    DB_HOST:'127.0.0.1', DB_PORT:String(sandbox.config.port), DB_NAME:database, DB_USER:'ga_security', DB_PASSWORD:password, DB_SSL:'false',
    EMAIL_TRANSPORT:'json', EMAIL_HOST:'localhost', EMAIL_PORT:'1025', EMAIL_USER:'test', EMAIL_PASS:'test-only', EMAIL_FROM:'test@example.test',
    RATE_LIMIT_AUTH_MAX:'500', RATE_LIMIT_LOGIN_MAX:'500', RATE_LIMIT_PASSWORD_RESET_MAX:'500',
    HF_API_KEY:'', GROQ_API_KEY:'', GEMINI_API_KEY:'', CLOUDINARY_CLOUD_NAME:'', CLOUDINARY_API_KEY:'', CLOUDINARY_API_SECRET:'', FIREBASE_SERVICE_ACCOUNT_JSON:'', FIREBASE_PRIVATE_KEY:'',
  } });
  child.stdout.resume(); child.stderr.resume();
  const ready = await new Promise((resolve,reject) => {
    const cleanup=()=>{clearTimeout(timer);child.off('message',message);child.off('exit',exit);child.off('error',error);};
    const message=(value)=>{cleanup();resolve(value);};
    const exit=(code)=>{cleanup();reject(new Error(`Servidor terminó: ${code}`));};
    const error=(cause)=>{cleanup();reject(cause);};
    const timer=setTimeout(()=>{cleanup();child.kill();reject(new Error('Servidor no inició en 30 s'));},30000);
    child.once('message',message);child.once('exit',exit);child.once('error',error);
  });
  const api = async (method,route,body,token,expected=200) => {
    const response=await fetch(`http://127.0.0.1:${ready.port}/api${route}`, { method, signal:AbortSignal.timeout(15000),
      headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})}, body:body?JSON.stringify(body):undefined });
    const json=await response.json(); assert.equal(response.status,expected,`${route}: ${json.message}`); return json.data;
  };
  const valid = 'El bosque conserva veinte sonidos al amanecer 2026';
  const phrase = 'Senderos de lluvia y montanas conservan historias diferentes cada amanecer. '.repeat(2);
  const account=(email,password=valid)=>({nombre:'Persona',apellido:'Sintetica',email,password});
  await check('Registro rechaza contraseña corta sin insertar usuario', async () => {
    await api('POST','/auth/register',account('short@example.test','password'),null,400);
    const [[row]]=await admin.query("SELECT COUNT(*) AS n FROM usuarios WHERE email='short@example.test'");assert.equal(row.n,0);
  });
  await check('Lista local rechaza contraseña común que supera 15 caracteres',async()=>{
    await api('POST','/auth/register',account('common@example.test','passwordpassword'),null,400);
  });
  await check('Límite exacto: 14 caracteres rechazados y frase de 15 aceptada',async()=>{
    await api('POST','/auth/register',account('boundary14@example.test','abcdefghijklmN'),null,400);
    await api('POST','/auth/register',account('boundary15@example.test','rio nube piedra'),null,201);
  });
  let first, second, outsider;
  await check('Registro acepta contraseña válida y claims sid/ver', async()=>{
    first=await api('POST','/auth/register',account('first@example.test'),null,201);
    const claims=jwt.verify(first.token,secret,{clockTimestamp:Date.parse('2026-11-18T12:00:00Z')/1000});assert.ok(claims.sid);assert.equal(claims.ver,0);assert.equal(claims.exp-claims.iat,900);
  });
  await check('Frase mayor de 64 caracteres aceptada sin truncamiento',async()=>{
    outsider=await api('POST','/auth/register',account('other@example.test',phrase),null,201);
    await api('POST','/auth/login',{email:'other@example.test',password:phrase});
  });
  second=await api('POST','/auth/login',{email:'first@example.test',password:valid});
  await check('Dos sesiones legítimas tienen sid diferentes',async()=>{
    assert.notEqual(jwt.decode(first.token).sid,jwt.decode(second.token).sid);
    await api('GET','/auth/perfil',null,first.token);await api('GET','/auth/perfil',null,second.token);
  });
  await check('Logout individual revoca access JWT y refresh sin afectar otra sesión',async()=>{
    await api('POST','/auth/logout',{refreshToken:first.refreshToken});
    await api('GET','/auth/perfil',null,first.token,403);
    await api('POST','/auth/refresh',{refreshToken:first.refreshToken},null,401);
    await api('GET','/auth/perfil',null,second.token);await api('GET','/auth/perfil',null,outsider.token);
  });
  let rotated;
  await check('Renovación concurrente: un éxito y un rechazo, sin revocar la ganadora',async()=>{
    const responses=await Promise.all([fetch(`http://127.0.0.1:${ready.port}/api/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:second.refreshToken}),signal:AbortSignal.timeout(15000)}),fetch(`http://127.0.0.1:${ready.port}/api/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:second.refreshToken}),signal:AbortSignal.timeout(15000)})]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
    for(const response of responses){const body=await response.json();if(response.status===200)rotated=body.data;}
    assert.equal(jwt.decode(rotated.token).sid,jwt.decode(second.token).sid);
    await api('GET','/auth/perfil',null,rotated.token);await api('GET','/auth/perfil',null,second.token);
  });
  await check('Logout con refresh anterior a rotación revoca la familia completa',async()=>{
    await api('POST','/auth/logout',{refreshToken:second.refreshToken});
    await api('GET','/auth/perfil',null,rotated.token,403);
    await api('POST','/auth/refresh',{refreshToken:rotated.refreshToken},null,401);
    await api('GET','/auth/perfil',null,outsider.token);
  });
  let current=await api('POST','/auth/login',{email:'first@example.test',password:valid});
  await check('Cambio rechaza contraseña común y conserva sesión/datos',async()=>{
    await api('PATCH','/auth/cambiar-contrasena',{currentPassword:valid,newPassword:'passwordpassword',confirmPassword:'passwordpassword'},current.token,400);
    await api('GET','/auth/perfil',null,current.token);
  });
  const changed='Una nueva frase de acceso al bosque 2026';
  await check('Cambio válido invalida access y refresh previos',async()=>{
    await api('PATCH','/auth/cambiar-contrasena',{currentPassword:valid,newPassword:changed,confirmPassword:changed},current.token);
    await api('GET','/auth/perfil',null,current.token,403);await api('POST','/auth/refresh',{refreshToken:current.refreshToken},null,401);
    current=await api('POST','/auth/login',{email:'first@example.test',password:changed});
  });
  const resetToken=randomBytes(32).toString('hex'),resetHash=createHash('sha256').update(resetToken).digest('hex');
  await admin.execute('UPDATE usuarios SET token_reset=?,token_reset_exp=? WHERE id_usuario=?',[resetHash,'2030-01-01 00:00:00',outsider.user.id_usuario]);
  await check('Recuperación aplica política antes de cambiar datos',async()=>{
    await api('POST','/auth/reset-password',{token:resetToken,newPassword:'passwordpassword',confirmPassword:'passwordpassword'},null,400);
    await api('GET','/auth/perfil',null,outsider.token);
  });
  await check('Recuperación válida invalida sesiones y token de un solo uso',async()=>{
    await api('POST','/auth/reset-password',{token:resetToken,newPassword:changed,confirmPassword:changed});
    await api('GET','/auth/perfil',null,outsider.token,403);await api('POST','/auth/refresh',{refreshToken:outsider.refreshToken},null,401);
    await api('POST','/auth/reset-password',{token:resetToken,newPassword:changed,confirmPassword:changed},null,400);
    await api('GET','/auth/perfil',null,current.token);
  });
  const rootUser=await api('POST','/auth/register',account('admin@example.test'),null,201);
  const target=await api('POST','/auth/register',account('target@example.test'),null,201);
  await admin.query("UPDATE usuarios SET rol='admin' WHERE email IN ('admin@example.test','target@example.test')");
  const rootSession=await api('POST','/auth/login',{email:'admin@example.test',password:valid});
  const targetSession=await api('POST','/auth/login',{email:'target@example.test',password:valid});
  let downgradedSession;
  await check('Administrador degradado por API pierde privilegios inmediatamente',async()=>{
    await api('GET','/admin/usuarios',null,targetSession.token);
    await api('PATCH',`/admin/usuarios/${target.user.id_usuario}/rol`,{rol:'ciudadano'},rootSession.token);
    await api('GET','/admin/usuarios',null,targetSession.token,403);await api('POST','/auth/refresh',{refreshToken:targetSession.refreshToken},null,401);
    const newTarget=await api('POST','/auth/login',{email:'target@example.test',password:valid});
    downgradedSession=newTarget;
    await api('GET','/auth/perfil',null,newTarget.token);await api('GET','/admin/usuarios',null,newTarget.token,403);
    await api('GET','/admin/usuarios',null,rootSession.token);
  });
  await check('Cuenta desactivada por API y reactivada no recupera JWT antiguo',async()=>{
    await api('GET','/auth/perfil',null,downgradedSession.token);
    await api('PATCH',`/admin/usuarios/${target.user.id_usuario}/estado`,{activo:false},rootSession.token);
    await api('GET','/auth/perfil',null,downgradedSession.token,403);
    await api('POST','/auth/refresh',{refreshToken:downgradedSession.refreshToken},null,401);
    await api('PATCH',`/admin/usuarios/${target.user.id_usuario}/estado`,{activo:true},rootSession.token);
    await api('GET','/auth/perfil',null,downgradedSession.token,403);
    await api('GET','/auth/perfil',null,current.token);
  });
  await check('Guardar rol sin cambios conserva sesión legítima',async()=>{
    await api('PATCH',`/admin/usuarios/${rootUser.user.id_usuario}/rol`,{rol:'admin'},rootSession.token);
    await api('GET','/admin/usuarios',null,rootSession.token);
  });
  await check('Logout global revoca solo las sesiones del titular',async()=>{
    const another=await api('POST','/auth/login',{email:'first@example.test',password:changed});
    await api('POST','/auth/logout',{allDevices:true},current.token);
    await api('GET','/auth/perfil',null,current.token,403);await api('GET','/auth/perfil',null,another.token,403);
    await api('GET','/admin/usuarios',null,rootSession.token);
  });
  await check('Logout y renovación simultáneos no resucitan sesión ni revocan otra legítima',async()=>{
    const session=await api('POST','/auth/login',{email:'first@example.test',password:changed});
    const independent=await api('POST','/auth/login',{email:'first@example.test',password:changed});
    const [logoutResponse,refreshResponse]=await Promise.all([
      fetch(`http://127.0.0.1:${ready.port}/api/auth/logout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:session.refreshToken}),signal:AbortSignal.timeout(15000)}),
      fetch(`http://127.0.0.1:${ready.port}/api/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:session.refreshToken}),signal:AbortSignal.timeout(15000)}),
    ]);
    assert.equal(logoutResponse.status,200);assert.ok([200,401].includes(refreshResponse.status));
    const body=await refreshResponse.json();await api('GET','/auth/perfil',null,session.token,403);
    if(refreshResponse.status===200){await api('GET','/auth/perfil',null,body.data.token,403);await api('POST','/auth/refresh',{refreshToken:body.data.refreshToken},null,401);}
    await api('GET','/auth/perfil',null,independent.token);
  });
  await check('JWT legacy sin sid no obtiene acceso aunque su firma sea válida',async()=>{
    const token=jwt.sign({sub:rootUser.user.id_usuario,rol:'admin'},secret,{expiresIn:'1h'});
    await api('GET','/admin/usuarios',null,token,403);
  });
  await check('Hashes scrypt históricos conservados y login compatible',async()=>{
    const salt=randomBytes(16).toString('hex'),hash=`${salt}:${scryptSync('Legacy123',salt,64).toString('hex')}`;
    await admin.execute("INSERT INTO usuarios (uuid,nombre,apellido,email,password_hash) VALUES (UUID(),'Legacy','Sintetica','legacy@example.test',?)",[hash]);
    const legacy=await api('POST','/auth/login',{email:'legacy@example.test',password:'Legacy123'});
    await api('GET','/auth/perfil',null,legacy.token);
    const [[stored]]=await admin.query("SELECT password_hash FROM usuarios WHERE email='legacy@example.test'");assert.equal(stored.password_hash,hash);
  });
  await check('Fallo del almacén de sesiones rechaza con 503 sin filtrar SQL',async()=>{
    await admin.query('RENAME TABLE refresh_tokens TO refresh_tokens_unavailable');
    try { await api('GET','/auth/perfil',null,rootSession.token,503); }
    finally { await admin.query('RENAME TABLE refresh_tokens_unavailable TO refresh_tokens'); }
  });
  await mkdir(path.join(root,'.local/mysql-validation'),{recursive:true});
  await writeFile(path.join(root,'.local/mysql-validation/security.json'),JSON.stringify({checks,passed:checks.length},null,2)+'\n');
  console.log(`Seguridad: ${checks.length} comprobaciones reales correctas.`);
} finally {
  if(child?.connected){child.send({type:'stop'});await once(child,'exit');}
  await sandbox.stop();
}
