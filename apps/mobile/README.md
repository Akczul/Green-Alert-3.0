# GreenAlert para Android

Aplicación React Native con Expo SDK 58, React 19 y componentes nativos. Instalación npm independiente: no modifica los lockfiles ni los comandos del backend/frontend. Todo el aporte de esta rama está en `apps/mobile`.

## Inicio rápido

Desde esta carpeta, con Node 24 de referencia (verificación actual: Node 26.13.0 y npm 11.20.0):

```powershell
npm ci
Copy-Item .env.example .env
# Editar .env: EXPO_PUBLIC_API_URL debe ser accesible desde el teléfono.
npm start
```

Para una API de laboratorio en la misma red, configurar, por ejemplo, `http://192.168.1.50:3000/api` y `EXPO_PUBLIC_ALLOW_HTTP=true`. Esa IP es ilustrativa: reemplazarla por la del servidor. No usar localhost. El prefijo `/api` debe coincidir con `API_PREFIX` del Express desplegado; si está vacío, omitirlo en la URL. No se deduce ni modifica la configuración del servidor. Para una API pública utilizar HTTPS y mantener HTTP deshabilitado.

Las variables `EXPO_PUBLIC_*` se incluyen en el bundle: solo URL y opción pública de laboratorio. Nunca introducir secretos, credenciales, claves de proveedores o tokens ahí. La URL se valida al conectar; modificarla requiere reiniciar Metro con `npx expo start --clear` o reconstruir la APK. HTTP también cambia la configuración nativa: requiere prebuild y recompilación.

## Estructura

- `src/app`: rutas Expo Router con stack protegido y regreso Android; `src/session.jsx` concentra arranque, sesión y conectividad.
- `src/AuthScreen.jsx`: acceso y registro.
- `src/ReportsScreen.jsx`: listados paginados, propios y detalle con evidencias.
- `src/CreateScreen.jsx`: alta multipart, cámara, selector de imágenes y ubicación del dispositivo.
- `src/api.js`: adaptador HTTP y de autenticación; renovación coordinada, timeout y revocación.
- `src/storage.js`: única persistencia de sesión, cifrada mediante Expo SecureStore/Android Keystore.
- `src/domain.js`, `src/ui.jsx`: permisos de navegación, validaciones, payload y componentes nativos compartidos.
- `assets/logo.png`: copia del logotipo del frontend activo; Inter se empaqueta desde la dependencia fijada, sin descarga en ejecución.
- `tests`: validación, API, contratos locales, pantallas y navegación.
- `scripts/build-android.ps1`, `app.config.js`, `eas.json`: reproducción de compilación local y alternativa EAS.
- `docs`: marca, contratos, aceptación y evidencia real de verificación.

## Flujos y permisos

Inicio de sesión → inicio → consulta paginada → detalle → regreso. Registro crea un ciudadano según el backend y permite verificar el correo en Cuenta mediante OTP. Inicio → crear → categoría real del catálogo → dirección/descripción/severidad → ubicación opcional → foto opcional → confirmación del servidor → reportes propios. Cuenta permite actualizar permisos y cerrar la sesión remota.

Ciudadano, moderador y admin tienen acceso a estos flujos personales. Esta entrega no implementa paneles administrativos o moderación móvil. Entidad ve **Asignados**: `GET /reportes` aplica su alcance institucional en el backend; Mis reportes sigue significando autoría personal. No se filtran reportes privados en el teléfono como sustituto de autorización. Roles desconocidos o cuentas inactivas no acceden a reportes. No se crean roles distintos de los actuales.

Los botones se bloquean durante cada formulario y existe una guardia síncrona contra doble pulsación. No hay cola offline ni reenvío automático de altas. Si una creación agota su timeout, consultar Mis reportes antes de reenviar: el backend heredado no ofrece una clave de idempotencia para este contrato.

## APK e instalación

**No hay APK generada ni instalación física acreditada en esta entrega.** Consultar [verificación](docs/verificacion.md) y [aceptación física](docs/aceptacion.md).

La generación del directorio Android y del bundle Hermes no equivalen a compilar una APK. El directorio nativo y artefactos quedan ignorados; se reconstruyen desde `package-lock.json` y `app.config.js`.

Para compilar localmente en Windows:

