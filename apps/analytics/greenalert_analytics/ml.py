"""Regresión múltiple con evaluación temporal y artefacto JSON sin pickle."""
import math
from datetime import date, timedelta

import numpy as np
from sklearn import __version__ as sklearn_version
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ALGORITHM_VERSION = "weekly-count-ols-v1"
FEATURES = ["lag_1", "lag_2", "mean_4", "season_sin", "season_cos", "trend_weeks"]


def features(history, target, anchor, zone, zones):
    target = date.fromisoformat(target) if isinstance(target, str) else target
    anchor = date.fromisoformat(anchor) if isinstance(anchor, str) else anchor
    week = target.isocalendar().week
    return [history[-1], history[-2], sum(history[-4:]) / 4,
            math.sin(2 * math.pi * week / 52.18), math.cos(2 * math.pi * week / 52.18),
            (target - anchor).days / 7] + [int(zone == z) for z in zones[1:]]


def train_job(payload):
    histories = payload["histories"]
    zones = sorted(h["zone_id"] for h in histories)
    dates = [p["week"] for p in histories[0]["points"]]
    split = len(dates) - max(4, math.ceil((len(dates) - 4) * 0.2))
    train_x, train_y, test_x, test_y, baseline = [], [], [], [], []
    for h in histories:
        counts = [p["count"] for p in h["points"]]
        for i in range(4, len(dates)):
            x = features(counts[:i], dates[i], dates[0], h["zone_id"], zones)
            if i < split:
                train_x.append(x)
                train_y.append(counts[i])
            else:
                test_x.append(x)
                test_y.append(counts[i])
                baseline.append(counts[i - 1])
    if len(train_x) <= len(FEATURES) + len(zones) - 1:
        raise ValueError("Muestras insuficientes para el número de variables")
    model = LinearRegression().fit(train_x, train_y)
    predictions = np.maximum(0, model.predict(test_x))
    metrics = {
        "mae": float(mean_absolute_error(test_y, predictions)),
        "rmse": float(math.sqrt(mean_squared_error(test_y, predictions))),
        "r2": float(r2_score(test_y, predictions)) if len(set(test_y)) > 1 else None,
        "baseline_lag1_mae": float(mean_absolute_error(test_y, baseline)),
        "train_samples": len(train_y), "test_samples": len(test_y),
        "train_through": dates[split - 1], "test_from": dates[split], "test_through": dates[-1],
        "protocol": "temporal_holdout_one_step_observed_lags",
    }
    # Métricas de holdout antes del ajuste final; nunca evaluar sobre ese ajuste.
    model.fit(train_x + test_x, train_y + test_y)
    return {"model_id": payload["run_id"], "model_version": ALGORITHM_VERSION,
            "library_version": sklearn_version, "source_kind": payload["source_kind"],
            "anchor": dates[0], "trained_through": dates[-1], "zones": zones,
            "feature_names": FEATURES + [f"zone:{z}" for z in zones[1:]],
            "coefficients": model.coef_.tolist(), "intercept": float(model.intercept_),
            "metrics": metrics, "fit_samples": len(train_y) + len(test_y),
            "warning": "Validación sintética; no acredita precisión predictiva real." if payload["source_kind"] == "synthetic" else
                       "Evaluación retrospectiva de un paso; no estima precisión multisemana ni causalidad ambiental."}


def forecast_job(payload, model):
    if model["model_version"] != ALGORITHM_VERSION:
        raise ValueError("Versión del modelo incompatible")
    output = []
    for h in payload["histories"]:
        if h["zone_id"] not in model["zones"]:
            raise ValueError("Zona no presente en el entrenamiento")
        last = date.fromisoformat(h["points"][-1]["week"])
        if last < date.fromisoformat(model["trained_through"]):
            raise ValueError("La historia de inferencia precede al fin del entrenamiento")
        counts = [p["count"] for p in h["points"]]
        predictions = []
        for i in range(1, payload["horizon_weeks"] + 1):
            target = last + timedelta(weeks=i)
            x = features(counts, target, model["anchor"], h["zone_id"], model["zones"])
            prediction = max(0.0, float(np.dot(x, model["coefficients"]) + model["intercept"]))
            if not math.isfinite(prediction) or prediction > 1_000_000:
                raise ValueError("Predicción fuera del rango operativo")
            counts.append(prediction)
            predictions.append({"week": target.isoformat(), "expected_reports": prediction})
        output.append({"zone_id": h["zone_id"], "predictions": predictions})
    synthetic = "synthetic" in (model["source_kind"], payload["source_kind"])
    return {"model_id": model["model_id"], "model_version": model["model_version"],
            "training_source_kind": model["source_kind"], "inference_source_kind": payload["source_kind"],
            "synthetic": synthetic,
            "warning": "Datos sintéticos; no acredita precisión predictiva real." if synthetic else model["warning"], "zones": output}
