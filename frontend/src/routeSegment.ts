import type { RouteStop } from "./types";

type Position = [number, number];

export interface RouteSegment {
  from: RouteStop;
  to: RouteStop;
  stops: RouteStop[];
  directionId: 0 | 1;
}

export function buildRouteSegment(stops: RouteStop[], fromId: string, toId: string): RouteSegment | null {
  if (!fromId || !toId) return null;
  const from = stops.find((stop) => stop.id === fromId);
  const to = stops.find((stop) => stop.id === toId);
  if (!from || !to || from.direction_id !== to.direction_id || from.sequence >= to.sequence) return null;
  return {
    from,
    to,
    directionId: from.direction_id,
    stops: stops.filter((stop) => stop.direction_id === from.direction_id &&
      stop.sequence >= from.sequence && stop.sequence <= to.sequence)
      .sort((a, b) => a.sequence - b.sequence),
  };
}

export function clipRouteLines(
  lines: Position[][],
  directionStops: RouteStop[],
  segment: RouteSegment,
): Position[][] | null {
  const vertices = lines.flatMap((line, lineIndex) =>
    line.map(([lon, lat], vertexIndex) => ({ lon, lat, lineIndex, vertexIndex })),
  );
  let cursor = 0;
  let fromIndex = -1;
  let toIndex = -1;
  for (const stop of [...directionStops].sort((a, b) => a.sequence - b.sequence)) {
    const index = vertices.findIndex((vertex, position) => position >= cursor &&
      vertex.lon === stop.lon && vertex.lat === stop.lat);
    if (index < 0) return null;
    if (stop.id === segment.from.id) fromIndex = index;
    if (stop.id === segment.to.id) toIndex = index;
    cursor = index;
  }
  if (fromIndex < 0 || toIndex <= fromIndex) return null;

  let position = 0;
  return lines.map((line) => {
    const clipped = line.filter(() => {
      const include = position >= fromIndex && position <= toIndex;
      position += 1;
      return include;
    });
    return clipped;
  }).filter((line) => line.length >= 2);
}
