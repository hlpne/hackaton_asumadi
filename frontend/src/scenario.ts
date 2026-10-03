// Сценарный анализ «Что если?» поверх базового прогноза модели.
// Это не ML-прогноз и не переобучение: пользовательские поправки применяются к уже полученному
// ForecastResponse и возвращают отдельную view-model. Исходный прогноз не изменяется.
//   K = K_weather × K_event × K_season,  K_x = 1 + поправка_x / 100
//   ŷ_scenario = max(0, ŷ_model × K)
import type { ForecastResponse } from "./types";

export type ScenarioFactorKey = "weather" | "event" | "season";

export interface ScenarioAdjustments {
  weather: number;
  event: number;
  season: number;
}

export interface ScenarioResult {
  factor: number;
  deltaPercent: number;
}

export interface ScenarioBounds { min: number; max: number; step: number }

/** Диапазоны в процентах. Шаг 1 %, 0 % — без изменений. */
export const SCENARIO_BOUNDS: Readonly<Record<ScenarioFactorKey, ScenarioBounds>> = Object.freeze({
  weather: { min: -20, max: 20, step: 1 },
  event: { min: -30, max: 50, step: 1 },
  season: { min: -20, max: 20, step: 1 },
});

export const SCENARIO_KEYS: readonly ScenarioFactorKey[] = ["weather", "event", "season"];

export const SCENARIO_LABELS: Readonly<Record<ScenarioFactorKey, string>> = {
  weather: "Погода",
  event: "Событие",
  season: "Сезонность",
};

export const SCENARIO_HINTS: Readonly<Record<ScenarioFactorKey, string>> = {
  weather: "Осадки, снегопад, жара",
  event: "Концерт, матч, перекрытие",
  season: "Каникулы, праздники, спрос",
};

export const NEUTRAL_SCENARIO: Readonly<ScenarioAdjustments> = Object.freeze({ weather: 0, event: 0, season: 0 });

/** Быстрые сценарии для демонстрации. Значения задаются пользователем и не являются оценкой эффекта. */
export const SCENARIO_PRESETS: ReadonlyArray<{ id: string; label: string; adjustments: ScenarioAdjustments }> = [
  { id: "rain", label: "Сильные осадки", adjustments: { weather: -8, event: 0, season: 0 } },
  { id: "event", label: "Массовое мероприятие", adjustments: { weather: 0, event: 20, season: 0 } },
  { id: "season", label: "Повышенный спрос", adjustments: { weather: 0, event: 0, season: 10 } },
];

export function resetScenario(): ScenarioAdjustments {
  return { ...NEUTRAL_SCENARIO };
}

/** Приводит значение поправки к допустимому: конечное число, шаг 1 %, в пределах диапазона. */
export function clampAdjustment(key: ScenarioFactorKey, value: number): number {
  const { min, max, step } = SCENARIO_BOUNDS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped)) + 0; // + 0 убирает −0
}

export function sanitizeScenario(adjustments: ScenarioAdjustments): ScenarioAdjustments {
  return {
    weather: clampAdjustment("weather", adjustments.weather),
    event: clampAdjustment("event", adjustments.event),
    season: clampAdjustment("season", adjustments.season),
  };
}

export function isNeutralScenario(adjustments: ScenarioAdjustments): boolean {
  const safe = sanitizeScenario(adjustments);
  return safe.weather === 0 && safe.event === 0 && safe.season === 0;
}

export function scenarioFactor(adjustments: ScenarioAdjustments): number {
  const safe = sanitizeScenario(adjustments);
  return (1 + safe.weather / 100) * (1 + safe.event / 100) * (1 + safe.season / 100);
}

export function scenarioResult(adjustments: ScenarioAdjustments): ScenarioResult {
  const factor = scenarioFactor(adjustments);
  return { factor, deltaPercent: (factor - 1) * 100 };
}

