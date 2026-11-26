# Integración final de GreenAlert 3.0

Este documento describe la rama de integración local, sus operaciones reproducibles y sus límites. Las evidencias de las ramas originales permanecen en sus carpetas; no se reinterpretan como pruebas de la integración actual. El informe académico y el paquete se generan desde este contenido y los resultados actuales, sin secretos.

## Instalación desde cero

Requisitos: Git, Node 24 o compatible, Docker Engine con Compose y contenedores Linux. El stack completo necesita aproximadamente 8 GB disponibles para Docker, además de memoria para Windows; compilar Android al mismo tiempo aumenta sustancialmente el consumo. No es necesario instalar Python, Java ni las cinco bases en el host para ejecutar la web.

En PowerShell, desde la raíz del código:

```powershell
npm.cmd run install:apps
npm.cmd run setup:integracion
npm.cmd run infra:final:config
npm.cmd run infra:final:up
```

Abrir https://localhost:8443 (certificado autofirmado de laboratorio generado por setup:integracion en .local/tls; aceptar la advertencia del navegador). http://localhost:8080 redirige la web a HTTPS y solo conserva /api para la APK de laboratorio. Solo Nginx publica puertos, ligados a loopback por defecto. El inicio puede tardar varios minutos por Cassandra y Druid.

### Orden de inicio: dos proyectos Compose unidos por una red externa

| Paso | Proyecto | Archivo | Contenido | Espera |
|---|---|---|---|---|
| 0 | — | — | Red externa GREENALERT_NETWORK (la crea el script si falta) | — |
| 1 | greenalert-final | compose.datos.yml | MySQL, MongoDB, Redis, Cassandra (+schema), Druid (+ZooKeeper y metadatos) | healthchecks sanos (--wait) |
| 2 | greenalert-final-apps | compose.apps.yml | Express, FastAPI, Spring Boot y web Nginx | healthchecks sanos (--wait) |

compose.apps.yml no declara depends_on hacia servicios del otro proyecto: cada backend reinicia (restart: unless-stopped) hasta alcanzar sus motores por nombre de servicio en la red compartida. También pueden levantarse a mano, en el mismo orden:

```powershell
docker network create greenalert-final
docker compose -p greenalert-final --env-file .env.integracion -f compose.datos.yml up -d --wait
docker compose -p greenalert-final-apps --env-file .env.integracion -f compose.apps.yml up --build -d --wait
npm.cmd run infra:final:status
```

Para detener se invierte el orden (apps y luego datos); infra:final:down lo hace sin borrar volúmenes. Los volúmenes de datos pertenecen al proyecto greenalert-final, el mismo nombre que usaba la versión de un solo proyecto, y backend_uploads conserva su nombre explícito, por lo que una instalación previa recupera su estado.

```powershell
# Detener aplicaciones y motores conservando todos los volúmenes
npm.cmd run infra:final:down
# Recuperar el mismo estado persistido
npm.cmd run infra:final:up
```

No usar down --volumes sobre una instalación con información que se quiera conservar. Los Compose de cada servicio y los runners anteriores se mantienen independientes. Los scripts finales no utilizan la base del .env del usuario ni el servicio MySQL80.

El esquema completo solo inicializa un volumen MySQL nuevo. Las migraciones 021 a 025 se montan individualmente después del bootstrap, que ya contiene la 020. Para un volumen creado antes de la jerarquía administrativa: npm.cmd run infra:final:migrar-024 (comprueba antes de aplicar) y aplicar 025 de la misma forma controlada. En una base anterior: hacer respaldo, revisar su versión y aplicar únicamente las migraciones faltantes con una conexión al esquema correcto. Los triggers requieren privilegios de creación de triggers; con binary logging puede requerirse un operador con privilegios apropiados. No ejecutar toda la cadena histórica. Las migraciones no contienen USE de una base fija.

## Operaciones integradas

| Operación Express | Acceso en servidor | Flujo real |
| --- | --- | --- |
| POST /api/integracion/analisis/riesgo, body dias entre 1 y 180 | admin y moderador | MySQL selecciona reportes en_proceso/resuelto con coordenadas; Express minimiza DTO; FastAPI calcula y conserva ejecución en MongoDB |
| GET /api/integracion/reportes/:id/historial | Propietario; admin/moderador; entidad con asignación | ID numérico autorizado en MySQL se convierte a UUID; Spring consulta Cassandra |
| GET /api/integracion/indicadores?from=...&to=... | admin y moderador | Spring agrega el datasource Druid; límites UTC de horas completas, hasta 366 días |
| GET /api/integracion/cache/metricas | admin | Métricas locales del adaptador Redis |
| POST /api/integracion/eventos/reenviar | admin | Entrega un lote pendiente de la outbox; los errores conservan la fila |
| POST /api/integracion/eventos/reconciliar/AAAA-MM-DD | admin | Token de operador separado; snapshot diario Cassandra reemplaza el intervalo Druid |

