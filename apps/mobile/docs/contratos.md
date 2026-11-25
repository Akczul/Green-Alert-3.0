# Contratos HTTP móviles

Revisados contra `apps/backend/routes/*.routes.js`, controladores, módulos de lectura/creación y `apps/backend/docs/openapi.yaml` del checkout inicial `9a463db`. Las pruebas `contracts.test.js` detectan la ausencia de cada ruta o método en Express y OpenAPI. No reemplazan pruebas contra un despliegue ni modifican la especificación compartida.

Todas las rutas siguientes son relativas a `EXPO_PUBLIC_API_URL`, que incluye el prefijo configurado. Respuestas exitosas: `{status,message,data}`; errores: `{status,message}`. El adaptador devuelve `data`.

| Método y ruta | Entrada / salida utilizada |
| --- | --- |
| POST `/auth/login` | `{email,password}` → `data.{accessToken o token,refreshToken,user}` |
| POST `/auth/register` | `{nombre,apellido,email,password}` → mismo contrato; el servidor asigna ciudadano |
| POST `/auth/refresh` | `{refreshToken}` → acceso nuevo, renovación rotada; conserva usuario anterior si no se devuelve |
| POST `/auth/logout` | `{refreshToken,allDevices:false}` → confirmación de revocación |
| GET `/auth/perfil` | Bearer → `data.user` |
| POST `/auth/enviar-verificacion` | Bearer, sin cuerpo → confirmación |
| POST `/auth/verificar-email` | Bearer, `{codigo}` de 6 dígitos → confirmación; recarga perfil |
| GET `/categorias` | Bearer opcional → `data.categorias`, elementos `{codigo,nombre,...}` |
| GET `/reportes?limit=20&offset=N` | Bearer → `data.{reportes,total}`; para entidad el servidor devuelve asignaciones de su institución |
| GET `/reportes/mis-reportes?limit=20&offset=N` | Bearer → `data.{reportes,total}`; autoría del usuario autenticado |
| GET `/reportes/{id}` | Bearer → `data.{reporte,evidencias,autor}`; el servidor controla el alcance y contabiliza vistas |
| POST `/reportes` | Bearer, multipart → confirmación 201; sin reenvío automático |

Multipart: `titulo`, `descripcion`, `direccion`, `municipio`, `departamento`, `tipo_contaminacion`, `nivel_severidad`; opcionales `latitud` y `longitud` obtenidas del GPS. Imágenes bajo el mismo nombre `files`, hasta diez. No se fija `Content-Type` manualmente: React Native añade el boundary. No se envían campos IA inventados ni se simula clasificación. Estado inicial lo asigna el backend.

Severidad: `bajo`, `medio`, `alto`, `critico`. Los estados se muestran normalizando visualmente `_` a espacio, sin escribir otro contrato. El catálogo se obtiene de la API, sin IDs ni categorías inventadas. El móvil admite JPEG/PNG/WebP hasta 10 MB por imagen (límite por defecto del backend); un despliegue puede tener un límite menor y devuelve su error. No hay selección/captura de video en esta versión; los videos HTTPS existentes se abren en el visor externo.

Timeout habitual: 15 segundos; alta con imágenes: 60 segundos. Error de transporte: mensaje recuperable; 400/409/422: mensaje del servidor; 403: no se renueva ni se oculta elevando permisos; 401: renovación coordinada y reintento único de lectura. 5xx o respuesta no JSON muestran un error. Un alta con respuesta perdida puede haber persistido: consultar autoría antes de repetir.

No se implementa OAuth del navegador como si fuera OIDC nativo. Los endpoints existentes de proveedores requieren coordinación con seguridad para un flujo móvil verificable con PKCE/deep link y MFA. No se guardan credenciales de proveedores en la APK.
