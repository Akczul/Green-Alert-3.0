# Validación real de MySQL y del sistema completo

Fase de validación posterior a la auditoría, **18 de noviembre de 2026**, America/Bogota. No se implementó arquitectura hexagonal, otra base de datos o ML. No hubo push.

## Resultado

La integración SQL y el stack local funcionan en los escenarios probados. Se ejecutaron **51 comprobaciones con MySQL 8.0.46 nativo**, **51 con MySQL 8.4.11 en Docker**, **7 comprobaciones del stack Docker completo** y la suite de **259 pruebas unitarias/frontend**. Las pruebas usaron exclusivamente datos sintéticos y servidores/proyectos propios.

Esto acredita persistencia SQL real, HTTP Express y proxy Vite/Nginx. No acredita subida/entrega a proveedores externos ni una revisión manual de cada pantalla en un navegador.

También terminaron correctamente `npm run build`, `npm run lint`, `npm run infra:config`, `npm run infra:validation:config`, `npm run docs:inventory` y `git diff --check`. El inventario conserva **78 endpoints**. El único cambio de implementación en `src` es la construcción correcta de geometría del modelo de reportes; la interfaz y las rutas permanecen intactas.

## Entorno y aislamiento

Se encontró `MySQL80` en ejecución, con binarios en `C:\Program Files\MySQL\MySQL Server 8.0\bin`. No se usaron las credenciales, bases ni el directorio de datos de ese servicio. Su proceso servidor en el puerto 3306 siguió siendo **6916** antes y después de las pruebas.

El runner nativo inicializa otro `mysqld --no-defaults` en un directorio único bajo `%TEMP%\greenalert-mysql-*`, usa un puerto libre de loopback, genera credenciales efímeras y crea bases `greenalert_validation_<aleatorio>`. El backend usa un usuario con privilegios limitados a su base de prueba, sin acceso al servidor original. Al terminar se detiene esa instancia. Los archivos sintéticos se conservan fuera de Git para diagnóstico.

Docker Desktop estaba instalado por usuario y su motor inicialmente no respondía. Se inició desde `C:\Users\Akczul\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`. Motor verificado: **29.8.2**, Compose **5.5.1**, Linux/amd64.

La imagen local `mysql:8.4` tenía `/usr/local/bin/docker-entrypoint.sh` de **0 bytes** y fallaba con `exec format error`. La etiqueta concreta `mysql:8.4.11` ejecutó el servidor correctamente. Se fijó esta versión en ambos Compose sin alterar ni reemplazar la imagen local defectuosa.

Las pruebas Docker usan nombres únicos `ga-validation-*` y `ga-stack-*`. La primera usa almacenamiento efímero; la segunda reutiliza el Compose real con un override de puertos y secretos y volúmenes de su proyecto único. Al finalizar se eliminaron únicamente los contenedores, redes y volúmenes creados por esos runners. No se ejecutó `down` sobre otro proyecto ni se tocaron volúmenes existentes.

## Conexión y variables necesarias

`apps/backend/src/config/database.js` carga dotenv y crea un pool `mysql2/promise`: límite de diez conexiones, cola y espera habilitadas, consultas parametrizadas. No hay ORM. Los scripts compartidos inician el backend desde `apps/backend`, donde resuelve `.env` y rutas de archivos.

