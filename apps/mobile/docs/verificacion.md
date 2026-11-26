# Verificación móvil

## Cierre Android del 25 de noviembre de 2026

La misión 01 compiló la APK release en Linux/Docker (567 tareas), verificó firma V2, paquete, ABI arm64 y bundle integrado, y la instaló con `adb install -r` en Samsung SM-A055M, Android 15/API 35. Lint, configuración JS, dependencias Expo, bundle, prebuild y 58 pruebas móviles pasaron; se conserva el timeout de la primera ejecución y su repetición exacta correcta. La primera finalización del manifiesto falló por el nuevo texto `V2 Signer` de Build Tools 37; se corrigió el lector y se reexportó usando la caché, sin recompilar fuentes nativas.

Estado, hash, commits de compilación/validación y resultados físicos: [misión 01](../../../docs/cierre-definitivo/01-sincronizacion-android.md) y [manifiesto vigente](../../../docs/evidencias-integracion/apk.json). Los apartados siguientes conservan el historial de `feat/mobile`; su afirmación de ausencia de APK fue sustituida por esta evidencia.

## Registro histórico de feat/mobile

Fecha de trabajo: 24 de noviembre de 2026, America/Bogota. Rama `feat/mobile`, worktree exclusivo `D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-mobile`. Base inspeccionada: `9a463db`. No se han modificado fuentes backend/frontend ni archivos compartidos.

## Entorno

Windows/PowerShell; Node 26.13.0, npm 11.20.0 y Java Temurin 17.0.21. Node de referencia del repositorio: 24, sin ejecución de esta app en esa versión. Expo SDK 58.0.26 y React Native 0.88.1 instalados mediante lockfile propio. Expo Doctor verifica compatibilidad, no demuestra compilación nativa.

`ANDROID_HOME`/`ANDROID_SDK_ROOT` no están configuradas. No se encontró SDK en la ruta habitual `%LOCALAPPDATA%\Android\Sdk` ni `adb`/Gradle global en PATH. Java sí está disponible. El wrapper Gradle 9.4.1 se pudo descargar; eso no instala Android SDK, NDK ni acepta licencias. No hay dispositivo/emulador verificado.

## Resultados comprobados

| Comando | Resultado |
| --- | --- |
| `npm ci --no-audit --no-fund` | Instalación final desde lockfile correcta: 1277 paquetes, sin procesos Gradle concurrentes |
| `npm test` | 55 pruebas en 6 suites: API/sesión, contratos, dominio, navegación, pantallas y SecureStore |
| `npm run lint` | ESLint del cliente móvil sin errores ni warnings; no se deshabilitan reglas de hooks |
| `npm run typecheck` | tsc sin emisión sobre JavaScript/JSX y configuración; `checkJs:false`, no acredita tipado estático |
| `npm run check` | Expo declara dependencias compatibles |
| `npx expo-doctor` | 20/20 comprobaciones correctas |
| `npm run bundle:android` | Exportación Android Hermes correcta con rutas Expo Router, logo e Inter local |
| `npm run prebuild:android` | Proyecto Android generado mediante CNG; firma y directorio nativo ignorados |
| `npm run apk` con URL pública ilustrativa explícita | Falla correctamente en prerequisito: falta Android SDK/platform-tools; no contacta esa URL |
| `git diff --check` | Sin errores de whitespace; revisar también el índice antes del commit |

La suite incluye renovación compartida ante 401 concurrentes, refresh expirado/revocado, errores de red y timeout, logout remoto correcto/fallido, respuesta pendiente que no restaura identidad tras logout, ausencia de reenvío de escrituras, rechazo 403, validación de URL/registro/ubicación/evidencias y lectura/escritura de la entrada SecureStore mediante dobles. También comprueba rutas/métodos en Express y OpenAPI, enlaces profundos sin sesión/rol válido, alcance visual de entidad, paginación, estados vacíos, recuperación de error y creación confirmada.

## Incidencias resueltas durante preparación

- Se inició una reinstalación npm mientras Gradle seguía activo: Windows bloqueó un archivo `.lock` y la compilación no pudo encontrar el plugin durante la eliminación de node_modules. No se considera evidencia de un defecto del backend ni de éxito Android. Los procesos finalizaron y se repitió `npm ci` en secuencia.
- Se fijó React DOM 19.3.0 para coincidir con React 19.3.0 después de que un peer opcional del router seleccionara 19.3.1; no se usaron `--force` ni `--legacy-peer-deps`.
- Las pruebas de componentes se adaptaron a las APIs asíncronas de Testing Library 14 y la navegación final se prueba con Expo Router. No se eliminaron aserciones para obtener verde.
- Se corrigieron efectos y dependencias de hooks señalados por ESLint.

npm informa deprecaciones en herramientas y avisos de scripts opcionales de `@parcel/watcher`; no se cambió la política global de npm. La auditoría de dependencias observó 22 vulnerabilidades moderadas incluyendo desarrollo y 20 con `--omit=dev` en el árbol final (que incluye herramientas transitivas Expo/Jest/minimatch). El primer árbol sin Router reportó 3 con `--omit=dev`; no es el resultado final. No se aplicó `npm audit fix --force`, cuya propuesta incluía cambiar de SDK. Esto es un límite pendiente de revisión de dependencias, no una afirmación de explotación de la APK.

## APK y aceptación real

**No se generó una APK. No existe artefacto Android entregable ni SHA-256 de APK acreditado.** El bundle bajo `dist` es un artefacto de Metro/Hermes, no instalable por sí solo. La ruta descrita en README para `app-release.apk` es una salida esperada tras una compilación futura satisfactoria.

El intento directo de Gradle no llegó a compilar la aplicación y el runner final se detiene al comprobar la ausencia del SDK. No se inició una build EAS, no hubo login externo, subida de fuentes, push ni publicación. La alternativa EAS y la compilación local están documentadas; ambas necesitan terminar la configuración de su entorno.

No se probaron API desplegada, MySQL real, SMTP, proveedores OIDC/MFA, autorización por objeto en servidor, GPS/cámara de dispositivo, Android Keystore en hardware, render de pantalla Android ni instalación física. Los tests de esos adaptadores utilizan dobles y no sustituyen el recorrido de `aceptacion.md`. El cumplimiento integral del instructivo y la aceptación final quedan pendientes de esa evidencia.
