# Inventario funcional y visual

Inventario de la auditoría inicial. Los resultados de persistencia, permisos y stack comprobados posteriormente están en la [validación real del sistema](validacion-mysql.md).

“Implementado” significa que existe código y, donde corresponde, pruebas locales. No equivale a una operación acreditada contra datos o proveedores reales. El prompt no proporciona un catálogo funcional adicional: los pendientes se deducen de código/configuración y de la evolución solicitada, sin inventar requisitos de producto.

| Funcionalidad | Evidencia | Estado y límites |
| --- | --- | --- |
| Registro/login/perfil/avatar | Auth/AuthContext, Profile, auth.controller y usuario.model | Implementado; avatar depende de Cloudinary |
| Renovación y cierre de sesiones | Interceptores Axios, refresh-token.model y auth.controller | Implementado; localStorage y revocación preservados |
| Recuperación y verificación de correo/OTP | ForgotPassword, ResetPassword, VerificarEmail y servicios email | Implementado; SMTP real no probado, transporte JSON local |
| Google y Facebook OAuth | Auth, callbacks y servicios OAuth | Implementado; configuración/proveedor real pendiente |
| GitHub OAuth | Login/Register/GitHubCallback históricos | No es flujo activo: no hay ruta GitHub en App ni backend; no declararlo funcional |
| Crear/listar/filtrar/detallar/editar/eliminar reportes | NewReport, FormularioReporte, Reports, ReportDetail y reporte.controller | Implementado; permisos, validación y soft delete; sin prueba de datos real |
| Evidencias múltiples, subcategoría, video/imagen | Formularios, multer, evidencia.model, Cloudinary | Implementado con límites/tipos y validación de contenido; proveedor no probado |
| Análisis/sugerencias por imagen | clasificacion.service y endpoints analizar-imagen/sugerir-contenido | Inferencia HF y fallback existentes; no se entrenó modelo propio |
| Etiquetado y confianza de reporte | ia.service y campos IA en SQL/UI | Heurística local de palabras y severidad; no inferencia entrenada |
| Score de evidencia y deduplicación | evidencia-score.service y hashes SHA-256 | Parcial: exifr ausente; conserva fallback sin EXIF |
| Mapa, clusters y calor | ReportsMap, LocationPicker y geo.js | Implementado con Leaflet/tiles externos; geolocalización depende del navegador |
| Estadísticas y dashboard | Dashboard, charts, stats SQL y TendenciasIACard | Implementado; agregaciones sobre reportes |
| Tendencias, likes y vistas | Trending, LikeButton, like.model y reporte.model | Implementado; caché y control de repetición preservados |
| Zonas de riesgo y alertas cercanas | prediccion.service, useAlertasZona y componentes | Implementado como regla por cuadrícula, severidad, recencia y tendencia; no ML entrenado |
| Chatbot ambiental Aurel | ChatWidget/hooks, chatbot-context/offline/service | Implementado con Groq, Gemini y fallback; contexto/caché en memoria, sin persistencia documental |
| Moderación y ciclo de reporte | Moderacion y updateReporte | Implementado para moderador/admin; estados/transiciones conservados |
| Usuarios/roles/estado | AdminPanel, AdminUsuarios y admin.controller | Implementado, rol admin |
| Catálogo y administración de categorías | categoria-riesgo.routes/controller/model | API CRUD/activación implementada; no hay pantalla dedicada de administración de categorías en App |
| Asignación institucional automática/manual | asignacion-entidades.service, asignarEntidadReporte | Implementado con cinco instituciones priorizadas, principal/apoyo y prioridad |
| Atención por entidad y alertas persistidas | EntidadPanel, entidad.controller y alerta-entidad.model | Implementado; alcance por entidad y lectura de alertas |
| Alertas críticas en tiempo real | config/socket.js y asignación | Servidor implementado; frontend activo utiliza polling, sin cliente Socket.IO |
| Notificaciones in-app y preferencias | CampanaNotificaciones, Settings, useNotificaciones y modelos | Implementado; preferencia de resumen semanal existe, no se encontró scheduler que lo envíe |
| Push Firebase | useFCM, service worker, fcm.service | Parcial: falta dependencia firebase-admin y configuración real; no acreditado |
| Exportar datos | DescargarDatos, reportesPdf, exportReportes | Implementado: PDF cliente, XLSX/CSV backend según flujo |
| Páginas institucionales y legales | Home, PoliticaPrivacidad, TerminosCondiciones | Preservadas sin rediseño |
| Persistencia políglota | Solo mysql2 en backend | MySQL existente; MongoDB/Cassandra/Druid pendientes de decisión/incorporación |
| ML predictivo entrenado | No hay pipeline, dataset versionado ni artefacto de entrenamiento | Pendiente; no implementado en esta fase |

## Rutas visuales activas

| Acceso | Rutas en App.jsx |
| --- | --- |
| Público con Layout | `/`, `/about` (redirige a sección de Home), `/reports`, `/reports/:id`, `/trending`, `/privacidad`, `/terminos` |
| Autenticación/callbacks | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/auth/callback/facebook` |
| Cualquier usuario autenticado | `/verificar-email`, `/dashboard`, `/reports/new`, `/nuevo-reporte`, `/profile`, `/settings` |
| Moderador/admin | `/moderacion` |
| Entidad | `/entidad` |
| Admin | `/admin`, `/admin/usuarios` |
| No encontrada | `*` |

Home redirige a usuarios autenticados a dashboard o panel de entidad. `About`, `Login`, `Register` y `GitHubCallback` permanecen como componentes históricos aunque no se monten como páginas activas. No se eliminaron.

Componentes preservados: Layout/Navbar, ToastContainer/providers, ProtectedRoute, indicador de carga, cropper de avatar, lightbox, medidor de contraseña, formularios, mapas, gráficas, campanas de alertas/notificaciones, tarjetas de tendencias y widget de chat/avatar Aurel. Se conservaron CSS, assets, textos y estructura visual originales.
