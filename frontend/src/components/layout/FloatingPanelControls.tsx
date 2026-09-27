import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

const MIN_WIDTH = 470;
const MAX_WIDTH = 720;
const MIN_MAP_WIDTH = 360;
const STEP = 20;

function clampWidth(width: number, containerWidth: number): number {
  return Math.min(Math.max(MIN_WIDTH, containerWidth - MIN_MAP_WIDTH), Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)));
}

export function useFloatingPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [width, setWidth] = useState(510);
  const [hidden, setHidden] = useState(false);

  const changeWidth = (nextWidth: number) => {
    setWidth(clampWidth(nextWidth, containerRef.current?.getBoundingClientRect().width ?? window.innerWidth));
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (bounds) changeWidth(bounds.right - 14 - event.clientX);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    containerRef,
    hidden,
    width,
    style: { "--panel-width": `${width}px` } as CSSProperties,
    toggle: () => setHidden((value) => !value),
    changeWidth,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

export function FloatingPanelControls({ panel }: { panel: ReturnType<typeof useFloatingPanel> }) {
  return <>
    {panel.hidden && <FloatingPanelToggle panel={panel} />}
    {!panel.hidden && <button type="button" className="floating-panel-resize" aria-label="Изменить ширину правой панели"
      title="Перетащите для изменения ширины. Стрелки — шаг 20 пикселей."
      onPointerDown={panel.onPointerDown} onPointerMove={panel.onPointerMove}
      onPointerUp={panel.onPointerUp} onPointerCancel={panel.onPointerUp}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { panel.changeWidth(panel.width + STEP); event.preventDefault(); }
        if (event.key === "ArrowRight") { panel.changeWidth(panel.width - STEP); event.preventDefault(); }
        if (event.key === "Home") { panel.changeWidth(MIN_WIDTH); event.preventDefault(); }
        if (event.key === "End") { panel.changeWidth(MAX_WIDTH); event.preventDefault(); }
      }}>
      <span aria-hidden="true">⋮</span>
    </button>}
  </>;
}

export function FloatingPanelToggle({ panel }: { panel: ReturnType<typeof useFloatingPanel> }) {
  return <button type="button" className="floating-panel-toggle" onClick={panel.toggle}
    aria-expanded={!panel.hidden} aria-label={panel.hidden ? "Показать интерфейс" : "Скрыть интерфейс"}
    title={panel.hidden ? "Показать интерфейс" : "Скрыть интерфейс"}>
    {panel.hidden ? <EyeIcon weight="bold" aria-hidden="true" /> : <EyeSlashIcon weight="bold" aria-hidden="true" />}
  </button>;
}
