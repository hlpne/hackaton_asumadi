import assert from "node:assert/strict";
import test from "node:test";
import { forecastSnapshotCsv } from "../src/forecastCsv.ts";
import type { MapForecastResponse } from "../src/types.ts";

test("CSV contains only the selected route and direction, ordered by stop", () => {
  const snapshot: MapForecastResponse = {
    contract_version: "1.0", horizon: "day", timestamp: "2025-01-17T12:00:00+03:00",
    forecast_origin: "2025-01-17T12:00:00+03:00", value_unit: "demo_index",
    aggregation: "demo_mean", is_mock: true, model_version: "mock-v0", interval_level: null,
    points: [
      { route_id: "demo-1", route_name: "Трамвай 1", direction_id: 0, stop_id: "b", stop_name: "=1+1", sequence: 2, lat: 0, lon: 0, predicted_load: 3, lower_bound: null, upper_bound: null },
      { route_id: "demo-1", route_name: "Трамвай 1", direction_id: 0, stop_id: "a", stop_name: 'Остановка "А"', sequence: 1, lat: 0, lon: 0, predicted_load: 2, lower_bound: 1, upper_bound: 3 },
      { route_id: "demo-1", route_name: "Трамвай 1", direction_id: 1, stop_id: "c", stop_name: "Другая", sequence: 1, lat: 0, lon: 0, predicted_load: 5, lower_bound: null, upper_bound: null },
    ],
  };

  const lines = forecastSnapshotCsv(snapshot, "demo-1", 0).trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /"a";"Остановка ""А"""/);
  assert.match(lines[2], /"b";"'=1\+1"/);
  assert.ok(!lines.some((line) => line.includes('"c"')));
});
