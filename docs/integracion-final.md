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

Abrir http://localhost:8080. Solo Nginx publica un puerto, ligado a loopback por defecto. Los servicios internos y las bases se comunican por la red externa indicada en GREENALERT_NETWORK. El script crea esa red si falta. El inicio puede tardar varios minutos por Cassandra y Druid.

```powershell
# Detener aplicaciones y motores conservando todos los volúmenes
npm.cmd run infra:final:down
# Recuperar el mismo estado persistido
npm.cmd run infra:final:up
```

No usar down --volumes sobre una instalación con información que se quiera conservar. Los Compose de cada servicio y los runners anteriores se mantienen independientes. Los scripts finales no utilizan la base del .env del usuario ni el servicio MySQL80.

El esquema completo solo inicializa un volumen MySQL nuevo. Las migraciones 021, 022 y 023 se montan individualmente después del bootstrap, que ya contiene la 020. En una base anterior: hacer respaldo, revisar su versión y aplicar únicamente las migraciones faltantes con una conexión al esquema correcto. Los triggers requieren privilegios de creación de triggers; con binary logging puede requerirse un operador con privilegios apropiados. No ejecutar toda la cadena histórica. Las migraciones no contienen USE de una base fija.

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
docker compose --env-file .env.integracion -f compose.datos.yml -f compose.apps.yml exec backend-prod node scripts/provision-admin-mfa.mjs ID_NUMERICO
docker compose --env-file .env.integracion -f compose.datos.yml -f compose.apps.yml cp backend-prod:/app/.local/mfa/ID_NUMERICO.json .local/
```

El archivo privado contiene el secreto y la URI para el autenticador; no subirlo, adjuntarlo al informe ni conservarlo en el paquete. Importarlo por un canal local y custodiarlo con el administrador. No existe endpoint público para reemplazar factores. El script no sobrescribe un factor existente; recuperar un factor perdido requiere un procedimiento de operador y no está automatizado. Preservar MFA_ENCRYPTION_KEY fuera del repositorio junto al respaldo cifrado de la base.

El registro público siempre crea ciudadanos. Promover una cuenta a admin exige intervención controlada del operador y enrolamiento; no se proporciona una contraseña administrativa universal. Al habilitar MFA en una instalación anterior, revocar explícitamente las familias administrativas previas antes de abrirla a usuarios. En esta versión la MFA administrativa exige acceso local con contraseña; el callback OAuth de un administrador se rechaza si no incorpora el segundo factor. El flujo de challenge federado con segundo factor queda pendiente.

security_audit conserva autor, método, ruta sin query, código y correlación para escrituras autenticadas y lecturas del panel admin. Una respuesta crítica se confirma después de escribir la auditoría; si la auditoría falla devuelve 503 y exige consultar el estado antes de reintentar. La mutación previa y su registro HTTP no comparten transacción: un crash entre ambos sigue siendo un límite. La outbox durable conserva adicionalmente los hechos de reportes. No se registran cuerpos ni credenciales.

Pendientes obligatorios: jerarquía superadministrador/administrador de ámbito general, segundo proveedor OIDC real, HTTPS/cookies Secure HttpOnly SameSite y evaluación CSRF asociada. Se mantiene el almacenamiento web heredado en localStorage: no se declara resuelto el requisito de cookies. Google/Facebook/SMTP/Cloudinary/FCM reales requieren configuración y aceptación externas; la prueba usa correo JSON y no prueba esos proveedores. Los secretos internos nunca son variables VITE_ o EXPO_PUBLIC_.

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

Para un emulador Android del mismo host puede usarse http://10.0.2.2:8080/api y EXPO_PUBLIC_ALLOW_HTTP=true. Para teléfono físico usar una IP LAN alcanzable, publicar Nginx con WEB_BIND=0.0.0.0 en una red de laboratorio controlada y recompilar con esa URL. No usar localhost. La compilación no sustituye la instalación y las pruebas físicas de GPS, cámara y SecureStore.

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
