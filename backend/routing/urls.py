"""
URL configuration for routing app.
"""

from django.urls import path

from routing.views import (
    AnalyzeTripView,
    CityAutocompleteView,
    HealthCheckView,
    HeatmapView,
    SentinelStartView,
    SentinelTelemetryView,
)

urlpatterns = [
    path("health", HealthCheckView.as_view(), name="health_check"),
    path("analyze", AnalyzeTripView.as_view(), name="analyze_trip"),
    path("heatmap", HeatmapView.as_view(), name="heatmap"),
    path("geocode/autocomplete", CityAutocompleteView.as_view(), name="city_autocomplete"),
    path("sentinel/start", SentinelStartView.as_view(), name="sentinel_start"),
    path("sentinel/telemetry", SentinelTelemetryView.as_view(), name="sentinel_telemetry"),
]
