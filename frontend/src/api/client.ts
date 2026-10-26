import type { AnalysisResponse, HeatmapFeatureCollection, TripFormData } from '../types';


const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function analyzeTrip(payload: TripFormData): Promise<AnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) {
        errorDetail = errJson.error;
      } else if (errJson.message) {
        errorDetail = errJson.message;
      } else if (errJson.errors) {
        errorDetail = JSON.stringify(errJson.errors);
      }
    } catch {
      // Use fallback errorDetail
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export async function fetchHeatmap(
  origin?: string,
  destination?: string,
  load_lb?: number
): Promise<HeatmapFeatureCollection> {
  const params = new URLSearchParams();
  if (origin) params.append('origin', origin);
  if (destination) params.append('destination', destination);
  if (load_lb) params.append('load_lb', String(load_lb));

  const url = `${API_BASE_URL}/heatmap?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch heatmap data (status ${response.status})`);
  }

  return response.json();
}

export interface CitySuggestion {
  label: string;
  name: string;
  state?: string;
  lat?: number;
  lon?: number;
  isFreightHub?: boolean;
}

export async function fetchCitySuggestions(query: string): Promise<CitySuggestion[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  try {
    const url = `${API_BASE_URL}/geocode/autocomplete?q=${encodeURIComponent(clean)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch {
    return [];
  }
}

export async function startSentinelTrip(payload: {
  trip_id: string;
  origin: string;
  destination: string;
  load_lb: number;
  departure: string;
  route_geometry: unknown;
  checkpoints: unknown[];
}): Promise<{ status: string; trip_id: string }> {
  const response = await fetch(`${API_BASE_URL}/sentinel/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error('Failed to initialize Sentinel trip');
  }
  return response.json();
}

export async function sendSentinelTelemetry(
  tripId: string,
  currentMile: number
): Promise<import('../types').SentinelAssessment> {
  const response = await fetch(`${API_BASE_URL}/sentinel/telemetry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ trip_id: tripId, current_mile: currentMile }),
  });
  if (!response.ok) {
    throw new Error('Failed to send Sentinel telemetry');
  }
  return response.json();
}
