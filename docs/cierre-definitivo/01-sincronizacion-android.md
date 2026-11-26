# Misión 01: sincronización y cierre Android

Fecha: 25 de noviembre de 2026, America/Bogota. Esta misión sustituye las afirmaciones de estado actual de Android de la integración anterior; sus intentos fallidos se conservan como historia.

## Estado de entrega inmediata

Por instrucción del usuario se suspendieron las pruebas adicionales y cualquier nueva compilación para priorizar Moodle. Se conserva la APK release de 31.506.987 bytes, SHA-256 `a22770874f34310912f669c754d8015f774c8289702d4b4a8e6f4b83d1c202e1`, compilada originalmente sobre `75f3bf8`, reexportada en caché y validada sobre `c6d2e3e`. Firma V2 válida; paquete `co.greenalert.mobile`, Android mínimo API 24, ABI arm64-v8a. La instalación real en Samsung SM-A055M con Android 15/API 35 fue correcta.

Se comprobaron físicamente apertura sin Metro, guardado de servidor LAN, registro, listado ambiental, alta sin foto, Mis reportes, cámara y galería, obtención de ubicación y recuperación de sesión después de force-stop. MySQL confirmó el reporte 3, estado pendiente, sin coordenadas personales; se observaron 14 refresh emitidos y 13 revocados. No se completaron login separado, logout, reconexión controlada ni denegación física de permisos. Se restauró el ajuste temporal de pantalla encendida por USB.

El envío de imagen de la APK entregada falló antes de alcanzar el proxy. Se identificó en el código instalado de Expo 58 que su serializador requiere File/Blob, y se corrigió el adaptador de creación para suministrar File sin cambiar el campo multipart `files`. La fuente corregida pasó lint, configuración JS, compatibilidad Expo y **60/60 pruebas**. Esa corrección **no está incluida en la APK entregada**: se detuvo la recompilación por prioridad expresa de entrega. La APK y el código final tienen, por tanto, distinta revisión móvil; los manifiestos lo declaran y no se utiliza el empaquetador estricto para ocultar esa diferencia. Cloudinary tampoco tiene credenciales locales configuradas.

La integración adicional conserva su resultado 15/16 y el fallo de reconexión Spring/Cassandra documentado abajo. Los apartados posteriores son la bitácora previa; para el estado final prevalece este apartado. El informe PDF previo se conserva; el DOCX de origen resultó ilegible como ZIP y se recupera a partir de las páginas del PDF, con limitación de edición del cuerpo. Se excluye el bloqueo temporal de Office del ZIP. La portada fue actualizada con los nombres confirmados por el usuario: Juan Delgado, Alexander Ardila, David Ortega y Daniel Yanguatin; no se inventaron códigos.

## Sincronización y preservación

- Se ejecutó `git fetch origin`. Base remota comprobada: `ef06a11a70f2c1cf948d6cc371618f15073bedb3`, merge de `feat/aplication-apk`.
- Se creó mediante la herramienta de worktrees un checkout independiente en `C:\Users\Akczul\.codex\worktrees\ga-cierre\GreenAlert3.0` y se creó `feat/cierre-definitivo` sobre `origin/main`. No existía esa rama.
- Frente a `feat/integracion-final` (`b21e47e`), se incorporan seis commits: `a74b986`, `268b639`, `fe877e7`, `21e6fbb`, `4c6bb9e`, `ef06a11`. Incluyen Android, HTTPS/cookies/CSRF/OIDC, jerarquía y Compose separados.
- Se inspeccionaron los once worktrees anteriores. Los cambios sin seguimiento de la copia original (`.codex/`, `docs/requisitos/` y un archivo de nombre anómalo) se conservaron allí sin editar, mover ni versionar. Los otros checkouts automáticos conservan sus `.codex/`. Los worktrees de analytics, events, mobile, security e integración no tenían modificaciones versionables.
- `main` local permanece en `9a463dbb046e54c7f87cced82b649a2b58d64d36`; esta misión no la modifica. No se ejecutaron reset, clean, borrados de worktrees ni force push.
- Se comprobó la presencia de tres backends, cinco motores declarados y siete módulos hexagonales en `apps/backend/src/modules`. No se reconstruyó ninguna de esas funcionalidades.

