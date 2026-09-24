import { loadColor } from "../../loadLevel";
import type { MapForecastPoint, MapForecastResponse, Route, RouteGeometry } from "../../types";

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
  const pointsByDirection = new Map<string, MapForecastPoint[]>();
  snapshot?.points.forEach((point) => {
    const key = `${point.route_id}/${point.direction_id}`;
    const points = pointsByDirection.get(key) ?? [];
    points.push(point);
    pointsByDirection.set(key, points);
  });
  const noDemoService = Boolean(snapshot?.is_mock && snapshot.horizon === "day" &&
    snapshot.points.length && snapshot.points.every((point) => point.predicted_load === 0));

  return geometries.flatMap((geometry) => {
    const points = pointsByDirection.get(`${geometry.route_id}/${geometry.direction_id}`) ?? [];
    const groups = new Map<string, RouteGeometry["lines"]>();
    geometry.lines.forEach((line) => {
      if (line.length < 2) return;
      const middle = line[Math.floor(line.length / 2)];
      const nearest = points.length ? points.reduce((best, point) => {
        const distance = (point.lon - middle[0]) ** 2 + (point.lat - middle[1]) ** 2;
        return distance < best.distance ? { point, distance } : best;
      }, { point: points[0], distance: Infinity }).point : null;
      const color = noDemoService ? "#8b98a8" : nearest && snapshot
        ? loadColor(nearest.predicted_load, snapshot)
        : routeColors.get(geometry.route_id) ?? "#8b98a8";
      const lines = groups.get(color) ?? [];
      lines.push(line);
      groups.set(color, lines);
    });
    return [...groups].map(([color, lines]) => ({
      routeId: geometry.route_id,
      directionId: geometry.direction_id,
      color,
      lines,
    }));
  });
}
