import assert from "node:assert/strict";
import test from "node:test";
import { routesNearPoint } from "../src/components/map/routeIntersections.ts";
import type { RouteGeometry } from "../src/types.ts";

const geometry = (routeId: string, coordinates: Array<[number, number]>): RouteGeometry => ({
  route_id: routeId,
  direction_id: 0,
  source: "test",
  license: "test",
  attribution_url: "https://example.test",
  osm_relation_id: 1,
  lines: [coordinates],
});
test("hover finds both routes along overlapping segments, including between vertices", () => {
  const routes = routesNearPoint([
    geometry("demo-1", [[0, 0], [10, 0]]),
    geometry("demo-2", [[0, 1], [10, 1]]),
    geometry("demo-3", [[0, 12], [10, 12]]),
  ], [5, 0], (x, y) => [x, y], 2);
  assert.deepEqual(routes, ["demo-1", "demo-2"]);
});

test("hover does not include distant routes", () => {
  const routes = routesNearPoint([
    geometry("demo-1", [[0, 0], [10, 0]]),
    geometry("demo-2", [[0, 10], [10, 10]]),
  ], [5, 0], (x, y) => [x, y], 2);
  assert.deepEqual(routes, ["demo-1"]);
});
