import copy

import pytest

from greenalert_analytics.ml import forecast_job, train_job
from scripts.synthetic import training_payload


def test_reproducible_training_and_future_independence():
    payload = training_payload()
    a = train_job(payload)
    b = train_job(payload)
    assert a == b
    assert a["metrics"]["train_through"] < a["metrics"]["test_from"]
    assert a["metrics"]["mae"] < a["metrics"]["baseline_lag1_mae"]
    assert a["metrics"]["train_samples"] + a["metrics"]["test_samples"] == a["fit_samples"]
    assert "sintética" in a["warning"]
    prediction = forecast_job({**payload, "horizon_weeks": 3}, a)
    assert prediction["synthetic"]
    assert all(len(z["predictions"]) == 3 for z in prediction["zones"])
    assert all(p["expected_reports"] >= 0 for z in prediction["zones"] for p in z["predictions"])


def test_unknown_zone_rejected():
    payload = training_payload()
    model = train_job(payload)
    payload["histories"][0]["zone_id"] = "0.0000:0.0000"
    with pytest.raises(ValueError, match="Zona"):
        forecast_job({**payload, "horizon_weeks": 1}, model)


def test_holdout_has_no_future_target_in_features():
    # Alterar solo el último objetivo no cambia su predicción ni objetivos anteriores.
    payload = training_payload()
    altered = copy.deepcopy(payload)
    for h in altered["histories"]:
        h["points"][-1]["count"] += 100
    a, b = train_job(payload), train_job(altered)
    assert a["metrics"]["train_through"] == b["metrics"]["train_through"]
    assert b["metrics"]["mae"] > a["metrics"]["mae"]
