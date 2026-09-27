import type { Horizon, Route, RouteStop } from "../../types";
import { PeriodControls } from "./PeriodControls";
import { WheelPicker, type WheelOption } from "./WheelPicker";

interface SidebarProps {
  mode?: "details" | "analytics";
  routes: Route[];
  stops: RouteStop[];
  routeId: string;
  fromStopId: string;
  toStopId: string;
  horizon: Horizon;
  date: string;
  busy: boolean;
  loadingCatalog: boolean;
  loadingStops: boolean;
  onRouteChange: (id: string) => void;
  onFromStopChange: (id: string) => void;
  onToStopChange: (id: string) => void;
  onHorizonChange: (horizon: Horizon) => void;
  onDateChange: (date: string) => void;
  className?: string;
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
  busy,
  loadingCatalog,
  loadingStops,
  onRouteChange,
  onFromStopChange,
  onToStopChange,
  onHorizonChange,
  onDateChange,
  className = "",
}: SidebarProps) {
  const fromStop = stops.find((stop) => stop.id === fromStopId);
  const allStops = Array.from(new Map(stops.map((stop) => [stop.name, stop])).values())
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const routeOptions: WheelOption[] = routes.map((route) => ({
    value: route.id,
    label: route.name.replace(" · демопрогноз", ""),
    meta: route.id.replace("demo-", "").toUpperCase(),
    color: route.color,
  }));
  const stopOptions: WheelOption[] = [
    { value: "", label: "Не выбрана", meta: "Весь маршрут" },
    ...allStops.map((stop) => ({ value: stop.id, label: stop.name, meta: `№ ${stop.sequence + 1}` })),
  ];
  const destinationOptions: WheelOption[] = [
    { value: "", label: fromStop ? "Весь остаток маршрута" : "Сначала выберите начало" },
    ...allStops.filter((stop) => stop.id !== fromStopId)
      .map((stop) => ({ value: stop.id, label: stop.name, meta: `№ ${stop.sequence + 1}` })),
  ];

  return <section className={`filters filters-panel filters-${mode} ${className}`.trim()}
    aria-label={mode === "analytics" ? "Параметры сети" : "Параметры прогноза"} aria-busy={busy}>
    <div className="filters-panel-heading">
      <div><span className="eyebrow">ПАРАМЕТРЫ</span><h2>{mode === "analytics" ? "Срез сети" : "Рабочее окно"}</h2></div>
      <span className="filters-live"><i /> API подключен</span>
    </div>

    <div className="filters-route-fields">
      <WheelPicker label="Маршрут" value={routeId} options={routeOptions} onChange={onRouteChange}
        disabled={loadingCatalog || !routes.length} placeholder={loadingCatalog ? "Загрузка…" : "Нет маршрутов"} />
      <PeriodControls horizon={horizon} date={date} onHorizonChange={onHorizonChange} onDateChange={onDateChange} compact />
      {mode === "details" ? <div className="filters-stop-grid">
        <WheelPicker label="От остановки" value={fromStopId} options={stopOptions} onChange={onFromStopChange}
          disabled={loadingStops || !routeId} placeholder={loadingStops ? "Загрузка…" : "Не выбрана"} />
        <WheelPicker label="До остановки" value={toStopId} options={destinationOptions} onChange={onToStopChange}
          disabled={loadingStops || !fromStop} placeholder="Сначала выберите начало" />
      </div> : <WheelPicker label="Остановка на карте" value={fromStopId} options={stopOptions}
        onChange={onFromStopChange} disabled={loadingStops || !routeId}
        placeholder={loadingStops ? "Загрузка…" : "Не выбрана"} />}
    </div>
  </section>;
}
