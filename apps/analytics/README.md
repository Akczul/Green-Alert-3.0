# Backend de analítica GreenAlert

Servicio independiente Python/FastAPI con MongoDB autenticado, cálculo ambiental y regresión múltiple de conteos semanales. Ubicación exclusiva `apps/analytics`; no cambia rutas Express, frontend, middleware ni Compose raíz. Base revisada `9a463dbb046e54c7f87cced82b649a2b58d64d36`, rama `feat/analytics`. Se consultaron AGENTS.md, auditoría oficial, plan de cumplimiento y los tres contratos existentes. Esta tarea autoriza Python/Mongo/ML que la auditoría solo proponía.

## Responsabilidades y estructura

- `schemas.py`: DTO versionado, límites, semanas contiguas, UUID y validaciones cruzadas.
- `risk.py`: dominio puro contrastado con los ocho fixtures originales `a79b6ba`; no se regeneran.
- `ml.py`: entrenamiento/evaluación e inferencia separados; artefacto numérico JSON, sin deserializar pickle.
- `repository.py`: adaptador MongoDB asíncrono, validación de colección e índices.
- `runtime.py`: pool de procesos con admisión y timeout acotados.
- `main.py`: composición, ciclo de vida, autenticación y HTTP. `config.py`: entorno validado.
- `integration/`: cliente Node optativo, consultas de referencia y comprobación HTTP real; no monta rutas.

Se separan cálculo, persistencia y transporte para poder probar el dominio sin infraestructura y ejecutar CPU fuera del event loop. No se crea contenedor DI, broker ni CRUD transaccional duplicado.

## Inicio

Requiere Docker con contenedores Linux y Compose. Para verificar todo en Windows, desde la raíz del worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/analytics/scripts/verify.ps1
node --test apps/analytics/integration/express-client.test.mjs
```

El runner genera secretos en memoria y un proyecto `ga-analytics-<aleatorio>`, construye la imagen, ejecuta las pruebas, interrumpe MongoDB, reinicia MongoDB/API, recupera resultados y modelo y mide CPU/E/S. Solo retira su proyecto y su volumen en `finally`. Evidencias sin credenciales en `apps/analytics/.local/verification/`; no acepta una base existente. No emplea `.env` del usuario ni MySQL80. Usa puerto de API asignado por Docker para evitar conflictos. Node de referencia 24; el runner también requiere Node para el adaptador. No necesita Python instalado en Windows.

Para desarrollo persistente, establecer secretos **nuevos** en las variables de proceso `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `ANALYTICS_INTERNAL_TOKEN` (>=32 caracteres), y ejecutar desde esta carpeta:

```powershell
docker compose --project-name greenalert-analytics-dev up --build --detach --wait
```

API local en `http://127.0.0.1:8010`, Swagger `/docs`, OpenAPI `/openapi.json`. MongoDB no publica puerto. `docker compose ... down` conserva el volumen; no usar `--volumes` con datos que deban conservarse. El inicializador solo crea el usuario de aplicación en volúmenes nuevos; rotar credenciales requiere actualizar el usuario Mongo y el entorno, no basta cambiar una variable. Los contenedores usan secretos por entorno para el entorno local; en despliegue deben inyectarse mediante el sistema de secretos y protegerse la red/TLS. El token es exclusivamente de servicio, independiente de JWT de usuarios.

Ejecución Python alternativa: Python 3.12, entorno virtual independiente, `pip install --require-hashes -r requirements.lock`, variables `ANALYTICS_INTERNAL_TOKEN` y `ANALYTICS_MONGO_URI`, MongoDB real, `uvicorn greenalert_analytics.main:create_app --factory --host 127.0.0.1 --port 8000 --workers 1`. No lee `.env` implícitamente. Usar un worker HTTP; cada réplica tiene un pool CPU propio. La colección debe existir si el usuario tiene privilegios mínimos sin creación; esta primera versión necesita `readWrite` para crear colección/índices al arrancar. El inicio falla si MongoDB no está accesible: no hay fallback ficticio en memoria.