## Búsqueda de artefactos y procedencia

Se buscaron APK y manifiestos en todos los worktrees registrados: `.local/apk`, `.local/integracion/apk.json`, `.local/entrega` y salidas Android; también en `D:\ga-final-build` y `D:\GreenAlertBuild`. Solo se encontró el manifiesto histórico negativo y la entrega anterior sin APK. No se acreditó ningún binario reutilizable.

Se mantuvo el procedimiento Linux/Docker. El host usa Node 26.13.0/npm 11.20.0; el Dockerfile fija Node 24.11.1. Docker Desktop estaba detenido y fue iniciado. No se instalaron herramientas de emulación ni se eliminaron imágenes, cachés o volúmenes.

El manifiesto distingue `commit` (HEAD al iniciar compilación) y `mobileSourceTree` (árbol Git móvil compilado). El paquete identifica por separado su SHA de entrega. El validador exige fuentes confirmadas, árbol acreditado por el commit, igualdad de entradas móviles actuales, hash binario y sidecar, evidencia de firma y bundle. Solo se exceptúan cambios documentales bajo `apps/mobile/docs`; código, assets, dependencias, pruebas y Dockerfile siguen exigiendo correspondencia. Las evidencias de firma provienen de `apksigner` durante la compilación, no de las pruebas sintéticas del validador.

## Pruebas móviles

Comandos desde la raíz:

```powershell
npm.cmd ci --prefix apps/mobile --no-audit --no-fund
npm.cmd --prefix apps/mobile run lint
npm.cmd --prefix apps/mobile run typecheck
npm.cmd --prefix apps/mobile test
npm.cmd --prefix apps/mobile run check
$env:EXPO_PUBLIC_API_URL='http://192.168.18.11:8080/api'
$env:EXPO_PUBLIC_ALLOW_HTTP='true'
npm.cmd --prefix apps/mobile run bundle:android
npm.cmd --prefix apps/mobile run prebuild:android
node --test scripts/apk-provenance.test.mjs
```

Lint, configuración JS, dependencias Expo, bundle Hermes y prebuild pasaron. La primera ejecución Jest tuvo 57 pruebas aprobadas y una fallida por timeout de 5 segundos al renderizar login con caché fría. La repetición exacta pasó 58/58 en seis suites (21,588 s), sin cambios de tests, aserciones ni timeout. El test de procedencia cubre APK alterada, sidecar incorrecto, falta de firma/bundle, cambios locales, fuentes distintas, manifiesto antiguo, rutas absolutas y commits exclusivamente documentales.

Los tests móviles usan dobles: no acreditan hardware, API real ni persistencia remota. Los logs nuevos están en `.local/cierre-android/`, fuera de Git, y se conservan separados de la historia.

## Integración real adicional

El primer intento de `node scripts/validate-integration.mjs` no arrancó por ausencia de `mysql2` en el checkout nuevo. Se resolvió con `npm.cmd ci --prefix apps/backend --no-audit --no-fund`; no se cambiaron dependencias. `node scripts/setup-integracion.mjs` generó configuración y TLS locales ignorados. Se creó explícitamente el sandbox `ga-android-20261125223033`, red y volúmenes propios, con marcador `synthetic: true`; no se reutilizó una base personal. Se seleccionó `WEB_BIND=0.0.0.0` para HTTP LAN de laboratorio y se ejecutó el runner con `--reuse-session-sandbox` contra ese sandbox recién creado.

Resultado: **15/16 comprobaciones aprobadas**. Se comprobaron TLS/HSTS, registro concurrente, creación persistida, integración analítica, Cassandra/Druid, caché y recuperación Redis, permisos, recuperación de outbox, concurrencia, revocación, auditoría y límites de sesión. El runner desactiva la verificación del certificado autofirmado únicamente en su proceso de prueba; no se alteró la seguridad del servidor ni de la app.

Falló la comprobación de recuperación después de reiniciar los motores: Cassandra cambió de IP Docker (`172.18.0.5` → `172.18.0.10`) y la sesión Java conservó el destino anterior (`NoNodeAvailableException`). El historial respondió 503 durante el plazo del runner. Se comprobó por CQL que persistían cuatro eventos; después de reiniciar explícitamente solo `events`, su health dio 200 y el historial del reporte sintético original devolvió 200 con tres eventos. Es una recuperación operativa comprobada, **no** una corrección de reconexión automática ni una suite 16/16. No se modificaron Java, backends ni los contratos para ocultar el fallo. Revisar la reconexión/DNS en una tarea posterior.

