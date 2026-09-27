// Public HTTP contract v1. Backend Pydantic schemas and docs/contracts are authoritative.
export type Horizon = "day" | "month" | "year";
export interface Route { id: string; name: string; color: string }
export interface RouteStop { id: string; name: string; lat: number; lon: number; sequence: number; direction_id: 0 | 1 }
export interface RouteGeometry {
  route_id: string;
  direction_id: 0 | 1;
  source: string;
  license: string;
  attribution_url: string;
  osm_relation_id: number;
  lines: Array<Array<[number, number]>>; // OSM/GeoJSON and Yandex use [lon, lat].
}
export interface ForecastRequest {
  route_id: string;
  stop_id?: string;
  direction_id?: 0 | 1;
  horizon: Horizon;
  resolution?: "schedule" | "PT1M" | "PT1H" | "P1D" | "P1M";
  from: string;
  to: string;
  forecast_origin?: string;
}
export interface ForecastPoint {
  timestamp: string;
  predicted_load: number;
  lower_bound: number | null;
  upper_bound: number | null;
}
export interface ForecastResponse {
  contract_version: "1.0";
  series_key: { route_id: string; stop_id: string | null; direction_id: 0 | 1 | null };
  horizon: Horizon;
  resolution: "schedule" | "PT1M" | "PT1H" | "P1D" | "P1M";
  forecast_origin: string;
  value_unit: string;
  aggregation: "demo_mean" | "sum" | "mean" | "max" | "last";
  is_mock: boolean;
  model_version: string;
  interval_level: number | null;
  points: ForecastPoint[];
}

export interface SnapshotRequest {
  horizon?: Horizon;
  timestamp?: string;
  forecast_origin?: string;
  route_id?: string;
  direction_id?: 0 | 1;
}

export interface MapForecastPoint {
  route_id: string;
  route_name: string;
  route_color: string;
  stop_id: string;
  stop_name: string;
  direction_id: 0 | 1;
  sequence: number;
  lat: number;
  lon: number;
  predicted_load: number;
  lower_bound: number | null;
  upper_bound: number | null;
}

export interface MapForecastResponse {
  contract_version: "1.0";
  horizon: Horizon;
  timestamp: string;
  forecast_origin: string;
  value_unit: string;
  aggregation: "demo_mean" | "sum" | "mean" | "max" | "last";
  is_mock: boolean;
  model_version: string;
  interval_level: number | null;
  points: MapForecastPoint[];
}

export interface TopOverloadResponse {
  contract_version: "1.0";
  horizon: Horizon;
  timestamp: string;
  forecast_origin: string;
  value_unit: string;
  aggregation: "demo_mean" | "sum" | "mean" | "max" | "last";
  is_mock: boolean;
  model_version: string;
  interval_level: number | null;
  ranking_basis: "predicted_load_desc";
  items: Array<MapForecastPoint & { rank: number }>;
}

export interface ModelMetricSet {
  name: string;
  wape: number | null;
  mae: number | null;
  bias: number | null;
}

export interface ModelMetricSlice { label: string; wape: number }

export interface ModelMetadata {
  schema_version: "1.0";
  status: "validated" | "validation_pending";
  model_version: string;
  built_at: string | null;
  target: string;
  value_unit: string;
  coverage: {
    history_from: string;
    history_to: string;
    forecast_from: string;
    forecast_to: string;
    routes: number;
    horizon_days: number;
  };
  validation: {
    method: string;
    leakage_control: string;
    baseline: ModelMetricSet;
    final: ModelMetricSet;
    folds: ModelMetricSlice[];
    horizon_buckets: ModelMetricSlice[];
  };
  feature_families: string[];
  limitations: string[];
  sources: Array<{ name: string; description: string; url: string | null }>;
}

export interface DispatcherProfile {
  login: string;
  full_name: string;
}

export interface AuthSession {
  access_token: string;
  expires_at: string;
  user: DispatcherProfile;
}
