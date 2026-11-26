import { mkdir,writeFile } from 'node:fs/promises';
import pool from '../src/config/database.js';
import { adminMfa } from '../src/bootstrap/admin-mfa.js';
const id=Number(process.argv[2]);
if (!Number.isSafeInteger(id) || id<1 || !adminMfa) throw new Error('Uso: node scripts/provision-admin-mfa.mjs ID; configurar MFA administrativa');
try {
  const factor=await adminMfa.provision(id);
  await mkdir('.local/mfa',{recursive:true});
  // Material privado de enrolamiento, fuera de Git y del paquete académico.
  await writeFile(`.local/mfa/${id}.json`,JSON.stringify({secret:factor.secret,uri:factor.uri}),{flag:'wx',mode:0o600});
  console.log(`Enrolamiento privado escrito en .local/mfa/${id}.json; importar en autenticador y custodiar fuera del repositorio.`);
} finally { await pool.end(); }
