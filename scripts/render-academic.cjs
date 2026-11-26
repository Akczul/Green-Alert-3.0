// Ejecutar con el Node y las bibliotecas del runtime de artefactos de Codex.
const { chromium } = require(process.env.ARTIFACT_NODE_MODULES + '/playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({executablePath:process.env.ARTIFACT_BROWSER ||
   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
   const page=await browser.newPage();
   await page.goto(pathToFileURL(path.join(root,'docs/entrega/informe-greenalert.html')).href);
   await page.pdf({path:path.join(root,'docs/entrega/informe-greenalert.pdf'),format:'A4',
     printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,
     headerTemplate:'<span></span>',
     footerTemplate:'<div style="width:100%;font-family:Arial;font-size:8px;text-align:center;color:#555">GreenAlert 3.0 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
   console.log('PDF generado desde el mismo HTML editable.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e.message);process.exitCode=1});