/** Сценарное значение одной точки прогноза (без округления). Базовое значение должно быть конечным числом. */
export function applyScenario(baseValue: number, adjustments: ScenarioAdjustments): number {
  if (typeof baseValue !== "number" || !Number.isFinite(baseValue)) {
    throw new RangeError("Базовый прогноз должен быть конечным числом");
  }
  return Math.max(0, baseValue * scenarioFactor(adjustments));
}

export interface ScenarioPoint {
  timestamp: string;
  base: number;
  scenario: number;
  delta: number;
}

/** Новая последовательность base/scenario по каждой точке прогноза; ForecastResponse не изменяется. */
export function applyScenarioToForecast(forecast: ForecastResponse, adjustments: ScenarioAdjustments): ScenarioPoint[] {
  return forecast.points.map((point) => {
    const scenario = applyScenario(point.predicted_load, adjustments);
    return { timestamp: point.timestamp, base: point.predicted_load, scenario, delta: scenario - point.predicted_load };
  });
}

export interface ScenarioTotals { base: number; scenario: number; delta: number; deltaPercent: number }

export function scenarioTotals(points: ReadonlyArray<Pick<ScenarioPoint, "base" | "scenario">>): ScenarioTotals {
  const base = points.reduce((sum, point) => sum + point.base, 0);
  const scenario = points.reduce((sum, point) => sum + point.scenario, 0);
  return { base, scenario, delta: scenario - base, deltaPercent: base > 0 ? (scenario - base) / base * 100 : 0 };
}

/** Округление до целого с половинами вверх — как у прогноза модели. */
export function roundValidations(value: number): number {
  return Math.floor(value + 0.5);
}

const MINUS = "−";
const NNBSP = " ";

/** «0 %», «+12 %», «−8 %», «+13,4 %». */
export function formatSignedPercent(value: number, fractionDigits = 0): string {
  const rounded = Number(value.toFixed(fractionDigits));
  if (rounded === 0) return `0${NNBSP}%`;
  const text = Math.abs(rounded).toLocaleString("ru-RU", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  return `${rounded > 0 ? "+" : MINUS}${text}${NNBSP}%`;
}

export function formatSignedNumber(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toLocaleString("ru-RU")}`;
}

export function formatFactor(factor: number): string {
  return `×${factor.toLocaleString("ru-RU", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

/** Короткий вывод без операционных рекомендаций: вместимость, выпуск и интервалы движения неизвестны. */
export function scenarioConclusion(result: ScenarioResult): string {
  if (Math.abs(result.deltaPercent) < 0.05) return "Сценарий не изменяет прогноз.";
  return result.deltaPercent > 0
    ? "При заданных условиях ожидаемый пассажиропоток выше базового прогноза."
    : "При заданных условиях ожидаемый пассажиропоток ниже базового прогноза.";
}

export const SCENARIO_DISCLAIMER = "Сценарная корректировка применяется поверх базового прогноза модели и предназначена для анализа «что если?». "
  + "Она не переобучает модель и не изменяет исходный прогноз. Значения задаёт пользователь — это не автоматическая оценка влияния события.";

/** Строки CSV: базовый прогноз, сценарный расчёт и поправки. Использует те же функции, что и интерфейс. */
export function scenarioCsvRows(forecast: ForecastResponse, adjustments: ScenarioAdjustments): Array<Array<string | number>> {
  const safe = sanitizeScenario(adjustments);
  const { deltaPercent } = scenarioResult(safe);
  return applyScenarioToForecast(forecast, safe).map((point) => {
    const scenario = roundValidations(point.scenario);
    return [forecast.series_key.route_id, point.timestamp, point.base, scenario, roundValidations(scenario - point.base),
      Number(deltaPercent.toFixed(1)), safe.weather, safe.event, safe.season, forecast.model_version];
  });
}

export const SCENARIO_CSV_HEADER = ["route_id", "timestamp", "base_prediction", "scenario_prediction", "scenario_delta",
  "scenario_delta_percent", "weather_adjustment_percent", "event_adjustment_percent", "season_adjustment_percent", "model_version"];
