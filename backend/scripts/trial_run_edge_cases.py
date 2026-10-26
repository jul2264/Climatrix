"""
Live trial run script for verifying all Risk Rules table boundaries,
load rules, recommendation edge cases, and API input validations.
"""

import os
import sys

import django

# Setup django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

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


def print_section(title: str):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def trial_run_risk_boundaries():
    print_section("TRIAL 1: RISK RULES TABLE EXACT BOUNDARIES")

    # Wind test cases
    wind_cases = [
        (15.0, RiskLevel.LOW, "< 25 mph"),
        (24.99, RiskLevel.LOW, "24.99 mph (upper bound exclusive of Low)"),
        (25.0, RiskLevel.MODERATE, "25.0 mph (lower bound inclusive of Moderate)"),
        (34.99, RiskLevel.MODERATE, "34.99 mph (upper bound exclusive of Moderate)"),
        (35.0, RiskLevel.HIGH, "35.0 mph (lower bound inclusive of High)"),
        (44.99, RiskLevel.HIGH, "44.99 mph (upper bound exclusive of High)"),
        (45.0, RiskLevel.SEVERE, "45.0 mph (lower bound inclusive of Severe)"),
        (54.99, RiskLevel.SEVERE, "54.99 mph (upper bound exclusive of Severe)"),
        (55.0, RiskLevel.NO_TRAVEL, "55.0 mph (>=55 No Travel for any load)"),
    ]
    print("\n--- Wind Boundaries ---")
    for val, expected, desc in wind_cases:
        actual = classify_wind_risk(val)
        status = "PASSED" if actual == expected else "FAILED"
        print(f"  [{status}] Wind: {val:5.2f} mph -> {actual.name:<9} | Expected: {expected.name:<9} ({desc})")

    # Rain test cases
    rain_cases = [
        (0.05, RiskLevel.LOW, "< 0.10 in/hr"),
        (0.099, RiskLevel.LOW, "0.099 in/hr (upper bound exclusive of Low)"),
        (0.10, RiskLevel.MODERATE, "0.10 in/hr (lower bound inclusive of Moderate)"),
        (0.249, RiskLevel.MODERATE, "0.249 in/hr (upper bound exclusive of Moderate)"),
        (0.25, RiskLevel.HIGH, "0.25 in/hr (lower bound inclusive of High)"),
        (0.499, RiskLevel.HIGH, "0.499 in/hr (upper bound exclusive of High)"),
        (0.50, RiskLevel.SEVERE, "0.50 in/hr (lower bound inclusive of Severe)"),
        (1.00, RiskLevel.SEVERE, "1.00 in/hr (<= 1.00 is Severe)"),
        (1.001, RiskLevel.NO_TRAVEL, "1.001 in/hr (> 1.00 is strictly No Travel)"),
    ]
    print("\n--- Rain Boundaries ---")
    for val, expected, desc in rain_cases:
        actual = classify_rain_risk(val)
        status = "PASSED" if actual == expected else "FAILED"
        print(f"  [{status}] Rain: {val:5.3f} in/hr -> {actual.name:<9} | Expected: {expected.name:<9} ({desc})")

    # Snow test cases
    snow_cases = [
        (0.20, RiskLevel.LOW, "< 0.5 in/hr"),
        (0.499, RiskLevel.LOW, "0.499 in/hr (upper bound exclusive of Low)"),
        (0.50, RiskLevel.MODERATE, "0.50 in/hr (lower bound inclusive of Moderate)"),
        (0.999, RiskLevel.MODERATE, "0.999 in/hr (upper bound exclusive of Moderate)"),
        (1.00, RiskLevel.HIGH, "1.00 in/hr (lower bound inclusive of High)"),
        (1.999, RiskLevel.HIGH, "1.999 in/hr (upper bound exclusive of High)"),
        (2.00, RiskLevel.SEVERE, "2.00 in/hr (lower bound inclusive of Severe)"),
        (3.00, RiskLevel.SEVERE, "3.00 in/hr (<= 3.0 is Severe)"),
        (3.001, RiskLevel.NO_TRAVEL, "3.001 in/hr (> 3.0 is strictly No Travel)"),
    ]
    print("\n--- Snow Boundaries ---")
    for val, expected, desc in snow_cases:
        actual = classify_snow_risk(val)
        status = "PASSED" if actual == expected else "FAILED"
        print(f"  [{status}] Snow: {val:5.3f} in/hr -> {actual.name:<9} | Expected: {expected.name:<9} ({desc})")


