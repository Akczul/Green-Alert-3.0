# Decisiones técnicas y evaluación de persistencia

## Decisiones de esta fase

| Decisión | Motivo | Consecuencia |
| --- | --- | --- |
| Mantener Express/React y sus manifests | Son las tecnologías reales del sistema funcional | NestJS es una decisión posterior, sin conversión automática |
| apps/backend y apps/frontend, sin workspace npm | Aplicaciones independientes con configuraciones diferentes | Scripts raíz coordinan sin hoisting; frontend conserva lockfile |
| Historial unido mediante commit con dos padres | Preservar SHA e historia completa de main sin reescritura | Antes del commit de importación los archivos se consultan en sus rutas originales |
| Excluir artefactos generados del índice actual | dist/caché/repomix no son fuentes ni componentes | Se conservan en historial y copias ignoradas locales |
| Generar lockfile backend | npm ci original no podía funcionar sin él | Resuelve rangos existentes; no asegura reproducir una instalación histórica desconocida |
| Node 24 como referencia Docker/CI | Node 20 original ya no está soportado | Ninguna biblioteca se migra; ejecución local validada con Node 26 |
| Configuración local generada, correo JSON y MySQL aislado | Poder preparar el sistema sin credenciales productivas | No se ejecutan migraciones ni servicios remotos durante setup |
| Prueba contractual sobre cliente real | El fixture antiguo ocultaba doce llamadas actuales | Actualización de pruebas y comprobación de rutas registradas |
| Planificar puertos antes de nuevas bases | Las reglas dependen todavía de modelos/SDK concretos | No se instalan MongoDB, Cassandra, Druid ni ML |

## Persistencia por responsabilidad

La asignación siguiente es una **evaluación para GreenAlert**, inferida de sus datos y casos de uso. No implica que se necesiten las cuatro tecnologías. Cada incorporación debe justificar volumen, latencia, consultas, operación, retención, costo, backup y consistencia.

| Tecnología | Situación actual | Responsabilidad viable | Condición para incorporarla | Recomendación |
| --- | --- | --- | --- | --- |
| MySQL | Ya existe y contiene toda la persistencia | Usuarios, sesiones, catálogo, reportes, evidencias metadata, responsables y alertas; transacciones y relaciones | Validar esquema real, índices, cargas y migraciones | Mantener como fuente transaccional principal |
| MongoDB | No hay driver/modelo/conexión | Conversaciones o documentos de análisis/proveedor con estructura variable y versiones | Acreditar acceso documental y retención que no resuelvan bien JSON/SQL actuales; minimizar datos personales | Opcional; no mover usuarios ni asignaciones por conveniencia técnica |
| Cassandra | No hay telemetría IoT ni driver | Series/eventos de sensores de alto volumen con lecturas por sensor/zona y tiempo | Incorporar sensores reales, medir tasa, diseñar particiones temporales acotadas y consultas antes del esquema | Posponer; no hay carga actual que la justifique |
| Apache Druid | No hay ingesta ni cluster OLAP | Agregaciones temporales/geográficas sobre eventos/reportes para dashboards a escala | Evidencia de límites de MySQL, dataset analítico derivado, ingesta/reprocesamiento y consistencia eventual acordados | Posponer; no usar como almacén de usuarios ni transacciones |

MongoDB documenta un modelo flexible, embedding/referencias y diseño según patrón de acceso; eso encaja potencialmente con documentos heterogéneos, pero no exige migrar los datos relacionales actuales. [Documentación oficial de modelado](https://www.mongodb.com/docs/manual/data-modeling/).

Cassandra diseña tablas a partir de consultas y no ofrece joins relacionales; un modelo por `(sensor, ventana temporal)` es una hipótesis a evaluar, no un esquema ya diseñado para esta plataforma. [Modelado oficial de Cassandra](https://cassandra.apache.org/doc/latest/cassandra/developing/data-modeling/intro.html).

Druid está orientado a OLAP/eventos y agregaciones de grandes datasets. Usarlo para dashboards es una posibilidad condicionada a mediciones, no un reemplazo transaccional. [Introducción oficial de Druid](https://druid.apache.org/docs/latest/design/).

MySQL admite índices espaciales con requisitos de columna/SRID; el esquema original no los cumplía para la columna nullable. Se mantiene el índice latitud/longitud y se difiere el diseño espacial efectivo. [Documentación oficial de MySQL](https://dev.mysql.com/doc/refman/8.4/en/spatial-index-optimization.html).

## Reglas para una futura combinación

MySQL conserva la identidad canónica de reporte/usuario; publicar solo IDs y datos necesarios. Si se crea una proyección analítica o documental, definir propietario, versión de evento, política de eliminación/anonimización, retención y procedimiento de reconstrucción. Evitar dual writes sin coordinación: un outbox SQL puede alimentar adaptadores cuando se autorice y justifique. Los consumidores deben ser idempotentes y permitir replay; la lectura eventual debe ser explícita en el contrato.

No garantizar transacciones entre cuatro motores. Separar el dato transaccional de una proyección de consulta y decidir recuperación/reconciliación antes de producción. Introducir una sola responsabilidad nueva por fase con métricas y posibilidad de volver a MySQL.

## Machine learning futuro

Ya hay score heurístico de zonas, etiquetado por palabras e inferencia mediante proveedores. No existe pipeline de entrenamiento, conjunto de datos validado, separación temporal train/test, registro de modelos, evaluación por región/categoría, monitorización de drift o mecanismo de despliegue propio.

Antes de añadir ML: definir variable objetivo y horizonte, calidad/consentimiento de datos, línea base heurística actual y métricas útiles. Evaluar por cortes temporales y geográficos para evitar fuga de información. Exponer inferencia mediante un puerto `RiskPredictor`, con timeout/fallback y versión de resultado, sin exigir microservicio o una nueva base desde el inicio. Esta fase no crea datasets, modelos ni servicios nuevos.

## Pendientes de decisión del equipo

Taxonomía única de categorías y migración de códigos; versión/esquema efectivo de MySQL; soporte de ubicación opcional/índice espacial; habilitación de firebase-admin/exifr; estrategia de sesiones y 401/403; atomicidad de alta/asignación/alertas; necesidad real de escalar a varios procesos; objetivos de latencia y volumen para motores adicionales. Son decisiones de próximas fases, no aprobaciones pendientes para el trabajo ya realizado.
