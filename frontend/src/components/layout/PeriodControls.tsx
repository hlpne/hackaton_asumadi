import type { Horizon } from "../../types";
import { forecastPeriod, MODEL_LAST_MONTH_START, MODEL_START_DATE, MODEL_END_DATE, modelDate } from "../../forecastPeriod";
import { horizons } from "../../constants";
import { DatePicker } from "./DatePicker";

interface PeriodControlsProps {
  horizon: Horizon;
  date: string;
  onHorizonChange: (horizon: Horizon) => void;
  onDateChange: (date: string) => void;
  compact?: boolean;
}
export function PeriodControls({ horizon, date, onHorizonChange, onDateChange, compact = false }: PeriodControlsProps) {
  const period = forecastPeriod(date, horizon);
  return <div className={`period-control${compact ? " period-control--compact" : ""}`}>
    <fieldset className="horizon-switch">
      <legend>Горизонт прогноза</legend>
      <div>
        {(Object.keys(horizons) as Horizon[]).map((item) => <button key={item} type="button"
          className={horizon === item ? "horizon-option horizon-option--active" : "horizon-option"}
          aria-pressed={horizon === item} disabled={item === "year"}
          title={item === "year" ? "Годовой прогноз пока недоступен" : undefined}
          onClick={() => {
            onHorizonChange(item);
            const valid = modelDate(date, item);
            if (valid !== date) onDateChange(valid);
          }}>{horizons[item]}</button>)}
      </div>
    </fieldset>
    <DatePicker label={horizon === "day" ? "Дата" : "Начало периода"} value={date} onChange={onDateChange}
      min={MODEL_START_DATE} max={horizon === "month" ? MODEL_LAST_MONTH_START : MODEL_END_DATE} />
    <p className="period-note">До 31.12.2025 — финальный прогноз; с 01.01.2026 — экстраполяция ML<br />{period.description}<br /><strong>{period.start}</strong> — <strong>{period.end}</strong></p>
  </div>;
}