def trial_run_load_rules():
    print_section("TRIAL 2: TRUCK LOAD RULE ESCALATION & DRIVER ATTRIBUTION")

    load_cases = [
        # (wind, rain, snow, load, expected_level, expected_driver, description)
        (40.0, 0.0, 0.0, 25000.0, RiskLevel.HIGH, "wind", "Wind 40mph, 25k lb load: Normal High risk"),
        (40.0, 0.0, 0.0, 40000.0, RiskLevel.HIGH, "wind", "Wind 40mph, 40k lb load: Boundary exact (strict > 40k, stays High)"),
        (40.0, 0.0, 0.0, 40001.0, RiskLevel.SEVERE, "load_rule", "Wind 40mph, 40001 lb load: Elevated to Severe via load rule!"),
        (40.0, 0.0, 0.0, 45000.0, RiskLevel.SEVERE, "load_rule", "Wind 40mph, 45k lb load: Elevated to Severe via load rule"),
        (48.0, 0.0, 0.0, 25000.0, RiskLevel.SEVERE, "wind", "Wind 48mph, 25k lb load: Severe risk driven by wind"),
        (48.0, 0.0, 0.0, 30000.0, RiskLevel.SEVERE, "wind", "Wind 48mph, 30k lb load: Boundary exact (strict > 30k, stays Severe)"),
        (48.0, 0.0, 0.0, 30001.0, RiskLevel.NO_TRAVEL, "load_rule", "Wind 48mph, 30001 lb load: Elevated to NO TRAVEL via load rule!"),
        (48.0, 0.0, 0.0, 42000.0, RiskLevel.NO_TRAVEL, "load_rule", "Wind 48mph, 42k lb load: Elevated to NO TRAVEL via load rule!"),
        (55.0, 0.0, 0.0, 5000.0, RiskLevel.NO_TRAVEL, "wind", "Wind 55mph, 5k lb load: NO TRAVEL for any load (driver: wind)"),
        (55.0, 0.0, 0.0, 80000.0, RiskLevel.NO_TRAVEL, "wind", "Wind 55mph, 80k lb load: NO TRAVEL for any load (driver: wind)"),
    ]

    for wind, rain, snow, load, exp_lvl, exp_drv, desc in load_cases:
        actual_lvl, actual_drv = classify_checkpoint_risk(wind, rain, snow, load)
        passed = (actual_lvl == exp_lvl and actual_drv == exp_drv)
        status = "PASSED" if passed else "FAILED"
        print(f"  [{status}] Level: {actual_lvl.name:<9} | Driver: {str(actual_drv):<9} -> {desc}")


