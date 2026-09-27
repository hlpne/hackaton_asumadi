import type { RouteGeometry } from "../../types";

/** Returns every route whose geometry passes within radius of a point in projected units. */
export function routesNearPoint(
  geometries: RouteGeometry[],
  point: [number, number],
  project: (lon: number, lat: number) => [number, number],
  radius: number,
): string[] {
  const routeIds = new Set<string>();
  const radiusSquared = radius * radius;
  for (const geometry of geometries) {
    if (routeIds.has(geometry.route_id)) continue;
    for (const line of geometry.lines) {
      for (let index = 0; index < line.length; index += 1) {
        const start = project(...line[index]);
        const end = project(...(line[index + 1] ?? line[index]));
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const position = dx * dx + dy * dy === 0 ? 0 : Math.max(0, Math.min(1,
          ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
        const distanceSquared = (start[0] + position * dx - point[0]) ** 2 +
          (start[1] + position * dy - point[1]) ** 2;
        if (distanceSquared <= radiusSquared) {
          routeIds.add(geometry.route_id);
          break;
        }
      }
      if (routeIds.has(geometry.route_id)) break;
    }
  }
  return [...routeIds];
}
