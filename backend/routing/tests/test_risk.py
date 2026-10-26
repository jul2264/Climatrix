"""
Unit tests for risk.py:
- Every boundary for wind, rain, and snow
- All load rules with strict boundary comparisons (> 30000, > 40000)
- Combined factor max calculation
- Driver attribution ('wind', 'rain', 'snow', 'load_rule')
- Missing data resulting in UNKNOWN
"""

from routing.services.constants import RiskLevel
from routing.services.risk import (
    classify_checkpoint_risk,
    classify_rain_risk,
    classify_snow_risk,
    classify_wind_risk,
)


def test_classify_wind_boundaries():
    # Wind: <25 Low, 25-34 Moderate, 35-44 High, 45-54 Severe, >=55 No Travel
    # Lower bound inclusive, upper bound exclusive
    assert classify_wind_risk(0.0) == RiskLevel.LOW
    assert classify_wind_risk(24.99) == RiskLevel.LOW
    assert classify_wind_risk(25.0) == RiskLevel.MODERATE
    assert classify_wind_risk(34.99) == RiskLevel.MODERATE
    assert classify_wind_risk(35.0) == RiskLevel.HIGH
    assert classify_wind_risk(44.99) == RiskLevel.HIGH
    assert classify_wind_risk(45.0) == RiskLevel.SEVERE
    assert classify_wind_risk(54.99) == RiskLevel.SEVERE
    assert classify_wind_risk(55.0) == RiskLevel.NO_TRAVEL
    assert classify_wind_risk(75.0) == RiskLevel.NO_TRAVEL


def test_classify_rain_boundaries():
    # Rain: <0.10 Low, 0.10-0.25 Moderate, 0.25-0.50 High, 0.50-1.00 Severe, >1.00 No Travel
    assert classify_rain_risk(0.0) == RiskLevel.LOW
    assert classify_rain_risk(0.099) == RiskLevel.LOW
    assert classify_rain_risk(0.10) == RiskLevel.MODERATE
    assert classify_rain_risk(0.249) == RiskLevel.MODERATE
    assert classify_rain_risk(0.25) == RiskLevel.HIGH
    assert classify_rain_risk(0.499) == RiskLevel.HIGH
    assert classify_rain_risk(0.50) == RiskLevel.SEVERE
    assert classify_rain_risk(1.00) == RiskLevel.SEVERE
    assert classify_rain_risk(1.001) == RiskLevel.NO_TRAVEL
    assert classify_rain_risk(2.50) == RiskLevel.NO_TRAVEL


def test_classify_snow_boundaries():
    # Snow: <0.5 Low, 0.5-1.0 Moderate, 1.0-2.0 High, 2.0-3.0 Severe, >3.0 No Travel
    assert classify_snow_risk(0.0) == RiskLevel.LOW
    assert classify_snow_risk(0.499) == RiskLevel.LOW
    assert classify_snow_risk(0.50) == RiskLevel.MODERATE
    assert classify_snow_risk(0.999) == RiskLevel.MODERATE
    assert classify_snow_risk(1.00) == RiskLevel.HIGH
    assert classify_snow_risk(1.999) == RiskLevel.HIGH
    assert classify_snow_risk(2.00) == RiskLevel.SEVERE
    assert classify_snow_risk(3.00) == RiskLevel.SEVERE
    assert classify_snow_risk(3.001) == RiskLevel.NO_TRAVEL
    assert classify_snow_risk(5.00) == RiskLevel.NO_TRAVEL


def test_load_rules_and_driver_attribution():
    # 1. Wind >= 55: No Travel for any load (driver: wind)
    lvl, driver = classify_checkpoint_risk(
        wind_mph=55.0, rain_in_hr=0.0, snow_in_hr=0.0, load_lb=20000.0
    )
    assert lvl == RiskLevel.NO_TRAVEL
    assert driver == "wind"

    # 2. Wind 45-54 mph and load > 30,000 lb: No Travel (driver: load_rule)
    # At 30,000 lb exact (strict > 30000): Severe (from wind), not elevated to No Travel
    lvl_exact_30k, drv_exact_30k = classify_checkpoint_risk(
        wind_mph=48.0, rain_in_hr=0.0, snow_in_hr=0.0, load_lb=30000.0
    )
    assert lvl_exact_30k == RiskLevel.SEVERE
    assert drv_exact_30k == "wind"

    # At 30,001 lb: Elevated to No Travel
    lvl_elevated, drv_elevated = classify_checkpoint_risk(
        wind_mph=48.0, rain_in_hr=0.0, snow_in_hr=0.0, load_lb=30001.0
    )
    assert lvl_elevated == RiskLevel.NO_TRAVEL
    assert drv_elevated == "load_rule"

    # 3. Wind 35-44 mph and load > 40,000 lb: Severe (driver: load_rule)
    # At 40,000 lb exact: High
    lvl_exact_40k, drv_exact_40k = classify_checkpoint_risk(
        wind_mph=40.0, rain_in_hr=0.0, snow_in_hr=0.0, load_lb=40000.0
    )
    assert lvl_exact_40k == RiskLevel.HIGH
    assert drv_exact_40k == "wind"

    # At 45,000 lb (illustrative example from AGENTS.md / Phase 2): Severe
    lvl_45k, drv_45k = classify_checkpoint_risk(
        wind_mph=40.0, rain_in_hr=0.15, snow_in_hr=0.0, load_lb=45000.0
    )
    assert lvl_45k == RiskLevel.SEVERE
    assert drv_45k == "load_rule"


def test_driver_attribution_precipitation():
    # Rain is highest driver
    lvl, driver = classify_checkpoint_risk(
        wind_mph=10.0, rain_in_hr=0.60, snow_in_hr=0.0, load_lb=25000.0
    )
    assert lvl == RiskLevel.SEVERE
    assert driver == "rain"

    # Snow is highest driver
    lvl, driver = classify_checkpoint_risk(
        wind_mph=10.0, rain_in_hr=0.0, snow_in_hr=1.5, load_lb=25000.0
    )
    assert lvl == RiskLevel.HIGH
    assert driver == "snow"

    # All low
    lvl, driver = classify_checkpoint_risk(
        wind_mph=10.0, rain_in_hr=0.01, snow_in_hr=0.0, load_lb=25000.0
    )
    assert lvl == RiskLevel.LOW


def test_missing_weather_data_unknown():
    # Missing all data
    lvl, driver = classify_checkpoint_risk(
        wind_mph=None, rain_in_hr=None, snow_in_hr=None, load_lb=40000.0
    )
    assert lvl == RiskLevel.UNKNOWN
    assert driver is None
