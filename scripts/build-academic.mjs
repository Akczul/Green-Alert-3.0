import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApkManifest, validateApk } from './apk-provenance.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'docs/entrega');
await fs.mkdir(output,{recursive:true});
const read=p=>fs.readFile(path.join(root,p),'utf8');
const optional=async p=>{try{return JSON.parse(await read(p));}catch{return null;}};
const result=await optional('.local/integracion/resultado.json');
const measurement=await optional('.local/integracion/medicion.json');
const apk=readApkManifest(root);
if(apk?.exists) validateApk(root,apk);
const browser=await optional('.local/integracion/browser/resultado.json');
const compliance=await optional('docs/evidencias-integracion/cumplimiento.json');
const complianceText=compliance?`${compliance.passed}/${compliance.total} comprobaciones de cumplimiento contra el stack real (commit ${compliance.commit.slice(0,7)})`:'Verificación de cumplimiento no registrada';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const table=(headers,rows)=>'<table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
  rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const para=s=>'<p>'+esc(s)+'</p>';
const code=s=>'<pre>'+esc(s)+'</pre>';
const section=(n,title,body)=>`<section data-section="${n}"><h1>${n} ${title}</h1>${body}</section>`;
const checks=result?.checks??[];
const summary=checks.length ? `${checks.filter(x=>x.status==='passed').length} comprobaciones correctas y ${checks.filter(x=>x.status==='failed').length} fallidas en la aceptación actual.` : 'Aceptación actual aún no registrada.';
const chapters=[];
chapters.push(section(1,'Planteamiento',
  para('Problema: los reportes ciudadanos de contaminación (agua, aire, residuos, ruido) suelen perderse entre canales informales, sin validación, seguimiento institucional ni análisis territorial. GreenAlert organiza esos reportes, su validación por moderadores y su atención por entidades, y los convierte en zonas de riesgo, historial e indicadores. La integración conecta el registro transaccional con cálculos ambientales y un historial analítico trazable, sin sustituir las pantallas ni las reglas existentes.')+para('Justificación: el instructivo exige tres backends, cinco motores y tres mecanismos avanzados integrados a procesos reales (Jacanamijoy, 2026). Cada tecnología cumple una función verificable: transacción y autorización (Express/MySQL), cálculo paralelo (FastAPI/MongoDB), eventos inmutables e indicadores (Spring/Cassandra/Druid) y caché (Redis). Usuarios: ciudadanía, moderadores, entidades y administradores en dos niveles.')+
  para('El objetivo es permitir que ciudadanía, moderadores, administradores y entidades consulten y gestionen información ambiental con permisos verificables. Se integraron cuatro desarrollos conservando sus historiales en una rama independiente. Esta entrega es local; no acredita publicación remota, instalación física móvil ni proveedores externos.')+
  table(['Objetivo verificable','Resultado esperado'],[
    ['O1 Integración','Tres APIs distintas y cinco motores con operaciones de negocio'],
    ['O2 Continuidad','Mantener contratos, sesiones revocables, reportes y reglas institucionales'],
    ['O3 Recuperación','Caché prescindible; hechos pendientes durables y reintentos idempotentes'],
    ['O4 Entrega','Código empaquetado, instalación reproducible, evidencia y artefactos móviles reales'],
    ['O5 Identidad','Inicio local y federado OIDC, jerarquía administrativa, sesiones web por cookies y MFA administrativa']])+
  para('Alcance: Express, FastAPI, Spring Boot, React y React Native; MySQL, MongoDB, Cassandra, Redis y Druid. No se añade ML. La regresión experimental heredada es opcional y no participa en la demostración integrada de riesgo.')+
  para('La solución conserva límites explícitos: la aceptación con cuentas reales de Google y Microsoft y la instalación física de la APK se comprueban en la sustentación. '+summary)));
chapters.push(section(2,'Requisitos y casos de uso',
  table(['ID','Requisito','Aceptación'],[
    ['RF01','Registrar, autenticar y revocar sesiones','Registro público ciudadano; logout invalida JWT y refresh'],
    ['RF02','Crear y consultar reportes','Alta MySQL, categorías canónicas, propiedad y evidencias'],
    ['RF03','Calcular riesgo ambiental','Snapshot autorizado a FastAPI; ejecución conservada en MongoDB'],
    ['RF04','Consultar historial ambiental','UUID autorizado y hechos Cassandra ordenados por rango'],
    ['RF05','Consultar indicadores','Reconciliación diaria y agregados Druid comprobables'],
    ['RF06','Operar desde Android','Acceso, reportes propios, consulta y creación nativos; servidor configurable'],
    ['RF07','Administrar por niveles','Superadministrador gestiona administradores, parámetros y auditoría; administrador de ámbito solo su comunidad u organización'],
    ['RF08','Iniciar sesión federada','Google y Microsoft (OIDC); rol asignado por GreenAlert; MFA para administradores'],
    ['RNF01','Seguridad','Rol/objeto en API, MFA admin y sesión limitada'],
    ['RNF02','Resiliencia','Fallo Redis recupera MySQL; Spring conserva pendientes'],
    ['RNF03','Reproducibilidad','Compose separados, red externa, volúmenes y locks'],
    ['RNF04','Trazabilidad','IDs durables, auditoría, pruebas y artefactos versionados'],
    ['RNF05','Sesión web segura','HTTPS, cookies Secure/HttpOnly/SameSite y CSRF en escrituras']])+
  '<h2>CU01 Crear reporte</h2>'+para('Actor: ciudadano autenticado. Precondición: sesión vigente y categoría activa. Flujo: completa título, dirección, ubicación y evidencias opcionales; Express valida; MySQL inserta el reporte y su hecho outbox; el sistema analiza y procesa evidencias, asigna atención cuando corresponde y responde 201. Alternativas: datos inválidos producen 400; fallo remoto conserva los límites de compensación documentados. Resultado: reporte pendiente y hecho durable.')+
  '<h2>CU02 Analizar riesgo</h2>'+para('Actor: admin o moderador. Precondición: permiso vigente. Desde el dashboard solicita un período; Express selecciona exclusivamente reportes validados y minimiza datos; FastAPI calcula; MongoDB guarda el resultado. Alternativas: período inválido 400, exceso de snapshot 413, dependencia 503/504. Resultado: ejecución identificada y zonas calculadas.')+
  '<h2>CU03 Consultar historial e indicadores</h2>'+para('Actor: propietario, entidad asignada o personal global según operación. Express comprueba el objeto en MySQL antes de consultar Spring. El administrador entrega pendientes y reconcilia el día UTC; Spring lee Cassandra, reemplaza el intervalo Druid y consulta agregados. Alternativas: objeto no autorizado 404, rol insuficiente 403, dependencia 503. Resultado: hechos o métricas, sin exponer tokens internos.')+
  '<h2>CU04 Gestionar usuarios por ámbito</h2>'+para('Actor: superadministrador o administrador de ámbito con MFA. Precondición: sesión administrativa vigente. Flujo: abre /admin; el backend recarga su nivel y ámbito desde MySQL, lista solo usuarios de su ámbito y aplica el cambio de rol o estado en una transacción con auditoría. Alternativas: usuario fuera del ámbito 404/403; elevación por un administrador de ámbito 403; degradar al último superadministrador 409. Resultado: cambio auditado y sesiones del afectado revocadas.')+
  '<h2>CU05 Iniciar sesión con Microsoft</h2>'+para('Actor: persona con cuenta Microsoft. Flujo: pulsa Microsoft; el backend genera state, nonce y PKCE; tras autorizar, valida el id_token (firma JWKS, emisor, audiencia, nonce), crea un ciudadano o usa el vínculo existente y redirige con un código temporal que la web canjea por cookies de sesión. Alternativas: state repetido 400, firma inválida 401, correo existente sin email_verified 409, administrador sin TOTP 403 hasta completar el segundo factor. Resultado: sesión web por cookies.')));
