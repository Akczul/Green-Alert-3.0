# Plan de migración por fases

Estado actualizado después del [piloto de consulta de zonas](piloto-hexagonal-zonas-riesgo.md). Se completaron consolidación, [validación SQL/stack](validacion-mysql.md) y la primera extracción hexagonal. Mantener siempre rutas, estados, multipart, JSON, roles, pantallas y funcionalidades. Las demás migraciones no se inician automáticamente.

| Etapa | Estado |
| --- | --- |
| Fase 0: consolidación | Completada |
| Validación SQL/Docker | Completada en entornos sintéticos; proveedores externos pendientes |
| Fase 1: requisitos del piloto | Esquema validado, catálogo ampliado, contrato y ocho fixtures previos, reloj controlado y lecturas de caché verificados; benchmark de carga y proveedores quedan diferidos |
| Fase 2: consulta de zonas | Completada: dominio, caso, puertos, reader MySQL, caché, adaptador HTTP y composición |
| Alertas como caso independiente | Pendiente; conserva lógica heredada y reutiliza el caso de zonas |
| Fases 3–7 | No iniciadas; requieren revisión y nueva tarea |

## Fase 0 — Consolidar y medir la base

Entregada: aplicaciones bajo `apps/`, historial completo de main unido sin reescritura, scripts y CI compartidos, lockfile backend, ejemplos locales, Compose y documentación. La fase SQL posterior acreditó MySQL nativo/Docker y stack completo. Los proveedores externos mantienen sus pendientes; no usar datos productivos ni enviar correo real accidentalmente.

## Fase 1 — Resolver discrepancias y caracterizar comportamiento

1. Identificar versión de MySQL y migraciones efectivamente aplicadas en un entorno de prueba. Exportar únicamente estructura o fixtures sintéticos, sin datos personales.
2. Ejecutar el esquema corregido sobre un volumen vacío y verificar claves/índices/procedimientos. Acordar taxonomía de categorías entre UI, fallback y semillas. Cualquier renombrado de códigos debe ser una migración independiente, con mapeo y reversión.
3. Guardar fixtures de respuestas de zonas/alertas: sin reportes, ventanas actual/anterior, límites de score/días, categoría, ubicación/radio y niveles. Cubrir datos inválidos y permisos de roles.
4. Definir reloj controlable y normalizar los fixtures para comparar salidas temporales. Registrar latencia y número de lecturas del flujo existente.
5. Decidir por separado si se habilitan Firebase Admin y EXIF; no mezclar instalación de proveedores con la extracción del algoritmo.

Salida: contrato conocido y repetible, esquema sintético inicializado, problemas de producto identificados y sin cambios silenciosos de semántica. Reversión: conservar código previo y restaurar exclusivamente el volumen/fixture de prueba si es necesario; nunca resetear producción.

## Fase 2 — Primera extracción: consultar zonas de riesgo

**Consulta de zonas completada.** Fixtures previos en `tests/fixtures/zonas-riesgo/contrato.json` y contrato en [contrato-zonas-riesgo.md](contrato-zonas-riesgo.md). El SQL de lectura vive en el adaptador; ReporteModel conserva un método delegado de compatibilidad. No se movió el controlador entero de reportes.

1. Extraer funciones puras de agrupación por cuadrícula, score y tendencia. Preservar orden, redondeos, tratamiento de fechas/coordenadas y pesos actuales. **Completado.**
2. Definir puertos propios de aplicación: `ReporteAnaliticaReader.findParaPrediccion`, `Clock.now` y `PredictionCache.get/set/clear`. DTO de entrada/salida con objetos simples. **Completado.**
3. Crear fábrica `createConsultarZonasRiesgo({reporteReader, clock, cache})`; sin importar modelos, Express, SDK o entorno. **Completado.**
4. Implementar adaptador MySQL con la consulta original de `ReporteModel.findParaPrediccion`, dejando el método como puente. Encapsular Map y TTL actual; mantener invalidación tras altas/cambios/borrado. **Completado.**
5. Ensamblar en bootstrap y hacer que el adaptador HTTP traduzca query/errores al caso de uso, reexportado desde el controlador existente. Mantener `/reportes/zonas-riesgo`, autorización admin/moderador y respuesta exacta. **Completado.**
6. **Pendiente de revisión posterior:** extraer `ConsultarAlertasPredictivas` como caso propio, conservando JWT opcional y filtros geográficos. Este piloto solo conecta las alertas heredadas al caso de zonas y a su caché compartida.

Criterios acreditados: ocho fixtures antes/después equivalentes; algoritmo, claves, TTL, ventanas y JSON conservados; caso ejecutable con dobles en memoria; contratos HTTP, guardia de imports, 278 pruebas completas, build/lint, 57 comprobaciones MySQL y 8 del stack pasan. Invalidación por severidad/moderación/borrado verificada también para alertas. No se cambió el esquema ni la escritura espacial.

