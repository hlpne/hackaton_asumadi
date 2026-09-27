import { loadLevel, type LoadLevel } from "../../loadLevel";
import type { MapForecastPoint, MapForecastResponse, RouteGeometry } from "../../types";

/**
 * Metro-style schematic for the fallback network map. Where several routes share a corridor they are
 * drawn as parallel, evenly spaced lines instead of on top of each other; both directions of one route
 * collapse into a single line coloured by the worse load of the two.
 *
 * All distances are in viewBox units (the map is 1000 × 480).
 */

export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = 480;
const SAMPLE_SPACING = 2.5;
const SHARED_RADIUS = 3.4;   // Samples closer than this belong to the same corridor.
const PARALLEL = .8;         // |cos| between tangents; crossings are not corridors.
export const LINE_GAP = 4.6; // Distance between parallel lines, a little more than the stroke width.
const SMOOTHING = 7;         // Samples on each side used to ease offsets in and out of corridors.
const LOAD_RADIUS = 18;      // A direction's nearest stop colours a sample only if it is this close.
const JOIN_EPSILON = .6;     // OSM ways whose ends are this close are chained into one polyline.

type Vec = [number, number];
type Level = LoadLevel | "neutral" | "route";

interface Track {
  routeId: string;
  directionId: 0 | 1;
  points: Vec[];
  tangents: Vec[];
}

interface Sample { routeId: string; directionId: 0 | 1; x: number; y: number; tangent: Vec }

export interface SchematicRun { level: Level; d: string }
export interface SchematicTrack { routeId: string; d: string; runs: SchematicRun[] }
export interface Schematic {
  tracks: SchematicTrack[];
  project: (lon: number, lat: number) => Vec;
}

function projection(geometries: RouteGeometry[]) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  geometries.forEach((geometry) => geometry.lines.forEach((line) => line.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  })));
  if (!Number.isFinite(minLon)) return null;
  const cosine = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const width = Math.max((maxLon - minLon) * cosine, .001);
  const height = Math.max(maxLat - minLat, .001);
  const scale = Math.min(920 / width, 400 / height);
  const offsetX = (VIEW_WIDTH - width * scale) / 2;
  const offsetY = (VIEW_HEIGHT - height * scale) / 2;
  return (lon: number, lat: number): Vec => [(lon - minLon) * cosine * scale + offsetX, (maxLat - lat) * scale + offsetY];
}

function resample(points: Vec[]): Vec[] {
  const result: Vec[] = [points[0]];
  let carry = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const length = Math.hypot(x1 - x0, y1 - y0);
    let position = SAMPLE_SPACING - carry;
    while (position <= length) {
      const t = position / length;
      result.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      position += SAMPLE_SPACING;
    }
    carry = length - (position - SAMPLE_SPACING);
  }
  const last = points[points.length - 1];
  const tail = result[result.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) result.push(last);
  return result;
}

function tangentsOf(points: Vec[]): Vec[] {
  return points.map((_, index) => {
    const [ax, ay] = points[Math.max(0, index - 2)];
    const [bx, by] = points[Math.min(points.length - 1, index + 2)];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    return [(bx - ax) / length, (by - ay) / length];
  });
}

/** Chains OSM ways that touch end-to-end, so casings and round caps do not form knots at every joint. */
function chain(lines: Vec[][]): Vec[][] {
  const close = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= JOIN_EPSILON;
  const pending = lines.map((line) => [...line]);
  const chains: Vec[][] = [];
  while (pending.length) {
    let current = pending.shift()!;
    let extended = true;
    while (extended) {
      extended = false;
      for (let index = 0; index < pending.length; index += 1) {
        const line = pending[index];
        const head = current[0], tail = current[current.length - 1];
        let joined: Vec[] | null = null;
        if (close(tail, line[0])) joined = [...current, ...line.slice(1)];
        else if (close(tail, line[line.length - 1])) joined = [...current, ...line.slice(0, -1).reverse()];
        else if (close(head, line[line.length - 1])) joined = [...line.slice(0, -1), ...current];
        else if (close(head, line[0])) joined = [...line.slice(1).reverse(), ...current];
        if (joined) { current = joined; pending.splice(index, 1); extended = true; break; }
      }
    }
    chains.push(current);
  }
  return chains;
}

/** Worst load among each direction's nearest stop, so a shared line shows the busier direction. */
function levelAt(x: number, y: number, points: Array<{ point: MapForecastPoint; at: Vec }>,
  snapshot: MapForecastResponse): Level {
  const nearest: Array<{ load: number; distance: number } | undefined> = [undefined, undefined];
  points.forEach(({ point, at }) => {
    const distance = Math.hypot(at[0] - x, at[1] - y);
    const best = nearest[point.direction_id];
    if (!best || distance < best.distance) nearest[point.direction_id] = { load: point.predicted_load, distance };
  });
  const found = nearest.filter((item): item is { load: number; distance: number } => Boolean(item));
  if (!found.length) return "route";
  const close = found.filter((item) => item.distance <= LOAD_RADIUS);
  const load = close.length ? Math.max(...close.map((item) => item.load))
    : found.reduce((best, item) => item.distance < best.distance ? item : best).load;
  return loadLevel(load, snapshot);
}

