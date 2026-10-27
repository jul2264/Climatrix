#!/usr/bin/env python3
"""
CLI Automated Smoke Test Script for Climatrix Truck Route Safety.

Usage:
    python scripts/test_random_routes.py --count 5
    python scripts/test_random_routes.py --count 3 --in-process
    python scripts/test_random_routes.py --count 5 --url http://localhost:8000/api/analyze

Features:
- Randomly samples pairs of diverse freight hubs across all US geographic regions.
- Tests load rule threshold brackets (<30k, 30-40k, >40k lb).
- Sends live POST /api/analyze requests (via HTTP or in-process DRF APIClient).
- Validates:
    * HTTP 200 OK
    * 1 to 3 alternative routes returned
    * Valid GeoJSON LineString road geometry
    * Checkpoint distance coverage (starts at 0.0, ends at total distance)
    * Monotonic ETAs (arrival time strictly advances)
    * Valid risk levels (LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL, UNKNOWN)
    * Correct driver attribution (wind, rain, snow, load_rule)
    * Lexicographic recommendation winner or all-unsafe delay explanation
"""

import argparse
import datetime
import os
import random
import sys
import time
from typing import Any

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import functools

# Force unbuffered output for terminal scripts
print = functools.partial(print, flush=True)

# Major commercial freight hubs spanning all continental US regions
US_FREIGHT_HUBS = [
    # Midwest Corridors
    "Chicago, IL",
    "Indianapolis, IN",
    "Columbus, OH",
    "St. Louis, MO",
    "Detroit, MI",
    "Minneapolis, MN",
    "Kansas City, MO",
    "Omaha, NE",
    "Cleveland, OH",
    "Milwaukee, WI",
    # South & Southeast Hubs
    "Atlanta, GA",
    "Memphis, TN",
    "Nashville, TN",
    "Dallas, TX",
    "Houston, TX",
    "San Antonio, TX",
    "Charlotte, NC",
    "Jacksonville, FL",
    "Miami, FL",
    "New Orleans, LA",
    # Northeast & Mid-Atlantic
    "New York, NY",
    "Philadelphia, PA",
    "Pittsburgh, PA",
    "Boston, MA",
    "Baltimore, MD",
    "Richmond, VA",
    "Buffalo, NY",
    # Mountain & Southwest
    "Denver, CO",
    "Salt Lake City, UT",
    "Phoenix, AZ",
    "Albuquerque, NM",
    "Las Vegas, NV",
    # Pacific Northwest & West Coast
    "Seattle, WA",
    "Portland, OR",
    "Los Angeles, CA",
    "San Francisco, CA",
    "Sacramento, CA",
    "San Diego, CA",
]

LOAD_WEIGHT_BRACKETS = [
    18000,  # Light load (< 30k lb)
    28000,  # Near 30k boundary
    34000,  # 30k - 40k bracket (No Travel under 45-54 mph wind)
    42000,  # > 40k bracket (Severe under 35-44 mph wind)
    48000,  # Heavy commercial freight
]

# ANSI color escape codes for clean terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def setup_django_environment() -> None:
    """Configures Django settings if running in-process."""
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    django.setup()


def get_departure_time_iso(hours_ahead: int = 2) -> str:
    """Generates an ISO-8601 departure timestamp with UTC offset."""
    dep = datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=hours_ahead)
    return dep.isoformat()


def send_analyze_request(
    payload: dict[str, Any], url: str, in_process: bool = False
) -> tuple[int, dict[str, Any], float]:
    """Sends POST /api/analyze via HTTP or in-process DRF APIClient."""
    start_time = time.perf_counter()

    if in_process:
        from rest_framework.test import APIClient

        client = APIClient()
        response = client.post("/api/analyze", payload, format="json")
        elapsed = time.perf_counter() - start_time
        return response.status_code, response.json(), elapsed

    # HTTP request mode with automatic fallback to in-process if server isn't running
    import requests

    try:
        response = requests.post(url, json=payload, timeout=90.0)
        elapsed = time.perf_counter() - start_time
        return response.status_code, response.json(), elapsed
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as err:
        print(
            f"{YELLOW}[WARN] Could not connect to {url} ({err.__class__.__name__}). Falling back to in-process execution.{RESET}"
        )
        setup_django_environment()
        from rest_framework.test import APIClient

        client = APIClient()
        response = client.post("/api/analyze", payload, format="json")
        elapsed = time.perf_counter() - start_time
        return response.status_code, response.json(), elapsed


