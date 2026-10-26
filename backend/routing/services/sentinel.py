"""
Pure Corridor Sentinel Service.
Monitors an active truck corridor in real time against updated weather forecasts.
Detects hazard emergence (e.g. wind escalation or storm front arrival),
computes time-to-hazard, and enforces tri-state safety policies:
NOMINAL -> ADVISORY -> EMERGENCY.

Pure module: no Django imports, no HTTP, no I/O.
"""

from datetime import datetime, timedelta
from typing import Any

from routing.services.constants import RiskLevel
from routing.services.optimizer import match_forecast_at_datetime
from routing.services.risk import classify_checkpoint_risk
from routing.services.types import Checkpoint, SentinelAssessment, SentinelStatus


def evaluate_corridor_sentinel(
    checkpoints: list[Checkpoint],
    current_mile: float,
    current_time: datetime,
    load_lb: float,
    fresh_weather_by_checkpoint: list[dict[str, Any]],
    average_speed_mph: float = 55.0,
) -> SentinelAssessment:
    """
    Evaluates upcoming checkpoints along the active corridor against fresh weather data.

    Args:
        checkpoints: Full list of checkpoints for the active route.
        current_mile: Current odometer/mile progress of the vehicle.
        current_time: Current evaluation timestamp.
        load_lb: Cargo weight in pounds.
        fresh_weather_by_checkpoint: Updated weather forecasts aligned with checkpoints.
        average_speed_mph: Assumed travel speed for remaining segment ETAs.

    Returns:
        SentinelAssessment with tri-state status, time-to-hazard countdown, and escalations.
    """
    total_route_miles = checkpoints[-1].mile if checkpoints else 0.0
    remaining_miles = max(0.0, total_route_miles - current_mile)

    # 1. Partition checkpoints into active horizon (mile >= current_mile)
    upcoming: list[tuple[Checkpoint, dict[str, Any]]] = []
    for cp, wx in zip(checkpoints, fresh_weather_by_checkpoint):
        if cp.mile >= current_mile:
            upcoming.append((cp, wx))

    if not upcoming:
        return SentinelAssessment(
            status="NOMINAL",
            current_mile=current_mile,
            remaining_miles=0.0,
            remaining_checkpoints=0,
            highest_upcoming_risk=RiskLevel.LOW.label,
            hazard_mile=None,
            hazard_driver=None,
            time_to_hazard_min=None,
            escalated_checkpoints=[],
            explanation="Trip completed. Vehicle has traversed all corridor checkpoints.",
        )

    # 2. Evaluate risk for upcoming checkpoints with fresh weather
    escalations: list[dict[str, Any]] = []
    max_risk_lvl = RiskLevel.LOW
    first_no_travel_data: tuple[float, str | None, float] | None = None
    first_severe_data: tuple[float, str | None, float] | None = None

    for cp, wx in upcoming:
        dist_to_cp = max(0.0, cp.mile - current_mile)
        minutes_to_cp = (dist_to_cp / max(1.0, average_speed_mph)) * 60.0
        est_arrival_dt = current_time + timedelta(minutes=minutes_to_cp)

        wind, rain, snow = match_forecast_at_datetime(wx, est_arrival_dt)
        new_risk, driver = classify_checkpoint_risk(
            wind_mph=wind,
            rain_in_hr=rain,
            snow_in_hr=snow,
            load_lb=load_lb,
        )

        baseline_lvl = RiskLevel.from_string(cp.level)
        if new_risk > baseline_lvl:
            escalations.append(
                {
                    "mile": cp.mile,
                    "old_level": cp.level,
                    "new_level": new_risk.label,
                    "driver": driver,
                    "miles_away": round(dist_to_cp, 1),
                    "minutes_away": round(minutes_to_cp, 0),
                }
            )

        if new_risk > max_risk_lvl:
            max_risk_lvl = new_risk

        if new_risk == RiskLevel.NO_TRAVEL and first_no_travel_data is None:
            first_no_travel_data = (cp.mile, driver, minutes_to_cp)

        if new_risk == RiskLevel.SEVERE and first_severe_data is None:
            first_severe_data = (cp.mile, driver, minutes_to_cp)

    # 3. Tri-state Policy Evaluation
    status: SentinelStatus
    hazard_mile: float | None = None
    hazard_driver: str | None = None
    time_to_hazard_min: float | None = None
    explanation: str

    if first_no_travel_data is not None:
        status = "EMERGENCY"
        hazard_mile, hazard_driver, time_to_hazard_min = first_no_travel_data
        time_to_hazard_min = round(time_to_hazard_min, 0)
        explanation = (
            f"CRITICAL: Extreme conditions at Mile {hazard_mile:.1f} exceed safe truck operating limits "
            f"({hazard_driver}). Time to hazard impact: ~{int(time_to_hazard_min)} min. "
            "Autonomous diversion or emergency rest haven recommended immediately."
        )
    elif first_severe_data is not None:
        status = "ADVISORY"
        hazard_mile, hazard_driver, time_to_hazard_min = first_severe_data
        time_to_hazard_min = round(time_to_hazard_min, 0)
        explanation = (
            f"ADVISORY: Severe weather developing ahead at Mile {hazard_mile:.1f} "
            f"due to {hazard_driver}. Time to onset: ~{int(time_to_hazard_min)} min. "
            "Prepare to reduce speed and monitor vehicle stability."
        )
    else:
        status = "NOMINAL"
        explanation = (
            "Corridor Clear. Real-time atmospheric models project safe travel "
            f"({max_risk_lvl.label}) along remaining {remaining_miles:.1f} miles."
        )

    return SentinelAssessment(
        status=status,
        current_mile=round(current_mile, 1),
        remaining_miles=round(remaining_miles, 1),
        remaining_checkpoints=len(upcoming),
        highest_upcoming_risk=max_risk_lvl.label,
        hazard_mile=hazard_mile,
        hazard_driver=hazard_driver,
        time_to_hazard_min=time_to_hazard_min,
        escalated_checkpoints=escalations,
        explanation=explanation,
    )
