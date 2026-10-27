import type { Checkpoint, RiskLevel, RouteAnalysis } from '../types';

export type TruckJourneyStatus = 'depot' | 'en_route' | 'arrived' | 'horizon_limit';

export interface TruckPositionResult {
  lat: number;
  lon: number;
  mile: number;
  timestamp: string;      // Formatted arrival time (e.g., "Thu 8:00 AM")
  status: TruckJourneyStatus;
  statusLabel: string;    // Human-readable badge text (e.g., "Mile 420 · En Route")
  currentRisk: RiskLevel;
  nearestCheckpoint: Checkpoint;
}

/**
 * Calculates the exact interpolated truck position along a route for a given forecast hour.
 * Strictly enforces:
 * 1. Hour 0 clamp: Truck is anchored at Origin (Mile 0).
 * 2. Short-haul completion clamp: If elapsed time exceeds route duration, truck stays parked at Destination.
 * 3. Long-haul 48h horizon clamp: If route exceeds 48h, at Hour 48 the truck stops at the 48-hour highway mark
 *    and does NOT leap to Destination.
 */
export function calculateTruckPosition(
  route: RouteAnalysis | null | undefined,
  departureIso: string | undefined,
  forecastHour: number
): TruckPositionResult | null {
  if (!route || !route.checkpoints || route.checkpoints.length === 0) {
    return null;
  }

  const checkpoints = route.checkpoints;
  const firstCp = checkpoints[0];
  const lastCp = checkpoints[checkpoints.length - 1];

  // 1. Clamp forecast hour to [0, 48] slider limits
  const clampedHour = Math.max(0, Math.min(forecastHour, 48));

  // Determine base departure timestamp in milliseconds
  let depMs = 0;
  if (departureIso) {
    const parsed = new Date(departureIso).getTime();
    if (!isNaN(parsed)) depMs = parsed;
  }
  if (!depMs && firstCp.eta) {
    const parsed = new Date(firstCp.eta).getTime();
    if (!isNaN(parsed)) depMs = parsed;
  }
  if (!depMs) {
    depMs = Date.now();
  }

  const targetMs = depMs + clampedHour * 3600 * 1000;
  const targetDate = new Date(targetMs);
  const formattedTime = targetDate.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const startMs = new Date(firstCp.eta).getTime();
  const endMs = new Date(lastCp.eta).getTime();
  const validEtas = !isNaN(startMs) && !isNaN(endMs) && endMs >= startMs;

  // 2. Case: At Origin (Hour 0 or before start)
  if (clampedHour === 0 || (validEtas && targetMs <= startMs)) {
    return {
      lat: firstCp.lat,
      lon: firstCp.lon,
      mile: 0,
      timestamp: formattedTime,
      status: 'depot',
      statusLabel: 'Mile 0 · Ready to Depart',
      currentRisk: firstCp.level,
      nearestCheckpoint: firstCp,
    };
  }

  // 3. Case: Destination reached (Short-haul trip completed within slider horizon)
  if (validEtas && targetMs >= endMs) {
    return {
      lat: lastCp.lat,
      lon: lastCp.lon,
      mile: lastCp.mile,
      timestamp: formattedTime,
      status: 'arrived',
      statusLabel: `Mile ${Math.round(lastCp.mile)} · Arrived at Destination`,
      currentRisk: lastCp.level,
      nearestCheckpoint: lastCp,
    };
  }

  // 4. Case: Long-haul route beyond 48 hours clamped at Hour 48
  const isHorizonLimit = clampedHour === 48 && validEtas && targetMs < endMs;

  // 5. Locate active segment [cp_i, cp_i+1]
  let segIndex = 0;
  if (validEtas) {
    for (let i = 0; i < checkpoints.length - 1; i++) {
      const curEta = new Date(checkpoints[i].eta).getTime();
      const nextEta = new Date(checkpoints[i + 1].eta).getTime();
      if (targetMs >= curEta && targetMs <= nextEta) {
        segIndex = i;
        break;
      }
      if (targetMs > nextEta) {
        segIndex = i;
      }
    }
  } else {
    // Fallback: fraction of total route duration
    const totalMinutes = route.duration_min || 60;
    const progressFrac = Math.min(1, Math.max(0, (clampedHour * 60) / totalMinutes));
    const targetMile = progressFrac * (route.distance_mi || 100);
    for (let i = 0; i < checkpoints.length - 1; i++) {
      if (targetMile >= checkpoints[i].mile && targetMile <= checkpoints[i + 1].mile) {
        segIndex = i;
        break;
      }
    }
  }

// Earth mean radius in statute miles
const EARTH_RADIUS_MILES = 3958.7613;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MILES * c;
}

