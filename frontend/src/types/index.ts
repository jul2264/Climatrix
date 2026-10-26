import type { FeatureCollection, LineString, Point } from 'geojson';

export type RiskLevel =
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'SEVERE'
  | 'NO_TRAVEL'
  | 'UNKNOWN';

export type RiskDriver = 'wind' | 'rain' | 'snow' | 'load_rule' | null;

export interface Checkpoint {
  mile: number;
  lat: number;
  lon: number;
  eta: string;
  wind_mph: number | null;
  rain_in_hr: number | null;
  snow_in_hr: number | null;
  level: RiskLevel;
  driver: RiskDriver;
}

export interface RouteSummary {
  no_travel_miles: number;
  severe_miles: number;
  high_miles: number;
  avg_risk: number | null;
  distance_mi: number;
  duration_min: number;
  max_level: RiskLevel;
}

export interface RouteAnalysis {
  id: string;
  geometry: LineString;
  distance_mi: number;
  duration_min: number;
  summary: RouteSummary;
  checkpoints: Checkpoint[];
}

export interface DepartureCandidate {
  offset_hours: number;
  departure_iso: string;
  no_travel_miles: number;
  severe_miles: number;
  high_miles: number;
  avg_risk: number | null;
  is_drivable: boolean;
  recommended_route_id: string | null;
  max_level: RiskLevel;
}

export interface DepartureOptimization {
  requested_departure: string;
  recommended_departure: string;
  recommended_offset_hours: number;
  severe_miles_eliminated: number;
  avg_risk_reduction: number;
  is_drivable: boolean;
  explanation: string;
  candidates: DepartureCandidate[];
}

export interface AnalysisResponse {
  routes: RouteAnalysis[];
  recommended_route_id: string | null;
  explanation: string;
  departure_optimization?: DepartureOptimization | null;
}

export interface HeatmapFeatureProperties {
  risk_by_hour: number[];
  current_risk: number;
}

export type HeatmapFeatureCollection = FeatureCollection<
  Point,
  HeatmapFeatureProperties
>;

export interface TripFormData {
  origin: string;
  destination: string;
  departure: string;
  load_lb: number;
  interval_miles?: 10 | 25 | 50 | null;
}

export type SentinelStatus = 'NOMINAL' | 'ADVISORY' | 'EMERGENCY';

export interface EscalatedCheckpoint {
  mile: number;
  old_level: string;
  new_level: string;
  driver: string | null;
  miles_away: number;
  minutes_away: number;
}

export interface SentinelAssessment {
  status: SentinelStatus;
  current_mile: number;
  remaining_miles: number;
  remaining_checkpoints: number;
  highest_upcoming_risk: string;
  hazard_mile: number | null;
  hazard_driver: string | null;
  time_to_hazard_min: number | null;
  escalated_checkpoints: EscalatedCheckpoint[];
  explanation: string;
  bypass_route?: Record<string, unknown> | null;
}
