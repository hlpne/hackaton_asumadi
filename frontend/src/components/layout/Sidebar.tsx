import type { FormEvent } from "react";
import type { Horizon, Route, RouteStop } from "../../types";
import { horizons } from "../../constants";

interface SidebarProps {
  routes: Route[];
  stops: RouteStop[];
  routeId: string;
  stopId: string;
  horizon: Horizon;
  date: string;
  dateFrom: string;
  dateTo: string;
  busy: boolean;
  loadingCatalog: boolean;
  loadingStops: boolean;
  onRouteChange: (id: string) => void;
  onStopChange: (id: string) => void;
  onHorizonChange: (horizon: Horizon) => void;
  onDateChange: (date: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function Sidebar({
  routes,
  stops,
  routeId,
  stopId,
  horizon,
  date,
  dateFrom,
  dateTo,
  busy,
  loadingCatalog,
  loadingStops,
  onRouteChange,
  onStopChange,
  onHorizonChange,
  onDateChange,
  onDateFromChange,
  onDateToChange,
  onSubmit,
}: SidebarProps) {
  const uniqueStops = [...new Map(stops.map((stop) => [stop.id, stop])).values()];
  const isMonth = horizon === "month";

  return (
    <form
      onSubmit={onSubmit}
      className="filters"
      aria-label="Параметры прогноза"
    >
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
        Остановка
        <select
          value={stopId}
          disabled={loadingStops || !routeId}
          onChange={(event) => onStopChange(event.target.value)}
        >
          <option value="">Весь маршрут</option>
          {uniqueStops.map((stop) => (
            <option key={stop.id} value={stop.id}>
              {stop.name}
            </option>
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

      {isMonth ? (
        <label className="period-label">
          Период
          <div className="period-fields">
            <input
              type="date"
              min="2000-01-01"
              max="2098-12-31"
              value={dateFrom}
              onChange={(event) => onDateFromChange(event.target.value)}
              aria-label="Начало периода"
              required
            />
            <span className="period-sep">—</span>
            <input
              type="date"
              min="2000-01-01"
              max="2098-12-31"
              value={dateTo}
              onChange={(event) => onDateToChange(event.target.value)}
              aria-label="Конец периода"
              required
            />
          </div>
        </label>
      ) : (
        <label>
          Дата
          <input
            type="date"
            min="2000-01-01"
            max="2098-12-31"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            required
          />
        </label>
      )}

      <button
        type="submit"
        disabled={!routeId || (!isMonth && !date) || busy || loadingStops}
      >
        {busy ? "Загрузка…" : "Получить прогноз"}
      </button>

      <p className="period-note">
        {isMonth
          ? "Укажите начало и конец периода."
          : "Прогноз начинается с выбранной даты."}
      </p>
    </form>
  );
}