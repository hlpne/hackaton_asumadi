import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_ROUTE_IDS, supportedRoutes } from "../src/supportedRoutes.ts";

test("current UI exposes the nine routes present in training labels", () => {
  assert.deepEqual([...SUPPORTED_ROUTE_IDS], [
    "demo-1", "demo-7", "demo-11", "demo-12", "demo-17",
    "demo-25", "demo-26", "demo-28", "demo-50",
  ]);
  const catalog = [...SUPPORTED_ROUTE_IDS, "demo-5", "demo-t1"].map((id) => ({ id, name: id, color: "#000000" }));
  assert.deepEqual(supportedRoutes(catalog).map((route) => route.id), [...SUPPORTED_ROUTE_IDS]);
});
