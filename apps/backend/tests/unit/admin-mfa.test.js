import test from 'node:test';
import assert from 'node:assert/strict';
import { totp,base32,createAdminMfa } from '../../src/modules/identidad/adapters/outbound/admin-mfa.js';
test('TOTP coincide con vectores SHA1 RFC 6238, incluyendo contadores posteriores a 2038',()=>{
  const secret=Buffer.from('12345678901234567890');
  for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],
    [1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) assert.equal(totp(secret,seconds,8),expected);
  assert.equal(base32(Buffer.from('foo')),'MZXW6');
});
test('MFA almacena secreto cifrado y rechaza código incorrecto o reutilizado',async()=>{
  let encrypted,last=-1;
  const pool={execute:async(query,params)=>{
    if(query.startsWith('SELECT id_usuario')) return [[{id_usuario:7}]];
    if(query.startsWith('INSERT INTO admin_mfa')) { encrypted=params[1]; return [{affectedRows:1}]; }
    if(query.startsWith('UPDATE usuarios')) return [{affectedRows:1}];
    if(query.startsWith('SELECT encrypted')) return [[{encrypted_secret:encrypted,last_counter:last}]];
    if(query.startsWith('UPDATE admin_mfa')) { if(last>=params[0]) return [{affectedRows:0}]; last=params[0]; return [{affectedRows:1}]; }
    assert.fail(query);
  }};
  const mfa=createAdminMfa({pool,keyHex:'ab'.repeat(32),now:()=>1780000000000});
  const factor=await mfa.provision(7);
  assert.ok(!encrypted.toString().includes(factor.secret));
  const admin={id_usuario:7,rol:'admin'};
  await assert.rejects(mfa.verify(admin,'invalido'),{statusCode:403});
  await mfa.verify(admin,factor.initialCode);
  await assert.rejects(mfa.verify(admin,factor.initialCode),{statusCode:403});
  await mfa.verify({id_usuario:8,rol:'ciudadano'});
});
