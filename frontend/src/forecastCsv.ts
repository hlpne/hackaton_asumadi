import type { ForecastResponse, MapForecastPoint, MapForecastResponse } from "./types";
import { SCENARIO_CSV_HEADER, scenarioCsvRows, type ScenarioAdjustments } from "./scenario.ts";

const columns = [
  "route_id", "route_name", "direction_id", "stop_id", "stop_name", "sequence",
  "timestamp", "predicted_load", "lower_bound", "upper_bound",
  "value_unit", "aggregation", "model_version", "is_mock",
];

function cell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = typeof value === "string" && /^[\s]*[=+\-@]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function row(point: MapForecastPoint, snapshot: MapForecastResponse): Array<string | number | boolean | null> {
  return [
    point.route_id, point.route_name, point.direction_id, point.stop_id, point.stop_name, point.sequence,
    snapshot.timestamp, point.predicted_load, point.lower_bound, point.upper_bound,
    snapshot.value_unit, snapshot.aggregation, snapshot.model_version, snapshot.is_mock,
  ];
}

function toCsv(points: MapForecastPoint[], snapshot: MapForecastResponse): string {
  return `\uFEFF${[columns.join(";"), ...points.map((point) => row(point, snapshot).map(cell).join(";"))].join("\r\n")}\r\n`;
}

export function forecastSnapshotCsv(snapshot: MapForecastResponse, routeId: string, directionId: 0 | 1): string {
  const points = snapshot.points.filter((point) => point.route_id === routeId && point.direction_id === directionId)
    .sort((a, b) => a.sequence - b.sequence);
  return toCsv(points, snapshot);
}

/** Every stop of every route in the snapshot, grouped by route and direction. */
export function networkSnapshotCsv(snapshot: MapForecastResponse): string {
  const points = [...snapshot.points].sort((a, b) => a.route_id.localeCompare(b.route_id, "ru", { numeric: true }) ||
    a.direction_id - b.direction_id || a.sequence - b.sequence);
  return toCsv(points, snapshot);
}

function download(csv: string, fileName: string): void {
  const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadForecastSnapshotCsv(snapshot: MapForecastResponse, routeId: string, directionId: 0 | 1): void {
  download(forecastSnapshotCsv(snapshot, routeId, directionId),
    `tram-${routeId.replace(/[^a-z0-9-]/gi, "")}-${snapshot.timestamp.slice(0, 10)}-direction-${directionId + 1}.csv`);
}

export function downloadRouteValidationsCsv(forecast: ForecastResponse): void {
  const header = "route_id;timestamp;validations;model_version";
  const rows = forecast.points.map((point) => [forecast.series_key.route_id, point.timestamp,
    point.predicted_load, forecast.model_version].map(cell).join(";"));
  download(`\uFEFF${[header, ...rows].join("\r\n")}\r\n`,
    `tram-${forecast.series_key.route_id.replace(/[^a-z0-9-]/gi, "")}-${forecast.points[0]?.timestamp.slice(0, 10) ?? "forecast"}-validations.csv`);
}

/** Базовый прогноз модели рядом со сценарным расчётом; базовый CSV (`downloadRouteValidationsCsv`) не меняется. */
export function routeScenarioCsv(forecast: ForecastResponse, adjustments: ScenarioAdjustments): string {
  const rows = scenarioCsvRows(forecast, adjustments).map((values) => values.map(cell).join(";"));
  return `\uFEFF${[SCENARIO_CSV_HEADER.join(";"), ...rows].join("\r\n")}\r\n`;
}

export function downloadRouteScenarioCsv(forecast: ForecastResponse, adjustments: ScenarioAdjustments): void {
  download(routeScenarioCsv(forecast, adjustments),
    `tram-${forecast.series_key.route_id.replace(/[^a-z0-9-]/gi, "")}-${forecast.points[0]?.timestamp.slice(0, 10) ?? "forecast"}-scenario.csv`);
}

export function downloadNetworkSnapshotCsv(snapshot: MapForecastResponse): void {
  download(networkSnapshotCsv(snapshot), `tram-network-${snapshot.timestamp.slice(0, 10)}.csv`);
}

/** Route-hour or route-day values from the supplied model, without synthetic stop rows. */
export function downloadNetworkValidationsCsv(forecasts: ForecastResponse[]): void {
  const header = "route_id;timestamp;validations;model_version";
  const rows = forecasts.flatMap((forecast) => forecast.points.map((point) =>
    [forecast.series_key.route_id, point.timestamp, point.predicted_load, forecast.model_version].map(cell).join(";")));
  download(`\uFEFF${[header, ...rows].join("\r\n")}\r\n`,
    `tram-network-${forecasts[0]?.points[0]?.timestamp.slice(0, 10) ?? "forecast"}-validations.csv`);
}

/** Сценарный расчёт по всем маршрутам сети рядом с базовым прогнозом модели. */
export function networkScenarioCsv(forecasts: ForecastResponse[], adjustments: ScenarioAdjustments): string {
  const rows = forecasts.flatMap((forecast) => scenarioCsvRows(forecast, adjustments).map((values) => values.map(cell).join(";")));
  return `\uFEFF${[SCENARIO_CSV_HEADER.join(";"), ...rows].join("\r\n")}\r\n`;
}

export function downloadNetworkScenarioCsv(forecasts: ForecastResponse[], adjustments: ScenarioAdjustments): void {
  download(networkScenarioCsv(forecasts, adjustments),
    `tram-network-${forecasts[0]?.points[0]?.timestamp.slice(0, 10) ?? "forecast"}-scenario.csv`);
}
