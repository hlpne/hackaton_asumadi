import type { LngLat } from "./YandexMap";
import type { RouteGeometry } from "../../types";

export interface RouteIntersection {
  coordinate: LngLat;
  routeIds: string[];
}

/**
 * Finds approximate shared route corridors from OSM geometry. Coordinates are
 * bucketed to ~120 metres and nearby duplicate buckets are collapsed, keeping
 * the result intentionally small enough for interactive map markers.
 */
export function findRouteIntersections(geometries: RouteGeometry[], limit = 12): RouteIntersection[] {
  const cell = .0015;
  const samples: Array<{ lon: number; lat: number; routeId: string; cellX: number; cellY: number }> = [];
  geometries.forEach((geometry) => geometry.lines.forEach((line) => {
    const step = Math.max(1, Math.ceil(line.length / 180));
    for (let index = 0; index < line.length; index += step) {
      const [lon, lat] = line[index];
      samples.push({ lon, lat, routeId: geometry.route_id, cellX: Math.floor(lon / cell), cellY: Math.floor(lat / cell) });
    }
  }));

  const buckets = new Map<string, typeof samples>();
  samples.forEach((sample) => {
    const key = `${sample.cellX}/${sample.cellY}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(sample);
    buckets.set(key, bucket);
  });

  const candidates = samples.map((sample) => {
    const nearby = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) =>
      buckets.get(`${sample.cellX + x}/${sample.cellY + y}`) ?? []))
      .filter((point) => (point.lon - sample.lon) ** 2 + (point.lat - sample.lat) ** 2 <= cell ** 2);
    const routeIds = [...new Set(nearby.map((point) => point.routeId))].sort();
    return { coordinate: [sample.lon, sample.lat] as LngLat, routeIds };
  })
    .filter((candidate) => candidate.routeIds.length > 1)
    .sort((left, right) => right.routeIds.length - left.routeIds.length);

  const selected: RouteIntersection[] = [];
  for (const candidate of candidates) {
    const tooClose = selected.some((item) => {
      const lon = item.coordinate[0] - candidate.coordinate[0];
      const lat = item.coordinate[1] - candidate.coordinate[1];
      return lon * lon + lat * lat < .003 * .003;
    });
    if (!tooClose) selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}
