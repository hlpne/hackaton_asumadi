import assert from "node:assert/strict";
import test from "node:test";
import { forecastValidationLevel, validationLevel } from "../src/loadLevel.ts";
import type { ForecastResponse } from "../src/types.ts";

test("route validation levels follow the selected forecast range", () => {
  const values = [0, 30, 60, 90];
  assert.equal(validationLevel(0, values), "low");
  assert.equal(validationLevel(30, values), "medium");
  assert.equal(validationLevel(90, values), "high");
  assert.equal(validationLevel(25, [25, 25, 25]), "medium");
});

test("a route keeps the same level on its own map and on the network map", () => {
  const forecast = {
    points: [100, 913, 350].map((predicted_load, hour) => ({
      timestamp: `2026-01-20T${String(hour + 7).padStart(2, "0")}:00:00+03:00`,
      predicted_load, lower_bound: null, upper_bound: null,
    })),
  } as ForecastResponse;
  assert.equal(forecastValidationLevel(forecast, "2026-01-20T08:00:00+03:00"), "high");
  assert.equal(forecastValidationLevel(forecast, "2026-01-20T07:00:00+03:00"), "low");
});
