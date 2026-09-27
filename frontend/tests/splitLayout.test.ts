import assert from "node:assert/strict";
import test from "node:test";
import { initialLayout, insertPane, paneIds, removePane, resizeBranch } from "../src/components/map/splitLayout.ts";

test("dragging each outside edge creates a sibling on the expected side", () => {
  for (const edge of ["left", "right", "top", "bottom"] as const) {
    const layout = initialLayout(2, edge);
    assert.equal(layout.kind, "branch");
    if (layout.kind !== "branch") continue;
    assert.equal(layout.axis, edge === "left" || edge === "right" ? "column" : "row");
    assert.deepEqual(paneIds(layout), edge === "left" || edge === "top" ? [1, 0] : [0, 1]);
  }
});

test("a pane can split again and closing it collapses only its divider", () => {
  const two = initialLayout(2, "right");
  const three = insertPane(two, 1, "bottom", 2);
  assert.deepEqual(paneIds(three), [0, 1, 2]);
  assert.deepEqual(paneIds(removePane(three, 1)), [0, 2]);
  assert.deepEqual(paneIds(removePane(three, 2)), [0, 1]);
  const four = insertPane(three, 0, "left", 3);
  assert.deepEqual(paneIds(four), [3, 0, 1, 2]);
});

test("resizing a nested divider preserves the adjacent panes", () => {
  const three = insertPane(initialLayout(2, "right"), 1, "bottom", 2);
  const resized = resizeBranch(three, ["second"], 62);
  assert.equal(resized.kind, "branch");
  if (resized.kind !== "branch") return;
  assert.equal(resized.ratio, 50);
  assert.equal(resized.second.kind, "branch");
  if (resized.second.kind !== "branch") return;
  assert.equal(resized.second.ratio, 62);
  assert.deepEqual(paneIds(resized), [0, 1, 2]);
});