chapters.push(section(3,'Reglas de negocio',
  table(['Regla','Implementación y efecto'],[
    ['RN01 Registro','No acepta elevación de rol pública; normaliza correo y UNIQUE impide duplicados, incluso simultáneos'],
    ['RN02 Estados','pendiente, en_proceso, resuelto, rechazado; normaliza en proceso y respeta transiciones'],
    ['RN03 Moderación','Resolver/rechazar requiere comentario; el rechazo no se reabre con una transición prohibida'],
    ['RN04 Atención','pendiente, en_atencion, atendido, cerrado constituye un ciclo independiente'],
    ['RN05 Propiedad','Ciudadano consulta su historial; entidad solo reportes asignados; admin/moderador tienen acceso global actual'],
    ['RN06 Riesgo','Solo reportes no borrados, en_proceso/resuelto y coordenadas válidas; ventanas y score existentes'],
    ['RN07 Caché','TTL 300 s; cualquier cambio de reporte incrementa revisión durable; Redis no es autoridad'],
    ['RN08 Eventos','event_id y contenido permanecen iguales en reintentos; reportId es UUID, no ID numérico'],
    ['RN09 Privacidad','El snapshot y los eventos omiten nombres, correos, títulos, direcciones y evidencias'],
    ['RN10 Sesiones','sid/ver, revocación, actividad 30 min y límite absoluto 7 días'],
    ['RN11 MFA','TOTP obligatorio para admin en el stack final; código consumido una vez y secreto cifrado'],
    ['RN12 Consistencia','No se promete rollback global de SQL, almacenamiento remoto y demás motores'],
    ['RN13 Jerarquía','modules/administracion/domain/jerarquia.js: nadie cambia su propio rol; el ámbito se evalúa por objeto; solo el superadministrador asigna administradores'],
    ['RN14 Último superadmin','mysql-administracion.js: SELECT … FOR UPDATE impide quedar sin superadministrador activo, también con solicitudes simultáneas'],
    ['RN15 Federación','modules/identidad-federada/domain/federacion.js: el rol no proviene del proveedor; vincular un correo existente exige email_verified'],
    ['RN16 CSRF','identidad/adapters/inbound/web-session.js: escritura autenticada por cookie exige X-CSRF-Token igual a la cookie __Host-ga_csrf']])+
  para('Las reglas originales permanecen en sus módulos y controladores. La integración introduce puertos y composition root propios en src/modules/integracion y src/bootstrap/integracion.js. La creación mantiene su semántica de autocommit y compensación; la outbox registra hechos transaccionales de inserción/cambio, no una promesa de éxito atómico de todos los efectos.')+
  para('Evidencia normativa del proyecto: docs/hexagonal-reportes-creacion.md, docs/hexagonal-reportes-lectura.md, docs/piloto-hexagonal-zonas-riesgo.md y docs/integracion-final.md.')));
