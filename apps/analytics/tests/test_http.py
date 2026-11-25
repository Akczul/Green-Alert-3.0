import asyncio
import copy
import os
import socket
import subprocess
import sys
import time
from uuid import uuid4

import httpx
import pytest
from pymongo import MongoClient

from scripts.synthetic import risk_payload, training_payload

BASE = os.environ["ANALYTICS_TEST_URL"]
HEADERS = {"Authorization": "Bearer " + os.environ["ANALYTICS_INTERNAL_TOKEN"],
           "X-Analytics-Scope": "test-http"}


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE, headers=HEADERS, timeout=45) as client:
        yield client


def test_live_ready_openapi(client):
    assert httpx.get(BASE + "/health/live").status_code == 200
    assert client.get("/health/ready").json()["mongodb"] == "ok"
    schema = client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["HTTPBearer"]
    assert "/internal/v1/training-runs" in schema["paths"]


@pytest.mark.parametrize("path", ["/health/ready", "/internal/v1/runs?kind=risk"])
@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer invalid", "X-Analytics-Scope": "test-http"}])
def test_authorization(path, headers):
    response = httpx.get(BASE + path, headers=headers)
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_post_without_credentials():
    response = httpx.post(BASE + "/internal/v1/risk-runs", json=risk_payload(1))
    assert response.status_code == 401


def test_risk_persistence_idempotency_scope(client):
    payload = risk_payload(5)
    response = client.post("/internal/v1/risk-runs", json=payload)
    assert response.status_code == 200, response.text
    run = response.json()["data"]
    assert run["results"]["zonas"]
    assert run["algorithm_version"] == "grid-risk-a79b6ba-python-v1"
    assert "reports" not in run
    repeated = client.post("/internal/v1/risk-runs", json=payload)
    assert repeated.json() == response.json()
    read = client.get("/internal/v1/runs/" + payload["run_id"])
    assert read.json() == response.json()
    assert client.get("/internal/v1/runs/" + payload["run_id"], headers={"X-Analytics-Scope": "another-scope"}).status_code == 404
    payload["min_score"] = 90
    assert client.post("/internal/v1/risk-runs", json=payload).status_code == 409
    with MongoClient(os.environ["ANALYTICS_MONGO_URI"]) as mongo:
        collection = mongo.greenalert_analytics.analytics_runs
        stored = collection.find_one({"run_id": run["run_id"]})
        assert stored["input_hash"] == run["input_hash"]
        assert collection.count_documents({"run_id": run["run_id"]}) == 1
        assert collection.index_information()["run_id_unique"]["unique"]
        assert "scope_kind_time" in collection.index_information()


@pytest.mark.parametrize("mutation", [
    lambda p: p.update(min_score=101),
    lambda p: p.update(unrecognized="field"),
    lambda p: p["reports"][0].update(latitud=91),
    lambda p: p["reports"][0].update(created_at="2026-01-01T00:00:00Z"),
    lambda p: p["reports"].append(copy.deepcopy(p["reports"][0])),
    lambda p: p["period"].update(end=p["period"]["start"]),
    lambda p: p["reports"][0].update(created_at="2026-11-10T00:00:00"),
])
def test_invalid_risk(client, mutation):
    payload = risk_payload(1)
    mutation(payload)
    response = client.post("/internal/v1/risk-runs", json=payload)
    assert response.status_code == 422
    assert set(response.json()) == {"status", "message", "code"}


@pytest.mark.parametrize("mutation", [
    lambda p: p["histories"][0]["points"][0].update(count=-1),
    lambda p: p["histories"][0]["points"][0].update(count=True),
    lambda p: p["histories"][0]["points"].pop(3),
    lambda p: p.update(histories=[{**p["histories"][0], "points": p["histories"][0]["points"][:10]}]),
])
def test_invalid_training(client, mutation):
    payload = training_payload()
    mutation(payload)
    assert client.post("/internal/v1/training-runs", json=payload).status_code == 422


def test_training_inference(client):
    payload = training_payload()
    trained = client.post("/internal/v1/training-runs", json=payload)
    assert trained.status_code == 200, trained.text
    model = trained.json()["data"]["results"]
    assert model["metrics"]["train_samples"] > model["metrics"]["test_samples"]
    forecast = {**payload, "run_id": str(uuid4()), "model_id": payload["run_id"], "horizon_weeks": 4}
    inferred = client.post("/internal/v1/forecast-runs", json=forecast)
    assert inferred.status_code == 200, inferred.text
    assert inferred.json()["data"]["results"]["synthetic"] is True
    assert len(inferred.json()["data"]["results"]["zones"][0]["predictions"]) == 4
    forecast["run_id"] = str(uuid4())
    forecast["histories"][0]["zone_id"] = "0.0000:0.0000"
    assert client.post("/internal/v1/forecast-runs", json=forecast).status_code == 422
    forecast["model_id"] = str(uuid4())
    assert client.post("/internal/v1/forecast-runs", json=forecast).status_code == 404


def test_pagination_and_missing(client):
    assert client.get("/internal/v1/runs?kind=risk&limit=1").json()["data"]["limit"] == 1
    assert client.get("/internal/v1/runs?kind=risk&limit=101").status_code == 422
    assert client.get("/internal/v1/runs/" + str(uuid4())).status_code == 404
    assert client.get("/internal/v1/runs/not-a-uuid").status_code == 422
    assert client.get("/internal/v1/runs?kind=risk", headers={"X-Analytics-Scope": "bad scope"}).status_code == 422


def test_body_limit(client):
    response = client.post("/internal/v1/risk-runs", content=b" " * 8_000_001,
                           headers={"Content-Type": "application/json"})
    assert response.status_code == 413


@pytest.mark.asyncio
async def test_concurrent_replay_single_document():
    payload = risk_payload(2)
    async with httpx.AsyncClient(base_url=BASE, headers=HEADERS, timeout=45) as client:
        responses = await asyncio.gather(*(client.post("/internal/v1/risk-runs", json=payload) for _ in range(2)))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
    assert responses[0].json() == responses[1].json()
    with MongoClient(os.environ["ANALYTICS_MONGO_URI"]) as mongo:
        assert mongo.greenalert_analytics.analytics_runs.count_documents({"run_id": payload["run_id"]}) == 1


def test_real_http_compute_timeout_does_not_persist():
    # Servidor real separado con deadline mínimo; misma persistencia aislada del runner.
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    env = {**os.environ, "ANALYTICS_COMPUTE_TIMEOUT_SECONDS": "0.01",
           "ANALYTICS_CPU_WORKERS": "1", "ANALYTICS_MAX_CPU_JOBS": "1"}
    process = subprocess.Popen([sys.executable, "-m", "uvicorn", "greenalert_analytics.main:create_app",
        "--factory", "--host", "127.0.0.1", "--port", str(port), "--no-access-log"],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(150):
            assert process.poll() is None, "Servidor de timeout terminó antes de iniciar"
            try:
                if httpx.get(base + "/health/live", timeout=.5).status_code == 200:
                    break
            except httpx.TransportError:
                pass
            time.sleep(.1)
        payload = risk_payload(20000)
        response = httpx.post(base + "/internal/v1/risk-runs", headers=HEADERS, json=payload, timeout=15)
        assert response.status_code == 504, response.text
        assert response.json()["code"] == "COMPUTE_TIMEOUT"
        with MongoClient(os.environ["ANALYTICS_MONGO_URI"]) as mongo:
            assert mongo.greenalert_analytics.analytics_runs.count_documents({"run_id": payload["run_id"]}) == 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
