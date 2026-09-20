import type { Horizon, Route, RouteStop } from "../../types";
import { horizons } from "../../constants";

interface SidebarProps {
  mode?: "details" | "analytics";
  routes: Route[];
  stops: RouteStop[];
  routeId: string;
  directionId: 0 | 1;
  fromStopId: string;
  toStopId: string;
  horizon: Horizon;
  date: string;
  dateFrom: string;
  dateTo: string;
  monthPeriodValid: boolean;
  startTime: string;
  busy: boolean;
  loadingCatalog: boolean;
  loadingStops: boolean;
  onRouteChange: (id: string) => void;
  onDirectionChange: (id: 0 | 1) => void;
  onFromStopChange: (id: string) => void;
  onToStopChange: (id: string) => void;
  onHorizonChange: (horizon: Horizon) => void;
  onDateChange: (date: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onStartTimeChange: (time: string) => void;
  onRefresh: () => void;
}

export function Sidebar({
  mode = "details",
  routes,
  stops,
  routeId,
  directionId,
  fromStopId,
  toStopId,
  horizon,
  date,
  dateFrom,
  dateTo,
  monthPeriodValid,
  startTime,
  busy,
  loadingCatalog,
  loadingStops,
  onRouteChange,
  onDirectionChange,
  onFromStopChange,
  onToStopChange,
  onHorizonChange,
  onDateChange,
  onDateFromChange,
  onDateToChange,
  onStartTimeChange,
  onRefresh,
}: SidebarProps) {
  const fromStop = stops.find((stop) => stop.id === fromStopId);
  const toOptions = fromStop
    ? stops.filter((stop) => stop.direction_id === fromStop.direction_id && stop.sequence > fromStop.sequence)
      .sort((a, b) => a.sequence - b.sequence)
    : [];
  const invalidTime = horizon === "day" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);

  if (mode === "details") return (
    <section className="filters filters-compact" aria-label="Параметры прогноза">
      <label>Маршрут
        <select value={routeId} disabled={loadingCatalog || !routes.length} onChange={(event) => onRouteChange(event.target.value)}>
          {!routes.length && <option value="">{loadingCatalog ? "Загрузка…" : "Нет маршрутов"}</option>}
          {routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
        </select>
      </label>
      <label>Направление
        <select value={directionId} disabled={loadingStops || !routeId}
          onChange={(event) => onDirectionChange(Number(event.target.value) as 0 | 1)}>
          <option value={0}>Направление 1</option><option value={1}>Направление 2</option>
        </select>
      </label>
      {horizon === "month" ? <label className="compact-period">Период
        <div className="period-fields">
          <input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} aria-label="Начало периода" />
          <span className="period-sep">—</span>
          <input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} aria-label="Конец периода" />
        </div>
      </label> : <label>Дата
        <input type="date" min="2000-01-01" max="2098-12-31" value={date} onChange={(event) => onDateChange(event.target.value)} />
      </label>}
      {horizon === "day" && <label>Время, МСК
        <input type="time" value={startTime} onChange={(event) => onStartTimeChange(event.target.value)} />
      </label>}
      <label>Горизонт прогноза
        <select value={horizon} onChange={(event) => onHorizonChange(event.target.value as Horizon)}>
          {Object.entries(horizons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <button type="button" onClick={onRefresh} disabled={!routeId || !date || loadingStops || busy ||
        (horizon === "month" && !monthPeriodValid)}>
        {busy ? "Загрузка…" : "Обновить прогноз"}
      </button>
      <details className="segment-options">
        <summary>Выбрать участок маршрута</summary>
        <div className="segment-fields">
          <label>От остановки
            <select value={fromStopId} disabled={loadingStops || !routeId} onChange={(event) => onFromStopChange(event.target.value)}>
              <option value="">Весь маршрут</option>
              {stops.filter((stop) => stop.direction_id === directionId).sort((a, b) => a.sequence - b.sequence)
                .map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
            </select>
          </label>
          <label>До остановки
            <select value={toStopId} disabled={loadingStops || !fromStop || !toOptions.length}
              onChange={(event) => onToStopChange(event.target.value)}>
              <option value="">{fromStop ? "Выберите конечную" : "Сначала выберите «От»"}</option>
              {toOptions.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
            </select>
          </label>
        </div>
      </details>
    </section>
  );

  return (
    <section className={`filters filters-analytics${horizon === "day" ? " filters-analytics--day" : ""}`} aria-label="Параметры аналитики">
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

      {horizon === "month" ? (
        <label className="period-label">
          Период
          <div className="period-fields">
            <input type="date" min="2000-01-01" max="2098-12-31" value={dateFrom}
              onChange={(event) => onDateFromChange(event.target.value)} aria-label="Начало периода" required />
            <span className="period-sep">—</span>
            <input type="date" min="2000-01-01" max="2098-12-31" value={dateTo}
              onChange={(event) => onDateToChange(event.target.value)} aria-label="Конец периода" required />
          </div>
        </label>
      ) : (
        <label>
          Дата начала
          <input type="date" min="2000-01-01" max="2098-12-31" value={date}
            onChange={(event) => onDateChange(event.target.value)} required />
        </label>
      )}

      {horizon === "day" && <label>Время среза, МСК
        <input type="time" value={startTime} onChange={(event) => onStartTimeChange(event.target.value)} />
      </label>}

      <button
        type="button"
        onClick={onRefresh}
        disabled={!date || (horizon === "month" && !monthPeriodValid) || invalidTime || busy}
      >
        {busy ? "Загрузка…" : "Обновить"}
      </button>

      <p className="period-note" role={invalidTime || (horizon === "month" && !monthPeriodValid) ? "alert" : undefined}>
        {invalidTime
          ? "Укажите корректное время среза."
          : horizon === "month" && !monthPeriodValid
            ? "Укажите период не длиннее одного месяца."
          : horizon === "day"
            ? "Показатели рассчитаны для выбранного времени по всей сети."
            : horizon === "month"
              ? "Укажите период не длиннее одного месяца."
              : "Фильтры применяются автоматически. Для года период начинается с первого числа выбранного месяца."}
      </p>
    </section>
  );
}
