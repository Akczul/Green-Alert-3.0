# Procedencia e historial de la consolidación

Fuentes remotas comprobadas y descargadas completas, sin push:

| Aplicación | Repositorio original | Rama | Commit importado | Commits alcanzables desde main |
| --- | --- | --- | --- | --- |
| Backend | [Green-Alert/Backend](https://github.com/Green-Alert/Backend) | main | `62e09d2572796f559b6df84cd1a55e8a2dc6af7c` | 250 |
| Frontend | [Green-Alert/Frontend](https://github.com/Green-Alert/Frontend) | main | `68fb9ee1362a624bb9594af61610bd08a749b124` | 111 |

Ubicación del monorepositorio **GreenAlert**: `D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0`. Se reutilizó la carpeta de trabajo vacía proporcionada, sin crear una carpeta extra. Nombre de paquete raíz: `greenalert`; nombre del proyecto Compose: `greenalert`.

Se encontró además `D:\Juan Diego\7. Septimo Semestre\Arquitectura de Software\Green_Alert`, cuyo remoto es `Pituquinos/Green-Alert`. Es un proyecto distinto (NestJS, versión 2.0.0); solo se consultaron manifest/remoto/estado. No se mezcló con las fuentes solicitadas y no se modificó.

## Método

Las fuentes Git se descargaron como mirrors temporales fuera del workspace, bajo `C:\Users\Akczul\.codex\tmp\greenalert-audit-20261118`. Las primeras transferencias fueron lentas; se reintentó Git con HTTP/1.1 y backend TLS OpenSSL, además de archivos ZIP fijados al SHA. La importación final usa los objetos Git completos, no una integración simulada de ZIPs.

En el repositorio nuevo se importaron las ramas bajo `refs/remotes/backend/*` (112) y `refs/remotes/frontend/*` (60). `git read-tree --prefix=apps/backend/` y `--prefix=apps/frontend/` construyeron el árbol de las dos aplicaciones. El commit **`105245d216a1567e7bfcd96f3ce74a533ca59bff`** contiene los dos SHA originales como padres. No se reescribieron los commits originales. No se configuró remoto de publicación para este monorepositorio.

El árbol inicial reproduce las fuentes bajo sus prefijos. Después se aplicaron exclusivamente cambios de consolidación/configuración/documentación y una actualización de pruebas de contrato. Los directorios de código `backend/src`, `backend/routes`, `backend/middlewares`, `frontend/src` y `frontend/public` conservan su contenido original; la comprobación contra el commit de importación no muestra diferencias.

No hay Git anidados, gitlinks/submódulos ni enlaces simbólicos requeridos. Los artefactos `apps/backend/.npm-cache`, `apps/backend/repomix-output.xml` y `apps/frontend/dist` dejan de estar versionados en la revisión final; continúan recuperables desde el commit de importación y sus historiales. No se borraron componentes ni fuentes. La copia `apps/backend/Frontend/src/services/api.js` se conserva por trazabilidad, pero no es el cliente activo.

## Consultar la historia

```sh
git log --graph --oneline main
git log backend/main -- src/controllers/reporte.controller.js
git log frontend/main -- src/App.jsx
git show backend/main:src/app.js
git show frontend/main:src/App.jsx
```

Para cambios posteriores a la importación, consultar `git log -- apps/backend/src` o `git log -- apps/frontend/src`. Antes de la importación, usar las referencias originales porque las rutas todavía no tenían el prefijo `apps/`; conservar hashes no reescribe esas rutas históricas.

Comprobar ascendencia:

```sh
git merge-base --is-ancestor backend/main main
git merge-base --is-ancestor frontend/main main
git rev-parse --is-shallow-repository
```

Los dos primeros deben finalizar con 0; el tercero devuelve `false`. No se publicaron commits, ramas, PR ni cambios en los repositorios originales. Los originales remotos y el otro checkout local permanecen intactos.