Los contratos completos del principal están en apps/backend/docs/openapi.yaml y los contratos de los servicios en apps/analytics/evidence/openapi.json y apps/events/evidence/openapi.json. Los servicios también exponen su especificación en ejecución. Ninguna credencial interna se devuelve a React ni al móvil.

El dashboard web conserva sus componentes y añade un panel de análisis ambiental para administradores y moderadores. Sus botones consumen Express; no llaman directamente a FastAPI o Spring. El endpoint heredado /reportes/zonas-riesgo conserva sus filtros y forma JSON.

## Caché Redis

El composition root src/bootstrap/zonas-riesgo.js selecciona Redis cuando se configura REDIS_URL; sin esa variable conserva el adaptador Map para compatibilidad local y pruebas. El caso de uso espera el puerto asíncrono sin importar Redis ni MySQL.

Cache-aside: obtener generación MySQL, buscar el agregado en Redis, consultar/calcular desde MySQL si no existe y escribir con TTL de 300 segundos. Claves greenalert:zonas:public:v1:<revision>:<sha256-de-parametros>. La caché solo contiene agregados del conjunto validado de reportes, nunca sesiones ni información personal. Las alertas incluyen sus filtros geográficos en la clave; no son resultados personalizados por usuario.

Los triggers de reportes incrementan cache_generation.revision en la misma transacción de cada INSERT, UPDATE o DELETE. La generación durable evita servir una clave anterior incluso si Redis estaba apagado cuando cambió MySQL. Una lectura que empezó antes de una modificación puede devolver su snapshot anterior; la siguiente lectura usa la nueva generación. Las entradas anteriores expiran por TTL sin FLUSHDB, SCAN masivo ni borrados de claves ajenas.

Redis tiene AOF y volumen propio; su persistencia es prescindible para la corrección del negocio. Si Redis no está disponible, el puerto devuelve miss y se calcula desde MySQL. Las operaciones Redis tienen presupuesto de 600 ms, conexión de 500 ms y cola offline desactivada. Si MySQL falla no se utiliza Redis para presentar datos como actuales: MySQL sigue siendo la autoridad. Cada lookup agrega una consulta pequeña a MySQL, un coste deliberado para conservar invalidación entre procesos y durante fallos.

Métricas por proceso Express: hits, misses, errors, operations, latencyMs, averageLatencyMs, invalidations y ready. No son un sistema de métricas distribuido ni sobreviven al reinicio del proceso.

## Outbox e identificadores

La migración 021 crea integration_outbox y triggers de reportes. Un alta y su hecho REPORT_CREATED se confirman en la misma transacción MySQL. Cambiar estado o deleted_at crea REPORT_STATUS_CHANGED. El hecho de creación describe la inserción, aunque una compensación posterior borre lógicamente el reporte; ese cambio genera otro hecho. No se afirma que los uploads o efectos heredados sean atómicos.

Cada fila conserva event_id UUID, report_uuid, payload JSON inmutable, intentos, próximo intento, fecha de entrega y código de error saneado. sourceRevision es el ID creciente de outbox, no una revisión global entre los cinco motores. occurredAt se fija en el origen en UTC y no cambia al reintentar. severity conserva bajo=1, medio=2, alto=3, critico=4; zone es null mientras no exista una asociación de catálogo fiable. No se envían títulos, nombres, direcciones, evidencias ni coordenadas.

Un worker cada cinco segundos toma GET_LOCK por DATABASE(), procesa hasta 32 filas con cuatro publicaciones concurrentes y libera la conexión. El bloqueo limita la entrega a un worker por esquema. Los errores conservan las filas, incrementan intentos y aplazan el siguiente intento con backoff limitado; no hay descarte silencioso ni límite que borre entregas. Si Spring confirmó y se pierde la respuesta, el mismo event_id se repite: Cassandra impone idempotencia mediante LWT. No se promete exactamente una entrega de red ni atomicidad distribuida.

Spring conserva los hechos en Cassandra y reconstruye diariamente Druid por operación explícita de reconciliación. No existe propagación instantánea automática hacia Druid. Después de modificar reportes: entregar pendientes, reconciliar el día UTC correspondiente y consultar indicadores. Una tarea Druid terminada puede requerir esperar a la disponibilidad del segmento; consultar su estado antes de repetir una ingesta incierta. Una sola réplica de Events conserva el bloqueo local de reconciliación.

## Identidad y seguridad

Se conserva la migración 020, JWT con sid/ver, scrypt asíncrono con sal, lista de contraseñas comunes, rotación transaccional de refresh, revocación inmediata y revalidación de usuario/rol/entidad. Los JWT anteriores sin sid requieren nuevo login. Las sesiones rechazadas conservan el HTTP 403 del contrato de seguridad; el cliente móvil distingue este mensaje de un permiso de objeto denegado.

