# Compilación Android local

Se utiliza Expo SDK 58, React Native y dependencias fijadas en apps/mobile/package-lock.json. No se usa EAS ni se suben fuentes a un proveedor. No es necesario publicar en Play Store.

## Herramientas observadas

- Java: Eclipse Temurin 17.0.21.
- Gradle: 9.4.1, descargado por el wrapper generado de Expo.
- Android command line tools: commandlinetools-win-15859902_latest.zip, descargado de https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip.
- SHA-256 comprobado de command line tools: 90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a.
- Paquetes SDK: platform-tools, platforms;android-37.0, build-tools;37.0.0, ndk;27.1.12297006, cmake;3.22.1.
- El alias platforms;android-37 no existía en el catálogo consultado; se instaló platforms;android-37.0.

Las herramientas se instalaron en .local/android-sdk del worktree de integración. Gradle usa una caché independiente D:\GreenAlertBuild\gradle. No se tocaron instalaciones ni worktrees originales.

## Procedimiento reproducible

Descargar las herramientas oficiales, comprobar SHA-256 y descomprimir cmdline-tools dentro de SDK/cmdline-tools/latest. Configurar JAVA_HOME y ANDROID_HOME con rutas propias. Ejecutar:

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=$env:ANDROID_HOME --licenses
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root=$env:ANDROID_HOME 'platform-tools' 'platforms;android-37.0' 'build-tools;37.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1'
cd apps/mobile
npm.cmd ci
$env:EXPO_PUBLIC_API_URL='https://SERVIDOR_ACCESIBLE/api'
npm.cmd run apk
```

El script genera Android mediante CNG. No editar manualmente el código generado. La firma debug local es únicamente para evaluación; no se versiona ni se publica. El script limita Gradle a dos workers y desactiva el paralelismo entre proyectos para contener memoria.

## Ruta corta en Windows

La primera compilación nativa falló con ninja: manifest build.ninja still dirty after 100 tries en react-native-screens. La causa no se certifica solo por el mensaje. Se preparó un segundo intento independiente en D:\ga-final-build, con las mismas fuentes y lockfile y una instalación npm ci nueva, sin enlaces simbólicos ni repositorios Git anidados.

Para repetir: copiar únicamente las fuentes móviles a una carpeta corta nueva, excluyendo node_modules, android, ios, dist, .local y archivos de entorno. Ejecutar npm ci en esa copia y los mismos comandos de compilación. No reutilizar .cxx ni build de otra ruta. La configuración productiva permanece en app.config.js y los scripts de la rama.

```powershell
$env:GRADLE_USER_HOME='D:\GreenAlertBuild\gradle'
$env:GREENALERT_ANDROID_ABIS='arm64-v8a'
$env:EXPO_PUBLIC_API_URL='http://IP_LAN_DEL_HOST:8080/api'
$env:EXPO_PUBLIC_ALLOW_HTTP='true'
$env:CMAKE_BUILD_PARALLEL_LEVEL='2'
npm.cmd run apk
```

El intento de evaluación apunta a la IP Wi-Fi local observada, 192.168.18.11, puerto 8080, y compila arm64-v8a. Esa dirección puede cambiar. Para otra red o para un emulador x86_64 hay que configurar la URL y ABI correspondientes y recompilar; la opción por defecto del script incluye arm64-v8a,x86_64. Para un emulador del mismo host, la dirección es 10.0.2.2, nunca localhost.

En Windows nativo la APK no se generó. Hubo tres intentos: ruta larga, ruta corta y un ajuste CMake de acortamiento por hash mediante plugin Expo. El último ajuste no resolvió el límite Win32 y se retiró del código entregado. Los logs permanecen en .local/integracion y en la carpeta corta. La compilación vigente es la de Linux/Docker descrita abajo. Consultar docs/verificacion-final.md para el desenlace y los errores exactos.

## Compilación reproducible en Linux con Docker (procedimiento vigente)

Los intentos de Windows fallaron por el límite Win32 de 260 caracteres en objetos C++ generados por Ninja/CMake. Se cambió la condición técnica: la compilación ocurre en el sistema de archivos Linux de un contenedor, sin depender de rutas de Windows ni de instalar el SDK en el host. Se comprobó con éxito el 25 de noviembre de 2026.

```powershell
# Desde la raíz. Requiere Docker Desktop (contenedores Linux) y ~10 GB libres para SDK/NDK y caché Gradle.
$env:EXPO_PUBLIC_API_URL='http://IP_LAN_DEL_HOST:8080/api'   # solo valor inicial; editable en la app
$env:EXPO_PUBLIC_ALLOW_HTTP='true'                          # laboratorio LAN; en producción HTTPS de confianza
npm.cmd run apk:docker
```

apps/mobile/docker/apk.Dockerfile usa node:24.11.1-bookworm y OpenJDK 17, descarga commandlinetools-linux-15859902_latest.zip con SHA-256 4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583 comprobado, instala platform-tools, platforms;android-37.0, build-tools;37.0.0, ndk;27.1.12297006 y cmake;3.22.1, ejecuta npm ci con el lockfile, expo prebuild y gradlew :app:assembleRelease (arm64-v8a por defecto; GREENALERT_ANDROID_ABIS admite también x86_64 para emulador). La caché de Gradle es un montaje de BuildKit; repetir la compilación reutiliza capas.

Salida en .local/apk (fuera de Git): greenalert.apk, greenalert.apk.sha256, firma.txt (apksigner verify --print-certs) y apk.json con hash, commit, ABI, URL inicial y si las fuentes móviles tenían cambios sin commit. La firma es la debug de la plantilla Expo: válida para instalar en evaluación, nunca para publicar.

Instalación en el teléfono (depuración USB activada):

```powershell
adb devices -l
adb install -r .local/apk/greenalert.apk
```

En la pantalla de acceso, «Cambiar servidor» fija la URL de la API de la red actual (la valida, la guarda en SecureStore y no permite cambiarla con una sesión abierta). Publicar Nginx con WEB_BIND=0.0.0.0 en una red de laboratorio controlada para que el teléfono alcance http://IP_LAN:8080/api.

## Alternativa manual en Linux (sin Docker)

Equivalente al Dockerfile anterior, sin contenedor. Usar un sistema Linux con Node 24, JDK 17 y Android SDK, copiar las fuentes a su filesystem nativo (sin node_modules ni android generados en Windows), instalar los paquetes SDK indicados y ejecutar:

```sh
npm ci
export CI=1
export EXPO_PUBLIC_API_URL=https://SERVIDOR_ACCESIBLE/api
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease --no-daemon --max-workers=2 --no-parallel -PreactNativeArchitectures=arm64-v8a
test -f app/build/outputs/apk/release/app-release.apk
```

Comprobar firma, contenido y hash antes de entregar la APK. Este procedimiento evita depender del límite Win32 de Ninja, pero todavía requiere su propia aceptación real. No reutilizar firmas privadas ni publicar en servicios de nube sin autorización.

## Instalación y aceptación física pendientes

Si existe APK:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices -l
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r RUTA_APK
```

En una red de laboratorio, configurar WEB_BIND=0.0.0.0 en .env.integracion y recrear frontend para que el teléfono alcance el host. Configurar API_PUBLIC_URL y CORS_ORIGIN del backend si se usan URLs públicas/evidencias desde otra dirección. No exponer bases ni tokens internos.

Probar en dispositivo: abrir APK sin Metro, login y renovación, crear reporte sin evidencia, consultar propios, añadir fotografía, ubicación con permiso y cierre revocable. Rechazar permisos debe mostrar una alternativa comprensible. Verificar almacenamiento seguro y reconexión tras caída. No se afirma ninguna de estas pruebas físicas sin dispositivo accesible.
