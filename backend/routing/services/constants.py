"""
Domain constants and configurations for the Truck Route Safety application.
As mandated by AGENTS.md, all thresholds, tolerances, speed factors,
and intervals are centralized here with no magic numbers.
"""

from enum import IntEnum
from typing import Final


class RiskLevel(IntEnum):
    UNKNOWN = -1
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        if self == RiskLevel.UNKNOWN:
            return "UNKNOWN"
        return self.name

    @classmethod
    def from_string(cls, name: str) -> "RiskLevel":
        try:
            return cls[name.upper()]
        except KeyError:
            return cls.UNKNOWN


# --- Weather Thresholds (Boundary Conventions from AGENTS.md) ---
# Wind (mph): Continuous, lower bound inclusive, upper bound exclusive
WIND_MODERATE_MIN: Final[float] = 25.0
WIND_HIGH_MIN: Final[float] = 35.0
WIND_SEVERE_MIN: Final[float] = 45.0
WIND_NO_TRAVEL_MIN: Final[float] = 55.0

# Rain (in/hr): Lower bound inclusive, No Travel strictly greater than 1.00
RAIN_MODERATE_MIN: Final[float] = 0.10
RAIN_HIGH_MIN: Final[float] = 0.25
RAIN_SEVERE_MIN: Final[float] = 0.50
RAIN_NO_TRAVEL_MIN: Final[float] = 1.00  # > 1.00 is NO_TRAVEL

# Snow (in/hr): Lower bound inclusive, No Travel strictly greater than 3.0
SNOW_MODERATE_MIN: Final[float] = 0.5
SNOW_HIGH_MIN: Final[float] = 1.0
SNOW_SEVERE_MIN: Final[float] = 2.0
SNOW_NO_TRAVEL_MIN: Final[float] = 3.0  # > 3.0 is NO_TRAVEL

# --- Load Rules ---
LOAD_THRESHOLD_30K: Final[float] = 30000.0  # Wind 45-54 mph + load > 30,000 lb -> NO_TRAVEL
LOAD_THRESHOLD_40K: Final[float] = 40000.0  # Wind 35-44 mph + load > 40,000 lb -> SEVERE

# --- Sampling Intervals (Miles) ---
INTERVAL_SHORT_ROUTE_MAX_MILES: Final[float] = 100.0
INTERVAL_MEDIUM_ROUTE_MAX_MILES: Final[float] = 300.0

INTERVAL_TIER_SHORT: Final[int] = 10
INTERVAL_TIER_MEDIUM: Final[int] = 25
INTERVAL_TIER_LONG: Final[int] = 50

ALLOWED_INTERVAL_OVERRIDES: Final[tuple[int, ...]] = (10, 25, 50)

# --- Recommendation & Ranking ---
AVG_RISK_TIE_TOLERANCE: Final[float] = 0.05

# --- Default Truck Speed Factor ---
DEFAULT_TRUCK_SPEED_FACTOR: Final[float] = 1.0
