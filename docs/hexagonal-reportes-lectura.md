# Fase 4 — Consultas de reportes ambientales

Se extrajeron cuatro operaciones de lectura conservando el contrato documentado **antes** del refactor en [contrato-consulta-reportes.md](contrato-consulta-reportes.md), con referencia `6e6f5d1`. No se migraron escrituras, moderación, asignaciones, exportación, estadísticas ni gestión de evidencias. El piloto de zonas sigue intacto.

## Operaciones y compatibilidad

| Endpoint (con API_PREFIX vigente) | Autenticación | Caso de aplicación |
| --- | --- | --- |
| GET /reportes | JWT opcional; rama institucional existente | listar |
| GET /reportes/mis-reportes | JWT obligatorio | propios |
| GET /reportes/:id | JWT opcional; asignación obligatoria para entidad | detalle |
| GET /reportes/trending | JWT opcional | tendencias |

Las rutas y middleware originales no cambiaron. Se conservan filtros, coerciones, paginación, proyecciones distintas, orden SQL, errores y envoltorios JSON. La búsqueda de texto sigue siendo local en React; no se añadió búsqueda SQL. Las coordenadas mantienen tipos/valores y orden de ejes; no se cambió SQL espacial ni esquema.

Se preservaron particularidades que requieren una futura decisión de producto: metadata distinta del límite SQL para `limit=1e2`; estado/municipio ignorados en la rama institucional; tendencias sin restricción institucional; primera imagen de mis reportes sin filtro de evidencia borrada, mientras el detalle sí lo aplica. Corregirlas aquí habría cambiado contratos.

## Estructura y responsabilidades

```text
apps/backend/src/
  bootstrap/reportes-lectura.js
  modules/reportes-lectura/
    domain/reportes.js
    application/
      ports.js
      consultar-reportes.js
    adapters/
      inbound/express-controller.js
      outbound/
        mysql-reportes-reader.js
        legacy-relations-reader.js
        legacy-view-recorder.js
```

- Dominio: funciones puras para normalización ya existente, likes y proyección pública de autor. No se crearon entidades vacías.
- Aplicación: fábrica `createConsultasReportes`, con cuatro operaciones y errores semánticos. Coordina filtros, permisos institucionales, relaciones y el orden del efecto de vistas; no conoce HTTP, SQL, modelos, entorno ni pool.
- Puertos de salida, documentados con JSDoc: `ReportesReader` (seis lecturas y conteos), `ReporteRelationsReader` (institución, asignación, autor, evidencia y likes), `ReporteViewRecorder` (efecto heredado del GET detalle).
- Adaptador MySQL: contiene una sola implementación de las seis consultas extraídas, sus joins/subconsultas, parámetros y transformaciones. Recibe el pool compartido; no crea conexiones globales nuevas.
- Adaptador de relaciones: recibe los modelos heredados de entidades, asignaciones, evidencias, usuarios y likes. Los delega sin migrar dichos módulos.
- Adaptador de vistas: conserva throttle anónimo por IP/agente/reporte y reloj inyectado; delega las escrituras existentes sin modificar su SQL. El detalle devuelve el contador anterior al incremento, igual que antes.
- Adaptador Express: traduce request a objetos simples y errores semánticos a 401/403/404. Los errores de infraestructura pasan al manejador existente.
- Bootstrap: construye explícitamente adaptadores y casos e inyecta dependencias por fábricas, igual que el piloto. El controlador original reexporta los handlers; `ReporteModel` conserva métodos delegados y reexporta normalizadores para consumidores existentes.

## Flujo e inversión de dependencias

Express/ruta y middleware → handler → caso de uso → puertos inyectados → adaptadores MySQL/heredados → respuesta original. En detalle, se comprueba primero el alcance institucional, se lee el reporte, se registra vista y se agregan likes/evidencias/autor. En listado institucional se conserva el lector de asignaciones existente.

La aplicación define lo que necesita; los adaptadores satisfacen esos contratos estructurales. Solo bootstrap conoce implementaciones concretas. Las pruebas de aplicación usan resultados grabados y dobles, sin importar ni abrir MySQL. Los normalizadores antes importados desde el modelo ahora pertenecen al dominio, manteniendo reexportaciones compatibles.

## Caracterización y pruebas ejecutadas

