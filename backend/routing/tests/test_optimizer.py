"""
Unit tests for Departure Window Optimizer Service.
Tests pure temporal search, hazard avoidance, tie-breaking, and explanation generation.
"""

from datetime import UTC, datetime

from routing.services.optimizer import (
    match_forecast_at_datetime,
    optimize_departure_window,
)


def _build_hourly_weather(
    base_dt: datetime,
    offset_start_h: int = -6,
    total_hours: int = 60,
    wind_mph: float = 10.0,
    rain_in: float = 0.0,
    snow_in: float = 0.0,
    wind_overrides: dict[int, float] | None = None,
) -> dict:
    times = []
    wind_speed = []
    rain = []
    snowfall = []

    for rel_h in range(offset_start_h, offset_start_h + total_hours):
        t_str = datetime.fromtimestamp(
            base_dt.timestamp() + rel_h * 3600,
            tz=UTC,
        ).strftime("%Y-%m-%dT%H:00")
        times.append(t_str)

        w = wind_mph
        if wind_overrides and rel_h in wind_overrides:
            w = wind_overrides[rel_h]

        wind_speed.append(w)
        rain.append(rain_in)
        snowfall.append(snow_in)

    return {
        "times": times,
        "wind_speed_10m": wind_speed,
        "rain": rain,
        "snowfall": snowfall,
    }


def test_match_forecast_at_datetime():
    base_dt = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)
    wx = _build_hourly_weather(base_dt, wind_overrides={2: 45.0})

    target_dt = datetime(2026, 10, 26, 14, 10, tzinfo=UTC)
    wind, rain, snow = match_forecast_at_datetime(wx, target_dt)

    assert wind == 45.0
    assert rain == 0.0
    assert snow == 0.0


def test_optimizer_avoids_squall_line_by_delaying():
    base_dt = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)
    # Hour 0 to 2 has severe wind (58 mph -> NO_TRAVEL)
    # Hour 3+ drops to calm (15 mph -> LOW)
    squall_wx = _build_hourly_weather(
        base_dt,
        wind_mph=15.0,
        wind_overrides={0: 58.0, 1: 58.0, 2: 52.0},
    )

    route_meta = [{"id": "route_1", "distance_mi": 100.0, "duration_min": 120.0}]
    cps_meta = [
        [
            {"lat": 41.5, "lon": -87.5, "mile": 0.0, "eta": "2026-10-26T12:00:00Z"},
            {"lat": 41.8, "lon": -86.5, "mile": 100.0, "eta": "2026-10-26T14:00:00Z"},
        ]
    ]

    opt = optimize_departure_window(
        route_meta_list=route_meta,
        route_checkpoints_meta=cps_meta,
        batch_weather=[squall_wx, squall_wx],
        base_departure_dt=base_dt,
        load_lb=42000,
        hours_backward=2,
        hours_forward=6,
    )

    # Base departure (offset 0) has No Travel
    base_cand = next(c for c in opt.candidates if c.offset_hours == 0)
    assert base_cand.no_travel_miles > 0
    assert not base_cand.is_drivable

    # Optimal candidate should delay to avoid the squall (at least +3 hours)
    assert opt.recommended_offset_hours >= 3
    assert opt.is_drivable is True
    assert opt.severe_miles_eliminated > 0 or opt.avg_risk_reduction > 0
    assert "Delaying departure" in opt.explanation


def test_optimizer_prefers_minimum_offset_on_tie():
    base_dt = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)
    # Hour 0 is severe; Hours 1, 2, 3 are all calm
    wx = _build_hourly_weather(
        base_dt,
        wind_mph=10.0,
        wind_overrides={0: 50.0},
    )

    route_meta = [{"id": "route_1", "distance_mi": 50.0, "duration_min": 60.0}]
    cps_meta = [
        [
            {"lat": 41.5, "lon": -87.5, "mile": 0.0, "eta": "2026-10-26T12:00:00Z"},
            {"lat": 41.8, "lon": -86.5, "mile": 50.0, "eta": "2026-10-26T13:00:00Z"},
        ]
    ]

    opt = optimize_departure_window(
        route_meta_list=route_meta,
        route_checkpoints_meta=cps_meta,
        batch_weather=[wx, wx],
        base_departure_dt=base_dt,
        load_lb=35000,
        hours_backward=1,
        hours_forward=4,
    )

    # Offset +1 should be preferred over +2 or +3 because it minimizes delay
    assert opt.recommended_offset_hours == 1
    assert opt.is_drivable is True


def test_optimizer_requested_departure_already_optimal():
    base_dt = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)
    # All hours calm (12 mph wind)
    calm_wx = _build_hourly_weather(base_dt, wind_mph=12.0)

    route_meta = [{"id": "route_1", "distance_mi": 50.0, "duration_min": 60.0}]
    cps_meta = [
        [
            {"lat": 41.5, "lon": -87.5, "mile": 0.0, "eta": "2026-10-26T12:00:00Z"},
            {"lat": 41.8, "lon": -86.5, "mile": 50.0, "eta": "2026-10-26T13:00:00Z"},
        ]
    ]

    opt = optimize_departure_window(
        route_meta_list=route_meta,
        route_checkpoints_meta=cps_meta,
        batch_weather=[calm_wx, calm_wx],
        base_departure_dt=base_dt,
        load_lb=40000,
    )

    assert opt.recommended_offset_hours == 0
    assert opt.is_drivable is True
    assert "optimal safety window" in opt.explanation


def test_optimizer_recommends_advancing_departure():
    base_dt = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)
    # Hour -2 and -1 are calm; Hour 0+ has blizzard
    wx = _build_hourly_weather(
        base_dt,
        wind_mph=12.0,
        wind_overrides={0: 58.0, 1: 58.0, 2: 58.0, 3: 58.0},
    )

    route_meta = [{"id": "route_1", "distance_mi": 50.0, "duration_min": 60.0}]
    cps_meta = [
        [
            {"lat": 41.5, "lon": -87.5, "mile": 0.0, "eta": "2026-10-26T12:00:00Z"},
            {"lat": 41.8, "lon": -86.5, "mile": 50.0, "eta": "2026-10-26T13:00:00Z"},
        ]
    ]

    opt = optimize_departure_window(
        route_meta_list=route_meta,
        route_checkpoints_meta=cps_meta,
        batch_weather=[wx, wx],
        base_departure_dt=base_dt,
        load_lb=45000,
        hours_backward=3,
        hours_forward=2,
    )

    # Should recommend departing early (negative offset)
    assert opt.recommended_offset_hours < 0
    assert opt.is_drivable is True
    assert "Advancing departure" in opt.explanation
