"""
Pure Departure Window Optimizer Service.
Evaluates alternative departure time shifts (e.g. -4h to +12h) across
cached 49-hour weather forecasts to find the safest departure window.

Pure module: no Django imports, no HTTP, no I/O.
"""

from datetime import datetime, timedelta
from typing import Any

from routing.services.constants import AVG_RISK_TIE_TOLERANCE
from routing.services.recommend import calculate_route_summary
from routing.services.risk import classify_checkpoint_risk
from routing.services.types import (
    Checkpoint,
    DepartureCandidate,
    DepartureOptimization,
)


def match_forecast_at_datetime(
    hourly_weather: dict[str, Any],
    target_dt: datetime,
) -> tuple[float | None, float | None, float | None]:
    """
    Given an hourly forecast dictionary and a target datetime,
    find the forecast hour nearest to the target in O(1) constant time.
    Returns (wind_mph, rain_in_hr, snow_in_hr).
    """
    times = hourly_weather.get("times", [])
    if not times:
        return None, None, None

    # Cached parsed start datetime on the dictionary for O(1) arithmetic
    start_dt = hourly_weather.get("_start_dt")
    if start_dt is None:
        try:
            start_dt = datetime.fromisoformat(times[0].replace("Z", "+00:00"))
            hourly_weather["_start_dt"] = start_dt
        except Exception:
            start_dt = None

    if start_dt is not None:
        # Align tzinfo if needed
        aligned_target = target_dt
        if start_dt.tzinfo is not None and aligned_target.tzinfo is None:
            aligned_target = aligned_target.replace(tzinfo=start_dt.tzinfo)
        elif start_dt.tzinfo is None and aligned_target.tzinfo is not None:
            aligned_target = aligned_target.replace(tzinfo=None)

        diff_hours = int(round((aligned_target - start_dt).total_seconds() / 3600.0))
        best_idx = max(0, min(len(times) - 1, diff_hours))
    else:
        best_idx = 0

    wind_list = hourly_weather.get("wind_speed_10m", [])
    rain_list = hourly_weather.get("rain", [])
    snow_list = hourly_weather.get("snowfall", [])

    wind = wind_list[best_idx] if best_idx < len(wind_list) else None
    rain = rain_list[best_idx] if best_idx < len(rain_list) else None
    snow = snow_list[best_idx] if best_idx < len(snow_list) else None

    return (
        float(wind) if wind is not None else None,
        float(rain) if rain is not None else None,
        float(snow) if snow is not None else None,
    )