Antes de tocar fuentes del backend se capturaron **33 escenarios** contra Express original y MySQL Docker aislado: filas sintéticas, fechas/SQL NOW/reloj controlados, JWT de distintos roles y coordenadas de longitud fuera del rango de latitud. Fixture: `apps/backend/tests/fixtures/reportes-lectura/contrato.json`. Incluye respuestas, códigos, contador persistido de vistas y trazas de lecturas originales para las pruebas unitarias. La comparación posterior exige igualdad profunda, incluido el orden de arrays, sin descartar campos de respuesta.

| Comando desde raíz | Resultado |
| --- | --- |
| npm test | 292 backend + 23 frontend = **315**, cero fallos/omitidas |
| npm run test:reportes:lectura | **33/33** respuestas/códigos/vistas equivalentes al original, MySQL 8.4.11 real |
| npm run test:mysql:docker | **57/57**, incluye regresión de zonas, escrituras, permisos y migraciones |
| npm run test:stack | **8/8**, Compose real MySQL/Express/SPA-Nginx; listado filtrado, propios, tendencias y detalle por /api |
| npm run build | Sintaxis backend y bundle React correctos |
| npm run lint | Correcto, cero warnings ESLint |
| npm run test:smoke | Correcto; prueba de proxy/HTTP sin persistencia |

Se añadieron 37 pruebas: 30 casos de aplicación caracterizados, dos casos adicionales de error, tres de adaptadores/independencia arquitectónica y dos de contrato HTTP con fallos de infraestructura/ausencia. Se adaptaron cuatro archivos de pruebas existentes a la nueva composición/ubicación del SQL conservando sus aserciones. Una aserción de código fuente inicialmente falló al buscar una proyección SQL en el modelo anterior; ahora inspecciona el adaptador real.

Entorno local Node 26; stack Docker Node 24. En esta fase no se repitió MySQL nativo 8.0.46 (su validación anterior sigue documentada). Los warnings existentes de Vite/Vitest y Browserslist no impidieron build/tests; no se actualizaron dependencias como parte de esta extracción. No se ejecutó navegación visual interactiva ni proveedores remotos.

El runner usa `scripts/mysql-sandbox.mjs`, contenedor/puerto/base/credenciales propios y retira solo sus recursos, sin volumen persistente. No usa la base del .env ni MySQL80. Basta tener Docker Engine iniciado y ejecutar `npm.cmd run test:reportes:lectura` en PowerShell; no se requiere configuración manual adicional. Los informes locales están en `.local/mysql-validation/` (ignorados). CI incorpora el mismo comando, pero no se ejecutó CI remoto ni se hizo push.

`--capture` es solo para caracterización histórica: exige fuentes backend iguales a `6e6f5d1` y escritura exclusiva de fixture nuevo. No regenerar el fixture desde la implementación nueva para ocultar regresiones.

## Archivos y dependencias pendientes

Además del módulo y bootstrap anteriores: `src/controllers/reporte.controller.js`, `src/models/reporte.model.js`; pruebas `likes-vistas-trending`, `optional-auth`, `reporte-evidencias-subcategoria`, `reporte-pagination-total`; nuevas pruebas `reportes-lectura-{casos,adaptadores,http}`, helper `tests/helpers/reportes-controllers.js` y fixture; scripts `reportes-read-worker.mjs`, `validate-reportes-read.mjs`, ampliación de `validate-stack.mjs`; comando en `package.json` y paso CI. Se actualizaron contrato, plan, README, AGENTS y referencias de estado/arquitectura. No cambiaron frontend, rutas, lockfiles, esquema ni migraciones.

Permanecen heredados los modelos de relaciones y su SQL, la persistencia de vistas, los métodos delegados usados por otros controladores, el pool global de composición y los middleware HTTP. Estadísticas/exportaciones/categorías pueden seguir invocando métodos compatibles del modelo; no se extrajeron sus casos. Los puentes evitan duplicar consultas y permiten retirar el modelo gradualmente, sin migrar módulos ajenos.

Para replicar el patrón: caracterizar un contrato con datos controlados, extraer reglas puras y casos con puertos mínimos, mover SQL a un adaptador inyectado, conservar puentes para consumidores existentes, componer explícitamente y comparar respuestas/efectos antes y después. Las escrituras necesitan su propia revisión de transacciones y efectos externos. **Esta entrega termina en las cuatro lecturas anteriores; no inicia otra migración.**
