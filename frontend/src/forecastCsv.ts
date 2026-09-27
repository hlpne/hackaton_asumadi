import type { MapForecastPoint, MapForecastResponse } from "./types";

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

export function forecastSnapshotCsv(snapshot: MapForecastResponse, routeId: string, directionId: 0 | 1): string {
  const points = snapshot.points.filter((point) => point.route_id === routeId && point.direction_id === directionId)
    .sort((a, b) => a.sequence - b.sequence);
  return `\uFEFF${[columns.join(";"), ...points.map((point) => row(point, snapshot).map(cell).join(";"))].join("\r\n")}\r\n`;
}

export function downloadForecastSnapshotCsv(snapshot: MapForecastResponse, routeId: string, directionId: 0 | 1): void {
  const csv = forecastSnapshotCsv(snapshot, routeId, directionId);
  const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tram-${routeId.replace(/[^a-z0-9-]/gi, "")}-${snapshot.timestamp.slice(0, 10)}-direction-${directionId + 1}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
