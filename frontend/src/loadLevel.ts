import type { MapForecastResponse } from "./types";

export type LoadLevel = "low" | "medium" | "high";

export const loadColors: Record<LoadLevel, string> = {
  low: "#27825d",
  medium: "#d28a1e",
  high: "#d9444b",
};

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

export function loadColor(value: number, snapshot: MapForecastResponse): string {
  return loadColors[loadLevel(value, snapshot)];
}
