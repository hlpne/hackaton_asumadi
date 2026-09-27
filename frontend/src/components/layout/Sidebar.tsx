import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Horizon, Route, RouteStop } from "../../types";
import { PeriodControls } from "./PeriodControls";
import { WheelPicker, type WheelOption } from "./WheelPicker";
import { XIcon } from "@phosphor-icons/react";

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
  onRefresh: () => void;
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
  onRefresh,
  className = "",
}: SidebarProps) {
  const [periodOpen, setPeriodOpen] = useState(false);
  useEffect(() => {
    if (!periodOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPeriodOpen(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [periodOpen]);
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
    aria-label={mode === "analytics" ? "Параметры сети" : "Параметры прогноза"}>
    <div className="filters-panel-heading">
      <button type="button" className="glass-panel-toggle" aria-label="Открыть период и горизонт прогноза"
        aria-expanded={periodOpen} aria-haspopup="dialog" onClick={() => setPeriodOpen((open) => !open)}
        title="Период и горизонт прогноза">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M13.5 4v16M7 8h3.5M7 12h3.5"/></svg>
      </button>
      <div><span className="eyebrow">ПАРАМЕТРЫ</span><h2>{mode === "analytics" ? "Срез сети" : "Рабочее окно"}</h2></div>
      <span className="filters-live"><i /> API</span>
    </div>

    <div className="filters-route-fields">
      <WheelPicker label="Маршрут" value={routeId} options={routeOptions} onChange={onRouteChange}
        disabled={loadingCatalog || !routes.length} placeholder={loadingCatalog ? "Загрузка…" : "Нет маршрутов"} />
      {mode === "details" ? <div className="filters-stop-grid">
        <WheelPicker label="От остановки" value={fromStopId} options={stopOptions} onChange={onFromStopChange}
          disabled={loadingStops || !routeId} placeholder={loadingStops ? "Загрузка…" : "Не выбрана"} />
        <WheelPicker label="До остановки" value={toStopId} options={destinationOptions} onChange={onToStopChange}
          disabled={loadingStops || !fromStop} placeholder="Сначала выберите начало" />
      </div> : <WheelPicker label="Остановка на карте" value={fromStopId} options={stopOptions}
        onChange={onFromStopChange} disabled={loadingStops || !routeId}
        placeholder={loadingStops ? "Загрузка…" : "Не выбрана"} />}
    </div>

    <button type="button" className="refresh-forecast" onClick={onRefresh}
      disabled={(mode === "details" && (!routeId || loadingStops)) || !date || busy}>
      <span>{busy ? "Обновляем данные…" : mode === "analytics" ? "Обновить сеть" : "Обновить прогноз"}</span>
    </button>
    {periodOpen && createPortal(<div className="period-drawer-layer">
      <button type="button" className="period-drawer-dismiss" aria-label="Закрыть параметры периода"
        onClick={() => setPeriodOpen(false)} />
      <section className="period-drawer liquid-glass" role="dialog" aria-label="Период и горизонт прогноза">
        <div className="period-drawer-heading"><div><span className="eyebrow">ПАРАМЕТРЫ ПРОГНОЗА</span><h2>Период и горизонт</h2></div>
          <button type="button" className="period-drawer-close" aria-label="Закрыть" onClick={() => setPeriodOpen(false)}><XIcon /></button></div>
        <PeriodControls horizon={horizon} date={date} onHorizonChange={onHorizonChange} onDateChange={onDateChange} />
      </section>
    </div>, document.body)}
  </section>;
}