function pathOf(points: Vec[]): string {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

export function buildSchematic(
  geometries: RouteGeometry[],
  routeOrder: string[],
  snapshot: MapForecastResponse | null,
): Schematic | null {
  const project = projection(geometries);
  if (!project) return null;
  const order = new Map(routeOrder.map((id, index) => [id, index]));
  const rank = (id: string) => order.get(id) ?? routeOrder.length;

  const allTracks: Track[] = geometries.flatMap((geometry) => chain(geometry.lines
    .filter((line) => line.length > 1)
    .map((line) => line.map(([lon, lat]) => project(lon, lat))))
    .map((line) => {
      const points = resample(line);
      return { routeId: geometry.route_id, directionId: geometry.direction_id, points, tangents: tangentsOf(points) };
    })
    .filter((track) => track.points.length > 1));

  // Tangents are oriented along direction 0, so both directions of a route agree on "left" and "right".
  const cells = new Map<string, Sample[]>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / SHARED_RADIUS)}/${Math.floor(y / SHARED_RADIUS)}`;
  allTracks.forEach((track) => track.points.forEach(([x, y], index) => {
    const [tx, ty] = track.tangents[index];
    const tangent: Vec = track.directionId === 0 ? [tx, ty] : [-tx, -ty];
    const key = cellKey(x, y);
    const bucket = cells.get(key) ?? [];
    bucket.push({ routeId: track.routeId, directionId: track.directionId, x, y, tangent });
    cells.set(key, bucket);
  }));
  const nearbySamples = (x: number, y: number, visit: (sample: Sample, distance: number) => void) => {
    const cx = Math.floor(x / SHARED_RADIUS);
    const cy = Math.floor(y / SHARED_RADIUS);
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      cells.get(`${cx + dx}/${cy + dy}`)?.forEach((sample) => {
        const distance = Math.hypot(sample.x - x, sample.y - y);
        if (distance <= SHARED_RADIUS) visit(sample, distance);
      });
    }
  };

  // Direction 1 is drawn only where it leaves direction 0 (one-way streets, loops); elsewhere they coincide.
  const tracks: Track[] = allTracks.flatMap((track) => {
    if (track.directionId === 0) return [track];
    const covered = track.points.map(([x, y]) => {
      let hit = false;
      nearbySamples(x, y, (sample) => { if (sample.routeId === track.routeId && sample.directionId === 0) hit = true; });
      return hit;
    });
    const parts: Track[] = [];
    let start = -1;
    for (let index = 0; index <= covered.length; index += 1) {
      if (index < covered.length && !covered[index]) { if (start < 0) start = index; continue; }
      if (start >= 0) {
        // Keep one covered sample on each side so the detour visibly joins the main line.
        const from = Math.max(0, start - 1), to = Math.min(covered.length, index + 1);
        if (to - from > 2) parts.push({ ...track, points: track.points.slice(from, to), tangents: track.tangents.slice(from, to) });
        start = -1;
      }
    }
    return parts;
  });

  const noDemoService = Boolean(snapshot?.is_mock && snapshot.horizon === "day" &&
    snapshot.points.length && snapshot.points.every((point) => point.predicted_load === 0));
  const pointsByRoute = new Map<string, Array<{ point: MapForecastPoint; at: Vec }>>();
  snapshot?.points.forEach((point) => {
    const list = pointsByRoute.get(point.route_id) ?? [];
    list.push({ point, at: project(point.lon, point.lat) });
    pointsByRoute.set(point.route_id, list);
  });

  const result = tracks.map((track): SchematicTrack => {
    const offsets: Vec[] = track.points.map(([x, y], index) => {
      const own = track.tangents[index];
      const nearest = new Map<string, { distance: number; tangent: Vec }>();
      nearbySamples(x, y, (sample, distance) => {
        if (Math.abs(sample.tangent[0] * own[0] + sample.tangent[1] * own[1]) < PARALLEL) return;
        const best = nearest.get(sample.routeId);
        if (!best || distance < best.distance) nearest.set(sample.routeId, { distance, tangent: sample.tangent });
      });
      nearest.delete(track.routeId);
      if (!nearest.size) return [0, 0];
      const members = [track.routeId, ...nearest.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
      const anchor = members[0] === track.routeId
        ? (track.directionId === 0 ? own : [-own[0], -own[1]] as Vec)
        : nearest.get(members[0])!.tangent;
      const shift = (members.indexOf(track.routeId) - (members.length - 1) / 2) * LINE_GAP;
      return [-anchor[1] * shift, anchor[0] * shift];
    });

    const smoothed = offsets.map((_, index) => {
      let sx = 0, sy = 0, count = 0;
      for (let k = Math.max(0, index - SMOOTHING); k <= Math.min(offsets.length - 1, index + SMOOTHING); k += 1) {
        sx += offsets[k][0]; sy += offsets[k][1]; count += 1;
      }
      return [sx / count, sy / count] as Vec;
    });
    const shifted = track.points.map(([x, y], index) => [x + smoothed[index][0], y + smoothed[index][1]] as Vec);

    const routePoints = pointsByRoute.get(track.routeId) ?? [];
    const levels: Level[] = shifted.map(([x, y], index) => noDemoService ? "neutral" : snapshot && routePoints.length
      ? levelAt(track.points[index][0], track.points[index][1], routePoints, snapshot) : "route");
    const runs: SchematicRun[] = [];
    let start = 0;
    for (let index = 1; index <= shifted.length; index += 1) {
      if (index === shifted.length || levels[index] !== levels[start]) {
        // Runs share their boundary point so neighbouring colours join without gaps.
        runs.push({ level: levels[start], d: pathOf(shifted.slice(start, Math.min(index + 1, shifted.length))) });
        start = index;
      }
    }
    return { routeId: track.routeId, d: pathOf(shifted), runs };
  });

  return { tracks: result, project };
}
