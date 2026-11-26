# Cumplimiento del instructivo del proyecto final (rama feat/cumplimiento-docente)

Actualización Android: consultar [misión 01](cierre-definitivo/01-sincronizacion-android.md) y [manifiesto vigente](evidencias-integracion/apk.json). Las cifras y verificaciones de otros módulos de esta matriz corresponden a la fase original; esta misión no rehace la auditoría docente. Compilación, firma y pruebas automatizadas se distinguen de instalación y aceptación en hardware.

Matriz de los requisitos del instructivo de Programación Avanzada – Bases de Datos No Relacionales frente al código de esta rama. «Cumple» significa que hay código **y** prueba o evidencia reproducible; lo que depende de terceros o de un dispositivo físico se marca aparte. Base: `feat/integracion-final` (b21e47e).

## Resumen de brechas cerradas en esta fase

| Brecha | Solución | Dónde | Evidencia |
|---|---|---|---|
| APK instalable | Compilación en Linux dentro de Docker (evita el límite Win32 de Ninja/CMake); servidor configurable desde la app | `apps/mobile/docker/apk.Dockerfile`, `scripts/build-apk-docker.mjs`, `apps/mobile/src/AuthScreen.jsx` | `.local/apk/greenalert.apk` + `apk.json` (hash, commit, firma `apksigner`); `docs/evidencias-integracion/apk.json` |
| Superadministrador / administrador de ámbito / usuario común | Nivel `global`/`ambito` sobre el rol `admin`, ámbito comunidad u organización, permisos por objeto, último superadministrador protegido con bloqueo | `src/modules/administracion/`, migración `024_admin_hierarchy.sql` | 15 pruebas unitarias + 5 comprobaciones con MySQL real en `npm run test:seguridad` (27/27) |
| Primer superadministrador por inicialización controlada | CLI de operador; se niega si ya existe uno; auditado | `apps/backend/scripts/crear-superadmin.mjs`, `npm run infra:final:superadmin` | Comprobación «Primer superadministrador solo por inicialización controlada y una sola vez» |
| Auditoría sin borrado | `admin_audit` (autor, antes/después) en la misma transacción; triggers impiden UPDATE/DELETE en `admin_audit` y `security_audit` | migración 024, `mysql-administracion.js` | Comprobación «nadie la borra ni modifica» |
| Segundo proveedor OIDC | Microsoft Entra ID con cliente OIDC genérico: PKCE S256, state/nonce, JWKS RS256, iss/aud/exp | `src/modules/identidad-federada/`, migración 025, `GET /auth/microsoft/url` y `/callback` | `tests/unit/oidc-microsoft.test.js` (9 pruebas con proveedor simulado y claves RSA reales) |
| MFA con autenticación federada | El callback de un administrador no emite sesión; la web pide TOTP y el canje lo verifica (5 intentos) | `auth.controller.js` (`completeFederatedLogin`), `OAuthCallback.jsx` | Contrato OpenAPI `/auth/oauth/exchange` |
| HTTPS y cookies Secure/HttpOnly/SameSite | Nginx TLS 1.2+ con HSTS en 8443; 8080 redirige la web; tokens web en cookies `__Host-` | `apps/frontend/nginx/`, `web-session.js`, `compose.apps.yml` | `tests/unit/web-session-cookies.test.js`; prueba de imagen (200 TLS, 308 HTTP→HTTPS, HSTS) |
| CSRF con cookies | Doble envío `__Host-ga_csrf` ↔ `X-CSRF-Token` en toda escritura autenticada por cookie | `web-session.js`, `apps/frontend/src/services/api.js` | Pruebas backend (403 sin/ con token distinto) y frontend (cabecera en escrituras) |
| Dos Compose unidos por red externa | Proyectos independientes `greenalert-final` (datos) y `greenalert-final-apps` (apps); sin `depends_on` cruzado | `compose.datos.yml`, `compose.apps.yml`, `scripts/infra-final.mjs` | `npm run infra:final:config` valida cada archivo por separado; orden en `docs/integracion-final.md` |
| Dockerfile del backend principal | Multietapa, Node 24.11.1 fijado, usuario `node`, `npm ci --omit=dev` | `apps/backend/Dockerfile` | `id -u` = 1000 en la imagen |
| Hexagonal en el backend principal | Nuevos módulos `administracion` e `identidad-federada` (dominio y aplicación sin Express/mysql2/entorno, verificado por prueba) además de zonas, lectura/creación de reportes, identidad e integración | `apps/backend/src/modules/*`, `src/bootstrap/*` | Pruebas de arquitectura en cada módulo |

