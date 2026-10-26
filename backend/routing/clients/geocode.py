"""
Geocoding client supporting multi-tiered resolution:
1. Django cache (fast repeat queries)
2. Demo coordinates dictionary (instant 0ms offline fallback)
3. OpenRouteService Pelias Geocoding (/geocode/search) via ROUTING_API_KEY
4. Nominatim (OpenStreetMap) public fallback
"""

import logging
import re
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
ORS_GEOCODE_SEARCH_URL = "https://api.openrouteservice.org/geocode/search"
ORS_GEOCODE_AUTOCOMPLETE_URL = "https://api.openrouteservice.org/geocode/autocomplete"
GEOCODE_CACHE_TIMEOUT = 86400  # 24 hours
DEFAULT_TIMEOUT_SECONDS = 8.0

# Known common US locations for instant fallback / offline demo
DEMO_COORDINATES: dict[str, tuple[float, float]] = {
    "chicago, il": (41.8781, -87.6298),
    "chicago": (41.8781, -87.6298),
    "indianapolis, in": (39.7684, -86.1581),
    "indianapolis": (39.7684, -86.1581),
    "columbus, oh": (39.9612, -82.9988),
    "columbus": (39.9612, -82.9988),
    "st. louis, mo": (38.6270, -90.1994),
    "st. louis": (38.6270, -90.1994),
    "denver, co": (39.7392, -104.9903),
    "denver": (39.7392, -104.9903),
    "kansas city, mo": (39.0997, -94.5786),
    "dallas, tx": (32.7767, -96.7970),
    "atlanta, ga": (33.7490, -84.3880),
    "new york, ny": (40.7128, -74.0060),
    "new york": (40.7128, -74.0060),
    "san francisco, ca": (37.7749, -122.4194),
    "san francisco": (37.7749, -122.4194),
    "los angeles, ca": (34.0522, -118.2437),
    "los angeles": (34.0522, -118.2437),
    "seattle, wa": (47.6062, -122.3321),
    "seattle": (47.6062, -122.3321),
    "houston, tx": (29.7604, -95.3698),
    "houston": (29.7604, -95.3698),
}


