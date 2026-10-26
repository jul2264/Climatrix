"""
Unit tests for Pure Corridor Sentinel Service.
Tests checkpoint partitioning, hazard detection, time-to-hazard countdowns,
and tri-state safety policy transitions.
"""

from datetime import UTC, datetime

from routing.services.sentinel import evaluate_corridor_sentinel
from routing.services.types import Checkpoint


def _build_weather_stub(wind_mph: float = 12.0) -> dict:
    return {
        "times": ["2026-10-26T12:00", "2026-10-26T13:00", "2026-10-26T14:00"],
        "wind_speed_10m": [wind_mph, wind_mph, wind_mph],
        "rain": [0.0, 0.0, 0.0],
        "snowfall": [0.0, 0.0, 0.0],
    }


def test_sentinel_prunes_past_checkpoints():
    current_time = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)

    # Mile 10 had a severe storm, but the truck is already at Mile 50
    cp1 = Checkpoint(
        mile=10.0,
        lat=41.5,
        lon=-87.5,
        eta="2026-10-26T11:00:00Z",
        wind_mph=60.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="NO_TRAVEL",
        driver="wind",
    )
    cp2 = Checkpoint(
        mile=80.0,
        lat=41.8,
        lon=-86.5,
        eta="2026-10-26T12:35:00Z",
        wind_mph=15.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="LOW",
        driver=None,
    )

    assessment = evaluate_corridor_sentinel(
        checkpoints=[cp1, cp2],
        current_mile=50.0,
        current_time=current_time,
        load_lb=40000,
        fresh_weather_by_checkpoint=[_build_weather_stub(60.0), _build_weather_stub(15.0)],
        average_speed_mph=60.0,
    )

    # The past storm at Mile 10 is ignored; only Mile 80 ahead is evaluated
    assert assessment.status == "NOMINAL"
    assert assessment.current_mile == 50.0
    assert assessment.remaining_miles == 30.0
    assert assessment.remaining_checkpoints == 1
    assert assessment.hazard_mile is None


def test_sentinel_emits_advisory_on_severe_wind():
    current_time = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)

    cp1 = Checkpoint(
        mile=20.0,
        lat=41.5,
        lon=-87.5,
        eta="2026-10-26T12:20:00Z",
        wind_mph=20.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="LOW",
        driver=None,
    )
    cp2 = Checkpoint(
        mile=75.0,
        lat=41.8,
        lon=-86.5,
        eta="2026-10-26T13:15:00Z",
        wind_mph=25.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="MODERATE",
        driver=None,
    )

    # Mile 75 escalates to 48 mph wind with 35,000 lb load -> SEVERE
    assessment = evaluate_corridor_sentinel(
        checkpoints=[cp1, cp2],
        current_mile=15.0,
        current_time=current_time,
        load_lb=25000,
        fresh_weather_by_checkpoint=[_build_weather_stub(20.0), _build_weather_stub(48.0)],
        average_speed_mph=60.0,
    )

    assert assessment.status == "ADVISORY"
    assert assessment.hazard_mile == 75.0
    assert assessment.hazard_driver == "wind"
    # 75 - 15 = 60 miles away at 60 mph -> 60 minutes
    assert assessment.time_to_hazard_min == 60.0
    assert "ADVISORY" in assessment.explanation


def test_sentinel_emits_emergency_on_no_travel():
    current_time = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)

    cp1 = Checkpoint(
        mile=30.0,
        lat=41.5,
        lon=-87.5,
        eta="2026-10-26T12:30:00Z",
        wind_mph=20.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="LOW",
        driver=None,
    )
    cp2 = Checkpoint(
        mile=90.0,
        lat=41.8,
        lon=-86.5,
        eta="2026-10-26T13:30:00Z",
        wind_mph=30.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="MODERATE",
        driver=None,
    )

    # Mile 90 escalates to 58 mph -> NO_TRAVEL
    assessment = evaluate_corridor_sentinel(
        checkpoints=[cp1, cp2],
        current_mile=30.0,
        current_time=current_time,
        load_lb=42000,
        fresh_weather_by_checkpoint=[_build_weather_stub(20.0), _build_weather_stub(58.0)],
        average_speed_mph=60.0,
    )

    assert assessment.status == "EMERGENCY"
    assert assessment.hazard_mile == 90.0
    assert assessment.hazard_driver == "wind"
    # 90 - 30 = 60 miles at 60 mph -> 60 min
    assert assessment.time_to_hazard_min == 60.0
    assert "CRITICAL" in assessment.explanation
    assert len(assessment.escalated_checkpoints) == 1


def test_sentinel_nominal_when_clear():
    current_time = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)

    cp = Checkpoint(
        mile=50.0,
        lat=41.5,
        lon=-87.5,
        eta="2026-10-26T12:50:00Z",
        wind_mph=10.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="LOW",
        driver=None,
    )

    assessment = evaluate_corridor_sentinel(
        checkpoints=[cp],
        current_mile=10.0,
        current_time=current_time,
        load_lb=40000,
        fresh_weather_by_checkpoint=[_build_weather_stub(10.0)],
    )

    assert assessment.status == "NOMINAL"
    assert assessment.highest_upcoming_risk == "LOW"
    assert "Corridor Clear" in assessment.explanation


def test_sentinel_trip_completed():
    current_time = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)

    cp = Checkpoint(
        mile=100.0,
        lat=41.5,
        lon=-87.5,
        eta="2026-10-26T12:00:00Z",
        wind_mph=10.0,
        rain_in_hr=0.0,
        snow_in_hr=0.0,
        level="LOW",
        driver=None,
    )

    assessment = evaluate_corridor_sentinel(
        checkpoints=[cp],
        current_mile=105.0,  # Beyond final mile
        current_time=current_time,
        load_lb=40000,
        fresh_weather_by_checkpoint=[_build_weather_stub(10.0)],
    )

    assert assessment.status == "NOMINAL"
    assert assessment.remaining_miles == 0.0
    assert assessment.remaining_checkpoints == 0
    assert "Trip completed" in assessment.explanation
