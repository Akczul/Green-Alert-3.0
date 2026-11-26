# Seguridad crítica y preparación de worktrees

## Preparación verificada antes de modificar código

Repositorio de integración: `D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0`, rama main. Base estable común: **9a463dbb046e54c7f87cced82b649a2b58d64d36**. Inicialmente solo había el checkout principal y `docs/requisitos/` sin seguimiento; se conservaron esos archivos.

| Worktree solicitado | Rama | SHA inicial |
| --- | --- | --- |
| D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-security | feat/security | 9a463dbb046e54c7f87cced82b649a2b58d64d36 |
| D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-analytics | feat/analytics | 9a463dbb046e54c7f87cced82b649a2b58d64d36 |
| D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-events | feat/events | 9a463dbb046e54c7f87cced82b649a2b58d64d36 |
| D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-mobile | feat/mobile | 9a463dbb046e54c7f87cced82b649a2b58d64d36 |

Los checkouts creados por la herramienta quedaron inicialmente en C:. Git no pudo moverlos entre volúmenes (Improper link); se movieron con Move-Item sobre rutas exactas comprobadas y se repararon con git worktree repair. No se sobrescribieron carpetas/ramas. Otros worktrees que aparecieron durante el trabajo se conservaron. Se comunicaron las cuatro rutas/ramas/base antes de implementar seguridad. Desde entonces solo se escribieron fuentes en el worktree security; otros agentes pueden haber avanzado sus ramas, lo que no cambia su base inicial.

El PDF original permanece en el principal, sin modificar ni añadir al commit de seguridad. SHA-256 previo: **D6A76D4676724FE9EE568174BFF1868C0F7CED845C4CE4A95BE62119AE425769**. No se copió ni eliminó. No hay push ni merge con main.

## Correcciones y arquitectura

Se corrigen los cuatro hallazgos del chat A: política débil de nuevas contraseñas, access JWT válido después de logout, privilegios de usuarios desactivados/degradados y cierre solo local en web. El contrato para otros clientes y la transición se detallan en [contrato-autenticacion-seguridad.md](contrato-autenticacion-seguridad.md).

```text
apps/backend/src/
  bootstrap/seguridad.js
  modules/identidad/
    domain/seguridad.js
    application/seguridad.js
    adapters/
      inbound/auth-middleware.js
      outbound/mysql-session-reader.js
      outbound/passwords.js
      outbound/data/ (lista local, fuente y licencia)
```

Dominio define errores/validaciones puras y condiciones de sesión. Aplicación recibe puertos de tokens, usuarios, sesiones, identificadores y lista de contraseñas. Casos: verificar acceso, iniciar sesión, validar nueva contraseña y revocar una/todas las sesiones. Ninguno importa Express, JWT, MySQL, modelos o entorno. Bootstrap conecta códec JWT, SQL reader, métodos del modelo de refresh existente y adaptador de contraseña; el middleware Express traduce estados/errores. El controlador auth heredado conserva correo/OAuth/perfil y coordina los casos nuevos; no se presenta todo identidad como migrado.

El estado se valida contra MySQL sin caché por petición. sid identifica familia independiente; ver y auth_version detectan retiro de permisos/estado/contraseña. Cambios de rol/institución/activo incrementan versión de manera atómica con el cambio del usuario; guardar sin cambios no invalida sesiones. Refresh se rota con transacción/FOR UPDATE, logout revoca una familia completa sin tocar las otras. La consulta de autorización falla con 503 ante indisponibilidad del store. Socket también verifica antes de entregar información privada a conexiones abiertas.

Migración **020_add_revocable_sessions.sql**, aditiva/idempotente, ensayada solo en bases sintéticas. El esquema completo sigue teniendo 12 tablas/17 FKs. No se migraron bases del usuario. Los hashes scrypt previos permanecen válidos, con derivación asíncrona para nuevos hashes/verificaciones. Se requiere reautenticación para JWT/refresh anteriores sin sid; no se debilita revocación para compatibilidad con un token imposible de vincular a sesión.

## Pruebas ejecutadas

| Comando desde raíz security | Resultado |
| --- | --- |
| npm test | **367 aprobadas: 339 backend + 28 frontend**, cero fallos/omitidas |
| npm run test:seguridad | **22 comprobaciones reales** Express/MySQL 8.4.11 aislado |
| npm run test:mysql:docker | **58/58**, incluida migración 020 y regresión existente |
| npm run test:reportes:lectura | **33/33** equivalentes a fixtures originales |
| npm run test:reportes:creacion | **38 escenarios comprobados: 37 equivalentes + 1 rechazo anticipado de seguridad documentado** |
| npm run test:stack | **8/8**, MySQL/Express/React-Nginx real, Node 24 |
| npm run build | Sintaxis backend y bundle frontend correctos |
| npm run lint | Cero warnings ESLint |
| npm run test:smoke | HTTP/proxy/validación correcto; no prueba persistencia |