const diagram=`<svg viewBox="0 0 760 340" role="img" aria-label="Arquitectura de servicios"><defs><marker id="a" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#344b43"/></marker></defs><g fill="none" stroke="#344b43" stroke-width="2" marker-end="url(#a)"><path d="M160 60H270M160 140H270M370 105H470M370 105V250H470M570 70H650M570 250H650M315 145V195M315 195H150M570 270V315H650"/></g><g fill="#edf5f0" stroke="#79998a"><rect x="10" y="30" width="150" height="60" rx="5"/><rect x="10" y="110" width="150" height="60" rx="5"/><rect x="270" y="65" width="100" height="80" rx="5"/><rect x="470" y="40" width="100" height="60" rx="5"/><rect x="470" y="220" width="100" height="60" rx="5"/><rect x="650" y="40" width="100" height="60" rx="5"/><rect x="650" y="220" width="100" height="60" rx="5"/><rect x="650" y="295" width="100" height="35" rx="5"/><rect x="270" y="195" width="100" height="55" rx="5"/><rect x="45" y="195" width="105" height="55" rx="5"/></g><g font-family="Arial" font-size="14" text-anchor="middle" fill="#13261f"><text x="85" y="65">React web</text><text x="85" y="145">Android nativo</text><text x="320" y="101">Nginx</text><text x="320" y="122">Express</text><text x="520" y="75">FastAPI</text><text x="520" y="255">Spring</text><text x="700" y="75">MongoDB</text><text x="700" y="255">Cassandra</text><text x="700" y="317">Druid</text><text x="320" y="225">MySQL</text><text x="98" y="225">Redis</text><text x="440" y="307" font-size="12">Reconciliación diaria</text></g></svg>`;
chapters.push(section(4,'Arquitectura y diseño',diagram+
  '<p class="caption">Figura 1. Servicios y motores integrados. Fuente: código del proyecto. La outbox MySQL entrega hechos a Spring; Druid se reconstruye explícitamente desde Cassandra.</p>'+
  table(['Tecnología','Justificación'],[
    ['Express y MySQL','Preservan contratos, SQL explícito y fuente transaccional existente'],
    ['FastAPI y MongoDB','DTO validado, cálculo ambiental en procesos y ejecución analítica documentada'],
    ['Spring y Cassandra','Pool acotado, eventos inmutables, consultas por reporte/día e idempotencia LWT'],
    ['Apache Druid','Rollup por hora y reemplazo de segmentos diarios para consultas agregadas'],
    ['Redis','Agregados temporales compartidos con TTL; caída tolerable sin perder reportes'],
    ['React y React Native','Web conservada y experiencia Android nativa con almacenamiento seguro']])+
  para('Hexagonal real en zonas, lectura, creación, identidad, integración, administración e identidad federada: casos y dominio reciben puertos; adaptadores MySQL/Redis/HTTP/OIDC se ensamblan mediante fábricas en src/bootstrap. Pruebas automáticas verifican que dominio y aplicación no importan Express, mysql2, jsonwebtoken ni process.env. El resto del monolito sigue por capas; no se presenta una migración total inexistente. Las fuentes Mermaid se incluyen en docs/diagramas-integracion.mmd y docs/hexagonal-integracion.mmd.')+
  table(['Módulo hexagonal','Dominio','Casos de uso (aplicación)','Adaptadores (puertos implementados)','Composition root'],[
    ['administracion','domain/jerarquia.js','application/administrar-usuarios.js','inbound/http-admin.js; outbound/mysql-administracion.js','bootstrap/administracion.js'],
    ['identidad-federada','domain/federacion.js','application/inicio-federado.js','outbound/oidc-client.js; outbound/mysql-cuentas-federadas.js','bootstrap/identidad-federada.js'],
    ['identidad','domain/seguridad.js','application/seguridad.js','inbound/auth-middleware.js, web-session.js; outbound/mysql-session-reader.js, admin-mfa.js','bootstrap/seguridad.js'],
    ['reportes-creacion / reportes-lectura','domain/*','application/crear-reporte.js; consultar-reportes.js','outbound MySQL y Cloudinary; inbound HTTP','bootstrap/reportes-*.js'],
    ['zonas-riesgo / integracion','domain/*','application/*','outbound MySQL, Redis, HTTP a FastAPI/Spring','bootstrap/zonas-riesgo.js, integracion.js']])+
  para('Despliegue: compose.datos.yml (proyecto greenalert-final) administra cinco motores y auxiliares Druid: MySQL de metadatos, ZooKeeper, Coordinator, Broker, Historical y MiddleManager. compose.apps.yml (proyecto greenalert-final-apps) administra las tres APIs y Nginx/React. Son proyectos independientes unidos por una red externa declarada (Docker Inc., s. f.-b); no hay depends_on cruzado. Orden: crear la red, levantar datos y esperar sus healthchecks, levantar aplicaciones. Solo Nginx publica puertos (8443 HTTPS y 8080), ligados a loopback por defecto. Las imágenes usan versiones fijadas, compilación multietapa y usuario sin privilegios (Docker Inc., s. f.-a).')));
chapters.push(section(5,'Datos y diccionario',
  para('El diccionario completo extraído del DDL del principal, las migraciones y el esquema CQL se entrega en docs/diccionario-cinco-motores.md. Los ejemplos siguientes son sintéticos. Cada motor tiene una responsabilidad y una autoridad explícitas.')+
  table(['Motor y registro','Campos y restricciones principales','Finalidad'],[
    ['MySQL reportes','id_reporte PK; uuid UNIQUE; id_usuario FK; estado/severidad ENUM; latitud/longitud DECIMAL; deleted_at nullable','Fuente de verdad del reporte. Ejemplo categoría agua y estado pendiente'],
    ['MySQL integration_outbox','id BIGINT PK; event_id CHAR(36) UNIQUE; report_uuid CHAR(36); payload JSON; attempts; available_at; delivered_at nullable','Hecho y entrega durable; índice pendiente por fecha/ID'],
    ['MySQL identidad','refresh_tokens sid/ver; session_activity PK session_id y fechas; admin_mfa secreto cifrado/contador; security_audit actor/ruta/correlación','Revocación, límites, MFA y auditoría'],
    ['MySQL usuarios (024)','nivel_admin ENUM(global, ambito) NULL; ambito_entidad INT FK entidades; CHECK nivel solo en admin y global sin ámbito; índice (rol, nivel_admin, activo)','Jerarquía administrativa. Ejemplo: admin, ambito, ambito_entidad=1'],
    ['MySQL admin_audit (024)','id PK; occurred_at DATETIME(3); actor_id; action; target_id; before_state/after_state JSON; triggers impiden UPDATE/DELETE','Auditoría administrativa de solo anexado. Ejemplo: cambiar_rol con estado anterior y posterior'],
    ['MySQL federated_identities (025)','id PK; provider VARCHAR(40); subject VARCHAR(255); id_usuario FK; UNIQUE (provider, subject) y (provider, id_usuario)','Vínculo OIDC. Ejemplo: microsoft + sub del id_token'],
    ['MongoDB analytics_runs','run_id string UNIQUE; scope; kind; schema_version; source_revision; input_hash; executed_at date; results object','Ejecución de cálculo, índice por scope/kind/fecha; no guarda el snapshot personal completo'],
    ['Cassandra eventos','event UUID; report UUID; tipo/fecha/revisión/categoría/severidad; tablas por ID, reporte y día UTC','LWT decide unicidad global; proyecciones sirven historial/reconciliación'],
    ['Redis agregados','greenalert:zonas:public:v1:revision:hash; JSON; TTL 300 s; AOF; namespace propio','Acelerar cálculo; ningún dato único depende del motor'],
    ['Druid greenalert_events_v1','__time; dimensiones type/category/severity/zone; medidas events y reportsCreated; rollup HOUR, segmentos DAY','Agregados derivados de snapshot diario Cassandra']])+
  para('Correlación: reporte.uuid de MySQL = reportId de Cassandra; outbox.event_id = eventId; sourceRevision es la secuencia MySQL de outbox. Mongo conserva run_id, source_revision e input_hash de cada cálculo. Druid agrega dimensiones y medidas y no conserva una fila transaccional por UUID. Redis usa generación de origen; no comparte IDs de usuario.')+
  para('Persistencia: cada motor y los auxiliares durables tienen volúmenes por proyecto. El bootstrap solo inicializa bases nuevas. No se ejecuta un esquema destructivo ni se modifica geometría histórica; se conserva SRID 4326 y axis-order=long-lat.')));
