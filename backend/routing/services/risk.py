"""
Pure risk classification module.
Evaluates weather risk levels and applies truck load-specific rules.
Single source of truth for risk calculation.
"""

from routing.services.constants import (
    LOAD_THRESHOLD_30K,
    LOAD_THRESHOLD_40K,
    RAIN_HIGH_MIN,
    RAIN_MODERATE_MIN,
    RAIN_NO_TRAVEL_MIN,
    RAIN_SEVERE_MIN,
    SNOW_HIGH_MIN,
    SNOW_MODERATE_MIN,
    SNOW_NO_TRAVEL_MIN,
    SNOW_SEVERE_MIN,
    WIND_HIGH_MIN,
    WIND_MODERATE_MIN,
    WIND_NO_TRAVEL_MIN,
    WIND_SEVERE_MIN,
    RiskLevel,
)
from routing.services.types import RiskDriver


def classify_wind_risk(wind_mph: float | None) -> RiskLevel:
    """
    Wind risk classification (mph):
    - < 25: Low
    - 25 to 34: Moderate
    - 35 to 44: High
    - 45 to 54: Severe
    - >= 55: No Travel
    Continuous: lower bound inclusive, upper bound exclusive.
    """
    if wind_mph is None:
        return RiskLevel.UNKNOWN
    if wind_mph < WIND_MODERATE_MIN:
        return RiskLevel.LOW
    elif wind_mph < WIND_HIGH_MIN:
        return RiskLevel.MODERATE
    elif wind_mph < WIND_SEVERE_MIN:
        return RiskLevel.HIGH
    elif wind_mph < WIND_NO_TRAVEL_MIN:
        return RiskLevel.SEVERE
    else:
        return RiskLevel.NO_TRAVEL


def classify_rain_risk(rain_in_hr: float | None) -> RiskLevel:
    """
    Rain risk classification (in/hr):
    - < 0.10: Low
    - 0.10 to 0.25: Moderate
    - 0.25 to 0.50: High
    - 0.50 to 1.00: Severe
    - > 1.00: No Travel
    Lower bound inclusive; > 1.00 is strictly greater than.
    """
    if rain_in_hr is None:
        return RiskLevel.UNKNOWN
    if rain_in_hr < RAIN_MODERATE_MIN:
        return RiskLevel.LOW
    elif rain_in_hr < RAIN_HIGH_MIN:
        return RiskLevel.MODERATE
    elif rain_in_hr < RAIN_SEVERE_MIN:
        return RiskLevel.HIGH
    elif rain_in_hr <= RAIN_NO_TRAVEL_MIN:
        return RiskLevel.SEVERE
    else:
        return RiskLevel.NO_TRAVEL


def classify_snow_risk(snow_in_hr: float | None) -> RiskLevel:
    """
    Snow risk classification (in/hr):
    - < 0.5: Low
    - 0.5 to 1.0: Moderate
    - 1.0 to 2.0: High
    - 2.0 to 3.0: Severe
    - > 3.0: No Travel
    Lower bound inclusive; > 3.0 is strictly greater than.
    """
    if snow_in_hr is None:
        return RiskLevel.UNKNOWN
    if snow_in_hr < SNOW_MODERATE_MIN:
        return RiskLevel.LOW
    elif snow_in_hr < SNOW_HIGH_MIN:
        return RiskLevel.MODERATE
    elif snow_in_hr < SNOW_SEVERE_MIN:
        return RiskLevel.HIGH
    elif snow_in_hr <= SNOW_NO_TRAVEL_MIN:
        return RiskLevel.SEVERE
    else:
        return RiskLevel.NO_TRAVEL


def apply_load_rules(
    wind_mph: float | None,
    load_lb: float,
    base_level: RiskLevel,
) -> tuple[RiskLevel, RiskDriver | None]:
    """
    Apply truck load rules on top of base risk level:
    - Wind >= 55 mph: No Travel for any load
    - Wind 45-54 mph and load > 30,000 lb: No Travel
    - Wind 35-44 mph and load > 40,000 lb: Severe (raise to at least Severe)

    Returns (final_level, driver_attribution).
    """
    if wind_mph is None:
        return base_level, None

    # Wind >= 55 mph -> No Travel for any load
    if wind_mph >= WIND_NO_TRAVEL_MIN:
        return RiskLevel.NO_TRAVEL, "wind"

    # Wind 45-54 mph and load > 30,000 lb -> No Travel
    if WIND_SEVERE_MIN <= wind_mph < WIND_NO_TRAVEL_MIN and load_lb > LOAD_THRESHOLD_30K:
        if base_level < RiskLevel.NO_TRAVEL:
            return RiskLevel.NO_TRAVEL, "load_rule"

    # Wind 35-44 mph and load > 40,000 lb -> Severe (raise to at least Severe)
    if WIND_HIGH_MIN <= wind_mph < WIND_SEVERE_MIN and load_lb > LOAD_THRESHOLD_40K:
        if base_level < RiskLevel.SEVERE:
            return RiskLevel.SEVERE, "load_rule"

    return base_level, None


def classify_checkpoint_risk(
    wind_mph: float | None,
    rain_in_hr: float | None,
    snow_in_hr: float | None,
    load_lb: float,
) -> tuple[RiskLevel, RiskDriver | None]:
    """
    Full checkpoint risk determination:
    1. Determine wind, rain, and snow risk levels.
    2. If all weather variables are missing, returns UNKNOWN.
    3. base = max(wind_level, rain_level, snow_level).
    4. Apply load rules to produce final level and identify driver.
    """
    wind_level = classify_wind_risk(wind_mph)
    rain_level = classify_rain_risk(rain_in_hr)
    snow_level = classify_snow_risk(snow_in_hr)

    # Missing data handling
    valid_levels = [lvl for lvl in (wind_level, rain_level, snow_level) if lvl != RiskLevel.UNKNOWN]
    if not valid_levels:
        return RiskLevel.UNKNOWN, None

    base_level = max(valid_levels)

    # Base driver attribution
    base_driver: RiskDriver | None = None
    if base_level > RiskLevel.LOW:
        if wind_level == base_level:
            base_driver = "wind"
        elif rain_level == base_level:
            base_driver = "rain"
        elif snow_level == base_level:
            base_driver = "snow"

    # Apply load rules
    final_level, load_driver = apply_load_rules(wind_mph, load_lb, base_level)
    if load_driver is not None:
        return final_level, load_driver

    return final_level, base_driver