Configuración completa en `.env.example`. Valores por defecto: 2 procesos CPU, 2 cálculos admitidos, 30 s de cálculo, 2 s para operaciones Mongo, 20 conexiones Mongo, 8 MB por cuerpo. BLAS/OMP limitado a un hilo por proceso en Docker. Imágenes Python y Mongo fijadas por digest; el digest Mongo comprobado corresponde a 8.0.34. `requirements.lock` incluye versiones transitivas y hashes, generado con uv 0.9.12 sobre Python 3.12/Linux. Las dependencias de prueba están incluidas en esta imagen para reproducir la entrega; una imagen operativa más pequeña puede separar herramientas posteriormente.

## Contrato HTTP interno v1

Salvo `/health/live`, `/docs` y `/openapi.json`, todas las operaciones requieren `Authorization: Bearer <token-interno>`. Las operaciones `/internal/v1` además exigen `X-Analytics-Scope` con 1..100 caracteres `[A-Za-z0-9:_-]`. El principal determina el ámbito a partir de permisos comprobados; no copiar este header desde el navegador. La API confía en el servicio autorizado para afirmar el ámbito y el origen del snapshot. Un token interno comprometido puede afirmar cualquier ámbito: no se anuncia autorización de usuario ni introspección de sesiones en este servicio.

| Método/ruta | Entrada | Resultado |
| --- | --- | --- |
| GET `/health/live` | Sin credencial | Proceso disponible, no garantiza Mongo |
| GET `/health/ready` | Token interno | Ping Mongo; 503 si falla |
| POST `/internal/v1/risk-runs` | Instantánea mínima de reportes y dos ventanas | Cálculo de zonas y ejecución persistida |
| POST `/internal/v1/training-runs` | Conteos semanales densificados por zona | Modelo versionado y métricas persistidas |
| POST `/internal/v1/forecast-runs` | `model_id`, historia reciente, horizonte 1..8 | Cantidad esperada por zona/semana; inferencia recursiva |
| GET `/internal/v1/runs/{run_id}` | UUID y ámbito | Ejecución completa inmutable; 404 fuera de ámbito |
| GET `/internal/v1/runs?kind=risk&limit=20&offset=0` | kind risk/training/forecast; límite 1..100, offset 0..10000 | Metadata sin resultados pesados y total |

POST devuelve **200 únicamente tras confirmación Mongo**: `{status:"success",message:"ok",data:{...ejecución}}`. No hay job ficticio ni 202. El cliente proporciona `run_id` UUID para reintentos; repetir mismo UUID/cuerpo/versión devuelve el resultado original. Cambiar la entrada o versión con el mismo UUID devuelve 409. Índice único resuelve carreras; pueden calcularse dos veces pero solo se guarda una ejecución. No hay caché que oculte MongoDB. Ante pérdida de confirmación de escritura puede haberse persistido: consultar/repetir **el mismo UUID**, nunca generar otro automáticamente. No existe atomicidad distribuida con MySQL.

Errores homogéneos `{status:"error",message:"...",code:"..."}` sin `data` ni cuerpo original: 401 `UNAUTHORIZED`; 404 `RUN_NOT_FOUND`/`MODEL_NOT_FOUND`; 409 `RUN_CONFLICT`; 413 `BODY_TOO_LARGE`; 422 `INVALID_REQUEST`/`INVALID_ANALYSIS`; 429 `COMPUTE_BUSY` (Retry-After: 2); 503 `STORAGE_UNAVAILABLE` (Retry-After: 2); 504 `COMPUTE_TIMEOUT`; 500 `INTERNAL_ERROR`. Rutas/métodos desconocidos conservan 404/405 con `HTTP_ERROR`. Un timeout CPU no mata un proceso a mitad de cálculo: conserva el cupo hasta terminar y descarta el resultado. Cancelar HTTP no promete abortar el cálculo ni deshacer una escritura ya confirmada.

Todas las entradas POST contienen `run_id`, `source_revision` (1..160, referencia de instantánea proporcionada por el principal), `source_kind` (`mysql` o `synthetic`). Campos desconocidos se rechazan. El hash SHA-256 canónico incluye el cuerpo, tipo y versión del algoritmo. No se guardan cuerpos ni reportes completos. La revisión no se considera autenticidad criptográfica del origen.

### Riesgo

