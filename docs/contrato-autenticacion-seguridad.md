# Contrato de autenticación para integrar los otros clientes

Rama: **feat/security**, worktree **D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-security**. Base común: **9a463dbb046e54c7f87cced82b649a2b58d64d36**. Este contrato incorpora cambios de seguridad autorizados; no introduce MFA, otro proveedor OIDC, otra API, otro motor ni móvil.

## Transporte y respuestas conservadas

Las rutas y métodos siguen iguales, con API_PREFIX vigente (local: /api). Login/registro/refresh/OAuth conservan el JSON habitual y los campos token, accessToken, refreshToken, refreshTokenExpiresAt y user. token y accessToken siguen siendo alias. El access se envía como Authorization: Bearer; el refresh continúa como string opaco en el body. No se cambia a cookies en esta fase.

| Operación | Cambio y contrato |
| --- | --- |
| POST /auth/register | Nueva contraseña: mínimo 15 puntos de código Unicode, no solo espacios y no presente en lista local/versionada. Sin límite que impida frases de 64+ caracteres; sin composición obligatoria. Rechazo 400 antes de insertar usuario. Se mantiene rol ciudadano asignado localmente. |
| POST /auth/login | Verifica los hashes históricos salt:key scrypt, sin aplicar la nueva longitud a la contraseña anterior. No se borran ni reescriben hashes. Devuelve una sesión nueva revocable. Una cuenta inactiva no obtiene sesión. |
| PATCH /auth/cambiar-contrasena | Misma solicitud actual. Nueva política de contraseña y confirmación; al cambiar se incrementa auth_version y se revocan los refresh previos. El JWT usado deja de servir en la siguiente petición; iniciar sesión otra vez. |
| POST /auth/reset-password | Misma solicitud token/newPassword/confirmPassword. Política nueva, token temporal de un uso; se invalidan sesiones previas al completar el cambio. |
| POST /auth/refresh | Un solo éxito al competir por el mismo refresh. Mantiene sid de la sesión y rota el refresh; los access todavía vigentes de esa familia siguen válidos hasta expiración/revocación. Refresh inválido, revocado, legacy sin sid o con versión retirada: 401. Cuenta inactiva: 401/403 según la invalidación que se detecte primero. |
| POST /auth/logout, body {refreshToken} | No exige JWT, como antes. Invalida toda la familia de ese refresh, también si el cliente conserva un refresh anterior a una rotación. Respuesta 200 con envoltorio/mensaje anteriores; un hash desconocido no permite revocar otra sesión. No afecta otras familias del mismo usuario. |
| POST /auth/logout, body {allDevices:true} | Requiere JWT activo. Revoca todas las sesiones del titular; no las de otros usuarios. La opción de Settings ahora llama esta operación real. |
| API protegida | Sin Bearer: 401, como antes. Firma/expiración/sesión/estado/versión/rol/entidad inválidos: 403 con mensaje `token inválido o expirado.`. Si MySQL no permite verificar sesión: 503 genérico, sin SQL ni autenticación por fallback. |
| optionalAuth | Conserva semántica pública: token inválido/revocado se trata como anónimo. Esto no concede acceso privado; listado público continúa siendo público. Fallo del almacén: 503. |

Los 400 de contraseña mantienen `{status:'error',message}`. Textos nuevos: `La contrasena debe tener al menos 15 caracteres.` y `La contrasena es comun o conocida como insegura. Elige una frase diferente.`. No usar estos mensajes para inferir que se consultó una base completa de filtraciones.

## Claims y validación de autoridad

El JWT añade **sid** (UUID de sesión) y **ver** (versión de autorización), además de sub/uuid/rol/id_entidad/email e iat/exp. La firma se verifica con HS256. El TTL de acceso predeterminado sigue en 15 minutos; no se alteran las variables de expiración existentes.

En cada petición protegida se consulta, sin caché de autorización, una fila activa/no expirada de refresh_tokens para sid y sub, unida al usuario. Se exige cuenta activa/no borrada, versión del JWT = versión de la sesión = usuarios.auth_version, mismo rol y misma institución. **Validar solamente firma/exp no basta.** No aceptar rol o sid del body como autoridad.

Cambios reales de rol/institución y cambios de activo incrementan auth_version en la misma sentencia SQL; cambios de contraseña también. Una operación que no modifica rol/ámbito/activo no invalida sesiones legítimas. La reactivación o restauración de un rol no resucita JWT antiguos. El cierre individual revoca solo la familia sid. Las decisiones afectan la siguiente solicitud/entrega privada; no cancelan una operación ya autorizada y en curso.

Los servicios de analytics/events y el móvil deben conservar accessToken como opaco y transmitirlo. Al integrarse, pueden verificar el estado con el GET /auth/perfil existente del principal; no deben considerar suficiente decodificar claims o compartir su lógica de privilegios con el body. No se crea un endpoint de introspección nuevo en esta tarea ni se copian secretos de firma a la app móvil. La autenticación interna de los nuevos servicios queda fuera de esta rama.