chapters.push(section(6,'API y programación avanzada',
  table(['Contrato','Rutas y errores relevantes'],[
    ['Express','84 rutas registradas; /api por entorno. Envelope status/message/data; errores omiten data. Health conserva formato propio'],
    ['Integración riesgo','POST /integracion/analisis/riesgo: dias 1..180; hasta 20000 reportes; permisos antes de proveedor'],
    ['Historial e indicadores','GET historial autorizado; indicadores de horas UTC. Sin credenciales internas en clientes'],
    ['Operador','POST reenviar y reconciliar; rol admin y token de reconciliación separado'],
    ['Administración','GET/PATCH/DELETE /admin/usuarios con alcance por objeto; GET /admin/auditoria solo superadministrador'],
    ['Identidad federada','GET /auth/microsoft/url y /callback (OIDC, PKCE); POST /auth/oauth/exchange con totp para administradores'],
    ['Sesión web','Cabecera X-GreenAlert-Client: web; cookies __Host-ga_at/__Host-ga_rt/__Host-ga_csrf; X-CSRF-Token en escrituras'],
    ['Errores','400 validación; 401 falta token; 403 sesión/rol/CSRF; 404 objeto fuera de alcance; 409 conflicto (unicidad, último superadmin); 413 snapshot; 503 dependencia; 504 timeout']])+
  para('OpenAPI (OpenAPI Initiative, 2026): apps/backend/docs/openapi.yaml (79 rutas, esquemas bearerAuth y cookieAuth); apps/analytics/evidence/openapi.json; apps/events/evidence/openapi.json. Los ejemplos internos heredados siguen disponibles, pero las rutas integradas usan adaptadores propios dentro del backend.')+
  table(['Mecanismo','Proceso pertinente y prueba'],[
    ['E/S concurrente','Promise.all en lecturas y outbox con lotes de cuatro, sin bloquear el event loop (Node.js, s. f.). Medición HTTP real secuencial/concurrente con igualdad de resultados'],
    ['Escrituras compartidas','Transacción con SELECT … FOR UPDATE protege al último superadministrador; dos degradaciones simultáneas dejan al menos uno (prueba con MySQL real)'],
    ['Caché Redis','Cache-aside (Redis, s. f.), TTL, revisión durable, métricas y fallback. Aceptación con motor real apagado/modificado/recuperado'],
    ['Integridad e idempotencia','UNIQUE de correo ante dos altas; outbox en transacción de origen; LWT Cassandra y reintento del mismo ID sin duplicados'],
    ['FastAPI','ProcessPoolExecutor limitado sobre cálculo de riesgo y PyMongo asíncrono. Pruebas/mediciones heredadas fechadas en apps/analytics/evidence'],
    ['Spring','ThreadPoolTaskExecutor con 4 workers y cola acotada sobre escrituras/eventos (Spring Framework, s. f.). Benchmark heredado con 512 escrituras CQL y equivalencia']])+
  (measurement?para('Medición actual Express: '+measurement.requests+' lecturas; secuencial '+measurement.sequentialMs.toFixed(2)+' ms; concurrente '+measurement.concurrentMs.toFixed(2)+' ms. Es una muestra local, no una garantía de aceleración.'):para('Consultar la medición actual en docs/evidencias-integracion/medicion.json; su ausencia significa que aún no se completó esa comprobación.'))+
  para('Los benchmarks previos de cada servicio se conservan con su fecha, hardware, CPU/RSS y límites. No se les asigna la fecha de la integración ni se presenta entrenamiento ML como requisito de arranque.')));
