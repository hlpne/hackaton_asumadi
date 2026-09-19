import type { MapForecastPoint, MapForecastResponse } from "./types";

export interface RankedRoute {
  id: string;
  name: string;
  averageLoad: number;
  stopCount: number;
  rank: number;
}

export interface NetworkRanking {
  routes: RankedRoute[];
  stops: Array<MapForecastPoint & { rank: number }>;
}

/** Compare routes by the mean stop index, so long routes do not win by stop count alone. */
export function rankNetwork(snapshot: MapForecastResponse): NetworkRanking {
  const totals = new Map<string, { name: string; sum: number; count: number }>();
  for (const point of snapshot.points) {
    const route = totals.get(point.route_id) ?? { name: point.route_name, sum: 0, count: 0 };
    route.sum += point.predicted_load;
    route.count += 1;
    totals.set(point.route_id, route);
  }

  const routes = [...totals.entries()]
    .map(([id, route]) => ({ id, name: route.name, averageLoad: route.sum / route.count, stopCount: route.count }))
    .sort((left, right) => right.averageLoad - left.averageLoad || left.id.localeCompare(right.id))
    .map((route, index) => ({ ...route, rank: index + 1 }));

  const candidates = snapshot.is_mock && snapshot.horizon === "day"
    ? snapshot.points.filter((point) => point.predicted_load > 0)
    : snapshot.points;
  const stops = [...candidates]
    .sort((left, right) => right.predicted_load - left.predicted_load ||
      left.route_id.localeCompare(right.route_id) ||
      left.direction_id - right.direction_id || left.sequence - right.sequence)
    .slice(0, 10)
    .map((point, index) => ({ ...point, rank: index + 1 }));

  return { routes, stops };
}
