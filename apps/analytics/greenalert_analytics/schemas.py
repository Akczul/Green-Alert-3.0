from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Period(StrictModel):
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def ordered(self):
        if not self.start.tzinfo or not self.end.tzinfo:
            raise ValueError("El período requiere zona horaria explícita")
        if not timedelta(0) < self.end - self.start <= timedelta(days=365):
            raise ValueError("El período debe ser positivo y no mayor de 365 días")
        return self


class Snapshot(StrictModel):
    run_id: UUID
    source_revision: str = Field(min_length=1, max_length=160)
    source_kind: Literal["mysql", "synthetic"]


class Report(StrictModel):
    report_uuid: UUID
    tipo_contaminacion: str = Field(min_length=1, max_length=80)
    subcategoria: str | None = Field(default=None, max_length=100)
    nivel_severidad: Literal["bajo", "medio", "alto", "critico"]
    latitud: Annotated[FiniteFloat, Field(ge=-90, le=90)]
    longitud: Annotated[FiniteFloat, Field(ge=-180, le=180)]
    municipio: str | None = Field(default=None, max_length=120)
    departamento: str | None = Field(default=None, max_length=120)
    created_at: datetime


class RiskRequest(Snapshot):
    period: Period
    min_score: Annotated[FiniteFloat, Field(ge=0, le=100)] = 30
    reports: list[Report] = Field(max_length=20000)

    @model_validator(mode="after")
    def window(self):
        lower = self.period.start - (self.period.end - self.period.start)
        ids = set()
        for row in self.reports:
            if row.report_uuid in ids:
                raise ValueError("UUID de reporte duplicado")
            ids.add(row.report_uuid)
            if not row.created_at.tzinfo or not lower <= row.created_at <= self.period.end:
                raise ValueError("Reporte fuera de las dos ventanas o sin zona horaria")
        return self


class WeeklyPoint(StrictModel):
    week: date
    count: int = Field(strict=True, ge=0, le=1_000_000)


class ZoneHistory(StrictModel):
    # ID de cuadrícula vigente; no se inventan UUID para zonas que no los tienen.
    zone_id: str = Field(pattern=r"^-?\d{1,3}\.\d{4}:-?\d{1,3}\.\d{4}$")
    points: list[WeeklyPoint] = Field(min_length=4, max_length=520)

    @model_validator(mode="after")
    def contiguous(self):
        for i, point in enumerate(self.points):
            if point.week.weekday() != 0:
                raise ValueError("Cada semana comienza en lunes UTC")
            if i and point.week - self.points[i - 1].week != timedelta(days=7):
                raise ValueError("Semanas ordenadas y contiguas; incluir ceros explícitos")
        return self


class TrainingRequest(Snapshot):
    histories: list[ZoneHistory] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def aligned(self):
        if len({h.zone_id for h in self.histories}) != len(self.histories):
            raise ValueError("Zona duplicada")
        dates = [p.week for p in self.histories[0].points]
        if len(dates) < 20:
            raise ValueError("Se necesitan al menos 20 semanas completas por zona")
        if any([p.week for p in h.points] != dates for h in self.histories):
            raise ValueError("Todas las zonas deben cubrir las mismas semanas")
        return self


class ForecastRequest(Snapshot):
    model_id: UUID
    histories: list[ZoneHistory] = Field(min_length=1, max_length=100)
    horizon_weeks: int = Field(default=1, strict=True, ge=1, le=8)

    @model_validator(mode="after")
    def unique(self):
        if len({h.zone_id for h in self.histories}) != len(self.histories):
            raise ValueError("Zona duplicada")
        ends = {h.points[-1].week for h in self.histories}
        if len(ends) != 1:
            raise ValueError("Las historias deben terminar en la misma semana")
        return self


class ErrorEnvelope(BaseModel):
    status: Literal["error"] = "error"
    message: str
    code: str


class RiskZone(StrictModel):
    id: str
    zona_id: str
    centro: dict[str, float]
    tipo_dominante: str
    subcategoria_dominante: str | None
    municipio: str | None
    departamento: str | None
    n_reportes: int
    n_reportes_previo: int
    tendencia: Literal["subiendo", "bajando", "estable"]
    severidad_promedio: float
    ultimo_reporte: str | None
    score: int
    nivel: Literal["bajo", "medio", "alto", "critico"]


class RiskResult(StrictModel):
    actualizado_en: str
    celda_grados: float
    zonas: list[RiskZone]


class Evaluation(StrictModel):
    mae: float
    rmse: float
    r2: float | None
    baseline_lag1_mae: float
    train_samples: int
    test_samples: int
    train_through: str
    test_from: str
    test_through: str
    protocol: Literal["temporal_holdout_one_step_observed_lags"]


class TrainingResult(StrictModel):
    model_id: UUID
    model_version: str
    library_version: str
    source_kind: Literal["mysql", "synthetic"]
    anchor: str
    trained_through: str
    zones: list[str]
    feature_names: list[str]
    coefficients: list[float]
    intercept: float
    metrics: Evaluation
    fit_samples: int
    warning: str


class WeeklyPrediction(StrictModel):
    week: str
    expected_reports: float


class ZonePrediction(StrictModel):
    zone_id: str
    predictions: list[WeeklyPrediction]


class ForecastResult(StrictModel):
    model_id: UUID
    model_version: str
    training_source_kind: Literal["mysql", "synthetic"]
    inference_source_kind: Literal["mysql", "synthetic"]
    synthetic: bool
    warning: str
    zones: list[ZonePrediction]


class RunMetadata(StrictModel):
    schema_version: Literal[1]
    run_id: UUID
    scope: str
    kind: Literal["risk", "training", "forecast"]
    status: Literal["completed"]
    algorithm_version: str
    period: dict[str, str]
    parameters: dict
    source_revision: str
    source_kind: Literal["mysql", "synthetic"]
    input_hash: str
    executed_at: datetime


class RunRecord(RunMetadata):
    results: RiskResult | TrainingResult | ForecastResult


class RunEnvelope(BaseModel):
    status: Literal["success"] = "success"
    message: str = "ok"
    data: RunRecord


class RunListing(StrictModel):
    runs: list[RunMetadata]
    total: int
    limit: int
    offset: int


class ListEnvelope(BaseModel):
    status: Literal["success"] = "success"
    message: str = "ok"
    data: RunListing
