"""
Pure ETA calculation module.
Computes estimated arrival time (ETA) for each checkpoint along a route,
using route step/segment durations and truck speed factor.
Ensures monotonic arrival times and exact match for final arrival.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from routing.services.constants import DEFAULT_TRUCK_SPEED_FACTOR


def interpolate_cumulative_duration(
    target_mile: float,
    total_distance_miles: float,
    total_duration_seconds: float,
    segments: Sequence[dict[str, float]] | None = None,
) -> float:
    """
    Interpolate cumulative travel duration (in seconds) at target_mile.
    If segment breakdown is provided, interpolates within the matching segment.
    Otherwise, applies proportional distance interpolation.
    """
    if target_mile <= 0.0 or total_distance_miles <= 1e-9:
        return 0.0
    if target_mile >= total_distance_miles:
        return total_duration_seconds

    # If segments breakdown is available
    if segments:
        cum_dist = 0.0
        cum_dur = 0.0
        for seg in segments:
            seg_dist = seg.get("distance_miles", 0.0)
            seg_dur = seg.get("duration_seconds", 0.0)
            if cum_dist + seg_dist >= target_mile:
                remaining_dist = target_mile - cum_dist
                if seg_dist > 1e-9:
                    seg_fraction = remaining_dist / seg_dist
                    return cum_dur + seg_fraction * seg_dur
                return cum_dur
            cum_dist += seg_dist
            cum_dur += seg_dur
        return total_duration_seconds

    # Proportional interpolation fallback
    fraction = target_mile / total_distance_miles
    return fraction * total_duration_seconds


def calculate_checkpoint_etas(
    checkpoints: Sequence[dict[str, Any]],
    departure_dt: datetime,
    total_distance_miles: float,
    total_duration_seconds: float,
    truck_speed_factor: float = DEFAULT_TRUCK_SPEED_FACTOR,
    segments: Sequence[dict[str, float]] | None = None,
) -> list[dict[str, Any]]:
    """
    Given a list of checkpoint dictionaries (with 'mile', 'lat', 'lon'),
    compute the ETA for each checkpoint.

    Rules from AGENTS.md:
    - eta = departure + cumulative_duration_at_mile * truck_speed_factor
    - ETAs must be monotonic
    - Final ETA must equal departure + total_duration * truck_speed_factor
    """
    if not checkpoints:
        return []

    result: list[dict[str, Any]] = []
    prev_seconds = 0.0
    total_scaled_duration = total_duration_seconds * truck_speed_factor

    for idx, cp in enumerate(checkpoints):
        mile = cp["mile"]
        if idx == 0 or mile <= 0.0:
            elapsed_seconds = 0.0
        elif idx == len(checkpoints) - 1 or mile >= total_distance_miles:
            elapsed_seconds = total_scaled_duration
        else:
            base_duration = interpolate_cumulative_duration(
                target_mile=mile,
                total_distance_miles=total_distance_miles,
                total_duration_seconds=total_duration_seconds,
                segments=segments,
            )
            elapsed_seconds = base_duration * truck_speed_factor

        # Guarantee monotonicity: elapsed_seconds >= prev_seconds
        elapsed_seconds = max(elapsed_seconds, prev_seconds)

        # Guarantee elapsed_seconds does not exceed total_scaled_duration
        elapsed_seconds = min(elapsed_seconds, total_scaled_duration)

        prev_seconds = elapsed_seconds

        eta_dt = departure_dt + timedelta(seconds=round(elapsed_seconds))
        updated_cp = dict(cp)
        updated_cp["eta"] = eta_dt.isoformat()
        result.append(updated_cp)

    return result