| Variable | Uso |
| --- | --- |
| `DB_HOST`, `DB_PORT` | Dirección/puerto de MySQL. Desarrollo Compose: localhost/3307; dentro de la red Docker: mysql/3306 |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales y base seleccionada; los tests generan otras, sin leer datos originales |
| `DB_SSL` | Activa SSL únicamente cuando vale `true`; desactivado en la prueba local aislada |
| `DB_SSL_CA`, `DB_SSL_CA_PATH` | CA en texto o archivo para un servidor que requiera TLS |
| `DB_SSL_REJECT_UNAUTHORIZED` | Debe ser `true` para exigir validación de certificado cuando corresponda |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_DAYS` | Firma y duración de sesiones |
| `API_PREFIX` | En esta configuración `/api`, consistente con Axios, Vite y Nginx |
| `PORT`, `UPLOAD_DIR` | Puerto HTTP y directorio de archivos del backend |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | El validador de arranque exige estos campos incluso con transporte JSON |
| `EMAIL_TRANSPORT=json` | Correo sintético sin entrega SMTP externa |
| `CORS_ORIGIN`, `FRONTEND_URL`, `API_PUBLIC_URL` | Orígenes y enlaces públicos/callbacks |

No se imprimen ni versionan valores privados. El arranque actual registra el fallo de conexión pero sigue escuchando: para acreditar MySQL se debe comprobar `/api/health` **200** con `database=conectada`, no solo el mensaje de servidor iniciado.

## Tablas, relaciones y esquema

El esquema completo ejecutó **21 sentencias**, incluidas vistas, semillas y procedimientos. En ambos motores se crearon estas doce tablas:

| Grupo | Tablas |
| --- | --- |
| Identidad | usuarios, refresh_tokens |
| Catálogo y reportes | categorias_riesgo, reportes, evidencias |
| Instituciones | entidades, reporte_entidades, alertas_entidad |
| Interacciones | reporte_likes, reporte_vistas |
| Notificaciones | notificaciones, fcm_tokens |

Se comprobaron **17 claves foráneas** instaladas. Usuarios se relacionan opcionalmente con entidades; reportes con autores; asignaciones con reportes/entidades; alertas con asignación/reporte/entidad/lector; evidencias con reporte/autor; sesiones, likes, vistas, notificaciones y dispositivos con sus usuarios. Se probó el rechazo SQL de una evidencia huérfana. Las relaciones de categoría se validan por código en el backend; `reportes.tipo_contaminacion` no tiene FK al catálogo, manteniendo compatibilidad con códigos históricos.

Se conservaron ubicación opcional, estados separados de reporte y atención institucional, UUID, índices y borrado lógico. La columna POINT permanece nullable, sin el índice espacial inválido que ya se retiró en la fase anterior. El índice latitud/longitud sigue presente.

`apps/backend/scripts/sql/verify_schema.sql` ahora incluye las doce tablas, las relaciones y una consulta **solo de lectura** para detectar geometrías que no coincidan con las columnas latitud/longitud. No repara registros automáticamente.

## Pruebas realizadas

| Área | Comprobación real |
| --- | --- |
| Inicialización | Esquema completo, doce tablas, diecisiete FKs, vistas y procedimientos |
| Registro | Usuario guardado, contraseña scrypt, rechazo de duplicado sin segunda fila |
| Login/perfil | Contraseña correcta/incorrecta, perfil privado y edición persistida |
| Sesiones | Rotación de refresh, rechazo de reutilización y revocación por logout |
| Usuarios | Lista/paginación admin, rechazo de ciudadano, cambio a rol entidad, desactivar y borrar lógicamente; login rechazado tras ello |
| Catálogo | Todos los códigos ofrecidos por React existen y están activos en una instalación nueva |
| Reportes | Alta con/sin coordenadas, consulta/detalle/paginación, edición de propietario, rechazo de otro usuario y soft delete |
| Geografía | ST_Latitude/ST_Longitude coinciden con el payload; longitud -120 aceptada; procedimiento de radio encuentra el reporte |
| Instituciones | Asignación automática y alertas persistidas, bandeja de entidad y actualización de atención |
| Moderación | Cambio a en_proceso y notificación persistida/lectura |
| Analítica | Stats generales, categorías, severidad, timeline, heatmap, IA heurística, trending, zonas y alertas cercanas; permisos |
| Interacciones | Like persistido y una sola vista del mismo usuario tras dos lecturas |
| Evidencia local | Fila sintética creada por SQL, lectura vía API, archivo PNG real por proxy y borrado lógico por API |
| Cloudinary sin configurar | Upload HTTP devuelve error explícito y no agrega una fila de evidencia; no se utilizó el stub de NODE_ENV=test |
| Exportación | JSON y XLSX generado con datos reales; firma ZIP del archivo comprobada |
| Comunicación Vite | Peticiones del runner atravesaron `/api` y `/uploads` del servidor Vite real |
| Stack Docker | MySQL + Express Node 24 + SPA compilada/Nginx; health, registro/login/perfil, reportes, fallback React Router, PNG por uploads y 404 JSON |

Los runners de integración arrancan Express con **NODE_ENV=production**, sin sustituir el pool ni los modelos. Deshabilitan explícitamente credenciales de proveedores y usan correo JSON. Los privilegios admin/institucionales iniciales se preparan únicamente como fixtures en la base sintética. La evidencia local se inserta como fixture: esa prueba no se presenta como una subida remota exitosa.

## Errores encontrados y correcciones

| Error observado | Corrección | Resultado |
| --- | --- | --- |
| React ofrecía agua/aire/suelo/residuos/incendios_forestales/avalanchas_fluviotorrenciales/otro, ausentes del seed original | Catálogo canónico añadido al esquema y migración **019** aditiva, sin IDs fijos ni renombrar/eliminar códigos anteriores | Catálogo y alta con `agua` pasan |
| MySQL interpretaba `POINT(longitud latitud)` según ejes de SRID 4326, intercambiando coordenadas | `axis-order=long-lat` explícito en escritura del modelo y procedimiento del esquema | Roundtrip geográfico y longitud -120 pasan |
| Migraciones **003/004** daban `ER_PARSE_ERROR` por ADD COLUMN/CREATE INDEX IF NOT EXISTS | Guardias de information_schema y SQL preparado compatibles con MySQL 8 | Aplicación y repetición pasan |
| Migraciones **014/018** daban `ER_BAD_DB_ERROR` por USE green-alert | Se conserva la base seleccionada por la conexión | Migran la base aislada correcta |
| Imagen local flotante mysql:8.4 con entrypoint vacío | Imagen fijada a **mysql:8.4.11**, ejecutada y comprobada | Integración y stack completos pasan |
| Verificador SQL omitía instituciones y FCM | Se amplió inventario y diagnóstico de FK/geometría | Verificación disponible para revisión manual |

Las **19 migraciones** se ejecutaron en orden sobre una **base sintética reconstruida a partir de sus precondiciones**, no sobre un dump histórico. Se verificaron las columnas que necesita el backend, las diecisiete FKs, conservación de una fila de usuario y una categoría personalizada/inactiva, normalización de un reporte anterior de en_revision a en_proceso y repetición segura de 003/004/019. No todas las migraciones históricas son idempotentes: **no ejecutar la cadena completa sobre el esquema completo ni sobre una base existente sin revisar su versión**. Persiste una diferencia de capacidad del ID de refresh_tokens: INT en 006 frente a BIGINT UNSIGNED en bootstrap; no afectó los escenarios probados.

La corrección geográfica afecta a **nuevas escrituras**. No transforma geometría antigua ni reemplaza procedimientos de una base ya instalada. Para datos anteriores, ejecutar primero el diagnóstico de solo lectura, revisar resultados y planificar una migración específica con respaldo. La migración 019 tampoco activa ni renombra categorías que ya existan: respeta sus IDs, nombres y estado.

## Cómo repetir las pruebas

Desde la raíz, después de `npm run install:apps`:

```powershell
# MySQL instalado en la ruta detectada, sin contraseña del servicio existente.
npm.cmd run test:mysql

