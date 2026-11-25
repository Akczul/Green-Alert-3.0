# Validación del servicio de eventos

Fecha de trabajo: 24/11/2026, America/Bogota. Rama exclusiva `feat/events`, worktree `D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-events`. Archivos del cambio limitados a `apps/events`; no se modificó el repositorio original ni se hizo push/merge. El commit de entrega contiene las fuentes; los hashes SHA-256 del resultado real permiten contrastar exactamente los archivos ejecutados.

## Método y trazabilidad

Se revisaron AGENTS.md, plan de cumplimiento y las siete páginas del instructivo docente. El PDF no estaba en el worktree Git porque el original no está versionado: se leyó su copia del repositorio original sin modificarla. Esta entrega implementa solo el frente Java/Cassandra/Druid autorizado; no certifica el cumplimiento global del proyecto final ni integración con clientes web/móvil.

| Requisito de este frente | Implementación | Prueba reproducible |
| --- | --- | --- |
| API independiente, validación, errores, OpenAPI | api/, config/, /api/v1 | Suite real: protección, correlación, versión/tipos/límites, OpenAPI exportado |
| Historial por reporte y período | CassandraEventStore, events_by_report | Escritura, lectura, UUID global conflictivo, reparación de proyección |
| Idempotencia concurrente | events_by_id con IF NOT EXISTS, logged batch de proyecciones | Ocho solicitudes simultáneas: una creación y siete reintentos |
| Ingesta Druid efectiva | DruidAnalytics, fuente inline de snapshot Cassandra | Task SUCCESS y comparación SQL contra fuente |
| Indicadores y granularidad | Rollup HOUR, segmentos DAY, dimensiones tipo/categoría/severidad/zona | Conteos exactos, filtros, rechazo de precisión subhoraria |
| Replay sin suma doble | Reemplazo completo de intervalo diario | Dos ingestas, mismos agregados; semáforo/429 durante reingesta |
| Concurrencia útil | ThreadPoolTaskExecutor 4 workers/cola 128 | 512 escrituras CQL reales, muestras alternadas, equivalencia por reporte, pico real de concurrencia |
| Caídas y recuperación | Timeouts y reconexión del driver, error 503 saneado | Detener Cassandra; detener Broker/Coordinator; volver a arrancar y reintentar |
| Persistencia | Volúmenes por proyecto para todos los estados durables | Reiniciar stack completo y comparar historial e indicadores sin reingesta |
| Autenticación entre servicios | Bearer técnico separado del token de operador | Sin token, token de otro propósito y rotación invalidando el anterior |
| Docker reproducible aislado | compose.datos.yml + compose.apps.yml, red externa, Dockerfile no root | Construcción desde manifests, inicialización CQL, salud y limpieza de proyecto aleatorio |
| Comunicación Express | Contratos y cliente de referencia examples/ | Sintaxis del cliente comprobada; integración en principal pendiente por alcance |

## Pruebas unitarias

`mvn.cmd -B -ntp -f apps/events/pom.xml test`: **6 aprobadas, 0 fallos, 0 errores, 0 omitidas**. JDK host Eclipse Temurin 17.0.21, Maven 3.10.0. Validan fechas/precisión, rangos de consulta, límites del modelo y precisión declarada del rollup. No sustituyen pruebas con motores reales. El Dockerfile compila con Maven 3.9.11 / Temurin 17 y ejecuta estas mismas pruebas.

`node --check apps/events/examples/express-events-client.mjs`: correcto. Es solo verificación sintáctica del adaptador de referencia; no acredita Express llamando a este servicio.

## Primer intento real y corrección

[primer-intento.json](primer-intento.json) conserva el intento fallido `ga-events-test-6690cdfbd988`: pasaron los primeros 19 checks hasta task SUCCESS de ingesta, pero falló la consulta agregada porque el alias SQL `hour` estaba sin comillas. Se verificó directamente en Druid que el datasource contenía los hechos y que citar el identificador devolvía 18 eventos/10 creaciones. Se corrigieron los identificadores SQL y se reinició la suite completa sobre un proyecto nuevo. No se eliminó ninguna aserción ni se rebajó el resultado esperado. El runner retiró sus volúmenes, contenedores y red al fallar.

## Segundo intento y ajuste del runner

[segundo-intento.json](segundo-intento.json) conserva 29 checks aprobados, incluyendo ingesta, replay, dos caídas/recuperaciones y 512 escrituras de benchmark. Falló al esperar la API después del reinicio completo: Docker reasignó el puerto efímero 32773 a 32774, mientras el runner seguía consultando 32773. Una consulta manual autenticada al puerto descubierto confirmó 20 eventos visibles y readiness 200; esa observación no se presentó como aprobación de la suite. Se corrigió el runner para redescubrir el puerto y se repitió toda la ejecución desde volúmenes nuevos. La limpieza de ese intento también terminó correctamente.

Las medianas de ese intento fueron 679,04 ms secuencial y 610,39 ms concurrente por 64 eventos (tres muestras medidas por modo tras calentamiento). Son evidencia exploratoria de una ejecución cuyo gate final falló, no reemplazan los resultados finales siguientes.

## Resultado final con motores reales

**33/33 checks aprobados**, cero omitidos; proyecto `ga-events-test-96c0ac7fdf4f`. [Resultado completo](resultado-real.json), [OpenAPI exportado](openapi.json), [árbol de dependencias Maven resuelto](dependencies.txt). Las pruebas unitarias son seis adicionales: no se suman como 39 pruebas de motores.