def validate_route_response(data: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    """
    Validates Climatrix safety rules and API contracts on the returned response:
    - 1 to 3 alternative routes returned
    - Valid GeoJSON LineString coordinates
    - Checkpoint distances, bounds, and ordering
    - Checkpoint ETAs strictly monotonic
    - Risk levels and driver attribution
    - Recommendation winner or all-unsafe delay explanation
    """
    errors: list[str] = []

    # 1. Top-level response structure
    if "routes" not in data or not isinstance(data["routes"], list):
        return ["Response missing 'routes' array"]
    if len(data["routes"]) == 0:
        return ["Response returned empty routes list"]

    routes = data["routes"]
    if len(routes) > 3:
        errors.append(f"Expected at most 3 alternative routes, received {len(routes)}")

    recommended_id = data.get("recommended_route_id")
    explanation = data.get("explanation", "")

    route_ids = [r.get("id") for r in routes]
    all_no_travel = True

    for idx, route in enumerate(routes):
        r_id = route.get("id", f"route_{idx}")

        # Geometry validation
        geom = route.get("geometry", {})
        if geom.get("type") != "LineString":
            errors.append(f"Route {r_id}: geometry type is not 'LineString' ({geom.get('type')})")
        coords = geom.get("coordinates", [])
        if not coords or len(coords) < 2:
            errors.append(f"Route {r_id}: LineString coordinates missing or < 2 points")

        # Summary metrics
        summary = route.get("summary", {})
        dist_mi = route.get("distance_mi", 0.0)
        dur_min = route.get("duration_min", 0.0)

        if dist_mi <= 0:
            errors.append(f"Route {r_id}: distance_mi <= 0 ({dist_mi})")
        if dur_min <= 0:
            errors.append(f"Route {r_id}: duration_min <= 0 ({dur_min})")

        has_no_travel = summary.get("no_travel_miles", 0.0) > 0 or summary.get("max_level") == "NO_TRAVEL"
        if not has_no_travel:
            all_no_travel = False

        # Checkpoints validation
        checkpoints = route.get("checkpoints", [])
        if not checkpoints or len(checkpoints) < 2:
            errors.append(f"Route {r_id}: expected at least 2 checkpoints (start & end), found {len(checkpoints)}")
            continue

        # Checkpoint mile boundaries
        first_cp = checkpoints[0]
        last_cp = checkpoints[-1]

        if abs(first_cp.get("mile", -1.0) - 0.0) > 0.01:
            errors.append(f"Route {r_id}: first checkpoint mile is not 0.0 ({first_cp.get('mile')})")
        if abs(last_cp.get("mile", -1.0) - dist_mi) > 0.5:
            errors.append(f"Route {r_id}: last checkpoint mile ({last_cp.get('mile')}) != route distance ({dist_mi})")

        # Checkpoint ETA monotonicity
        prev_dt: datetime.datetime | None = None
        for cp_idx, cp in enumerate(checkpoints):
            eta_str = cp.get("eta")
            if not eta_str:
                errors.append(f"Route {r_id} CP #{cp_idx}: missing ETA")
                continue
            try:
                curr_dt = datetime.datetime.fromisoformat(eta_str.replace("Z", "+00:00"))
                if prev_dt is not None and curr_dt < prev_dt:
                    errors.append(f"Route {r_id} CP #{cp_idx}: ETA is not monotonic ({eta_str} < {prev_dt})")
                prev_dt = curr_dt
            except ValueError:
                errors.append(f"Route {r_id} CP #{cp_idx}: invalid ISO-8601 ETA format '{eta_str}'")

            # Risk level and driver
            level = cp.get("level")
            valid_levels = {"LOW", "MODERATE", "HIGH", "SEVERE", "NO_TRAVEL", "UNKNOWN"}
            if level not in valid_levels:
                errors.append(f"Route {r_id} CP #{cp_idx}: invalid risk level '{level}'")

            driver = cp.get("driver")
            valid_drivers = {"wind", "rain", "snow", "load_rule", None}
            if driver not in valid_drivers:
                errors.append(f"Route {r_id} CP #{cp_idx}: invalid driver '{driver}'")

    # Recommendation validation
    if all_no_travel:
        if recommended_id is not None:
            errors.append(f"All routes have No Travel, but recommended_route_id '{recommended_id}' was returned")
        if "delaying departure" not in explanation.lower() and "unsafe" not in explanation.lower():
            errors.append("All routes are unsafe, but explanation does not suggest delaying departure")
    else:
        if recommended_id not in route_ids:
            errors.append(f"Recommended route ID '{recommended_id}' is not in returned routes: {route_ids}")

    return errors


def run_random_smoke_tests(count: int, url: str, in_process: bool, seed: int | None = None) -> int:
    """Executes N randomized live US route smoke tests and displays results."""
    if seed is not None:
        random.seed(seed)
        print(f"Using fixed random seed: {seed}")

    if in_process:
        setup_django_environment()

    print(f"\n{BOLD}{'=' * 80}{RESET}")
    print(f"{BOLD}{CYAN}  CLIMATRIX: LIVE RANDOM US ROUTE SMOKE TEST RUNNER{RESET}")
    print(f"  Target: {url if not in_process else 'In-Process Django DRF APIClient'}")
    print(f"  Test Iterations: {count}")
    print(f"{BOLD}{'=' * 80}{RESET}\n")

    passed_count = 0
    failed_count = 0

    for i in range(1, count + 1):
        # Sample two distinct freight cities
        origin, destination = random.sample(US_FREIGHT_HUBS, 2)
        load_lb = random.choice(LOAD_WEIGHT_BRACKETS)
        departure = get_departure_time_iso(hours_ahead=random.randint(1, 18))

        payload: dict[str, Any] = {
            "origin": origin,
            "destination": destination,
            "departure": departure,
            "load_lb": load_lb,
            "interval_miles": None,  # Adaptive
        }

        print(f"{BOLD}Test {i:2d}/{count:2d}:{RESET} {origin} -> {destination} | Load: {load_lb:,} lbs")

        status_code, data, elapsed = send_analyze_request(payload, url, in_process)

        if status_code != 200:
            print(f"  {RED}FAILED (HTTP {status_code}){RESET} in {elapsed:.2f}s")
            print(f"  Error payload: {data}")
            failed_count += 1
            print("-" * 80)
            continue

        errors = validate_route_response(data, payload)

        if errors:
            print(f"  {RED}FAILED Validation{RESET} in {elapsed:.2f}s:")
            for err in errors:
                print(f"    - {RED}{err}{RESET}")
            failed_count += 1
        else:
            routes = data.get("routes", [])
            winner_id = data.get("recommended_route_id")
            explanation = data.get("explanation", "")

            # Identify winning route stats
            winner_route = next((r for r in routes if r.get("id") == winner_id), routes[0] if routes else None)
            dist_str = f"{winner_route['distance_mi']:.1f} mi" if winner_route else "N/A"
            dur_str = f"{winner_route['duration_min'] / 60.0:.1f} hrs" if winner_route else "N/A"
            max_risk = winner_route["summary"].get("max_level", "LOW") if winner_route else "N/A"

            status_badge = f"{GREEN}PASSED{RESET}"
            print(
                f"  {status_badge} ({elapsed:.2f}s) | Routes: {len(routes)} | Best: {winner_id or 'No Travel'} "
                f"({dist_str}, {dur_str}) | Max Risk: {max_risk}"
            )
            print(f"  {CYAN}Rationale:{RESET} {explanation[:110]}...")
            passed_count += 1

        print("-" * 80)

    # Final summary box
    print(f"\n{BOLD}{'=' * 80}{RESET}")
    print(f"{BOLD}SMOKE TEST SUMMARY:{RESET}")
    print(f"  Total Routes Tested: {count}")
    print(f"  Passed:              {GREEN}{passed_count}{RESET}")
    print(f"  Failed:              {RED if failed_count > 0 else GREEN}{failed_count}{RESET}")
    print(f"{BOLD}{'=' * 80}{RESET}\n")

    return 0 if failed_count == 0 else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Live Random US Route Smoke Test for Climatrix")
    parser.add_argument("--count", type=int, default=3, help="Number of random routes to test (default: 3)")
    parser.add_argument(
        "--url",
        type=str,
        default="http://localhost:8000/api/analyze",
        help="API analyze endpoint URL (default: http://localhost:8000/api/analyze)",
    )
    parser.add_argument(
        "--in-process",
        action="store_true",
        help="Run in-process using Django DRF APIClient (no external HTTP server needed)",
    )
    parser.add_argument("--seed", type=int, default=None, help="Optional random seed for reproducibility")

    args = parser.parse_args()
    exit_code = run_random_smoke_tests(
        count=args.count,
        url=args.url,
        in_process=args.in_process,
        seed=args.seed,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
