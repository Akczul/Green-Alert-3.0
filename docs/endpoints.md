# Inventario de endpoints HTTP

Generado desde `apps/backend/routes/*.routes.js` con `npm run docs:inventory`. Se conserva el orden de registro. En la configuración local, anteponer `/api`; sin `API_PREFIX` el backend monta rutas sin prefijo.

Acceso expresa los middlewares declarados. Las comprobaciones de propiedad, estado y entidad también se ejecutan en los controladores; no sustituye su revisión. Respuesta habitual: `{status, message, data}`; errores `{status, message}`. `/health` tiene formato propio y devuelve 503 si MySQL no responde.

## health

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| GET | `/health` | Público | `getHealth` |

## auth

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| POST | `/auth/register` | Público | `register` |
| POST | `/auth/login` | Público | `login` |
| POST | `/auth/refresh` | Público | `refreshAccessToken` |
| POST | `/auth/oauth/exchange` | Público | `exchangeOAuthCallbackCode` |
| POST | `/auth/logout` | JWT si allDevices=true | `logout` |
| GET | `/auth/verify-email` | Público | `verifyEmail` |
| POST | `/auth/forgot-password` | Público | `forgotPassword` |
| POST | `/auth/reset-password` | Público | `resetPassword` |
| GET | `/auth/perfil` | JWT | `getPerfil` |
| PATCH | `/auth/perfil` | JWT | `updatePerfil` |
| PATCH | `/auth/avatar` | JWT | `updateAvatar` |
| PATCH | `/auth/cambiar-contrasena` | JWT | `changePassword` |
| PATCH | `/auth/notificaciones` | JWT | `updateNotifications` |
| POST | `/auth/enviar-verificacion` | JWT | `sendVerificationOtp` |
| POST | `/auth/verificar-email` | JWT | `verifyEmailOtp` |
| GET | `/auth/google/url` | Público | `getGoogleAuthUrl` |
| POST | `/auth/google` | Público | `googleAccessTokenLogin` |
| POST | `/auth/google/login` | Público | `googleLogin` |
| GET | `/auth/google/callback` | Público | `googleCallback` |
| GET | `/auth/facebook/url` | Público | `getFacebookAuthUrl` |
| POST | `/auth/facebook` | Público | `facebookLogin` |
| GET | `/auth/facebook/callback` | Público | `facebookCallback` |

## reportes

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| GET | `/reportes/stats` | Público | `getStats` |
| GET | `/reportes/stats/categoria` | Público | `getStatsByCategoria` |
| GET | `/reportes/stats/timeline` | Público | `getStatsTimeline` |
| GET | `/reportes/stats/heatmap` | Público | `getHeatmapPoints` |
| GET | `/reportes/stats/ia` | JWT; admin, moderador | `getStatsIA` |
| GET | `/reportes/zonas-riesgo` | JWT; admin, moderador | `getZonasRiesgo` |
| GET | `/reportes/alertas-predictivas` | JWT opcional | `getAlertasPredictivas` |
| GET | `/reportes/trending` | JWT opcional | `getTrendingReportes` |
| GET | `/reportes/export` | JWT; admin, moderador | `exportReportes` |
| GET | `/reportes/mis-reportes` | JWT | `getMisReportes` |
| POST | `/reportes/analizar-imagen` | JWT | `analizarImagen` |
| POST | `/reportes/sugerir-contenido` | JWT | `sugerirContenidoReporte` |
| GET | `/reportes` | JWT opcional | `getReportes` |
| POST | `/reportes/:id/like` | JWT | `toggleLikeReporte` |
| POST | `/reportes/:id/asignaciones` | JWT; admin, moderador | `asignarEntidadReporte` |
| GET | `/reportes/:id/evidencias` | JWT | `listEvidenciasReporte` |
| POST | `/reportes/:id/evidencias` | JWT | `addEvidenciaReporte` |
| DELETE | `/reportes/:id/evidencias/:evidenciaId` | JWT | `deleteEvidenciaReporte` |
| GET | `/reportes/:id` | JWT opcional | `getReporteById` |
| POST | `/reportes` | JWT | `createReporte` |
| PATCH | `/reportes/:id` | JWT | `updateReporte` |
| DELETE | `/reportes/:id` | JWT | `deleteReporte` |

