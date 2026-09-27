import assert from "node:assert/strict";
import test from "node:test";
import { findRouteIntersections } from "../src/components/map/routeIntersections.ts";
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
test("shared geometry produces one route-choice hub", () => {
  const hubs = findRouteIntersections([
    geometry("demo-1", [[37.6, 55.7], [37.61, 55.71]]),
    geometry("demo-2", [[37.6002, 55.7002], [37.62, 55.72]]),
  ]);
  assert.equal(hubs.length, 1);
  assert.deepEqual(hubs[0].routeIds, ["demo-1", "demo-2"]);
});

test("separate routes do not create a false menu", () => {
  const hubs = findRouteIntersections([
    geometry("demo-1", [[37.5, 55.5], [37.51, 55.51]]),
    geometry("demo-2", [[37.7, 55.7], [37.71, 55.71]]),
  ]);
  assert.deepEqual(hubs, []);
});
