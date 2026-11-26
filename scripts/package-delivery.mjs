import { execFileSync } from 'node:child_process';
import { mkdir,readFile,writeFile,copyFile,stat,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readApkManifest, validateApk } from './apk-provenance.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'.local/entrega');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
if(git(['status','--porcelain'])) throw new Error('Confirmar cambios locales antes de empaquetar para conservar correspondencia con SHA.');
const sha=git(['rev-parse','HEAD']), branch=git(['branch','--show-current']);
const apk=readApkManifest(root);
const verified=apk?.exists ? validateApk(root,apk) : null;
await mkdir(output,{recursive:true});
// Rechazar sobrantes sin eliminar artefactos históricos del usuario.
for(const name of await readdir(output)) {
  if(name.toLowerCase().endsWith('.apk') && (name !== 'greenalert.apk' || !verified))
    throw new Error('La entrega contiene una APK anterior; conservarla en otra carpeta antes de empaquetar.');
}
const repository='https://github.com/Akczul/Green-Alert-3.0.git';
await writeFile(path.join(output,'VERSION.txt'),`Repositorio: ${repository}\nRama: ${branch}\nSHA de entrega: ${sha}\nLa publicación remota se verifica por separado.\n`);
const zip=path.join(output,'GreenAlert3.0-codigo.zip');
git(['archive','--format=zip','--output',zip,sha]);
const artifacts=['GreenAlert3.0-codigo.zip','VERSION.txt'];
for(const file of ['informe-greenalert.html','informe-greenalert.pdf']){
  await copyFile(path.join(root,'docs/entrega',file),path.join(output,file)); artifacts.push(file);
}
if(apk?.exists){
  const {source}=verified;
  await copyFile(source,path.join(output,'greenalert.apk')); artifacts.push('greenalert.apk');
  await writeFile(path.join(output,'apk.json'),JSON.stringify(apk,null,2)+'\n'); artifacts.push('apk.json');
  for(const file of ['firma.txt','contenido.txt','greenalert.apk.sha256']) {
    await copyFile(path.join(root,'.local/apk',file),path.join(output,file)); artifacts.push(file);
  }
}
const records=[];
for(const name of artifacts){
  const file=path.join(output,name);
  records.push({name,bytes:(await stat(file)).size,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});
}
await writeFile(path.join(output,'MANIFIESTO.json'),JSON.stringify({repository,branch,sha,createdAt:new Date().toISOString(),
  artifacts:records,apk:apk??{exists:false,limitation:'Consultar docs/verificacion-final.md'},publication:'Verificar rama y SHA remoto por separado.'},null,2));
console.log(`Paquete generado: ${output}\nSHA: ${sha}\nArtefactos: ${records.length}`);
