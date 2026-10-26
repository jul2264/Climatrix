"""
Domain data models for Truck Route Safety.
As required by AGENTS.md, these are pure dataclasses with no Django imports.
"""

from dataclasses import asdict, dataclass
from typing import Any, Literal

RiskDriver = Literal["wind", "rain", "snow", "load_rule"]


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    lat: float
    lon: float
    eta: str
    wind_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    level: str
    driver: RiskDriver | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RouteSummary:
    no_travel_miles: float
    severe_miles: float
    high_miles: float
    avg_risk: float | None
    distance_mi: float
    duration_min: float
    max_level: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RouteAnalysis:
    id: str
    geometry: dict[str, Any]  # GeoJSON LineString
    distance_mi: float
    duration_min: float
    summary: RouteSummary
    checkpoints: list[Checkpoint]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "geometry": self.geometry,
            "distance_mi": self.distance_mi,
            "duration_min": self.duration_min,
            "summary": self.summary.to_dict(),
            "checkpoints": [cp.to_dict() for cp in self.checkpoints],
        }


@dataclass(frozen=True)
class DepartureCandidate:
    offset_hours: int
    departure_iso: str
    no_travel_miles: float
    severe_miles: float
    high_miles: float
    avg_risk: float | None
    is_drivable: bool
    recommended_route_id: str | None
    max_level: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DepartureOptimization:
    requested_departure: str
    recommended_departure: str
    recommended_offset_hours: int
    severe_miles_eliminated: float
    avg_risk_reduction: float
    is_drivable: bool
    explanation: str
    candidates: list[DepartureCandidate]

    def to_dict(self) -> dict[str, Any]:
        return {
            "requested_departure": self.requested_departure,
            "recommended_departure": self.recommended_departure,
            "recommended_offset_hours": self.recommended_offset_hours,
            "severe_miles_eliminated": self.severe_miles_eliminated,
            "avg_risk_reduction": self.avg_risk_reduction,
            "is_drivable": self.is_drivable,
            "explanation": self.explanation,
            "candidates": [c.to_dict() for c in self.candidates],
        }


@dataclass(frozen=True)
class AnalysisResult:
    routes: list[RouteAnalysis]
    recommended_route_id: str | None
    explanation: str
    departure_optimization: DepartureOptimization | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "routes": [r.to_dict() for r in self.routes],
            "recommended_route_id": self.recommended_route_id,
            "explanation": self.explanation,
        }
        if self.departure_optimization is not None:
            data["departure_optimization"] = self.departure_optimization.to_dict()
        else:
            data["departure_optimization"] = None
        return data


SentinelStatus = Literal["NOMINAL", "ADVISORY", "EMERGENCY"]


@dataclass(frozen=True)
class SentinelAssessment:
    status: SentinelStatus
    current_mile: float
    remaining_miles: float
    remaining_checkpoints: int
    highest_upcoming_risk: str
    hazard_mile: float | None
    hazard_driver: str | None
    time_to_hazard_min: float | None
    escalated_checkpoints: list[dict[str, Any]]
    explanation: str
    bypass_route: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
