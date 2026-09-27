import type { MapForecastResponse, Route } from "./types";

/**
 * Routes with an approved prediction target in the current demo model.
 * The full 36-route catalog remains in backend/mock_data; the UI deliberately
 * exposes only the nine routes covered by the current model build.
 */
export const SUPPORTED_ROUTE_IDS = [
  "demo-t1",
  "demo-t2",
  "demo-a",
  "demo-1",
  "demo-2",
  "demo-4",
  "demo-6",
  "demo-6k",
  "demo-7",
] as const;

/* Temporarily hidden until matching model data is approved:
 * demo-5 (explicitly excluded by model limitations), demo-10, demo-11,
 * demo-12, demo-13, demo-14, demo-15, demo-16, demo-17, demo-21,
 * demo-23, demo-25, demo-26, demo-27, demo-28, demo-29, demo-30,
 * demo-31, demo-32, demo-36, demo-38, demo-39, demo-43, demo-46,
 * demo-47, demo-49, demo-50.
 */

const supported = new Set<string>(SUPPORTED_ROUTE_IDS);

export function supportedRoutes(routes: Route[]): Route[] {
  return routes.filter((route) => supported.has(route.id));
}
export function supportedNetworkSnapshot(snapshot: MapForecastResponse): MapForecastResponse {
  return { ...snapshot, points: snapshot.points.filter((point) => supported.has(point.route_id)) };
}
