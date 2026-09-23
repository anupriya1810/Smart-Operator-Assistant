"""
Weather and Terrain Service for CAT Co-Pilot.

Integrates external APIs:
1. Open-Meteo Weather (Free Tier - Zero API Key Required):
   - Historical archive endpoint for historical tasks: https://archive-api.open-meteo.com/v1/archive
   - Forecast endpoint for live/scheduled future tasks: https://api.open-meteo.com/v1/forecast
   - Features: temperature_c, precipitation_mm, wind_speed_kmh
   - Caching: Persisted to SQLite/PostgreSQL `weather_cache` table to eliminate duplicate API calls.

2. Open-Meteo Elevation API (Free Tier - Zero API Key Required):
   - Elevation endpoint: https://api.open-meteo.com/v1/elevation
   - Slope & Ruggedness: Sampled over a 5-point cross grid (+/- 0.005 deg ~ 500m) around coordinates:
       Center (lat, lon), North, South, East, West.
       Slope % = sqrt((dElevation_NS / 2*dy)^2 + (dElevation_EW / 2*dx)^2) * 100
       Ruggedness = standard deviation of local elevations.
       Difficulty categorized as:
         'Flat' (Slope < 3.0%),
         'Moderate Slope' (3.0% <= Slope <= 8.0%),
         'Steep Incline' (Slope > 8.0%).
   - Fallback: Simplified lookup based on nearest known jobsite coordinates if API is unreachable.
"""

import os
import math
import sqlite3
import requests
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Tuple

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent.parent / "smart_cat.db"))

# In-memory session cache for fast sub-millisecond retrieval
_MEMORY_WEATHER_CACHE: Dict[str, Dict[str, float]] = {}
_MEMORY_TERRAIN_CACHE: Dict[str, Dict[str, Any]] = {}

def get_db_conn():
    """Get SQLite database connection for persistent caching."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_cached_weather(cache_key: str) -> Dict[str, float]:
    """Retrieve cached weather from memory or database."""
    if cache_key in _MEMORY_WEATHER_CACHE:
        return _MEMORY_WEATHER_CACHE[cache_key]

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT temperature_c, precipitation_mm, wind_speed_kmh FROM weather_cache WHERE cache_key = ?;", (cache_key,))
        row = cur.fetchone()
        conn.close()
        if row:
            data = {
                "temperature_c": float(row["temperature_c"]),
                "precipitation_mm": float(row["precipitation_mm"]),
                "wind_speed_kmh": float(row["wind_speed_kmh"])
            }
            _MEMORY_WEATHER_CACHE[cache_key] = data
            return data
    except Exception:
        pass
    return None

def save_cached_weather(cache_key: str, temp_c: float, precip_mm: float, wind_kmh: float, source: str = "open-meteo"):
    """Persist weather to memory and database cache."""
    data = {
        "temperature_c": temp_c,
        "precipitation_mm": precip_mm,
        "wind_speed_kmh": wind_kmh
    }
    _MEMORY_WEATHER_CACHE[cache_key] = data

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
        INSERT OR REPLACE INTO weather_cache (cache_key, temperature_c, precipitation_mm, wind_speed_kmh, source)
        VALUES (?, ?, ?, ?, ?);
        """, (cache_key, temp_c, precip_mm, wind_kmh, source))
        conn.commit()
        conn.close()
    except Exception:
        pass

def warm_weather_cache_for_sites(sites, start_date="2026-05-01", end_date="2026-05-31"):
    """
    Pre-fetch and cache weather for unique sites across the full date range.
    Eliminates redundant HTTP requests and makes dataset generation virtually instantaneous.
    """
    for site in sites:
        lat = site["latitude"]
        lon = site["longitude"]
        url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max"
        try:
            resp = requests.get(url, timeout=6)
            if resp.status_code == 200:
                daily = resp.json().get("daily", {})
                times = daily.get("time", [])
                temps = daily.get("temperature_2m_mean", [])
                precips = daily.get("precipitation_sum", [])
                winds = daily.get("wind_speed_10m_max", [])
                for i, dt_str in enumerate(times):
                    t = float(temps[i]) if i < len(temps) and temps[i] is not None else 18.0
                    p = float(precips[i]) if i < len(precips) and precips[i] is not None else 0.0
                    w = float(winds[i]) if i < len(winds) and winds[i] is not None else 12.0
                    key = f"{round(lat, 3)}_{round(lon, 3)}_{dt_str}"
                    save_cached_weather(key, t, p, w, "open-meteo-archive-batch")
        except Exception as e:
            print(f"[Weather Batch Cache] Site {lat},{lon} fallback: {e}")

