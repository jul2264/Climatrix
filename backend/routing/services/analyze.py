"""
Orchestrator module for Truck Route Safety Analysis.
Coordinates geocoding, routing, checkpoint sampling, ETA calculation,
weather fetching, risk evaluation, and route recommendation.
"""

from datetime import datetime
from typing import Any

from django.conf import settings

from routing.clients.geocode import geocode_address
from routing.clients.routing import fetch_truck_routes
from routing.clients.weather import fetch_hourly_weather_batch, match_weather_at_eta
from routing.services.constants import DEFAULT_TRUCK_SPEED_FACTOR
from routing.services.eta import calculate_checkpoint_etas
from routing.services.optimizer import optimize_departure_window
from routing.services.recommend import (
    calculate_route_summary,
    rank_and_recommend_routes,
)
from routing.services.risk import classify_checkpoint_risk
from routing.services.sampler import sample_checkpoints
from routing.services.types import (
    AnalysisResult,
    Checkpoint,
    RouteAnalysis,
)


def analyze_trip(
    origin: str,
    destination: str,
    departure: str,
    load_lb: float,
    interval_miles: int | None = None,
) -> AnalysisResult:
    """
    Main orchestration function for POST /api/analyze:
    1. Geocode origin and destination addresses
    2. Retrieve up to 3 truck route alternatives
    3. Generate checkpoints with adaptive/overridden spacing
    4. Calculate monotonic ETAs for all checkpoints
    5. Retrieve batched weather forecasts from Open-Meteo
    6. Classify checkpoint risk with load-specific rules
    7. Calculate route summaries and rank routes lexicographically
    """
    # 1. Parse departure datetime
    dep_str = departure.replace("Z", "+00:00")
    departure_dt = datetime.fromisoformat(dep_str)

    # 2. Geocode
    origin_lat, origin_lon = geocode_address(origin)
    dest_lat, dest_lon = geocode_address(destination)

    # 3. Routing
    raw_routes = fetch_truck_routes(origin_lat, origin_lon, dest_lat, dest_lon)
    if not raw_routes:
        raise ValueError("Could not find any routes between origin and destination")

    truck_speed_factor = getattr(settings, "TRUCK_SPEED_FACTOR", DEFAULT_TRUCK_SPEED_FACTOR)

    # 4. Generate checkpoints & ETAs for each route
    route_checkpoints_meta: list[list[dict[str, Any]]] = []
    all_weather_query_coords: list[tuple[float, float]] = []

    for r in raw_routes:
        coords = r["coordinates_lat_lon"]
        dist_mi = r["distance_mi"]
        dur_min = r["duration_min"]

        sampled = sample_checkpoints(
            coords=coords,
            reported_total_miles=dist_mi,
            interval_override=interval_miles,
        )

        with_etas = calculate_checkpoint_etas(
            checkpoints=sampled,
            departure_dt=departure_dt,
            total_distance_miles=dist_mi,
            total_duration_seconds=dur_min * 60.0,
            truck_speed_factor=truck_speed_factor,
        )

        route_checkpoints_meta.append(with_etas)
        for cp in with_etas:
            all_weather_query_coords.append((cp["lat"], cp["lon"]))

    # 5. Batch fetch weather forecasts
    batch_weather = fetch_hourly_weather_batch(all_weather_query_coords)

    # 6. Build Checkpoint objects with risk evaluations
    weather_ptr = 0
    analyzed_routes: list[RouteAnalysis] = []

    for route_idx, r in enumerate(raw_routes):
        cps_with_etas = route_checkpoints_meta[route_idx]
        final_checkpoints: list[Checkpoint] = []

        for cp in cps_with_etas:
            hourly_data = batch_weather[weather_ptr]
            weather_ptr += 1

            wind_mph, rain_in, snow_in = match_weather_at_eta(hourly_data, cp["eta"])
            risk_lvl, driver = classify_checkpoint_risk(
                wind_mph=wind_mph,
                rain_in_hr=rain_in,
                snow_in_hr=snow_in,
                load_lb=load_lb,
            )

            final_checkpoints.append(
                Checkpoint(
                    mile=cp["mile"],
                    lat=cp["lat"],
                    lon=cp["lon"],
                    eta=cp["eta"],
                    wind_mph=round(wind_mph, 1) if wind_mph is not None else None,
                    rain_in_hr=round(rain_in, 2) if rain_in is not None else None,
                    snow_in_hr=round(snow_in, 2) if snow_in is not None else None,
                    level=risk_lvl.label,
                    driver=driver,
                )
            )

        summary = calculate_route_summary(
            checkpoints=final_checkpoints,
            total_distance_miles=r["distance_mi"],
            total_duration_minutes=r["duration_min"],
        )

        analyzed_routes.append(
            RouteAnalysis(
                id=r["id"],
                geometry=r["geometry"],
                distance_mi=r["distance_mi"],
                duration_min=r["duration_min"],
                summary=summary,
                checkpoints=final_checkpoints,
            )
        )

    # 7. Route Ranking & Recommendation
    recommended_id, explanation = rank_and_recommend_routes(analyzed_routes)

    # 8. Departure Window Optimizer Agent
    departure_opt = None
    try:
        route_meta_list = [
            {"id": r["id"], "distance_mi": r["distance_mi"], "duration_min": r["duration_min"]}
            for r in raw_routes
        ]
        departure_opt = optimize_departure_window(
            route_meta_list=route_meta_list,
            route_checkpoints_meta=route_checkpoints_meta,
            batch_weather=batch_weather,
            base_departure_dt=departure_dt,
            load_lb=load_lb,
            hours_backward=4,
            hours_forward=12,
        )
    except Exception:
        departure_opt = None

    return AnalysisResult(
        routes=analyzed_routes,
        recommended_route_id=recommended_id,
        explanation=explanation,
        departure_optimization=departure_opt,
    )