chapters.push(section(7,'Seguridad y calidad',
  para('La validación separa tests con dobles, contratos MySQL reales, aceptación de motores y comprobación física. Un contenedor healthy no prueba una operación de negocio. Las suites no eliminan aserciones ni regeneran fixtures históricos para aceptar cambios.')+
  table(['Conjunto','Evidencia'],[
    ['Regresión inicial fusionada','339 backend + 28 frontend; compilación y lint correctos'],
    ['Regresión final','Consultar verificacion-final.md y logs saneados; incorpora pruebas de integración y MFA'],
    ['Fase de cumplimiento','Backend 375/375, frontend 30/30, Android 58/58, seguridad con MySQL real 27/27 y '+complianceText],
    ['Android','58/58; lint, configuración y dependencias SDK correctas; APK compilada en Linux'],
    ['Servicios heredados','FastAPI: 35 Python y 3 cliente Node; Spring: 6 unitarias y evidencia de motores reales; resultados con fecha original'],
    ['Aceptación integrada',summary],
    ['Pruebas SQL y contratos','Seguridad, MySQL, 33 lectura y 38 creación según evidencia actual; no confundir con proveedores remotos']])+
  table(['Control','Resultado de diseño y límite'],[
    ['Credenciales','scrypt asíncrono/sal (hash adaptable; Argon2id es la preferencia, no la única opción), mínimo 15 caracteres, frases de más de 64, blocklist (National Institute of Standards and Technology, 2025; OWASP Foundation, s. f.-a)'],
    ['MFA admin','TOTP con antireplay y secreto cifrado; enrolamiento de operador; recuperación manual pendiente'],
    ['Sesiones','JWT breve, refresh rotatorio, sid/ver, revocación, 30 min inactividad/7 días absolutos (OWASP Foundation, s. f.-b)'],
    ['Autorización','Rol y propiedad/entidad antes de salir a servicios; permisos insuficientes no equivalen a una sesión caducada'],
    ['Auditoría','Actor y operación durable antes de confirmar respuesta; ventana de crash respecto a la mutación documentada'],
    ['Web y red','HTTPS (TLS 1.2+, HSTS) en Nginx; tokens web en cookies __Host- HttpOnly/Secure/SameSite=Strict; CSRF de doble envío en escrituras. Certificado autofirmado solo de laboratorio'],
    ['Jerarquía','Superadministrador (admin global) y administrador de ámbito con permisos por objeto; último superadministrador protegido con bloqueo; auditoría de solo anexado por triggers']])+
  para('Pendientes declarados: aceptación con cuentas reales de los proveedores OIDC, certificado TLS de confianza para producción y evaluación integral de accesibilidad/pentest. La matriz completa está en docs/cumplimiento-docente.md.')+
  '<h2>Matriz de trazabilidad</h2>'+table(['Requisito','Caso de uso','Módulo o API','Prueba','Evidencia'],[
    ['RF01 Sesiones','CU05','identidad; POST /auth/login, /refresh, /logout','test:seguridad (27)','.local/mysql-validation/security.json'],
    ['RF02 Reportes','CU01','reportes-creacion, reportes-lectura; /reportes','test:reportes:creacion (38), :lectura (33)','docs/validacion-mysql.md'],
    ['RF03 Riesgo','CU02','integracion; POST /integracion/analisis/riesgo → FastAPI/MongoDB','test:integracion','evidencias-integracion/resultado.json'],
    ['RF04-RF05 Historial e indicadores','CU03','integracion → Spring/Cassandra/Druid','test:integracion','resultado.json; web-historial.png; web-indicadores.png'],
    ['RF06 Android','CU01','apps/mobile','Jest 58','evidencias-integracion/apk.json'],
    ['RF07 Jerarquía','CU04','administracion; /admin/usuarios, /admin/auditoria','administracion-jerarquia.test.js; test:seguridad; test:cumplimiento','cumplimiento.json'],
    ['RF08 Federación','CU05','identidad-federada; /auth/microsoft/*','oidc-microsoft.test.js','docs/integracion-final.md'],
    ['RNF05 Sesión web','CU05','web-session.js; Nginx TLS','web-session-cookies.test.js; api.security.test.js; test:cumplimiento','cumplimiento.json'],
    ['RNF03 Despliegue','—','compose.datos.yml + compose.apps.yml','infra:final:config; test:cumplimiento','cumplimiento.json']])));
chapters.push(section(8,'Operación y uso',
  '<h2>Inicio limpio</h2>'+code('npm.cmd run install:apps\nnpm.cmd run setup:integracion\nnpm.cmd run infra:final:config\nnpm.cmd run infra:final:up\n# Abrir https://localhost:8443 (certificado de laboratorio)\nnpm.cmd run infra:final:superadmin -- correo@dominio')+
  para('Node 24, Git y Docker Compose con contenedores Linux. Reservar unos 8 GB para Docker y memoria adicional para el host. La primera construcción y el arranque de Cassandra/Druid pueden tardar varios minutos. setup genera secretos locales y conserva valores anteriores; nunca imprime credenciales.')+
  '<h2>Recorrido por rol</h2>'+para('Ciudadano: registrar cuenta, acceder, crear reporte, consultar propios y cerrar sesión. Moderador: validar un reporte y calcular riesgo desde dashboard. Entidad: revisar asignaciones y actualizar su ciclo de atención. Superadministrador: inicializado por el operador, enrola MFA, inicia con TOTP, asigna administradores de ámbito, consulta la auditoría y ejecuta reconciliación. Administrador de ámbito: gestiona solo los usuarios de su comunidad u organización. Usuario común que intenta abrir /admin o la API administrativa: recibe 403.')+
  '<h2>Demostración reproducible</h2>'+code('npm.cmd run test:integracion\n# Runner con proyecto, red, credenciales y datos sintéticos propios\nnpm.cmd run infra:final:down\n# Se conservan los volúmenes\nnpm.cmd run infra:final:up')+
  para('Para datos existentes: respaldar y aplicar únicamente las migraciones faltantes 021 a 025 (npm.cmd run infra:final:migrar-024 para la jerarquía), con privilegios apropiados. No ejecutar el bootstrap completo ni la cadena histórica sobre datos existentes. No usar down --volumes para detener una instalación que debe conservarse.')+
  '<h2>Android</h2>'+code('$env:EXPO_PUBLIC_API_URL="http://IP_LAN:8080/api"\n$env:EXPO_PUBLIC_ALLOW_HTTP="true"\nnpm.cmd run apk:docker\nadb install -r .local/apk/greenalert.apk')+
  para(apk?.exists?'APK compilada en Linux (Docker): '+apk.path+'. SHA-256: '+apk.sha256+'. Firma debug de evaluación verificada con apksigner. No acredita instalación física.':
    'APK no generada. '+(apk?.blocker || 'Consultar el estado exacto en el manifiesto final.'))+
  para('La pantalla de acceso permite cambiar la URL del servidor (validada y guardada en SecureStore), por lo que no hace falta recompilar al cambiar de red. Emulador: 10.0.2.2; teléfono: IP LAN alcanzable. No usar localhost. Manual detallado: docs/integracion-final.md y docs/compilacion-android-local.md.')));
