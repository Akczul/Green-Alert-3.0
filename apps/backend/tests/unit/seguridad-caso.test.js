import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createSeguridad } from '../../src/modules/identidad/application/seguridad.js';
import { CredencialRechazada, PasswordPolicyError } from '../../src/modules/identidad/domain/seguridad.js';
import { passwordBlocklist, hashPassword, verifyPassword } from '../../src/modules/identidad/adapters/outbound/passwords.js';
import { createAuthMiddleware } from '../../src/modules/identidad/adapters/inbound/auth-middleware.js';
import { seguridad } from '../../src/bootstrap/seguridad.js';
import { notificarReporteCriticoAEntidad, setSocketServerForTests } from '../../src/config/socket.js';

const claims={sub:7,sid:'session-a',ver:2,rol:'admin',id_entidad:null};
const state={id_usuario:7,activo:1,deleted_at:null,auth_version:2,session_auth_version:2,rol:'admin',id_entidad:null};
const compose=(overrides={})=>createSeguridad({tokens:{verify:()=>claims},sesiones:{findActive:async()=>state},usuarios:{},identificadores:{},passwords:passwordBlocklist,...overrides});

test('caso verifica sesión válida con puertos sin MySQL',async()=>{
  assert.deepEqual(await compose().verificarAcceso('token'),claims);
});
for(const [name,changed]of [
  ['usuario desactivado',{activo:0}],['usuario borrado',{deleted_at:'fecha'}],
  ['privilegios revocados',{auth_version:3}],['versión de sesión incorrecta',{session_auth_version:1}],
  ['rol degradado',{rol:'ciudadano'}],['entidad cambiada',{id_entidad:9}],['otro usuario',{id_usuario:8}],
])test(`rechaza ${name}`,async()=>{
  await assert.rejects(compose({sesiones:{findActive:async()=>({...state,...changed})}}).verificarAcceso('token'),CredencialRechazada);
});
test('rechaza sesión inexistente/revocada y JWT legacy sin consultar SQL',async()=>{
  await assert.rejects(compose({sesiones:{findActive:async()=>null}}).verificarAcceso('token'),CredencialRechazada);
  await assert.rejects(compose({tokens:{verify:()=>({sub:7,rol:'admin'})},sesiones:{findActive:()=>assert.fail()}}).verificarAcceso('legacy'),CredencialRechazada);
});
test('no oculta fallo del store ni convierte caída en autenticación',async()=>{
  const failure=new Error('SQL no disponible');
  await assert.rejects(compose({sesiones:{findActive:async()=>{throw failure;}}}).verificarAcceso('token'),error=>error===failure);
  let nextError;const req={headers:{authorization:'Bearer token'},user:{rol:'admin'}};
  await createAuthMiddleware({verificarAcceso:async()=>{throw failure;}}).verifyToken(req,{},error=>{nextError=error;});
  assert.equal(req.user,undefined);assert.equal(nextError.statusCode,503);assert.equal(nextError.message.includes('SQL'),false);
});
test('apertura inyecta sid y versión actuales, sin rol del cliente',async()=>{
  let persisted;
  const usecase=compose({usuarios:{findState:async()=>state},identificadores:{next:()=> 'new-session'},sesiones:{create:async data=>{persisted=data;}}});
  assert.deepEqual(await usecase.iniciarSesion(7,{token_hash:'hash',auth_version:99}),{sid:'new-session',ver:2,rol:'admin',id_entidad:null});
  assert.equal(persisted.auth_version,2);assert.equal(persisted.session_id,'new-session');
});
test('contraseñas cortas/comunes/repetidas y equivalentes NFKC se rechazan',async()=>{
  const usecase=compose();
  for(const password of ['password','passwordpassword','ＰＡＳＳＷＯＲＤＰＡＳＳＷＯＲＤ','x'.repeat(80)])await assert.rejects(usecase.validarNuevaPassword(password),PasswordPolicyError);
  await usecase.validarNuevaPassword('Una frase diferente en el bosque al amanecer');
  await usecase.validarNuevaPassword('Largas palabras independientes recuerdan senderos y rios al amanecer. '.repeat(3));
});
test('hash asíncrono conserva formato scrypt y valida sin truncar frases',async()=>{
  const phrase='Cuatro senderos de montana conservan historias de lluvia. '.repeat(2),hash=await hashPassword(phrase);
  assert.match(hash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);assert.equal(await verifyPassword(phrase,hash),true);
  assert.equal(await verifyPassword(phrase+'x',hash),false);assert.equal(await verifyPassword(phrase,'oauth:google'),false);
});
test('Socket ya conectado no recibe evento privado si su sesión fue revocada',async(t)=>{
  t.mock.method(seguridad,'verificarAcceso',async()=>{throw new CredencialRechazada();});
  let disconnected=false;const emissions=[];
  setSocketServerForTests({in:()=>({fetchSockets:async()=>[{data:{accessToken:'revocado'},emit:(...args)=>emissions.push(args),disconnect:()=>{disconnected=true;}}]})});
  t.after(()=>setSocketServerForTests(null));
  notificarReporteCriticoAEntidad(1,{reporte:{id_reporte:1}});await new Promise(setImmediate);
  assert.equal(disconnected,true);assert.deepEqual(emissions,[]);
});
test('dominio/aplicación de seguridad no importan infraestructura ni entorno',async()=>{
  const root=new URL('../../src/modules/identidad/',import.meta.url);
  for(const layer of ['domain','application'])for(const file of await readdir(new URL(`${layer}/`,root))){
    const source=await readFile(new URL(`${layer}/${file}`,root),'utf8');
    assert.doesNotMatch(source,/process\.env|from\s+['"](?:express|mysql2|jsonwebtoken)|models\/|config\/|bootstrap\/|adapters\//);
    for(const match of source.matchAll(/from\s*['"]([^'"]+)['"]/g))assert.ok(new URL(match[1],new URL(`${layer}/${file}`,root)).href.startsWith(new URL('domain/',root).href));
  }
});
