"""
Comprehensive edge case test suite for the Truck Route Safety system:
1. Every exact threshold boundary from the Risk Rules table (Wind, Rain, Snow)
2. Load rules with strict inequality boundaries (> 30,000 lb, > 40,000 lb)
3. Partial and complete missing weather handling
4. Multi-factor ties and driver attribution
5. Recommendation lexicographic edge cases (near-ties, all-unsafe, single-safe)
6. API endpoint edge case validations (0/negative load, invalid intervals, etc.)
"""

import pytest
from rest_framework.test import APIClient

from routing.services.constants import RiskLevel
from routing.services.recommend import rank_and_recommend_routes
from routing.services.risk import (
    classify_checkpoint_risk,
    classify_rain_risk,
    classify_snow_risk,
    classify_wind_risk,
)
from routing.services.types import RouteAnalysis, RouteSummary

# =====================================================================
# 1. EXACT BOUNDARY TESTS FOR RISK RULES TABLE
# =====================================================================

class TestRiskRulesBoundaries:
    """
    Validates every single boundary value from the Risk Rules table:
    - Wind (mph): <25 Low, 25-34 Mod, 35-44 High, 45-54 Severe, >=55 No Travel
    - Rain (in/hr): <0.10 Low, 0.10-0.25 Mod, 0.25-0.50 High, 0.50-1.00 Severe, >1.00 No Travel
    - Snow (in/hr): <0.5 Low, 0.5-1.0 Mod, 1.0-2.0 High, 2.0-3.0 Severe, >3.0 No Travel
    """

    @pytest.mark.parametrize(
        "wind_mph, expected",
        [
            (0.0, RiskLevel.LOW),
            (24.999, RiskLevel.LOW),
            (25.0, RiskLevel.MODERATE),       # WIND_MODERATE_MIN (inclusive)
            (34.999, RiskLevel.MODERATE),
            (35.0, RiskLevel.HIGH),           # WIND_HIGH_MIN (inclusive)
            (44.999, RiskLevel.HIGH),
            (45.0, RiskLevel.SEVERE),         # WIND_SEVERE_MIN (inclusive)
            (54.999, RiskLevel.SEVERE),
            (55.0, RiskLevel.NO_TRAVEL),      # WIND_NO_TRAVEL_MIN (inclusive)
            (99.9, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_wind_boundaries(self, wind_mph: float, expected: RiskLevel) -> None:
        assert classify_wind_risk(wind_mph) == expected

    @pytest.mark.parametrize(
        "rain_in_hr, expected",
        [
            (0.0, RiskLevel.LOW),
            (0.0999, RiskLevel.LOW),
            (0.10, RiskLevel.MODERATE),       # RAIN_MODERATE_MIN (inclusive)
            (0.2499, RiskLevel.MODERATE),
            (0.25, RiskLevel.HIGH),           # RAIN_HIGH_MIN (inclusive)
            (0.4999, RiskLevel.HIGH),
            (0.50, RiskLevel.SEVERE),         # RAIN_SEVERE_MIN (inclusive)
            (1.00, RiskLevel.SEVERE),         # 1.00 is <= RAIN_NO_TRAVEL_MIN -> SEVERE
            (1.0001, RiskLevel.NO_TRAVEL),    # > 1.00 is strictly greater than -> NO_TRAVEL
            (1.50, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_rain_boundaries(self, rain_in_hr: float, expected: RiskLevel) -> None:
        assert classify_rain_risk(rain_in_hr) == expected

    @pytest.mark.parametrize(
        "snow_in_hr, expected",
        [
            (0.0, RiskLevel.LOW),
            (0.4999, RiskLevel.LOW),
            (0.50, RiskLevel.MODERATE),       # SNOW_MODERATE_MIN (inclusive)
            (0.9999, RiskLevel.MODERATE),
            (1.00, RiskLevel.HIGH),           # SNOW_HIGH_MIN (inclusive)
            (1.9999, RiskLevel.HIGH),
            (2.00, RiskLevel.SEVERE),         # SNOW_SEVERE_MIN (inclusive)
            (3.00, RiskLevel.SEVERE),         # 3.00 is <= SNOW_NO_TRAVEL_MIN -> SEVERE
            (3.0001, RiskLevel.NO_TRAVEL),    # > 3.00 is strictly greater than -> NO_TRAVEL
            (5.00, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_snow_boundaries(self, snow_in_hr: float, expected: RiskLevel) -> None:
        assert classify_snow_risk(snow_in_hr) == expected


# =====================================================================
# 2. LOAD RULES STRICT BOUNDARIES (>30k, >40k) & DRIVER ATTRIBUTION
# =====================================================================

class TestLoadRulesEdgeCases:
    """
    Load rules:
    - Wind >= 55 mph: No Travel for any load
    - Wind 45-54 mph and load > 30,000 lb: No Travel
    - Wind 35-44 mph and load > 40,000 lb: Severe (raise to at least Severe)
    """

    def test_wind_55_with_extreme_loads(self) -> None:
        # 1 lb load still triggers No Travel
        lvl, drv = classify_checkpoint_risk(55.0, 0.0, 0.0, load_lb=1.0)
        assert lvl == RiskLevel.NO_TRAVEL
        assert drv == "wind"

        # 80,000 lb max legal highway gross weight still No Travel
        lvl, drv = classify_checkpoint_risk(60.0, 0.0, 0.0, load_lb=80000.0)
        assert lvl == RiskLevel.NO_TRAVEL
        assert drv == "wind"

    def test_wind_45_to_54_strict_30k_boundary(self) -> None:
        wind = 48.0  # within 45-54 mph

        # Exactly 30,000.0 lb: strict > 30000 -> NOT elevated to No Travel (stays Severe from wind)
        lvl_30k, drv_30k = classify_checkpoint_risk(wind, 0.0, 0.0, load_lb=30000.0)
        assert lvl_30k == RiskLevel.SEVERE
        assert drv_30k == "wind"

        # 29,999.9 lb: stays Severe from wind
        lvl_under, drv_under = classify_checkpoint_risk(wind, 0.0, 0.0, load_lb=29999.9)
        assert lvl_under == RiskLevel.SEVERE
        assert drv_under == "wind"

        # 30,000.1 lb: strictly > 30000 -> Elevated to No Travel via load rule
        lvl_over, drv_over = classify_checkpoint_risk(wind, 0.0, 0.0, load_lb=30000.1)
        assert lvl_over == RiskLevel.NO_TRAVEL
        assert drv_over == "load_rule"

    def test_wind_35_to_44_strict_40k_boundary(self) -> None:
        wind = 40.0  # within 35-44 mph

        # Exactly 40,000.0 lb: strict > 40000 -> NOT elevated to Severe (stays High from wind)
        lvl_40k, drv_40k = classify_checkpoint_risk(wind, 0.0, 0.0, load_lb=40000.0)
        assert lvl_40k == RiskLevel.HIGH
        assert drv_40k == "wind"

        # 39,999.9 lb: stays High from wind
        lvl_under, drv_under = classify_checkpoint_risk(wind, 0.0, 0.0, load_lb=39999.9)
        assert lvl_under == RiskLevel.HIGH
        assert drv_under == "wind"

        # 40,000.1 lb: strictly > 40000 -> Elevated to Severe via load rule
        lvl_over, drv_over = classify_checkpoint_risk(wind, 0.0, 0.0, load_lb=40000.1)
        assert lvl_over == RiskLevel.SEVERE
        assert drv_over == "load_rule"

    def test_load_rule_when_precipitation_is_already_severe(self) -> None:
        # Heavy rain (0.8 in/hr) already makes base SEVERE
        # Wind is 40 mph, load is 45,000 lb (rule says raise to at least Severe)
        # Because base is already SEVERE, rain remains the driver
        lvl, drv = classify_checkpoint_risk(wind_mph=40.0, rain_in_hr=0.80, snow_in_hr=0.0, load_lb=45000.0)
        assert lvl == RiskLevel.SEVERE
        assert drv == "rain"

    def test_load_rule_when_precipitation_is_already_no_travel(self) -> None:
        # Extreme rain (1.5 in/hr) -> NO_TRAVEL
        # Wind 48 mph, load 35,000 lb -> load rule also suggests NO_TRAVEL
        # Base driver is rain
        lvl, drv = classify_checkpoint_risk(wind_mph=48.0, rain_in_hr=1.50, snow_in_hr=0.0, load_lb=35000.0)
        assert lvl == RiskLevel.NO_TRAVEL
        assert drv == "rain"


# =====================================================================
# 3. MISSING AND PARTIAL WEATHER DATA HANDLING
# =====================================================================

class TestMissingWeatherDataEdgeCases:
    """
    Failed or missing weather for a checkpoint is UNKNOWN.
    If some variables are present, the present variables dictate risk.
    """

    def test_all_weather_missing(self) -> None:
        lvl, drv = classify_checkpoint_risk(None, None, None, load_lb=42000.0)
        assert lvl == RiskLevel.UNKNOWN
        assert drv is None

    def test_wind_missing_but_rain_present(self) -> None:
        # Rain is 0.60 -> Severe
        lvl, drv = classify_checkpoint_risk(None, 0.60, None, load_lb=42000.0)
        assert lvl == RiskLevel.SEVERE
        assert drv == "rain"

    def test_rain_missing_but_snow_present(self) -> None:
        # Snow is 1.5 -> High
        lvl, drv = classify_checkpoint_risk(10.0, None, 1.50, load_lb=42000.0)
        assert lvl == RiskLevel.HIGH
        assert drv == "snow"

    def test_heatmap_missing_weather_returns_unknown_risk(self) -> None:
        from routing.services.heatmap import build_heatmap_geojson
        grid_points = [(41.8781, -87.6298)]
        # Weather data unavailable (empty dict)
        geojson = build_heatmap_geojson(grid_points, [{}], load_lb=42000.0)
        feat = geojson["features"][0]
        assert feat["properties"]["risk_by_hour"] == [int(RiskLevel.UNKNOWN)] * 49
        assert feat["properties"]["current_risk"] == int(RiskLevel.UNKNOWN)


# =====================================================================
# 4. RECOMMENDATION LEXICOGRAPHIC EDGE CASES & TIE TOLERANCE
# =====================================================================

class TestRecommendationEdgeCases:
    """
    Lexicographic key: (has_no_travel, no_travel_miles, severe_miles, high_miles, avg_risk, duration_min)
    Tolerance: avg_risk within 0.05 is treated as equal so duration breaks near-ties.
    """

    @staticmethod
    def _create_test_route(
        route_id: str,
        duration_min: float,
        distance_mi: float,
        severe_miles: float = 0.0,
        high_miles: float = 0.0,
        no_travel_miles: float = 0.0,
        avg_risk: float = 0.0,
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

    def test_exact_tie_tolerance_boundary_0_05(self) -> None:
        # Route 1: avg_risk = 0.40, duration = 300 min
        # Route 2: avg_risk = 0.45, duration = 240 min (difference is exactly 0.05)
        # Because diff <= 0.05, they are tied on avg_risk -> Route 2 wins by 60 min faster duration!
        r1 = self._create_test_route("r1", duration_min=300, distance_mi=200, avg_risk=0.40)
        r2 = self._create_test_route("r2", duration_min=240, distance_mi=190, avg_risk=0.45)

        winner, explanation = rank_and_recommend_routes([r1, r2])
        assert winner == "r2"
        assert "duration" in explanation.lower() or "faster" in explanation.lower()

    def test_beyond_tie_tolerance_0_051_lower_risk_wins(self) -> None:
        # Route 1: avg_risk = 0.40, duration = 300 min
        # Route 2: avg_risk = 0.451, duration = 240 min (difference is 0.051 > 0.05)
        # Difference exceeds tolerance -> Route 1 wins on lower avg_risk despite being slower!
        r1 = self._create_test_route("r1", duration_min=300, distance_mi=200, avg_risk=0.40)
        r2 = self._create_test_route("r2", duration_min=240, distance_mi=190, avg_risk=0.451)

        winner, _ = rank_and_recommend_routes([r1, r2])
        assert winner == "r1"

    def test_single_drivable_route_among_two_no_travel_routes(self) -> None:
        # Route A has No Travel
        # Route B has No Travel
        # Route C is safe (Severe miles = 0, but duration is much longer)
        rA = self._create_test_route("rA", duration_min=200, distance_mi=180, no_travel_miles=15.0)
        rB = self._create_test_route("rB", duration_min=210, distance_mi=185, no_travel_miles=5.0)
        rC = self._create_test_route("rC", duration_min=350, distance_mi=260, severe_miles=0.0)

        winner, explanation = rank_and_recommend_routes([rA, rB, rC])
        assert winner == "rC"
        assert "not drivable" in explanation.lower() or "no travel" in explanation.lower()

    def test_all_three_routes_no_travel(self) -> None:
        rA = self._create_test_route("rA", duration_min=200, distance_mi=180, no_travel_miles=10.0)
        rB = self._create_test_route("rB", duration_min=220, distance_mi=190, no_travel_miles=8.0)
        rC = self._create_test_route("rC", duration_min=250, distance_mi=200, no_travel_miles=20.0)

        winner, explanation = rank_and_recommend_routes([rA, rB, rC])
        assert winner is None
        assert "delaying departure" in explanation.lower() or "unsafe" in explanation.lower()


# =====================================================================
# 5. API PAYLOAD VALIDATION EDGE CASES
# =====================================================================

class TestApiPayloadValidationEdgeCases:
    """
    Validates API input constraints:
    - load_lb must be positive (> 0)
    - interval_miles must be one of [10, 25, 50] or null
    - origin/destination cannot be blank
    """

    @pytest.fixture
    def client(self) -> APIClient:
        return APIClient()

    def test_zero_load_rejected(self, client: APIClient) -> None:
        payload = {
            "origin": "Chicago, IL",
            "destination": "Indianapolis, IN",
            "departure": "2026-10-25T12:00:00Z",
            "load_lb": 0,
        }
        response = client.post("/api/analyze", payload, format="json")
        assert response.status_code == 400
        assert "load_lb" in response.json().get("errors", {})

    def test_negative_load_rejected(self, client: APIClient) -> None:
        payload = {
            "origin": "Chicago, IL",
            "destination": "Indianapolis, IN",
            "departure": "2026-10-25T12:00:00Z",
            "load_lb": -5000,
        }
        response = client.post("/api/analyze", payload, format="json")
        assert response.status_code == 400
        assert "load_lb" in response.json().get("errors", {})

    def test_invalid_interval_miles_rejected(self, client: APIClient) -> None:
        payload = {
            "origin": "Chicago, IL",
            "destination": "Indianapolis, IN",
            "departure": "2026-10-25T12:00:00Z",
            "load_lb": 42000,
            "interval_miles": 15,  # only 10, 25, 50 allowed
        }
        response = client.post("/api/analyze", payload, format="json")
        assert response.status_code == 400
        assert "interval_miles" in response.json().get("errors", {})

    def test_blank_origin_rejected(self, client: APIClient) -> None:
        payload = {
            "origin": "   ",
            "destination": "Indianapolis, IN",
            "departure": "2026-10-25T12:00:00Z",
            "load_lb": 42000,
        }
        response = client.post("/api/analyze", payload, format="json")
        assert response.status_code == 400
        assert "origin" in response.json().get("errors", {})
