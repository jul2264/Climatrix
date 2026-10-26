"""
Unit tests for recommend.py:
- Checkpoint distance segment weighting
- Route risk metrics (no_travel_miles, severe_miles, high_miles, avg_risk, max_level)
- Lexicographic ranking:
  - Fewest Severe miles
  - Fewest High miles
  - Lowest avg_risk (with 0.05 tolerance)
  - Shortest duration
- Route safety filtering (routes with No Travel are excluded)
- All routes unsafe (returns recommended_route_id=None with delay suggestion)
- Plain-English explanation generation
"""

import pytest

from routing.services.recommend import (
    calculate_checkpoint_segment_distances,
    calculate_route_summary,
    rank_and_recommend_routes,
)
from routing.services.types import Checkpoint, RouteAnalysis, RouteSummary


def test_calculate_checkpoint_segment_distances():
    # Miles: 0, 25, 50, 75, 100
    # Expected segment weights:
    # 0: (25 - 0)/2 = 12.5
    # 25: (50 - 0)/2 = 25.0
    # 50: (75 - 25)/2 = 25.0
    # 75: (100 - 50)/2 = 25.0
    # 100: (100 - 75)/2 = 12.5
    # Total = 12.5 + 25 + 25 + 25 + 12.5 = 100.0
    miles = [0.0, 25.0, 50.0, 75.0, 100.0]
    weights = calculate_checkpoint_segment_distances(miles)
    assert weights == [12.5, 25.0, 25.0, 25.0, 12.5]
    assert sum(weights) == pytest.approx(100.0)


def test_calculate_route_summary():
    checkpoints = [
        Checkpoint(0.0, 40.0, -80.0, "2026-10-25T08:00:00Z", 15.0, 0.0, 0.0, "LOW", None),
        Checkpoint(25.0, 40.2, -80.2, "2026-10-25T08:30:00Z", 30.0, 0.0, 0.0, "MODERATE", "wind"),
        Checkpoint(50.0, 40.4, -80.4, "2026-10-25T09:00:00Z", 38.0, 0.0, 0.0, "HIGH", "wind"),
        Checkpoint(75.0, 40.6, -80.6, "2026-10-25T09:30:00Z", 48.0, 0.0, 0.0, "SEVERE", "wind"),
        Checkpoint(100.0, 40.8, -80.8, "2026-10-25T10:00:00Z", 10.0, 0.0, 0.0, "LOW", None),
    ]
    summary = calculate_route_summary(
        checkpoints=checkpoints,
        total_distance_miles=100.0,
        total_duration_minutes=120.0,
    )
    # Segments: 12.5 (LOW=0), 25 (MOD=1), 25 (HIGH=2), 25 (SEV=3), 12.5 (LOW=0)
    assert summary.no_travel_miles == 0.0
    assert summary.severe_miles == 25.0
    assert summary.high_miles == 25.0
    assert summary.max_level == "SEVERE"
    assert summary.distance_mi == 100.0
    assert summary.duration_min == 120.0

    # avg_risk = (12.5*0 + 25*1 + 25*2 + 25*3 + 12.5*0) / 100 = (25 + 50 + 75)/100 = 150/100 = 1.5
    assert summary.avg_risk == pytest.approx(1.5)


def make_route(
    route_id: str,
    duration_min: float,
    distance_mi: float,
    severe_miles: float,
    high_miles: float,
    no_travel_miles: float,
    avg_risk: float,
) -> RouteAnalysis:
    summary = RouteSummary(
        no_travel_miles=no_travel_miles,
        severe_miles=severe_miles,
        high_miles=high_miles,
        avg_risk=avg_risk,
        distance_mi=distance_mi,
        duration_min=duration_min,
        max_level="NO_TRAVEL" if no_travel_miles > 0 else ("SEVERE" if severe_miles > 0 else "LOW"),
    )
    return RouteAnalysis(
        id=route_id,
        geometry={"type": "LineString", "coordinates": []},
        distance_mi=distance_mi,
        duration_min=duration_min,
        summary=summary,
        checkpoints=[],
    )


def test_ranking_excludes_no_travel_route():
    # Route A: 0 severe, 0 no_travel, duration 380 min
    # Route B: 0 severe, 20 no_travel, duration 300 min (faster, but not drivable)
    rA = make_route("route_A", 380, 300, 0, 0, 0, 0.4)
    rB = make_route("route_B", 300, 280, 0, 0, 20, 0.2)

    winner_id, explanation = rank_and_recommend_routes([rA, rB])
    assert winner_id == "route_A"
    assert "route_B" in explanation or "No Travel" in explanation


def test_ranking_all_routes_no_travel():
    rA = make_route("route_A", 300, 250, 0, 0, 10, 2.5)
    rB = make_route("route_B", 310, 260, 0, 0, 15, 2.8)

    winner_id, explanation = rank_and_recommend_routes([rA, rB])
    assert winner_id is None
    assert "delaying departure" in explanation.lower() or "unsafe" in explanation.lower()


def test_ranking_prefers_fewer_severe_miles():
    # Route A has 0 severe miles, Route B has 15 severe miles
    rA = make_route("route_A", 360, 310, 0, 10, 0, 0.6)
    rB = make_route("route_B", 320, 290, 15, 0, 0, 0.5)

    winner_id, _ = rank_and_recommend_routes([rA, rB])
    assert winner_id == "route_A"


def test_ranking_prefers_fewer_high_miles_when_severe_tied():
    rA = make_route("route_A", 350, 300, 0, 5, 0, 0.5)
    rB = make_route("route_B", 340, 295, 0, 25, 0, 0.5)

    winner_id, _ = rank_and_recommend_routes([rA, rB])
    assert winner_id == "route_A"


def test_ranking_tie_tolerance_duration_breaks_tie():
    # Severe and High miles are equal (0).
    # avg_risk difference is 0.03 <= AVG_RISK_TIE_TOLERANCE (0.05).
    # Route B is 30 minutes faster -> Route B should win!
    rA = make_route("route_A", 360, 300, 0, 0, 0, 0.40)
    rB = make_route("route_B", 330, 295, 0, 0, 0, 0.43)

    winner_id, explanation = rank_and_recommend_routes([rA, rB])
    assert winner_id == "route_B"
    assert "duration" in explanation.lower() or "faster" in explanation.lower()


def test_ranking_significant_avg_risk_beats_duration():
    # Severe and High miles are equal (0).
    # avg_risk difference is 0.15 > AVG_RISK_TIE_TOLERANCE (0.05).
    # Route A has lower avg_risk (0.2 vs 0.35) -> Route A should win despite longer duration.
    rA = make_route("route_A", 360, 300, 0, 0, 0, 0.20)
    rB = make_route("route_B", 330, 295, 0, 0, 0, 0.36)

    winner_id, _ = rank_and_recommend_routes([rA, rB])
    assert winner_id == "route_A"
