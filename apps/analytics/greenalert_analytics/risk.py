"""Port del dominio de zonas de a79b6ba; sin red, SQL ni reloj global."""
import math
from collections import Counter
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

ALGORITHM_VERSION = "grid-risk-a79b6ba-python-v1"
CELL = 0.05
RANK = {"bajo": 1, "medio": 2, "alto": 3, "critico": 4}


def fixed(value, digits):
    # toFixed de JS redondea la representación binaria, no la decimal ideal.
    value = 0.0 if value == 0 else value
    return format(Decimal.from_float(value).quantize(Decimal(10) ** -digits,
                  rounding=ROUND_HALF_UP), f".{digits}f")


def grid_key(lat, lng):
    return ":".join(fixed(math.floor(float(x) / CELL) * CELL, 4) for x in (lat, lng))


def parse_time(value):
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def build_zones(reports, cutoff, now, min_score=30):
    current, previous = {}, {}
    cutoff, now = parse_time(cutoff), parse_time(now)
    for row in reports:
        try:
            key = grid_key(row["latitud"], row["longitud"])
        except (ValueError, TypeError, OverflowError):
            continue
        try:
            recent = parse_time(row["created_at"]) >= cutoff
        except (ValueError, TypeError):
            recent = False
        (current if recent else previous).setdefault(key, []).append(row)

    zones = []
    for key, rows in current.items():
        severity = sum(RANK.get(r["nivel_severidad"], 1) for r in rows) / len(rows)
        recency = 0
        latest = None
        for row in rows:
            try:
                timestamp = parse_time(row["created_at"])
                age = max(0, (now - timestamp).total_seconds() / 86400)
                if latest is None or timestamp > latest:
                    latest = timestamp
            except (ValueError, TypeError):
                age = 365
            recency += max(0, 30 - age)
        score = min(100, math.floor(len(rows) * 16 + severity * 14 + recency / len(rows) + 0.5))
        if score < min_score:
            continue
        prev = len(previous.get(key, []))
        ratio = len(rows) / prev if prev else math.inf
        trend = "subiendo" if ratio >= 1.2 else "bajando" if ratio <= 0.8 else "estable"
        lat, lng = map(float, key.split(":"))

        def dominant(field):
            counts = Counter(r.get(field) for r in rows if r.get(field))
            return counts.most_common(1)[0][0] if counts else None

        zones.append({
            "id": key, "zona_id": key,
            "centro": {"lat": float(fixed(lat + CELL / 2, 6)), "lng": float(fixed(lng + CELL / 2, 6))},
            "tipo_dominante": dominant("tipo_contaminacion") or "otro",
            "subcategoria_dominante": dominant("subcategoria"),
            "municipio": dominant("municipio"), "departamento": dominant("departamento"),
            "n_reportes": len(rows), "n_reportes_previo": prev, "tendencia": trend,
            "severidad_promedio": float(fixed(severity, 2)),
            "ultimo_reporte": latest.isoformat(timespec="milliseconds").replace("+00:00", "Z") if latest else None,
            "score": score,
            "nivel": next(level for threshold, level in [(80, "critico"), (60, "alto"), (35, "medio"), (0, "bajo")] if score >= threshold),
        })
    return sorted(zones, key=lambda z: (-z["score"], -z["n_reportes"]))


def risk_job(payload):
    period = payload["period"]
    return {"actualizado_en": parse_time(period["end"]).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "celda_grados": CELL,
            "zonas": build_zones(payload["reports"], period["start"], period["end"], payload["min_score"])}
