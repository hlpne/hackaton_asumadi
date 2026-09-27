import type { MapForecastResponse, Route } from "./types";

/**
 * Routes with observed successful boardings in the training labels.
 * Route 5 has no training target and stays hidden; the full catalog remains
 * available in backend/mock_data.
 */
export const SUPPORTED_ROUTE_IDS = [
  "demo-1",
  "demo-7",
  "demo-11",
  "demo-12",
  "demo-17",
  "demo-25",
  "demo-26",
  "demo-28",
  "demo-50",
] as const;

const supported = new Set<string>(SUPPORTED_ROUTE_IDS);

export function supportedRoutes(routes: Route[]): Route[] {
  return routes.filter((route) => supported.has(route.id))
    .map((route) => ({ ...route, name: route.name.replace(" · демопрогноз", "") }));
}
export function supportedNetworkSnapshot(snapshot: MapForecastResponse): MapForecastResponse {
  return { ...snapshot, points: snapshot.points.filter((point) => supported.has(point.route_id)) };
}