```json
{
  "run_id": "77e66baa-c3b7-4ea3-a9f0-5de87eff5d98",
  "source_revision": "snapshot-mysql-revision-del-principal",
  "source_kind": "mysql",
  "period": {"start": "2026-11-01T00:00:00Z", "end": "2026-11-24T00:00:00Z"},
  "min_score": 30,
  "reports": [{"report_uuid":"88e66baa-c3b7-4ea3-a9f0-5de87eff5d98", "tipo_contaminacion":"agua",
    "nivel_severidad":"alto", "latitud":1.151, "longitud":-76.651, "created_at":"2026-11-20T00:00:00Z"}]
}
```

Campos opcionales por reporte: subcategoria, municipio, departamento. UUID único por entrada; máximo 20000 reportes. El principal entrega únicamente reportes no borrados, estados `en_proceso`/`resuelto`, coordenadas válidas y categoría/ámbito autorizados. Ventana actual `[start,end]`, previa `[start-(end-start),start)`; duración máxima 365 días. Fechas con zona horaria obligatoria; no admite reportes posteriores a `end`. Ordenar por `created_at DESC` y desempate estable antes del envío para dominantes/ties reproducibles.

Se conservan celda 0.05, floor para negativos, score, umbrales, tendencia y dominantes del dominio legado. Los resultados mantienen IDs de cuadrícula `lat:lng`, porque esas zonas **no tienen UUID** en el sistema; los reportes sí mantienen sus UUID MySQL. Esta API nueva es más estricta con datos/fechas que el dominio legado: la prueba pura incluye las fechas futuras y filas inválidas de los fixtures originales, pero el DTO nuevo las rechaza. No se sustituye silenciosamente `/api/reportes/zonas-riesgo`, su caché compartida, su filtro institucional ni su cálculo de cutoff por zona horaria local.

### Entrenamiento e inferencia

`histories: [{zone_id:"1.1500:-76.7000",points:[{week:"2024-01-01",count:12}, ...]}]`. Semanas de lunes UTC, contiguas y sin duplicados; `count` entero 0..1000000 (no booleano). Incluir explícitamente ceros; un cero no representa un fallo de ingesta. Entrenamiento: 1..100 zonas con las mismas 20..520 semanas completas. Definición del objetivo propuesto: altas no borradas geolocalizadas, **todos los estados**, por semana/zona; mide demanda de reportes, no concentración física de contaminantes. Una revisión de estados/borrado puede cambiar el histórico: conservar revisión y fecha del snapshot. No atribuir una disminución de denuncias a mejora ambiental.

Variables: lag1, lag2, media de las cuatro semanas previas, seno/coseno anual, tendencia semanal y zona categórica con una referencia omitida. `LinearRegression` OLS; predicciones truncadas a cero. Último 20% temporal, mínimo cuatro semanas, como holdout común a todas las zonas. El entrenamiento de evaluación nunca ve objetivos futuros. Se publican MAE, RMSE, R², MAE baseline lag1, fechas y tamaños; después se reajusta un artefacto final con todos los datos. Evaluación de un paso con rezagos observados; **no** prueba precisión recursiva de 8 semanas. Sin intervalos de confianza ni selección/ajuste automático de hiperparámetros.

El modelo se guarda en `results` de una ejecución `training`: UUID = `model_id`, versión, coeficientes, intercepto, esquema de variables, ancla temporal, zonas conocidas, fin de entrenamiento, versión sklearn y métricas. Inferencia recibe los campos comunes, `model_id`, `histories` (mínimo cuatro semanas; final común >= fin de entrenamiento), `horizon_weeks` 1..8. Rechaza zonas no entrenadas/versiones incompatibles. Produce expectativas fraccionarias por semana, sin pretender conteos exactos. Lleva procedencia de entrenamiento e inferencia; si cualquiera es sintética, `synthetic:true`. La ausencia de datos reales aquí se resuelve con `scripts.synthetic` (seed 20261124, cuatro zonas, 104 semanas). Sus métricas solo validan el procedimiento sintético.

## MongoDB y recuperación

Base `greenalert_analytics`, colección `analytics_runs`: `run_id` UUID string; `schema_version:1`; `scope`; kind/status; `algorithm_version`; `source_revision`; `source_kind`; `input_hash`; `period`; `parameters`; `results`; `executed_at` UTC BSON date. Fechas de riesgo en ISO con timezone, semanas como fechas ISO; inicio/fin semanal exclusivo. En riesgo fin inclusivo, corte inclusivo actual. Fecha de ejecución truncada a milisegundos para igualdad tras lectura BSON.

