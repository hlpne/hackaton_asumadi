import type { ForecastResponse, MapForecastResponse } from "./types";

export type LoadLevel = "low" | "medium" | "high";

export const loadColors: Record<LoadLevel, string> = {
  low: "var(--status-normal)",
  medium: "var(--status-attention)",
  high: "var(--status-critical)",
};

function resolvedToken(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

export function neutralMapColor(): string {
  return resolvedToken("--status-neutral", "rgb(127, 140, 150)");
}

export const loadLabels: Record<LoadLevel, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
};

export function loadLevel(value: number, snapshot: MapForecastResponse): LoadLevel {
  if (snapshot.value_unit === "demo_index") {
    return value < 35 ? "low" : value < 55 ? "medium" : "high";
  }
  const values = snapshot.points.map((point) => point.predicted_load);
  if (!values.length) return "medium";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return "medium";
  const relative = (value - min) / (max - min);
  return relative < 1 / 3 ? "low" : relative < 2 / 3 ? "medium" : "high";
}

/** A relative level for route-wide validation counts in one forecast period. */
export function validationLevel(value: number, values: number[]): LoadLevel {
  if (!values.length) return "medium";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return "medium";
  const relative = (value - min) / (max - min);
  return relative < 1 / 3 ? "low" : relative < 2 / 3 ? "medium" : "high";
}

/** Compare a route with its own forecast period in every map view. */
export function forecastValidationLevel(forecast: ForecastResponse, timestamp: string): LoadLevel | null {
  const selected = forecast.points.find((point) => point.timestamp === timestamp);
  if (!selected) return null;
  return validationLevel(selected.predicted_load, forecast.points.map((point) => point.predicted_load));
}

export function validationColor(level: LoadLevel): string {
  return resolvedToken(`--status-${level === "low" ? "normal" : level === "medium" ? "attention" : "critical"}`,
    level === "low" ? "#5ec557" : level === "medium" ? "#f59a3d" : "#ff5a5f");
}

export function loadColor(value: number, snapshot: MapForecastResponse): string {
  const level = loadLevel(value, snapshot);
  return resolvedToken(`--status-${level === "low" ? "normal" : level === "medium" ? "attention" : "critical"}`,
    level === "low" ? "rgb(94, 197, 87)" : level === "medium" ? "rgb(243, 148, 68)" : "rgb(255, 90, 95)");
}
