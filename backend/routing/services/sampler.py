"""
Pure checkpoint sampling module.
Generates checkpoint locations along a decoded route polyline at adaptive or overridden intervals.
"""

from collections.abc import Sequence
from typing import Any

from routing.services.constants import (
    ALLOWED_INTERVAL_OVERRIDES,
    INTERVAL_MEDIUM_ROUTE_MAX_MILES,
    INTERVAL_SHORT_ROUTE_MAX_MILES,
    INTERVAL_TIER_LONG,
    INTERVAL_TIER_MEDIUM,
    INTERVAL_TIER_SHORT,
)
from routing.services.geometry import interpolate_point_at_mile


def determine_sampling_interval(
    route_distance_miles: float,
    interval_override: int | None = None,
) -> int:
    """
    Determine the checkpoint sampling interval in miles.
    Adaptive rules:
    - Under 100 miles: 10 miles
    - 100 to 300 miles: 25 miles
    - Over 300 miles: 50 miles

    Can be overridden by request (must be one of 10, 25, 50).
    """
    if interval_override is not None:
        if interval_override not in ALLOWED_INTERVAL_OVERRIDES:
            raise ValueError(
                f"Invalid interval_miles {interval_override}. Must be one of {ALLOWED_INTERVAL_OVERRIDES}"
            )
        return interval_override

    if route_distance_miles < INTERVAL_SHORT_ROUTE_MAX_MILES:
        return INTERVAL_TIER_SHORT
    elif route_distance_miles <= INTERVAL_MEDIUM_ROUTE_MAX_MILES:
        return INTERVAL_TIER_MEDIUM
    else:
        return INTERVAL_TIER_LONG


MAX_CHECKPOINTS_PER_ROUTE = 65


def generate_checkpoint_targets(
    route_distance_miles: float,
    interval_miles: int,
    max_checkpoints: int = MAX_CHECKPOINTS_PER_ROUTE,
) -> list[float]:
    """
    Generate target mile values along the route, always starting at 0.0
    and ending exactly at route_distance_miles.
    Enforces a maximum checkpoint safety cap to prevent API payload explosion
    on ultra-long transcontinental trips.
    """
    if route_distance_miles <= 0.0:
        return [0.0]

    step = float(interval_miles)
    estimated_count = int(route_distance_miles / max(1.0, step))
    if estimated_count > max_checkpoints:
        step = max(step, float(int(route_distance_miles / (max_checkpoints - 1))))

    targets: list[float] = [0.0]
    current = step
    # Use small epsilon (1e-4) to avoid duplicate points near the end
    while current < route_distance_miles - 1e-4:
        targets.append(round(current, 2))
        current += step

    if targets[-1] < route_distance_miles:
        targets.append(round(route_distance_miles, 2))

    return targets


def sample_checkpoints(
    coords: Sequence[tuple[float, float]],
    reported_total_miles: float,
    interval_override: int | None = None,
) -> list[dict[str, Any]]:
    """
    Generate checkpoints along coordinates list, scaled to reported_total_miles.
    Returns list of dicts with {"mile": float, "lat": float, "lon": float}.
    """
    interval = determine_sampling_interval(reported_total_miles, interval_override)
    target_miles = generate_checkpoint_targets(reported_total_miles, interval)

    checkpoints: list[dict[str, Any]] = []
    for m in target_miles:
        lat, lon = interpolate_point_at_mile(
            coords,
            target_mile=m,
            reported_total_distance_miles=reported_total_miles,
        )
        checkpoints.append(
            {
                "mile": m,
                "lat": round(lat, 5),
                "lon": round(lon, 5),
            }
        )

    return checkpoints