Índices: único `run_id`; `(scope,kind,executed_at DESC,run_id)` para listados estables; `(scope,source_revision)` para reconciliación. Validador Mongo para campos estructurales; Pydantic valida DTO completos. Escrituras con journal y mayoría; standalone local, sin garantía de alta disponibilidad. Sin TTL/borrado automático de resultados/modelos; planificar retención respaldos y capacidad al desplegar. No almacenar usuarios, JWT, emails, evidencia binaria ni la tabla MySQL. Solo hashes de entrada, parámetros resumidos y resultados derivados. Históricos usados para inferir se vuelven a obtener de MySQL.

El runner acredita persistencia en volumen y reinicio de procesos con recuperación exacta y nueva inferencia desde modelo recuperado. **No acredita backup/restore en otro equipo, réplica ni recuperación ante corrupción del volumen.** Un cambio del modelo/algoritmo exige nueva versión y nuevo UUID; los resultados previos no se mutan.

## Integración final pendiente con Express

1. Incorporar `integration/express-client.mjs` en un adaptador del principal mediante fábrica. Inyectar URL interna, secreto y timeout (35 s, superior a los 30 s de CPU + margen Mongo); propagar cancelación y errores definidos. No hay reintentos automáticos. No exponer secreto al frontend. El cliente rechaza redirects para no reenviar credenciales.
2. Crear un reader de instantáneas **solo lectura** de MySQL, preparado y con sesión UTC, sobre `reportes.uuid`, decimales latitud/longitud y columnas mínimas de `snapshot-queries.sql`. Aplicar autorización vigente y alcance antes de consultar/enviar. Para entrenamiento densificar la misma cuadrícula por semanas completas, incluyendo zonas/semanas cero; limitar muestra y preservar orden. Calcular revisión/hash de snapshot en el principal y conservar una ventana consistente de lectura; no usar `id_reporte` como UUID ni reinterpretar POINT.
3. En el composition root montar el caso autorizado de analítica (admin/moderador u otra política acordada con el frente de identidad). Elegir ámbito fijo derivado del servidor, generar/preservar `run_id` y solicitar riesgo/entrenamiento/inferencia. Validar versión de DTO. No delegar autorización a `source_kind` ni a headers proporcionados por el usuario.
4. En la integración de infraestructura añadir el servicio y Mongo en red interna; URL de servicio `http://analytics:8000` cuando ese alias se acuerde. Este Compose propio usa alias `api`, por lo que internamente aquí es `http://api:8000`. Mantener Mongo privado, volumen y secretos separados; TLS/red de confianza en despliegue. No concatenar/editar este Compose sobre el raíz sin revisión del frente de infraestructura.
5. Conectar resultados al caso de uso del frontend a través de Express y verificar el recorrido web → Express → FastAPI → Mongo, permisos, timeout, caída y regresión de los contratos existentes. **Ese recorrido de producto no se afirma completado aquí**: se respeta la prohibición de cambiar controladores/frontend/Compose compartidos. `probe-live.mjs` sí comprueba cliente Node → FastAPI → Mongo real.

## Evidencia y límites

Resultados observados de esta entrega en `evidence/verification.md`; OpenAPI capturado del servicio real en `evidence/openapi.json`. El benchmark usa exactamente `risk_job` de producción, ocho lotes sintéticos de 20000 reportes, tres repeticiones, mismos resultados/hash, secuencial y dos procesos; observa tiempo, CPU y RSS agregado. Incluye transporte de argumentos/resultados y separa arranque del pool. La medición E/S realiza veinte lecturas HTTP/Mongo iguales secuenciales frente a concurrencia cuatro; recoge recursos del cliente y muestra separadamente `docker stats` de servicios. No hay aserción de speedup ni extrapolación a producción. Otros agentes/procesos del host pueden influir.

Fuentes técnicas primarias consultadas: [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), [PyMongo AsyncMongoClient/opciones](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/connect/connection-options/), [evaluación temporal sklearn](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html). Aquí se usa holdout temporal explícito y común entre zonas, no partición aleatoria ni TimeSeriesSplit sobre filas mezcladas.
