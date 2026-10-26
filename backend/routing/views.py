import re
from datetime import UTC, datetime
from typing import Any

from django.core.cache import cache
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from routing.clients.geocode import autocomplete_cities, geocode_address
from routing.clients.routing import fetch_truck_routes
from routing.clients.weather import fetch_hourly_weather_batch
from routing.models import ActiveTrip
from routing.serializers import AnalyzeRequestSerializer, HeatmapRequestSerializer
from routing.services.analyze import analyze_trip
from routing.services.heatmap import build_heatmap_geojson, generate_corridor_grid
from routing.services.sentinel import evaluate_corridor_sentinel
from routing.services.types import Checkpoint


def get_corridor_cache_key(origin: str, destination: str) -> str:
    """Generate deterministic cache key for a trip corridor."""
    safe_orig = re.sub(r"[^a-zA-Z0-9_]", "_", origin.strip().lower())
    safe_dest = re.sub(r"[^a-zA-Z0-9_]", "_", destination.strip().lower())
    return f"corridor_routes_{safe_orig}_{safe_dest}"


class HealthCheckView(APIView):
    """
    Lightweight keep-alive health check for Render container pinging and uptime monitors.
    Returns instant 200 OK without database or external network overhead.
    """

    def get(self, request: Request) -> Response:
        return Response({"status": "healthy", "service": "climatrix-backend"})