Socket.IO conserva sus salas/eventos. Ahora valida la sesión al conectar y vuelve a comprobarla antes de entregar cada evento privado. Una conexión abierta con sesión retirada no recibe el payload y se desconecta al intentar la entrega. Esto se probó con dobles de sockets/autoridad, además de la validación SQL real de sesiones en HTTP; no se acredita aquí un cliente Socket.IO real conectado por red.

## Transición de esquema y sesiones anteriores

**Requiere migración 020_add_revocable_sessions.sql antes de arrancar el backend actualizado contra una base existente.** Es aditiva e idempotente: usuarios.auth_version; refresh_tokens.session_id y auth_version; índice de sesión. El esquema completo incorpora los campos solo para bases nuevas. No ejecutar el esquema completo sobre una base existente ni aplicar una cadena histórica completa sobre bootstrap.

No se modificó ninguna base existente en esta tarea. Ensayar la migración sobre un clon respaldado y revisar antes de desplegar. No hay migración automática al iniciar, ni fallback de producción si faltan las columnas.

Los JWT anteriores no contienen una identidad de sesión revocable y los refresh anteriores quedan sin sid. **Se rechazan: el usuario debe iniciar sesión nuevamente.** No se intenta vincularlos por usuario, porque eso cerraría sesiones legítimas independientes o permitiría conservar JWT revocados. Se conservan usuarios, hashes y filas históricas. Las nuevas sesiones son independientes y las rotaciones conservan su familia. No se ofrece rollback inseguro que vuelva a aceptar JWT anteriores.

MySQL conserva la única autoridad. La rotación utiliza FOR UPDATE y transacción, verificando cuenta/versión dentro del bloqueo. Logout revoca la familia completa mediante un UPDATE de autocommit. No se introducen Redis, listas en memoria productivas ni transacciones distribuidas. El fallback en memoria ya existente del modelo se conserva únicamente para pruebas unitarias heredadas; la validación productiva siempre usa SQL y falla cerrada.

## Política de contraseñas y límite del mecanismo

Lista local SecLists de **10001 entradas**, instantánea del commit **913b327317496d062bcc7cace524aaad8a693be2**, con licencia MIT y fuente en `src/modules/identidad/adapters/outbound/data/`. Se agregan ejemplos largos conocidos y repetición de un único carácter. Para comparar se usa NFKC/trim/minúsculas; **no se normaliza ni trunca la contraseña al derivar o verificar su hash**, conservando compatibilidad histórica.

No se envían contraseñas ni hashes a terceros y no se requiere red al establecer contraseña. Es una lista comprobable de contraseñas comunes/inseguras conocidas, **no detección exhaustiva de todas las credenciales comprometidas**. Debe actualizarse de forma versionada. La búsqueda de coincidencia es de contraseña completa, no prohíbe palabras comunes dentro de una frase larga.

El hash mantiene sal aleatoria de 16 bytes, scrypt con clave de 64 bytes y formato salt:key. Cambia de ejecución síncrona a asíncrona y usa timingSafeEqual. No se sustituyen hashes por Argon2id ni se obliga a cambiar una contraseña histórica solo por iniciar sesión; la política se impone al crear/establecer una nueva. MFA sigue pendiente, así que no se reduce el mínimo a ocho.

## Cliente web y manejo de errores

AuthContext.logout devuelve Promise<boolean>. Los consumidores esperan confirmación del servidor para limpiar credenciales/navegar. Si falla red/servidor, mantiene credenciales para reintentar y muestra error, no éxito ficticio. Repetir clic comparte la solicitud pendiente. Si otra pestaña instaló una sesión distinta durante el cierre, no se borran sus credenciales.

El transporte de logout usa Axios sin refresco automático y captura el refresh del cliente. Las rutas proactiva/reactiva comparten una única renovación en vuelo. Durante logout no se inician nuevos refresh, y uno ya iniciado no restaura tokens en localStorage tras comenzar el cierre ni tras cambiar de sesión. Para JWT expirado/inválido, el interceptor admite un único intento de refresh ante 401 o el 403 específico de token; un 403 de permisos de negocio no inicia refresh ni concede privilegios.

Navbar y Settings esperan el resultado; Settings allDevices revoca realmente todas las sesiones. Formularios/textos adoptan 15 caracteres y permiten frases; no cambian colores, layout, rutas ni componentes de diseño. Cookies Secure/HttpOnly/SameSite, HTTPS, almacenamiento seguro móvil, MFA y segundo OIDC continúan pendientes para otras tareas.

## Contratos históricos de reportes

No se regeneraron fixtures. Se mantienen **33/33** respuestas de lectura. Los runners crean sesiones sintéticas válidas; las negativas institucionales usan usuarios/estado de institución reales del sandbox, en vez de claims imposibles de emitir por producción.

Creación conserva **37 equivalencias** y **un cambio intencional**: el escenario histórico con autor inexistente deja de llegar a INSERT/FK/500 y se rechaza en autenticación con 403. Se comprueban las filas/efectos originales restantes. Solo el runner preserva el hueco de autoincremento sintético que consumía ese INSERT fallido, para comparar IDs posteriores sin tocar los fixtures. Esa reserva de ID no existe en código productivo. Nunca afirmar 38 equivalencias idénticas al original después de este cambio.
