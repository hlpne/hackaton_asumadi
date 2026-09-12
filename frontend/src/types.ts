// Public HTTP contract v1. Backend Pydantic schemas and docs/contracts are authoritative.
export type Horizon = "day" | "month" | "year";
export interface Route { id: string; name: string; color: string }
export interface RouteStop { id: string; name: string; lat: number; lon: number; sequence: number; direction_id: 0 | 1 }
export interface ForecastRequest {
  route_id: string;
  stop_id?: string;
  direction_id?: 0 | 1;
  horizon: Horizon;
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
  resolution: "PT1H" | "P1D" | "P1M";
  forecast_origin: string;
  value_unit: string;
  aggregation: "demo_mean" | "sum" | "mean" | "max" | "last";
  is_mock: boolean;
  model_version: string;
  interval_level: number | null;
  points: ForecastPoint[];
}
