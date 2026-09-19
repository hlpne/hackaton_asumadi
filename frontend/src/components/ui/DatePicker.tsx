import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ru } from "date-fns/locale";
import "react-day-picker/style.css";

interface DatePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

const displayFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatRange(range: DateRange | undefined): string {
  if (!range?.from) return "Выберите период";
  if (!range.to) return `${displayFormatter.format(range.from)} — …`;
  return `${displayFormatter.format(range.from)} — ${displayFormatter.format(range.to)}`;
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="date-picker" ref={ref}>
      <button
        type="button"
        className="date-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{formatRange(value)}</span>
        <span className="date-picker-icon" aria-hidden="true">📅</span>
      </button>

      {open && (
        <div className="date-picker-popover" role="dialog">
          <DayPicker
            mode="range"
            locale={ru}
            weekStartsOn={1}
            numberOfMonths={1}
            selected={value}
            onSelect={onChange}
            defaultMonth={value?.from ?? new Date()}
            showOutsideDays
          />
          <div className="date-picker-actions">
            <button
              type="button"
              className="date-picker-action"
              onClick={() => {
                const today = new Date();
                const nextMonth = new Date(today);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                onChange({ from: today, to: nextMonth });
              }}
            >
              +1 месяц
            </button>
            <button
              type="button"
              className="date-picker-action"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Сбросить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}