def geocode_address(query: str) -> tuple[float, float]:
    """
    Geocode an address string to (latitude, longitude) using a resilient multi-tier strategy:
    Tier 1: Django Cache
    Tier 2: Demo Coordinates (0ms offline match)
    Tier 3: OpenRouteService Pelias Geocode (/geocode/search) using ROUTING_API_KEY
    Tier 4: Nominatim (OpenStreetMap)
    Tier 5: Partial match in Demo Coordinates
    """
    clean_query = query.strip()
    if not clean_query:
        raise ValueError("Address query cannot be empty")

    safe_key = re.sub(r"[^a-zA-Z0-9_]", "_", clean_query.lower())
    cache_key = f"geocode_{safe_key}"

    # Tier 1: Django Cache
    cached = cache.get(cache_key)
    if isinstance(cached, tuple) and len(cached) == 2:
        return (float(cached[0]), float(cached[1]))

    # Tier 2: Instant demo coordinates exact match (0ms, offline)
    normalized = clean_query.lower()
    if normalized in DEMO_COORDINATES:
        coords = DEMO_COORDINATES[normalized]
        cache.set(cache_key, coords, timeout=GEOCODE_CACHE_TIMEOUT)
        return coords

    # Tier 3: OpenRouteService Pelias Geocoding (/geocode/search)
    api_key = getattr(settings, "ROUTING_API_KEY", "")
    if api_key:
        headers = {
            "Authorization": api_key,
            "Accept": "application/json",
        }
        params: dict[str, str | int] = {
            "text": clean_query,
            "boundary.country": "USA",
            "size": 1,
        }
        try:
            resp = requests.get(
                ORS_GEOCODE_SEARCH_URL,
                params=params,
                headers=headers,
                timeout=DEFAULT_TIMEOUT_SECONDS,
            )
            if resp.status_code == 200:
                data = resp.json()
                features = data.get("features", [])
                if features:
                    coords_list = features[0].get("geometry", {}).get("coordinates", [])
                    if len(coords_list) >= 2:
                        lon = float(coords_list[0])
                        lat = float(coords_list[1])
                        cache.set(cache_key, (lat, lon), timeout=GEOCODE_CACHE_TIMEOUT)
                        return (lat, lon)
        except Exception as e:
            logger.warning("OpenRouteService geocode lookup failed for '%s': %s", clean_query, e)

    # Tier 4: Nominatim (OpenStreetMap) public fallback
    nominatim_headers = {
        "User-Agent": "TruckRouteSafetyApp/1.0 (climatrix-truck-routing-eval)",
        "Accept": "application/json",
    }
    nominatim_params: dict[str, str | int] = {
        "q": clean_query,
        "format": "json",
        "limit": 1,
    }

    try:
        response = requests.get(
            NOMINATIM_URL,
            params=nominatim_params,
            headers=nominatim_headers,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                lat = float(data[0]["lat"])
                lon = float(data[0]["lon"])
                cache.set(cache_key, (lat, lon), timeout=GEOCODE_CACHE_TIMEOUT)
                return (lat, lon)
    except Exception as e:
        logger.warning("Nominatim geocode lookup failed for '%s': %s", clean_query, e)

    # Tier 5: Partial match in demo coords
    for k, v in DEMO_COORDINATES.items():
        if k in normalized or normalized in k:
            cache.set(cache_key, v, timeout=GEOCODE_CACHE_TIMEOUT)
            return v

    raise ValueError(f"Unable to geocode address: '{query}'")


def autocomplete_cities(query: str, limit: int = 6) -> list[dict[str, Any]]:
    """
    Suggests US cities based on prefix query using OpenRouteService Pelias autocomplete.
    Cached for fast response, falls back to demo coordinates if ORS is unreachable.
    """
    clean_query = query.strip()
    if len(clean_query) < 2:
        return []

    safe_key = re.sub(r"[^a-zA-Z0-9_]", "_", clean_query.lower())
    cache_key = f"autocomplete_{safe_key}_{limit}"
    cached = cache.get(cache_key)
    if isinstance(cached, list):
        return cached

    results: list[dict[str, Any]] = []

    api_key = getattr(settings, "ROUTING_API_KEY", "")
    if api_key:
        headers = {"Authorization": api_key, "Accept": "application/json"}
        params: dict[str, str | int] = {
            "text": clean_query,
            "boundary.country": "USA",
            "layers": "locality,county",
            "size": limit,
        }
        try:
            resp = requests.get(
                ORS_GEOCODE_AUTOCOMPLETE_URL,
                params=params,
                headers=headers,
                timeout=DEFAULT_TIMEOUT_SECONDS,
            )
            if resp.status_code == 200:
                data = resp.json()
                seen_labels: set[str] = set()
                for feat in data.get("features", []):
                    props = feat.get("properties", {})
                    name = props.get("name", "")
                    state = props.get("region_a", "")
                    if not name:
                        continue
                    label = f"{name}, {state}" if state else name
                    if label in seen_labels:
                        continue
                    seen_labels.add(label)

                    coords = feat.get("geometry", {}).get("coordinates", [])
                    lon = float(coords[0]) if len(coords) >= 2 else None
                    lat = float(coords[1]) if len(coords) >= 2 else None

                    results.append(
                        {
                            "label": label,
                            "name": name,
                            "state": state,
                            "lat": lat,
                            "lon": lon,
                        }
                    )
        except Exception as e:
            logger.warning("OpenRouteService autocomplete failed for '%s': %s", clean_query, e)

    # If ORS returned fewer results or failed, supplement from known demo coordinates
    q_norm = clean_query.lower()
    for name, (lat, lon) in DEMO_COORDINATES.items():
        if q_norm in name and len(results) < limit:
            formatted_label = ", ".join(
                part.strip().title() if len(part.strip()) > 2 else part.strip().upper()
                for part in name.split(",")
            )
            if not any(r["label"].lower() == formatted_label.lower() for r in results):
                state_code = (
                    formatted_label.split(",")[1].strip() if "," in formatted_label else ""
                )
                results.append(
                    {
                        "label": formatted_label,
                        "name": formatted_label.split(",")[0].strip(),
                        "state": state_code,
                        "lat": lat,
                        "lon": lon,
                    }
                )

    cache.set(cache_key, results, timeout=GEOCODE_CACHE_TIMEOUT)
    return results
