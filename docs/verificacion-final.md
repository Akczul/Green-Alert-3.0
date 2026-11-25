# Verificación de la integración final

Entrega preparada el 25 de noviembre de 2026, America/Bogota, con comprobaciones iniciadas el 24 y sus timestamps originales conservados. Rama local feat/integracion-final; el SHA definitivo se obtiene del VERSION.txt y MANIFIESTO.json del paquete. No se hizo push, force push ni merge sobre main. Se usó un worktree independiente y no se modificaron los cuatro worktrees de origen.

## Resultado funcional

Los tres backends y los cinco motores se ejecutaron mediante los dos Compose globales. La aceptación terminó con **16 comprobaciones correctas y cero fallidas**, seguida por **tres recorridos reales de React en Edge headless**. Los JSON saneados y las capturas se incluyen en evidencias-integracion.

| Componente | Operación real comprobada |
| --- | --- |
| Express / MySQL | Registro, unicidad concurrente, login, alta/lectura/cambios, propiedad, sesión y auditoría |
| FastAPI / MongoDB | Snapshot mínimo de reportes MySQL validados, cálculo de riesgo y documento de ejecución conservado |
| Spring / Cassandra | Entrega de hechos de reportes, historial por UUID, replay simultáneo idempotente, caída y recuperación |
| Spring / Druid | Snapshot Cassandra, tarea de ingesta completada e indicadores agregados consultados |
| Express / Redis | Escritura/lectura de caché, hit, métricas, caída, modificación MySQL, invalidación y recuperación |
| React / Nginx | Login mediante formulario, botones de riesgo/indicadores e historial desde detalle contra APIs reales |
| React Native | Lint, validación de configuración JS, 57 tests, dependencias SDK alineadas y bundle Android; APK según desenlace documentado abajo |

El reinicio de MySQL, MongoDB, Cassandra y Redis conservó reportes, ejecución analítica e historial. La outbox mantuvo una entrega durante la caída de Spring y la confirmó después de recuperar el servicio. Druid se actualiza por reconciliación explícita; no se promete actualización instantánea ni atomicidad distribuida.

## Comandos ejecutados

| Comando | Resultado observado |
| --- | --- |
| npm.cmd run install:apps | Instalaciones independientes desde lockfiles |
| npm.cmd run build | Sintaxis backend y bundle web correctos |
| npm.cmd run lint | Cero errores/warnings ESLint |
| npm.cmd test | 345 backend + 28 frontend correctas; pruebas con dobles y contratos unitarios, no 373 E2E |
| node --test ...frontend-api-contract ...integracion ...admin-mfa | 10 correctas tras añadir el acceso de historial web |
| npm.cmd run test:seguridad | 22 comprobaciones con MySQL real, cero fallos |
| npm.cmd run test:reportes:lectura | 33/33 contratos HTTP/MySQL equivalentes al fixture original |
| npm.cmd run test:reportes:creacion | 38 escenarios: 37 equivalencias y un rechazo anticipado por seguridad ya documentado en la rama original; no se regeneraron fixtures |
| npm.cmd run test:mysql:docker | 61 correctas, cero fallidas, incluidas migraciones 020/021/022/023 en sandbox |
| node scripts/validate-integration.mjs --reuse-session-sandbox | 16/16 en el proyecto sintético creado por esta sesión; uso ordinario npm run test:integracion crea otro proyecto propio |
| scripts/verify-browser.cjs con runtime de artefactos | 3/3 recorridos reales, sin perfiles personales ni datos de usuario |
| apps/mobile: lint, typecheck, test -- --testTimeout=30000, check | Lint/configuración correctos, 57/57 tests y dependencias alineadas |
| apps/mobile: bundle:android y prebuild:android | Bundle y generación nativa correctos; no sustituyen APK ni instalación |
| adb devices -l | Ningún dispositivo conectado observado |
| git diff --check | Comprobado antes de los commits |
| Parseo YAML de OpenAPI y conteo de operaciones | 84 operaciones; se entrecomilló un mensaje heredado con dos puntos sin cambiar su valor |

El timeout de 30 segundos de Jest se usó ante la carga concurrente del stack y Gradle; no se cambió ninguna aserción. El primer intento de móvil con timeout por defecto terminó en 54 correctas/1 timeout de pantalla; la repetición con margen temporal terminó en 57/57, incluidas las dos pruebas nuevas de rechazo de sesión y permiso de objeto.

Las evidencias originales FastAPI y Spring se conservan con sus fechas y SHA. El Dockerfile Spring incluye sus seis unitarias; la evidencia FastAPI previa contiene 35 Python y tres pruebas del cliente Node. No se presentan estas cifras heredadas como suites recién repetidas en la integración. El flujo real integrado sí utiliza los dos servicios y sus motores.

## Seguridad observada

La aceptación ejercitó MFA administrativa con rechazo sin código, aceptación del factor enrolado y rechazo del mismo código reutilizado. Los vectores SHA1 RFC 6238 pasan, incluidos contadores posteriores a 2038. La auditoría registra autor y operaciones críticas. Caducidad por 31 minutos de inactividad y familia con ocho días producen rechazo, además de revocación de refresh y JWT.

