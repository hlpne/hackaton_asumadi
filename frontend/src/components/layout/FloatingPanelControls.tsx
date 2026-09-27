import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

const STEP = 20;
const FULL_LIMITS = { min: 470, max: 720, minMap: 360 };
// Split windows are narrow, so the panel may shrink further and the map keeps less room.
const SPLIT_LIMITS = { min: 220, max: 560, minMap: 200 };

export function useFloatingPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Distance between the pointer and the panel edge when the drag started; null when not dragging.
  const dragOffset = useRef<number | null>(null);
  // null keeps the CSS default width until the dispatcher resizes the panel.
  const [width, setWidth] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  const limits = () => containerRef.current?.closest(".split-pane") ? SPLIT_LIMITS : FULL_LIMITS;
  const panelElement = () => containerRef.current?.querySelector<HTMLElement>(":scope > aside") ?? null;

  const currentWidth = () => width ?? panelElement()?.getBoundingClientRect().width ?? FULL_LIMITS.min;

  const changeWidth = (nextWidth: number) => {
    const { min, max, minMap } = limits();
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const upper = Math.max(min, Math.min(max, containerWidth - minMap));
    setWidth(Math.round(Math.min(upper, Math.max(min, nextWidth))));
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const bounds = panelElement()?.getBoundingClientRect();
    if (!bounds) return;
    dragOffset.current = bounds.right - event.clientX - bounds.width;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragOffset.current === null) return;
    const bounds = panelElement()?.getBoundingClientRect();
    if (bounds) changeWidth(bounds.right - event.clientX - dragOffset.current);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    dragOffset.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    containerRef,
    hidden,
    style: (width === null ? {} : { "--panel-width": `${width}px` }) as CSSProperties,
    toggle: () => setHidden((value) => !value),
    currentWidth,
    changeWidth,
    limits,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

/** A slim rail on the panel's left edge: collapse/expand the panel and drag to resize it. */
export function FloatingPanelControls({ panel }: { panel: ReturnType<typeof useFloatingPanel> }) {
  const label = panel.hidden ? "Показать панель" : "Скрыть панель";
  return <div className={`floating-panel-rail${panel.hidden ? " floating-panel-rail--collapsed" : ""}`}>
    <button type="button" className="floating-panel-toggle" onClick={panel.toggle}
      aria-expanded={!panel.hidden} aria-label={label} title={label}>
      {panel.hidden ? <><CaretLeftIcon weight="bold" aria-hidden="true" /><span>Показать панель</span></> : <CaretRightIcon weight="bold" aria-hidden="true" />}
    </button>
    {!panel.hidden && <button type="button" className="floating-panel-resize" aria-label="Изменить ширину правой панели"
      title="Перетащите для изменения ширины. Стрелки — шаг 20 пикселей."
      onPointerDown={panel.onPointerDown} onPointerMove={panel.onPointerMove}
      onPointerUp={panel.onPointerUp} onPointerCancel={panel.onPointerUp}
      onKeyDown={(event) => {
        const { min, max } = panel.limits();
        const next = event.key === "ArrowLeft" ? panel.currentWidth() + STEP
          : event.key === "ArrowRight" ? panel.currentWidth() - STEP
            : event.key === "Home" ? min : event.key === "End" ? max : null;
        if (next === null) return;
        panel.changeWidth(next);
        event.preventDefault();
      }}>
      <span aria-hidden="true">⋮</span>
    </button>}
  </div>;
}