def optimize_departure_window(
    route_meta_list: list[dict[str, Any]],
    route_checkpoints_meta: list[list[dict[str, Any]]],
    batch_weather: list[dict[str, Any]],
    base_departure_dt: datetime,
    load_lb: float,
    hours_backward: int = 4,
    hours_forward: int = 12,
    step_hours: int = 1,
) -> DepartureOptimization:
    """
    Pure optimization function evaluating departure time shifts against
    pre-fetched weather forecasts.

    Args:
        route_meta_list: Metadata for each route (id, distance_mi, duration_min).
        route_checkpoints_meta: List of checkpoints per route, each with lat, lon, mile, eta.
        batch_weather: Flattened list of hourly weather dictionaries matching checkpoint order.
        base_departure_dt: Driver's initial requested departure datetime.
        load_lb: Cargo load weight in pounds.
        hours_backward: Max hours to look prior to requested departure (default 4).
        hours_forward: Max hours to look after requested departure (default 12).
        step_hours: Time resolution in hours (default 1).

    Returns:
        DepartureOptimization containing the optimal departure time, safety gains,
        and full hourly candidate timeline.
    """
    # Pre-calculate relative travel durations from departure for each checkpoint
    # route_idx -> list of (mile, lat, lon, offset_seconds, weather_dict)
    route_cps_indexed: list[list[tuple[float, float, float, float, dict[str, Any]]]] = []
    weather_ptr = 0

    for route_idx, _ in enumerate(route_meta_list):
        cps = route_checkpoints_meta[route_idx]
        indexed_cps = []
        for cp in cps:
            cp_eta = datetime.fromisoformat(cp["eta"].replace("Z", "+00:00"))
            if base_departure_dt.tzinfo is not None and cp_eta.tzinfo is None:
                cp_eta = cp_eta.replace(tzinfo=base_departure_dt.tzinfo)
            travel_sec = max(0.0, (cp_eta - base_departure_dt).total_seconds())

            wx = batch_weather[weather_ptr] if weather_ptr < len(batch_weather) else {}
            weather_ptr += 1
            indexed_cps.append((cp["mile"], cp["lat"], cp["lon"], travel_sec, wx))
        route_cps_indexed.append(indexed_cps)

    # Evaluate each candidate departure offset
    candidates: list[DepartureCandidate] = []
    offsets = list(range(-hours_backward, hours_forward + 1, step_hours))

    for offset_h in offsets:
        candidate_dep_dt = base_departure_dt + timedelta(hours=offset_h)
        best_route_at_offset: dict[str, Any] | None = None
        best_route_key: tuple[Any, ...] | None = None

        # Evaluate all routes at this departure offset
        for route_idx, r_meta in enumerate(route_meta_list):
            r_dist = r_meta["distance_mi"]
            r_dur = r_meta["duration_min"]
            cps_data = route_cps_indexed[route_idx]

            evaluated_cps: list[Checkpoint] = []
            for mile, lat, lon, travel_sec, wx in cps_data:
                shifted_eta_dt = candidate_dep_dt + timedelta(seconds=travel_sec)
                wind, rain, snow = match_forecast_at_datetime(wx, shifted_eta_dt)
                risk_lvl, driver = classify_checkpoint_risk(
                    wind_mph=wind,
                    rain_in_hr=rain,
                    snow_in_hr=snow,
                    load_lb=load_lb,
                )
                evaluated_cps.append(
                    Checkpoint(
                        mile=mile,
                        lat=lat,
                        lon=lon,
                        eta=shifted_eta_dt.isoformat(),
                        wind_mph=round(wind, 1) if wind is not None else None,
                        rain_in_hr=round(rain, 2) if rain is not None else None,
                        snow_in_hr=round(snow, 2) if snow is not None else None,
                        level=risk_lvl.label,
                        driver=driver,
                    )
                )

            summary = calculate_route_summary(
                checkpoints=evaluated_cps,
                total_distance_miles=r_dist,
                total_duration_minutes=r_dur,
            )

            # Lexicographical score: lower is safer
            has_no_travel = summary.no_travel_miles > 0
            binned_avg = (
                round(summary.avg_risk / AVG_RISK_TIE_TOLERANCE)
                * AVG_RISK_TIE_TOLERANCE
                if summary.avg_risk is not None
                else 999.0
            )
            route_key = (
                has_no_travel,
                summary.no_travel_miles,
                summary.severe_miles,
                summary.high_miles,
                binned_avg,
                r_dur,
            )

            if best_route_key is None or route_key < best_route_key:
                best_route_key = route_key
                best_route_at_offset = {
                    "id": r_meta["id"],
                    "summary": summary,
                }

        if best_route_at_offset is not None:
            summ = best_route_at_offset["summary"]
            candidates.append(
                DepartureCandidate(
                    offset_hours=offset_h,
                    departure_iso=candidate_dep_dt.isoformat(),
                    no_travel_miles=summ.no_travel_miles,
                    severe_miles=summ.severe_miles,
                    high_miles=summ.high_miles,
                    avg_risk=summ.avg_risk,
                    is_drivable=summ.no_travel_miles == 0,
                    recommended_route_id=best_route_at_offset["id"]
                    if summ.no_travel_miles == 0
                    else None,
                    max_level=summ.max_level,
                )
            )

    if not candidates:
        raise ValueError("No valid departure candidates could be evaluated.")

    # Find the base (requested) departure candidate (offset_h == 0)
    base_candidate = next((c for c in candidates if c.offset_hours == 0), candidates[0])

    # Rank candidate departure windows
    def candidate_ranking_key(c: DepartureCandidate) -> tuple[Any, ...]:
        binned_risk = (
            round(c.avg_risk / AVG_RISK_TIE_TOLERANCE) * AVG_RISK_TIE_TOLERANCE
            if c.avg_risk is not None
            else 999.0
        )
        return (
            not c.is_drivable,  # Drivable (no_travel == 0) first
            c.no_travel_miles,
            c.severe_miles,
            c.high_miles,
            binned_risk,
            abs(c.offset_hours),  # Prefer minimum schedule disruption
            1 if c.offset_hours < 0 else 0,  # Prefer delaying over departing early
        )

    ranked = sorted(candidates, key=candidate_ranking_key)
    optimal = ranked[0]

    # Compute safety deltas compared to requested departure
    severe_eliminated = max(0.0, round(base_candidate.severe_miles - optimal.severe_miles, 1))
    risk_reduction = max(
        0.0,
        round((base_candidate.avg_risk or 0.0) - (optimal.avg_risk or 0.0), 2),
    )

    # Synthesize plain-English explanation
    if optimal.offset_hours == 0:
        if optimal.is_drivable:
            explanation = (
                "Your requested departure time is currently the optimal safety window. "
                f"Peak conditions remain at {optimal.max_level} risk."
            )
        else:
            explanation = (
                "All departure windows within the 16-hour evaluation range experience "
                "No Travel conditions. Consider delaying departure beyond +12 hours."
            )
    else:
        direction = "Delaying" if optimal.offset_hours > 0 else "Advancing"
        abs_h = abs(optimal.offset_hours)
        h_unit = "hour" if abs_h == 1 else "hours"
        opt_dt = datetime.fromisoformat(optimal.departure_iso)
        time_display = opt_dt.strftime("%I:%M %p")

        if base_candidate.no_travel_miles > 0 and optimal.is_drivable:
            explanation = (
                f"{direction} departure by {abs_h} {h_unit} (to {time_display}) "
                f"eliminates No Travel hazards ({base_candidate.no_travel_miles:.1f} mi avoided) "
                f"and makes the trip fully drivable."
            )
        elif severe_eliminated > 0:
            explanation = (
                f"{direction} departure by {abs_h} {h_unit} (to {time_display}) "
                f"eliminates {severe_eliminated:.1f} miles of Severe conditions, "
                f"reducing average risk from {base_candidate.avg_risk:.2f} to {optimal.avg_risk:.2f}."
            )
        else:
            explanation = (
                f"{direction} departure by {abs_h} {h_unit} (to {time_display}) "
                f"provides the lowest corridor weather risk ({optimal.max_level})."
            )

    return DepartureOptimization(
        requested_departure=base_departure_dt.isoformat(),
        recommended_departure=optimal.departure_iso,
        recommended_offset_hours=optimal.offset_hours,
        severe_miles_eliminated=severe_eliminated,
        avg_risk_reduction=risk_reduction,
        is_drivable=optimal.is_drivable,
        explanation=explanation,
        candidates=candidates,
    )