chapters.push(section(9,'Identidad y autorización',
  table(['Actor actual','Puede','Restricción'],[
    ['ciudadano','Crear reportes y consultar su historial','No administra ni consulta historial privado ajeno'],
    ['entidad','Consultar y atender reportes asignados','No accede a otro ámbito institucional'],
    ['moderador','Validar reportes, analizar riesgo e indicadores','No ejecuta operaciones de operador exclusivas admin'],
    ['admin global (superadministrador)','Administradores, niveles y ámbitos; categorías (parámetros); eventos y caché; auditoría. MFA obligatoria','No borra auditoría; no cambia su propio rol; no deja el sistema sin superadministrador'],
    ['admin de ámbito (segundo nivel)','Usuarios comunes de su comunidad u organización. MFA obligatoria','No se eleva ni eleva a otros; no ve ni modifica otro ámbito (403/404)']])+
  para('La fuente autoritativa de cada petición valida usuario activo, auth_version, sid, rol y entidad. Logout revoca la familia; cambiar privilegios invalida accesos antiguos según el contrato de seguridad. Los tokens internos no representan al usuario: Express debe autorizar antes de llamar al servicio.')+
  para('La MFA usa un secreto por administrador cifrado con una clave separada del JWT. Un contador aceptado no puede reutilizarse; la actualización condicional MySQL cierra la carrera entre dos logins. El enrolamiento no se publica en la API y no reemplaza factores existentes. La custodia del material privado corresponde al operador y al titular del factor.')+
  para('El inicio federado usa OpenID Connect sobre OAuth 2.0: el proveedor autentica y GreenAlert autoriza (OpenID Foundation, s. f.). Proveedores OIDC: Google (id_token verificado) y Microsoft Entra ID (Authorization Code + PKCE S256, state y nonce de un solo uso, firma RS256 con JWKS, iss, aud y exp). El rol se asigna en GreenAlert; un correo existente solo se vincula con email_verified. Una cuenta federada administradora completa el TOTP antes de recibir sesión. Facebook OAuth no se presenta como OIDC. El login con cuentas reales requiere registrar las aplicaciones en cada proveedor.')+
  para('El primer superadministrador se crea por inicialización controlada (scripts/crear-superadmin.mjs), nunca por registro público. Los cuatro roles existentes se conservan: la jerarquía se expresa como nivel del rol admin para no romper contratos web ni móviles.')));
chapters.push(section(10,'Integridad y rendimiento',
  para('MySQL conserva relaciones y unicidad; la inscripción simultánea devuelve una creación y un conflicto 409. La fila de reporte y su hecho outbox se confirman juntos mediante trigger. El worker no borra entregas fallidas y serializa workers por esquema, con cuatro peticiones de salida en paralelo.')+
  para('Cassandra decide la identidad global mediante IF NOT EXISTS. Un reintento con mismo ID/contenido no agrega un hecho; el contenido diferente entra en conflicto. La proyección Druid reemplaza el intervalo diario en lugar de sumar un replay, y se consulta después de la disponibilidad del segmento.')+
  para('Redis es una optimización: un miss, timeout o reinicio provoca lectura desde MySQL. La generación forma parte de la clave y se incrementa en la transacción de modificación, incluso cuando Redis está caído. El TTL limita residuos de revisiones previas sin eliminar claves ajenas.')+
  table(['Prueba','Propiedad observada'],checks.filter(x=>/Redis|Outbox|simultáneas|Concurrencia|reiniciar|MFA|Inactividad/.test(x.name)).map(x=>[x.name,x.status+(x.ms?' · '+x.ms+' ms':'')]))+
  para('Los tiempos incluyen transporte, planificación y carga concurrente del equipo. Docker stats registra recursos por servicio; los benchmarks heredados distinguen RSS/CPU, pool caliente y repeticiones. La primera compilación Android y el stack consumen recursos compartidos, por lo que estas cifras no caracterizan una capacidad productiva.')+
  para('No existe atomicidad distribuida entre cinco motores, ni rollback garantizado de almacenamiento externo. La auditoría HTTP y la mutación tienen una ventana de crash; los hechos de reportes sí quedan en outbox transaccional.')));
chapters.push(section(11,'Experiencia y marca',
  table(['Elemento','Web y móvil'],[
    ['Marca','GreenAlert; logo conservado en assets de cada aplicación'],
    ['Paleta','Fondo #030712, superficie #111827, borde #374151, primario #22C55E, texto #F0FDF4, secundario #9CA3AF, error #FCA5A5'],
    ['Tipografía','Inter; jerarquías de título, subtítulo, cuerpo y ayuda adaptadas a DOM y componentes nativos'],
    ['Componentes','Botón deshabilitado durante envío, campos etiquetados, avisos de error, carga y estados vacíos'],
    ['Navegación','React Router web; Expo Router Android; panel según rol y autorizaciones backend'],
    ['Adaptación','Mapa y formularios web conservados; ubicación/cámara móvil mediante permisos explícitos']])+
  para('La misma tarea de crear reporte se adapta al dispositivo: web usa formulario y archivos del navegador; Android usa campos nativos, selector/cámara y ubicación solicitada por el usuario. Ambos validan título, categoría, severidad, dirección y límites de evidencias antes de enviar el contrato multipart. La URL móvil es configurable y las credenciales se conservan en SecureStore.')+
  para('El nuevo panel web solicita cálculo ambiental e indicadores a través de Express y muestra carga, resultado o error. El campo TOTP se identifica como exclusivo de administradores; el ciudadano puede dejarlo vacío. Los errores de rol no eliminan una sesión móvil vigente.')+
  para('Accesibilidad aplicada según la referencia rápida WCAG 2.2 (World Wide Web Consortium, s. f.): campos con etiqueta, mensajes de error con role=alert, botón deshabilitado durante el envío, foco visible y botones con aria-label (por ejemplo, Continuar con Microsoft y la verificación TOTP).')+para('Capturas verificables se adjuntan solo si proceden de la aplicación ejecutada. No se inventan pantallas de teléfono ni capturas de una instalación inexistente. Pendientes: prueba física de cámara/GPS/Keystore, contraste/teclado/lector de pantalla completos y comparación visual en un dispositivo real.')+
  para('Guía de marca y contratos móviles: apps/mobile/docs/marca.md y apps/mobile/docs/contratos.md. La documentación de aceptación conserva los pasos pendientes.')));
