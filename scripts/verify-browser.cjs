// Prueba del React compilado con un navegador aislado, sin tocar perfiles personales.
const { chromium }=require(process.env.ARTIFACT_NODE_MODULES+'/playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const compose=['compose','--env-file','.env.integracion','-f','compose.datos.yml','-f','compose.apps.yml'];
const docker=args=>execFileSync('docker',[...compose,...args],{cwd:root,windowsHide:true,encoding:'utf8'});
const origin='http://127.0.0.1:8080';
(async()=>{
  const output=path.join(root,'.local/integracion/browser');
  await fs.mkdir(output,{recursive:true});
  const marker=JSON.parse(await fs.readFile(path.join(root,'.local/integracion/sandbox.json'),'utf8'));
  if(!marker.synthetic || marker.project!=='greenalert-final') throw new Error('Se requiere el sandbox sintético de esta sesión');
  docker(['restart','backend-prod']);
  let ready=false;
  for(let i=0;i<120;i++){
    try { if((await fetch(origin+'/api/health')).ok) { ready=true; break; } } catch {}
    await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready) throw new Error('API del sandbox no recuperó disponibilidad antes del recorrido visual');
  const suffix=randomBytes(5).toString('hex');
  const profile={nombre:'Visual',apellido:'Sintetica',email:'visual-'+suffix+'@example.test',password:'Senderos ambientales para una prueba '+suffix};
  const request=async(method,route,body,token)=>{
    const response=await fetch(origin+'/api'+route,{method,headers:{
      ...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
      body:body?JSON.stringify(body):undefined});
    if(!response.ok) throw new Error(route+' HTTP '+response.status);
    return (await response.json()).data;
  };
  await request('POST','/auth/register',profile);
  // Solo el usuario sintético recién creado en el sandbox de esta sesión.
  docker(['exec','-T','backend-prod','node','--input-type=module','-e',
    `import pool from './src/config/database.js';await pool.execute('UPDATE usuarios SET rol=? WHERE email=?',['moderador',${JSON.stringify(profile.email)}]);await pool.end();`]);
  const browser=await chromium.launch({headless:true,executablePath:process.env.ARTIFACT_BROWSER ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const checks=[];
  try {
    const page=await browser.newPage({viewport:{width:1365,height:900}});
    await page.goto(origin+'/login');
    await page.locator('input[type=email]').fill(profile.email);
    await page.locator('input[autocomplete="current-password"]').fill(profile.password);
    await Promise.all([
      page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.status()===200),
      page.getByRole('button',{name:'Iniciar sesión',exact:true}).click(),
    ]);
    const risk=page.getByRole('button',{name:'Calcular riesgo ambiental',exact:true});
    await risk.waitFor({timeout:30000});
    await risk.scrollIntoViewIfNeeded();
    const [riskResponse]=await Promise.all([
      page.waitForResponse(r=>r.url().includes('/integracion/analisis/riesgo'),{timeout:45000}),risk.click(),
    ]);
    if(riskResponse.status()!==200) throw new Error('React → analítica HTTP '+riskResponse.status());
    const run=(await riskResponse.json()).data;
    if(run.source_kind!=='mysql') throw new Error('El cálculo no usa snapshot MySQL');
    await page.getByText(/Zonas identificadas:/).waitFor();
    checks.push('React ejecuta FastAPI y persiste ejecución MongoDB a través de Express');
    await page.screenshot({path:path.join(output,'web-analisis.png')});
    const [indicators]=await Promise.all([
      page.waitForResponse(r=>r.url().includes('/integracion/indicadores'),{timeout:45000}),
      page.getByRole('button',{name:'Consultar indicadores',exact:true}).click(),
    ]);
    if(indicators.status()!==200) throw new Error('React → indicadores HTTP '+indicators.status());
    await page.getByRole('columnheader',{name:'Hora UTC',exact:true}).waitFor();
    checks.push('React consulta Spring y Druid a través de Express');
    await page.screenshot({path:path.join(output,'web-indicadores.png')});
    const auth=await page.evaluate(()=>({token:localStorage.getItem('ga_token'),refreshToken:localStorage.getItem('ga_refresh_token')}));
    const report=(await request('POST','/reportes',{tipo_contaminacion:'agua',nivel_severidad:'medio',
      titulo:'Recorrido visual '+suffix,direccion:'Laboratorio sintético'},auth.token)).reporte;
    // El worker tiene un intervalo de cinco segundos; esperar un hecho comprobado por lectura.
    for(let i=0;i<20;i++){
      const history=await request('GET','/integracion/reportes/'+report.id_reporte+'/historial',null,auth.token);
      if(history.length) break;
      await new Promise(r=>setTimeout(r,1000));
    }
    await page.goto(origin+'/reports/'+report.id_reporte);
    const historyButton=page.getByRole('button',{name:'Consultar historial ambiental',exact:true});
    await historyButton.waitFor({timeout:30000}); await historyButton.scrollIntoViewIfNeeded();
    const [historyResponse]=await Promise.all([
      page.waitForResponse(r=>r.url().includes('/historial'),{timeout:45000}),historyButton.click(),
    ]);
    const history=(await historyResponse.json()).data;
    if(historyResponse.status()!==200 || !history.some(row=>row.type==='REPORT_CREATED')) throw new Error('No existe historial real en el recorrido React');
    await page.getByText(/Reporte creado/).waitFor();
    checks.push('React consulta historial MySQL autorizado → Spring → Cassandra');
    await page.screenshot({path:path.join(output,'web-historial.png')});
    await request('POST','/auth/logout',{refreshToken:auth.refreshToken},auth.token);
    await fs.writeFile(path.join(output,'resultado.json'),JSON.stringify({checks,passed:true,
      scope:'Navegador Edge headless aislado contra React/Nginx/Express y motores reales; sin teléfono físico'},null,2));
    console.log('Navegador: '+checks.length+' recorridos reales correctos.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