def fetch_weather(latitude: float, longitude: float, scheduled_time: Any = None) -> Dict[str, float]:
    """
    Fetch weather features for given coordinates and datetime.
    Uses Open-Meteo archive for past dates and forecast for current/future dates.
    Cached by '{round(lat, 3)}_{round(lon, 3)}_{date_str}'.
    """
    # Parse date
    if scheduled_time is None:
        target_dt = datetime.utcnow()
    elif isinstance(scheduled_time, str):
        try:
            # Handle ISO or YYYY-MM-DD format
            clean_str = scheduled_time.replace("Z", "+00:00").split("+")[0].strip()
            if "T" in clean_str:
                target_dt = datetime.fromisoformat(clean_str)
            elif " " in clean_str:
                target_dt = datetime.strptime(clean_str, "%Y-%m-%d %H:%M:%S")
            else:
                target_dt = datetime.strptime(clean_str, "%Y-%m-%d")
        except Exception:
            target_dt = datetime.utcnow()
    elif isinstance(scheduled_time, datetime):
        target_dt = scheduled_time
    else:
        target_dt = datetime.utcnow()

    date_str = target_dt.strftime("%Y-%m-%d")
    cache_key = f"{round(latitude, 3)}_{round(longitude, 3)}_{date_str}"

    cached = get_cached_weather(cache_key)
    if cached:
        return cached

    now = datetime.utcnow()
    days_diff = (target_dt.date() - now.date()).days

    # Attempt fetching from Open-Meteo
    try:
        if days_diff > 14:
            # Far future: use seasonal forecast approximation or archive endpoint
            url = f"https://archive-api.open-meteo.com/v1/archive?latitude={latitude}&longitude={longitude}&start_date={date_str}&end_date={date_str}&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max"
            resp = requests.get(url, timeout=4)
            if resp.status_code == 200:
                daily = resp.json().get("daily", {})
                temp = float(daily.get("temperature_2m_mean", [18.0])[0] or 18.0)
                precip = float(daily.get("precipitation_sum", [0.0])[0] or 0.0)
                wind = float(daily.get("wind_speed_10m_max", [12.0])[0] or 12.0)
                save_cached_weather(cache_key, temp, precip, wind, "archive")
                return {"temperature_c": temp, "precipitation_mm": precip, "wind_speed_kmh": wind}
        elif days_diff >= 0:
            # Current or upcoming forecast (within 14 days)
            url = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,precipitation,wind_speed_10m"
            resp = requests.get(url, timeout=4)
            if resp.status_code == 200:
                curr = resp.json().get("current", {})
                temp = float(curr.get("temperature_2m", 20.0))
                precip = float(curr.get("precipitation", 0.0))
                wind = float(curr.get("wind_speed_10m", 10.0))
                save_cached_weather(cache_key, temp, precip, wind, "forecast")
                return {"temperature_c": temp, "precipitation_mm": precip, "wind_speed_kmh": wind}
        else:
            # Historical date: use archive API
            url = f"https://archive-api.open-meteo.com/v1/archive?latitude={latitude}&longitude={longitude}&start_date={date_str}&end_date={date_str}&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_max"
            resp = requests.get(url, timeout=4)
            if resp.status_code == 200:
                daily = resp.json().get("daily", {})
                temp = float(daily.get("temperature_2m_mean", [18.0])[0] or 18.0)
                precip = float(daily.get("precipitation_sum", [0.0])[0] or 0.0)
                wind = float(daily.get("wind_speed_10m_max", [12.0])[0] or 12.0)
                save_cached_weather(cache_key, temp, precip, wind, "archive")
                return {"temperature_c": temp, "precipitation_mm": precip, "wind_speed_kmh": wind}
    except Exception as e:
        print(f"[Weather API Warning] Failed to fetch live weather: {e}")

    # Fallback to sensible seasonal defaults
    fallback = {"temperature_c": 21.0, "precipitation_mm": 0.0, "wind_speed_kmh": 14.0}
    save_cached_weather(cache_key, fallback["temperature_c"], fallback["precipitation_mm"], fallback["wind_speed_kmh"], "fallback")
    return fallback