Las 22 comprobaciones acreditan: migración repetida, contraseña corta/común larga rechazada, frontera 14/15, frase mayor de 64 sin truncar, dos sesiones independientes, logout+refresh rechazado, renovación concurrente de un solo ganador sin destruirlo, logout con refresh anterior a rotación, cambio/reset con política y revocación, administrador degradado, usuario primero válido luego desactivado/reactivado, actualización de rol sin cambio, logout global, carrera logout/refresh sin resucitar familia ni afectar otra, JWT legacy rechazado, hash histórico intacto y store caído que rechaza con 503. El runner crea base/usuario/puerto propios, no acepta una base arbitraria, usa correo JSON y no utiliza proveedores reales. Logs ignorados: security-*.log y .local/mysql-validation/security.json.

Se añadieron 15 tests backend (caso, política, adaptadores/Socket e independencia) y cinco frontend (logout, error/reintento, cierre global, transporte y refresh en vuelo). Los tests de otros módulos inyectan explícitamente autenticación para aislar su contrato; no hay excepción de NODE_ENV ni bypass en middleware productivo. Se adaptaron tests de password/refresh/Socket al nuevo mínimo y sesión, manteniendo aserciones y escenarios anteriores. No se borraron fixtures ni pruebas para obtener verde. Node 26 requiere Storage simulado en esas pruebas de navegador; no se cambió almacenamiento productivo por ese detalle del runner.

No se verificaron proveedores externos ni cliente Socket.IO real por red; entrega Socket está probada con dobles y la autoridad SQL con HTTP real. No se hizo benchmark de rendimiento ni se acredita MFA. Los servicios/contenedores de otros agentes no forman parte de estos resultados y no se detuvieron.

## Reproducción en Windows

En PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-security'
npm.cmd run install:apps
npm.cmd run test:seguridad
npm.cmd test
npm.cmd run test:mysql:docker
npm.cmd run test:reportes:lectura
npm.cmd run test:reportes:creacion
```

Docker Engine debe estar disponible; los runners inician y retiran únicamente su proyecto aislado. Si Docker Desktop está detenido y está instalado por usuario:

```powershell
Start-Process -FilePath "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe" -WindowStyle Hidden
docker info
```

No es necesario iniciar MySQL80 ni apuntar a bases existentes. Para stack completo, usar npm run setup (no sobrescribe .env) y npm run test:stack. No iniciar esta rama contra una base anterior sin ensayar/revisar migración 020 en un clon respaldado. El despliegue de migraciones sobre datos existentes no se ejecutó como parte de esta tarea.

## Archivos modificados y pendientes

Producción backend: módulo/bootstrap anteriores; middlewares/auth.middleware.js; config/socket.js; controllers/auth.controller.js; models/refresh-token.model.js y usuario.model.js; utils/constantes-validacion.js; DATABASE_SCHEMA_COMPLETE.sql y migración 020. Se mantiene una sola implementación de contraseña y persistencia de refresh, con compatibilidad de métodos existentes.

Frontend: AuthContext, services/api, Navbar, Settings, Auth/Register/Profile/ResetPassword, PasswordStrengthIndicator y texto de términos. Son cambios de validación/transporte/sesión, sin rediseño. Nuevas pruebas de contexto/API y helper Storage de pruebas.

Verificación: tests unitarios afectados, nuevos seguridad-caso y helper de autenticación de contratos; validate-security.mjs y test-session-fixtures.mjs; adaptación de runners de lectura/creación; comando npm y paso CI. Documentación: este informe, contrato, OpenAPI y README. El listado exacto completo es el diff del commit de feat/security respecto a la base común indicada arriba.

Pendiente fuera de alcance: MFA, segundo OIDC, superadministrador/segundo nivel/auditoría durable, HTTPS/cookies/CSRF, caducidad por inactividad y máxima de familia, limpieza de filas expiradas y store compartido de rate limit, autenticación interna de nuevas APIs/móvil y ampliación/actualización de la lista de contraseñas comprometidas. No se declara cerrado el cumplimiento integral del instructivo. Se detiene el trabajo tras seguridad; no se fusiona con main ni se avanza a esos módulos.
