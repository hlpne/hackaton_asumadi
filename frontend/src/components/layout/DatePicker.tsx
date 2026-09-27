import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarBlankIcon, CaretDoubleLeftIcon, CaretDoubleRightIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

interface DatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}

const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const compactFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function DatePicker({ label, value, onChange, min = "2000-01-01", max = "2098-12-31" }: DatePickerProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 330 });
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseDate(value);
    return new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
  });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(330, window.innerWidth - 24);
      const height = popover.current?.offsetHeight ?? 360;
      const below = bounds.bottom + height + 12 <= window.innerHeight;
      setPosition({
        top: below ? bounds.bottom + 7 : Math.max(12, bounds.top - height - 7),
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
        width,
      });
    };
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open, visibleMonth]);

  const firstWeekday = (visibleMonth.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) =>
    new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth(), index - firstWeekday + 1)));
  const monthStart = dateKey(visibleMonth);
  const monthEnd = dateKey(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 0)));
  const changeMonth = (offset: number) => setVisibleMonth(new Date(Date.UTC(
    visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + offset, 1,
  )));

  return <div className="date-field" ref={root}>
    <span id={id} className="field-label">{label}</span>
    <button type="button" className="date-trigger" aria-labelledby={id} aria-expanded={open}
      aria-haspopup="dialog" onClick={() => {
        if (!open && value) {
          const selected = parseDate(value);
          setVisibleMonth(new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1)));
        }
        setOpen(!open);
      }}>
      <span>{value ? compactFormatter.format(parseDate(value)) : "Выберите дату"}</span>
      <CalendarBlankIcon size={20} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={popover} className="date-popover date-popover--portal" style={position}
      role="dialog" aria-label={`Календарь: ${label}`}>
      <div className="date-nav">
        <button type="button" aria-label="Предыдущий год" onClick={() => changeMonth(-12)} disabled={monthStart.slice(0, 4) <= min.slice(0, 4)}><CaretDoubleLeftIcon /></button>
        <button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)} disabled={monthStart <= min.slice(0, 7) + "-01"}><CaretLeftIcon /></button>
        <strong>{monthFormatter.format(visibleMonth)}</strong>
        <button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)} disabled={monthEnd >= max}><CaretRightIcon /></button>
        <button type="button" aria-label="Следующий год" onClick={() => changeMonth(12)} disabled={monthEnd.slice(0, 4) >= max.slice(0, 4)}><CaretDoubleRightIcon /></button>
      </div>
      <div className="date-grid">
        {weekdays.map((weekday) => <span className="date-weekday" key={weekday}>{weekday}</span>)}
        {cells.map((cell) => {
          const day = dateKey(cell);
          const otherMonth = cell.getUTCMonth() !== visibleMonth.getUTCMonth();
          return <button key={day} type="button" disabled={day < min || day > max}
            className={`date-day${otherMonth ? " date-day--outside" : ""}${day === today ? " date-day--today" : ""}${day === value ? " date-day--selected" : ""}`}
            aria-label={dateFormatter.format(cell)} aria-pressed={day === value}
            onClick={() => { onChange(day); setOpen(false); }}>{cell.getUTCDate()}</button>;
        })}
      </div>
    </div>, document.body)}
  </div>;
}
