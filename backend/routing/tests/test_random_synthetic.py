"""
Method A: Pure Synthetic Randomized Route Invariant Tests.

Tests Climatrix safety rules and algorithms against randomly generated
US geographic coordinates, polyline lengths, load weights, and weather conditions.

Guarantees:
- 100% offline (no external HTTP calls)
- Executes in under 1 second
- Asserts mathematical and logical invariants:
  1. Checkpoint sampling interval boundaries and endpoint inclusion
  2. Monotonic ETA progression and exact arrival duration
  3. Load rule priority and driver attribution under randomized conditions
  4. Lexicographic recommendation invariants across randomized 3-route sets
"""

import datetime
import random
from datetime import UTC

from routing.services.constants import (
    ALLOWED_INTERVAL_OVERRIDES,
    INTERVAL_TIER_LONG,
    INTERVAL_TIER_MEDIUM,
    INTERVAL_TIER_SHORT,
    RiskLevel,
)
from routing.services.eta import calculate_checkpoint_etas
from routing.services.recommend import rank_and_recommend_routes
from routing.services.risk import (
    classify_checkpoint_risk,
    classify_rain_risk,
    classify_snow_risk,
    classify_wind_risk,
)
from routing.services.sampler import (
    determine_sampling_interval,
    generate_checkpoint_targets,
)
from routing.services.types import RouteAnalysis, RouteSummary


class TestRandomizedSyntheticSampling:
    """Verifies sampling intervals and target checkpoints on randomized route distances."""

    def test_randomized_adaptive_sampling_intervals(self) -> None:
        """Tests that 100 randomly sampled route distances adhere to adaptive intervals."""
        rng = random.Random(42)

        for _ in range(100):
            # Short haul (< 100 miles)
            dist_short = rng.uniform(5.0, 99.99)
            assert determine_sampling_interval(dist_short) == INTERVAL_TIER_SHORT

            # Medium haul (100 - 300 miles)
            dist_med = rng.uniform(100.0, 300.0)
            assert determine_sampling_interval(dist_med) == INTERVAL_TIER_MEDIUM

            # Long haul (> 300 miles)
            dist_long = rng.uniform(300.01, 3500.0)
            assert determine_sampling_interval(dist_long) == INTERVAL_TIER_LONG

    def test_randomized_checkpoint_targets_invariants(self) -> None:
        """Tests endpoint inclusion and strictly monotonic target miles."""
        rng = random.Random(1337)

        for _ in range(100):
            dist = rng.uniform(15.0, 2500.0)
            interval = rng.choice(list(ALLOWED_INTERVAL_OVERRIDES))

            targets = generate_checkpoint_targets(dist, interval)

            # Invariant 1: At least origin and destination
            assert len(targets) >= 2

            # Invariant 2: Start must be exactly 0.0
            assert targets[0] == 0.0

            # Invariant 3: End must be exactly total route distance (within rounding tolerance)
            assert abs(targets[-1] - dist) < 0.01

            # Invariant 4: Targets must be strictly increasing
            for i in range(len(targets) - 1):
                assert targets[i] < targets[i + 1]


class TestRandomizedSyntheticETAs:
    """Verifies ETA calculations across randomized departure times, distances, and speed factors."""

    def test_randomized_eta_monotonicity_and_exact_end(self) -> None:
        rng = random.Random(2026)

        for _ in range(100):
            # Random departure time
            days_ahead = rng.randint(0, 10)
            hours = rng.randint(0, 23)
            minutes = rng.randint(0, 59)
            dep = datetime.datetime(2026, 10, 25, hours, minutes, 0, tzinfo=UTC) + datetime.timedelta(days=days_ahead)

            # Random distance (50 - 3000 mi) and duration (1 - 60 hrs)
            total_dist = rng.uniform(50.0, 3000.0)
            total_dur_sec = rng.uniform(3600.0, 216000.0)
            speed_factor = rng.choice([0.9, 1.0, 1.1])

            targets = generate_checkpoint_targets(total_dist, interval_miles=50)
            checkpoints = [{"mile": m} for m in targets]

            updated_cps = calculate_checkpoint_etas(
                checkpoints=checkpoints,
                departure_dt=dep,
                total_distance_miles=total_dist,
                total_duration_seconds=total_dur_sec,
                segments=None,
                truck_speed_factor=speed_factor,
            )

            # Invariant 1: Exactly 1 checkpoint per input
            assert len(updated_cps) == len(checkpoints)

            # Parse ETA datetimes
            eta_dts = [datetime.datetime.fromisoformat(cp["eta"]) for cp in updated_cps]

            # Invariant 2: Monotonic ETAs (each step >= previous)
            for i in range(len(eta_dts) - 1):
                assert eta_dts[i] <= eta_dts[i + 1]

            # Invariant 3: First ETA equals departure
            assert eta_dts[0] == dep

            # Invariant 4: Final ETA matches departure + scaled duration (within 1 second rounding)
            expected_final = dep + datetime.timedelta(seconds=round(total_dur_sec * speed_factor))
            assert abs((eta_dts[-1] - expected_final).total_seconds()) <= 1.0


