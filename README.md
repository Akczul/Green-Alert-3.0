# GreenAlert

GreenAlert integra la web **React**, la API principal **Express/MySQL**, cálculo ambiental **FastAPI/MongoDB**, eventos **Spring/Cassandra/Druid**, caché **Redis** y un cliente **React Native Android**. Se preservan las pantallas y contratos existentes. Los módulos hexagonales cubren zonas, lectura y creación de reportes, identidad e integración; otros flujos permanecen por capas.

## Ejecutar la integración final

```powershell
npm.cmd run install:apps
npm.cmd run setup:integracion
npm.cmd run infra:final:config
npm.cmd run infra:final:up
# Abrir http://localhost:8080
```

Requiere Docker/Compose con contenedores Linux. El script crea la red externa; cada proyecto tiene sus volúmenes. Para detener conservando datos: `npm.cmd run infra:final:down`. No ejecutar el esquema completo sobre una base existente.

Manual, migraciones, MFA administrativa y límites: [integración final](docs/integracion-final.md). Resultados y pendientes: [verificación final](docs/verificacion-final.md), [trazabilidad](docs/trazabilidad-integracion.md). Informe: [editable HTML](docs/entrega/informe-greenalert.html) y [PDF](docs/entrega/informe-greenalert.pdf).

El stack final exige TOTP al rol admin; su enrolamiento es local por operador. Druid se actualiza mediante reconciliación diaria explícita. Jerarquía administrativa completa, segundo OIDC, HTTPS/cookies y aceptación física móvil conservan su estado pendiente en la documentación. El ML experimental heredado es opcional.

```text
GreenAlert/                 # carpeta de trabajo actual: GreenAlert3.0
├── apps/
│   ├── backend/            # API, modelos SQL, servicios, migraciones y pruebas originales
│   ├── frontend/           # SPA conservada y panel de análisis integrado
│   ├── analytics/          # FastAPI y ejecuciones MongoDB
│   ├── events/             # Spring, Cassandra y proyección Druid
│   └── mobile/             # React Native y compilación Android local
├── docs/                   # auditoría, contratos, decisiones y migración
├── infra/                  # guía de infraestructura
├── scripts/                # ejecución, configuración e inventarios compartidos
├── .github/workflows/ci.yml # validación; no publica ni despliega
├── compose.datos.yml        # cinco motores y auxiliares Druid
├── compose.apps.yml         # tres APIs y SPA/Nginx
└── docker-compose.yml       # stack anterior MySQL/API/SPA, conservado
```

No se creó `packages/` porque todavía no existe código compartido estable que justifique un paquete. Los lockfiles e instalaciones siguen separados para conservar las resoluciones del frontend y evitar cambios de hoisting.

## Requisitos

- Node.js 24 como versión de referencia (`.nvmrc`); los comandos locales se verificaron con Node 26.13.0 y npm 11.20.0.
- MySQL compatible con el esquema existente; el Compose utiliza MySQL **8.4.11** para una base **nueva y aislada**. También se verificó MySQL nativo **8.0.46**.
- Docker Engine y Compose, si se usa la infraestructura local. Tener la CLI instalada no significa que el motor esté disponible.

## Preparar y ejecutar en desarrollo

Desde la raíz:

```sh
npm run install:apps
npm run setup
npm run infra:db
npm run dev
```

`setup` genera `.env`, `apps/backend/.env` y `apps/frontend/.env` con secretos locales aleatorios y **no sobrescribe archivos existentes**. No imprime sus valores. La base local se publica en `127.0.0.1:3307`; la API usa 3000 y Vite 5173. El primer inicio de MySQL puede tardar; comprobar `docker compose ps` antes de abrir la aplicación.

