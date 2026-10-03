import assert from "node:assert/strict";
import test from "node:test";
import {
  NEUTRAL_SCENARIO,
  SCENARIO_BOUNDS,
  SCENARIO_PRESETS,
  applyScenario,
  applyScenarioToForecast,
  clampAdjustment,
  formatFactor,
  formatSignedPercent,
  isNeutralScenario,
  resetScenario,
  scenarioConclusion,
  scenarioFactor,
  scenarioResult,
  scenarioTotals,
} from "../src/scenario.ts";
import { networkScenarioCsv, routeScenarioCsv } from "../src/forecastCsv.ts";
import type { ForecastResponse } from "../src/types.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

function forecast(values: number[], routeId = "demo-17"): ForecastResponse {
  return {
    contract_version: "1.0", series_key: { route_id: routeId, stop_id: null, direction_id: null },
    horizon: "day", resolution: "PT1H", forecast_origin: "2025-11-01T00:00:00+03:00",
    value_unit: "validations", aggregation: "sum", is_mock: false, model_version: "tram-final-2025-0.90461",
    interval_level: null,
    points: values.map((value, hour) => ({ timestamp: `2025-11-01T${String(hour).padStart(2, "0")}:00:00+03:00`,
      predicted_load: value, lower_bound: null, upper_bound: null })),
  };
}

test("0/0/0 не меняет прогноз", () => {
  assert.equal(scenarioFactor(NEUTRAL_SCENARIO), 1);
  assert.equal(applyScenario(100, NEUTRAL_SCENARIO), 100);
  assert.ok(isNeutralScenario(NEUTRAL_SCENARIO));
});

test("погода +10 % и −10 %", () => {
  close(applyScenario(100, { weather: 10, event: 0, season: 0 }), 110);
  close(applyScenario(100, { weather: -10, event: 0, season: 0 }), 90);
});

test("погода −10 % и событие +20 %: 100 × 0,9 × 1,2 = 108", () => {
  close(applyScenario(100, { weather: -10, event: 20, season: 0 }), 108);
});

test("все три поправки: 100 × 0,9 × 1,2 × 1,05 = 113,4", () => {
  const adjustments = { weather: -10, event: 20, season: 5 };
  close(scenarioFactor(adjustments), 1.134);
  close(applyScenario(100, adjustments), 113.4);
  close(scenarioResult(adjustments).deltaPercent, 13.4);
  assert.equal(formatFactor(scenarioFactor(adjustments)), "×1,134");
  assert.equal(formatSignedPercent(13.4, 1), "+13,4 %");
  assert.equal(formatSignedPercent(-8), "−8 %");
  assert.equal(formatSignedPercent(0), "0 %");
});

test("прогноз никогда не становится отрицательным", () => {
  const worst = { weather: -20, event: -30, season: -20 };
  assert.ok(scenarioFactor(worst) > 0);
  close(scenarioFactor(worst), 0.8 * 0.7 * 0.8);
  assert.equal(applyScenario(-5, worst), 0);
  for (const value of [0, 1, 7, 100, 12345]) assert.ok(applyScenario(value, worst) >= 0);
});

test("NaN и Infinity запрещены", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => applyScenario(bad, NEUTRAL_SCENARIO), RangeError);
    assert.equal(clampAdjustment("weather", bad), 0);
    assert.ok(Number.isFinite(scenarioFactor({ weather: bad, event: bad, season: bad })));
  }
});

test("границы и шаг поправок соблюдаются", () => {
  assert.deepEqual(SCENARIO_BOUNDS, {
    weather: { min: -20, max: 20, step: 1 }, event: { min: -30, max: 50, step: 1 }, season: { min: -20, max: 20, step: 1 },
  });
  assert.equal(clampAdjustment("weather", 35), 20);
  assert.equal(clampAdjustment("weather", -35), -20);
  assert.equal(clampAdjustment("event", 80), 50);
  assert.equal(clampAdjustment("event", -90), -30);
  assert.equal(clampAdjustment("season", 7.4), 7);
  assert.equal(Object.is(clampAdjustment("season", -0.2), -0), false);
  // значение за пределами диапазона не может попасть в формулу
  close(scenarioFactor({ weather: 99, event: 0, season: 0 }), 1.2);
});

test("сброс возвращает все поправки к 0 и прогноз — к базовому", () => {
  const reset = resetScenario();
  assert.deepEqual(reset, { weather: 0, event: 0, season: 0 });
  const points = applyScenarioToForecast(forecast([450, 520, 610]), reset);
  assert.deepEqual(points.map((point) => point.scenario), [450, 520, 610]);
  assert.ok(points.every((point) => point.delta === 0));
  assert.equal(scenarioConclusion(scenarioResult(reset)), "Сценарий не изменяет прогноз.");
});

test("исходный ForecastResponse не изменяется", () => {
  const source = forecast([450, 520, 610]);
  const before = structuredClone(source);
  const points = applyScenarioToForecast(source, { weather: 0, event: 10, season: 0 });
  assert.deepEqual(source, before);
  assert.deepEqual(points.map((point) => Math.round(point.scenario)), [495, 572, 671]);
});

test("одна формула для каждой точки и для сумм за период", () => {
  const values = [0, 100, 250, 731, 1200];
  const adjustments = { weather: -10, event: 20, season: 5 };
  const totals = scenarioTotals(applyScenarioToForecast(forecast(values), adjustments));
  close(totals.base, values.reduce((sum, value) => sum + value, 0));
  close(totals.scenario, totals.base * 1.134);
  close(totals.deltaPercent, 13.4);
});

test("быстрые сценарии: осадки −8 %, мероприятие +20 %, спрос +10 %", () => {
  const byId = Object.fromEntries(SCENARIO_PRESETS.map((preset) => [preset.id, preset.adjustments]));
  assert.deepEqual(byId.rain, { weather: -8, event: 0, season: 0 });
  assert.deepEqual(byId.event, { weather: 0, event: 20, season: 0 });
  assert.deepEqual(byId.season, { weather: 0, event: 0, season: 10 });
  assert.ok(scenarioConclusion(scenarioResult(byId.event)).includes("выше"));
  assert.ok(!scenarioConclusion(scenarioResult(byId.event)).toLowerCase().includes("трамва"));
});

test("сценарный CSV: базовый прогноз, сценарий, изменение и поправки", () => {
  const lines = routeScenarioCsv(forecast([531]), { weather: -5, event: 10, season: 5 }).replace("﻿", "").trim().split("\r\n");
  assert.equal(lines[0], "route_id;timestamp;base_prediction;scenario_prediction;scenario_delta;scenario_delta_percent;"
    + "weather_adjustment_percent;event_adjustment_percent;season_adjustment_percent;model_version");
  const cells = lines[1].split(";").map((cell) => cell.replaceAll('"', ""));
  assert.deepEqual(cells.slice(2, 9), ["531", String(Math.floor(531 * 0.95 * 1.1 * 1.05 + 0.5)), "52", "9.7", "-5", "10", "5"]);
  const network = networkScenarioCsv([forecast([10], "demo-1"), forecast([20], "demo-7")], { weather: 0, event: 20, season: 0 });
  assert.equal(network.trim().split("\r\n").length, 3);
});
