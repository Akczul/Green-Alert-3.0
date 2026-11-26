"""Sondas HTTP reales para el runner aislado; nunca imprime secretos."""
import json
import os
import sys
import time
from uuid import uuid4

import httpx

from scripts.synthetic import risk_payload, training_payload


def main():
    mode = sys.argv[1]
    headers = {"Authorization": "Bearer " + os.environ["ANALYTICS_INTERNAL_TOKEN"], "X-Analytics-Scope": "verification"}
    with httpx.Client(base_url=os.environ["ANALYTICS_TEST_URL"], headers=headers, timeout=45) as client:
        def post(path, payload):
            response = client.post("/internal/v1/" + path, json=payload)
            response.raise_for_status()
            return response.json()

        if mode == "seed":
            risk = post("risk-runs", risk_payload(500))
            payload = training_payload()
            training = post("training-runs", payload)
            forecast_payload = {**payload, "model_id": payload["run_id"], "run_id": str(uuid4()), "horizon_weeks": 4}
            forecast = post("forecast-runs", forecast_payload)
            print(json.dumps({"runs": [risk, training, forecast], "forecast_payload": forecast_payload}))
        elif mode == "verify":
            state = json.load(sys.stdin)
            for expected in state["runs"]:
                actual = client.get("/internal/v1/runs/" + expected["data"]["run_id"])
                actual.raise_for_status()
                assert actual.json() == expected
            # Nueva inferencia usa modelo recuperado de Mongo, no memoria del proceso anterior.
            payload = state["forecast_payload"]
            payload["run_id"] = str(uuid4())
            new_forecast = post("forecast-runs", payload)
            assert new_forecast["data"]["results"] == state["runs"][2]["data"]["results"]
            print(json.dumps({"recovered_runs": 3, "new_inference_after_restart": True,
                              "metrics": state["runs"][1]["data"]["results"]["metrics"]}))
        elif mode == "outage":
            response = client.get("/health/ready")
            assert response.status_code == 503, response.text
            response = client.post("/internal/v1/risk-runs", json=risk_payload(1))
            assert response.status_code == 503, response.text
            assert "data" not in response.json()
            assert response.json()["code"] == "STORAGE_UNAVAILABLE"
            assert client.get("/health/live").status_code == 200
            print(json.dumps({"readiness_during_outage": 503, "write_during_outage": 503, "liveness": 200}))
        elif mode == "wait":
            for _ in range(90):
                try:
                    if client.get("/health/ready").status_code == 200:
                        return
                except httpx.TransportError:
                    pass
                time.sleep(1)
            raise RuntimeError("Servicio no recuperado en 90 segundos")
        elif mode == "openapi":
            response = client.get("/openapi.json")
            response.raise_for_status()
            print(json.dumps(response.json(), ensure_ascii=False, indent=2))
        else:
            raise ValueError("Modo desconocido")


if __name__ == "__main__":
    main()
