import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface WheelOption {
  value: string;
  label: string;
  meta?: string;
  color?: string;
}
interface WheelPickerProps {
  label: string;
  value: string;
  options: WheelOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inline?: boolean;
}

const ITEM_HEIGHT = 48;
const WHEEL_STEP_DELAY = 145;

export function WheelPicker({ label, value, options, onChange, placeholder = "Не выбрано", disabled = false, inline = false }: WheelPickerProps) {
  const labelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const highlightedRef = useRef(0);
  const wheelAction = useRef<(direction: number) => void>(() => {});
  const lastWheelStep = useRef(0);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 330 });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  highlightedRef.current = highlightedIndex;
  const selected = options.find((option) => option.value === value);

  const scrollToIndex = (index: number, behavior: ScrollBehavior = "smooth") => {
    list.current?.scrollTo({ top: Math.max(0, index - 1) * ITEM_HEIGHT, behavior });
  };

  useEffect(() => {
    if (!open && !inline) return;
    highlightedRef.current = selectedIndex;
    setHighlightedIndex(selectedIndex);
    const frame = requestAnimationFrame(() => scrollToIndex(selectedIndex, "instant"));
    const closeOnOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    if (!inline) {
      document.addEventListener("pointerdown", closeOnOutside);
      document.addEventListener("keydown", closeOnEscape);
    }
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, inline, selectedIndex]);

  useEffect(() => {
    if (!open || inline) return;
    const place = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(Math.max(bounds.width, 330), window.innerWidth - 24);
      setPosition({
        top: bounds.bottom + 300 > window.innerHeight ? Math.max(12, bounds.top - 300) : bounds.bottom + 7,
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)), width,
      });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true); };
  }, [open, inline]);

  /** Moves the highlight only; nothing is selected until the dispatcher clicks or presses Enter. */
  const highlight = (index: number, behavior: ScrollBehavior = "smooth") => {
    const next = Math.max(0, Math.min(options.length - 1, index));
    highlightedRef.current = next;
    setHighlightedIndex(next);
    scrollToIndex(next, behavior);
  };

  const chooseIndex = (index: number, close = false) => {
    highlight(index);
    const next = highlightedRef.current;
    if (options[next] && options[next].value !== value) onChange(options[next].value);
    if (close) setOpen(false);
  };

  wheelAction.current = (direction) => {
    const now = performance.now();
    if (now - lastWheelStep.current < WHEEL_STEP_DELAY) return;
    lastWheelStep.current = now;
    highlight(highlightedRef.current + direction, "instant");
  };

  useEffect(() => {
    const element = list.current;
    if ((!open && !inline) || !element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY) wheelAction.current(Math.sign(event.deltaY));
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [open, inline]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else highlight(highlightedIndex + (event.key === "ArrowDown" ? 1 : -1));
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      chooseIndex(highlightedIndex, true);
    }
  };

  const wheelContents = <>
    <div className="wheel-caption"><span>{label}</span><small>Прокрутите и выберите нужный вариант</small></div>
    <div ref={list} className="wheel-list" role="listbox" aria-labelledby={labelId}
      style={{ height: Math.min(options.length * ITEM_HEIGHT + 12, 240) }}
      aria-activedescendant={options[highlightedIndex] ? `${labelId}-${highlightedIndex}` : undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          highlight(highlightedIndex + (event.key === "ArrowDown" ? 1 : -1));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          chooseIndex(highlightedIndex, !inline);
        }
      }}>
      {options.map((option, index) => <button id={`${labelId}-${index}`} key={option.value} type="button"
        role="option" aria-selected={option.value === value}
        className={`wheel-option${index === highlightedIndex ? " wheel-option--active" : ""}`}
        onClick={() => chooseIndex(index, !inline)}>
        <span className="wheel-option-label">{option.color && <i style={{ background: option.color }} aria-hidden="true" />}<span>{option.label}</span></span>
        {option.meta && <small>{option.meta}</small>}
        {option.value === value && <CheckIcon weight="bold" aria-hidden="true" />}
      </button>)}
    </div>
  </>;

  return <div className="wheel-field" ref={root}>
    {/* An inline wheel shows its label in the caption; keep this one for screen readers only. */}
    <span id={labelId} className={inline ? "sr-only" : "field-label"}>{label}</span>
    {!inline && <button type="button" className="wheel-trigger" disabled={disabled || !options.length}
      aria-labelledby={labelId} aria-haspopup="listbox" aria-expanded={open}
      onKeyDown={handleTriggerKeyDown} onClick={() => setOpen((current) => !current)}>
      <span className="wheel-trigger-value">
        {selected?.color && <i style={{ background: selected.color }} aria-hidden="true" />}
        <span>{selected?.label ?? placeholder}</span>
      </span>
      <CaretDownIcon weight="bold" aria-hidden="true" />
    </button>}
    {(open || inline) && (inline ? <div ref={popover} className="wheel-popover wheel-popover--inline">
      {wheelContents}
    </div> : createPortal(<div ref={popover} className="wheel-popover wheel-popover--portal" style={position}>
      {wheelContents}
    </div>, document.body))}
  </div>;
}
