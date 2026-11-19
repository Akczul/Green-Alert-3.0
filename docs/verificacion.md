# Informe de consolidación y verificación

**Informe histórico de la fase de auditoría.** Sus limitaciones de MySQL/Docker se resolvieron posteriormente en la [validación real del sistema](validacion-mysql.md). Los resultados de proveedores externos siguen pendientes.

Ejecución local: **18 de noviembre de 2026**, America/Bogota. Windows/PowerShell, Git 2.55.0.windows.3, Node 26.13.0, npm 11.20.0 y Docker CLI 29.8.2. Python no está disponible y no fue necesario. Las versiones de referencia de Docker/CI son Node 24 y MySQL 8.4; no se ejecutaron esas imágenes.

## Resultado entregado

GreenAlert queda consolidado en la carpeta de trabajo, con `apps/backend`, `apps/frontend`, `docs`, `infra`, `scripts`, Compose y CI raíz. Se conserva el backend Express/MySQL y la SPA React, sin reescritura de aplicación ni nuevas bases o ML. Los ocho routers, doce tablas de esquema, servicios externos y pantallas están inventariados. [Estado actual](estado-actual.md), [funcionalidades](funcionalidades.md) y [78 endpoints](endpoints.md).

Se preservan los historiales de ambas ramas main mediante un commit con dos padres y referencias a las ramas originales. Se comprobó que no son clones shallow y que ambos SHA son ancestros. Los directorios de implementación originales (`backend/src`, `routes`, `middlewares`, `frontend/src`, `public`) no tienen diferencias frente al commit de importación. No hay submódulos ni repositorios Git anidados. No se hizo push ni se modificaron los repositorios originales. [Procedencia](procedencia.md).

Cambios concretos: scripts compartidos con directorio de trabajo correcto; setup idempotente con secretos locales; lockfile backend; Node Docker/CI actualizado a una versión soportada; contrato `/api` configurado de forma consistente; healthchecks; proxy Nginx de uploads y Socket.IO; límite multipart del proxy; ejemplo de correo corregido; argumentos públicos Google/Firebase para Docker; corrección de índice inválido en esquema de arranque; exclusión de caché/dist/repomix del seguimiento actual; contrato de prueba contra frontend real; documentación y reglas para próximas tareas.

## Comandos ejecutados

| Comando/acción | Resultado comprobado |
| --- | --- |
| Consultas GitHub de ambos repositorios y árboles main | Acceso correcto a ambos; SHA y fuentes obtenidos |
| Clones mirror completos y fetch local | Historias disponibles; backend/main 250 commits, frontend/main 111 |
| `git read-tree --prefix=...`, `git write-tree`, `git commit-tree ... -p backend/main -p frontend/main` | Importación unida en `105245d216a1567e7bfcd96f3ce74a533ca59bff` |
| `npm install --prefix apps/backend --package-lock-only --ignore-scripts --no-audit --no-fund` | Lockfile inicial generado sin cambiar rangos del manifest |
| `npm ci --prefix apps/backend --no-audit --no-fund` | Instalación correcta, 343 paquetes |
| `npm ci --prefix apps/frontend --no-audit --no-fund` | Instalación correcta, 556 paquetes; lockfile original conservado |
| `npm run install:apps` | Ambas instalaciones repetidas correctamente desde el script compartido |
| `npm run setup` | Tres archivos de entorno locales creados sin imprimir secretos |
| Repetición de setup y comparación de hashes de .env | Archivos existentes conservados, `SetupPreservedExistingEnv=True` |
| `npm test --prefix apps/backend` antes de adaptar contratos | 235/235 pruebas originales pasaron |
| Contrato apuntando al frontend real, antes de actualizar inventario | Detectó 12 llamadas omitidas por el fixture histórico; rutas presentes en backend |
| `node --test apps/backend/tests/unit/frontend-api-contract.test.js` después del ajuste | 4/4 pasan, incluida correspondencia con registros Express reales |
| `npm test` desde raíz | Backend 236/236; frontend 23/23 en 4 archivos; total **259 pruebas** |
| `npm run build:backend` | Sintaxis válida en **125 archivos JS**; sin transpilar |
| `npm run build:frontend` | Bundle Vite generado; 2726 módulos transformados |
| `npm run build` desde raíz | Verificación backend y bundle frontend correctos |
| `npm run lint` | ESLint frontend termina con 0 errores y 0 warnings |
| `npm run test:smoke` | SPA 200, proxy `/api` correcto, health 503 intencional sin MySQL, login inválido 400, perfil sin JWT 401, ruta inexistente 404 |
| `npm run dev` con entornos locales | Vite en 5173 y backend real en 3000; correo JSON validado; conexión MySQL no disponible |
| HTTP contra procesos de dev reales | `/` de Vite 200; `/api/health` directo y por proxy 503; login vacío por proxy 400 |
| Detención de procesos de dev y consulta de puertos | Procesos propios detenidos; puertos 3000/5173 sin listeners de esta prueba |
| `npm run docs:inventory` | 78 registros HTTP, versiones y nombres de variables generados sin valores |
| `npm run infra:config` | `docker compose config --quiet` correcto, sin imprimir secretos |
| `docker info --format '{{.ServerVersion}}'` | Falló: no existe el pipe del motor Docker Desktop Linux; Docker Desktop no está instalado en la ruta estándar |
| `git merge-base --is-ancestor backend/main main` y equivalente frontend | Ambos terminan con 0 |
| `git rev-parse --is-shallow-repository` | false |
| `git diff --quiet` sobre directorios originales de implementación | 0, sin cambios de código de aplicación |
| `git diff --check` | Correcto tras eliminar líneas vacías sobrantes de ejemplos |
| `git check-ignore` sobre .env, node_modules, uploads/artefactos | Configuración local y artefactos quedan excluidos |