class AnalyzeTripView(APIView):
    """
    POST /api/analyze
    Generates 3 truck routes, samples checkpoints with ETAs, calculates weather risk,
    and returns route comparisons and recommendation.
    """

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = AnalyzeRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors, "message": "Invalid trip parameters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        validated = serializer.validated_data
        try:
            result = analyze_trip(
                origin=validated["origin"],
                destination=validated["destination"],
                departure=validated["departure"],
                load_lb=validated["load_lb"],
                interval_miles=validated.get("interval_miles"),
            )

            # Cache the analyzed route geometries and load for this specific trip corridor
            trip_key = get_corridor_cache_key(validated["origin"], validated["destination"])
            cache.set(
                trip_key,
                {
                    "routes": [r.to_dict() for r in result.routes],
                    "load_lb": validated["load_lb"],
                },
                timeout=86400,
            )

            return Response(result.to_dict(), status=status.HTTP_200_OK)

        except ValueError as err:
            return Response(
                {"error": str(err)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"error": f"Upstream service failure: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class HeatmapView(APIView):
    """
    GET /api/heatmap?origin=...&destination=...&load_lb=...
    Generates a 48-hour corridor weather risk heatmap GeoJSON FeatureCollection
    specifically for the requested trip corridor.
    """

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = HeatmapRequestSerializer(data=request.query_params)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        origin = serializer.validated_data.get("origin", "").strip()
        dest = serializer.validated_data.get("destination", "").strip()
        load_lb = float(serializer.validated_data.get("load_lb", 40000.0))

        # Check trip-specific heatmap cache first
        if origin and dest:
            safe_orig = re.sub(r"[^a-zA-Z0-9_]", "_", origin.lower())
            safe_dest = re.sub(r"[^a-zA-Z0-9_]", "_", dest.lower())
            heatmap_cache_key = f"heatmap_geojson_{safe_orig}_{safe_dest}_{int(load_lb)}"
            cached_geojson = cache.get(heatmap_cache_key)
            if isinstance(cached_geojson, dict) and "features" in cached_geojson:
                return Response(cached_geojson, status=status.HTTP_200_OK)

        routes_coords: list[list[tuple[float, float]]] = []

        if origin and dest:
            trip_key = get_corridor_cache_key(origin, dest)
            cached_corridor = cache.get(trip_key)
            if cached_corridor and "routes" in cached_corridor:
                for r in cached_corridor["routes"]:
                    geom = r.get("geometry", {})
                    coords = geom.get("coordinates", [])
                    routes_coords.append([(c[1], c[0]) for c in coords])
            else:
                try:
                    orig_lat, orig_lon = geocode_address(origin)
                    d_lat, d_lon = geocode_address(dest)
                    routes = fetch_truck_routes(orig_lat, orig_lon, d_lat, d_lon)
                    for r in routes:
                        routes_coords.append(r["coordinates_lat_lon"])
                    cache.set(
                        trip_key,
                        {"routes": routes, "load_lb": load_lb},
                        timeout=86400,
                    )
                except Exception:
                    pass

        if not routes_coords:
            return Response(
                {"error": "Valid origin and destination are required to generate corridor heatmap."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Generate corridor grid points (~10 mi spacing + +/-12 mi lateral offsets)
        grid_points = generate_corridor_grid(routes_coords)

        # 2. Batch fetch 48-hour forecasts for all grid points (cached by 0.1 degree resolution)
        weather_data = fetch_hourly_weather_batch(grid_points)

        # 3. Build GeoJSON FeatureCollection via zero-allocation fast-path
        geojson = build_heatmap_geojson(
            grid_points=grid_points,
            weather_by_point_and_hour=weather_data,
            load_lb=load_lb,
        )

        # Cache the generated GeoJSON
        if origin and dest:
            safe_orig = re.sub(r"[^a-zA-Z0-9_]", "_", origin.lower())
            safe_dest = re.sub(r"[^a-zA-Z0-9_]", "_", dest.lower())
            heatmap_cache_key = f"heatmap_geojson_{safe_orig}_{safe_dest}_{int(load_lb)}"
            cache.set(heatmap_cache_key, geojson, timeout=1800)

        return Response(geojson, status=status.HTTP_200_OK)


class CityAutocompleteView(APIView):
    """
    GET /api/geocode/autocomplete?q=...
    Suggests US cities based on prefix query using OpenRouteService Pelias autocomplete.
    """

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response([], status=status.HTTP_200_OK)

        suggestions = autocomplete_cities(query, limit=6)
        return Response(suggestions, status=status.HTTP_200_OK)


class SentinelStartView(APIView):
    """
    POST /api/sentinel/start
    Registers an active trip for in-flight Sentinel monitoring.
    """

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        data = request.data
        trip_id = data.get("trip_id") or f"trip_{int(datetime.now().timestamp())}"
        origin = data.get("origin", "")
        destination = data.get("destination", "")
        load_lb = float(data.get("load_lb", 40000.0))
        departure = data.get("departure", "")
        route_geom = data.get("route_geometry", {})
        checkpoints = data.get("checkpoints", [])

        trip, _ = ActiveTrip.objects.update_or_create(
            trip_id=trip_id,
            defaults={
                "origin": origin,
                "destination": destination,
                "load_lb": load_lb,
                "departure": departure,
                "current_mile": 0.0,
                "status": "ACTIVE",
                "route_geometry": route_geom,
                "checkpoints_data": checkpoints,
            },
        )
        return Response(
            {
                "status": "MONITORING_ACTIVE",
                "trip_id": trip.trip_id,
                "origin": trip.origin,
                "destination": trip.destination,
                "total_checkpoints": len(checkpoints),
            },
            status=status.HTTP_200_OK,
        )


class SentinelTelemetryView(APIView):
    """
    POST /api/sentinel/telemetry
    Ingests vehicle progress (current_mile) and evaluates real-time corridor
    hazards against fresh weather.
    """

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        trip_id = request.data.get("trip_id")
        current_mile = float(request.data.get("current_mile", 0.0))

        if not trip_id:
            return Response({"error": "trip_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            trip = ActiveTrip.objects.get(trip_id=trip_id)
        except ActiveTrip.DoesNotExist:
            return Response({"error": f"Trip {trip_id} not found."}, status=status.HTTP_404_NOT_FOUND)

        trip.current_mile = current_mile
        cps_raw = trip.checkpoints_data

        # Parse stored checkpoints into domain Checkpoint objects
        domain_cps: list[Checkpoint] = [
            Checkpoint(
                mile=cp["mile"],
                lat=cp["lat"],
                lon=cp["lon"],
                eta=cp["eta"],
                wind_mph=cp.get("wind_mph"),
                rain_in_hr=cp.get("rain_in_hr"),
                snow_in_hr=cp.get("snow_in_hr"),
                level=cp["level"],
                driver=cp.get("driver"),
            )
            for cp in cps_raw
        ]

        # Fetch fresh weather for all checkpoint coordinates
        coords = [(cp.lat, cp.lon) for cp in domain_cps]
        fresh_wx = fetch_hourly_weather_batch(coords)

        # Evaluate sentinel assessment
        now_dt = datetime.now(UTC)
        assessment = evaluate_corridor_sentinel(
            checkpoints=domain_cps,
            current_mile=current_mile,
            current_time=now_dt,
            load_lb=trip.load_lb,
            fresh_weather_by_checkpoint=fresh_wx,
        )

        if assessment.status != "NOMINAL":
            trip.last_alert = assessment.to_dict()
        trip.save()

        return Response(assessment.to_dict(), status=status.HTTP_200_OK)

