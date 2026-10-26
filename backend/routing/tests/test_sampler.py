"""
Unit tests for sampler.py:
- Spacing and count on a synthetic line
- Start (mile 0) and end checkpoints always included
- Each adaptive interval tier: <100 mi (10 mi), 100-300 mi (25 mi), >300 mi (50 mi)
- Override interval_miles (10, 25, 50)
"""

import pytest

from routing.services.constants import (
    INTERVAL_TIER_LONG,
    INTERVAL_TIER_MEDIUM,
    INTERVAL_TIER_SHORT,
)
from routing.services.sampler import (
    determine_sampling_interval,
    generate_checkpoint_targets,
    sample_checkpoints,
)


def test_determine_sampling_interval_adaptive():
    # Route < 100 miles -> 10 miles
    assert determine_sampling_interval(50.0) == INTERVAL_TIER_SHORT
    assert determine_sampling_interval(99.9) == INTERVAL_TIER_SHORT

    # Route 100 - 300 miles -> 25 miles
    assert determine_sampling_interval(100.0) == INTERVAL_TIER_MEDIUM
    assert determine_sampling_interval(250.0) == INTERVAL_TIER_MEDIUM
    assert determine_sampling_interval(300.0) == INTERVAL_TIER_MEDIUM

    # Route > 300 miles -> 50 miles
    assert determine_sampling_interval(300.1) == INTERVAL_TIER_LONG
    assert determine_sampling_interval(500.0) == INTERVAL_TIER_LONG


def test_determine_sampling_interval_override():
    # Valid overrides
    assert determine_sampling_interval(500.0, interval_override=10) == 10
    assert determine_sampling_interval(50.0, interval_override=25) == 25
    assert determine_sampling_interval(50.0, interval_override=50) == 50

    # Invalid override ignored or raises error -> fallback or raises ValueError
    with pytest.raises(ValueError):
        determine_sampling_interval(150.0, interval_override=15)


def test_generate_checkpoint_targets():
    # 80-mile route with 10-mile interval: 0, 10, 20, 30, 40, 50, 60, 70, 80
    targets_80 = generate_checkpoint_targets(80.0, interval_miles=10)
    assert targets_80 == [0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0]
    assert targets_80[0] == 0.0
    assert targets_80[-1] == 80.0

    # 200-mile route with 25-mile interval: 0, 25, 50, 75, 100, 125, 150, 175, 200
    targets_200 = generate_checkpoint_targets(200.0, interval_miles=25)
    assert targets_200 == [0.0, 25.0, 50.0, 75.0, 100.0, 125.0, 150.0, 175.0, 200.0]

    # Non-exact multiple: 85 miles with 25 miles -> 0, 25, 50, 75, 85
    targets_85 = generate_checkpoint_targets(85.0, interval_miles=25)
    assert targets_85 == [0.0, 25.0, 50.0, 75.0, 85.0]

    # Very short route (e.g. 5 miles) -> [0.0, 5.0]
    targets_5 = generate_checkpoint_targets(5.0, interval_miles=10)
    assert targets_5 == [0.0, 5.0]


def test_sample_checkpoints_synthetic_line():
    # Straight line North-South: from lat 30.0 to 35.0 at lon -90.0
    # ~345 miles
    coords = [(30.0, -90.0), (35.0, -90.0)]
    reported_distance = 345.0
    checkpoints = sample_checkpoints(coords, reported_total_miles=reported_distance)

    # Adaptive interval for 345 mi is 50 mi
    # Target miles: 0, 50, 100, 150, 200, 250, 300, 345
    assert len(checkpoints) == 8
    assert checkpoints[0]["mile"] == 0.0
    assert checkpoints[0]["lat"] == pytest.approx(30.0, abs=1e-3)
    assert checkpoints[0]["lon"] == pytest.approx(-90.0, abs=1e-3)

    assert checkpoints[-1]["mile"] == 345.0
    assert checkpoints[-1]["lat"] == pytest.approx(35.0, abs=1e-3)
    assert checkpoints[-1]["lon"] == pytest.approx(-90.0, abs=1e-3)

    # Midpoint verification (approx lat 32.5 at mile 172.5)
    cp_mid = checkpoints[3]  # mile 150
    assert cp_mid["mile"] == 150.0
    expected_lat = 30.0 + (150.0 / 345.0) * 5.0
    assert cp_mid["lat"] == pytest.approx(expected_lat, abs=0.1)