const refs=[
  ['Docker Inc. (s. f.-a). Building best practices. Docker Docs.','https://docs.docker.com/build/building/best-practices/'],
  ['Docker Inc. (s. f.-b). Networking in Compose. Docker Docs.','https://docs.docker.com/compose/how-tos/networking/'],
  ['Jacanamijoy, F. (2026). Instructivo del proyecto final de Programación Avanzada [Instructivo de curso]. Facultad TICS, Ingeniería de Sistemas.','Documento docente, siete páginas.'],
  ['National Institute of Standards and Technology. (2025). Digital identity guidelines: Authentication and authenticator management (SP 800-63B-4).','https://doi.org/10.6028/NIST.SP.800-63B-4'],
  ['Node.js. (s. f.). Don’t block the event loop (or the worker pool).','https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop'],
  ['OpenAPI Initiative. (2026). OpenAPI Specification v3.2.1.','https://spec.openapis.org/oas/v3.2.1.html'],
  ['OpenID Foundation. (s. f.). How OpenID Connect works.','https://openid.net/developers/how-connect-works/'],
  ['OWASP Foundation. (s. f.-a). Password storage cheat sheet.','https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html'],
  ['OWASP Foundation. (s. f.-b). Session management cheat sheet.','https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html'],
  ['Redis. (s. f.). Redis cache-aside.','https://redis.io/docs/latest/develop/use-cases/cache-aside/'],
  ['Spring Framework. (s. f.). Task execution and scheduling.','https://docs.spring.io/spring-framework/reference/integration/scheduling.html'],
  ['World Wide Web Consortium. (s. f.). How to meet WCAG (quick reference).','https://www.w3.org/WAI/WCAG22/quickref/']
];
let captures='';
if(browser?.passed){
 const pictures=[
   ['web-analisis.png','Cálculo ambiental desde React','Un moderador inicia sesión y pulsa Calcular riesgo ambiental. La respuesta contiene zonas de reportes MySQL validados y queda conservada como ejecución en MongoDB. La tarjeta muestra cantidad de reportes, nivel, puntuación y tendencia.'],
   ['web-indicadores.png','Indicadores de eventos ambientales','El botón Consultar indicadores solicita a Express los agregados Druid a través de Spring. La tabla muestra hora UTC, categoría, eventos y reportes creados. La imagen procede de datos sintéticos después de una reconciliación diaria real.'],
   ['web-historial.png','Historial autorizado de un reporte','En el detalle se pulsa Consultar historial ambiental. Express verifica propiedad o permiso en MySQL y Spring devuelve hechos persistidos en Cassandra. El hecho de creación aparece con su fecha; una entrega pendiente puede tardar el intervalo del worker.']
 ];
 for(let i=0;i<pictures.length;i++){
   const [file,title,text]=pictures[i];
   const bytes=await fs.readFile(path.join(root,'.local/integracion/browser',file));
   captures+='<section><h1>'+esc(title)+'</h1>'+para(text)+'<img alt="'+esc(title)+'" style="width:100%;height:auto" src="data:image/png;base64,'+bytes.toString('base64')+'"><p class="caption">Figura '+(i+2)+'. '+esc(title)+'. Fuente: aplicación compilada y ejecutada en el sandbox de esta integración, navegador Edge headless. No es una captura móvil ni una maqueta.</p></section>';
 }
}
const references='<section><h1>Referencias</h1>'+refs.map(([label,url])=>{
  const at=label.indexOf('). ')+3;
  const formatted=at>2?esc(label.slice(0,at))+'<em>'+esc(label.slice(at))+'</em>':esc(label);
  return '<p class="reference">'+formatted+' '+(url.startsWith('http')?'<a href="'+esc(url)+'">'+esc(url)+'</a>':esc(url))+'</p>';
 }).join('')+
  '<h2>Trazabilidad y aportes</h2>'+para('Matriz complementaria: docs/trazabilidad-integracion.md. La auditoría histórica de 227 filas se conserva sin reemplazar sus datos por porcentajes nuevos. El archivo VERSION.txt del paquete identifica el repositorio y SHA final. Los historiales Git conservan los aportes de cada rama; nombres, porcentajes y declaraciones individuales deben ser validados por los integrantes antes de la entrega docente.')+'</section>';
