import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_ROUTE_IDS, supportedRoutes } from "../src/supportedRoutes.ts";

test("current UI exposes exactly nine approved routes", () => {
  assert.equal(SUPPORTED_ROUTE_IDS.length, 9);
  const catalog = [...SUPPORTED_ROUTE_IDS, "demo-5", "demo-17"].map((id) => ({ id, name: id, color: "#000000" }));
  assert.deepEqual(supportedRoutes(catalog).map((route) => route.id), [...SUPPORTED_ROUTE_IDS]);
});
