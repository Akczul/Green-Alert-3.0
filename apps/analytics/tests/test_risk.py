import json
from pathlib import Path

import pytest

from greenalert_analytics.risk import build_zones

FIXTURE = json.loads(Path("/fixtures/contrato.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: c["name"])
def test_original_contract(case):
    # Los fixtures ya contienen las filas entregadas por su reader; no regenerarlos.
    actual = build_zones(case["rows"], case["params"]["desde"],
                         case["expected"]["actualizado_en"], case["params"]["min_score"])
    assert actual == case["expected"]["zonas"]
