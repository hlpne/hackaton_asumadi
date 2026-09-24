import type { Horizon, Route, RouteStop } from "../../types";
import { horizons } from "../../constants";
import { DatePicker } from "./DatePicker";

interface SidebarProps {
  mode?: "details" | "analytics";
  routes: Route[];
  stops: RouteStop[];
  routeId: string;
  fromStopId: string;
  toStopId: string;
  horizon: Horizon;
  date: string;
  dateFrom: string;
  dateTo: string;
  monthPeriodValid: boolean;
  busy: boolean;
  loadingCatalog: boolean;
  loadingStops: boolean;
  onRouteChange: (id: string) => void;
  onFromStopChange: (id: string) => void;
  onToStopChange: (id: string) => void;
  onHorizonChange: (horizon: Horizon) => void;
  onDateChange: (date: string) => void;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  onRefresh: () => void;
}

export function Sidebar({
  mode = "details",
  routes,
  stops,
  routeId,
  fromStopId,
  toStopId,
  horizon,
  date,
  dateFrom,
  dateTo,
  monthPeriodValid,
  busy,
  loadingCatalog,
  loadingStops,
  onRouteChange,
  onFromStopChange,
  onToStopChange,
  onHorizonChange,
  onDateChange,
  onDateFromChange,
  onDateToChange,
  onRefresh,
}: SidebarProps) {
  const fromStop = stops.find((stop) => stop.id === fromStopId);
  const allStops = Array.from(new Map(stops.map((stop) => [stop.name, stop])).values())
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  if (mode === "details") return (
    <section className="filters filters-compact" aria-label="Параметры прогноза">
      <label>Маршрут
        <select value={routeId} disabled={loadingCatalog || !routes.length} onChange={(event) => onRouteChange(event.target.value)}>
          {!routes.length && <option value="">{loadingCatalog ? "Загрузка…" : "Нет маршрутов"}</option>}
          {routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
        </select>
      </label>
      <label>От остановки
        <select value={fromStopId} disabled={loadingStops || !routeId} onChange={(event) => onFromStopChange(event.target.value)}>
          <option value="">Не выбрана</option>
          {allStops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
        </select>
      </label>
      <label>До остановки
        <select value={toStopId} disabled={loadingStops || !fromStop}
          onChange={(event) => onToStopChange(event.target.value)}>
          <option value="">{fromStop ? "Выберите конечную" : "Сначала выберите «От»"}</option>
          {allStops.filter((stop) => stop.id !== fromStopId)
            .map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
        </select>
      </label>
      {horizon === "month" ? <div className="compact-period date-field-group"><span className="field-label">Период</span>
        <div className="period-fields">
          <DatePicker label="Начало" value={dateFrom} onChange={onDateFromChange} />
          <span className="period-sep">—</span>
          <DatePicker label="Конец" value={dateTo} onChange={onDateToChange} />
        </div>
      </div> : <DatePicker label="Дата" value={date} onChange={onDateChange} />}
      {/* Выбор времени скрыт: дневной график строится за полные сутки. */}
      <label>Горизонт прогноза
        <select value={horizon} onChange={(event) => onHorizonChange(event.target.value as Horizon)}>
          {Object.entries(horizons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <button type="button" onClick={onRefresh} disabled={!routeId || !date || loadingStops || busy ||
        (horizon === "month" && !monthPeriodValid)}>
        {busy ? "Загрузка…" : "Обновить прогноз"}
      </button>
    </section>
  );

  return (
    <section className="filters filters-analytics" aria-label="Параметры аналитики">
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
        <div className="period-label date-field-group">
          <span className="field-label">Период</span>
          <div className="period-fields">
            <DatePicker label="Начало" value={dateFrom} onChange={onDateFromChange} />
            <span className="period-sep">—</span>
            <DatePicker label="Конец" value={dateTo} onChange={onDateToChange} />
          </div>
        </div>
      ) : (
        <DatePicker label="Дата начала" value={date} onChange={onDateChange} />
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={!date || (horizon === "month" && !monthPeriodValid) || busy}
      >
        {busy ? "Загрузка…" : "Обновить"}
      </button>

      <p className="period-note" role={horizon === "month" && !monthPeriodValid ? "alert" : undefined}>
        {horizon === "month" && !monthPeriodValid
            ? "Укажите период не длиннее одного месяца."
          : horizon === "day"
            ? "Карта и рейтинги показывают дневной срез выбранной даты."
            : horizon === "month"
              ? "Укажите период не длиннее одного месяца."
              : "Фильтры применяются автоматически. Для года период начинается с первого числа выбранного месяца."}
      </p>
    </section>
  );
}
