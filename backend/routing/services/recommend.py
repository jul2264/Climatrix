"""
Pure route metrics calculation and recommendation engine.
Calculates distance-weighted risk metrics, filters out unsafe routes (No Travel),
ranks eligible routes lexicographically with tie tolerance, and generates plain-English explanations.
"""

from collections.abc import Sequence
from functools import cmp_to_key

from routing.services.constants import AVG_RISK_TIE_TOLERANCE, RiskLevel
from routing.services.types import Checkpoint, RouteAnalysis, RouteSummary


def calculate_checkpoint_segment_distances(miles: Sequence[float]) -> list[float]:
    """
    Compute the distance represented by each checkpoint.
    Endpoints receive half-segments. Intermediate checkpoints receive
    half the distance to the previous and next checkpoints.
    Sum of weights equals total route distance.
    """
    n = len(miles)
    if n == 0:
        return []
    if n == 1:
        return [0.0]

    weights: list[float] = []
    for i in range(n):
        if i == 0:
            w = (miles[1] - miles[0]) / 2.0
        elif i == n - 1:
            w = (miles[-1] - miles[-2]) / 2.0
        else:
            w = (miles[i + 1] - miles[i - 1]) / 2.0
        weights.append(round(w, 4))
    return weights


def calculate_route_summary(
    checkpoints: Sequence[Checkpoint],
    total_distance_miles: float,
    total_duration_minutes: float,
) -> RouteSummary:
    """
    Calculate distance-weighted risk metrics for a route:
    - no_travel_miles
    - severe_miles
    - high_miles
    - avg_risk (distance-weighted)
    - max_level
    """
    if not checkpoints:
        return RouteSummary(
            no_travel_miles=0.0,
            severe_miles=0.0,
            high_miles=0.0,
            avg_risk=0.0,
            distance_mi=round(total_distance_miles, 1),
            duration_min=round(total_duration_minutes, 1),
            max_level="LOW",
        )

    miles = [cp.mile for cp in checkpoints]
    weights = calculate_checkpoint_segment_distances(miles)

    no_travel_miles = 0.0
    severe_miles = 0.0
    high_miles = 0.0
    weighted_risk_sum = 0.0
    known_weight_total = 0.0
    max_level_enum = RiskLevel.LOW

    for cp, w in zip(checkpoints, weights, strict=False):
        lvl = RiskLevel.from_string(cp.level)
        max_level_enum = max(max_level_enum, lvl)

        if lvl == RiskLevel.NO_TRAVEL:
            no_travel_miles += w
        elif lvl == RiskLevel.SEVERE:
            severe_miles += w
        elif lvl == RiskLevel.HIGH:
            high_miles += w

        if lvl != RiskLevel.UNKNOWN:
            weighted_risk_sum += w * float(lvl)
            known_weight_total += w

    avg_risk: float | None = None
    if known_weight_total > 1e-4:
        avg_risk = round(weighted_risk_sum / known_weight_total, 3)

    return RouteSummary(
        no_travel_miles=round(no_travel_miles, 1),
        severe_miles=round(severe_miles, 1),
        high_miles=round(high_miles, 1),
        avg_risk=avg_risk,
        distance_mi=round(total_distance_miles, 1),
        duration_min=round(total_duration_minutes, 1),
        max_level=max_level_enum.label,
    )


def compare_routes(a: RouteAnalysis, b: RouteAnalysis) -> int:
    """
    Lexicographic comparator for two eligible routes:
    1. severe_miles (lower is better)
    2. high_miles (lower is better)
    3. avg_risk (lower is better, tolerance 0.05)
    4. duration_min (lower is better)
    5. distance_mi (lower is better)
    """
    # 1. Severe miles
    diff_severe = a.summary.severe_miles - b.summary.severe_miles
    if abs(diff_severe) > 1e-4:
        return -1 if diff_severe < 0 else 1

    # 2. High miles
    diff_high = a.summary.high_miles - b.summary.high_miles
    if abs(diff_high) > 1e-4:
        return -1 if diff_high < 0 else 1

    # 3. Average risk with tie tolerance
    risk_a = a.summary.avg_risk if a.summary.avg_risk is not None else 0.0
    risk_b = b.summary.avg_risk if b.summary.avg_risk is not None else 0.0
    diff_risk = risk_a - risk_b
    if abs(diff_risk) > AVG_RISK_TIE_TOLERANCE:
        return -1 if diff_risk < 0 else 1

    # 4. Duration
    diff_dur = a.duration_min - b.duration_min
    if abs(diff_dur) > 1e-4:
        return -1 if diff_dur < 0 else 1

    # 5. Distance
    diff_dist = a.distance_mi - b.distance_mi
    if abs(diff_dist) > 1e-4:
        return -1 if diff_dist < 0 else 1

    return 0