La suite comprobó escritura/lectura Cassandra, historial por reporte, colisiones globales de UUID, reparación de proyección, ocho duplicados simultáneos, validación estricta, ingesta nativa Druid, filtros y agregados, repetición del snapshot, rechazo 429 durante reconciliación, caída/recuperación de ambos motores, concurrencia, persistencia tras reiniciar **todo** el stack sin reingesta y revocación del token anterior al rotarlo. El historial y los indicadores sobrevivieron; Druid terminó con 20 eventos del día de prueba. El benchmark agregó otros 512 eventos en un día separado. El runner retiró sus contenedores, volúmenes y red: no quedó un despliegue activo de esta entrega.

Se verificó `docker inspect`: Events ejecuta como `10001:10001`, Druid como `druid`. Motores: Cassandra 5.0.9, Druid 38.0.0, MySQL 8.4.11 exclusivo del metastore, ZooKeeper 3.9.3. Aplicación Docker: Java 17.0.17 / Spring Boot 3.5.8. Los hashes del JSON se contrastaron con todos los archivos fuente ejecutados del worktree. Git normaliza finales de línea a LF mediante `.gitattributes`; los hashes registrados son de los archivos del equipo Windows durante la ejecución.

### Medición secuencial y concurrente

Mismo esquema/carga por lote: 64 eventos con UUID nuevos, repartidos en 16 reportes; cuatro muestras por modo, orden alternado. Se valida un total final de 32 eventos por reporte de benchmark, sin pérdida ni duplicación. Tiempos HTTP extremo a extremo contra CQL real; sin sleeps artificiales ni carga de CPU simulada. Se excluye solo la muestra 0, declarada de calentamiento antes de medir.

| Muestra | Secuencial ms | Concurrente ms |
| --- | ---: | ---: |
| 0 | 743.01 | 439.93 |
| 1 | 576.47 | 470.07 |
| 2 | 523.46 | 182.12 |
| 3 | 652.86 | 238.59 |
| **Mediana de 1..3** | **576.47** | **238.59** |

Medianas por lote: **2.42x** de relación secuencial/concurrente y **58.6% menos latencia** en esta ejecución; tasas equivalentes de 111.0 y 268.2 eventos/s. Son muestras pequeñas con dispersión visible, JIT/cachés y carga del equipo; no acreditan capacidad sostenida ni predicen el clúster de producción. La diferencia con el segundo intento se conserva para hacer visible esa variabilidad. Pool de lote configurado a 4 workers, cola 128. El pico global observado fue 8 operaciones simultáneas: incluye las ocho solicitudes individuales de la prueba de duplicados, **no** significa ocho workers en el pool.

### Recursos y presupuesto Docker

Host Docker observado: **8 CPU, 7,68 GiB de memoria disponibles para la VM**. Suma de límites de contenedores: **6.528 MiB (6,375 GiB)**. Máxima suma simultánea observada por `docker stats` en las instantáneas del runner: **3527.8 MiB (3.45 GiB)**. Esta última cifra es una instantánea, no el pico continuo ni el consumo completo de Docker Desktop/builds/otros proyectos.

Lecturas cgroup v2 antes del reinicio completo (el JSON guarda bytes y CPU detallada):

| Servicio | Máximo de memoria MiB | CPU acumulada s |
| --- | ---: | ---: |
| broker | 424.5 | 17.91 |
| cassandra | 1293.7 | 36.78 |
| coordinator | 343.4 | 17.04 |
| events | 334.2 | 66.25 |
| historical | 407.6 | 33.56 |
| metadata | 476.1 | 22.36 |
| middlemanager | 562.8 | 73.97 |
| zookeeper | 75.8 | 8.01 |

Los máximos por contenedor pueden ocurrir en momentos distintos: no sumar esa columna como pico simultáneo. CPU es acumulada desde la creación del cgroup de cada proceso, e incluye arranque, ingesta y pruebas; las recuperaciones individuales pueden reiniciarla. No se presenta como CPU por modo del benchmark. Este perfil es para demostración aislada; reservar margen para el sistema, compilación y otros servicios antes de integrar todos los frentes.


## Límites y pendientes

* Integración del principal y sus permisos por usuario/ámbito, entrega durable en origen/outbox y programación operativa de reconciliación: pendientes; no se editaron archivos compartidos. No hay transacción global MySQL/Cassandra/Druid ni ACK atómico entre motores.
* Una réplica Events, Cassandra RF=1, un Historical y almacenamiento local compartido: perfil de demostración. No hay validación de alta disponibilidad, mTLS, carga de producción ni restauración desde backups.
* Máximo 10.000 eventos por día en un snapshot, lote de 64, historial truncado a 500 sin cursor compuesto. La API rechaza exceso analítico en vez de publicar métricas parciales. Los límites deben evolucionar con una carga real medida.
* El benchmark mide E/S contra Cassandra en este equipo y con esta carga. No demuestra paralelismo CPU, beneficios de ML ni capacidad de un clúster productivo.

## Incidente operativo

Durante la preparación se detuvo por error el contenedor ajeno `stupefied_lehmann` (ID empezaba por `2772e9e689f0`), que ejecutaba `pip-compile` en una imagen Python. Tenía eliminación automática y ya no pudo reiniciarse con `docker start`; puede requerir repetir esa generación de dependencias en su tarea propietaria. No se recreó a ciegas ni se tocaron sus archivos o volúmenes. El usuario fue informado durante el trabajo. Las acciones posteriores de diagnóstico/limpieza y la suite usan IDs y labels del proyecto de eventos exclusivamente.

En la preparación inicial, el entrypoint de Druid imprimió una contraseña sintética del metastore al copiar sus variables. Se sustituyó la propiedad por el proveedor `${env:DRUID_METADATA_PASSWORD}` y se deshabilitó el log de propiedades. Las ejecuciones posteriores muestran solo la referencia, los logs del runner se sanean y no se versionan secretos. Ese stack preliminar y su base fueron retirados; no se emplearon credenciales de producción.
