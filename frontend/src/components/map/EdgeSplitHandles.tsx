import { useRef, useState } from "react";

export type SplitEdge = "left" | "right" | "top" | "bottom";

interface EdgeSplitHandlesProps {
  onSplit: (edge: SplitEdge) => void;
}

const edges: SplitEdge[] = ["left", "right", "top", "bottom"];
const labels: Record<SplitEdge, string> = {
  left: "Потяните правее для нового окна слева",
  right: "Потяните левее для нового окна справа",
  top: "Потяните ниже для нового окна сверху",
  bottom: "Потяните выше для нового окна снизу",
};

/** A small, focusable hit area on each edge; map space stays clear until a drag begins. */
export function EdgeSplitHandles({ onSplit }: EdgeSplitHandlesProps) {
  const start = useRef<{ edge: SplitEdge; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<SplitEdge | null>(null);

  const distance = (edge: SplitEdge, x: number, y: number) => {
    const point = start.current;
    if (!point) return 0;
    return edge === "left" ? x - point.x : edge === "right" ? point.x - x
      : edge === "top" ? y - point.y : point.y - y;
  };

  const reset = () => { start.current = null; setPreview(null); };

  return <div className="edge-split-layer" aria-label="Разделение карты перетаскиванием границ">
    {preview && <div className={`edge-split-preview edge-split-preview--${preview}`} aria-hidden="true">
      <span>Новое окно карты</span>
    </div>}
    {edges.map((edge) => <button key={edge} type="button" className={`edge-split-handle edge-split-handle--${edge}`}
      aria-label={labels[edge]} title={labels[edge]}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        start.current = { edge, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (start.current?.edge !== edge) return;
        setPreview(distance(edge, event.clientX, event.clientY) >= 48 ? edge : null);
      }}
      onPointerUp={(event) => {
        const create = start.current?.edge === edge && distance(edge, event.clientX, event.clientY) >= 48;
        reset();
        if (create) onSplit(edge);
      }}
      onPointerCancel={reset}
      onClick={(event) => {
        // Keyboard activation remains available even without a pointer drag.
        if (event.detail === 0) onSplit(edge);
      }} />)}
  </div>;
}
