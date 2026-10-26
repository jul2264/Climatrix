"""
Unit tests for eta.py:
- Monotonic ETAs across all checkpoints
- Final ETA equals departure + total duration (* truck_speed_factor)
- Accurate step/segment duration interpolation
- ISO 8601 formatting with proper timezone offset
"""

from datetime import UTC, datetime

from routing.services.eta import (
    calculate_checkpoint_etas,
    interpolate_cumulative_duration,
)


def test_interpolate_cumulative_duration_uniform():
    total_distance = 100.0
    total_duration = 7200.0  # 2 hours

    # Mile 0 -> 0s
    assert interpolate_cumulative_duration(0.0, total_distance, total_duration) == 0.0
    # Mile 50 -> 3600s
    assert interpolate_cumulative_duration(50.0, total_distance, total_duration) == 3600.0
    # Mile 100 -> 7200s
    assert interpolate_cumulative_duration(100.0, total_distance, total_duration) == 7200.0


def test_interpolate_cumulative_duration_with_segments():
    # Two segments:
    # Segment 1: 40 miles, took 3600s (slow city driving)
    # Segment 2: 60 miles, took 3600s (fast highway driving)
    # Total: 100 miles, 7200s
    segments = [
        {"distance_miles": 40.0, "duration_seconds": 3600.0},
        {"distance_miles": 60.0, "duration_seconds": 3600.0},
    ]

    total_dist = 100.0
    total_dur = 7200.0

    # Mile 0
    assert interpolate_cumulative_duration(0.0, total_dist, total_dur, segments) == 0.0
    # Mile 20 (half of segment 1) -> 1800s
    assert interpolate_cumulative_duration(20.0, total_dist, total_dur, segments) == 1800.0
    # Mile 40 (end of segment 1) -> 3600s
    assert interpolate_cumulative_duration(40.0, total_dist, total_dur, segments) == 3600.0
    # Mile 70 (halfway through segment 2: 40 + 30) -> 3600 + 1800 = 5400s
    assert interpolate_cumulative_duration(70.0, total_dist, total_dur, segments) == 5400.0
    # Mile 100 -> 7200s
    assert interpolate_cumulative_duration(100.0, total_dist, total_dur, segments) == 7200.0


def test_calculate_checkpoint_etas_monotonic_and_exact_end():
    departure = datetime(2026, 10, 25, 8, 0, 0, tzinfo=UTC)
    total_dist = 200.0
    total_duration_sec = 14400.0  # 4 hours (ends at 12:00:00)
    truck_speed_factor = 1.0

    checkpoints = [
        {"mile": 0.0, "lat": 40.0, "lon": -80.0},
        {"mile": 25.0, "lat": 40.1, "lon": -80.2},
        {"mile": 50.0, "lat": 40.2, "lon": -80.4},
        {"mile": 100.0, "lat": 40.5, "lon": -80.8},
        {"mile": 150.0, "lat": 40.8, "lon": -81.2},
        {"mile": 200.0, "lat": 41.0, "lon": -81.5},
    ]

    result = calculate_checkpoint_etas(
        checkpoints=checkpoints,
        departure_dt=departure,
        total_distance_miles=total_dist,
        total_duration_seconds=total_duration_sec,
        truck_speed_factor=truck_speed_factor,
    )

    assert len(result) == len(checkpoints)

    # Mile 0 ETA equals departure
    assert result[0]["eta"] == departure.isoformat()

    # Final ETA equals departure + total_duration_seconds * truck_speed_factor
    expected_final = datetime(2026, 10, 25, 12, 0, 0, tzinfo=UTC)
    assert result[-1]["eta"] == expected_final.isoformat()

    # Monotonicity check
    dt_list = [datetime.fromisoformat(cp["eta"]) for cp in result]
    for i in range(1, len(dt_list)):
        assert dt_list[i] >= dt_list[i - 1], f"ETA not monotonic at index {i}"


def test_calculate_checkpoint_etas_with_truck_speed_factor():
    departure = datetime(2026, 10, 25, 8, 0, 0, tzinfo=UTC)
    total_dist = 100.0
    total_duration_sec = 3600.0  # 1 hour
    truck_speed_factor = 1.25  # takes 1.25 hours (4500 seconds)

    checkpoints = [
        {"mile": 0.0, "lat": 40.0, "lon": -80.0},
        {"mile": 100.0, "lat": 41.0, "lon": -80.0},
    ]

    result = calculate_checkpoint_etas(
        checkpoints=checkpoints,
        departure_dt=departure,
        total_distance_miles=total_dist,
        total_duration_seconds=total_duration_sec,
        truck_speed_factor=truck_speed_factor,
    )

    expected_final = datetime(2026, 10, 25, 9, 15, 0, tzinfo=UTC)
    assert result[-1]["eta"] == expected_final.isoformat()
