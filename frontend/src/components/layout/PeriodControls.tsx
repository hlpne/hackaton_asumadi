import type { Horizon } from "../../types";
import { forecastPeriod } from "../../forecastPeriod";
import { horizons } from "../../constants";
import { DatePicker } from "./DatePicker";
import { YearPicker } from "./YearPicker";

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
          aria-pressed={horizon === item} onClick={() => onHorizonChange(item)}>{horizons[item]}</button>)}
      </div>
    </fieldset>
    {horizon === "year"
      ? <YearPicker label="Год" value={date} onChange={onDateChange} />
      : <DatePicker label={horizon === "month" ? "Начало периода" : "Дата"} value={date} onChange={onDateChange} />}
    <p className="period-note">{period.description}<br /><strong>{period.start}</strong> — <strong>{period.end}</strong></p>
  </div>;
}
