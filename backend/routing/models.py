from django.db import models


class ActiveTrip(models.Model):
    trip_id = models.CharField(max_length=64, primary_key=True)
    origin = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)
    load_lb = models.FloatField(default=40000.0)
    departure = models.CharField(max_length=64)
    current_mile = models.FloatField(default=0.0)
    status = models.CharField(max_length=20, default="ACTIVE")  # ACTIVE, DIVERTED, COMPLETED
    route_geometry = models.JSONField(default=dict)
    checkpoints_data = models.JSONField(default=list)
    last_alert = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Trip {self.trip_id} ({self.origin} -> {self.destination})"
