"""
DRF Serializers for Truck Route Safety API.
Validates input requests and structures responses.
"""

from datetime import UTC, datetime

from rest_framework import serializers

from routing.services.constants import ALLOWED_INTERVAL_OVERRIDES


class AnalyzeRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=255,
        error_messages={"blank": "Origin location cannot be empty."},
    )
    destination = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=255,
        error_messages={"blank": "Destination location cannot be empty."},
    )
    departure = serializers.CharField(
        required=True,
        error_messages={"required": "Departure date/time is required."},
    )
    load_lb = serializers.FloatField(
        required=True,
        min_value=0.01,
        error_messages={
            "min_value": "Load weight must be strictly greater than 0 lbs.",
        },
    )
    interval_miles = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
    )

    def validate_departure(self, value: str) -> str:
        try:
            val_cleaned = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(val_cleaned)
            # Ensure it is timezone aware
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
        except ValueError:
            raise serializers.ValidationError("Invalid ISO-8601 departure timestamp with offset.")
        return value

    def validate_interval_miles(self, value: int | None) -> int | None:
        if value is not None and value not in ALLOWED_INTERVAL_OVERRIDES:
            raise serializers.ValidationError(
                f"Sampling interval must be one of {ALLOWED_INTERVAL_OVERRIDES} miles."
            )
        return value


class HeatmapRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(required=False, default="")
    destination = serializers.CharField(required=False, default="")
    load_lb = serializers.FloatField(required=False, default=40000.0)
    route_ids = serializers.CharField(required=False, default="")
