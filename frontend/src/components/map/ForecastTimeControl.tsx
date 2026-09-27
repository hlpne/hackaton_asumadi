import { useId } from "react";
import type { ForecastPoint, Horizon } from "../../types";

interface ForecastTimeControlProps {
  points: ForecastPoint[];
  selectedIndex: number;
  onChange: (index: number) => void;
  horizon: Horizon;
  validations: number;
  color?: string;
  scope: string;
}

const validationNumber = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const dayLabel = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });
const hourLabel = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });

export function ForecastTimeControl({ points, selectedIndex, onChange, horizon, validations, color, scope }: ForecastTimeControlProps) {
  const sliderId = useId();
  const point = points[selectedIndex];
  if (!point || horizon === "year") return null;
  const timestamp = new Date(point.timestamp);
  const timeLabel = horizon === "day"
    ? `${hourLabel.format(timestamp)}–${hourLabel.format(new Date(timestamp.getTime() + 3_600_000))}`
    : dayLabel.format(timestamp);

  return <div className="map-time-control">
    <label htmlFor={sliderId}>{horizon === "day" ? "Час прогноза" : "День прогноза"}</label>
    <strong>{timeLabel}</strong>
    <input id={sliderId} type="range" min={0} max={points.length - 1} value={selectedIndex}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-valuetext={`${timeLabel}: ${validationNumber.format(validations)} валидаций`} />
    <small><b style={{ color }}>{validationNumber.format(validations)}</b> валидаций · {scope}</small>
  </div>;
}
