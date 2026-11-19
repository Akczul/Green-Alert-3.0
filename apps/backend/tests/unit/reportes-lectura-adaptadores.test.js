import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createLegacyViewRecorder } from '../../src/modules/reportes-lectura/adapters/outbound/legacy-view-recorder.js';
import { createMysqlReportesReader } from '../../src/modules/reportes-lectura/adapters/outbound/mysql-reportes-reader.js';

test('efecto heredado de vistas mantiene skip, throttle e identidad autenticada',async()=>{
  let now=1000000;const calls=[];
  const record=createLegacyViewRecorder({clock:{now:()=>now},reportes:{registrarVistaUsuario:async(...args)=>calls.push(['user',...args]),incrementarVistas:async(id)=>calls.push(['anonymous',id])}});
  await record.record({reportId:10,skip:true,anonymousKey:'a'});
  await record.record({reportId:10,anonymousKey:'a'});
  await record.record({reportId:10,anonymousKey:'a'});
  now+=300000;await record.record({reportId:10,anonymousKey:'a'});
  await record.record({reportId:10,userId:1});await record.record({reportId:10,userId:1});
  assert.deepEqual(calls,[['anonymous',10],['anonymous',10],['user',10,1],['user',10,1]]);
});
test('reader SQL parametriza búsqueda exacta y conserva normalización y paginación',async()=>{
  let call;const reader=createMysqlReportesReader({pool:{execute:async(sql,params)=>{call={sql,params};return [[{ia_etiquetas:'["agua"]',ia_confianza:'75.50',ia_procesado:1,latitud:'1.15000000',longitud:'-120.25000000'}]];}}});
  const rows=await reader.findAll({estado:'En Proceso',municipio:"Mocoa' OR 1=1 --",limit:0,offset:-1});
  assert.deepEqual(call.params,['en_proceso',"Mocoa' OR 1=1 --"]);assert.match(call.sql,/LIMIT 20 OFFSET 0/);assert.equal(call.sql.includes("Mocoa'"),false);
  assert.equal(rows[0].ia_confianza,75.5);assert.equal(rows[0].latitud,'1.15000000');assert.deepEqual(rows[0].ia_etiquetas,['agua']);
});
test('dominio y aplicación de lectura solo dependen de módulos internos',async()=>{
  const root=new URL('../../src/modules/reportes-lectura/',import.meta.url);
  for(const layer of ['domain','application'])for(const file of await readdir(new URL(`${layer}/`,root))){
    const source=await readFile(new URL(`${layer}/${file}`,root),'utf8');
    assert.doesNotMatch(source,/process\.env|Date\.now\(|from\s+['"](?:express|mysql2)|models\/|config\/|bootstrap\/|adapters\//);
    for(const match of source.matchAll(/from\s*['"]([^'"]+)['"]/g)){
      const target=new URL(match[1],new URL(`${layer}/${file}`,root));assert.ok(target.href.startsWith(new URL('domain/',root).href)||target.href.startsWith(new URL('application/',root).href));
    }
  }
});