No se verificaron proveedores externos ni se inventaron credenciales. Continúan pendientes la jerarquía general superadministrador/administrador de ámbito, el segundo OIDC real, challenge federado con MFA, HTTPS/cookies seguras y protección CSRF de una futura sesión por cookies. La web mantiene su almacenamiento heredado; no se cambió silenciosamente.

La MFA es obligatoria en el Compose final. Al usar el backend fuera de ese Compose hay que configurar las variables correspondientes; los entornos legacy de pruebas mantienen opt-in para preservar sus contratos.

## Mediciones y recursos

Doce lecturas reales por HTTP/proxy: **496.93 ms secuencial y 1205.26 ms concurrente**, con resultados consistentes. La muestra se tomó durante compilación y pruebas en el mismo equipo; no demuestra aceleración. Se conserva el resultado desfavorable. Docker stats registra memoria/CPU por contenedor. El mecanismo concurrente sigue siendo útil para solapar E/S, pero su beneficio de latencia debe medirse con carga controlada antes de afirmarlo.

Los benchmarks existentes de FastAPI y Spring usan procesos/cálculos de riesgo y escrituras CQL pertinentes, con métricas y límites en sus carpetas evidence. No se crearon tareas de cómputo artificiales ni se entrenó un modelo nuevo para acreditar concurrencia.

Host: Windows/PowerShell, Node 26.13.0. Backend Docker: Node 24.22.3. Docker Engine 29.8.2 con contenedores Linux. MySQL se verificó aquí con 8.4.11; no se repitió MySQL nativo 8.0.46 en esta integración.

## Incidencias corregidas

- La carrera de registro podía devolver 500 pese a UNIQUE: ahora traduce ER_DUP_ENTRY a 409 sin eliminar la restricción.
- Nginx conservaba una IP antigua al recrear Express: ahora resuelve el servicio mediante el DNS Docker.
- La prueba de rechazo omitía comentario y luego intentaba reabrir un rechazado: se corrigió el recorrido de prueba conservando las reglas.
- La repetición del sandbox acumulaba intentos de login del runner anterior: su modo interno reinicia el proceso sintético antes del recorrido, igual que un proyecto nuevo. El rate limit productivo conserva cinco intentos.
- Se espera la disponibilidad de segmentos/servicios tras reinicios mediante lecturas acotadas; no se repiten ciegamente escrituras de negocio.
- El cliente móvil reconoce el 403 específico de sesión revocada y conserva una sesión ante un 403 de permisos.

## Android y entrega física

**APK no generada.** La primera compilación nativa falló con manifest build.ninja still dirty after 100 tries en react-native-screens. Se preparó una copia corta D:\ga-final-build con npm ci, sin enlaces ni .git. Se comprobó igualdad de los 43 archivos fuente frente al proyecto integrado. El segundo intento llegó a compilar módulos nativos y falló en :app:buildCMakeRelWithDebInfo[arm64-v8a]: Ninja rechazó un objeto RNGestureHandlerDetectorShadowNode.cpp.o por superar 260 caracteres. Duración reportada: 10 min 35 s.

El tercer intento probó CMAKE_OBJECT_PATH_MAX=128 mediante un config plugin Expo, sin editar el proyecto generado a mano. Terminó en 2 min 8 s con el mismo límite Win32; el prefijo ya excedía 128 caracteres y CMake no pudo acortarlo. Se retiró ese ajuste experimental del código entregado. Se conservan evidencias saneadas de los errores. No se habilitaron cambios globales del registro, no se publicaron fuentes en EAS y no se afirmó una compilación exitosa.

Herramientas descargadas y disponibles: Java 17, Gradle 9.4.1, Android SDK 37.0, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1 y adb. El bloqueo observado es la compilación nativa en este entorno Windows, no ausencia de pantallas, bundle o SDK. Se deja un procedimiento pendiente para Linux en compilacion-android-local.md; no se presenta como verificado.

Ningún dispositivo apareció en adb devices -l. Instalación, cámara, GPS, Keystore, red de teléfono y aceptación física permanecen no verificadas. La guía exacta de compilación/instalación está en compilacion-android-local.md.

## Entregables y límites académicos

El informe editable HTML y su PDF contienen los once componentes docentes, con diccionario de los cinco motores, diagramas fuente, contratos, seguridad, resultados, manual y referencias. La matriz complementaria conserva parciales y ausencias; no se recalculó un porcentaje sobre las 227 filas históricas.

El ZIP se produce desde el árbol Git del SHA final y excluye secretos, dependencias, SDK, uploads y cachés. APK e informes se empaquetan por separado con hashes. El archivo VERSION.txt identifica repositorio, rama y SHA; MANIFIESTO.json relaciona artefactos. Moodle, push de la rama y validación de aportes personales corresponden al titular y no se realizaron.
