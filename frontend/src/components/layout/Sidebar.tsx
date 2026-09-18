import type { Horizon, Route, RouteStop } from "../../types";
import { horizons } from "../../constants";

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

function changeTimePart(time: string, part: "hour" | "minute", value: string): string {
  const [hour, minute] = time.split(":");
  return part === "hour" ? `${value}:${minute}` : `${hour}:${value}`;
}

interface SidebarProps {
  routes: Route[];
  stops: RouteStop[];
  routeId: string;
  fromStopId: string;
  toStopId: string;
  horizon: Horizon;
  date: string;
  startTime: string;
  endTime: string;
  busy: boolean;
  loadingCatalog: boolean;
  loadingStops: boolean;
  onRouteChange: (id: string) => void;
  onFromStopChange: (id: string) => void;
  onToStopChange: (id: string) => void;
  onHorizonChange: (horizon: Horizon) => void;
  onDateChange: (date: string) => void;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  onRefresh: () => void;
}

export function Sidebar({
  routes,
  stops,
  routeId,
  fromStopId,
  toStopId,
  horizon,
  date,
  startTime,
  endTime,
  busy,
  loadingCatalog,
  loadingStops,
  onRouteChange,
  onFromStopChange,
  onToStopChange,
  onHorizonChange,
  onDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onRefresh,
}: SidebarProps) {
  const fromStop = stops.find((stop) => stop.id === fromStopId);
  const toOptions = fromStop
    ? stops.filter((stop) => stop.direction_id === fromStop.direction_id && stop.sequence > fromStop.sequence)
      .sort((a, b) => a.sequence - b.sequence)
    : [];
  const minuteTime = /^([01]\d|2[0-3]):[0-5]\d$/;
  const invalidTimeRange = horizon === "day" &&
    (!minuteTime.test(startTime) || !minuteTime.test(endTime) || startTime >= endTime);

  return (
    <section className="filters" aria-label="Параметры прогноза">
      <label>
        Маршрут
        <select
          value={routeId}
          disabled={loadingCatalog || !routes.length}
          onChange={(event) => onRouteChange(event.target.value)}
          required
        >
          {!routes.length && (
            <option value="">
              {loadingCatalog ? "Загрузка…" : "Нет маршрутов"}
            </option>
          )}
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        От остановки
        <select
          value={fromStopId}
          disabled={loadingStops || !routeId}
          onChange={(event) => onFromStopChange(event.target.value)}
        >
          <option value="">Весь маршрут</option>
          {([0, 1] as const).map((direction) => (
            <optgroup key={direction} label={`Направление ${direction + 1}`}>
              {stops.filter((stop) => stop.direction_id === direction)
                .sort((a, b) => a.sequence - b.sequence).map((stop) => (
                  <option key={stop.id} value={stop.id}>{stop.name}</option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label>
        До остановки
        <select value={toStopId} disabled={loadingStops || !fromStop || !toOptions.length}
          onChange={(event) => onToStopChange(event.target.value)}>
          <option value="">{fromStop ? "Выберите конечную" : "Сначала выберите «От»"}</option>
          {toOptions.map((stop) => (
            <option key={stop.id} value={stop.id}>{stop.name}</option>
          ))}
        </select>
      </label>

      <label>
        Горизонт
        <select
          value={horizon}
          onChange={(event) => onHorizonChange(event.target.value as Horizon)}
        >
          {Object.entries(horizons).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Дата начала
        <input
          type="date"
          min="2000-01-01"
          max="2098-12-31"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          required
        />
      </label>

      {horizon === "day" && (
        <>
          <div className="time-group" role="group" aria-label="Время начала, МСК">
            <span>С, МСК</span>
            <div className="time-fields">
              <select aria-label="Часы начала" value={startTime.slice(0, 2)}
                onChange={(event) => onStartTimeChange(changeTimePart(startTime, "hour", event.target.value))}>
                {hours.map((hour) => <option key={hour} value={hour}>{Number(hour)} ч</option>)}
              </select>
              <select aria-label="Минуты начала" value={startTime.slice(3, 5)}
                onChange={(event) => onStartTimeChange(changeTimePart(startTime, "minute", event.target.value))}>
                {minutes.map((minute) => <option key={minute} value={minute}>{Number(minute)} мин</option>)}
              </select>
            </div>
          </div>
          <div className="time-group" role="group" aria-label="Время окончания, МСК">
            <span>До, МСК</span>
            <div className="time-fields">
              <select aria-label="Часы окончания" value={endTime.slice(0, 2)}
                onChange={(event) => onEndTimeChange(changeTimePart(endTime, "hour", event.target.value))}>
                {hours.map((hour) => <option key={hour} value={hour}>{Number(hour)} ч</option>)}
              </select>
              <select aria-label="Минуты окончания" value={endTime.slice(3, 5)}
                onChange={(event) => onEndTimeChange(changeTimePart(endTime, "minute", event.target.value))}>
                {minutes.map((minute) => <option key={minute} value={minute}>{Number(minute)} мин</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={!routeId || !date || invalidTimeRange || busy || loadingStops}
      >
        {busy ? "Загрузка…" : "Повторить"}
      </button>

      <p className="period-note" role={invalidTimeRange ? "alert" : undefined}>
        {invalidTimeRange
          ? "Время «До» должно быть позже времени «С» в пределах выбранного дня."
          : horizon === "day"
            ? "Часы и минуты выбираются отдельно. Рейсы с 5:00 до 1:00 МСК — условный график для демо, не официальное расписание."
            : "Фильтры применяются автоматически. Для месяца и года период начинается с первого числа выбранного месяца."}
      </p>
    </section>
  );
}