En el Compose final, session_activity conserva la familia entre renovaciones. Las peticiones autenticadas actualizan last_seen_at; un refresh automático por sí solo no extiende la actividad. Inactividad máxima: 1800 segundos. Duración absoluta: 604800 segundos. MySQL decide las fechas; ambas verificaciones también protegen la renovación.

La MFA TOTP es obligatoria para rol admin en el Compose final. Usa 6 dígitos, ventanas de 30 segundos, tolerancia de un paso, vectores RFC 6238 y rechazo transaccional del contador reutilizado. Cada factor se cifra con AES-256-GCM y MFA_ENCRYPTION_KEY, separada del JWT. Las contraseñas mantienen el mínimo de 15 caracteres. Web y móvil permiten introducir totp al iniciar sesión.

El enrolamiento lo realiza el operador local sobre un administrador activo:

```powershell
docker compose -p greenalert-final-apps --env-file .env.integracion -f compose.apps.yml exec backend-prod node scripts/provision-admin-mfa.mjs ID_NUMERICO
docker compose -p greenalert-final-apps --env-file .env.integracion -f compose.apps.yml cp backend-prod:/app/.local/mfa/ID_NUMERICO.json .local/
```

### Jerarquía administrativa (migración 024, módulo hexagonal administracion)

| Rol del instructivo | Representación | Panel | Puede | No puede |
|---|---|---|---|---|
| Superadministrador | rol admin, nivel_admin=global | Control global (/admin) + auditoría | Asignar administradores, niveles y ámbitos; parámetros (categorías); operaciones de eventos/caché; consultar auditoría | Borrar o modificar auditoría (triggers); cambiar su propio rol; dejar el sistema sin superadministrador |
| Administrador de segundo nivel | rol admin, nivel_admin=ambito; ambito_entidad NULL = comunidad, N = organización N | /admin filtrado por ámbito | Gestionar ciudadanos/moderadores (comunidad) o usuarios entidad de N (organización) | Elevarse o elevar a admin; ver o modificar otro ámbito (responde 403 o 404) |
| Usuario común | ciudadano, moderador, entidad | Cuenta personal y paneles operativos existentes | Recursos propios según permisos | /admin, auditoría y acciones ajenas (403 en API) |

El primer superadministrador se crea por inicialización controlada, nunca por registro: registrar la cuenta normalmente y ejecutar `npm.cmd run infra:final:superadmin -- correo@dominio`; luego enrolar su MFA. El script se niega si ya existe un superadministrador. Cada cambio de rol, nivel, ámbito, estado o eliminación incrementa auth_version (revoca sesiones del afectado) y se registra en admin_audit con autor, estado anterior y posterior en la misma transacción. La degradación del último superadministrador se bloquea con SELECT … FOR UPDATE, también ante solicitudes simultáneas.

El archivo privado contiene el secreto y la URI para el autenticador; no subirlo, adjuntarlo al informe ni conservarlo en el paquete. Importarlo por un canal local y custodiarlo con el administrador. No existe endpoint público para reemplazar factores. El script no sobrescribe un factor existente; recuperar un factor perdido requiere un procedimiento de operador y no está automatizado. Preservar MFA_ENCRYPTION_KEY fuera del repositorio junto al respaldo cifrado de la base.

El registro público siempre crea ciudadanos. Promover una cuenta a admin exige un superadministrador (o la inicialización controlada) y enrolamiento; no se proporciona una contraseña administrativa universal. Al habilitar MFA en una instalación anterior, revocar explícitamente las familias administrativas previas antes de abrirla a usuarios.

### Inicio federado OpenID Connect y MFA

Proveedores externos: Google (id_token verificado con google-auth-library) y Microsoft Entra ID (módulo hexagonal identidad-federada: cliente OIDC genérico con descubrimiento, Authorization Code + PKCE S256, state y nonce de un solo uso, verificación RS256 con JWKS, iss, aud, exp y nonce). El rol nunca proviene del proveedor: una cuenta nueva es ciudadano. Un correo ya registrado solo se vincula si el proveedor afirma email_verified; en otro caso responde 409. El vínculo (provider, subject) es UNIQUE en federated_identities (migración 025).

Si la cuenta federada es administradora y la MFA es obligatoria, el callback no emite sesión: entrega un código temporal pendiente y la web solicita el TOTP; POST /auth/oauth/exchange con code y totp emite la sesión (máximo 5 intentos por código). Configuración de Microsoft: registrar la aplicación en Entra ID con URI de redirección web MICROSOFT_REDIRECT_URI y definir MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET y MICROSOFT_TENANT en .env.integracion. Sin esas variables el botón responde 503 y el resto del sistema no cambia.