El acceso `http://192.168.18.11:8080/api/health` devolvió 200 y `database: conectada` desde el host. Esto no prueba entrada desde otro equipo ni apertura del firewall. Se detuvo temporalmente el sandbox para liberar memoria durante Gradle, sin eliminar contenedores o volúmenes.

## Red y aceptación Android

IP Wi-Fi observada: `192.168.18.11`; no confundirla con las interfaces virtuales `172.25.0.1` y `192.168.56.1`. La URL inicial de laboratorio es `http://192.168.18.11:8080/api`; la aplicación conserva «Cambiar servidor» y SecureStore. HTTP requiere el indicador explícito `EXPO_PUBLIC_ALLOW_HTTP=true`; producción debe usar HTTPS confiable.

ADB disponible en el SDK local del worktree de integración anterior, sin dispositivos en `adb devices -l`. No se encontró emulador ni AVD instalado en las ubicaciones habituales. No se instaló una APK ni se ejecutó aceptación física o por emulador.

Para habilitar aceptación: conectar un Android por USB con cable de datos, activar opciones de desarrollador y depuración USB, desbloquear y aceptar la huella RSA de este equipo. Confirmar estado `device` con `adb devices -l`. Instalar el archivo local comprobado mediante `adb install -r .local/apk/greenalert.apk`. Usar la misma Wi-Fi que el servidor, verificar la URL actual con «Cambiar servidor» y seguir `apps/mobile/docs/aceptacion.md` con cuentas sintéticas. No compartir contraseñas ni tokens en las evidencias.

Quedan sin acreditar en hardware los catorce puntos de la misión: apertura sin Metro, servidor, registro/login, consultas/alta/propios, foto, GPS, denegación de permisos, renovación, logout, reconexión y persistencia del alta originada desde el dispositivo. Los resultados automatizados se informan por separado.

## Reproducción de compilación y entrega

```powershell
$env:EXPO_PUBLIC_API_URL='http://IP_LAN:8080/api'
$env:EXPO_PUBLIC_ALLOW_HTTP='true'
$env:GREENALERT_ANDROID_ABIS='arm64-v8a'
npm.cmd run apk:docker
# Confirmar los cambios de código/documentación antes del paquete.
node scripts/package-delivery.mjs
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/feat/cierre-definitivo
```

La APK, los sidecars y `.env.integracion` permanecen fuera de Git. No se regeneraron el informe académico ni la auditoría de 227 criterios. El paquete conserva el informe previo: sus afirmaciones históricas requieren actualización en una fase posterior.

## Continuidad

Continuar desde `feat/cierre-definitivo`, conservando este worktree y sus artefactos ignorados. Consultar el resultado Android y la verificación de API añadidos al cierre de esta misión. La próxima sesión debe priorizar el recorrido real en Android autorizado y actualizar únicamente sus evidencias; después podrá abordar el informe académico y la revisión docente pendientes. OIDC externo y hardware siguen necesitando aceptación independiente.

## Paquete definitivo de Moodle

Carpeta solicitada: D:\ENTREGA-GREENALERT. Incluye PDF actualizado de 23 páginas, DOCX recuperado válido de 23 páginas visuales, APK instalada, ZIP exacto del commit publicado, VERSION.txt y MANIFIESTO.json con SHA-256. El PDF conserva los once apartados, diagramas y referencias existentes; se añadieron nombres y una nota mínima de cierre. El DOCX binario está protegido por .gitattributes para conservar sus bytes. La versión original ilegible y el PDF previo permanecen en .local/entrega-original, fuera de la entrega.

La creación del paquete se hace directamente con git archive y copias verificadas por instrucción urgente del usuario. El empaquetador habitual sigue rechazando APK cuyas fuentes móviles difieran; no se debilitó ese control. La excepción de esta entrega está declarada en el manifiesto: código con corrección multipart probada y APK previa con el envío de fotografía pendiente. No se realizaron más desarrollos ni pruebas prolongadas después de la consolidación.