1. Instalar Android Studio/SDK y Java compatible. Las versiones de este lock usan Android SDK Platform 37, Build Tools 37.0.0, NDK 27.1.12297006, minSdk 24, Gradle 9.4.1 y AGP 9.2.1 (fuentes: catálogo de React Native y wrapper generado). SDK Manager debe tener las licencias aceptadas por su titular. Configurar `ANDROID_HOME` y `JAVA_HOME`.
2. Ejecutar `npm ci`, establecer variables públicas y `npm run apk`. El script exige URL explícita en el entorno del proceso; no carga `.env` antes de su verificación.

```powershell
$env:EXPO_PUBLIC_API_URL='https://api.example.org/api'
$env:EXPO_PUBLIC_ALLOW_HTTP='false'
npm run apk
```

3. Si termina correctamente, la ruta esperada es `android/app/build/outputs/apk/release/app-release.apk`. El script comprueba su existencia y muestra SHA-256. Este perfil local usa la firma debug generada por Expo y empaqueta el JS en variante release: sirve para evaluación instalada, sin Metro. No sirve como política de firma de producción; conservar una clave de distribución propia fuera del repositorio si se publica otra entrega.
4. Con un teléfono Android 7/API 24 o superior, habilitar depuración USB y autorizar el equipo; ejecutar `adb devices` y `adb install -r android/app/build/outputs/apk/release/app-release.apk`. También puede transferirse el APK y autorizar la instalación desde esa fuente. Una APK previa con otra firma requiere desinstalación (elimina su sesión local).
5. Asegurar acceso del teléfono a la API: misma LAN sin aislamiento de clientes o dominio HTTPS accesible, firewall/puerto del servidor habilitado y Express escuchando en una interfaz de red. Verificar `/health` desde el navegador del teléfono. No usar `localhost` ni nombres internos de Compose.

Alternativa: [EAS Build para APK](https://docs.expo.dev/build-reference/apk/), con cuenta Expo y autorización para cargar las fuentes del proyecto. No se inició sesión ni se subieron fuentes desde este chat. Tras configurar el proyecto y la variable pública de URL en EAS:

```powershell
npx eas-cli@27.11.0 login
npx eas-cli@27.11.0 build:configure
npx eas-cli@27.11.0 build --platform android --profile preview
```

Revisar la URL que se incluirá en la compilación y las credenciales de firma. No se requiere publicar en Google Play. Expo Go puede ayudar al desarrollo, pero no sustituye la APK propia ni la aceptación del instructivo.

## Pruebas

```powershell
npm test
npm run lint
npm run typecheck
npm run check
npx expo-doctor
npm run bundle:android
npm run prebuild:android
npm run apk
```

Las pruebas de API y capacidades usan dobles; las de contratos verifican archivos Express/OpenAPI de este checkout y no consultan un servidor. No acreditan permisos de objetos en una API desplegada, correo real, cámara/GPS reales ni almacenamiento cifrado en hardware. La [lista de aceptación](docs/aceptacion.md) exige demostrarlo en un teléfono.

## Seguridad e integración pendiente

Las contraseñas solo se mantienen mientras se completa el formulario; nunca se persisten ni se registran. Access/refresh tokens y usuario se guardan juntos en SecureStore, excluidos de Android Backup por el plugin. No hay AsyncStorage, localStorage ni cookies como persistencia de autenticación. El JWT solo se decodifica para anticipar expiración; el backend valida firma, revocación, usuario, rol y alcance.

`src/api.js` concentra `token`/`accessToken`, `refreshToken`, perfil y logout. La renovación proactiva ocurre antes de una petición autenticada si quedan menos de dos minutos. Un único proceso comparte la rotación entre peticiones concurrentes; un 401 permite renovar y repetir solo lecturas una vez. Un refresh rechazado por 400/401/403 borra la sesión. Los errores de red conservan la sesión cifrada para reintentar. Logout solo muestra éxito tras confirmar revocación remota y borrar SecureStore; sin red mantiene la sesión y muestra un error recuperable.

Queda acordar con el refuerzo de seguridad: contrato final de MFA y OIDC con dos proveedores, autenticación de administradores, bloqueo de contraseñas comunes/comprometidas, caducidad por inactividad/absoluta y alcance de revocación de JWT ya emitidos. La app no simula estas garantías. Registro exige una frase de al menos 15 caracteres y permite más de 64, pero la política y rechazo definitivo corresponden al servidor. No se han modificado archivos del backend, OpenAPI compartido ni seguridad de otros agentes.