## categorias

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| GET | `/categorias/estadisticas/resumen` | Público | `obtenerEstadisticasCategorias` |
| GET | `/categorias/estadisticas/por-severidad` | Público | `obtenerEstadisticasSeveridad` |
| GET | `/categorias` | Público | `obtenerTodasLasCategorias` |
| POST | `/categorias` | JWT; admin | `crearCategoria` |
| PATCH | `/categorias/:codigo` | JWT; admin | `actualizarCategoria` |
| PATCH | `/categorias/:codigo/estado` | JWT; admin | `cambiarEstadoCategoria` |
| GET | `/categorias/:codigo/reportes` | Público | `obtenerReportesPorCategoria` |
| GET | `/categorias/:codigo` | Público | `obtenerCategoriaPorCodigo` |

## admin

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| GET | `/admin/usuarios/stats` | JWT; admin | `statsUsuarios` |
| GET | `/admin/usuarios` | JWT; admin | `listarUsuarios` |
| GET | `/admin/usuarios/:id` | JWT; admin | `obtenerUsuario` |
| PATCH | `/admin/usuarios/:id/rol` | JWT; admin | `cambiarRol` |
| PATCH | `/admin/usuarios/:id/estado` | JWT; admin | `cambiarEstado` |
| DELETE | `/admin/usuarios/:id` | JWT; admin | `eliminarUsuario` |

## chatbot

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| POST | `/chatbot/mensaje` | JWT opcional | `enviarMensajeChatbot` |
| GET | `/chatbot/faqs` | Público | `obtenerFaqsChatbot` |

## notificaciones

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| GET | `/notificaciones/contador` | JWT | `contadorNotificaciones` |
| POST | `/notificaciones/fcm-token` | JWT | `registrarFcmToken` |
| PATCH | `/notificaciones/marcar-todas` | JWT | `marcarTodasLeidas` |
| GET | `/notificaciones` | JWT | `listarNotificaciones` |
| PATCH | `/notificaciones/:uuid/leida` | JWT | `marcarLeida` |
| DELETE | `/notificaciones/:uuid` | JWT | `eliminarNotificacion` |

## entidades

| Método | Ruta sin prefijo | Acceso declarado | Controlador |
| --- | --- | --- | --- |
| GET | `/entidades` | JWT; admin, moderador, entidad | `listarEntidades` |
| GET | `/entidades/:id/reportes` | JWT; admin, moderador, entidad | `listarReportesPorEntidad` |
| GET | `/entidades/mis-alertas` | JWT; entidad | `listarMisAlertasEntidad` |
| GET | `/entidades/mis-alertas/no-leidas` | JWT; entidad | `listarMisAlertasNoLeidasEntidad` |
| GET | `/entidades/mis-alertas/no-leidas/count` | JWT; entidad | `contarMisAlertasNoLeidasEntidad` |
| PATCH | `/entidades/mis-alertas/leer-todas` | JWT; entidad | `marcarTodasMisAlertasEntidadLeidas` |
| PATCH | `/entidades/mis-alertas/:id/leer` | JWT; entidad | `marcarMiAlertaEntidadLeida` |
| PATCH | `/entidades/mis-alertas/:id` | JWT; entidad | `marcarMiAlertaEntidadLeida` |
| GET | `/entidades/mis-reportes` | JWT; entidad | `listarMisReportesEntidad` |
| GET | `/entidades/mis-reportes/:id` | JWT; entidad | `obtenerMiReporteEntidad` |
| PATCH | `/entidades/mis-reportes/:id/atencion` | JWT; entidad | `actualizarAtencionMiEntidad` |

Total: **78 registros HTTP**, además de archivos estáticos en `/uploads` y Socket.IO en `/socket.io/`.

Socket.IO: autenticación JWT en `handshake.auth.token` o Authorization Bearer; sala `entidad:<id>`; evento `reporte:critico_asignado`. El frontend actual consulta alertas mediante polling y no incluye un cliente Socket.IO.

Uploads: `POST /reportes` usa multipart con `file` y `files`; análisis usa `imagen`; evidencia individual usa `file`; avatar usa `avatar`. Para filtros, formatos completos y ejemplos: [OpenAPI conservado](../apps/backend/docs/openapi.yaml) y [contrato institucional](../apps/backend/docs/integracion-frontend-entidades.md). El OpenAPI histórico debe cotejarse con este inventario y el código.