Reversión: volver a conectar el servicio original en bootstrap; ninguna migración de base requerida. Si cambia el JSON, dividir el cambio y volver al contrato existente antes de continuar.

## Fase 3 — Instituciones, alertas y notificaciones

1. Extraer reglas puras de resolución de entidades y prioridad de `asignacion-entidades.service`.
2. Inyectar repositorios de entidades/asignaciones y gateways de alertas, notificación y tiempo real.
3. Sustituir importaciones de `crearNotificacion` desde un controlador por un caso de uso de aplicación; los controladores quedan como adaptadores.
4. Conservar deduplicación persistida, alcance de entidad, principal/apoyo, estados de atención y evento `reporte:critico_asignado`.
5. Especificar éxito/fallo parcial y reintento sin duplicar asignaciones ni alertas.

Salida: tests de reglas sin SQL/Express, contratos SQL de asignación, pruebas negativas entre entidades y prueba de entrega/persistencia sin duplicados. Reversión por ensamblaje, sin borrar tablas ni campos.

## Fase 4 — Escrituras de reportes y evidencias

Definir invariantes, políticas de moderación y autorización. Crear `CrearReporte`, `ActualizarReporte`, `ModerarReporte` y gestión de evidencia como operaciones separadas. Encapsular almacenamiento, análisis y score. Introducir UnitOfWork SQL solo para las operaciones que deban ser atómicas dentro de MySQL.

Formalizar compensación Cloudinary/SQL, limpieza de huérfanos, reintentos e idempotencia. Si se necesita entrega durable de asignaciones/notificaciones, diseñar un outbox como cambio explícito de esquema; no dar atomicidad por supuesta. Mantener validación de archivos, máximo de evidencias/video, estados y soft delete.

Salida: pruebas de fallos en cada paso, rollback/compensación acreditados en entorno sintético, contrato multipart preservado y regresión HTTP completa. Reversión mantiene código/adapter anterior; si hay outbox, diseñar su compatibilidad hacia atrás antes de desplegar.

## Fase 5 — Identidad, catálogo y administración

Separar hash de contraseña, JWT, reloj, generación de tokens, correo, OAuth y repositorios. Preservar formato scrypt para contraseñas existentes, hashes de refresh/OTP y políticas de revocación. Documentar almacenamiento de sesión, códigos 401/403 y compatibilidad cliente antes de modificarlos.

Sacar estado/códigos OAuth de memoria solo si se requiere multiproceso, con TTL, consumo único y pruebas de concurrencia. Catálogo y usuarios mantienen endpoints y roles; cambiar taxonomía requiere su propia migración acordada.

Salida: pruebas de rotación/revocación, expiración, replay OAuth/OTP, cambio de contraseña, aislamiento de roles y compatibilidad con hashes existentes. Reversión sin invalidación masiva de cuentas salvo decisión explícita.

## Fase 6 — Persistencia adicional, solo con evidencia

Medir cargas y revisar [decisiones](decisiones.md). Elegir una responsabilidad: documentos/conversaciones para MongoDB, sensores para Cassandra o proyección analítica para Druid, únicamente si el caso lo exige. No incorporar las tres a la vez.

Definir contrato del puerto, propiedad de dato, consistencia, retención, anonimización, volumen/costo y recuperación. Crear ingesta idempotente/reproducible, probar backfill/replay/reconciliación y comparar resultados con MySQL. Un cambio de adaptador no debe exigir SQL/SDK dentro del dominio.

Salida: objetivo medible cumplido y reversión a la fuente transaccional sin pérdida. No habilitar dual writes sin plan de fallos.

## Fase 7 — Analítica predictiva entrenada

Definir objetivo/horizonte y dataset trazable; mantener el score heurístico como línea base. Evaluar con cortes temporales/geográficos, prevenir leakage y medir error por zona/categoría. Diseñar `RiskPredictor` con versionado, timeout, fallback y observabilidad. Solo después decidir despliegue local/remoto y almacenamiento de features/resultados.

Salida: mejora demostrada frente a la línea base, evaluación reproducible, monitoreo y rollback de modelo. Ningún entrenamiento o motor adicional forma parte de esta entrega.

## Comprobaciones comunes por extracción

Usar `npm test`, `npm run lint`, `npm run build`, `npm run test:smoke` y pruebas de integración MySQL sintéticas que correspondan. Actualizar OpenAPI/inventarios y verificar que no aparezcan dependencias de infraestructura en dominio/aplicación. Mantener un cambio pequeño por operación y comparar contra los SHA/fixtures anteriores; no afirmar paridad solo porque la compilación pasa.