### Sesión web por cookies y CSRF

Con la cabecera X-GreenAlert-Client: web, el backend mueve los tokens del cuerpo a cookies __Host-ga_at (acceso) y __Host-ga_rt (refresh), ambas HttpOnly, Secure, SameSite=Strict y Path=/, y emite __Host-ga_csrf (legible) para el doble envío: toda escritura autenticada por cookie exige X-CSRF-Token igual a esa cookie o responde 403. JavaScript ya no lee ni guarda tokens; solo conserva el perfil y la expiración no secreta para la renovación proactiva. El cierre de sesión borra las cookies. La app móvil conserva el contrato de tokens en el cuerpo y SecureStore. La web se sirve por HTTPS (TLS 1.2+, HSTS) en Nginx.

security_audit conserva autor, método, ruta sin query, código y correlación para escrituras autenticadas y lecturas del panel admin. Una respuesta crítica se confirma después de escribir la auditoría; si la auditoría falla devuelve 503 y exige consultar el estado antes de reintentar. La mutación previa y su registro HTTP no comparten transacción: un crash entre ambos sigue siendo un límite. La outbox durable conserva adicionalmente los hechos de reportes. No se registran cuerpos ni credenciales.

Límites: Microsoft y Google reales requieren registrar las aplicaciones y aceptar el flujo con cuentas reales; las pruebas automatizadas usan un proveedor OIDC simulado con claves RSA reales. El certificado TLS incluido es autofirmado para laboratorio. Facebook Login es OAuth 2.0, no OIDC, y no se cuenta como proveedor OIDC. SMTP/Cloudinary/FCM reales requieren configuración y aceptación externas; la prueba usa correo JSON y no prueba esos proveedores. Los secretos internos nunca son variables VITE_ o EXPO_PUBLIC_.

## Android

El cliente sigue siendo React Native/Expo Router nativo. SecureStore conserva access/refresh; el refresh simultáneo se agrupa, no se repiten escrituras automáticamente y logout espera revocación remota. La URL se valida y debe ser accesible desde el dispositivo.

```powershell
cd apps/mobile
npm.cmd ci
$env:EXPO_PUBLIC_API_URL='https://SERVIDOR_ACCESIBLE/api'
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run check
npm.cmd run apk
```

SDK 58 utiliza la versión React Native fijada en su lockfile. build-android.ps1 comprueba Java, Android SDK y URL; genera Android por CNG y ejecuta assembleRelease con firma debug local para evaluación. Esa firma no sirve como identidad de una publicación productiva. No se publica en Expo ni Play Store.

La APK se compila en Linux dentro de Docker (npm.cmd run apk:docker; ver docs/compilacion-android-local.md), lo que evita el límite Win32 de rutas que bloqueó Ninja. La URL de compilación es solo el valor inicial: en la pantalla de acceso, «Cambiar servidor» permite fijar la URL de la API (validada, guardada en SecureStore y bloqueada con sesión abierta), de modo que la misma APK sirve en la red de la sustentación. Para un emulador del mismo host: http://10.0.2.2:8080/api. Para teléfono físico: http://IP_LAN_DEL_HOST:8080/api con WEB_BIND=0.0.0.0 en una red de laboratorio controlada. No usar localhost. La compilación no sustituye la instalación y las pruebas físicas de GPS, cámara y SecureStore.

## Verificación y entrega

Evidencia actual: docs/evidencias-integracion/. Los resultados originales de cada rama conservan fecha y origen. Ejecutar:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd run test:seguridad
npm.cmd run test:mysql:docker
npm.cmd run test:reportes:lectura
npm.cmd run test:reportes:creacion
npm.cmd run test:integracion
```

El runner final crea su propio proyecto, red y volúmenes sintéticos y los conserva para inspección; informa sus nombres. No apunta a una base arbitraria. La opción interna de reutilización exige un marcador de sandbox creado por esta sesión y no forma parte de la instalación ordinaria.

La aceptación verifica resultados de negocio además de health: snapshot analítico persistido, historial, indicadores, Redis hit/fallo/recuperación, outbox caída/reintento, persistencia al reiniciar, permisos, MFA, sesión y concurrencia. Las mediciones son muestras locales, sin promesa de aceleración general. No sumar tests unitarios a requisitos oficiales cubiertos.

Las cuatro ramas originales son ancestros de feat/integracion-final; main y los worktrees de los agentes permanecen intactos. Los commits son locales. El ZIP se obtiene del árbol Git del SHA publicado en el archivo de entrega: excluye .env, dependencias, uploads, cachés, SDK, credenciales MFA y artefactos de compilación. APK e informe se entregan como artefactos separados. Moodle y GitHub requieren entrega del titular; no se hizo push.
