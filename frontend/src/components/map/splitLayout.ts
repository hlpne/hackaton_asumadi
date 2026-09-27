import type { SplitEdge } from "./EdgeSplitHandles";

export type LayoutNode = { kind: "pane"; id: number } | {
  kind: "branch"; axis: "column" | "row"; ratio: number; first: LayoutNode; second: LayoutNode;
};
export type Side = "first" | "second";
const pane = (id: number): LayoutNode => ({ kind: "pane", id });
const branch = (axis: "column" | "row", first: LayoutNode, second: LayoutNode, ratio = 50): LayoutNode =>
  ({ kind: "branch", axis, ratio, first, second });
export const paneIds = (node: LayoutNode): number[] => node.kind === "pane" ? [node.id] : [...paneIds(node.first), ...paneIds(node.second)];

export function initialLayout(count: 2 | 3 | 4, edge: SplitEdge): LayoutNode {
  const first = branch(edge === "left" || edge === "right" ? "column" : "row",
    edge === "left" || edge === "top" ? pane(1) : pane(0),
    edge === "left" || edge === "top" ? pane(0) : pane(1));
  if (count === 2) return first;
  if (count === 3) return branch("column", pane(0), branch("row", pane(1), pane(2)));
  return branch("column", branch("row", pane(0), pane(2)), branch("row", pane(1), pane(3)));
}

export function savedLayout(count: 2 | 3 | 4, edge: SplitEdge, key = "splitLayout"): LayoutNode {
  try {
    const raw = new URLSearchParams(window.location.search).get(key);
    if (!raw) return initialLayout(count, edge);
    const node: unknown = JSON.parse(raw);
    const valid = (item: unknown, depth: number): item is LayoutNode => {
      if (!item || typeof item !== "object" || depth > 3) return false;
      const value = item as Record<string, unknown>;
      if (value.kind === "pane") return Number.isInteger(value.id) && Number(value.id) >= 0 && Number(value.id) < 4;
      return value.kind === "branch" && (value.axis === "row" || value.axis === "column") &&
        typeof value.ratio === "number" && value.ratio >= 25 && value.ratio <= 75 &&
        valid(value.first, depth + 1) && valid(value.second, depth + 1);
    };
    if (valid(node, 0)) {
      const ids = paneIds(node);
      if (ids.length === count && new Set(ids).size === count) return node;
    }
  } catch { /* Invalid or stale URL layout: use the regular two-pane view. */ }
  return initialLayout(count, edge);
}

export function insertPane(node: LayoutNode, target: number, edge: SplitEdge, id: number): LayoutNode {
  if (node.kind === "pane") {
    if (node.id !== target) return node;
    const before = edge === "left" || edge === "top";
    return branch(edge === "left" || edge === "right" ? "column" : "row",
      before ? pane(id) : node, before ? node : pane(id));
  }
  return { ...node, first: insertPane(node.first, target, edge, id), second: insertPane(node.second, target, edge, id) };
}

export function removePane(node: LayoutNode, target: number): LayoutNode {
  if (node.kind === "pane") return node;
  if (node.first.kind === "pane" && node.first.id === target) return node.second;
  if (node.second.kind === "pane" && node.second.id === target) return node.first;
  return { ...node, first: removePane(node.first, target), second: removePane(node.second, target) };
}

export function resizeBranch(node: LayoutNode, path: Side[], ratio: number): LayoutNode {
  if (node.kind === "pane") return node;
  if (!path.length) return { ...node, ratio };
  const [side, ...rest] = path;
  return { ...node, [side]: resizeBranch(node[side], rest, ratio) };
}