const index=chapters.map((_,i)=>`<li>${['Planteamiento','Requisitos y casos de uso','Reglas de negocio','Arquitectura y diseño','Datos y diccionario','API y programación avanzada','Seguridad y calidad','Operación y uso','Identidad y autorización','Integridad y rendimiento','Experiencia y marca'][i]}</li>`).join('');
const css=`[data-section="2"] th,[data-section="2"] td{padding:6px}[data-section="2"] h2{margin:10px 0 6px}[data-section="2"] p{margin-bottom:8px}[data-section="2"] table th:first-child{width:12%}[data-section="8"] pre{margin:8px 0;padding:10px;font-size:8.5pt;line-height:1.35}[data-section="8"] h2{margin-top:14px}@page{size:A4;margin:19mm 18mm 20mm}*{box-sizing:border-box}body{font:11pt/1.47 Arial,sans-serif;color:#171b19;margin:0}main{max-width:780px;margin:35px auto;padding:0 20px}h1,h2,h3{color:#000;page-break-after:avoid}h1{font-size:22pt;line-height:1.15;margin:0 0 18px}h2{font-size:13pt;margin:20px 0 8px}p{margin:0 0 11px;orphans:3;widows:3}section{page-break-before:always;padding-top:5px}table{width:100%;border-collapse:collapse;font-size:9pt;line-height:1.35;margin:13px 0 17px;table-layout:fixed}th,td{border:1px solid #d9d9d9;padding:8px;vertical-align:top;overflow-wrap:anywhere}th{background:#e4eee8;text-align:left;color:#000}tr{break-inside:avoid}tbody tr:nth-child(even){background:#f6f8f7}thead{display:table-header-group}pre{font:9pt/1.5 Consolas,monospace;background:#f1f4f2;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere}svg{max-width:100%;height:auto}.caption{font-size:9pt;color:#48544d;break-before:avoid}.cover{padding-top:60px;min-height:880px;page-break-before:auto}.cover h1{font-size:32pt}.subtitle{font-size:19pt;color:#344d40}.label{font-size:10pt;letter-spacing:.1em;color:#3f5a4a}.note{padding:14px;border-left:3px solid #597966;background:#f1f5f2}.reference{padding-left:25px;text-indent:-25px;overflow-wrap:anywhere}a{color:#224f3a}.edit{position:fixed;right:15px;bottom:15px;background:#e4eee8;padding:8px;border:1px solid #79998a;font-size:10pt}ol{padding-left:24px}li{margin:8px 0}@media print{main{margin:0;padding:0;max-width:none}.edit{display:none}.cover{min-height:240mm}section{padding-top:0}}`;
const html='<!doctype html><html lang="es"><meta charset="utf-8"><title>GreenAlert 3.0 Informe del proyecto final</title><style>'+css+'</style><body><main contenteditable="true"><section class="cover"><p class="label">PROYECTO FINAL DE PROGRAMACIÓN AVANZADA</p><h1>GreenAlert 3.0</h1><p class="subtitle">Informe del proyecto final</p>'+para('Facultad TICS · Ingeniería de Sistemas · Programación Avanzada – Bases de Datos No Relacionales · Semestre 7, jornada nocturna')+para('Docente: Fredy Jacanamijoy · Integrantes: [COMPLETAR NOMBRES Y CÓDIGOS]')+para('Mocoa, 25 de noviembre de 2026')+
  para('Repositorio: https://github.com/Akczul/Green-Alert-3.0 · Rama de entrega y SHA: ver VERSION.txt y MANIFIESTO.json del paquete.')+
  '<p class="note">'+esc(summary)+' '+esc(complianceText)+'. El informe distingue implementación, prueba real, evidencia heredada y requisitos pendientes.</p><h2>Contenido</h2><ol>'+index+'</ol></section>'+chapters.join('')+captures+references+'</main><aside class="edit">Editable en HTML · Guardar una copia tras modificar</aside></body></html>';
await fs.writeFile(path.join(output,'informe-greenalert.html'),html);
// Diccionario DDL sin semillas ni datos personales.
let dictionary='# Diccionario de los cinco motores\n\nDDL y modelos de la versión integrada. Los bloques SQL describen tablas, no instrucciones para ejecutar el bootstrap sobre una base existente.\n\n## MySQL\n\n';
for(const file of ['apps/backend/DATABASE_SCHEMA_COMPLETE.sql','apps/backend/migrations/021_integration_outbox_cache.sql','apps/backend/migrations/022_session_activity_audit.sql','apps/backend/migrations/023_admin_mfa.sql','apps/backend/migrations/024_admin_hierarchy.sql','apps/backend/migrations/025_federated_identities.sql']){
 const source=await read(file);
 for(const match of source.matchAll(/CREATE TABLE[\s\S]*?\)\s*ENGINE[^;]*;/gi)) dictionary+='Origen: '+file+'\n\n```sql\n'+match[0]+'\n```\n\n';
}
dictionary+='## MongoDB\n\nColección analytics_runs. Campos requeridos: run_id string UUID, schema_version entero, scope string, kind enum risk/training/forecast, algorithm_version string, period objeto, parameters objeto, results objeto, executed_at date e input_hash string. source_revision/source_kind relacionan el snapshot MySQL o sintético. run_id UNIQUE; índices scope/kind/executed_at/run_id y scope/source_revision. La validación efectiva está en repository.py y schemas.py. Ejemplo sintético: kind=risk, scope=user:7, source_kind=mysql; no se persiste el lote de información personal.\n\n## Cassandra\n\n'+
 '```cql\n'+await read('apps/events/infra/schema.cql')+'\n```\n\n'+
 'eventId UUID identifica un hecho; reportId UUID refiere a reportes.uuid. type enum validado en API, occurredAt timestamp UTC de milisegundos, sourceRevision long no negativo, category código ASCII, severity entero 0..5 y zone código opcional. La unicidad global se decide por LWT antes de las proyecciones logged batch.\n\n## Redis\n\nClave greenalert:zonas:public:v1:<revision>:<sha256>. Valor JSON de zonas o alertas agregadas; TTL obligatorio 300 segundos. revision BIGINT proviene de MySQL cache_generation. No hay claves con PII, tokens ni fuente de verdad exclusiva. Redis tiene AOF y volumen propio. Las claves antiguas expiran.\n\n## Apache Druid\n\nDatasource greenalert_events_v1. Origen: snapshot diario Cassandra enviado por Spring como JSON inline. Timestamp timestamp → __time ISO UTC. Dimensiones string: type, category, severity, zone. Medidas: events (count) y reportsCreated (longSum de created, 1 para REPORT_CREATED). QueryGranularity HOUR; segmentGranularity DAY; rollup true; reemplazo de intervalo diario, no append en replay. Índices/segmentos son administrados por Druid; el metastore MySQL auxiliar no sustituye la fuente Cassandra. Ejemplo: categoría agua, severidad 3, reportsCreated=1.\n';
await fs.writeFile(path.join(root,'docs/diccionario-cinco-motores.md'),dictionary.split('\n').map(line=>line.trimEnd()).join('\n'));
console.log('Informe editable y diccionario generados; falta renderizar y revisar PDF.');