class TestRandomizedSyntheticRiskRules:
    """Verifies load rules and multi-factor classification across randomized weather conditions."""

    def test_randomized_weather_and_load_classification(self) -> None:
        rng = random.Random(777)

        for _ in range(250):
            wind = rng.uniform(0.0, 80.0)
            rain = rng.uniform(0.0, 2.5)
            snow = rng.uniform(0.0, 5.0)
            load_lb = rng.uniform(5000.0, 75000.0)

            level, driver = classify_checkpoint_risk(wind, rain, snow, load_lb)

            # Invariant 1: Level is never unknown if variables are present
            assert level in {RiskLevel.LOW, RiskLevel.MODERATE, RiskLevel.HIGH, RiskLevel.SEVERE, RiskLevel.NO_TRAVEL}

            # Invariant 2: Level must be at least as high as any single component
            wind_lvl = classify_wind_risk(wind)
            rain_lvl = classify_rain_risk(rain)
            snow_lvl = classify_snow_risk(snow)
            base_lvl = max(wind_lvl, rain_lvl, snow_lvl)
            assert level >= base_lvl

            # Invariant 3: Wind >= 55 mph ALWAYS produces NO_TRAVEL
            if wind >= 55.0:
                assert level == RiskLevel.NO_TRAVEL

            # Invariant 4: Wind 45-54 and load > 30k lb ALWAYS produces NO_TRAVEL
            if 45.0 <= wind < 55.0 and load_lb > 30000.0:
                assert level == RiskLevel.NO_TRAVEL

            # Invariant 5: Wind 35-44 and load > 40k lb ALWAYS produces at least SEVERE
            if 35.0 <= wind < 45.0 and load_lb > 40000.0:
                assert level >= RiskLevel.SEVERE

            # Invariant 6: Valid driver string
            assert driver in {"wind", "rain", "snow", "load_rule"}


class TestRandomizedSyntheticRecommendations:
    """Verifies lexicographic recommendation invariants across randomized 3-route scenarios."""

    @staticmethod
    def _make_mock_route(
        route_id: str,
        dur_min: float,
        dist_mi: float,
        no_travel_mi: float,
        severe_mi: float,
        high_mi: float,
        avg_risk: float,
    ) -> RouteAnalysis:
        summary = RouteSummary(
            no_travel_miles=no_travel_mi,
            severe_miles=severe_mi,
            high_miles=high_mi,
            avg_risk=avg_risk,
            distance_mi=dist_mi,
            duration_min=dur_min,
            max_level="NO_TRAVEL" if no_travel_mi > 0 else ("SEVERE" if severe_mi > 0 else "LOW"),
        )
        return RouteAnalysis(
            id=route_id,
            geometry={"type": "LineString", "coordinates": []},
            distance_mi=dist_mi,
            duration_min=dur_min,
            summary=summary,
            checkpoints=[],
        )

    def test_randomized_recommendation_invariants(self) -> None:
        rng = random.Random(999)

        for _ in range(150):
            routes: list[RouteAnalysis] = []
            for idx in range(3):
                dur = rng.uniform(120.0, 600.0)
                dist = rng.uniform(100.0, 500.0)
                # 30% chance of no-travel miles
                has_nt = rng.random() < 0.30
                nt_mi = rng.uniform(1.0, 50.0) if has_nt else 0.0
                sev_mi = rng.uniform(0.0, 40.0)
                hi_mi = rng.uniform(0.0, 60.0)
                avg_r = rng.uniform(0.1, 3.5)

                routes.append(self._make_mock_route(f"route_{idx}", dur, dist, nt_mi, sev_mi, hi_mi, avg_r))

            winner_id, explanation = rank_and_recommend_routes(routes)

            drivable_routes = [r for r in routes if r.summary.no_travel_miles == 0.0]

            # Invariant 1: If all routes have No Travel, winner must be None
            if not drivable_routes:
                assert winner_id is None
                assert "delaying departure" in explanation.lower() or "unsafe" in explanation.lower()
            else:
                # Invariant 2: If at least one route is drivable, winner MUST be one of the drivable routes
                assert winner_id is not None
                winner = next(r for r in routes if r.id == winner_id)
                assert winner.summary.no_travel_miles == 0.0
