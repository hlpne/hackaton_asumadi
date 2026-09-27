import { neutralMapColor } from "../../loadLevel";
import type { MapForecastResponse, Route, RouteGeometry } from "../../types";

export interface ColoredRouteLines {
  routeId: string;
  directionId: 0 | 1;
  color: string;
  lines: RouteGeometry["lines"];
}

export function buildNetworkLines(
  geometries: RouteGeometry[],
  routes: Route[],
  snapshot: MapForecastResponse | null,
): ColoredRouteLines[] {
  const routeColors = new Map(routes.map((route) => [route.id, route.color]));
  void snapshot;
  return geometries.flatMap((geometry) => {
    return [{
      routeId: geometry.route_id,
      directionId: geometry.direction_id,
      color: routeColors.get(geometry.route_id) ?? neutralMapColor(),
      lines: geometry.lines.filter((line) => line.length > 1),
    }];
  });
}
