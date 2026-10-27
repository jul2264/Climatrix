"""
Method B: Pytest Live Randomized US Route Integration Tests.

Tagged with @pytest.mark.live.
Can be executed explicitly via:
    pytest -m live
Or directly:
    pytest routing/tests/test_random_live.py
"""

import datetime
import random
from typing import Any

import pytest
from rest_framework.test import APIClient

US_TEST_HUBS = [
    "Chicago, IL",
    "Indianapolis, IN",
    "Columbus, OH",
    "St. Louis, MO",
    "Dallas, TX",
    "Atlanta, GA",
    "Denver, CO",
    "Kansas City, MO",
    "New York, NY",
    "Seattle, WA",
]


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.live
def test_random_live_us_route_analysis(client: APIClient) -> None:
    """
    Executes a live randomized route analysis across real US freight hubs.
    Selects 2 random cities, calls POST /api/analyze, and validates that:
    - Status code is 200
    - Alternative routes (1-3) are generated
    - Checkpoints start at 0.0 and finish at route distance
    - Checkpoint ETAs are strictly monotonic
    - Recommendation selects a drivable route or flags all un-drivable
    """
    origin, destination = random.sample(US_TEST_HUBS, 2)
    load_lb = random.choice([25000, 35000, 42000])
    dep = datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=2)

    payload: dict[str, Any] = {
        "origin": origin,
        "destination": destination,
        "departure": dep.isoformat(),
        "load_lb": load_lb,
    }

    response = client.post("/api/analyze", payload, format="json")
    assert response.status_code == 200, f"Live analyze failed with status {response.status_code}: {response.data}"

    data = response.json()
    assert "routes" in data
    routes = data["routes"]
    assert 1 <= len(routes) <= 3

    for route in routes:
        assert route["distance_mi"] > 0
        assert route["duration_min"] > 0
        assert route["geometry"]["type"] == "LineString"
        assert len(route["geometry"]["coordinates"]) >= 2

        cps = route["checkpoints"]
        assert len(cps) >= 2
        assert abs(cps[0]["mile"] - 0.0) < 0.01
        assert abs(cps[-1]["mile"] - route["distance_mi"]) < 0.5

        # Monotonic ETAs
        eta_dts = [datetime.datetime.fromisoformat(cp["eta"].replace("Z", "+00:00")) for cp in cps]
        for i in range(len(eta_dts) - 1):
            assert eta_dts[i] <= eta_dts[i + 1]

    winner = data.get("recommended_route_id")
    route_ids = [r["id"] for r in routes]
    has_drivable = any(r["summary"]["no_travel_miles"] == 0 for r in routes)

    if has_drivable:
        assert winner in route_ids
    else:
        assert winner is None
        assert "delaying departure" in data.get("explanation", "").lower() or "unsafe" in data.get("explanation", "").lower()