def generate_recommendation_explanation(
    winner: RouteAnalysis,
    all_routes: Sequence[RouteAnalysis],
) -> str:
    """
    Produce a plain-English explanation of why the winner was chosen
    relative to the alternative routes.
    """
    reasons: list[str] = []
    others = [r for r in all_routes if r.id != winner.id]

    # Note if any routes were disqualified due to No Travel
    no_travel_others = [r for r in others if r.summary.no_travel_miles > 0]
    if no_travel_others:
        ids_str = ", ".join(r.id for r in no_travel_others)
        reasons.append(
            f"Alternative route(s) ({ids_str}) contain hazardous No Travel weather conditions and are not drivable."
        )

    # Compare against eligible competitors
    eligible_others = [r for r in others if r.summary.no_travel_miles == 0]
    for other in eligible_others:
        if other.summary.severe_miles > winner.summary.severe_miles:
            diff = round(other.summary.severe_miles - winner.summary.severe_miles, 1)
            reasons.append(f"Avoids {diff} miles of severe weather exposure present on {other.id}.")
        elif other.summary.high_miles > winner.summary.high_miles:
            diff = round(other.summary.high_miles - winner.summary.high_miles, 1)
            reasons.append(f"Avoids {diff} miles of high risk weather present on {other.id}.")
        elif (
            other.summary.avg_risk is not None
            and winner.summary.avg_risk is not None
            and (other.summary.avg_risk - winner.summary.avg_risk) > AVG_RISK_TIE_TOLERANCE
        ):
            reasons.append(
                f"Provides significantly lower overall weather risk ({winner.summary.avg_risk:.2f} vs {other.summary.avg_risk:.2f} on {other.id})."
            )
        elif winner.duration_min < other.duration_min:
            saved = round(other.duration_min - winner.duration_min, 1)
            reasons.append(
                f"With safety metrics comparable to {other.id}, offers a faster travel time by {saved} minutes."
            )

    if not reasons:
        reasons.append(
            f"Provides the best balance of weather safety ({winner.summary.severe_miles} severe mi) and travel duration ({round(winner.duration_min)} min)."
        )

    # Departure Window Advisory: When corridor risks exist, append actionable departure guidance
    if winner.summary.severe_miles > 0:
        reasons.append(
            f"Note: Route encounters {winner.summary.severe_miles} miles of severe weather. Consider adjusting departure by 1–2 hours if squalls or storm fronts are passing."
        )

    return f"{winner.id} is recommended: " + " ".join(reasons)


def rank_and_recommend_routes(
    routes: Sequence[RouteAnalysis],
) -> tuple[str | None, str]:
    """
    Ranks routes according to AGENTS.md rules:
    - Exclude any route with No Travel checkpoints
    - If all routes have No Travel, return (None, explanation suggesting delaying departure)
    - Rank eligible routes lexicographically with 0.05 average risk tolerance
    - Return (recommended_route_id, explanation)
    """
    if not routes:
        return None, "No route options available."

    # Exclude routes with No Travel
    eligible_routes = [r for r in routes if r.summary.no_travel_miles == 0]

    if not eligible_routes:
        return (
            None,
            "All available routes contain hazardous No Travel conditions. Travel is unsafe; we recommend delaying departure until weather conditions improve.",
        )

    # Sort eligible routes
    sorted_eligible = sorted(eligible_routes, key=cmp_to_key(compare_routes))
    winner = sorted_eligible[0]
    explanation = generate_recommendation_explanation(winner, routes)

    return winner.id, explanation
