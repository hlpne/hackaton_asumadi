// Legacy browser-only demo fixtures. The running app now reads catalog and forecasts
// exclusively from backend API; keep these fixtures only for isolated examples.

import type {
  ForecastResponse,
  Horizon,
  Route,
  RouteStop,
} from "../types";

export const mockRoutes: Route[] = [
  { id: "17", name: "Трамвай 17", color: "#e74646" },
  { id: "3", name: "Трамвай 3", color: "#173f71" },
  { id: "11", name: "Трамвай 11", color: "#1f8a4c" },
  { id: "47", name: "Трамвай 47", color: "#c2872b" },
];

const rawStops: Array<[string, string, number, number]> = [
  ["S101", "Улица Академика Янгеля", 55.595, 37.601],
  ["S102", "Варшавское шоссе", 55.611, 37.603],
  ["S103", "Нагатинская", 55.683, 37.622],
  ["S104", "Павелецкая", 55.73, 37.638],
  ["S105", "Новокузнецкая", 55.742, 37.629],
  ["S106", "Третьяковская", 55.741, 37.626],
  ["S107", "Чистые пруды", 55.764, 37.638],
  ["S108", "Сокольники", 55.789, 37.679],
  ["S109", "Преображенская площадь", 55.796, 37.716],
  ["S110", "Измайловская", 55.788, 37.75],
  ["S111", "Партизанская", 55.788, 37.749],
  ["S112", "Семёновская", 55.783, 37.719],
  ["S113", "Электрозаводская", 55.782, 37.704],
  ["S114", "Бауманская", 55.772, 37.679],
  ["S115", "Курская", 55.758, 37.66],
  ["S116", "Таганская", 55.74, 37.653],
  ["S117", "Пролетарская", 55.732, 37.666],
  ["S118", "Дубровка", 55.719, 37.676],
  ["S119", "Кожуховская", 55.708, 37.686],
  ["S120", "Печатники", 55.694, 37.727],
];

export function mockStopsForRoute(routeId: string): RouteStop[] {
  return rawStops.map(([id, name, lat, lon], index) => ({
    id,
    name,
    lat,
    lon,
    sequence: index + 1,
    direction_id: 0 as const,
    // route_id не входит в RouteStop по типу, но если нужно — можно расширить
  })).map((stop) => ({ ...stop, id: `${routeId}-${stop.id}` }));
}

// Детерминированный ПСЧ (mulberry32)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mockForecast(
  routeId: string,
  stopId: string | undefined,
  horizon: Horizon
): ForecastResponse {
  const seed = hash(`${routeId}|${stopId ?? "all"}|${horizon}`);
  const rand = rng(seed);

  const base = new Date("2026-09-26T00:00:00+03:00");
  let count: number;
  let stepMs: number;
  let resolution: ForecastResponse["resolution"];
  if (horizon === "day") {
    count = 24;
    stepMs = 3600 * 1000;
    resolution = "PT1H";
  } else if (horizon === "month") {
    count = 30;
    stepMs = 24 * 3600 * 1000;
    resolution = "P1D";
  } else {
    count = 12;
    stepMs = 30 * 24 * 3600 * 1000;
    resolution = "P1M";
  }

  const points = Array.from({ length: count }, (_, i) => {
    const ts = new Date(base.getTime() + i * stepMs);
    const hour = ts.getHours();
    const seasonal =
      100 +
      80 * Math.exp(-Math.pow(hour - 8, 2) / 4) +
      90 * Math.exp(-Math.pow(hour - 18, 2) / 4);
    const noise = (rand() - 0.5) * 30;
    const load = Math.max(0, seasonal + noise);
    return {
      timestamp: ts.toISOString(),
      predicted_load: Math.round(load * 10) / 10,
      lower_bound: Math.round(load * 0.9 * 10) / 10,
      upper_bound: Math.round(load * 1.1 * 10) / 10,
    };
  });

  return {
    contract_version: "1.0",
    series_key: {
      route_id: routeId,
      stop_id: stopId ?? null,
      direction_id: 0,
    },
    horizon,
    resolution,
    forecast_origin: base.toISOString(),
    value_unit: "demo_index",
    aggregation: "demo_mean",
    is_mock: true,
    model_version: "mock-v0",
    interval_level: 0.9,
    points,
  };
}
