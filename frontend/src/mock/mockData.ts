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
    id: `${routeId}-${id}`,
    name,
    lat,
    lon,
    sequence: index + 1,
    direction_id: 0 as const,
  }));
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
  horizon: Horizon,
  from?: string,
  to?: string
): ForecastResponse {
  const seed = hash(
    `${routeId}|${stopId ?? "all"}|${horizon}|${from ?? ""}|${to ?? ""}`
  );
  const rand = rng(seed);

  // Начало и конец периода — из from/to, если переданы
  const startDate = from ? new Date(from) : new Date("2026-09-26T00:00:00+03:00");
  const endDate = to
    ? new Date(to)
    : new Date(startDate.getTime() + 24 * 3600 * 1000);

  const totalMs = Math.max(endDate.getTime() - startDate.getTime(), 3600 * 1000);

  // Шаг в зависимости от горизонта
  let stepMs: number;
  let resolution: ForecastResponse["resolution"];
  if (horizon === "day") {
    stepMs = 3600 * 1000; // 1 час
    resolution = "PT1H";
  } else if (horizon === "month") {
    stepMs = 24 * 3600 * 1000; // 1 день
    resolution = "P1D";
  } else {
    stepMs = 30 * 24 * 3600 * 1000; // ~1 месяц
    resolution = "P1M";
  }

  const count = Math.max(Math.min(Math.round(totalMs / stepMs), 500), 2);

  // Значения в процентах от максимальной вместимости (100 % = полная загрузка)
  const points = Array.from({ length: count }, (_, i) => {
    const ts = new Date(startDate.getTime() + i * (totalMs / count));
    const hour = ts.getHours();

    // Суточная сезонность — два пика (утро 8:00, вечер 18:00)
    const morningPeak = Math.exp(-Math.pow(hour - 8, 2) / 4);
    const eveningPeak = Math.exp(-Math.pow(hour - 18, 2) / 4);

    // Базовая кривая: 20 % ночью, до 90 % в пики (с шумом иногда до 100 %)
    const basePercent = 20 + 50 * morningPeak + 55 * eveningPeak;
    const noise = (rand() - 0.5) * 15;
    const loadPercent = Math.min(100, Math.max(0, basePercent + noise));

    return {
      timestamp: ts.toISOString(),
      predicted_load: Math.round(loadPercent * 10) / 10,
      lower_bound: Math.round(Math.max(0, loadPercent * 0.9) * 10) / 10,
      upper_bound: Math.round(Math.min(100, loadPercent * 1.1) * 10) / 10,
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
    forecast_origin: startDate.toISOString(),
    value_unit: "percent",
    aggregation: "demo_mean",
    is_mock: true,
    model_version: "mock-v0",
    interval_level: 0.9,
    points,
  };
}