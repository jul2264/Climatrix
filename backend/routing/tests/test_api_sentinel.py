"""
Integration tests for Sentinel Start and Telemetry API endpoints.
"""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_sentinel_start_and_telemetry():
    client = APIClient()

    # 1. Start trip
    start_payload = {
        "trip_id": "test_trip_123",
        "origin": "Chicago, IL",
        "destination": "Indianapolis, IN",
        "load_lb": 40000.0,
        "departure": "2026-10-26T12:00:00Z",
        "route_geometry": {"type": "LineString", "coordinates": [[-87.6, 41.8], [-86.1, 39.7]]},
        "checkpoints": [
            {
                "mile": 0.0,
                "lat": 41.8,
                "lon": -87.6,
                "eta": "2026-10-26T12:00:00Z",
                "wind_mph": 10.0,
                "level": "LOW",
                "driver": None,
            },
            {
                "mile": 100.0,
                "lat": 39.7,
                "lon": -86.1,
                "eta": "2026-10-26T14:00:00Z",
                "wind_mph": 15.0,
                "level": "LOW",
                "driver": None,
            },
        ],
    }

    resp = client.post("/api/sentinel/start", start_payload, format="json")
    assert resp.status_code == 200
    assert resp.data["status"] == "MONITORING_ACTIVE"
    assert resp.data["trip_id"] == "test_trip_123"

    # 2. Mock fresh weather and send telemetry ping at mile 25.0
    mock_weather = [
        {
            "times": ["2026-10-26T12:00", "2026-10-26T13:00", "2026-10-26T14:00"],
            "wind_speed_10m": [12.0, 12.0, 12.0],
            "rain": [0.0, 0.0, 0.0],
            "snowfall": [0.0, 0.0, 0.0],
        },
        {
            "times": ["2026-10-26T12:00", "2026-10-26T13:00", "2026-10-26T14:00"],
            "wind_speed_10m": [15.0, 15.0, 15.0],
            "rain": [0.0, 0.0, 0.0],
            "snowfall": [0.0, 0.0, 0.0],
        },
    ]

    with patch("routing.views.fetch_hourly_weather_batch", return_value=mock_weather):
        telem_resp = client.post(
            "/api/sentinel/telemetry",
            {"trip_id": "test_trip_123", "current_mile": 25.0},
            format="json",
        )

        assert telem_resp.status_code == 200
        assert telem_resp.data["status"] == "NOMINAL"
        assert telem_resp.data["current_mile"] == 25.0
        assert telem_resp.data["remaining_miles"] == 75.0
        assert telem_resp.data["remaining_checkpoints"] == 1
