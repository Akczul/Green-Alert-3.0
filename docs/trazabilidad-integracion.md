# Trazabilidad de la integración final

La matriz siguiente registra la integración histórica. Para sincronización, publicación y Android sobre `ef06a11`, prevalecen [misión 01](cierre-definitivo/01-sincronizacion-android.md) y [apk.json](evidencias-integracion/apk.json). La evidencia negativa de Windows se conserva por separado; no debe confundirse con el estado vigente. No se recalculó la auditoría de 227 criterios.

Esta matriz complementa la auditoría histórica de 227 filas. No recalcula porcentajes ni concede cumplimiento a una fila amplia por implementar una parte. Los resultados actuales se generan en docs/evidencias-integracion; si allí figura un fallo, prevalece sobre una expectativa de este documento.

| Requisito o componente | Código o artefacto | Evidencia y alcance | Límite |
| --- | --- | --- | --- |
| Integrar cuatro ramas conservando historial | Cuatro merges en feat/integracion-final | git merge-base --is-ancestor por rama | Sin push ni merge en main |
| Tres backends diferentes | apps/backend, apps/analytics, apps/events | Compose global y operaciones de negocio | Proveedores externos no acreditados |
| Cinco motores funcionales | compose.datos.yml, compose.apps.yml | Aceptación: reportes, ejecuciones, historial, agregados y caché | Druid se actualiza por reconciliación explícita |
| Web React y cliente móvil nativo | apps/frontend, apps/mobile | Build, lint y tests; APK según manifest final | Una APK compilada no acredita un teléfono |
| Cache-aside Redis | Adaptador redis-cache.js y cache_generation | Hits, misses, TTL, caída y modificación de origen | Métricas locales, no agregadas |
| Mensajería durable | integration_outbox y triggers | Caída/reintento, IDs persistidos y Cassandra idempotente | Al menos una entrega; sin atomicidad distribuida |
| Comunicación protegida | bootstrap/integracion.js, adapters HTTP | Permisos por rol/objeto, 401 interno sin token, timeouts | Red Docker privada; TLS interno pendiente |
| Sesiones y contraseñas | identidad, migraciones 020 y 022 | Suite seguridad y aceptación sesión | Web mantiene localStorage |
| MFA administrativa | admin-mfa.js, migración 023, CLI de operador | RFC 6238, antireplay, login admin con/sin factor | Recuperación manual; federación admin sin challenge de segundo factor |
| Auditoría crítica | security_audit y middleware | Autor y operaciones persistidas | Ventana de crash entre mutación y auditoría HTTP |
| Jerarquía administrativa completa | Roles heredados admin/moderador/entidad/ciudadano | Controles actuales conservados | PENDIENTE superadministrador y admin general por ámbito |
| Segundo OIDC y HTTPS/cookies | Integraciones heredadas de proveedores | Solo documentación/configuración heredada | PENDIENTE aceptación externa y flujo seguro de cookies |
| Tres mecanismos avanzados | Promise.all, Redis, transacción/LWT/outbox | Tests y mediciones de negocio | Muestras locales; no prometer speedup universal |
| Concurrencia de cada backend | Express E/S, FastAPI ProcessPool, Spring pool acotado | Mediciones actuales y evidencia heredada fechada por servicio | Diferenciar pruebas actuales de benchmarks heredados |
| Hexagonal | módulos zonas, lectura, creación, identidad e integración | Dominio/aplicación no importan infraestructura | Resto de rutas sigue por capas |
| Once componentes del informe | informe editable/PDF y documentos fuente | Informe organiza los once apartados docentes | Secciones pendientes conservan estado explícito |
| Entrega académica | ZIP, manifiesto, archivo repositorio y SHA | Árbol Git del commit final, hashes de artefactos | Moodle/publicación y aportes personales no inventados |

Los pendientes no se eliminan de la matriz para mejorar una cifra. La instalación física móvil, accesibilidad integral, credenciales de proveedores y sustentación pertenecen a una verificación posterior del titular.
