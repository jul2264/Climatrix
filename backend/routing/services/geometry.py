"""
Pure geometry module for Truck Route Safety.
Handles polyline decoding, Haversine distance, cumulative distances,
and geographical interpolation along route polylines.
"""

import math
from collections.abc import Sequence

# Earth mean radius in statute miles
EARTH_RADIUS_MILES: float = 3958.7613


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in statute miles between two points."""
    if lat1 == lat2 and lon1 == lon2:
        return 0.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_MILES * c


def decode_polyline(polyline_str: str, precision: int = 5) -> list[tuple[float, float]]:
    """
    Decodes an encoded polyline string into a list of (lat, lon) coordinate tuples.
    Default precision is 5 (OpenRouteService / Google standard, factor 1e5).
    """
    factor = 10**precision
    coordinates: list[tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0
    length = len(polyline_str)

    while index < length:
        # Latitude
        shift = 0
        result = 0
        while True:
            if index >= length:
                break
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        # Longitude
        shift = 0
        result = 0
        while True:
            if index >= length:
                break
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coordinates.append((lat / factor, lng / factor))

    return coordinates


def cumulative_distances(coords: Sequence[tuple[float, float]]) -> list[float]:
    """
    Given a list of (lat, lon) coordinates, calculate the cumulative distance in miles
    from the start to each coordinate.
    """
    if not coords:
        return []
    cum = [0.0]
    total = 0.0
    for i in range(1, len(coords)):
        d = haversine_miles(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
        total += d
        cum.append(total)
    return cum


def interpolate_point_at_mile(
    coords: Sequence[tuple[float, float]],
    target_mile: float,
    reported_total_distance_miles: float | None = None,
) -> tuple[float, float]:
    """
    Interpolate (lat, lon) at a target mile along the sequence of coordinates.
    If reported_total_distance_miles is provided, the polyline's cumulative geometry distance
    is scaled to match the reported total distance.
    """
    if not coords:
        raise ValueError("Cannot interpolate along empty coordinate list")
    if len(coords) == 1:
        return coords[0]

    cum_dist = cumulative_distances(coords)
    geom_total = cum_dist[-1]

    # Handle edge case where all points are identical or route has 0 distance
    if geom_total <= 1e-9:
        return coords[0]

    # Scale target mile if reported_total_distance_miles is specified
    if reported_total_distance_miles is not None and reported_total_distance_miles > 1e-9:
        scale_ratio = geom_total / reported_total_distance_miles
        effective_mile = target_mile * scale_ratio
    else:
        effective_mile = target_mile

    # Clamp to route bounds
    if effective_mile <= 0.0:
        return coords[0]
    if effective_mile >= geom_total:
        return coords[-1]

    # Find the segment containing effective_mile
    for i in range(1, len(cum_dist)):
        if cum_dist[i] >= effective_mile:
            segment_length = cum_dist[i] - cum_dist[i - 1]
            if segment_length <= 1e-9:
                return coords[i]
            fraction = (effective_mile - cum_dist[i - 1]) / segment_length
            lat = coords[i - 1][0] + fraction * (coords[i][0] - coords[i - 1][0])
            lon = coords[i - 1][1] + fraction * (coords[i][1] - coords[i - 1][1])
            return lat, lon

    return coords[-1]


def calculate_bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate forward azimuth/bearing in degrees (0 to 360) from point 1 to point 2."""
    if abs(lat1 - lat2) < 1e-9 and abs(lon1 - lon2) < 1e-9:
        return 0.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_lon = math.radians(lon2 - lon1)
    y = math.sin(d_lon) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def calculate_crosswind_component(
    wind_speed_mph: float | None,
    wind_direction_deg: float | None,
    heading_deg: float,
) -> float | None:
    """
    Calculate the perpendicular crosswind component in mph relative to vehicle heading.
    Formula: V_cross = V_wind * |sin(wind_dir - heading)|
    """
    if wind_speed_mph is None or wind_direction_deg is None:
        return None
    angle_diff = math.radians(wind_direction_deg - heading_deg)
    return round(abs(wind_speed_mph * math.sin(angle_diff)), 1)