Abrir [GreenAlert local](http://localhost:5173) y comprobar [salud de la API](http://localhost:3000/api/health). Un 200 acredita conexión con MySQL; 503 indica base no disponible. El servidor puede arrancar aunque falle la conexión: no confundir el mensaje de escucha con disponibilidad de datos.

El cliente conserva `baseURL: '/api'`. Vite conserva ese prefijo al reenviar a `localhost:3000`; por eso el ejemplo usa **`API_PREFIX=/api`**. Sin esa variable el backend conserva su comportamiento original de montar rutas sin prefijo. No introducir un segundo `/api` ni eliminarlo únicamente en uno de los extremos.

También pueden ejecutarse en terminales separadas:

```sh
npm run dev:backend
npm run dev:frontend
```

En PowerShell, usar `npm.cmd` en lugar de `npm` si la política de ejecución bloquea `npm.ps1`. Ctrl+C detiene los procesos iniciados por el comando compartido.

### Con una base existente

No ejecutar `infra:db` si se va a usar un MySQL propio. Configurar `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y SSL en `apps/backend/.env`, después ejecutar `npm run dev`. No se importaron ni modificaron datos existentes durante esta consolidación.

El esquema completo es para inicializar un volumen vacío. No es un migrador idempotente: contiene semillas, actualizaciones y procedimientos. Se conservan las 18 migraciones históricas y se añade `019`, que incorpora los códigos actuales del catálogo sin renombrar ni eliminar los anteriores. Se añade además `020` para sesiones revocables (sid/auth_version), sin borrar hashes ni usuarios. Se ejecutaron las 20 sobre una base sintética; revisar qué versiones ya están aplicadas antes de usar una base existente. No ejecutar la cadena histórica sobre el esquema completo. [Validación real de MySQL](docs/validacion-mysql.md).

### Servicios opcionales

El transporte local `EMAIL_TRANSPORT=json` evita envíos reales, aunque el validador exige los cinco campos `EMAIL_*` preparados por `setup`. Para correo real configurar SMTP propio. Cloudinary requiere credenciales al subir o eliminar evidencias/avatar; Google/Facebook requieren aplicaciones y callbacks propios; HF, Groq y Gemini requieren tokens para inferencia remota. Sin ellos se conservan los fallbacks existentes, donde los hay.

Push está parcialmente implementado: el backend intenta cargar `firebase-admin` pero no lo declara como dependencia. La lectura EXIF también intenta cargar `exifr`, ausente; el sistema usa sus fallbacks. No se añadieron estas bibliotecas en esta fase. La configuración pública Firebase del service worker original se conserva; configurar un proyecto propio antes de habilitar push. [Inventario de variables](docs/variables-entorno.md).

## Compilar y verificar

```sh
npm run build
npm run lint
npm test
npm run test:smoke
npm run test:seguridad
npm run infra:config
```

El backend no necesita compilación: `build:backend` comprueba la sintaxis de sus archivos JS. El frontend genera `apps/frontend/dist`. `npm start` inicia la API desde su directorio, conservando la resolución de `.env` y `uploads`. La prueba smoke utiliza HTTP real con puertos efímeros, comprueba SPA/proxy/validación/autenticación y espera 503 al usar una base deliberadamente inaccesible; **no es una prueba de persistencia**.

Las suites legacy, SMTP e integración remota se conservan y no se ejecutan automáticamente: pueden requerir credenciales, modificar datos o enviar correos. Las nuevas comprobaciones aisladas se ejecutan con `npm run test:mysql` (binarios nativos), `npm run test:mysql:docker` y `npm run test:stack` (stack Docker completo). [Resultados y límites](docs/validacion-mysql.md).

## Ejecutar todo con Docker

Con el motor disponible:

```sh
npm run setup
npm run infra:config
npm run infra:up
docker compose ps
npm run infra:down
```

Abrir [GreenAlert en Docker](http://localhost:8080). Nginx sirve la SPA y reenvía `/api/`, `/uploads/` y `/socket.io/` al servicio `backend-prod`. El healthcheck de API comprueba el estado HTTP y MySQL. `infra:down` conserva los volúmenes; no se incluye ningún comando de borrado de datos.

Las variables Vite se incorporan al construir la imagen. Para Google/Firebase en Docker, completar los campos públicos `VITE_*` de `.env` en la raíz; Compose los pasa como argumentos de construcción. Para desarrollo con Vite, completar `apps/frontend/.env`. Esos archivos están excluidos de las imágenes. Nunca enviar secretos del backend como `VITE_*`. El entorno local predeterminado permite usar la plataforma sin configurar push.

**Verificado con datos sintéticos:** 51 comprobaciones en MySQL 8.0.46, 51 en MySQL 8.4.11, 7 del stack Docker MySQL/Express/React-Nginx y 259 pruebas unitarias/frontend. Se comprobaron persistencia, autenticación, reportes, usuarios, evidencia local, instituciones y zonas. Cloudinary, SMTP, OAuth, push e inferencia remotos permanecen sin verificar. [Informe completo](docs/validacion-mysql.md).

## Auditoría y siguiente fase

- [Estado actual y hallazgos](docs/estado-actual.md).
- [Funcionalidades y pantallas preservadas](docs/funcionalidades.md).
- [78 endpoints y acceso declarado](docs/endpoints.md).
- [Dependencias y versiones resueltas](docs/dependencias.md).
- [Arquitectura objetivo y puertos](docs/arquitectura-objetivo.md).
- [Decisiones técnicas y persistencia políglota](docs/decisiones.md).
- [Plan incremental de migración](docs/plan-migracion.md).
- [Procedencia e historial Git](docs/procedencia.md).
- [Informe de comandos y verificación](docs/verificacion.md).
- [Validación posterior de MySQL y stack completo](docs/validacion-mysql.md).
- [Piloto hexagonal de zonas: estructura, puertos, archivos y pruebas](docs/piloto-hexagonal-zonas-riesgo.md).

Zonas, lecturas y [creación hexagonal de reportes](docs/hexagonal-reportes-creacion.md) están verificadas: **347 pruebas**, **33 contratos de lectura**, **38 contratos de creación HTTP/MySQL equivalentes al código anterior**, **57 comprobaciones MySQL Docker** y **8 del stack completo**. Con Docker iniciado, ejecutar `npm run test:reportes:lectura` y `npm run test:reportes:creacion` para comparar con las capturas previas. Se conservan contratos, geografía, caché y compensaciones best effort; no hay atomicidad global con Cloudinary. La entrega se detiene en creación; las otras escrituras y módulos requieren revisar resultados y una nueva tarea.

## Seguridad crítica en feat/security

[Contrato para integrar clientes](docs/contrato-autenticacion-seguridad.md) e [informe de cambios y worktrees](docs/seguridad-critica.md). Nueva contraseña: 15 caracteres y lista local; hashes históricos compatibles. JWT con sid/ver, revocación por sesión y consulta del estado actual de usuario. Requiere migración aditiva 020 antes de desplegar sobre un clon de una base anterior y reautenticación de sesiones legacy. No se aplicó a datos existentes.

Verificado en esta rama: **367 pruebas**, **22 comprobaciones SQL de seguridad**, **58 de regresión MySQL**, **33 equivalencias de lectura**, **37 equivalencias de creación y un rechazo anticipado de seguridad**, **8 del stack**, build/lint/smoke. No se implementan MFA, otro OIDC, nuevos servicios/motores o móvil. Sin merge ni push.