## Matriz por sección del instructivo

| Requisito | Estado | Evidencia / límite |
|---|---|---|
| 3 backends con tecnologías diferenciadas | Cumple | Express (Node), FastAPI (Python), Spring Boot (Java) |
| Principal con dominio, casos de uso, puertos y adaptadores | Cumple con alcance declarado | 7 módulos hexagonales; módulos heredados restantes (moderación, asignaciones, evidencias, alertas, chatbot) siguen por capas, documentado en `docs/arquitectura-objetivo.md` |
| Web con framework | Cumple | React 18 + Vite |
| App móvil instalable conectada a la API | Cumple (artefacto) / pendiente (dispositivo) | APK firmada y verificada; la instalación física y el recorrido en teléfono se hacen en la sustentación (`adb install -r`) |
| 5 motores: 3 NoSQL, 1 relacional, 1 analítico | Cumple | MongoDB, Cassandra, Redis; MySQL; Druid |
| Concurrencia o paralelismo en cada backend | Cumple | Node: async con límites/timeouts y outbox por lotes; Python: pool de procesos; Java: `ThreadPoolTaskExecutor`; mediciones en `docs/evidencias-integracion/medicion.json` |
| Dos Compose + red externa + orden de inicio | Cumple | Ver arriba |
| `.dockerignore`, versiones fijadas, multietapa, sin root, `.env.example` | Cumple | Backend, analytics, events y web |
| ≥10 pruebas automatizadas | Cumple | Backend 375, frontend 30, móvil 58, seguridad MySQL 27 |
| OpenAPI de las API HTTP | Cumple | `apps/backend/docs/openapi.yaml` (79 rutas), `apps/analytics/evidence/openapi.json`, `apps/events/evidence/openapi.json` |
| Inicio local + 2 proveedores externos OIDC | Cumple en código / pendiente de credenciales reales | Google y Microsoft; Microsoft requiere registrar la app en Entra ID (`MICROSOFT_*`). Facebook es OAuth 2.0 y no se cuenta |
| Contraseña ≥15, frases ≥64, comunes rechazadas, sal + hash adaptable | Cumple | scrypt con sal (hash adaptable aceptado; Argon2id es la preferencia del instructivo, no obligatorio) |
| Límite de intentos, recuperación segura, MFA admin | Cumple | `express-rate-limit`, reset de un solo uso, TOTP AES-256-GCM |
| JWT breve + renovación + revocación; inactividad y absoluta | Cumple | 15 min, rotación, `session_activity` 1800 s / 604800 s |
| Web: HTTPS + cookies Secure/HttpOnly/SameSite + CSRF | Cumple | Certificado autofirmado de laboratorio; en producción usar uno de confianza |
| Móvil: almacenamiento seguro | Cumple | SecureStore |
| Superadmin / admin de ámbito / usuario común; permisos por API y objeto | Cumple | 403/404 por objeto probados contra MySQL real |
| Registro de cambios de rol, accesos administrativos y autor | Cumple | `admin_audit` + `security_audit` |
| Unicidad con índice y altas simultáneas | Cumple | `email` UNIQUE, `(provider, subject)` UNIQUE; conflictos 409; renovación concurrente probada |
| Redis: cache-aside, TTL, invalidación, métricas | Cumple | `redis-cache.js`; métricas ahora solo para superadministrador |
| Guía de marca, accesibilidad, microinteracciones | Parcial | `apps/mobile/docs/marca.md` e informe; faltan capturas móviles reales y comprobación de teclado documentada |
| Informe PDF + editable, 11 componentes, APA, trazabilidad | Pendiente de regenerar | `docs/entrega/` corresponde a b21e47e; regenerar con `scripts/build-academic.mjs` tras el commit final y revisar si el docente exige .docx |
| ZIP + APK + enlace y commit en Moodle | Pendiente del commit final | `node scripts/package-delivery.mjs` desde árbol limpio |

## Cómo verificarlo

```powershell
npm.cmd test                    # backend + frontend
npm.cmd --prefix apps/mobile test
npm.cmd run lint
npm.cmd run test:seguridad      # MySQL real en Docker: 27 comprobaciones
npm.cmd run infra:final:config  # cada Compose por separado
npm.cmd run setup:integracion   # genera .env.integracion y certificado TLS local
npm.cmd run infra:final:up      # datos y luego apps; abrir https://localhost:8443
npm.cmd run apk:docker          # APK en .local/apk
```
