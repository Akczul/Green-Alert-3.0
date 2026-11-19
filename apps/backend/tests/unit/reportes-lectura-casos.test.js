import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createConsultasReportes, ConsultaReportesError } from '../../src/modules/reportes-lectura/application/consultar-reportes.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/reportes-lectura/contrato.json', import.meta.url)));
const subjects = { citizen:{sub:1,rol:'ciudadano'},admin:{sub:2,rol:'admin'},moderator:{sub:3,rol:'moderador'},entity:{sub:4,rol:'entidad',id_entidad:1},entity_missing:{sub:4,rol:'entidad'},entity_outside:{sub:4,rol:'entidad',id_entidad:9999} };
const relationNames = { findActiveAllowedByIdOrCodigo:'findActiveEntity',findByEntidad:'findAssignedReports',findOneByReporteAndEntidad:'findAssignment',findByReporte:'findEvidence',findById:'findAuthor',likedSet:'likedSet' };
const json = (value) => JSON.parse(JSON.stringify(value));
for (const entry of fixture.cases.filter((item) => !['own-anonymous','own-invalid','detail-invalid-id'].includes(item.name))) {
  test(`lectura sin MySQL conserva caracterización anterior: ${entry.name}`, async () => {
    const consumed = new Set();
    const fake = (port) => new Proxy({}, { get(_target, method) { return async (...args) => {
      const index = entry.trace.findIndex((call,i) => !consumed.has(i) && call.port===port && (port==='relations'?relationNames[call.method]:call.method)===method);
      assert.ok(index>=0, `Puerto no esperado: ${port}.${String(method)}`);
      consumed.add(index); const call=entry.trace[index];
      assert.deepEqual(json(args),call.args);
      if(call.error) throw new Error(call.error);
      return call.result?.__set ? new Set(call.result.__set) : structuredClone(call.result);
    }; } });
    const views=[];
    const casos=createConsultasReportes({ reportes:fake('reportes'),relations:fake('relations'),views:{record:async(input)=>{views.push(input);}} });
    const parsed=new URL(entry.url,'http://test');
    const input={query:Object.fromEntries(parsed.searchParams),user:subjects[entry.subject]};
    let data;
    try {
      if(parsed.pathname==='/reportes')data=await casos.listar(input);
      else if(parsed.pathname.endsWith('/mis-reportes'))data=await casos.propios(input);
      else if(parsed.pathname.endsWith('/trending'))data=await casos.tendencias(input);
      else data=await casos.detalle({id:Number(parsed.pathname.split('/').at(-1)),user:input.user,skipView:input.query.skip_view==='true',anonymousKey:'fixture'});
      assert.equal(entry.status,200);
      assert.deepEqual(json(data),entry.body.data);
    } catch(error) {
      if(!(error instanceof ConsultaReportesError))throw error;
      assert.equal(entry.body.message,error.message); assert.notEqual(entry.status,200);
    }
    assert.equal(consumed.size,entry.trace.length,'Debe conservar las lecturas relacionadas del flujo original.');
    if(parsed.pathname.match(/\/reportes\/\d+$/)&&entry.status===200)assert.equal(views.length,1);
    else assert.equal(views.length,0);
  });
}
test('lectura propaga fallo del puerto y no fabrica lista vacía',async()=>{
  const error=new Error('reader falló');const cases=createConsultasReportes({reportes:{findAll:async()=>{throw error;},countAll:async()=>0},relations:{},views:{}});
  await assert.rejects(cases.listar(),(actual)=>actual===error);
});
test('mis reportes rechaza usuario sin sub antes de normalizar filtros',async()=>{
  const cases=createConsultasReportes({reportes:{},relations:{},views:{}});
  await assert.rejects(cases.propios({query:{estado:[]}}),{code:'AUTH_REQUIRED',message:'No autorizado.'});
});
