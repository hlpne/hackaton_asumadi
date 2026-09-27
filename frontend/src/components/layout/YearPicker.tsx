import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

interface YearPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}
export function YearPicker({ label, value, onChange, min = 2025, max = 2035 }: YearPickerProps) {
  const current = Number(value.slice(0, 4)) || new Date().getFullYear();
  const select = (year: number) => onChange(`${year}-01-01`);
  return <div className="year-field">
    <span className="field-label">{label}</span>
    <div className="year-picker" role="group" aria-label={label}>
      <button type="button" aria-label="Предыдущий год" disabled={current <= min} onClick={() => select(current - 1)}><CaretLeftIcon weight="bold" /></button>
      <strong>{current}</strong>
      <button type="button" aria-label="Следующий год" disabled={current >= max} onClick={() => select(current + 1)}><CaretRightIcon weight="bold" /></button>
    </div>
  </div>;
}
