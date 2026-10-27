"""
Corridor grid generation and heatmap risk calculation module.
Generates grid points along route corridors with perpendicular lateral offsets,
caps total grid points to avoid payload inflation (~2,000 max),
and scores each point across 0-48 forecast hours using risk.py.
"""

import math
from collections.abc import Sequence
from typing import Any

from routing.services.constants import RiskLevel
from routing.services.geometry import EARTH_RADIUS_MILES, haversine_miles
from routing.services.risk import classify_checkpoint_risk

MAX_HEATMAP_POINTS = 2000
DEFAULT_CORRIDOR_STEP_MILES = 12.0
LATERAL_OFFSET_MILES = 12.0


def calculate_destination_point(
    lat: float, lon: float, distance_miles: float, bearing_deg: float
) -> tuple[float, float]:
    """Calculate target (lat, lon) given start, distance in miles, and bearing in degrees."""
    d_r = distance_miles / EARTH_RADIUS_MILES
    theta = math.radians(bearing_deg)
    phi1 = math.radians(lat)
    lambda1 = math.radians(lon)

    phi2 = math.asin(
        math.sin(phi1) * math.cos(d_r) + math.cos(phi1) * math.sin(d_r) * math.cos(theta)
    )
    lambda2 = lambda1 + math.atan2(
        math.sin(theta) * math.sin(d_r) * math.cos(phi1),
        math.cos(d_r) - math.sin(phi1) * math.sin(phi2),
    )

    return math.degrees(phi2), math.degrees(lambda2)


def generate_corridor_grid(
    routes_coords: Sequence[Sequence[tuple[float, float]]],
    step_miles: float = DEFAULT_CORRIDOR_STEP_MILES,
    offset_miles: float = LATERAL_OFFSET_MILES,
    max_points: int = MAX_HEATMAP_POINTS,
) -> list[tuple[float, float]]:
    """
    Generate corridor points along each route's polyline plus lateral perpendicular offsets.
    Deduplicates points within ~3 miles of each other, capped at max_points.
    """
    raw_points: list[tuple[float, float]] = []

    for coords in routes_coords:
        if not coords:
            continue
        if len(coords) < 2:
            raw_points.append(coords[0])
            continue

        accumulated_dist = 0.0
        last_sampled = 0.0
        raw_points.append(coords[0])

        for i in range(1, len(coords)):
            lat1, lon1 = coords[i - 1]
            lat2, lon2 = coords[i]
            seg_dist = haversine_miles(lat1, lon1, lat2, lon2)

            # Compute forward azimuth/bearing
            d_lon = math.radians(lon2 - lon1)
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            y = math.sin(d_lon) * math.cos(phi2)
            x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lon)
            bearing = (math.degrees(math.atan2(y, x)) + 360) % 360

            accumulated_dist += seg_dist
            while accumulated_dist - last_sampled >= step_miles:
                last_sampled += step_miles
                fraction = 1.0 - ((accumulated_dist - last_sampled) / max(seg_dist, 1e-9))
                interp_lat = lat1 + fraction * (lat2 - lat1)
                interp_lon = lon1 + fraction * (lon2 - lon1)

                # Center point
                raw_points.append((round(interp_lat, 4), round(interp_lon, 4)))

                # Lateral perpendicular offsets (+90 deg, -90 deg)
                p_left = calculate_destination_point(
                    interp_lat, interp_lon, offset_miles, (bearing - 90) % 360
                )
                p_right = calculate_destination_point(
                    interp_lat, interp_lon, offset_miles, (bearing + 90) % 360
                )
                raw_points.append((round(p_left[0], 4), round(p_left[1], 4)))
                raw_points.append((round(p_right[0], 4), round(p_right[1], 4)))

    # Deduplicate points that are very close (using ~0.08 deg bucket ~ 5 miles)
    seen: set[tuple[int, int]] = set()
    grid_points: list[tuple[float, float]] = []

    for lat, lon in raw_points:
        key = (int(round(lat * 12.0)), int(round(lon * 12.0)))
        if key not in seen:
            seen.add(key)
            grid_points.append((lat, lon))
            if len(grid_points) >= max_points:
                break

    return grid_points


def build_heatmap_geojson(
    grid_points: Sequence[tuple[float, float]],
    weather_by_point_and_hour: Sequence[Any],
    load_lb: float,
) -> dict[str, Any]:
    """
    Constructs GeoJSON FeatureCollection with risk_by_hour properties.
    Supports either pre-formatted hourly dicts or raw batch weather dicts directly
    for high-performance, zero-intermediate-allocation execution.
    """
    features: list[dict[str, Any]] = []

    for pt_idx, (lat, lon) in enumerate(grid_points):
        w_item = (
            weather_by_point_and_hour[pt_idx]
            if pt_idx < len(weather_by_point_and_hour)
            else None
        )
        risk_by_hour: list[int] = []

        if isinstance(w_item, dict) and "wind_speed_10m" in w_item:
            # High-performance fast path: Direct indexed lookup from batch weather arrays
            winds = w_item.get("wind_speed_10m", [])
            rains = w_item.get("rain", [])
            snows = w_item.get("snowfall", [])
            for h in range(49):
                w_val = float(winds[h]) if h < len(winds) and winds[h] is not None else None
                r_val = float(rains[h]) if h < len(rains) and rains[h] is not None else None
                s_val = float(snows[h]) if h < len(snows) and snows[h] is not None else None
                lvl, _ = classify_checkpoint_risk(w_val, r_val, s_val, load_lb)
                risk_by_hour.append(int(lvl))
        elif isinstance(w_item, list):
            # Fallback for list of hourly dicts
            for h in range(49):
                if h < len(w_item):
                    wf = w_item[h]
                    lvl, _ = classify_checkpoint_risk(
                        wind_mph=wf.get("wind_mph"),
                        rain_in_hr=wf.get("rain_in_hr"),
                        snow_in_hr=wf.get("snow_in_hr"),
                        load_lb=load_lb,
                    )
                    risk_by_hour.append(int(lvl))
                else:
                    risk_by_hour.append(int(RiskLevel.UNKNOWN))
        else:
            risk_by_hour = [int(RiskLevel.UNKNOWN)] * 49

        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
                "properties": {
                    "risk_by_hour": risk_by_hour,
                    "current_risk": risk_by_hour[0] if risk_by_hour else int(RiskLevel.UNKNOWN),
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
    }
