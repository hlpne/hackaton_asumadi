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
  busy: boolean;
  loadingCatalog: boolean;
  loadingStops: boolean;
  onRouteChange: (id: string) => void;
  onStopChange: (id: string) => void;
  onHorizonChange: (horizon: Horizon) => void;
  onDateChange: (date: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function Sidebar({
  routes,
  stops,
  routeId,
  stopId,
  horizon,
  date,
  busy,
  loadingCatalog,
  loadingStops,
  onRouteChange,
  onStopChange,
  onHorizonChange,
  onDateChange,
  onSubmit,
}: SidebarProps) {
  const uniqueStops = [...new Map(stops.map((stop) => [stop.id, stop])).values()];

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

      <button
        type="submit"
        disabled={!routeId || !date || busy || loadingStops}
      >
        {busy ? "Загрузка…" : "Получить прогноз"}
      </button>

      <p className="period-note">
        Для месяца и года период начинается с первого числа выбранного месяца.
      </p>
    </form>
  );
}