/**
 * Interpolates an exact (lon, lat) point along high-resolution road coordinates
 * matching targetMile, scaled to the reported route distance.
 */
function interpolateAlongPolyline(
  coordinates: number[][],
  targetMile: number,
  totalDistanceMiles: number
): { lat: number; lon: number } | null {
  if (!coordinates || coordinates.length === 0) return null;
  if (coordinates.length === 1) return { lon: coordinates[0][0], lat: coordinates[0][1] };

  const cumDist: number[] = [0];
  let geomTotal = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [pLon1, pLat1] = coordinates[i - 1];
    const [pLon2, pLat2] = coordinates[i];
    geomTotal += haversineMiles(pLat1, pLon1, pLat2, pLon2);
    cumDist.push(geomTotal);
  }

  if (geomTotal <= 1e-9) {
    return { lon: coordinates[0][0], lat: coordinates[0][1] };
  }

  const scaleRatio = totalDistanceMiles > 1e-9 ? geomTotal / totalDistanceMiles : 1.0;
  const effectiveMile = targetMile * scaleRatio;

  if (effectiveMile <= 0) {
    return { lon: coordinates[0][0], lat: coordinates[0][1] };
  }
  if (effectiveMile >= geomTotal) {
    const last = coordinates[coordinates.length - 1];
    return { lon: last[0], lat: last[1] };
  }

  for (let i = 1; i < cumDist.length; i++) {
    if (cumDist[i] >= effectiveMile) {
      const segLength = cumDist[i] - cumDist[i - 1];
      const frac = segLength > 1e-9 ? (effectiveMile - cumDist[i - 1]) / segLength : 0;
      const [lon1, lat1] = coordinates[i - 1];
      const [lon2, lat2] = coordinates[i];
      const interpLon = lon1 + frac * (lon2 - lon1);
      const interpLat = lat1 + frac * (lat2 - lat1);
      return { lon: interpLon, lat: interpLat };
    }
  }

  const last = coordinates[coordinates.length - 1];
  return { lon: last[0], lat: last[1] };
}

  const cpA = checkpoints[segIndex];
  const cpB = checkpoints[Math.min(segIndex + 1, checkpoints.length - 1)];

  let alpha = 0;
  if (cpA !== cpB) {
    const tA = new Date(cpA.eta).getTime();
    const tB = new Date(cpB.eta).getTime();
    if (!isNaN(tA) && !isNaN(tB) && tB > tA) {
      alpha = Math.max(0, Math.min(1, (targetMs - tA) / (tB - tA)));
    } else if (cpB.mile > cpA.mile) {
      alpha = 0.5;
    }
  }

  const interpMile = Math.round((cpA.mile + alpha * (cpB.mile - cpA.mile)) * 10) / 10;
  const nearest = alpha < 0.5 ? cpA : cpB;

  // Pin vehicle directly to high-resolution road polyline if coordinates exist
  let finalLat: number;
  let finalLon: number;
  const polylineCoords = route.geometry?.coordinates;
  const totalDist = route.distance_mi || lastCp.mile;

  if (polylineCoords && polylineCoords.length > 1) {
    const onRoad = interpolateAlongPolyline(polylineCoords, interpMile, totalDist);
    if (onRoad) {
      finalLat = onRoad.lat;
      finalLon = onRoad.lon;
    } else {
      finalLat = cpA.lat + alpha * (cpB.lat - cpA.lat);
      finalLon = cpA.lon + alpha * (cpB.lon - cpA.lon);
    }
  } else {
    finalLat = cpA.lat + alpha * (cpB.lat - cpA.lat);
    finalLon = cpA.lon + alpha * (cpB.lon - cpA.lon);
  }

  const status: TruckJourneyStatus = isHorizonLimit ? 'horizon_limit' : 'en_route';
  const totalHours = Math.round((route.duration_min || 0) / 60);
  const statusLabel = isHorizonLimit
    ? `Mile ${interpMile} · Hour 48 of ${totalHours}h (+48h Limit)`
    : `Mile ${interpMile} · En Route`;

  return {
    lat: Number(finalLat.toFixed(5)),
    lon: Number(finalLon.toFixed(5)),
    mile: interpMile,
    timestamp: formattedTime,
    status,
    statusLabel,
    currentRisk: nearest.level,
    nearestCheckpoint: nearest,
  };
}
