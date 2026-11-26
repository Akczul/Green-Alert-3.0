# Verificación observada de FastAPI/Mongo/ML

Fecha local: **24/11/2026, America/Bogota**. Worktree exclusivo: `D:\Juan Diego\7. Septimo Semestre\GreenAlert3.0-analytics`; rama `feat/analytics`; base `9a463dbb046e54c7f87cced82b649a2b58d64d36`. Sin push/fusión. Todo el código de esta entrega se limita a `apps/analytics`; no se modifican el original, frontend, autenticación/controladores Express ni Compose raíz.

## Inicio real y Docker

Ejecutado desde ese worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/analytics/scripts/verify.ps1
node --test apps/analytics/integration/express-client.test.mjs
git diff --cached --check
```

Docker Engine 29.8.2, Linux/WSL2 x86_64, Python **3.12.12**, FastAPI **0.165.0**, Uvicorn **0.54.0**, PyMongo **4.20.1**, sklearn **1.9.1**, NumPy **2.5.5**, pytest **9.2.0**. Instalación real mediante `pip --require-hashes`, versiones transitivas en `requirements.lock`. Dockerfile construido e iniciado, usuario **10001**, procesos Uvicorn/Mongo reales; health/readiness y OpenAPI consultados mediante HTTP.

La imagen local inicialmente disponible `mongo:8.0.38-noble` falló antes de arrancar: `libssl.so.3: file too short`, exit 127. No se presenta como prueba aprobada ni se altera esa imagen. Se comprobó otra imagen oficial, **MongoDB 8.0.34**, fijada por digest `sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907`, con la que se ejecutó toda la suite. Python también está fijado por digest en Dockerfile. No se instaló Python en Windows.

## Suite y errores

**35/35 pruebas Python aprobadas**, 26.06 s en la verificación final, sin omitidas. **3/3 pruebas Node aprobadas** para el cliente: errores/ámbito/credenciales, clasificación de timeout y salida correcta; esas tres usan respuestas controladas y no sustituyen la prueba HTTP real del párrafo siguiente.

- 23 pruebas HTTP contra FastAPI real, incluyendo health/OpenAPI, ausencia/token inválido, escrituras/lecturas, índices Mongo, replay, conflicto 409, aislamiento por ámbito, fechas/UUID/límites/campos inválidos, payload >8 MB (413), entrenamiento/inferencia y dos POST concurrentes con un solo documento. Una prueba levanta un segundo Uvicorn con deadline 0.01 s: verifica **504 `COMPUTE_TIMEOUT` y cero ejecuciones persistidas** para ese UUID.
- Ocho fixtures ambientales **originales** de `apps/backend/tests/fixtures/zonas-riesgo/contrato.json`, referencia **a79b6ba**, montados solo lectura: igualdad estructural de todas las zonas, score, tendencia, geografía, dominantes, fechas y orden. No se regeneraron desde Python ni se alteró Express.
- Tres pruebas de ML: determinismo, separación temporal/holdout, predicciones futuras no negativas y rechazo de zona desconocida. Datos únicamente sintéticos.
- Una prueba del pool: el timeout conserva el cupo hasta terminar el proceso y la admisión adicional devuelve 429, evitando una cola ilimitada tras abandonos HTTP.

`integration/probe-live.mjs` ejecutó el **cliente Node real → HTTP FastAPI → MongoDB**: alta analítica, lectura idéntica, replay idéntico, credencial errónea 401 y ámbito distinto 404. No es una ruta Express montada ni un recorrido de navegador.

## Persistencia, caída y recuperación

MongoDB usa autenticación, usuario propio `readWrite`, colección validada e índices único por run_id, scope/kind/fecha y scope/revisión. La suite consulta directamente MongoDB para comprobar documentos/índices/unicidad, además de leerlos por HTTP. Los payloads transaccionales completos no se guardan.

Sondas del runner, adicionales a las 35 pruebas:

| Verificación real | Resultado |
| --- | --- |
| Guardar ejecución de riesgo, entrenamiento y predicción | Tres documentos completos y modelos derivados persistidos |
| Detener el contenedor Mongo | readiness 503, POST 503 `STORAGE_UNAVAILABLE`, liveness 200 |
| Iniciar Mongo y reiniciar API con el mismo volumen | Tres respuestas recuperadas exactamente iguales |
| Ejecutar nueva inferencia tras reinicio | Mismo resultado con el modelo recuperado de Mongo; no depende de memoria previa |
| Limpieza | Solo proyecto/volumen aleatorios creados por el runner |

No se afirma backup/restore de un volumen perdido, réplica, failover, integración con datos reales de MySQL ni proveedores externos. El runner no recibe una base arbitraria ni usa las bases/credenciales del usuario.

## Entrenamiento e inferencia

Dataset **synthetic-weekly-v1-seed-20261124**, cuatro zonas y 104 semanas completas (2024-01-01 a 2025-12-22). Objetivo: conteos semanales de reportes por cuadrícula; no contaminación física medida. Entrenamiento de evaluación: **320 muestras**, hasta 2025-08-04. Holdout temporal: **80 muestras**, 2025-08-11 a 2025-12-22. Ajuste final posterior: 400 muestras. Seis variables temporales/rezagos y tres indicadores de zona.

| Métrica holdout de un paso | Resultado |
| --- | ---: |
| MAE | 1.2808149727 reportes |
| RMSE | 1.7053596420 reportes |
| R² | 0.9505898337 |
| MAE baseline último conteo observado | 1.9500000000 reportes |

**Estas métricas no acreditan precisión predictiva real ni precisión multisemana.** La estacionalidad/tendencia está presente deliberadamente en el generador; el modelo puede aprenderla. No hubo selección de hiperparámetros a partir del holdout. El modelo final y sus métricas se guardan en Mongo con UUID y versión; inferencia separada usa coeficientes JSON, no pickle. Se probó horizonte de cuatro semanas y recuperación del artefacto después de reiniciar. Si el objetivo evaluado es constante, R² se devuelve como null para no presentar una cifra artificial.

## Concurrencia y paralelismo

El benchmark ejecuta el mismo `risk_job` de producción sobre **ocho lotes de 20000 reportes sintéticos**, secuencialmente y en un pool de **dos procesos**. Son lotes independientes, equivalentes a cálculos concurrentes del servicio; no se afirma aceleración de una única solicitud ni se repite cálculo artificial dentro del algoritmo. Tres repeticiones, orden de modos alternado, pool caliente y transporte incluido; arranque medido aparte. Cgroup con **2 CPU**, host de 8 CPU lógicas; otros procesos/agentes del host activos. RSS muestreado cada 10 ms, sumando padre/hijos (puede contar páginas compartidas). No es medición de PSS ni benchmark productivo.

Resultados y recursos de la ejecución final en `benchmark.json`; las tres comparaciones exigen igualdad exacta y el mismo hash SHA-256. La medición HTTP realiza 20 lecturas iguales persistidas, secuenciales y con concurrencia cuatro. CPU/RSS de esa sección corresponden al cliente; `docker-stats.jsonl` es una instantánea adicional de API/Mongo, no sus máximos durante la carga. No existe aserción que obligue a acelerar para obtener verde.

| Repetición | Secuencial s / CPU s / RSS pico MiB | Paralelo s / CPU s / RSS pico MiB |
| --- | --- | --- |
| 1 | 6.5033 / 6.58 / 261.52 | 3.9100 / 7.72 / 362.21 |
| 2 | 5.8126 / 5.85 / 433.09 | 4.9083 / 9.68 / 436.80 |
| 3 | 11.5394 / 11.63 / 458.06 | 7.0889 / 13.87 / 465.64 |

Medianas de pared: **6.5033 s secuencial / 4.9083 s paralelo = 1.325×**. Arranque del pool: **0.84 s**. Hash común: `edaf51c7de46f60438a4651df05c309d8f35343a237992609d1b17c8835d0e42`. Los procesos del pool existen en ambos modos; RSS refleja también memoria retenida de repeticiones anteriores. No se interpreta la diferencia como memoria aislada por solicitud.

E/S final: **0.2310 s secuencial / 0.3140 s concurrente**, resultados iguales; **no se observó aceleración**. CPU del cliente 0.12 / 0.23 s; RSS 315.68 / 328.13 MiB. La concurrencia implementada permite solapar esperas, pero su overhead perjudicó esta muestra corta. Instantánea posterior Docker: API 197.8 MiB, Mongo 352.4 MiB; límites 1536/768 MiB. Una ejecución anterior del mismo riesgo dio 1.593× (27.976/17.566 s), evidenciando variación del host: la cifra de referencia de esta entrega es la ejecución final, conservada completa.

Imagen final construida: `sha256:00c769f038a8cf30602b78bf795260e5c9b4621f6e2f027cf50332b46455074c`, usuario 10001. Hashes SHA-256 de fuentes/locks y resúmenes de sondas en `manifest.json`; resultados crudos sintéticos en los JSON adjuntos. Los proyectos de verificación finalizaron y retiraron sus propios contenedores/volúmenes.

## Contratos y límites de integración

Contrato completo de entradas/salidas/errores en `../README.md` y `openapi.json`, capturado del servicio final. Rutas de negocio: POST `/internal/v1/risk-runs`, `/training-runs`, `/forecast-runs`; GET `/internal/v1/runs/{run_id}` y `/internal/v1/runs?kind=...`. Token de servicio + ámbito confiable, UUID idempotente y errores definidos. Timeout CPU 30 s, Mongo 2 s, cliente Node 35 s; reintentos requieren mismo UUID.

Pendiente: reader de instantáneas MySQL con permisos/ámbito, densificación de conteos semanales, composición y rutas del principal, red/TLS/secretos del despliegue y consumo desde frontend. Consultas y cliente preparados dentro de `integration/`; pasos precisos en README. No se declara conectado el recorrido web → Express → FastAPI. No se repitieron las suites completas Express/React/MySQL porque no se cambió su código/contratos; la equivalencia ambiental sí se verificó contra sus fixtures existentes.
