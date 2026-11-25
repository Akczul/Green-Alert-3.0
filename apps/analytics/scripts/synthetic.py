"""Datos sintéticos deterministas, sin personas ni reportes reales."""
import math
import random
from datetime import date, timedelta
from uuid import NAMESPACE_URL, uuid4, uuid5


def training_payload(seed=20261124, weeks=104, zones=4):
    rng = random.Random(seed)
    histories = []
    for z in range(zones):
        points = []
        for i in range(weeks):
            week = date(2024, 1, 1) + timedelta(weeks=i)
            seasonal = 8 * math.sin(2 * math.pi * week.isocalendar().week / 52.18)
            count = max(0, round(25 + z * 6 + i * 0.12 + seasonal + rng.gauss(0, 2)))
            points.append({"week": week.isoformat(), "count": count})
        histories.append({"zone_id": f"{1 + z * .05:.4f}:-76.6500", "points": points})
    return {"run_id": str(uuid4()), "source_revision": f"synthetic-weekly-v1-seed-{seed}",
            "source_kind": "synthetic", "histories": histories}


def risk_payload(size=1000, batch=0):
    rows = []
    for i in range(size):
        rows.append({"report_uuid": str(uuid5(NAMESPACE_URL, f"greenalert-synthetic:{batch}:{i}")),
            "tipo_contaminacion": ["agua", "aire", "suelo"][i % 3],
            "nivel_severidad": ["bajo", "medio", "alto", "critico"][i % 4],
            "latitud": 1.15 + (i % 100) * .051, "longitud": -76.65 + ((i // 100) % 100) * .051,
            "municipio": "Sintético", "departamento": "Sintético",
            "created_at": f"2026-11-{1 + i % 20:02d}T12:00:00Z"})
    return {"run_id": str(uuid4()), "source_revision": "synthetic-risk-v1", "source_kind": "synthetic",
            "period": {"start": "2026-11-01T00:00:00Z", "end": "2026-11-24T00:00:00Z"},
            "min_score": 0, "reports": rows}


if __name__ == "__main__":
    import json
    print(json.dumps(training_payload(), ensure_ascii=False))