# Si mysqld está en otra ubicación:
$env:MYSQLD_PATH = 'C:\ruta\MySQL\bin\mysqld.exe'
npm.cmd run test:mysql

# Motor Docker disponible: SQL 8.4.11 y pruebas del proxy Vite.
npm.cmd run test:mysql:docker

# Imágenes y stack completo aislado, incluyendo Nginx.
npm.cmd run setup
npm.cmd run test:stack
```

`infra/compose.validation.yml` ejecuta solamente el MySQL de prueba; `infra/compose.stack-validation.yml` adapta el Compose real sin cambiar los puertos ni datos de instalaciones existentes. Los runners asignan secretos, puertos y nombres de proyecto, inicializan sus bases y retiran sus recursos. No requieren credenciales productivas ni nuevas dependencias npm.

Resultados reproducibles en `.local/mysql-validation/`: `latest.json` (nativo), `latest-docker.json`, `stack.json` y logs de esta ejecución. Están ignorados por Git y contienen únicamente resultados/fixtures de prueba. El archivo `baseline.json` registra los errores de migraciones/catálogo observados antes de las correcciones finales.

## Inicio manual en Windows

En este equipo **ya fue posible iniciar Docker**, por lo que no quedó un bloqueo que requiera intervención. Si en otra sesión está detenido:

```powershell
Start-Process -FilePath "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe" -WindowStyle Hidden
docker info --format '{{.ServerVersion}}'
```

Esperar a que Docker Desktop indique que el motor Linux está listo y repetir `docker info` hasta obtener la versión sin error del pipe. Si Docker solicita completar su configuración/WSL o reiniciar Windows, completar ese paso antes de continuar. No reinstalar ni resetear datos Docker como primer intento.

Para mantener una instancia de desarrollo del proyecto:

```powershell
npm.cmd run setup
npm.cmd run infra:config
npm.cmd run infra:up
docker compose ps
```

Abrir [GreenAlert](http://localhost:8080) y [salud por Nginx](http://localhost:8080/api/health). `npm run infra:down` detiene el proyecto y conserva sus volúmenes. La prueba `test:stack` se detiene automáticamente; no deja el sitio de prueba escuchando al terminar.

## Límites y estado final

**Verificado:** integración Express/MySQL, contratos HTTP principales, persistencia y permisos enumerados, migraciones sintéticas, build de imágenes y comunicación por Vite/Nginx. Se preservan las 78 rutas registradas y las funcionalidades existentes.

**Pendiente externo:** upload/delete reales de Cloudinary, entrega SMTP, OAuth Google/Facebook, push Firebase y proveedores de inferencia. `firebase-admin` y `exifr` siguen sin declararse como dependencias; no se instalaron silenciosamente. La lectura de archivos locales sí se probó. No se inspeccionó ni alteró la base de datos preexistente. No se hizo pentest ni navegación manual exhaustiva de la UI. El workflow CI queda preparado, sin ejecución remota ni push.

Referencias de las correcciones: [orden de ejes WKT en MySQL](https://dev.mysql.com/doc/refman/8.0/en/gis-wkt-functions.html) y [sintaxis de ALTER TABLE](https://dev.mysql.com/doc/refman/8.0/en/alter-table.html). La evidencia principal de esta fase es la ejecución sobre los dos motores, no solo estas referencias.