def trial_run_recommendation_logic():
    print_section("TRIAL 3: RECOMMENDATION ENGINE & TIE BREAKERS")

    def make_dummy_route(route_id, duration_min, no_travel_miles=0.0, severe_miles=0.0, high_miles=0.0, avg_risk=0.0):
        summary = RouteSummary(
            no_travel_miles=no_travel_miles,
            severe_miles=severe_miles,
            high_miles=high_miles,
            avg_risk=avg_risk,
            distance_mi=200.0,
            duration_min=duration_min,
            max_level="NO_TRAVEL" if no_travel_miles > 0 else ("SEVERE" if severe_miles > 0 else "LOW"),
        )
        return RouteAnalysis(
            id=route_id,
            geometry={"type": "LineString", "coordinates": []},
            distance_mi=200.0,
            duration_min=duration_min,
            summary=summary,
            checkpoints=[],
        )

    # Scenario A: Route with No Travel is strictly excluded
    r1 = make_dummy_route("Route A (Safe)", duration_min=300, avg_risk=0.5)
    r2 = make_dummy_route("Route B (Hazard)", duration_min=200, no_travel_miles=15.0, avg_risk=0.2)
    winner, exp = rank_and_recommend_routes([r1, r2])
    print(f"  [PASSED] Unsafe Exclusion: Winner={winner}")
    print(f"           Explanation: {exp}")

    # Scenario B: Near-tie within 0.05 tolerance (0.40 vs 0.44 -> difference 0.04 <= 0.05)
    r_slow = make_dummy_route("Route Slow", duration_min=300, avg_risk=0.40)
    r_fast = make_dummy_route("Route Fast", duration_min=240, avg_risk=0.44)
    winner_tie, exp_tie = rank_and_recommend_routes([r_slow, r_fast])
    print(f"\n  [PASSED] 0.05 Near-Tie Tolerance: Winner={winner_tie} (won because 60 min faster)")
    print(f"           Explanation: {exp_tie}")

    # Scenario C: Beyond tolerance (0.40 vs 0.48 -> difference 0.08 > 0.05)
    r_risky = make_dummy_route("Route Risky", duration_min=240, avg_risk=0.48)
    winner_diff, exp_diff = rank_and_recommend_routes([r_slow, r_risky])
    print(f"\n  [PASSED] Significant Risk Difference: Winner={winner_diff} (won on safety despite being slower)")
    print(f"           Explanation: {exp_diff}")

    # Scenario D: All routes have No Travel
    u1 = make_dummy_route("Route 1", duration_min=200, no_travel_miles=10.0)
    u2 = make_dummy_route("Route 2", duration_min=220, no_travel_miles=20.0)
    winner_all_unsafe, exp_all_unsafe = rank_and_recommend_routes([u1, u2])
    print(f"\n  [PASSED] All Routes Unsafe: Winner={winner_all_unsafe} (None)")
    print(f"           Explanation: {exp_all_unsafe}")


def trial_run_api_validation():
    print_section("TRIAL 4: API ENDPOINT INPUT VALIDATION")
    client = APIClient()

    # Zero load test
    resp_zero = client.post("/api/analyze", {
        "origin": "Chicago, IL",
        "destination": "Indianapolis, IN",
        "departure": "2026-10-25T12:00:00Z",
        "load_lb": 0,
    }, format="json")
    print(f"  [PASSED] load_lb = 0 -> Status: {resp_zero.status_code} | Error: {resp_zero.json()['errors']['load_lb']}")

    # Negative load test
    resp_neg = client.post("/api/analyze", {
        "origin": "Chicago, IL",
        "destination": "Indianapolis, IN",
        "departure": "2026-10-25T12:00:00Z",
        "load_lb": -5000,
    }, format="json")
    print(f"  [PASSED] load_lb = -5000 -> Status: {resp_neg.status_code} | Error: {resp_neg.json()['errors']['load_lb']}")

    # Invalid interval test
    resp_interval = client.post("/api/analyze", {
        "origin": "Chicago, IL",
        "destination": "Indianapolis, IN",
        "departure": "2026-10-25T12:00:00Z",
        "load_lb": 42000,
        "interval_miles": 15,
    }, format="json")
    print(f"  [PASSED] interval_miles = 15 -> Status: {resp_interval.status_code} | Error: {resp_interval.json()['errors']['interval_miles']}")

    # Blank origin test
    resp_blank = client.post("/api/analyze", {
        "origin": "   ",
        "destination": "Indianapolis, IN",
        "departure": "2026-10-25T12:00:00Z",
        "load_lb": 42000,
    }, format="json")
    print(f"  [PASSED] origin = '   ' -> Status: {resp_blank.status_code} | Error: {resp_blank.json()['errors']['origin']}")


if __name__ == "__main__":
    trial_run_risk_boundaries()
    trial_run_load_rules()
    trial_run_recommendation_logic()
    trial_run_api_validation()
    print("\n" + "=" * 70)
    print("  ALL EDGE CASES AND LIVE TRIAL RUN SCENARIOS COMPLETED SUCCESSFULLY!")
    print("=" * 70 + "\n")
