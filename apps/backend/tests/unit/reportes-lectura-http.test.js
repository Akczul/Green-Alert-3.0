import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createConsultasReportes } from '../../src/modules/reportes-lectura/application/consultar-reportes.js';
import { createReportesControllers } from '../../src/modules/reportes-lectura/adapters/inbound/express-controller.js';
import { errorHandler } from '../../middlewares/errorHandler.js';
process.env.NODE_ENV='test';

async function request(t, reportes, route) {
  const consultas=createConsultasReportes({reportes,relations:{},views:{}});
  const controllers=createReportesControllers({consultas});
  const app=express();app.get('/reportes',controllers.getReportes);app.get('/reportes/:id',controllers.getReporteById);app.use(errorHandler);
  const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const response=await fetch(`http://127.0.0.1:${server.address().port}${route}`);
  return {status:response.status,body:await response.json()};
}
test('adaptador HTTP mantiene error de infraestructura 500 y mensaje original',async(t)=>{
  t.mock.method(console,'error',()=>{});
  const result=await request(t,{findAll:async()=>{throw new Error('SQL de prueba no disponible');},countAll:async()=>0},'/reportes');
  assert.deepEqual(result,{status:500,body:{status:'error',message:'SQL de prueba no disponible'}});
});
test('adaptador HTTP convierte reporte ausente a 404 sin consultar relaciones ni registrar vista',async(t)=>{
  assert.deepEqual(await request(t,{findById:async()=>null},'/reportes/999'),{status:404,body:{status:'error',message:'Reporte no encontrado.'}});
});