Los logs completos de instalación/build/pruebas se conservan fuera del repositorio en `C:\Users\Akczul\.codex\tmp\greenalert-audit-20261118`. No se versionan logs que puedan contener información del entorno.

## Advertencias observadas

Instalación backend: dependencias transitivas deprecadas (inflight, glob, rimraf, q, fstream, uuid, entre otras). npm 11 avisa sobre scripts de instalación no aprobados por su política local; no se cambiaron políticas globales. Build/smoke funcionaron en esta instalación. Browserslist informa datos antiguos. Vitest 4 muestra advertencias esbuild/oxc relacionadas con el plugin React de Vite 5; las pruebas pasan. No se actualizaron bibliotecas ni se ejecutó `npm audit fix`.

## Lo que no está verificado

- **MySQL y esquema:** no hay motor Docker ni servidor MySQL local disponible. No se ejecutó DDL, procedimientos, semillas, las 18 migraciones o CRUD real. La corrección SPATIAL se fundamenta en el requisito NOT NULL de [MySQL](https://dev.mysql.com/doc/refman/8.4/en/creating-spatial-indexes.html), pero el esquema completo necesita prueba real.
- **Imágenes y Nginx:** configuración Compose validada; builds, healthchecks de contenedores, configuración Nginx y stack completo no ejecutados.
- **Servicios externos:** no hubo SMTP real, OAuth Google/Facebook, Cloudinary, Firebase ni inferencia HF/Groq/Gemini. No se proporcionaron credenciales ni se simularon resultados productivos.
- **FCM y EXIF:** imports opcionales de firebase-admin/exifr sin dependencia declarada; funcionalidad parcial heredada, no resuelta instalando bibliotecas durante la auditoría.
- **Flujos integrales de negocio:** suites unitarias usan dobles, y smoke acredita HTTP/proxy sin persistencia. No demuestran alta completa, exportación con datos reales, carga de evidencia o entrega remota de alertas.
- **CI remota/Node 24:** workflow preparado, sin push ni ejecución en GitHub; runtime de referencia no probado aquí.
- **Seguridad:** no se hizo pentest ni auditoría exhaustiva de todos los commits/credenciales/dependencias.

## Próximo paso concreto

Completar la validación SQL con datos sintéticos y resolver la taxonomía. Después extraer `ConsultarZonasRiesgo` mediante puertos de lectura, reloj y caché, conservando algoritmo, permisos y respuesta. Mantener Express/MySQL y la SPA mientras se elimina acoplamiento de un caso de uso cada vez. [Plan detallado](plan-migracion.md).
