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
  const selectedFrom = stops.find((stop) => stop.id === fromId);
  const selectedTo = stops.find((stop) => stop.id === toId);
  if (!selectedFrom || !selectedTo) return null;

  const candidates = ([0, 1] as const).flatMap((directionId) => {
    const fromMatches = stops.filter((stop) => stop.direction_id === directionId && stop.name === selectedFrom.name);
    const toMatches = stops.filter((stop) => stop.direction_id === directionId && stop.name === selectedTo.name);
    return fromMatches.flatMap((from) => toMatches
      .filter((to) => from.sequence < to.sequence)
      .map((to) => ({ from, to, directionId, distance: to.sequence - from.sequence })));
  }).sort((a, b) => a.distance - b.distance);
  const match = candidates[0];
  if (!match) return null;

  const { from, to, directionId } = match;
  return {
    from,
    to,
    directionId,
    stops: stops.filter((stop) => stop.direction_id === directionId &&
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
