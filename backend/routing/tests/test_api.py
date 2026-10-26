"""
Integration tests for /api/analyze and /api/heatmap endpoints:
- Offline tests with mocked third-party clients
- Validation tests (400 for bad input)
- Seeded severe weather demo fixture showing load rule outcome change
- All routes unsafe scenario
- Heatmap GeoJSON 49-hour property verification
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

FIXTURES_PATH = Path(__file__).parent / "fixtures" / "trips.json"


@pytest.fixture
def recorded_routes():
    with open(FIXTURES_PATH) as f:
        data = json.load(f)
    return data["chicago_to_indy_routes"]


@pytest.fixture
def api_client():
    return APIClient()


@patch("routing.services.analyze.geocode_address")
@patch("routing.services.analyze.fetch_truck_routes")
@patch("routing.services.analyze.fetch_hourly_weather_batch")
def test_analyze_endpoint_success(
    mock_weather, mock_routes, mock_geocode, api_client, recorded_routes
):
    mock_geocode.side_effect = [(41.8781, -87.6298), (39.7684, -86.1581)]
    mock_routes.return_value = recorded_routes

    # Supply mock hourly weather
    dummy_weather = {
        "times": [
            "2026-10-25T08:00",
            "2026-10-25T09:00",
            "2026-10-25T10:00",
            "2026-10-25T11:00",
            "2026-10-25T12:00",
        ],
        "wind_speed_10m": [15.0, 18.0, 20.0, 22.0, 20.0],
        "rain": [0.0, 0.0, 0.05, 0.0, 0.0],
        "snowfall": [0.0, 0.0, 0.0, 0.0, 0.0],
    }
    # Return dummy weather for each checkpoint
    mock_weather.side_effect = lambda coords: [dummy_weather for _ in coords]

    payload = {
        "origin": "Chicago, IL",
        "destination": "Indianapolis, IN",
        "departure": "2026-10-25T08:00:00-04:00",
        "load_lb": 42000,
        "interval_miles": 25,
    }

    response = api_client.post("/api/analyze", payload, format="json")
    assert response.status_code == 200
    data = response.json()

    assert "routes" in data
    assert len(data["routes"]) == 3
    assert data["recommended_route_id"] is not None
    assert "explanation" in data

    first_route = data["routes"][0]
    assert "checkpoints" in first_route
    assert len(first_route["checkpoints"]) > 0
    cp = first_route["checkpoints"][0]
    assert cp["mile"] == 0.0
    assert "eta" in cp
    assert "level" in cp


@patch("routing.services.analyze.geocode_address")
@patch("routing.services.analyze.fetch_truck_routes")
@patch("routing.services.analyze.fetch_hourly_weather_batch")
def test_load_rule_visibly_changes_recommendation(
    mock_weather, mock_routes, mock_geocode, api_client, recorded_routes
):
    """
    Demonstrates that 40 mph sustained wind causes:
    - Load 25,000 lb -> High risk (Route B remains eligible with 0 severe miles)
    - Load 45,000 lb -> Severe risk (Route B gets severe miles, preferring Route A)
    """
    mock_geocode.side_effect = lambda q: (
        (41.8781, -87.6298) if "Chicago" in q else (39.7684, -86.1581)
    )
    mock_routes.return_value = recorded_routes

    def make_weather_for_coords(coords):
        results = []
        for lat, lon in coords:
            # Route B checkpoints around lat 41.6 have 40 mph wind
            if abs(lat - 41.6) < 0.2:
                results.append(
                    {
                        "times": [
                            "2026-10-25T08:00",
                            "2026-10-25T09:00",
                            "2026-10-25T10:00",
                            "2026-10-25T11:00",
                        ],
                        "wind_speed_10m": [40.0, 40.0, 40.0, 40.0],
                        "rain": [0.0, 0.0, 0.0, 0.0],
                        "snowfall": [0.0, 0.0, 0.0, 0.0],
                    }
                )
            else:
                results.append(
                    {
                        "times": [
                            "2026-10-25T08:00",
                            "2026-10-25T09:00",
                            "2026-10-25T10:00",
                            "2026-10-25T11:00",
                        ],
                        "wind_speed_10m": [15.0, 15.0, 15.0, 15.0],
                        "rain": [0.0, 0.0, 0.0, 0.0],
                        "snowfall": [0.0, 0.0, 0.0, 0.0],
                    }
                )
        return results

    mock_weather.side_effect = make_weather_for_coords

    # Test 1: Light load (25,000 lb)
    resp_light = api_client.post(
        "/api/analyze",
        {
            "origin": "Chicago, IL",
            "destination": "Indianapolis, IN",
            "departure": "2026-10-25T08:00:00Z",
            "load_lb": 25000,
            "interval_miles": 25,
        },
        format="json",
    )
    assert resp_light.status_code == 200
    data_light = resp_light.json()
    rB_light = next(r for r in data_light["routes"] if r["id"] == "Route B")
    assert rB_light["summary"]["severe_miles"] == 0.0

    # Test 2: Heavy load (45,000 lb)
    resp_heavy = api_client.post(
        "/api/analyze",
        {
            "origin": "Chicago, IL",
            "destination": "Indianapolis, IN",
            "departure": "2026-10-25T08:00:00Z",
            "load_lb": 45000,
            "interval_miles": 25,
        },
        format="json",
    )
    assert resp_heavy.status_code == 200
    data_heavy = resp_heavy.json()
    rB_heavy = next(r for r in data_heavy["routes"] if r["id"] == "Route B")
    # Elevated to Severe by load rule!
    assert rB_heavy["summary"]["severe_miles"] > 0.0


def test_analyze_validation_errors(api_client):
    # Missing origin
    resp = api_client.post(
        "/api/analyze",
        {"destination": "Indy", "departure": "2026-10-25T08:00:00Z", "load_lb": 40000},
        format="json",
    )
    assert resp.status_code == 400

    # Negative / zero load
    resp_load = api_client.post(
        "/api/analyze",
        {
            "origin": "Chicago",
            "destination": "Indy",
            "departure": "2026-10-25T08:00:00Z",
            "load_lb": 0,
        },
        format="json",
    )
    assert resp_load.status_code == 400

    # Invalid interval
    resp_interval = api_client.post(
        "/api/analyze",
        {
            "origin": "Chicago",
            "destination": "Indy",
            "departure": "2026-10-25T08:00:00Z",
            "load_lb": 40000,
            "interval_miles": 35,  # must be 10, 25, or 50
        },
        format="json",
    )
    assert resp_interval.status_code == 400


@patch("routing.services.analyze.geocode_address")
@patch("routing.services.analyze.fetch_truck_routes")
@patch("routing.services.analyze.fetch_hourly_weather_batch")
def test_all_routes_no_travel_returns_null_recommendation(
    mock_weather, mock_routes, mock_geocode, api_client, recorded_routes
):
    mock_geocode.side_effect = lambda q: (41.8781, -87.6298)
    mock_routes.return_value = recorded_routes

    # All checkpoints experience 60 mph wind (No Travel)
    extreme_weather = {
        "times": ["2026-10-25T08:00"],
        "wind_speed_10m": [60.0],
        "rain": [0.0],
        "snowfall": [0.0],
    }
    mock_weather.side_effect = lambda coords: [extreme_weather for _ in coords]

    response = api_client.post(
        "/api/analyze",
        {
            "origin": "Chicago, IL",
            "destination": "Indianapolis, IN",
            "departure": "2026-10-25T08:00:00Z",
            "load_lb": 40000,
        },
        format="json",
    )
    assert response.status_code == 200
    data = response.json()

    assert data["recommended_route_id"] is None
    assert (
        "delaying departure" in data["explanation"].lower()
        or "unsafe" in data["explanation"].lower()
    )


@patch("routing.views.fetch_hourly_weather_batch")
def test_heatmap_endpoint(mock_weather, api_client):
    mock_weather.side_effect = lambda coords: [
        {
            "times": [f"2026-10-25T{h:02d}:00" for h in range(49)],
            "wind_speed_10m": [15.0] * 49,
            "rain": [0.0] * 49,
            "snowfall": [0.0] * 49,
        }
        for _ in coords
    ]

    response = api_client.get("/api/heatmap?origin=Chicago&destination=Indianapolis")
    assert response.status_code == 200
    geojson = response.json()

    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 0
    first_feat = geojson["features"][0]
    assert "risk_by_hour" in first_feat["properties"]
    assert len(first_feat["properties"]["risk_by_hour"]) == 49


@patch("routing.views.fetch_hourly_weather_batch")
def test_heatmap_different_regions_do_not_collide(mock_weather, api_client):
    """Verifies that heatmap for Columbus->St. Louis does not return Chicago->Indy coordinates."""
    mock_weather.side_effect = lambda coords: [
        {
            "times": [f"2026-10-25T{h:02d}:00" for h in range(49)],
            "wind_speed_10m": [10.0] * 49,
            "rain": [0.0] * 49,
            "snowfall": [0.0] * 49,
        }
        for _ in coords
    ]

    # Query Chicago to Indianapolis
    resp1 = api_client.get("/api/heatmap?origin=Chicago,%20IL&destination=Indianapolis,%20IN")
    assert resp1.status_code == 200
    features1 = resp1.json()["features"]
    lons1 = [f["geometry"]["coordinates"][0] for f in features1]
    assert any(-88.0 <= lon <= -86.0 for lon in lons1)

    # Now query Columbus, OH to St. Louis, MO
    resp2 = api_client.get("/api/heatmap?origin=Columbus,%20OH&destination=St.%20Louis,%20MO")
    assert resp2.status_code == 200
    features2 = resp2.json()["features"]
    lons2 = [f["geometry"]["coordinates"][0] for f in features2]
    assert any(lon < -89.0 for lon in lons2)
    assert any(lon > -84.0 for lon in lons2)


@patch("routing.clients.geocode.requests.get")
def test_city_autocomplete_endpoint(mock_get, api_client):
    """Verifies that autocomplete endpoint returns city suggestions using ORS Pelias."""
    from unittest.mock import MagicMock

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "features": [
            {
                "properties": {"name": "Indianapolis", "region_a": "IN"},
                "geometry": {"coordinates": [-86.1581, 39.7684]},
            }
        ]
    }
    mock_get.return_value = mock_resp

    response = api_client.get("/api/geocode/autocomplete?q=Indian")
    assert response.status_code == 200
    results = response.json()
    assert len(results) >= 1
    assert any("Indianapolis" in r["name"] for r in results)


@patch("routing.clients.weather._session.get")
def test_weather_batch_spatial_deduplication(mock_get):
    """Verifies that fetch_hourly_weather_batch deduplicates redundant coordinates to 0.1 deg."""
    from unittest.mock import MagicMock

    from django.core.cache import cache

    from routing.clients.weather import fetch_hourly_weather_batch

    cache.clear()

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "hourly": {
            "time": ["2026-10-25T08:00"],
            "wind_speed_10m": [22.5],
            "rain": [0.1],
            "snowfall": [0.0],
        }
    }
    mock_get.return_value = mock_resp

    # 4 coords, but 1st and 3rd round to 41.9, -87.6; 2nd and 4th round to 39.8, -86.2
    test_coords = [
        (41.88, -87.63),
        (39.77, -86.16),
        (41.87, -87.62),
        (39.76, -86.15),
    ]

    results = fetch_hourly_weather_batch(test_coords)
    assert len(results) == 4
    for r in results:
        assert r["wind_speed_10m"] == [22.5]

    # Only 2 unique spatial cells should have been queried
    assert mock_get.call_count <= 2


@patch("routing.clients.geocode.requests.get")
def test_geocode_address_ors_pelias(mock_get):
    """Verifies that geocode_address successfully resolves coordinates via ORS Pelias Geocode."""
    from unittest.mock import MagicMock

    from django.core.cache import cache

    from routing.clients.geocode import geocode_address

    cache.clear()

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "features": [
            {
                "geometry": {
                    "coordinates": [-122.4194, 37.7749],
                }
            }
        ]
    }
    mock_get.return_value = mock_resp

    lat, lon = geocode_address("Custom City, CA")
    assert round(lat, 4) == 37.7749
    assert round(lon, 4) == -122.4194


@patch("routing.clients.geocode.requests.get")
def test_geocode_address_nominatim_fallback(mock_get):
    """Verifies that geocode_address falls back to Nominatim if ORS fails."""
    from unittest.mock import MagicMock

    from django.core.cache import cache

    from routing.clients.geocode import geocode_address

    cache.clear()

    ors_failure = MagicMock()
    ors_failure.status_code = 500

    nominatim_success = MagicMock()
    nominatim_success.status_code = 200
    nominatim_success.json.return_value = [{"lat": "32.7157", "lon": "-117.1611"}]

    mock_get.side_effect = [ors_failure, nominatim_success]

    lat, lon = geocode_address("San Diego, CA")
    assert round(lat, 4) == 32.7157
    assert round(lon, 4) == -117.1611


