import asyncio
import hashlib
import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError
from starlette.exceptions import HTTPException

from .config import Settings
from .ml import ALGORITHM_VERSION as ML_VERSION, forecast_job, train_job
from .repository import RunRepository
from .risk import ALGORITHM_VERSION as RISK_VERSION, risk_job
from .runtime import ComputeRuntime, ServiceError
from .schemas import ErrorEnvelope, ForecastRequest, ListEnvelope, RiskRequest, RunEnvelope, TrainingRequest


def error(status, code, message):
    return JSONResponse(status_code=status, content={"status": "error", "message": message, "code": code},
                        headers={"Retry-After": "2"} if status in (429, 503) else None)


class BodyLimit:
    def __init__(self, app, max_bytes):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH"):
            return await self.app(scope, receive, send)
        chunks, total = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            total += len(message.get("body", b""))
            if total > self.max_bytes:
                return await error(413, "BODY_TOO_LARGE", "Entrada excede el límite de bytes")(scope, receive, send)
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


def create_app(settings=None):
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        client = AsyncMongoClient(settings.mongo_uri.get_secret_value(),
            serverSelectionTimeoutMS=settings.mongo_timeout_ms, connectTimeoutMS=settings.mongo_timeout_ms,
            socketTimeoutMS=settings.mongo_timeout_ms, timeoutMS=settings.mongo_timeout_ms,
            maxPoolSize=20, waitQueueTimeoutMS=settings.mongo_timeout_ms, tz_aware=True,
            w="majority", journal=True)
        runtime = ComputeRuntime(settings)
        try:
            await client.admin.command("ping")
            repository = RunRepository(client[settings.mongo_database])
            await repository.initialize()
            app.state.repository, app.state.runtime, app.state.client = repository, runtime, client
            yield
        finally:
            runtime.close()
            await client.close()

    app = FastAPI(title="GreenAlert Analytics", version="1.0.0", lifespan=lifespan,
                  description="API interna: instantáneas MySQL y resultados derivados en MongoDB.",
                  responses={str(s): {"model": ErrorEnvelope} for s in (401, 404, 409, 413, 422, 429, 500, 503, 504)})
    app.add_middleware(BodyLimit, max_bytes=settings.max_body_bytes)
    bearer = HTTPBearer(auto_error=False)

    async def authorize(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
        if credentials is None or not secrets.compare_digest(credentials.credentials.encode(), settings.internal_token.get_secret_value().encode()):
            raise ServiceError(401, "UNAUTHORIZED", "Credencial interna ausente o inválida")

    async def scoped_scope(authorization=Depends(authorize),
            x_analytics_scope: Annotated[str, Header(pattern=r"^[A-Za-z0-9:_-]{1,100}$")] = ...):
        return x_analytics_scope

    @app.exception_handler(ServiceError)
    async def service_error(request, exc):
        return error(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        # No reflejar cuerpos, credenciales o información personal.
        return error(422, "INVALID_REQUEST", "Entrada inválida; consulte el contrato OpenAPI")

    @app.exception_handler(PyMongoError)
    async def unavailable(request, exc):
        return error(503, "STORAGE_UNAVAILABLE", "Persistencia analítica no disponible; consulte run_id antes de reintentar")

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return error(exc.status_code, "HTTP_ERROR", "Ruta o método no disponible")

    @app.exception_handler(Exception)
    async def unexpected(request, exc):
        return error(500, "INTERNAL_ERROR", "No fue posible completar la operación analítica")

    @app.get("/health/live", tags=["health"])
    async def live():
        return {"status": "ok", "service": "greenalert-analytics", "version": "1.0.0"}

    @app.get("/health/ready", dependencies=[Depends(authorize)], tags=["health"])
    async def ready():
        await app.state.client.admin.command("ping")
        return {"status": "ok", "mongodb": "ok"}

    async def execute(payload, kind, scope):
        body = payload.model_dump(mode="json")
        version = RISK_VERSION if kind == "risk" else ML_VERSION
        digest = hashlib.sha256(json.dumps({"body": body, "kind": kind, "algorithm": version},
                               sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        repository = app.state.repository
        replay = await repository.replay(payload.run_id, scope, digest)
        if replay:
            return {"data": replay}
        if kind == "forecast":
            model_run = await repository.find(payload.model_id, scope)
            if not model_run or model_run["kind"] != "training":
                raise ServiceError(404, "MODEL_NOT_FOUND", "Modelo no encontrado en el ámbito")
            result = await app.state.runtime.execute(forecast_job, body, model_run["results"])
        else:
            result = await app.state.runtime.execute(risk_job if kind == "risk" else train_job, body)
        if kind == "risk":
            period = body["period"]
            parameters = {"min_score": body["min_score"], "report_count": len(body["reports"]), "cell_degrees": 0.05}
        else:
            points = body["histories"][0]["points"]
            period = {"start": points[0]["week"], "end": points[-1]["week"]}
            if kind == "forecast":
                end = datetime.fromisoformat(points[-1]["week"]) + timedelta(weeks=body["horizon_weeks"] + 1)
                period = {"start": (datetime.fromisoformat(points[-1]["week"]) + timedelta(weeks=1)).date().isoformat(),
                          "end": end.date().isoformat()}
            parameters = {"zones": len(body["histories"]), "horizon_weeks": body.get("horizon_weeks"),
                          "model_id": body.get("model_id"), "period_semantics": "weekly_start_end_exclusive"}
            if kind == "training":
                period["end"] = (datetime.fromisoformat(points[-1]["week"]) + timedelta(weeks=1)).date().isoformat()
        executed_at = datetime.now(timezone.utc)
        executed_at = executed_at.replace(microsecond=executed_at.microsecond // 1000 * 1000)
        document = {"schema_version": 1, "run_id": str(payload.run_id), "scope": scope,
                    "kind": kind, "status": "completed", "algorithm_version": version,
                    "period": period, "parameters": parameters, "source_revision": payload.source_revision,
                    "source_kind": payload.source_kind, "input_hash": digest, "results": result,
                    "executed_at": executed_at}
        return {"data": await repository.save(document)}

    @app.post("/internal/v1/risk-runs", response_model=RunEnvelope, tags=["runs"])
    async def risk(payload: RiskRequest, scope=Depends(scoped_scope)):
        return await execute(payload, "risk", scope)

    @app.post("/internal/v1/training-runs", response_model=RunEnvelope, tags=["models"])
    async def training(payload: TrainingRequest, scope=Depends(scoped_scope)):
        return await execute(payload, "training", scope)

    @app.post("/internal/v1/forecast-runs", response_model=RunEnvelope, tags=["models"])
    async def forecast(payload: ForecastRequest, scope=Depends(scoped_scope)):
        return await execute(payload, "forecast", scope)

    @app.get("/internal/v1/runs/{run_id}", response_model=RunEnvelope, tags=["runs"])
    async def get_run(run_id: UUID, scope=Depends(scoped_scope)):
        document = await app.state.repository.find(run_id, scope)
        if not document:
            raise ServiceError(404, "RUN_NOT_FOUND", "Ejecución no encontrada en el ámbito")
        return {"data": document}

    @app.get("/internal/v1/runs", response_model=ListEnvelope, tags=["runs"])
    async def list_runs(kind: Literal["risk", "training", "forecast"], limit: int = Query(20, ge=1, le=100),
                        offset: int = Query(0, ge=0, le=10000), scope=Depends(scoped_scope)):
        # Consultas independientes de E/S concurrentes, sin ocupar workers CPU.
        repository = app.state.repository
        rows, total = await asyncio.gather(repository.listing(scope, kind, limit, offset),
                                            repository.collection.count_documents({"scope": scope, "kind": kind}))
        return {"data": {"runs": rows, "total": total, "limit": limit, "offset": offset}}

    return app
