"""
Weather client integrating with Open-Meteo API.
Batches requests, requests wind_speed_unit=mph and precipitation_unit=inch,
caches forecasts by rounded (0.1 degree) coordinates, and matches checkpoint ETAs to nearest forecast hours.
"""

import concurrent.futures
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import Any

import requests
from django.core.cache import cache
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_CACHE_TIMEOUT = 3600  # 1 hour
DEFAULT_TIMEOUT_SECONDS = 8.0
MAX_RETRIES = 2
MAX_WORKERS = 8
CHUNK_SIZE = 100

# Reusable HTTP session with Keep-Alive connection pooling across worker threads
_session = requests.Session()
_retries = Retry(total=2, backoff_factor=0.2, status_forcelist=[500, 502, 503, 504])
_adapter = HTTPAdapter(pool_connections=12, pool_maxsize=24, max_retries=_retries)
_session.mount("https://", _adapter)
_session.mount("http://", _adapter)


def round_coord(val: float) -> float:
    """Round coordinate to 0.1 degree for caching efficiency."""
    return round(val, 1)


def fetch_hourly_weather_batch(
    coords: Sequence[tuple[float, float]],
) -> list[dict[str, Any]]:
    """
    Fetch hourly forecasts for multiple (lat, lon) coordinates in batched, concurrent Open-Meteo calls.
    Optimized with:
    1. Pre-query spatial cell snapping & deduplication (0.1 degree resolution)
    2. Concurrent chunk fetching via ThreadPoolExecutor
    3. Multi-point indexing to avoid redundant API payload
    """
    if not coords:
        return []

    results: list[dict[str, Any]] = [{} for _ in range(len(coords))]

    # 1. Spatial cell snapping & index grouping
    cell_to_indices: dict[tuple[float, float], list[int]] = defaultdict(list)
    for idx, (lat, lon) in enumerate(coords):
        cell_key = (round_coord(lat), round_coord(lon))
        cell_to_indices[cell_key].append(idx)

    # 2. Check cache for unique spatial cells
    missing_cells: list[tuple[float, float]] = []
    for cell_key, indices in cell_to_indices.items():
        cache_key = f"weather_{cell_key[0]}_{cell_key[1]}"
        cached = cache.get(cache_key)
        if cached:
            for idx in indices:
                results[idx] = cached
        else:
            missing_cells.append(cell_key)

    if not missing_cells:
        return results

    # 3. Helper to fetch a single chunk with retry logic
    def _fetch_chunk(
        chunk_cells: list[tuple[float, float]],
    ) -> list[tuple[tuple[float, float], dict[str, Any]]]:
        lats = [c[0] for c in chunk_cells]
        lons = [c[1] for c in chunk_cells]

        params: dict[str, Any] = {
            "latitude": lats if len(lats) > 1 else lats[0],
            "longitude": lons if len(lons) > 1 else lons[0],
            "hourly": "wind_speed_10m,wind_direction_10m,rain,snowfall",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "forecast_days": 3,
        }

        chunk_results: list[tuple[tuple[float, float], dict[str, Any]]] = []
        for _ in range(MAX_RETRIES + 1):
            try:
                resp = _session.get(
                    OPEN_METEO_FORECAST_URL,
                    params=params,
                    timeout=DEFAULT_TIMEOUT_SECONDS,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list):
                        for loc_idx, loc_data in enumerate(data):
                            if loc_idx < len(chunk_cells):
                                hourly = loc_data.get("hourly", {})
                                res = {
                                    "times": hourly.get("time", []),
                                    "wind_speed_10m": hourly.get("wind_speed_10m", []),
                                    "wind_direction_10m": hourly.get("wind_direction_10m", []),
                                    "rain": hourly.get("rain", []),
                                    "snowfall": hourly.get("snowfall", []),
                                }
                                chunk_results.append((chunk_cells[loc_idx], res))
                    else:
                        hourly = data.get("hourly", {})
                        res = {
                            "times": hourly.get("time", []),
                            "wind_speed_10m": hourly.get("wind_speed_10m", []),
                            "wind_direction_10m": hourly.get("wind_direction_10m", []),
                            "rain": hourly.get("rain", []),
                            "snowfall": hourly.get("snowfall", []),
                        }
                        for cell in chunk_cells:
                            chunk_results.append((cell, res))
                    return chunk_results
            except Exception:
                pass
        return chunk_results

    # 4. Chunk missing unique cells and execute concurrently
    chunks = [
        missing_cells[i : i + CHUNK_SIZE]
        for i in range(0, len(missing_cells), CHUNK_SIZE)
    ]

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_chunk = {
            executor.submit(_fetch_chunk, chunk): chunk for chunk in chunks
        }
        for future in concurrent.futures.as_completed(future_to_chunk):
            try:
                chunk_data = future.result()
                for cell_key, weather_res in chunk_data:
                    # Cache under rounded key
                    cache.set(
                        f"weather_{cell_key[0]}_{cell_key[1]}",
                        weather_res,
                        timeout=WEATHER_CACHE_TIMEOUT,
                    )
                    # Assign to all original checkpoint indices sharing this spatial cell
                    for idx in cell_to_indices.get(cell_key, []):
                        results[idx] = weather_res
            except Exception:
                pass

    return results


def match_weather_at_eta(
    hourly_weather: dict[str, Any],
    eta_iso: str,
) -> tuple[float | None, float | None, float | None]:
    """
    Given an hourly forecast dictionary and an ISO-8601 ETA string,
    find the forecast hour nearest the ETA.
    Returns (wind_mph, rain_in_hr, snow_in_hr).
    """
    times = hourly_weather.get("times", [])
    if not times:
        return None, None, None

    try:
        # Parse ETA timestamp
        eta_dt = datetime.fromisoformat(eta_iso.replace("Z", "+00:00"))
    except Exception:
        return None, None, None

    # Open-Meteo times are formatted as "YYYY-MM-DDTHH:00"
    best_idx = 0
    min_diff_seconds = float("inf")

    for idx, t_str in enumerate(times):
        try:
            t_dt = datetime.fromisoformat(t_str)
            # Compare naive timestamps or localize
            diff = abs((t_dt.replace(tzinfo=eta_dt.tzinfo) - eta_dt).total_seconds())
            if diff < min_diff_seconds:
                min_diff_seconds = diff
                best_idx = idx
        except Exception:
            continue

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