def fetch_terrain(latitude: float, longitude: float) -> Dict[str, Any]:
    """
    Fetch elevation and calculate terrain difficulty features using Open-Meteo Elevation API.
    Samples a 5-point grid around (latitude, longitude):
      Point 0: (lat, lon) Center
      Point 1: (lat + 0.005, lon) North (~550m)
      Point 2: (lat - 0.005, lon) South (~550m)
      Point 3: (lat, lon + 0.005) East (~400-500m)
      Point 4: (lat, lon - 0.005) West (~400-500m)

    Computes:
      - elevation_m: center elevation
      - slope_pct: local gradient percentage
      - ruggedness_score: standard deviation across the 5 grid points
      - terrain_difficulty: 'Flat', 'Moderate Slope', or 'Steep Incline'
    """
    cache_key = f"{round(latitude, 3)}_{round(longitude, 3)}"
    if cache_key in _MEMORY_TERRAIN_CACHE:
        return _MEMORY_TERRAIN_CACHE[cache_key]

    d_deg = 0.005
    lat_grid = [latitude, latitude + d_deg, latitude - d_deg, latitude, latitude]
    lon_grid = [longitude, longitude, longitude, longitude + d_deg, longitude - d_deg]

    lat_str = ",".join(f"{l:.4f}" for l in lat_grid)
    lon_str = ",".join(f"{l:.4f}" for l in lon_grid)

    url = f"https://api.open-meteo.com/v1/elevation?latitude={lat_str}&longitude={lon_str}"

    try:
        resp = requests.get(url, timeout=4)
        if resp.status_code == 200:
            elevations = resp.json().get("elevation", [])
            if len(elevations) == 5:
                h0, hN, hS, hE, hW = elevations
                
                # Distance in meters for 0.005 deg: dy approx 555m, dx approx 555m * cos(lat)
                dy = 2 * (d_deg * 111000.0)
                dx = 2 * (d_deg * 111000.0 * math.cos(math.radians(latitude)))
                if dx == 0:
                    dx = 1.0

                slope_ns = abs(hN - hS) / dy
                slope_ew = abs(hE - hW) / dx
                slope_pct = round(math.sqrt(slope_ns**2 + slope_ew**2) * 100, 2)

                # Ruggedness: standard deviation of elevations
                mean_h = sum(elevations) / 5.0
                variance = sum((x - mean_h) ** 2 for x in elevations) / 5.0
                ruggedness = round(math.sqrt(variance), 2)

                if slope_pct < 3.0:
                    difficulty = "Flat"
                elif slope_pct <= 8.0:
                    difficulty = "Moderate Slope"
                else:
                    difficulty = "Steep Incline"

                result = {
                    "elevation_m": round(float(h0), 1),
                    "slope_pct": slope_pct,
                    "ruggedness_score": ruggedness,
                    "terrain_difficulty": difficulty,
                    "source": "open-meteo-elevation"
                }
                _MEMORY_TERRAIN_CACHE[cache_key] = result
                return result
    except Exception as e:
        print(f"[Terrain API Warning] Failed to query elevation grid: {e}")

    # Fallback heuristic based on coordinates / site lookup
    # e.g. Denver high altitude, Houston low coastal
    if -106.0 <= longitude <= -103.0 and 38.0 <= latitude <= 41.0:
        base_elev = 1609.0
        slope = 9.2
        diff = "Steep Incline"
    elif -96.0 <= longitude <= -94.0:
        base_elev = 15.0
        slope = 1.5
        diff = "Flat"
    elif -113.0 <= longitude <= -110.0:
        base_elev = 330.0
        slope = 4.1
        diff = "Moderate Slope"
    else:
        base_elev = 50.0
        slope = 2.0
        diff = "Flat"

    fallback = {
        "elevation_m": base_elev,
        "slope_pct": slope,
        "ruggedness_score": round(slope * 1.5, 2),
        "terrain_difficulty": diff,
        "source": "fallback-coordinates-heuristic"
    }
    _MEMORY_TERRAIN_CACHE[cache_key] = fallback
    return fallback
